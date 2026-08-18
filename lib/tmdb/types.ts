// The shapes our API speaks. Everything is nullable because TMDB's data is
// (missing posters, missing dates) and the UI decides how to present each gap.

export type MediaType = 'movie' | 'tv';

export interface MediaItem {
    id: number;
    mediaType: MediaType | null;
    title: string | null;
    overview: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    /** 0–10, one decimal; null when TMDB has no votes */
    rating: number | null;
    genres: string[];
    year: number | null;
    /** Movies only, minutes */
    runtimeMinutes: number | null;
    /** TV only */
    seasons: number | null;
    episodes: number | null;
}

export interface PageResponse<T> {
    page: number;
    results: T[];
    totalPages: number;
    totalResults: number;
}

/** One selectable genre row; each id exists only in its own media type's table. */
export interface GenreInfo {
    name: string;
    movieId: number | null;
    tvId: number | null;
}

export interface EpisodeInfo {
    episodeNumber: number | null;
    name: string | null;
    overview: string | null;
    runtimeMinutes: number | null;
}

export interface SeasonInfo {
    seasonNumber: number | null;
    name: string | null;
    posterUrl: string | null;
    episodes: EpisodeInfo[];
}
