import type { MediaType } from '@/lib/tmdb/types';

/**
 * Uniform contract every source provider implements. Adding one is a module in
 * providers/ added to the registry; a burned one is deleted just as easily.
 * see: docs/local/streaming-providers.md#architecture
 */
export interface StreamProvider {
    /** Stable id shown in the API response and in the user's preferred order. */
    name: string;
    /**
     * All playable sources, or an empty array when it cannot serve the title.
     * Fast-fail and no retries — fallback is the caller's business, and the user
     * picks the provider explicitly rather than a chain being tried.
     */
    resolve(request: ResolveRequest): Promise<StreamSource[]>;
}

/** What to resolve: TMDB ids plus TV coordinates (null for movies). */
export interface ResolveRequest {
    mediaType: MediaType;
    tmdbId: number;
    season: number | null;
    episode: number | null;
}

/** One playable result: the quality label the switcher shows, the URL, any
 * headers (Referer/Origin) the CDN demands — the proxy replays them, the browser
 * never can — and the format so the player knows which engine to load. */
export interface StreamSource {
    quality: string;
    url: string;
    headers: Record<string, string>;
    format: 'hls' | 'mp4';
}

export const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

/** Providers are gray-market and flaky: a slow one must not hold up the request. */
export async function fetchWithTimeout(
    url: string,
    init: RequestInit & { timeoutMs?: number } = {},
) {
    const { timeoutMs = 15_000, ...rest } = init;
    return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
}

export function qualityNumber(quality: string): number {
    const parsed = Number.parseInt(quality.replace('p', ''), 10);
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed; // "auto" sorts last
}
