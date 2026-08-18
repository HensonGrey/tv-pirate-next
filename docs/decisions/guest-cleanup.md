# Guest cleanup — deep dive

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

Deep context behind the short comments in the guest-cleanup code (migrations 0005/0006, `GuestCleanupService`, `AdminController`). Code comments tag sections as `docs/decisions/guest-cleanup.md#<id>`. Do not re-derive any of this.

## trigger — last_activity_at is owned by the database

`users.last_activity_at` is kept fresh by `touch_user_last_activity()`: AFTER INSERT OR UPDATE OR DELETE triggers on `watch_progress`, `favourites`, and `refresh_tokens` bump the owning user's clock inside the same transaction as the write. Chosen over a Java interceptor so the invariant holds for ANY write path (curl, future code, batch jobs) with nothing to remember per endpoint. The app never writes the column (`updatable=false` in `UserEntity`) — that stops a stale in-memory copy from overwriting a fresher trigger value on a future save. `refresh_tokens` is wired deliberately: the frontend's silent refresh every 15 min counts as activity, so a guest with the app open is never swept, while one that abandons it dies after the retention window.

Why the function lives in an **XML changelog** (`0006-touch-triggers.xml`): Liquibase formatted SQL splits statements on ANY semicolon and ignores `--splitStatements:false`, so a multi-line `$$...$$` body gets shredded mid-function (verified: "Unterminated dollar quote"). XML `<sql splitStatements="false">` honors the attribute. Any new user-scoped table must add its trigger — changelog `agents.md` rule 5.

## cron — daily sweep, callable from outside

`GuestCleanupService.sweepStaleGuests()` runs daily (`app.guest-cleanup-cron`, default 03:17 server time) and deletes guests (`provider='GUEST'`) whose clock is older than `app.guest-retention-days` (default 7), together with their favourites, watch progress, and refresh tokens — one transaction. The same method is exposed as `POST /api/admin/cleanup-guests`: normally just authenticated, but when `ADMIN_SECRET` is set the `X-Admin-Secret` header is required, so an external cron (Vercel cron, GitHub Actions) can trigger the sweep on hosts where `@Scheduled` can't fire (scale-to-zero). The sweep's own deletes re-fire the trigger harmlessly — those users are leaving anyway. Verified live 2026-08-17: a backdated guest that took one action was revived by the trigger and survived the sweep; a backdated idle guest was deleted.

## Related

- `overview.md` — architecture, auth, migration rules
