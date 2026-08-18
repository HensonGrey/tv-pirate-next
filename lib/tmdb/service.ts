import { unstable_cache } from 'next/cache';
import * as tmdb from './client';
import type { GenreEntry, ImageSettings, TmdbEntry } from './schemas';
import type {
    EpisodeInfo,
    GenreInfo,
    MediaItem,
    MediaType,
    PageResponse,
    SeasonInfo,
} from './types';

// Between the raw client and the routes: maps entries to MediaItems, fills TMDB's
// gaps (genre names, image URLs, years) and applies the ranking rules. Server
// components import this directly; the route handlers wrap the same calls.

/** Sizes we ask the image CDN for (must exist in TMDB's configuration). */
const POSTER_SIZE = 'w500';
const BACKDROP_SIZE = 'w1280';

/** Trending re-ranked by rating: best-rated first, no-votes-yet at the bottom.
 * Sorted within the fetched page — a global ranking would need all 500 pages.
 * see: docs/decisions/tmdb.md#trending-sort */
async function trendingUncached(window: string, page: number): Promise<PageResponse<MediaItem>> {
    const raw = await tmdb.trendingAll(window, page);
    const mapped = await mapPage(raw, null);
    const sorted = [...mapped.results].sort((a, b) => {
        if (a.rating === b.rating) return 0;
        if (a.rating === null) return 1;
        if (b.rating === null) return -1;
        return b.rating - a.rating;
    });
    return { ...mapped, results: sorted };
}

/** Popularity-sorted movies or tv, narrowed by genre names. Unknown names are
 * dropped; if none resolve, the answer is empty rather than unfiltered. */
async function discoverUncached(
    type: MediaType,
    genreNames: string[],
    page: number,
): Promise<PageResponse<MediaItem>> {
    let genreIdsCsv: string | undefined;
    if (genreNames.length > 0) {
        const table = await tmdb.genreTable(type);
        const byName = new Map(table.map((g) => [g.name.toLowerCase(), g.id]));
        const resolved = [...new Set(genreNames)]
            .map((name) => byName.get(name.trim().toLowerCase()))
            .filter((id): id is number => id !== undefined);
        if (resolved.length === 0) return { page, results: [], totalPages: 0, totalResults: 0 };
        genreIdsCsv = resolved.join(',');
    }
    return mapPage(await tmdb.discover(type, genreIdsCsv, page), type);
}

/** Title search: one page from each type index, interleaved so both stay visible
 * and each keeps its own relevance order. see: docs/decisions/tmdb.md#search */
async function searchUncached(query: string, page: number): Promise<PageResponse<MediaItem>> {
    const trimmed = query.trim();
    const [movies, shows, images, lookup] = await Promise.all([
        tmdb.searchMovies(trimmed, page),
        tmdb.searchShows(trimmed, page),
        tmdb.imageConfig(),
        genreLookup(),
    ]);
    // Per-type results carry no media_type — the requested type wins.
    const movieItems = movies.results.map((entry) => toItem(entry, 'movie', lookup, images));
    const showItems = shows.results.map((entry) => toItem(entry, 'tv', lookup, images));
    const merged: MediaItem[] = [];
    for (let i = 0; i < Math.max(movieItems.length, showItems.length); i++) {
        if (i < movieItems.length) merged.push(movieItems[i]);
        if (i < showItems.length) merged.push(showItems[i]);
    }
    return {
        page,
        results: merged,
        totalPages: Math.max(movies.total_pages, shows.total_pages),
        totalResults: movies.total_results + shows.total_results,
    };
}

/** Full detail for one title: runtime for movies, seasons/episodes for tv. */
async function detailUncached(type: MediaType, id: number): Promise<MediaItem> {
    const images = await tmdb.imageConfig();
    if (type === 'tv') {
        const tv = await tmdb.tvDetail(id);
        const runtime =
            tv.episode_run_time && tv.episode_run_time.length > 0 ? tv.episode_run_time[0] : null;
        return {
            id: tv.id,
            mediaType: 'tv',
            title: tv.name ?? null,
            overview: tv.overview ?? null,
            posterUrl: imageUrl(images, POSTER_SIZE, tv.poster_path),
            backdropUrl: imageUrl(images, BACKDROP_SIZE, tv.backdrop_path),
            rating: rating(tv.vote_average),
            genres: tv.genres.map((g) => g.name),
            year: year(tv.first_air_date),
            runtimeMinutes: runtime,
            seasons: tv.number_of_seasons ?? null,
            episodes: tv.number_of_episodes ?? null,
        };
    }
    const movie = await tmdb.movieDetail(id);
    return {
        id: movie.id,
        mediaType: 'movie',
        title: movie.title ?? null,
        overview: movie.overview ?? null,
        posterUrl: imageUrl(images, POSTER_SIZE, movie.poster_path),
        backdropUrl: imageUrl(images, BACKDROP_SIZE, movie.backdrop_path),
        rating: rating(movie.vote_average),
        genres: movie.genres.map((g) => g.name),
        year: year(movie.release_date),
        runtimeMinutes: movie.runtime ?? null,
        seasons: null,
        episodes: null,
    };
}

/** One season: identity + poster for the picker, and the episode list it selects from. */
async function seasonEpisodesUncached(tvId: number, season: number): Promise<SeasonInfo> {
    const [season_, images] = await Promise.all([tmdb.tvSeason(tvId, season), tmdb.imageConfig()]);
    const episodes: EpisodeInfo[] = season_.episodes.map((ep) => ({
        episodeNumber: ep.episode_number ?? null,
        name: ep.name ?? null,
        overview: ep.overview ?? null,
        runtimeMinutes: ep.runtime ?? null,
    }));
    return {
        seasonNumber: season_.season_number ?? null,
        name: season_.name ?? null,
        posterUrl: imageUrl(images, POSTER_SIZE, season_.poster_path),
        episodes,
    };
}

/** The selectable genre list: movie + tv tables merged into one row per name,
 * alphabetical. Each id only exists in its own type's table. */
async function genresUncached(): Promise<GenreInfo[]> {
    const [movieTable, tvTable] = await Promise.all([
        tmdb.genreTable('movie'),
        tmdb.genreTable('tv'),
    ]);
    const merged = new Map<string, GenreInfo>();
    for (const entry of movieTable) {
        merged.set(entry.name.toLowerCase(), { name: entry.name, movieId: entry.id, tvId: null });
    }
    for (const entry of tvTable) {
        const existing = merged.get(entry.name.toLowerCase());
        if (existing) existing.tvId = entry.id;
        else {
            merged.set(entry.name.toLowerCase(), {
                name: entry.name,
                movieId: null,
                tvId: entry.id,
            });
        }
    }
    return [...merged.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    );
}

// --- Mapping helpers ---

async function mapPage(
    raw: tmdb.TmdbPage,
    fallbackType: MediaType | null,
): Promise<PageResponse<MediaItem>> {
    const [images, lookup] = await Promise.all([tmdb.imageConfig(), genreLookup()]);
    return {
        page: raw.page,
        results: raw.results.map((entry) => toItem(entry, fallbackType, lookup, images)),
        totalPages: raw.total_pages,
        totalResults: raw.total_results,
    };
}

/** List entry to MediaItem. Mixed endpoints carry media_type on the entry;
 * discover and search fall back to the requested type. */
function toItem(
    entry: TmdbEntry,
    fallbackType: MediaType | null,
    lookup: GenreLookup,
    images: ImageSettings | null,
): MediaItem {
    const type = (entry.media_type ?? fallbackType) as MediaType | null;
    const isTv = type === 'tv';
    const title = (isTv ? entry.name : entry.title) ?? entry.name ?? entry.title ?? null;
    return {
        id: entry.id,
        mediaType: type,
        title,
        overview: entry.overview ?? null,
        posterUrl: imageUrl(images, POSTER_SIZE, entry.poster_path),
        backdropUrl: imageUrl(images, BACKDROP_SIZE, entry.backdrop_path),
        rating: rating(entry.vote_average),
        genres: genreNames(entry.genre_ids, type, lookup),
        year: year(isTv ? entry.first_air_date : entry.release_date),
        runtimeMinutes: null,
        seasons: null,
        episodes: null,
    };
}

interface GenreLookup {
    movie: Map<number, string>;
    tv: Map<number, string>;
}

/** id to name for both tables, so an entry's ids resolve against its own type. */
async function genreLookup(): Promise<GenreLookup> {
    const [movie, tv] = await Promise.all([tmdb.genreTable('movie'), tmdb.genreTable('tv')]);
    return {
        movie: new Map(movie.map((g: GenreEntry) => [g.id, g.name])),
        tv: new Map(tv.map((g: GenreEntry) => [g.id, g.name])),
    };
}

function genreNames(
    ids: number[] | null | undefined,
    type: MediaType | null,
    lookup: GenreLookup,
): string[] {
    if (!ids || ids.length === 0) return [];
    const table = type === 'tv' ? lookup.tv : lookup.movie;
    const names = ids.map((id) => table.get(id)).filter((name): name is string => Boolean(name));
    return [...new Set(names)];
}

/** vote_average is 0-10 with a decimal of noise; 0 means "no votes" so null. */
function rating(voteAverage: number): number | null {
    if (voteAverage <= 0) return null;
    return Math.round(voteAverage * 10) / 10;
}

/** "2024-03-01" gives 2024, or null when the date is missing or broken. */
function year(date: string | null | undefined): number | null {
    if (!date || date.length < 4) return null;
    const parsed = Number.parseInt(date.slice(0, 4), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

/** Path plus CDN settings to a full URL, or null when either side is missing. */
function imageUrl(
    images: ImageSettings | null,
    size: string,
    path: string | null | undefined,
): string | null {
    if (!images?.secure_base_url || !path) return null;
    return images.secure_base_url + size + path;
}

// --- Cached entry points ---
// The client caches TMDB's raw answers; these cache the *mapped* result, so genre
// resolution, image URLs and rating rounding do not re-run per request either.
// Same TTLs the previous stack's @Cacheable methods used.
// see: docs/decisions/tmdb.md

export const trending = unstable_cache(trendingUncached, ['tmdb-trending'], {
    revalidate: tmdb.TTL.list,
});

export const discover = unstable_cache(discoverUncached, ['tmdb-discover'], {
    revalidate: tmdb.TTL.list,
});

export const search = unstable_cache(searchUncached, ['tmdb-search'], {
    revalidate: tmdb.TTL.list,
});

export const detail = unstable_cache(detailUncached, ['tmdb-detail'], {
    revalidate: tmdb.TTL.detail,
});

export const seasonEpisodes = unstable_cache(seasonEpisodesUncached, ['tmdb-season'], {
    revalidate: tmdb.TTL.detail,
});

export const genres = unstable_cache(genresUncached, ['tmdb-genres'], {
    revalidate: tmdb.TTL.genres,
});
