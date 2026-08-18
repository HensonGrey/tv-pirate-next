<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# tv-pirate — agent notes

Next.js app (App Router) for browsing and watching movies and shows: TMDB metadata, guest-only auth,
server-backed favourites and watch progress, and a stream proxy in front of several providers.
Migrated from a Spring Boot + React two-process stack in August 2026.

## Read first

- **[docs/decisions/](docs/decisions/)** — why the app is built this way. Start with
  [README.md](docs/decisions/README.md), then [overview.md](docs/decisions/overview.md). These were an
  external Obsidian vault until 2026-08-18; they are the durable context, not the code comments.
- **[docs/decisions/history/migration-plan.md](docs/decisions/history/migration-plan.md)** — the
  approved migration plan, including the batch order still being worked through.
- **[docs/local/](docs/local/)** — present locally, **gitignored**: provider wire formats for
  gray-market streaming sites, kept off a public repo. Comments reference it by path; a fresh clone
  will not have it.

## Conventions

- **Comments stay short.** 1–2 lines, for glanceability. Deep reasoning goes in a note and the
  comment points at it: `// see: docs/decisions/auth.md#cookies`. If a comment wants a third line,
  write the note instead.
- **Migrations are the only way to change the schema**, and every one has a paired `.down.sql`.
  see: [docs/decisions/migrations.md](docs/decisions/migrations.md)
- **Code style is Prettier-enforced**: 4-space indent, semicolons, single quotes, 100 columns.
  `npm run lint` runs `oxlint` (correctness only) then `prettier --check`.
- **Optimistic UI for light actions** — update local state first, fire the request, revert + toast on
  failure. Not for destructive actions, which wait for the server.
- **The design is fixed.** [design-reference/](design-reference/) holds screenshots of the previous
  implementation; the UI is a pixel-parity port of those. A visual difference is a bug.
- **Git**: never commit or push until the user explicitly says go for that change. Finished work
  stays in the working tree so it can be reviewed locally rather than on GitHub.

## Layout

```
app/            routes, route handlers, layouts
components/     UI — components/ui/* is shadcn, copied from the previous app unchanged
db/             schema.ts (Drizzle), migrations/ (paired up + down), migrate.mjs (runner)
docs/           decision notes (see above)
lib/            shared server + client helpers
```

## Local development

```bash
npm run dev          # :3000
npm run lint
npm run db:status    # applied vs pending migrations
```

Postgres runs locally; `DATABASE_URL` and the API keys live in `.env.local` (gitignored, template in
`.env.example`). The database is `tv-pirate-next` — the old `tv-pirate` database belongs to the
Spring stack and is left alone.
