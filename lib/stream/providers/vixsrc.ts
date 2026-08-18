import {
    BROWSER_UA,
    fetchWithTimeout,
    qualityNumber,
    type ResolveRequest,
    type StreamProvider,
    type StreamSource,
} from '../provider';

/**
 * vixsrc.to — vidsrc-style HLS. The API hands out a signed embed link, the embed
 * page exposes the playlist token, and the master playlist carries per-quality
 * renditions with embedded subtitles.
 * see: docs/local/streaming-providers.md#vixsrc-wire
 */

const BASE_URL = 'https://vixsrc.to';

/** The embed page writes these as JS assignments. The lookbehind on url matters:
 * window.streams also contains quoted "url" keys, and only the bare one is the
 * playlist. */
const TOKEN_PATTERN = /['"]token['"]\s*:\s*['"]([^'"]+)['"]/;
const EXPIRES_PATTERN = /['"]expires['"]\s*:\s*['"]([^'"]+)['"]/;
const URL_PATTERN = /(?<![\w'"])url\s*:\s*['"]([^'"]+)['"]/;
/** Master playlist renditions: each RESOLUTION line is followed by its variant. */
const RENDITION_PATTERN = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)[^\n]*\n([^\n]+)/g;

/** Tokens are epoch seconds; anything inside a 60s grace is treated as dead. */
function expired(expires: string): boolean {
    const value = Number.parseInt(expires, 10);
    if (Number.isNaN(value)) return true;
    return value * 1000 - 60_000 < Date.now();
}

/** Every CDN request under a source replays these — the browser cannot send a
 * Referer, the proxy can. */
function playbackHeaders(apiUrl: string): Record<string, string> {
    return { Referer: apiUrl, 'User-Agent': BROWSER_UA };
}

export const vixsrc: StreamProvider = {
    name: 'vixsrc',

    async resolve(request: ResolveRequest): Promise<StreamSource[]> {
        try {
            const apiPath =
                request.mediaType === 'movie'
                    ? `/api/movie/${request.tmdbId}`
                    : `/api/tv/${request.tmdbId}/${request.season}/${request.episode}`;
            const apiResponse = await fetchWithTimeout(BASE_URL + apiPath, {
                headers: {
                    'User-Agent': BROWSER_UA,
                    Accept: 'application/json, text/javascript, */*; q=0.01',
                    Referer: BASE_URL,
                    Origin: BASE_URL,
                },
                timeoutMs: 10_000,
            });
            if (!apiResponse.ok) return [];
            const { src } = (await apiResponse.json()) as { src?: string };
            if (!src) return [];

            // The src is single-use — a reused one answers 410 Gone, so it has to
            // be spent immediately inside this same resolve.
            const embedResponse = await fetchWithTimeout(BASE_URL + src, {
                headers: {
                    'User-Agent': BROWSER_UA,
                    Accept: 'text/html,application/xhtml+xml,*/*',
                    Referer: BASE_URL,
                },
                timeoutMs: 10_000,
            });
            if (!embedResponse.ok) return [];
            const html = await embedResponse.text();

            const token = TOKEN_PATTERN.exec(html)?.[1];
            const expires = EXPIRES_PATTERN.exec(html)?.[1];
            const playlist = URL_PATTERN.exec(html)?.[1];
            if (!token || !expires || !playlist || expired(expires)) return [];

            // h=1 marks the token-bearing request; the playlist call wants the API
            // url as its Referer.
            const clean = playlist.split(String.fromCharCode(92)).join('');
            const masterUrl = `${clean}${clean.includes('?') ? '&' : '?'}token=${token}&expires=${expires}&h=1`;
            const headers = playbackHeaders(BASE_URL + apiPath);
            const masterResponse = await fetchWithTimeout(masterUrl, {
                headers,
                timeoutMs: 10_000,
            });
            if (!masterResponse.ok) return [];
            const master = await masterResponse.text();

            const sources: StreamSource[] = [];
            for (const match of master.matchAll(RENDITION_PATTERN)) {
                sources.push({
                    quality: `${match[1]}p`,
                    url: new URL(match[2].trim(), masterUrl).toString(),
                    headers,
                    format: 'hls',
                });
            }
            if (sources.length === 0) {
                // No parseable renditions, but the master itself plays — hand it
                // over unlabelled rather than reporting nothing.
                return [{ quality: 'auto', url: masterUrl, headers, format: 'hls' }];
            }
            sources.sort((a, b) => qualityNumber(a.quality) - qualityNumber(b.quality));
            return sources;
        } catch (error) {
            // Fast-fail: the caller surfaces "no sources", nothing retries here.
            console.warn(`vixsrc resolve failed for tmdb ${request.tmdbId}`, error);
            return [];
        }
    },
};
