import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createGuestSession } from '@/lib/auth/guest';

// SECURITY NOTE: a DB row + session with no credentials — the DoS weak spot
// until rate limiting lands in batch 9. see: docs/decisions/auth.md#guest-dos
export async function POST() {
    // Already signed in: hand back the current session instead of piling up rows.
    const existing = await auth();
    if (existing?.user) {
        return NextResponse.json(existing.user);
    }
    const user = await createGuestSession();
    return NextResponse.json(user, { status: 201 });
}
