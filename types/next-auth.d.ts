import type { DefaultSession } from 'next-auth';

// provider tells guests apart from future OAuth users; id is needed by every
// user-scoped query.
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            provider: string;
        } & DefaultSession['user'];
    }

    interface User {
        provider?: string;
    }
}
