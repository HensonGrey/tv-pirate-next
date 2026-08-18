# The Spring Boot stack (2026-08-14 → 2026-08-18)

What this app was before the Next.js rebuild, and why it changed. Kept because the notes in
`docs/decisions/` were written against it, and because the old code is still the parity oracle
while the migration runs.

## What it was

Two independent repos, two processes:

- **`HensonGrey/tv-pirate`** — Spring Boot 4.1, Java 21, Maven. 8 controllers / 21 endpoints:
  auth (guest + refresh + logout), `/api/me`, admin cleanup, a 6-endpoint TMDB proxy, favourites,
  watch progress, stream providers + a byte proxy, OpenSubtitles. Spring Security with a hand-rolled
  JWT filter, Spring Data JPA, Liquibase, Caffeine caches. Port 8080.
- **`HensonGrey/tv-pirate-frontend`** — Vite + React 19, TypeScript, Tailwind v4, shadcn/ui, axios
  with a silent-refresh interceptor, react-router v7, vidstack. Two pages (~1600 lines between
  `home.tsx` and `watch.tsx`). Port 5173.

Both remain on GitHub. Neither was deleted.

## Why it changed

The deciding constraint is in [../hosting.md](../hosting.md): **Spring Boot cannot run on Vercel
serverless**, so the two-process split forced a container or VM host for the backend permanently.
Collapsing to one Next.js app removes that, and with it the cross-origin cookie setup, the CORS
allowlist, the access/refresh token pair, the client-side auth guard, and the silent-refresh
interceptor — roughly 400 lines of machinery that existed only because the browser was talking to a
different origin.

Note the reversal: [../overview.md](../overview.md) records that a Next.js version was deleted in
favour of this stack on 2026-08-14. The hosting constraint was discovered on 2026-08-17, after that
call.

## What did not survive the move, and why

Each of these is a deliberate divergence, argued in
[migration-plan.md](migration-plan.md) (flags D1–D13):

- **The JWT filter, refresh rotation, and the `refresh_tokens` table** → Auth.js database sessions.
- **In-memory proxy token map** → stateless signed tokens, so no instance-local state.
- **Subtitle disk cache** → Postgres, because serverless filesystems are ephemeral.
- **`@Scheduled` sweep** → an HTTP-triggered cron route.
- **Liquibase** → `db/migrate.mjs`, keeping the up + down rule. see: [../migrations.md](../migrations.md)
- **Jackson null/snake_case defences** → Zod schemas at the boundary.

## What was never built

Rate limiting. It was a TODO in the old repo, and the guest endpoint's DoS exposure is documented in
[../auth.md](../auth.md#guest-dos). It arrives fresh in this stack rather than being ported.
