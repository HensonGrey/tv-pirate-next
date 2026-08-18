# tv-pirate — React + Spring Boot → Next.js migration plan

**Status:** approved 2026-08-18. Design reference captured (`design-reference/`). Batch 0 not started.

**Two standing rules added by the user after approval:**
1. **Stop after every batch for review.** No batch begins until the previous one is reviewed and manually tested.
2. **The design must remain identical.** The UI is a pixel-parity port, not a redesign.

---

## Context

`tv-pirate` today is two independent apps in `C:\Users\minec\Desktop\tv-pirate`: a Spring Boot 4.1 / Java 21 backend on :8080 (8 controllers, 21 endpoints, JWT cookie auth, Liquibase-managed Postgres, three gray-market stream providers behind a byte proxy, an OpenSubtitles proxy) and a Vite + React 19 frontend on :5173 (2 pages, axios client with silent-refresh interceptor, vidstack player). The whole thing is a learning project with production-grade hygiene, and its decision history lives in an external Obsidian vault on the Desktop.

The migration collapses both into one Next.js app. The driver is in the vault's own `hosting-options.md`: **Spring Boot cannot run on Vercel serverless**, so the current split forces a container/VM host for the backend forever. One Next.js app removes that constraint, removes CORS/cookie cross-site friction, and removes the whole silent-refresh apparatus.

Three things worth stating before the map, because they correct the framing of the request:

1. **There is no Bucket4j.** Nothing in `backend/pom.xml` or the source references it. Rate limiting is an *unimplemented TODO* (`tv pirate todo.txt`: "rate limiter (extremely strict for guest users)"; the vault flags the hole at `auth-deep-dive#guest-dos`). So that work is greenfield, not a port — which is good news: no legacy shape to honour.
2. **There are 8 controllers / 21 endpoints, not 10–15.** The map below is complete, not a sample.
3. **The vault documents a test harness that no longer exists.** `streaming-providers-deep-dive.md` references `frontend/scripts/watch-smoke.mjs` and `provider-matrix.mjs`; `frontend/scripts/` is absent from disk and was never committed (only its artifact paths survive in `.gitignore`). The only test in either repo is `BackendApplicationTests.contextLoads()`. **There is no automated safety net to migrate behind** — hence the parity-diff verification strategy in each batch.

Also noted, not a problem: the vault records that a prior Next.js version was deleted in favour of this stack on 2026-08-14. This migration reverses that decision. The reason is the hosting constraint discovered on 2026-08-17, which postdates it.

### Decisions taken with the user before planning

| Decision | Choice |
|---|---|
| Database | Fresh DB (`tv-pirate-next`), Auth.js-canonical shape. Old DB untouched as fallback; all existing rows are disposable guest accounts. |
| Migrations | Drizzle Kit + hand-written paired `.down.sql`, honouring the up+down hard rule. No JVM in the repo. |
| Deploy shape | **Stateless / portable** — never rely on instance-local memory or disk. Runs on Vercel *and* on a single VM. |
| Repo & docs | New public repo. Project notes → `docs/decisions/`; `streaming-providers` note lives at `docs/local/` **inside the repo but gitignored**. |

---

## Next 16 corrections (found during Batch 0)

The scaffold installed **Next 16.3.1**, not 15. Next ships its own agent docs in
`node_modules/next/dist/docs/` with a warning that conventions differ from training data — reading
them turned up five things this plan assumed wrongly. Corrected here rather than discovered mid-batch.

1. **`middleware.ts` is now `proxy.ts`**, with a named `proxy` export, and it runs on the **nodejs
   runtime only** (edge is not supported there; `middleware` still exists if edge is ever needed).
   Config flags renamed too (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`). Affects the
   rate-limiting chokepoint in Batch 9 — and helpfully, nodejs means the limiter shares one
   implementation with the route handlers.
2. **Async request APIs are mandatory.** `params`, `searchParams`, `cookies()`, `headers()` must all
   be awaited; the synchronous compatibility shim from 15 is gone. Affects every route handler and
   page (Batches 2, 3, 4, 6, 7). `npx next typegen` generates `PageProps<'/tv/[slug]'>`,
   `LayoutProps`, `RouteContext` helpers — the scaffolded layout already uses `LayoutProps<'/'>`.
3. **`revalidateTag` now takes a `cacheLife` profile as a second argument**; the one-argument form is
   a TypeScript error. `updateTag` is the new immediate-expiry option inside server actions. Affects
   Batch 4 if favourites/progress use tag revalidation.
4. **The TMDB TTL table stays on extended `fetch`** (`next: { revalidate }`), which is still
   supported. The newer `"use cache"` / `cacheLife` idiom needs `cacheComponents: true` opt-in and
   restricts reading cookies inside cached scopes — not worth the constraint when the Caffeine TTLs
   map 1:1 onto per-fetch revalidate values. Revisit after Batch 2 if caching gets more complex.
5. **Turbopack is the default for both `dev` and `build`.**

Also relevant to how the docs landed: `next dev` **writes and re-adds a managed block in
`AGENTS.md`**, and generates `CLAUDE.md` as a one-line `@AGENTS.md` import. Project conventions
therefore live in `AGENTS.md` beneath that managed block — removing the block only regenerates it.

**One class of porting issue to expect:** copied shadcn components were written for Vite, where
everything is a client component. Any file using hooks needs a 'use client' directive under RSC —
`components/ui/sonner.tsx` (`useTheme`) failed the production build until it got one. Expect the same
for ported components in Batches 3 and 7.

---

## Architecture decisions

### ORM: Drizzle (not Prisma)

Drizzle, with `drizzle-kit` for generation and a thin runner for up/down.

- **Prisma cannot express this schema.** `watch_progress` depends on two *partial* unique indexes (`WHERE season_number IS NULL` / `IS NOT NULL`) — the documented fix for Postgres `NULLS DISTINCT` letting duplicate movie rows through (`watch-progress-deep-dive#schema`). Prisma's schema language has no partial indexes and no CHECK constraints; both would fall to raw SQL escape hatches that `prisma db pull` then fights.
- **Prisma Migrate is forward-only.** There is no `down`. That breaks the project's hard rule outright (`overview.md`, `changelog/agents.md` rule 2).
- Drizzle expresses partial indexes (`.where()`), `check()`, and raw trigger SQL in generated migrations directly; its SQL-first model matches how this schema is already reasoned about.
- Drizzle Kit also has no down migrations natively — hence the paired `.down.sql` convention below. That is the one piece of tooling this migration invents, and it is ~30 lines.

**Migration workflow (replaces `changelog/agents.md`, same rules):**

```
db/
  schema.ts                 # Drizzle table definitions (the typed query surface)
  migrations/
    0001_baseline.sql       # up   (drizzle-kit generate, then hand-edited for triggers/partials)
    0001_baseline.down.sql  # down (hand-written exact inverse — no changeset ships without one)
    ...
  migrate.ts                # apply pending / rollback N, tracks applied rows in a _migrations table
```

Rules carried over verbatim: a DB change MUST be a migration; every migration has up + down; applied migrations are immutable (write a new one); every user-scoped table gets the activity trigger; always verify **up → down → up** before committing.

### Auth: Auth.js v5 with database sessions (not a ported JWT filter)

Auth.js (`next-auth@5`) + `@auth/drizzle-adapter`, **session strategy `database`**.

Why not port the JWT filter: it exists to solve problems Next.js doesn't have. `JwtAuthenticationFilter` + `JwtService` + `JwtUserDetailsService` + `AuthedUser` + `SecurityConfig` + the refresh-rotation service + the axios interceptor + `SESSION_EXPIRED_EVENT` + `authStorage.ts` + `require-auth.tsx` — roughly 400 lines across both repos — collapse into one `auth.ts` config plus `await auth()` in a layout.

Why **database** sessions specifically, and not the Credentials-provider default:

- The vault deliberately chose a DB lookup per request so a deleted account loses access immediately (`auth-deep-dive#user-loading`). Database sessions *are* that behaviour, natively.
- Server-side revocation on logout is preserved (delete the session row) — with a JWT session it is impossible, which the project report already lists as a known trade-off.
- The `sessions` table gives the guest-activity trigger somewhere to live (see divergence D3).
- Rolling expiry (`session.updateAge`) delivers "sessions auto-refresh, no re-login" with no refresh-token pair, no rotation, no `refresh_tokens` table, and no silent-refresh interceptor.

Guest login can't use Auth.js's Credentials provider (it forces JWT sessions). Instead: a small `POST /api/auth/guest` route that creates the user via the adapter, creates a session row via the adapter, and sets the session cookie. Auth.js then resolves it like any other session, and **Google login later is a two-line provider addition** with the same adapter and table — which is exactly the future the vault reserved (`auth-deep-dive#user-model`).

Kept from the current design: httpOnly cookie (Auth.js default), `SameSite=Lax` (Auth.js default; same-origin now, so `auth-deep-dive#csrf` gets *stronger* — no cross-site anything), `Secure` env-driven (Auth.js handles via `AUTH_URL`), 30-day session lifetime matching the old refresh TTL.

### Rate limiting: greenfield, `@upstash/ratelimit` with a swappable store

No Bucket4j to replace. Design from the hole the vault actually documents:

- **Chokepoint:** `middleware.ts` for coarse per-IP limits, plus per-route limiters in the expensive handlers.
- **Strictest on `POST /api/auth/guest`** — a DB row + session with no credentials, callable by anyone (`auth-deep-dive#guest-dos`). Proposed: 3/hour/IP plus a global daily ceiling.
- **`/api/stream/proxy/*` must be exempt or very loose.** A 2-hour movie is ~2000 segment requests through that route; a naive global limiter kills playback. This is the non-obvious detail that makes or breaks the feature.
- **Store:** `@upstash/ratelimit` + Upstash Redis (free tier, works statelessly) with an in-memory driver for local dev, behind one `lib/rate-limit.ts` seam. If you'd rather add zero infra, a Postgres counter table is fine for `/auth/guest` volumes — but never for per-segment paths.
- Also lands `429` mapping + `X-RateLimit-*` headers, and the todo's "log 429s from third-party APIs" concern (TMDB/OpenSubtitles quota warnings).

---

## Controller-by-controller migration map

Legend: **T** = direct translation (same logic, new syntax) · **R** = reimplementation (Next.js-native replacement) · **D** = deleted

### 1. `AuthController` → Auth.js  ·  `backend/.../auth/AuthController.java`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `POST /api/auth/guest` | `app/api/auth/guest/route.ts` | **R** | Keeps the `guest-<6 chars>` name generator. Creates user + session via the adapter, sets the cookie. |
| `POST /api/auth/refresh` | — | **D** | Rolling database sessions replace the access/refresh pair. `refresh_tokens` table, SHA-256 hashing, rotation, and the axios dedup-refresh interceptor all disappear. |
| `POST /api/auth/logout` | `signOut()` server action | **T** | Same effect: burn the server-side session, clear the cookie. |
| — | `app/api/auth/[...nextauth]/route.ts` | new | Auth.js handler; the seat Google login later sits in. |

**Open questions:** (a) `session.updateAge` value — it decides how often an idle-but-open tab bumps guest activity (see D3); I'd start at 1h. (b) Confirm `adapter.createSession` is stable public API in the pinned `@auth/drizzle-adapter` — verify first thing in Batch 1, fall back to a hand-written 40-line adapter if not.

### 2. `MeController` → `auth()`  ·  `backend/.../api/MeController.java`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `GET /api/me` | `await auth()` in the app layout | **D** | The startup probe, the localStorage user cache (`lib/authStorage.ts`), the `RequireAuth` guard and its splash screen all go. The server knows who you are before the first byte of HTML. |

**Open question:** does any client island still need the user object over HTTP? Current read of `top-nav.tsx` / `app-sidebar.tsx` says no — the session passes down as props from the layout. Confirm during Batch 3; if one does, `SessionProvider` covers it without a route.

### 3. `AdminController` → cron route  ·  `backend/.../api/AdminController.java`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `POST /api/admin/cleanup-guests` | `app/api/cron/cleanup-guests/route.ts` | **T** (logic) / **R** (trigger) | Sweep logic ports directly from `GuestCleanupService`. Guard becomes `Authorization: Bearer $CRON_SECRET`, with `X-Admin-Secret` kept as an alias for manual curl. |
| `@Scheduled(cron=...)` | `vercel.json` crons / system crontab | **R** | Next.js has no in-process scheduler and shouldn't. The vault already anticipated this exact shape (`guest-cleanup-deep-dive#cron`). |

**Open question:** with `refresh_tokens` gone, "activity" changes meaning — see divergence D3 before this batch lands.

### 4. `TmdbController` → route handlers over a shared lib  ·  `backend/.../tmdb/`

All six are **T** on logic. `lib/tmdb/` (client + mapping) is the single source; **server components import it directly** for first-paint data, and the route handlers wrap the same functions for client-driven interactions (typeahead, pagination, modal detail). No duplication, no proxy hop on initial load.

| Spring | Next.js | Notes |
|---|---|---|
| `GET /api/tmdb/trending` | `app/api/tmdb/trending/route.ts` | Keeps the in-page re-rank by rating, nulls last, stable sort (`tmdb-deep-dive#trending-sort`). |
| `GET /api/tmdb/discover` | `app/api/tmdb/discover/route.ts` | Genre-name → id resolution, OR semantics, unknown names dropped, empty result when none resolve. |
| `GET /api/tmdb/search` | `app/api/tmdb/search/route.ts` | Per-type `/search/movie` + `/search/tv`, interleaved, totals merged (`tmdb-deep-dive#search`). Never `/search/multi`. |
| `GET /api/tmdb/{type}/{id}` | `app/api/tmdb/[type]/[id]/route.ts` | Movie runtime vs tv seasons/episodes. |
| `GET /api/tmdb/tv/{id}/season/{n}` | `app/api/tmdb/tv/[id]/season/[season]/route.ts` | Route-precedence trick from Spring is unnecessary — separate segments. |
| `GET /api/tmdb/genres` | `app/api/tmdb/genres/route.ts` | Movie + tv tables merged, one row per name, case-insensitive alphabetical. |

Ports of the plumbing:

- **Caching:** the Caffeine TTL table becomes `fetch(..., { next: { revalidate } })` — trending/discover/search 600s, detail + genres 86400s, image config 604800s. Native, works on Vercel and self-hosted.
- **Validation:** `window ∈ {day,week}`, `page ∈ 1..500`, `type ∈ {movie,tv}`, `season ∈ 1..100`, non-blank query → Zod at the boundary, same 400s.
- **Error mapping:** the `guarded()` wrapper ports as a shared helper — 404 → "Title not found on TMDB", everything else → 502 with a generic message, TMDB's status never leaked. This also delivers the todo's "global exception handler" item.
- **Jackson quirks retire.** `FAIL_ON_NULL_FOR_PRIMITIVES` and the hand-built snake_case mapper (`tmdb-deep-dive#jackson`) have no analogue in `fetch().json()`. The replacement is explicit Zod schemas per TMDB shape — which catches the same nulls at the same boundary, loudly. That whole vault section becomes history; it gets annotated as such rather than deleted.

**Open questions:** (a) `GenreInfo.movieId`/`tvId` appear unused — `home.tsx` selects by `genre.name` only. Keep them for a future id-based filter, or drop them from the response? (b) The "genres tab + All types" case merges two `discover` calls **client-side** in `home.tsx:loadPage` while `search` merges **server-side**. Should the merge move server-side for consistent pagination, or stay as-is? Reading the code alone doesn't reveal whether the client-side split was deliberate or incidental.

### 5. `FavouriteController`  ·  `backend/.../favourite/`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `GET /api/favourites` | `app/api/favourites/route.ts` (GET) | **T** | Oldest first. Also read server-side by both pages for first paint. |
| `PUT /api/favourites` | same file (PUT) + server action | **T** | Idempotent. **Improvement:** `INSERT … ON CONFLICT DO NOTHING` replaces check-then-insert — closing the concurrent-first-add 500 the vault itself names as the fix (`favourites-deep-dive#optimistic-revert`). |
| `DELETE /api/favourites/{type}/{tmdbId}` | `app/api/favourites/[type]/[tmdbId]/route.ts` | **T** | Idempotent. |

`media_type` stays part of the identity (movie 123 ≠ tv 123). No cached title/poster metadata — unchanged, and the reasoning still holds.

**Open question:** the vault's "one shared GET seeds home + watch page" was a client-side sync mechanism. With RSC each page can read favourites server-side per request, which is simpler and always fresh. Confirm that's acceptable rather than threading a client-side shared cache.

### 6. `ProgressController`  ·  `backend/.../progress/`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `GET /api/progress` | `app/api/progress/route.ts` (GET) | **T** | Newest first; the client picks its winner per title. |
| `PUT /api/progress` | same file (PUT) | **T** | All validation ports: tv requires season+episode, `progressSeconds ≥ 0`, `durationSeconds > 0` if present, `< 5s` discarded, movie coordinates normalised to NULL server-side. |
| `DELETE /api/progress/{type}/{tmdbId}` | `app/api/progress/[type]/[tmdbId]/route.ts` | **T** | Title-level by default ("Start over" restarts a show at S1E1); episode-level when `season`+`episode` are both present; one without the other is a 400. |

Two details that break a naive port:

- The find-then-save upsert becomes a real `ON CONFLICT` — but the conflict targets are the **partial** indexes, so both need their predicate spelled out (`targetWhere: isNull(seasonNumber)` for movies, `isNotNull(...)` for tv). Getting this wrong silently duplicates movie rows, which is precisely what those indexes exist to prevent.
- Last-write-wins with **no monotonic guard** is deliberate (a rewatch starts near 0 and must overwrite). Don't "fix" it.

**Deliberate divergence:** the 60s heartbeat stays a **route handler, not a server action**. Server actions serialise per client and are entangled with revalidation; queueing playback heartbeats behind UI mutations would drop positions. User-initiated mutations (hearts, start-over) *do* use server actions.

### 7. `StreamController` → biggest reimplementation  ·  `backend/.../stream/`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `GET /api/stream/providers` | `app/api/stream/providers/route.ts` | **T** | Registry becomes an exported array of modules instead of Spring injecting every `@Component`. Sorted, stable order. |
| `GET /api/stream/sources` | `app/api/stream/sources/route.ts` | **T** / partial **R** | Resolve exactly the named provider, no fallback chains, no health checks (`streaming-providers-deep-dive#architecture` — the user's explicit flow decision). The 5-min Caffeine resolve cache becomes the Data Cache keyed on provider+type+id+s+e. |
| `GET /api/stream/proxy/{token}` | `app/api/stream/proxy/[token]/route.ts` | **R** | **Stateless signed tokens** — see D1. Range passthrough, upstream 206s untouched, playlist rewriting, and the single 300ms retry on 4xx/5xx/IO all port directly. |
| `VidsrcHairProvider` | `lib/stream/providers/vidsrc-hair.ts` | **T** | `var Q = {...}` regex → `api.php?a=sources` → `a=race` → `_stream` master. Relative-URL prefixing preserved. |
| `VixsrcProvider` | `lib/stream/providers/vixsrc.ts` | **T** | Single-use `src` (reuse = 410), the bare-`url:` lookbehind regex, expiry grace, per-rendition rows sorted ascending. |
| `VideasyProvider` | `lib/stream/providers/videasy.ts` | **T** | Seed → `sources-with-title` (double-encoded title) → decrypt → HLS/mp4. |

The videasy cipher is the one piece with real porting risk — and it gets *easier*: it was JavaScript originally (extracted from their player bundle), and the trap the Java port hit (`%` on the unsigned value, off by `2^32 mod 61 = 57`) simply doesn't exist in JS. Use `Math.imul` and `>>> 0`; verify byte-for-byte against a live payload before trusting it.

**Open questions:** (a) `fetch` has no per-read inactivity timeout, so the Java client's "20s per read, not total" trick (which keeps slow-but-alive movies from being killed) needs a deliberate answer — probably no timeout on the streaming body, a short one on resolve calls. (b) Should proxy tokens be bound to the requesting user's session? It costs a session read per segment; today they're bearer-capability by design because `<video>` can't send the cookie. I'd keep them unbound with a 6h expiry, matching today. (c) `videasy` depends on `TmdbService.detail` + `TmdbClient.imdbId`; keep that dependency direction (provider → tmdb lib), not the reverse.

### 8. `SubtitleController`  ·  `backend/.../subtitle/`

| Spring | Next.js | Kind | Notes |
|---|---|---|---|
| `GET /api/subtitles` | `app/api/subtitles/route.ts` | **T** + one **R** | Search → pick → download → convert → serve, with `Cache-Control: private, max-age=3600`. |

Ports verbatim, all hard-won: alphabetical (canonical) query-param order or Kong 301s; Chrome UA required or `/download` is blocked; `sub_format=vtt` requested from the download endpoint rather than filtering by filename (search results carry no extension); pick by HI/machine-translated penalty then `download_count` desc; SRT→VTT timestamp-comma conversion; ASS → 404; error mapping (no key → 503, 429 → 503, 401/403 → 503, miss → 404, unreachable → 502); "no captions" is never an error.

**Divergence (D2):** the disk cache at `backend/data/subtitles/` + 30-day TTL sweep becomes a Postgres `subtitle_cache` table keyed by `file_id`. The quota is the real constraint (5–10 downloads/day), so durability matters more than latency — and a Postgres row survives redeploys, which the disk cache never did.

### Frontend map

| React | Next.js |
|---|---|
| `App.tsx` (BrowserRouter, probe, session event) | `app/layout.tsx` + `app/(app)/layout.tsx` (`await auth()`, redirect) |
| `/login` → `GuestView` | `app/(auth)/login/page.tsx` |
| `/` → `home.tsx` (816 lines) | `app/(app)/page.tsx` (RSC: genres, favourites, progress, first page) + `components/browse/*` client islands keeping the existing reducer |
| `/movie/:id`, `/tv/:id` → `watch.tsx` (804 lines) | `app/(app)/movie/[slug]/page.tsx`, `app/(app)/tv/[slug]/page.tsx` — two explicit segments (the type is a closed set of two; a `[type]` catch-all would match junk) |
| axios `client.ts` + interceptor + CORS + `withCredentials` | plain same-origin `fetch` — all of it deleted |
| `require-auth.tsx`, `lib/authStorage.ts` | deleted (server-side session) |
| Search/tab passed via react-router route state | **URL search params** (`?tab=&q=`) — shareable, back-button-correct, server-readable |
| `index.html` inert hls.js `<script>` tag | the same tag in `app/layout.tsx` `<head>` + `window.Hls` assignment in a client bootstrap |
| vidstack player, caption overlay, delay menu, progress tracker | `'use client'` islands, unchanged logic |

Player-side gotchas that must survive: the inert-tag/`window.Hls` bundling trick (a runtime jsdelivr fetch dies on CDN-blocking networks); `slots={{ settingsMenuItemsEnd }}` as a **prop**, never a slot-attribute child; player keyed by `proxyUrl` so a source switch remounts; the tracker keyed per season/episode and rendered only while `resolvedCoords` matches the picker; `ConfirmDialog` description rendered as `<div>`, not `<p>`.

---

## Divergence flags

Every place this plan departs from the vault's documented decisions or from the Spring implementation, with reasoning.

**D1 — Proxy capability tokens become stateless signed tokens.** *Spring:* `StreamProxyService.register()` puts `{url, headers}` into a 20k-entry Caffeine map with a 6h TTL; the token is a random UUID. *Next.js:* encode `{url, headers, exp}` into a compact signed/encrypted token (`jose`); no store at all. Reason: under the stateless rule, an in-memory map breaks the moment two instances exist — a token minted by one wouldn't resolve on another, and playback would 404 mid-movie. Signed tokens also remove the eviction ceiling (a 2h movie mints ~2000 child tokens during playlist rewriting). Cryptographically stronger than "unguessable UUID in a map", and the `permitAll` reasoning is unchanged.

**D2 — Subtitle cache moves from disk to Postgres.** Reason: serverless filesystems are ephemeral; a redeploy would re-spend the tiny daily quota. Postgres also makes the 30-day sweep a `DELETE … WHERE updated_at <` instead of a directory walk.

**D3 — `refresh_tokens` retires, so the guest-activity trigger moves to `sessions`.** This one has a non-obvious consequence and needs a decision. *Today:* `users.last_activity_at` is bumped by DB triggers on `watch_progress`, `favourites`, **and `refresh_tokens`** — and the vault says the third is deliberate: the frontend's silent refresh every 15 minutes counts as activity, so a guest with the app open is never swept (`guest-cleanup-deep-dive#trigger`). *After:* there is no refresh token. The equivalent is a trigger on the Auth.js `sessions` table, which Auth.js updates when `session.updateAge` elapses. With `updateAge: 1h`, an open tab bumps hourly — well inside the 7-day retention window, so the intent survives. **If we skipped this, an idle-but-open guest would be swept**, which is exactly the failure the original design avoided. The trigger function itself (`touch_user_last_activity()`, in raw SQL because Liquibase's formatted-SQL splitter shredded `$$` bodies) ports unchanged — the "every user-scoped table gets the trigger" rule stays.

**D4 — Access/refresh token pair, rotation, and hash storage all disappear.** Diverges from a prominent vault decision (`auth-deep-dive#tokens`). Reason: rolling database sessions achieve the same goals (indefinite login, revocability, useless-if-leaked storage) with one table and no client-side machinery. The two-token scheme existed to make a *stateless* access token revocable; database sessions make the token stateful, so the problem vanishes rather than being solved.

**D5 — `GET /api/me` and the client-side auth guard disappear.** Diverges from `overview.md`'s "`RequireAuth` probes `GET /api/me` on startup — the localStorage user is a cache/hint, the probe is the source of truth". Reason: with a server-rendered layout the session is known before render, so there is no hint to reconcile and no splash to show.

**D6 — TMDB data is fetched in server components for first paint, not only through a proxy route.** The proxy routes stay for client interactions. Reason: an RSC page fetching TMDB directly saves a browser→our-API→TMDB hop on every page load; the shared `lib/tmdb` module means one implementation serves both.

**D7 — Search/tab state moves from router state into URL search params.** Reason: the current `navigate('/', { state: { query } })` hack loses state on reload and can't be shared or bookmarked. Next.js reads search params server-side, which also lets the first page render with results already in it.

**D8 — Favourites add becomes `ON CONFLICT DO NOTHING`.** Closes the concurrent-first-add 500 the vault documents as acceptable-but-fixable.

**D9 — Jackson-specific defences retire in favour of Zod boundary schemas** (see §4). Same bugs caught, at the same boundary, in the idiom of the new stack.

**D10 — Migration tooling changes from Liquibase to Drizzle Kit + paired down files.** Diverges from a documented hard rule's *tooling* while preserving the rule itself. The Liquibase rollback debugging note (classpath vs filesystem `FILENAME` identity, `searchPath`, v5 goals) becomes historical — kept, marked as such, because it explains why the up/down discipline is written the way it is.

**D11 — Heartbeats use a route handler while UI mutations use server actions** (see §6). Mixed idiom on purpose.

**D12 — Rate limiting is new work, not a port** (see architecture). No Bucket4j exists.

**D13 — Public repo will contain the decision history, minus the provider scraping notes.** Per your call: `docs/local/streaming-providers.md` lives in the repo tree but is gitignored, so the wire formats stay off a public repo while remaining exactly where the code's comments point.

---

## Vault relocation

The vault stops being Desktop-local and becomes part of the repo, so the decision history travels with the code and is readable by any contributor (and by any future agent session without a machine-specific path).

```
CLAUDE.md                          # read-me-first index + standing conventions (replaces root agents.md)
docs/
  decisions/
    README.md                      # index (folds in Welcome.md + overview.md's map)
    overview.md                    # architecture + key decisions, rewritten for the Next.js stack
    auth.md                        # from auth-deep-dive.md, annotated where Auth.js supersedes it
    tmdb.md                        # from tmdb-deep-dive.md (Jackson section marked historical)
    watch-progress.md
    favourites.md
    guest-cleanup.md
    hosting.md                     # from hosting-options.md — the reason for this migration
    migrations.md                  # rules from changelog/agents.md + the Drizzle up/down workflow
    history/
      spring-boot-stack.md         # what the previous implementation was, and why it changed
      liquibase-rollback.md        # kept verbatim; explains the up/down rule's origin
  local/                           # GITIGNORED — private notes stay local but in place
    streaming-providers.md         # provider wire formats, cipher notes, hunt logs
```

Why this shape:

- **`docs/decisions/` is where a contributor looks.** Flat, one file per subject, matching the vault's existing one-note-per-subject split — no reorganisation of content, so nothing has to be re-derived.
- **Markdown with relative links renders in both GitHub and Obsidian.** The user can still open `docs/` as a vault. `[[wikilinks]]` are converted to `[text](file.md)` because wikilinks don't render on GitHub; relative links work in both.
- **`CLAUDE.md` at the root** is what this harness auto-loads each session, so it replaces the current `agents.md` pointer-to-external-vault — the indirection that made the history machine-local in the first place. It stays short: stack, ports, conventions, and links into `docs/decisions/`.
- **`docs/local/` is gitignored as a folder**, not a single file, so future private notes have a home. `docs/decisions/README.md` and `CLAUDE.md` both mention that it exists and is untracked — so a contributor knows a note is referenced but not published, rather than hitting a dead link.
- **`Personal/preferences.md` and `Personal/claude-code-gateway-undo.md` stay in the Desktop vault** — they're cross-project and personal, and the gateway note has nothing to do with this app. The *project-relevant* conventions from `preferences.md` (light comments, optimistic UI, 4-space + semicolons via Prettier) are restated in `CLAUDE.md` so they bind contributors too.
- The Desktop vault keeps a short stub note pointing at the repo, so opening it doesn't look like the project vanished.

---

## Standing rule: design parity (execution phase)

The visual result must be **identical** to the current app. This is a port of the UI, not an
opportunity to improve it.

- **Reference captures live in `design-reference/`** (13 screenshots + `README.md`), taken from the
  live stack on 2026-08-18 before any Next.js code existed: login, guest confirm dialog, home in
  both themes, genres chips, empty library, media modal, TV and movie watch pages, the 1366x680
  laptop height, two mobile widths, and search results (including the gradient poster fallback).
- **The visual system ports verbatim, not rewritten:** `src/index.css` (161 lines, ~109 custom
  properties - palette incl. `--gold`, radii, Outfit + Manrope) and `src/components/ui/*` (shadcn,
  base-ui variants) are copied across. Tailwind v4 uses the same CSS-first tokens in Next.js.
- **Keep `@fontsource-variable/*` self-hosted fonts** rather than switching to `next/font`, so text
  rasterises identically.
- **Measured acceptance criteria** (from `design-reference/README.md`): the watch page fits without
  scrolling at 1366x680 (verified: `scrollHeight === innerHeight === 680`); home grid is 2/3/4/5/6
  columns at base/sm/md/lg/xl; the player surface is pinned to `calc(100dvh - 230px)` from `lg`;
  the picker card is 280px at `sm` / 360px at `lg`.
- **Every UI batch ends with a screenshot diff** against the matching reference capture, at 1920x1080,
  1366x680 and 390x844. A deviation is a bug in the port, not a new design decision.
- Any change that *cannot* be avoided (e.g. a shadcn or vidstack version bumps a default) is raised
  in that batch review rather than absorbed silently.

---

## Standing rule: code comments (execution phase)

This is binding for every batch below.

- **1–2 lines maximum.** No block comments explaining rationale, no ASCII banners, no restating what the code says.
- Comments exist for **glanceability** — what this does, or the one non-obvious constraint.
- **Deep reasoning goes in a note, and the comment points at it:** `// see: docs/decisions/auth.md#cookies`. Repo-relative so it's clickable in the editor and on GitHub.
- Notes in `docs/local/` are referenced the same way: `// see: docs/local/streaming-providers.md#vixsrc-wire`.
- Existing `vault:<note>#<section>` tags are rewritten to this form as each file is ported.
- If a comment wants to be longer than two lines, that's the signal to write (or extend) a note instead.

---

## Scope correction (2026-08-18): rate limiting and error hygiene are not migration work

The user pointed out that neither existed in the Spring app, which matches the plan's own
opening correction: **there is no Bucket4j**, and the "global exception handler" was a line in
`tv pirate todo.txt`, not code. Both are new features that happened to be scheduled inside the
migration. They move out.

What already landed as part of parity, because the old app genuinely had it:

- `protectedRoute()` / `ApiError` map thrown failures to status codes and never leak upstream
  detail — the equivalent of Spring's `ResponseStatusException` usage.
- TMDB failures map to 404 "Title not found on TMDB" and 502 otherwise, verified against the old
  backend in `scripts/tmdb-parity.mjs`.

Deferred until after the migration, as new work: per-IP rate limiting (with the guest endpoint
strictest, and the stream proxy exempt — a 2 h movie is thousands of segment requests), the
external-cron guest sweep, dynamic page titles, a real not-found page, and production error
logging. All of these are todo-list items, and the guest DoS exposure they address is unchanged
from the Spring app rather than newly introduced.

Remaining migration gates: subtitles, then the verification sweep.

---

## Batch resequencing (2026-08-18)

The user's rule: **never hand over a batch with no UI to click.** Batch 2 (TMDB routes) was an
API-only gate and should not have been one — it is reviewed together with Batch 3. The remaining
batches are regrouped so every gate ends in something testable in the browser:

| Gate | Contents | Visible result |
|---|---|---|
| 3 | Browse UI + favourites (migration 0002) | the home screen: tabs, search, pagination, modal, working hearts |
| 4 | Stream proxy + registry + first provider + watch page | video actually plays |
| 5 | Remaining providers (vixsrc, videasy cipher) | provider chips switch sources |
| 6 | Watch progress (migration 0003) | resume, progress bars, Continue watching in the library |
| 7 | Subtitles | captions on screen + the delay stepper |
| 8 | Rate limiting, cron, error hygiene, page titles | mostly invisible — I verify it; the visible parts are 429 toasts and dynamic titles |
| 9 | Verification sweep, smoke tests | green runs |

Watch progress moved *after* the player because progress rows can only be created by playback —
"Continue watching" cannot be tested before video plays.

---

## Batching order

**Every batch ends in a full stop for your review and manual testing - the next one does not start until you say so.**

Each batch is independently reviewable and manually testable. **The old stack keeps running on :8080/:5173 throughout** — that's the parity oracle: same request against both, diff the JSON. The new app runs on :3000.

**Batch 0 — Scaffold + docs relocation** *(no endpoints)* — **DONE 2026-08-18, awaiting review**
Already done ahead of time: `design-reference/` captured from the live stack (13 states + measured constraints).
New repo at project root (not nested — per your working preference). Latest stable Next.js App Router + TypeScript, Tailwind v4, shadcn/ui, Prettier (4-space, semicolons, single quotes, printWidth 100) + oxlint wired into `npm run lint` exactly as today. Drizzle + drizzle-kit + `db/migrate.ts` runner. Env plumbing (`.env.example`). Vault → `docs/` per above; `CLAUDE.md`. *Verify:* dev server renders, `npm run lint` clean, migration 0001 up → down → up on the fresh DB.

**Batch 1 — Auth** *(3 endpoints + session)* — **DONE 2026-08-18, awaiting review**
Auth.js v5 + Drizzle adapter, database sessions. Migration 0001: `users` (canonical + `provider`, `last_activity_at`), `accounts`, `sessions`, `verification_token`, the trigger function, and the `sessions` trigger. Guest route, `signOut`, protected `(app)` layout, login page. *Verify:* guest login creates user + session rows; reload stays logged in; logout clears both; `/` while logged out redirects to `/login`; a deleted user loses access immediately.

**Batch 2 — TMDB proxy** *(6 endpoints)* — **DONE 2026-08-18, awaiting review**
`lib/tmdb/` + Zod schemas + revalidate TTLs + shared error mapping + the six route handlers. *Verify:* curl all six against both stacks and diff — trending order, discover genre filtering, search interleave, detail runtime/seasons, season episode list, merged genre list. Bad inputs return the same 400s.

**Batch 3 — Browse UI + favourites** — **DONE 2026-08-18, awaiting review**
Home page as RSC shell + client islands: top nav (search via URL params), media card/poster, modal, pagination, genre chips, featured banner, type filter, skeletons and empty/error states. The browse reducer ports as-is, including the re-click-active-tab no-op guard. *Verify:* side-by-side against :5173 — tabs, debounced search, pagination, filters, modal.

**Batch 4 — Favourites + Progress** *(6 endpoints, 2 tables)*
Migrations 0002/0003 with both partial unique indexes, CHECKs, and their activity triggers. Both APIs, `ON CONFLICT` upserts, optimistic hearts + start-over via server actions with revert + toast, library tab (continue watching + favourites). *Verify:* toggle a heart and confirm the row; kill the network mid-toggle and confirm revert + toast; progress bars reflect saved rows; start-over clears every row for a show; movie rows can't duplicate.

**Batch 5 — Stream core + first provider** *(2 endpoints + proxy)*
Provider registry, signed-token proxy (Range, 206 passthrough, playlist rewriting incl. `EXT-X-KEY` and `EXT-X-MAP`, the one 300ms retry), `vidsrc-hair`. *Verify:* `/providers` and `/sources` answer; master playlist and segments all 200/206 through the proxy; a token survives a simulated restart (proving statelessness).

**Batch 6 — Providers 2 and 3**
`vixsrc`, then `videasy` with the cipher ported and cross-checked byte-for-byte against a live payload. *Verify:* resolve + play one movie and one TV episode per provider (the vault's known-good pair: Fight Club, Breaking Bad S1E1).

**Batch 7 — Watch page**
Player island, hls.js inert-tag trick in the layout head, season/episode/provider pickers, resume seek, heartbeat tracker, description expander, backdrop ambience, the dvh-based single-column layout. *Verify:* click-to-play; seek; pause flushes; switch provider mid-play and playback continues from position; reload resumes; switching episode credits the right row; page fits without scrolling at 1920×1080 and 1366×680.

**Batch 8 — Subtitles**
OpenSubtitles route + `subtitle_cache` migration + caption overlay + delay menu in `settingsMenuItemsEnd`. *Verify:* both known-good titles return VTT; second request hits the cache (quota log unchanged); missing key → 503 and the player runs caption-less; delay stepper shifts cues and resets per episode.

**Batch 9 — Rate limiting, cron, error hygiene** *(the todo list)*
Middleware limiter + strict guest limit + proxy exemption, cron route + schedule config, unified error responses, dynamic page titles via `generateMetadata`, sensible 404/`not-found` handling. *Verify:* fourth guest login in an hour → 429; playback unaffected under load; cron route rejects a bad secret and sweeps a backdated guest correctly (revived-by-trigger guest survives, idle guest deleted).

**Batch 10 — Verification sweep + handover**
Rewrite the two lost harnesses as Playwright scripts (`scripts/watch-smoke.mjs`, `scripts/provider-matrix.mjs`) — this time committed. Production build + a run against it. Update `docs/decisions/overview.md` to describe the shipped stack, and log the migration in `history/`. Old repos stay untouched as reference.

---

## Verification

Per-batch checks are listed above. Across the whole migration:

- **Parity diffing** is the primary tool. Both stacks run simultaneously; every ported endpoint is curled against :8080 and :3000 and the JSON compared. This substitutes for the test suite that doesn't exist.
- **Migrations:** every migration is verified **up → down → up** against the fresh DB before it's committed (rule 6, carried over).
- **Lint + build:** `npm run lint` (prettier --check + oxlint) and `npm run build` clean at the end of every batch.
- **Smoke:** from Batch 7 on, `scripts/watch-smoke.mjs` runs guest login → card → modal → watch route → chips → click-to-play → asserts the video advances. Use `waitUntil: 'load'` plus element waits — `networkidle` never fires against a healthy dev server because the HMR websocket counts as an open connection.
- **Provider matrix:** 3 movies + 3 shows per provider, console-error checked, after Batch 6 and again at the end. Expect flap, not perfection — the CDNs are documented to flap under load.
- I start and stop all dev processes (:3000, and :8080/:5173 for comparison); you only test.

Learning-mode pauses after Batch 1 (Auth.js sessions vs the JWT pair), Batch 2 (RSC vs route handlers, and the Data Cache), and Batch 5 (stateless signed tokens) — those three introduce genuinely new concepts.

---

## Open questions carried into execution

Not blockers; each is answered at the start of its batch.

1. `session.updateAge` value, which sets how often an open tab bumps guest activity (D3).
2. Whether `adapter.createSession` is stable public API in the pinned adapter version; fallback is a small hand-written adapter.
3. Keep or drop `GenreInfo.movieId`/`tvId` — currently unused by the UI.
4. Whether the "all types + genres" discover merge should move server-side.
5. Proxy-token binding to the session (I'd keep unbound, 6h expiry, as today).
6. `fetch` timeout strategy for long streaming bodies vs short resolve calls.
7. Rate-limit store: Upstash Redis (recommended) vs a Postgres counter table if you'd rather add no infra.
