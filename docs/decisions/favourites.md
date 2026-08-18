# Favourites — deep dive

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

Deep context behind the short comments in the favourites code (backend `favourite/` package, frontend `api/favourites.ts` + the heart toggles). Code comments tag sections as `docs/decisions/favourites.md#<id>`. Do not re-derive any of this.

## schema — media_type is part of the identity, no cached metadata

`favourites` is `(user_id, tmdb_id, media_type, created_at)` with `UNIQUE (user_id, tmdb_id, media_type)`. TMDB runs two id spaces (movie 123 ≠ tv 123), so `media_type` must be in the key — keying by id alone would collide a favourited movie with a favourited show (the original local-only Set keyed by id had exactly this bug). No title/poster/description caching on purpose: the frontend holds the full `MediaItem` when toggling, and detail views come from the TMDB proxy (24h-cached) — a copy would only go stale.

## optimistic-revert — flip first, revert on failure

Hearts follow the project's optimistic rule (`Personal/preferences.md`): dispatch the local flip + toast instantly, fire the idempotent PUT/DELETE after, and only on failure revert the state + `toast.error`. Idempotency matters here: replays (double-click, the axios 401-retry in client.ts) must not duplicate rows or 500. The add path is check-then-insert — a truly _concurrent_ first-add race would surface as a 500 (the unique constraint rejects the loser) rather than a silent 204; rare (single user, needs double-click interleaving) and self-healing on the next click. `INSERT ... ON CONFLICT DO NOTHING` would close it if it ever matters. One shared `GET /api/favourites` seeds both the home hearts and the watch-page heart, so the two pages stay in sync with each other and the server.

## Related

- `overview.md` — architecture, auth, migration rules
