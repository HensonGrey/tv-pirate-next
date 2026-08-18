import type { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import {
    externalIdsSchema,
    genreListSchema,
    imageConfigSchema,
    movieDetailSchema,
    seasonDetailSchema,
    tmdbEntrySchema,
    tmdbPageSchema,
    tvDetailSchema,
    type GenreEntry,
    type ImageSettings,
} from './schemas';

// The only module that knows TMDB's wire format. If TMDB changes their JSON,
// this file and schemas.ts are the only ones that move.

const BASE_URL = 'https://api.themoviedb.org/3';

/** Same TTLs the previous stack gave its Caffeine caches — lists go stale fast,
 * episode tables and genre ids effectively never do. */
export const TTL = {
    list: 600, // 10 min
    detail: 86_400, // 24 h
    genres: 86_400,
    imageConfig: 604_800, // 7 days
} as const;

const pageSchema = tmdbPageSchema(tmdbEntrySchema);
export type TmdbPage = z.infer<typeof pageSchema>;

async function get<S extends z.ZodTypeAny>(
    path: string,
    params: Record<string, string | number | undefined>,
    schema: S,
    revalidate: number,
): Promise<z.infer<S>> {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
        response = await fetch(url, {
            headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` },
            next: { revalidate },
        });
    } catch (error) {
        console.warn('TMDB call failed', error);
        throw new ApiError(502, 'TMDB is unreachable — try again shortly');
    }

    if (!response.ok) {
        // Log the upstream status, hand the client a generic message.
        console.warn(`TMDB answered with status ${response.status} for ${path}`);
        if (response.status === 404) throw new ApiError(404, 'Title not found on TMDB');
        throw new ApiError(502, 'TMDB is not answering right now — try again shortly');
    }

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
        // A shape change is a real failure, not something to paper over with defaults.
        console.error(`TMDB response did not match the schema for ${path}`, parsed.error.issues);
        throw new ApiError(502, 'TMDB sent something unexpected — try again shortly');
    }
    return parsed.data;
}

/** GET /trending/all/{window} — mixed movies + shows, sorted by popularity. */
export function trendingAll(window: string, page: number) {
    return get(`/trending/all/${window}`, { page }, pageSchema, TTL.list);
}

/** Per-type search: /search/multi's people results bury the titles for short
 * queries. see: docs/decisions/tmdb.md#search */
export function searchMovies(query: string, page: number) {
    return get('/search/movie', { query, page }, pageSchema, TTL.list);
}

export function searchShows(query: string, page: number) {
    return get('/search/tv', { query, page }, pageSchema, TTL.list);
}

/** Popularity-sorted, optionally narrowed to comma-separated genre ids. */
export function discover(type: string, genreIdsCsv: string | undefined, page: number) {
    return get(
        `/discover/${type}`,
        { sort_by: 'popularity.desc', with_genres: genreIdsCsv, page },
        pageSchema,
        TTL.list,
    );
}

export function movieDetail(id: number) {
    return get(`/movie/${id}`, {}, movieDetailSchema, TTL.detail);
}

export function tvDetail(id: number) {
    return get(`/tv/${id}`, {}, tvDetailSchema, TTL.detail);
}

export function tvSeason(id: number, season: number) {
    return get(`/tv/${id}/season/${season}`, {}, seasonDetailSchema, TTL.detail);
}

/** The IMDb id providers like videasy want (used from batch 6). */
export async function imdbId(type: string, id: number): Promise<string | null> {
    const response = await get(`/${type}/${id}/external_ids`, {}, externalIdsSchema, TTL.detail);
    return response.imdb_id ?? null;
}

export async function genreTable(type: string): Promise<GenreEntry[]> {
    const response = await get(`/genre/${type}/list`, {}, genreListSchema, TTL.genres);
    return response.genres;
}

export async function imageConfig(): Promise<ImageSettings | null> {
    const response = await get('/configuration', {}, imageConfigSchema, TTL.imageConfig);
    return response.images ?? null;
}
