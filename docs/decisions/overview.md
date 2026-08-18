# tv-pirate

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

## Overview

Full-stack learning project. Root: `C:\Users\minec\Desktop\tv-pirate`.

## Architecture

- `/backend` — Spring Boot (Java 21, Maven), Spring Security + JWT auth, Spring Data JPA, PostgreSQL (`tv-pirate` DB). Port **8080**.
- `/frontend` — Vite + React (TypeScript, Tailwind CSS), axios API client, auth via httpOnly cookies (`withCredentials`); localStorage holds only the non-sensitive user info. Port **5173**. Routes (react-router v7): `/login` (guest view, redirects to `/` when authenticated) and `/` (protected home with shadcn sidebar + sign-out). `RequireAuth` guard probes `GET /api/me` on startup — localStorage user is a cache/hint, the probe is the source of truth.

## Key Decisions

- Auth: **no local accounts** — only guest (one-click) and providers (Google later). JWT pair: short-lived access token + long-lived refresh token, delivered as httpOnly cookies (access: Path=/, refresh: Path=/api/auth, SameSite=Lax). Silent refresh with rotation keeps users logged in indefinitely. CSRF is covered by SameSite=Lax (same-site deployment); the filter also accepts the Authorization header for curl/Postman. Google OAuth credentials do NOT exist yet — they'll need to be created in Google Cloud Console when that feature lands.
- Endpoints: `POST /api/auth/guest`, `POST /api/auth/refresh` (refresh token arrives via cookie), `POST /api/auth/logout`, `GET /api/me` (session probe). Refresh tokens are rotated (burned on use) and stored as SHA-256 hashes in the `refresh_tokens` table. CORS allows `http://localhost:5173` with credentials; the cookie Secure flag is env-driven (`COOKIE_SECURE`, false locally / true in prod).
- Profile pictures: `users.profile_picture_url` (nullable, 512 chars) — provider-supplied avatar URL (Google `picture` claim, free), null for guests; the frontend renders it when present and falls back to the shadcn initial avatar otherwise.
- DB credentials stored in `backend/.env` (gitignored), read via environment variables.
- **Migrations (hard rule, 2026-08-15)**: a DB change MUST be a Liquibase migration with up + down (`--rollback`), in `backend/src/main/resources/db/changelog/` (folder has its own `agents.md`). Chosen over Flyway because Flyway OSS has no "down" (undo is paid). `spring.jpa.hibernate.ddl-auto=validate` — Hibernate only checks entities against the schema and crashes on mismatch; it never alters the DB. Baseline changesets use `onFail:MARK_RAN` preconditions so the pre-migration dev DB gets baselined while fresh DBs run everything. Manual rollback (Liquibase 5 — the old `rollbackCount`/`rollback-one-changeset` Maven goals no longer exist): from `backend/`, `.\mvnw.cmd liquibase:rollback -Dliquibase.propertyFile=liquibase.properties -Dliquibase.rollbackCount=1` (gitignored `liquibase.properties`; `rollbackSQL` for a dry run). The properties file must use `changeLogFile=db/changelog/master.yaml` + `searchPath=src/main/resources` so CLI-parsed paths match the `FILENAME`s the app stored — otherwise rollback silently does nothing ("0 changesets rolled back"). Requires `spring-boot-starter-liquibase` (Boot 4.x auto-config module — bare liquibase-core is NOT enough).
- Prior Next.js version (scaffolded 2025-07-25) was deleted in favor of this stack (2026-08-14).
- **Liquibase rollback debugging session** (2026-08-15): see [history/liquibase-rollback.md](history/liquibase-rollback.md) — why rollback silently said "0 changesets rolled back" (classpath vs filesystem path mismatch), the `searchPath` fix, and the exact v5 commands. Do not re-derive.
- **TMDB proxy deep dive** (2026-08-15): see [tmdb.md](tmdb.md) — Jackson 3 converter quirks (null-primitives + snake_case), per-type search rationale, per-page trending sort, same-tab no-op, the watch-progress mock (landed 2026-08-17). Code comments reference it as `docs/decisions/tmdb.md#<section>`.
- **Auth deep dive** (2026-08-15): see [auth.md](auth.md) — CSRF-via-SameSite, cookie design, token scheme, filter flow, ERROR-dispatch rule, guest DoS note. Code comments reference it as `docs/decisions/auth.md#<section>`.
- **Watch progress** (2026-08-17): `watch_progress` table + `/api/progress` endpoints; the player heartbeats positions (60s + flush on pause/seek/unmount/end) and resumes from the saved row. Deep dive: [watch-progress.md](watch-progress.md) — cadence, partial unique indexes (NULLS DISTINCT), resume-seek mechanics, Start over semantics. Code comments reference it as `docs/decisions/watch-progress.md#<section>`.
- **Favourites** (2026-08-17): `favourites` table + `/api/favourites` endpoints; hearts are server-backed with optimistic toggles (flip → idempotent PUT/DELETE → revert + toast on failure); `media_type` is part of the identity. Deep dive: [favourites.md](favourites.md) — schema, optimistic-revert. Code comments reference it as `docs/decisions/favourites.md#<section>`.
- **Library tab** (2026-08-17): one header tab holds both "Continue watching" (watch progress, newest first, click → player resume) and "Favourites" (click → detail modal). Chosen over a browse filter (per-user lists aren't TMDB filters — wrong results client-side, duplicated pagination server-side) and over two tabs (one slot keeps the header lean; the mobile tab strip scrolls anyway).
- **Guest retention** (2026-08-17): `users.last_activity_at` kept fresh by DB triggers on every user-scoped table; a daily `@Scheduled` sweep deletes guests stale for 7 days (default, configurable) with everything they own — free Postgres tiers are small. `POST /api/admin/cleanup-guests` (+ optional `ADMIN_SECRET`) lets external crons trigger it where `@Scheduled` can't fire. Deep dive: [guest-cleanup.md](guest-cleanup.md) — trigger, cron.
- **Hosting options** (2026-08-17, planning only): Spring Boot can't run on Vercel serverless — backend needs a container/VM host; frontend/DB/cron can stay on Vercel. Compared Oracle Always Free VM, Cloud Run, Render, Neon/Supabase. See [hosting.md](hosting.md).

## Repos

- **Backend**: https://github.com/HensonGrey/tv-pirate (Spring Boot, branch `master`; overwrote the prior Next.js app in this repo on 2026-08-14 — the old Next.js history was discarded intentionally)
- **Frontend**: https://github.com/HensonGrey/tv-pirate-frontend (branch `main`)
- **Local**: `C:\Users\minec\Desktop\tv-pirate` — two independent git repos: `backend/` → HensonGrey/tv-pirate, `frontend/` → HensonGrey/tv-pirate-frontend. Both public, no secrets committed (`.env` gitignored in both).
- **GitHub account quirk**: `gh` CLI is logged in as `valentin-mihailov` (budget-tracker repos only). All HensonGrey repos push via the stored https git credential. `HensonGrey/TvSeriesPirate` is an older, unrelated project — do not touch.
