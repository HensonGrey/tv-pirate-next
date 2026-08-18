# Watch progress — deep dive

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

Deep context behind the short comments in the watch-progress code (backend `progress/` package, frontend `progress-tracker.tsx` + `api/progress.ts`). Code comments tag sections as `docs/decisions/watch-progress.md#<id>`. Do not re-derive any of this.

## cadence — 60s heartbeat + event flushes, sub-5s rows never persist

The player sends at most one write per active minute: a 60s interval while playing, plus an immediate flush on pause, seek (a >30s position jump), episode end, and unmount. A send is skipped when the position moved <5s since the last one. Rationale: saving every `timeupdate` would be hundreds of writes per hour for zero resume benefit; 2-minute-only heartbeats lose a whole scene when the tab dies (user picked 60s + events). Rows with `progressSeconds < 5` are discarded server-side — accidental opens never create rows. Losing a heartbeat is harmless: the next one overwrites (last-write-wins).

## schema — two partial unique indexes, media_type on every row

`watch_progress` holds `(user_id, tmdb_id, media_type, season_number, episode_number, progress_seconds, duration_seconds, updated_at)`. Design points:

- `media_type` ("movie" | "tv") is required because the two TMDB id namespaces collide (movie 123 ≠ tv 123).
- Movie rows carry NULL season/episode; a CHECK enforces that.
- **Partial unique indexes**: a plain unique index over nullable season/episode can't stop duplicate movie rows — Postgres' default `NULLS DISTINCT` treats (NULL, NULL) as distinct from itself. Instead: unique `(user_id, tmdb_id)` WHERE season IS NULL (movies), and unique `(user_id, tmdb_id, season_number, episode_number)` WHERE season IS NOT NULL (tv).
- `duration_seconds` rides along so home can render % bars without a TMDB round-trip.
- Upsert is **last-write-wins with no monotonic guard** — progress only grows _within_ one viewing session; a rewatch starts near 0 and must be allowed to overwrite a mid-episode value.

## resume-seam — the player remounts, so resume is a seek-on-canPlay

The player is keyed by `proxyUrl` (a source switch remounts it and resets position). The tracker therefore seeks on every mount's `canPlay`: a pending resume target wins, otherwise it continues from `lastPositionRef` (the live position) — that second case is what makes a provider switch continue instead of snapping to 0. The tracker instance is keyed per season/episode AND rendered only while the resolved stream matches the picker (`resolvedCoords`): without that, the window between "clicked S2E6" and "new source arrived" would let a heartbeat credit the old stream's position to the new episode's row. Finished rows (≥97% of duration) don't resume and hide the modal bar.

## start-over — clears all rows for the title

"Start over" deletes every saved row for the title (a show restarts from S1E1), optimistically removes the bar, and navigates into the player. It's title-level on purpose: clearing only the shown episode would make the next visit resume a _different_ episode — not "start over". The episode-scoped delete (`season` + `episode` query params) exists for future per-episode resets.

## Related

- `overview.md` — architecture, auth, migration rules
- `tmdb.md` — the old mock-progress section, now landed
