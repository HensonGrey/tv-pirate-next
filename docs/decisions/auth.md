# Auth — deep dive

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

Deep context behind the short comments in the auth/security code. Code comments tag sections as `docs/decisions/auth.md#<id>`. Do not re-derive.

## csrf — why CSRF is disabled

The browser attaches cookies automatically to same-site requests — which is exactly what CSRF attacks exploit (a malicious site triggering a request that rides the victim's cookies). Defense here is SameSite=Lax on the auth cookies instead of Spring's default CSRF machinery: cross-site POSTs don't carry the cookie, and all state-changing endpoints are POSTs. This works because frontend and backend share a site (localhost in dev, same domain in prod). If they ever move to genuinely different sites, add Spring's XSRF-TOKEN double-submit pattern.

## cookies — the token cookie design

Tokens travel as httpOnly cookies, not a JSON body:

- `access_token` — Path=/, sent with every request, read by JwtAuthenticationFilter.
- `refresh_token` — Path=/api/auth, so the browser only ever sends it to the auth endpoints.

httpOnly means JS can't read them (XSS can't steal them) — but also that only the server can delete them, which is why logout is an endpoint. SameSite=Lax on both (see #csrf); Secure is env-driven (`COOKIE_SECURE`, false locally).

## tokens — the two-token scheme

- Access token: signed JWT, short-lived (15 min), `Authorization: Bearer` or the cookie. Self-contained — the signature proves we issued it, no DB lookup to trust it.
- Refresh token: long random string (48 bytes, NOT a JWT), 30 days. Only the SHA-256 hash is stored in `refresh_tokens` — a leaked table is useless. Rotation (delete + insert on every refresh) makes revocation/logout possible and limits a stolen token's damage window.

## filter — JWT filter flow

`JwtAuthenticationFilter` runs once per request (OncePerRequestFilter). Valid JWT → user loaded → Authentication placed in the SecurityContext. Invalid/expired → stay anonymous; the authorization rules in SecurityConfig decide if the endpoint still allows that. Token resolution order: cookie first (browser attaches it automatically), then `Authorization: Bearer` (curl/Postman, non-browser clients).

## error-dispatch — why ERROR dispatches are permitAll

When a controller throws, Spring forwards the request to /error. Since Spring Security 6 that ERROR dispatch also passes through the security chain — and the JWT filter skips it (OncePerRequestFilter default) — so without `dispatcherTypeMatchers(ERROR).permitAll()` every error response would be masked as a 401.

## guest-dos — guest endpoint is a DoS weak spot

`POST /api/auth/guest` costs a DB row + token pair and requires no credentials, so unauthenticated callers can bloat users/refresh_tokens. Flagged in AuthController with a SECURITY NOTE. Revisit when rate limiting is added.

## user-model — no local accounts

No username/password accounts at all: a user is a guest (one-click, no credentials) or comes from a provider (Google later). No password column exists; email is nullable because guests have none. `AuthProvider` enum records which; new providers add enum entries without table changes.

## user-loading — DB lookup on every request

`JwtUserDetailsService.loadUserByUsername` receives the user **id** (the JWT subject), despite the method's historical name. Loading from the DB every request (instead of trusting the JWT alone) means a deleted account loses access immediately.

## session-payload — the session callback must not echo the adapter row

With database sessions, Auth.js hands the `session` callback the raw adapter row —
`{ sessionToken, userId, expires, user }` — and **whatever the callback returns becomes the
`/api/auth/session` response body verbatim**. Returning it (or spreading it) publishes
`sessionToken`, which _is_ the credential: an httpOnly cookie stops JS reading the cookie, but a
fetch to that endpoint would hand the token straight back. Auth.js's default callback narrows to
`{ user: { name, email, image }, expires }` for exactly this reason, so any override has to
re-narrow by hand. Ours builds a fresh object and adds only `id` and `provider`. Caught in Batch 1
by diffing the endpoint's output against the cookie value.

## Related

- `overview.md` — Key Decisions summary of all of the above
- `tmdb.md` — TMDB proxy context
