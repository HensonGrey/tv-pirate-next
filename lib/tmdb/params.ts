import { badRequest } from '@/lib/api/errors';
import type { MediaType } from './types';

// Request validation shared by the tmdb routes — same rules and same 400s the
// previous controller enforced.

/** TMDB caps results at 500 pages. */
const MAX_PAGE = 500;

export function parsePage(raw: string | null): number {
    const page = raw === null || raw === '' ? 1 : Number(raw);
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
        badRequest(`page must be between 1 and ${MAX_PAGE}`);
    }
    return page;
}

export function parseMediaType(raw: string | null): MediaType {
    if (raw !== 'movie' && raw !== 'tv') badRequest('type must be movie or tv');
    return raw;
}

export function parseWindow(raw: string | null): string {
    const window = raw === null || raw === '' ? 'day' : raw;
    if (window !== 'day' && window !== 'week') badRequest('window must be day or week');
    return window;
}

export function parseSeason(raw: string): number {
    const season = Number(raw);
    if (!Number.isInteger(season) || season < 1 || season > 100) {
        badRequest('season must be between 1 and 100');
    }
    return season;
}

export function parseTmdbId(raw: string): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) badRequest('id must be a positive integer');
    return id;
}

export function parseQuery(raw: string | null): string {
    if (raw === null || raw.trim() === '') badRequest('query is required');
    return raw;
}

/** Comma-separated genre names; blanks dropped. */
export function parseGenres(raw: string | null): string[] {
    if (raw === null || raw === '') return [];
    return raw
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');
}
