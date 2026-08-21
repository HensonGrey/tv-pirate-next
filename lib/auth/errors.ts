/** Signals a Server Component needed a session and didn't have one. Thrown
 * rather than redirecting inline, so call sites don't each decide where
 * "not authenticated" goes — a shared boundary will own that.
 * see: docs/decisions/auth.md */
export class UnauthenticatedError extends Error {
    constructor() {
        super('Not authenticated');
    }
}
