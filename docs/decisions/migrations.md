# Migrations

Postgres schema changes for tv-pirate. Read this before touching the schema.

## The rules

1. **A DB change MUST be a migration.** Never edit `db/schema.ts` and expect the database to follow —
   the schema file describes what the DB already has, and drifting the two apart breaks queries at
   runtime instead of at review time.
2. **Every migration has an up and a down.** `NNNN_name.sql` is the up; `NNNN_name.down.sql` is the
   exact inverse. The runner treats a missing down file as a hard error, not a skip. A migration
   without a down does not ship.
3. **Apply order is the filename order.** Zero-padded numeric prefix, ascending.
4. **Applied migrations are immutable.** Never edit one that has run on any database — write a new
   one. (There is no checksum enforcement; this rule is what keeps environments in step.)
5. **Every user-scoped table gets the activity trigger.** A table with a `user_id` column must add
   `CREATE TRIGGER ... AFTER INSERT OR UPDATE OR DELETE ... EXECUTE FUNCTION touch_user_last_activity()`
   in its own migration, or the guest sweep will not see real activity.
   see: [guest-cleanup.md](guest-cleanup.md)
6. **Always verify up → down → up** against a real database before committing.

## Commands

```bash
npm run db:status        # what is applied vs pending
npm run db:up            # apply every pending migration (each in its own transaction)
npm run db:down          # roll back the last one
npm run db:down 3        # roll back the last three
npm run db:generate      # drizzle-kit: diff db/schema.ts into a new up file
```

The runner is [`db/migrate.mjs`](../../db/migrate.mjs) (~90 lines) and tracks applied names in a
`_migrations` table. `DATABASE_URL` comes from `.env.local` via Node's `--env-file`.

## Adding one

1. Write the Drizzle tables in `db/schema.ts`.
2. `npm run db:generate` to get the up SQL — then **hand-edit it**: drizzle-kit does not emit
   partial indexes, CHECK constraints, triggers, or functions. Those are written by hand.
3. Write the paired `.down.sql` as the exact inverse.
4. `npm run db:up`, then `npm run db:down`, then `npm run db:up` again. All three must be clean.

## Why not drizzle-kit's own migrate, or Prisma

- `drizzle-kit migrate` applies but never rolls back; rule 2 needs both directions, hence the
  ~90-line runner.
- Prisma Migrate is forward-only _and_ its schema language cannot express the partial unique indexes
  this app depends on (`watch_progress` needs one index per row shape because Postgres treats
  `(NULL, NULL)` as distinct from itself). see: [watch-progress.md](watch-progress.md)
- The previous stack used Liquibase, whose formatted-SQL parser shredded `$$ ... $$` function bodies
  and whose rollback silently no-ops on a path mismatch. Both traps are documented in
  [history/liquibase-rollback.md](history/liquibase-rollback.md) — the up/down discipline here is
  the part of it worth keeping.
