# Subtitles

Captions come from OpenSubtitles, resolved server-side so the API key never
reaches the browser, and rendered by our own overlay rather than the player's
track pipeline.

## Why an overlay instead of `<Track>`

Vidstack's track store gates on media load state, and its native-renderer sync
kept forcing tracks back to `disabled` — setting the mode programmatically
reverted within about a second. `CaptionOverlay` reads
`useMediaState('currentTime')` and renders the active cue itself, which is
deterministic. It must live inside `MediaPlayer` to see the player context.

## Wire gotchas (all found the hard way, all still true)

- **Query params must be alphabetical.** The Kong gateway in front of the API
  301s any other ordering (`X-OS-Rule: canonical`), and the redirect drops the
  `Api-Key` header, so the retry looks like an auth failure.
- **`POST /download` blocks user-agent-less clients** (`kong-user-agent-block`) —
  a browser UA is required.
- **Search results carry no file extension**, so the format cannot be chosen by
  filename. Ask the download endpoint for `sub_format=vtt` instead; that also
  keeps ASS away.
- The consumer's **anonymous-downloads setting must stay on**, or downloads answer
  401 "missing token" — this backend is an anonymous key-only client.
- The download link is a one-shot CDN URL. Cache the **bytes**, never the link.

## Picking a file

Most-downloaded clean subtitle wins: hearing-impaired and machine-translated
entries are penalised, not banned, so a title with only HI subs still gets
captions rather than none.

## Caching

Files live in the `subtitle_cache` table keyed by OpenSubtitles' `file_id`, with a
30-day sweep. The previous stack cached them on disk (`backend/data/subtitles/`),
which cannot survive a serverless deploy — and the daily download quota is
5–10 files, so re-downloading is the one thing worth avoiding. Keying by
`file_id` means re-resolving a title that maps to the same file never downloads
again.

Responses carry `Cache-Control: private, max-age=3600`.

## Errors

Captions are an enhancement, so nothing here is fatal to playback: no key
configured → 503, quota exhausted (429) → 503, key rejected (401/403) → 503, no
match → 404, upstream unreachable → 502. The client turns any failure into "no
captions" without a toast.

## Delay stepper

Every subtitle file is timed to its own release, so a constant offset against a
different stream encode is normal. The stepper lives **inside the player's
settings menu**, passed through `DefaultVideoLayout`'s `slots` prop under
`settingsMenuItemsEnd` — a slot-attribute child is not collected and renders
inline in the player flow, squishing the video. Steps are half-second ticks
(clamped to ±10s) so the floats never drift, and the offset resets per
title/episode.
