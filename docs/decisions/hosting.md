# Hosting options — free-tier landscape for tv-pirate (2026-08-17)

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

Context for the deployment decision, researched 2026-08-17. Numbers change — re-verify limits before acting.

## the constraint — Spring Boot can't run ON Vercel

Vercel's serverless runtime supports Node/Go/Python/Ruby functions only — no long-running JVM process. The backend MUST live on a container/VM host. What stays on Vercel: the Vite static frontend (free, CDN, preview URLs), Vercel Postgres (Neon-backed) or plain Neon for the DB, and **Vercel Cron** (Hobby allows daily jobs) driving the cleanup by calling `POST /api/admin/cleanup-guests` with `X-Admin-Secret` — that endpoint exists exactly for hosts where `@Scheduled` can't fire.

## cookie gotcha — SameSite=Lax assumes same-site deployment

Auth cookies are `SameSite=Lax` (see auth-deep-dive#csrf); browsers won't attach them to cross-site fetch/XHR. Deployment options: (a) both apps under one parent domain (app.example.com + api.example.com = same registrable domain = same-site), (b) flip cookies to `SameSite=None; Secure` in prod, or (c) the Oracle single-box setup below, where Caddy serves frontend + `/api` from ONE domain — cookies are first-party and CORS is moot.

## the candidates

### Oracle Cloud Always Free VM (best $0 forever, most sysadmin)

- ARM Ampere A1: up to 4 OCPUs + 24 GB RAM total, 200 GB block storage, 10 TB egress/month, no expiry, no sleep, no cold starts
- Sweet setup: one Ubuntu VM + Docker Compose — Spring Boot, Postgres, Caddy (auto-HTTPS via Let's Encrypt, serves the Vite build AND reverse-proxies /api) → single domain, `@Scheduled` fires natively, admin endpoint kept as manual trigger
- Friction: signup card verification (some cards rejected; home region locked at signup), ARM "out of capacity" in busy regions (provision in any region, retry off-hours), you run the box (updates, firewall, SSH hardening, nightly pg_dump — OCI gives 10 GB free object storage for backups), occasional free-account horror stories, clunky console
- vs Render: no 15-min sleep / 512 MB cap / 30-day DB expiry. vs Cloud Run: no per-request anxiety, no cold starts, card-on-file only at signup

### Google Cloud Run (robust, minimal sysadmin)

- Free: 2M requests/month, 180k vCPU-seconds, 1 GB egress — scales to zero, ~1s cold starts (JVM slower)
- Needs credit card kept on file; 512 MB instance memory is workable with tuned heap
- Cron: Vercel Cron → admin endpoint (scale-to-zero kills `@Scheduled`)

### Render (simplest, weakest free tier)

- Free: 750 h/month, 512 MB, no card — but sleeps after 15 min idle (30–60s cold start) and the free Postgres expires after ~30 days (+14 grace) → pair with Neon instead

### Railway — skip: $5 one-time trial credit, not truly free anymore (peak-hour deploy restrictions)

### Free Postgres (host-independent)

- Neon: 500 MB, never pauses, no card — the recommended free DB; the guest-retention sweep exists exactly to fit a 500 MB cap
- Supabase: 500 MB but pauses after ~1 week inactivity
- Fly: free Postgres needs a card; VMs too small for Spring Boot

## Related

- `overview.md` — architecture + the guest-retention feature that makes small DB tiers livable
- `guest-cleanup.md` — the sweep the external cron triggers
- Sources checked 2026-08-17: dev.to "Free Backend Hosting 2026", github.com/DmitryScaletta/free-heroku-alternatives, render.com free-tier article, render-vs-railway article
