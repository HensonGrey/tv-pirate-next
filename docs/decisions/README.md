# Decisions

Why this app is built the way it is. These notes were the project's Obsidian vault until
2026-08-18; they now live with the code so the reasoning travels with it.

Code comments stay short and point here instead of restating context — e.g.
`// see: docs/decisions/auth.md#cookies`.

## Notes

| Note                                   | What it covers                                                            |
| -------------------------------------- | ------------------------------------------------------------------------- |
| [overview.md](overview.md)             | Architecture and the running list of key decisions                        |
| [auth.md](auth.md)                     | Session design, cookies, CSRF stance, why there are no local accounts     |
| [tmdb.md](tmdb.md)                     | The TMDB proxy: per-type search, trending re-rank, caching                |
| [watch-progress.md](watch-progress.md) | Heartbeat cadence, partial unique indexes, resume mechanics               |
| [favourites.md](favourites.md)         | Schema identity (`media_type`), optimistic toggle + revert                |
| [guest-cleanup.md](guest-cleanup.md)   | Activity clock owned by DB triggers, the daily sweep                      |
| [hosting.md](hosting.md)               | Free-tier landscape — and the constraint that drove the Next.js migration |
| [migrations.md](migrations.md)         | The up + down rule and how to add or roll back a migration                |

## History

| Note                                                           | What it covers                                            |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| [history/migration-plan.md](history/migration-plan.md)         | The approved React + Spring Boot → Next.js plan, verbatim |
| [history/spring-boot-stack.md](history/spring-boot-stack.md)   | What the previous implementation was, and why it changed  |
| [history/liquibase-rollback.md](history/liquibase-rollback.md) | Why the up + down rule is written the way it is           |

## Not in this folder

- **`docs/local/streaming-providers.md`** — provider wire formats and cipher notes. Present in the
  working tree, **gitignored on purpose**: this repo is public and those are scraping recipes for
  gray-market sites. Code comments reference it by path; if you cloned this repo, that file will be
  missing and that is expected.
- **Personal preferences** (how the maintainer likes to work) stay in the external vault. The parts
  that bind contributors are restated in [../../CLAUDE.md](../../CLAUDE.md).
