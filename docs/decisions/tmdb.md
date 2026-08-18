# TMDB proxy — deep dive

> **Moved from the Obsidian vault on 2026-08-18** (was `agent memory/Projects/tv-pirate/`).
> Written against the Spring Boot + React implementation. Sections superseded by the Next.js
> rebuild are marked inline as each batch lands. see: [history/migration-plan.md](history/migration-plan.md)

Deep context behind the short comments in the TMDB proxy code. Code comments tag sections as `docs/decisions/tmdb.md#<id>`. Do not re-derive any of this.

## jackson — the Jackson 3 converter in TmdbConfig

The TMDB RestClient gets its own `JacksonJsonHttpMessageConverter` built from a raw `JsonMapper.builder()`. Two things that builder needs, both non-obvious:

1. **`FAIL_ON_NULL_FOR_PRIMITIVES` must be disabled.** Jackson 3 (Boot 4) flips Jackson 2's behavior: mapping a JSON `null` onto a primitive record field is now an ERROR by default, where Jackson 2 silently coerced null → 0. TMDB sends nulls in fields our records declare primitive (documented quirk, e.g. `total_pages` on some endpoints) — the first version of this client 502'd with `MismatchedInputException: Cannot map null into type int` until this was disabled.
2. **`SNAKE_CASE` naming must be set explicitly.** A hand-built `JsonMapper.builder()` does NOT inherit Spring Boot's Jackson configuration — including any naming strategy. Without it, TMDB's `"total_pages"` never matches the record field `totalPages`; unannotated fields silently stay at their default (0) instead of failing. That bug shipped for days: every list endpoint returned `totalPages=0, totalResults=0` while TMDB sent real numbers (discover movie: 58k pages). Only `TmdbEntry` survived because it carries explicit `@JsonProperty` annotations. Lesson: any new unannotated snake_case field in TmdbClient's records now maps correctly — but if you ever add a record WITHOUT relying on the strategy, annotate it or it goes back to silently-zeroing.

## search — per-type endpoints instead of /search/multi

`/search/multi` mixes people into the relevance ranking. For short queries ("dex") hundreds of people named Dex occupy pages 1–2 and the real titles (Dexter) land on page 3+ — invisible because only page 1 is fetched, and people are discarded anyway.

Fix: call `/search/movie` and `/search/tv` directly (people never exist in those indexes), interleave the two pages so each list keeps its relevance order and both types stay visible, then merge totals (totalPages = max, totalResults = sum). A search page carries up to 40 items. `search_type=ngram` was tested and is NOT needed — default phrase search on the per-type endpoints already ranks Dexter well for "dex".

## trending-sort — trending re-ranked by rating

TMDB ranks trending by popularity momentum; the home page wanted best-rated first. The sort happens inside the fetched page only: a truly global sort would require fetching all ~500 trending pages before answering. Null ratings (no votes yet) sink to the bottom via `Comparator.nullsLast(reverseOrder())`; the sort is stable, so rating ties keep TMDB's popularity order. The sorted result is what gets cached.

## tab-noop — re-clicking the active tab is a no-op

In home.tsx's reducer. The `tab` action clears `items` (so the skeleton shows instead of stale data), but the fetch effect only re-runs when its deps change — same tab → no dep change → no fetch → empty grid rendered "No treasure found". Guard: `if (action.tab === state.tab) return state` — returning the same state object makes React bail out of the re-render entirely.

## mock-progress — watch progress is mocked (LANDED 2026-08-17)

`mockProgressFor(id)` in media-modal.tsx fabricated a deterministic 8–96% progress for tv titles. Real per-user watch tracking LANDED 2026-08-17: the mock was deleted and the bar now reads real saved positions from `GET /api/progress`. See [watch-progress.md](watch-progress.md).

## Related

- `overview.md` — architecture, auth, migration rules
- `watch-progress.md` — the real watch tracking that replaced the mock
- `history/liquibase-rollback.md` — Liquibase v5 rollback gotchas
