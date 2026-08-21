/** A digest set before throwing survives to the client error boundary even in
 * production, unlike the message — this is how app/(app)/error.tsx tells this
 * error apart from any other. see: docs/decisions/auth.md */
export const UNAUTHENTICATED_DIGEST = 'UNAUTHENTICATED';

/** Signals a Server Component needed a session and didn't have one. Thrown
 * rather than redirecting inline, so call sites don't each decide where
 * "not authenticated" goes — app/(app)/error.tsx is the shared boundary that
 * catches it (by digest) and redirects. see: docs/decisions/auth.md */
export class UnauthenticatedError extends Error {
    digest = UNAUTHENTICATED_DIGEST;

    constructor() {
        super('Not authenticated');
    }
}
