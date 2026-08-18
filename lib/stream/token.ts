import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Playback capability tokens. The previous stack kept a Caffeine map of
 * token -> {url, headers}; that cannot work once more than one instance exists,
 * because a token minted by one would not resolve on another. These are
 * self-contained instead: AES-256-GCM sealed, so the browser can neither read
 * the upstream URL nor forge one, and no server-side store is involved.
 * see: docs/decisions/history/migration-plan.md
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Tokens outlive a play session (pauses, seeks) but not the day. */
export const TOKEN_TTL_SECONDS = 6 * 60 * 60;

export interface ProxyTarget {
    url: string;
    headers: Record<string, string>;
}

interface SealedPayload extends ProxyTarget {
    /** Expiry, epoch seconds. */
    exp: number;
}

function key() {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET is required to sign playback tokens');
    // Separate derivation so a playback token can never be confused with a session.
    return createHash('sha256').update(`stream-proxy:${secret}`).digest();
}

export function seal(target: ProxyTarget, ttlSeconds = TOKEN_TTL_SECONDS): string {
    const payload: SealedPayload = {
        ...target,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** null for anything tampered with, malformed or expired. */
export function open(token: string): ProxyTarget | null {
    try {
        const raw = Buffer.from(token, 'base64url');
        if (raw.length <= IV_BYTES + TAG_BYTES) return null;
        const decipher = createDecipheriv(ALGORITHM, key(), raw.subarray(0, IV_BYTES));
        decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        const clear = Buffer.concat([
            decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
            decipher.final(),
        ]);
        const payload = JSON.parse(clear.toString('utf8')) as SealedPayload;
        if (payload.exp * 1000 < Date.now()) return null;
        return { url: payload.url, headers: payload.headers };
    } catch {
        return null;
    }
}
