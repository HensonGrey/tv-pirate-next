/**
 * Videasy's payload cipher, ported from their player bundle (chunk 8351). The
 * previous stack ran a Java port of the same routine; this is a port back to the
 * language it came from, so the arithmetic quirks that cost an hour in Java
 * (`%` applying to the unsigned value) are simply the native behaviour again —
 * as long as every multiply goes through Math.imul and every shift is `>>>`.
 * see: docs/local/streaming-providers.md#videasy-wire
 */

/** Golden-ratio constant their cipher mixes in everywhere. */
const PHI = 0x9e3779b9 | 0;
const MAGIC = [109, 118, 109, 49]; // "mvm1"
const SBOX_SLOTS = 61;

/** xmur3-ish mixer: every keystream round ends with one of these. */
function mix(value: number): number {
    let e = value | 0;
    e ^= e >>> 16;
    e = Math.imul(e, 0x85ebca6b);
    e ^= e >>> 13;
    e = Math.imul(e, 0xc2b2ae35);
    e ^= e >>> 16;
    return e | 0;
}

/** FNV-1a over the seed string, then mixed. */
function fnv(text: string): number {
    let hash = 0x811c9dc5 | 0;
    for (let i = 0; i < text.length; i++) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    }
    return mix(hash);
}

function rotl(value: number, bits: number): number {
    const r = bits & 31;
    // A 32-bit rotate by 0 must be the identity: `x >>> 32` would return x.
    if (r === 0) return value | 0;
    return (value << r) | (value >>> (32 - r)) | 0;
}

/** Unsigned modulo — the whole reason the Java port needed a special case. */
function mod61(value: number): number {
    return (value >>> 0) % SBOX_SLOTS;
}

interface State {
    sbox: Int32Array;
    filled: Uint8Array;
    acc: number;
}

/** A 61-entry sbox with only 8 slots ever written. The original tracks slot
 * existence with `n in r`, so occupancy is explicit and unwritten slots read 0. */
function initState(seed: string, mediaId: number): State {
    const sbox = new Int32Array(SBOX_SLOTS);
    const filled = new Uint8Array(SBOX_SLOTS);
    let a = mix(fnv(seed) ^ mix((mediaId | 0) ^ PHI));
    for (let e = 0; e < 8; e++) {
        const slot = mod61(a);
        a = rotl((a + PHI) | 0, 7 + (7 & e));
        sbox[slot] = a ^ mix(a);
        filled[slot] = 1;
        a = mix((a + slot) | 0);
    }
    return { sbox, filled, acc: mix(0xa5a5a5a5 ^ a) };
}

/** One generator round per four output bytes. */
function keystream(seed: string, mediaId: number, length: number): Uint8Array {
    const { sbox, filled, acc: initial } = initState(seed, mediaId);
    let acc = initial;
    const out = new Uint8Array(length);
    let written = 0;
    let round = 0;
    while (written < length) {
        const n = mod61(acc);
        const occupied = filled[n] ? -1 : 0;
        const x = sbox[n] ^ Math.imul(PHI, round + 1);
        let l = (acc ^ x) | (acc & x & occupied);
        l = rotl((l + acc) | 0, n & 31) ^ rotl(acc, (n * 7) & 31);
        acc = mix((l + PHI) | 0);
        sbox[n] = acc;
        filled[n] = 1;
        round++;
        out[written++] = acc & 0xff;
        if (written < length) out[written++] = (acc >>> 8) & 0xff;
        if (written < length) out[written++] = (acc >>> 16) & 0xff;
        if (written < length) out[written++] = (acc >>> 24) & 0xff;
    }
    return out;
}

/** base64 → XOR keystream → verify the "mvm1" magic → the JSON after it. */
export function decryptSources(payload: string, seed: string, mediaId: number): string {
    let b64 = payload.split('-').join('+').split('_').join('/');
    while (b64.length % 4 !== 0) b64 += '=';
    const cipher = Buffer.from(b64, 'base64');
    const key = keystream(seed, mediaId, cipher.length);
    const clear = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i++) clear[i] = cipher[i] ^ key[i];
    for (let i = 0; i < MAGIC.length; i++) {
        if (clear[i] !== MAGIC[i]) throw new Error('bad seed or tampered payload');
    }
    return clear.subarray(MAGIC.length).toString('utf8');
}
