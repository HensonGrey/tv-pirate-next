# Design reference — captured from the live React + Spring stack

Captured 2026-08-18 from the running stack (frontend :5173, backend :8080) with Playwright MCP,
**before** any Next.js code was written. These are the parity targets: the migrated UI must be
visually identical to these captures.

## Captures

| File | State | Viewport |
|---|---|---|
| `01-login-1920.png` | Login / guest view (light theme) | 1920×1080 |
| `02-guest-confirm-dialog.png` | "Continue as guest?" AlertDialog | 1920×1080 |
| `03-home-trending-light-1920.png` | Home, Trending tab, **full page** (light) | 1920×1080 |
| `04-home-trending-dark-1920.png` | Home, Trending tab (dark) | 1920×1080 |
| `05-media-modal-dark.png` | Media detail modal (movie, with runtime + genres + Watch) | 1920×1080 |
| `06-home-genres-dark.png` | Genres tab with chip row (2 rows of chips at 1920) | 1920×1080 |
| `07-home-library-empty-dark.png` | Library tab, empty state ("No treasure yet") | 1920×1080 |
| `08-watch-tv-dark-1920.png` | Watch page, TV (season chips, episode grid, Now playing, provider chips) | 1920×1080 |
| `09-watch-movie-dark-1920.png` | Watch page, movie (About panel instead of seasons) | 1920×1080 |
| `10-watch-movie-dark-1366x680.png` | Watch page at the documented laptop height | 1366×680 |
| `11-watch-movie-dark-390.png` | Watch page, mobile (stacked) | 390×844 |
| `12-home-dark-390.png` | Home, mobile (icon-only tab strip, 2-col grid) | 390×844 |
| `13-home-search-dexter-dark.png` | Search results — includes the **poster fallback** (gradient + initial + type badge) | 1920×1080 |

## Measured constraints (acceptance criteria, not opinions)

- **Watch page fits without scrolling.** Verified live at 1366×680: `document.documentElement.scrollHeight === window.innerHeight === 680`. The Next.js rebuild must reproduce this (the dvh-based width calc on `main` is what achieves it).
- **Home grid columns:** 2 / 3 / 4 / 5 / 6 at `base / sm / md / lg / xl`.
- **Player:** 16:9 below `lg`; from `lg` the surface is pinned to `calc(100dvh - 230px)` and the video letterboxes inside.
- **Picker card:** 280px wide at `sm`, 360px at `lg`, sections split by hairlines, panel fits content (does not stretch).
- **Search:** results appear from 3 characters, 350ms debounce, movies and shows interleaved into separate labelled sections.

## Where the visual system lives (ports verbatim)

- `frontend/src/index.css` — 161 lines, ~109 custom properties: the whole palette (incl. `--gold` / `--gold-foreground`), radii, and the two font families (`--font-heading` Outfit, `--font-sans` Manrope). Tailwind v4 uses the same CSS-first token approach in Next.js, so this file moves across unchanged.
- `frontend/src/components/ui/*` — shadcn components (base-ui variants). Move unchanged.
- Fonts come from `@fontsource-variable/outfit` + `@fontsource-variable/manrope` (self-hosted, no Google Fonts request) — keep these rather than switching to `next/font`, so rendering is byte-identical.

## Not yet captured (capture when the feature is rebuilt)

- Library tab **populated** (continue-watching cards with progress bars + favourites) — needs watch history.
- Modal with a **progress bar + "Start over"** — needs saved progress.
- Captions on screen + the subtitle-delay stepper inside the player settings menu.
- Error states: "Shore leave — the signal's down" (fetch failure), "No treasure found" (empty results).
