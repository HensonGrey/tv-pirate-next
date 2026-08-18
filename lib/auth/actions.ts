'use server';

import { signOut } from '@/auth';

/** Deletes the session row and clears the cookie — the server-side revoke a
 * stateless JWT could never do. see: docs/decisions/auth.md */
export async function signOutAction() {
    await signOut({ redirectTo: '/login' });
}
