import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { sessions, users } from '@/db/schema';
import { SESSION_MAX_AGE_SECONDS } from '@/auth';

const GUEST_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Auth.js reads this cookie name; the __Secure- prefix applies over https. */
function sessionCookie() {
    const secure = (process.env.AUTH_URL ?? '').startsWith('https://');
    return {
        name: secure ? '__Secure-authjs.session-token' : 'authjs.session-token',
        secure,
    };
}

function guestName() {
    let suffix = '';
    for (let i = 0; i < 6; i++) {
        suffix += GUEST_ALPHABET[Math.floor(Math.random() * GUEST_ALPHABET.length)];
    }
    return `guest-${suffix}`;
}

/**
 * One-click guest account: insert the user, mint a database session, set the
 * cookie Auth.js already knows how to read. Auth.js's Credentials provider
 * would force JWT sessions, which is why this is a route of its own.
 * see: docs/decisions/auth.md
 */
export async function createGuestSession() {
    const [user] = await db
        .insert(users)
        .values({ name: guestName(), provider: 'GUEST' })
        .returning();

    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

    const cookie = sessionCookie();
    (await cookies()).set(cookie.name, sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: cookie.secure,
        expires,
    });

    return { id: user.id, name: user.name, provider: user.provider, image: user.image };
}
