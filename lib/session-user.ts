/** The slice of the Auth.js session the UI needs. Replaces the old localStorage
 * StoredUser — the server resolves this now. see: docs/decisions/auth.md */
export interface SessionUser {
    id: string;
    name: string | null;
    image: string | null;
    provider: string;
}
