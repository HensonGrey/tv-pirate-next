import type { GenreInfo, MediaItem, MediaType, PageResponse, SeasonInfo } from '@/lib/tmdb/types';
import type { FavouriteRow } from '@/lib/favourites/service';

// Browser-side calls to our own routes. Same origin, so there is no axios
// instance, no withCredentials and no refresh interceptor — the session cookie
// rides along by itself. see: docs/decisions/auth.md

async function get<T>(path: string, params?: Record<string, string | number | undefined>) {
    const url = new URL(path, window.location.origin);
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
}

export function fetchTrending(window: 'day' | 'week' = 'day', page = 1) {
    return get<PageResponse<MediaItem>>('/api/tmdb/trending', { window, page });
}

export function fetchDiscover(type: MediaType, genres: string[] = [], page = 1) {
    return get<PageResponse<MediaItem>>('/api/tmdb/discover', {
        type,
        page,
        genres: genres.length > 0 ? genres.join(',') : undefined,
    });
}

export function searchTitles(query: string, page = 1) {
    return get<PageResponse<MediaItem>>('/api/tmdb/search', { query, page });
}

export function fetchTitleDetail(type: MediaType, id: number) {
    return get<MediaItem>(`/api/tmdb/${type}/${id}`);
}

export function fetchSeason(tvId: number, season: number) {
    return get<SeasonInfo>(`/api/tmdb/tv/${tvId}/season/${season}`);
}

export function fetchGenres() {
    return get<GenreInfo[]>('/api/tmdb/genres');
}

export function fetchFavourites() {
    return get<FavouriteRow[]>('/api/favourites');
}

export async function addFavourite(tmdbId: number, mediaType: MediaType) {
    const response = await fetch('/api/favourites', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tmdbId, mediaType }),
    });
    if (!response.ok) throw new Error(`add favourite answered ${response.status}`);
}

export async function removeFavourite(tmdbId: number, mediaType: MediaType) {
    const response = await fetch(`/api/favourites/${mediaType}/${tmdbId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`remove favourite answered ${response.status}`);
}

/** One playable source: the quality label, the format the player must expect,
 * and the proxied playback URL. */
export interface StreamSourceDto {
    quality: string;
    format: 'mp4' | 'hls';
    proxyUrl: string;
}

export function fetchStreamProviders() {
    return get<string[]>('/api/stream/providers');
}

/** Resolve exactly the named provider. Season/episode are omitted for movies. */
export function fetchSources(
    provider: string,
    type: MediaType,
    tmdbId: number,
    season?: number,
    episode?: number,
) {
    return get<StreamSourceDto[]>('/api/stream/sources', {
        provider,
        type,
        tmdbId,
        season,
        episode,
    });
}
