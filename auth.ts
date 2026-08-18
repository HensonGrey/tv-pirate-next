import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db/client';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';

/** 30 days, matching the refresh-token lifetime the previous stack used. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    }),
    // Database sessions, not JWT: logout revokes server-side and a deleted account
    // loses access on its next request. see: docs/decisions/auth.md
    session: {
        strategy: 'database',
        maxAge: SESSION_MAX_AGE_SECONDS,
        // Refreshing the row hourly is also what keeps an idle-but-open guest from
        // being swept. see: docs/decisions/guest-cleanup.md
        updateAge: 60 * 60,
    },
    // Google lands here later; guests never touch a provider.
    providers: [],
    pages: { signIn: '/login' },
    callbacks: {
        // The adapter row arrives here carrying sessionToken — the credential itself —
        // and whatever this returns becomes the /api/auth/session body verbatim. Build a
        // fresh narrow object; never spread the row. see: docs/decisions/auth.md#session-payload
        session({ session, user }) {
            return {
                expires: session.expires,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    provider: user.provider ?? 'GUEST',
                },
            };
        },
    },
    trustHost: true,
});
