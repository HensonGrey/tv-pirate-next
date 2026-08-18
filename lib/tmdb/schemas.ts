import { z } from 'zod';

// TMDB's wire shapes. Every field is nullish on purpose: TMDB sends nulls where
// its docs imply numbers (total_pages is the known offender), and the previous
// stack shipped a bug for days because those nulls silently became zeros.
// Parsing here makes a shape change loud instead. see: docs/decisions/tmdb.md#jackson

const zeroIfMissing = z
    .number()
    .nullish()
    .transform((v) => v ?? 0);

export const tmdbEntrySchema = z.object({
    id: z.number(),
    media_type: z.string().nullish(),
    title: z.string().nullish(),
    name: z.string().nullish(),
    overview: z.string().nullish(),
    poster_path: z.string().nullish(),
    backdrop_path: z.string().nullish(),
    vote_average: zeroIfMissing,
    genre_ids: z.array(z.number()).nullish(),
    release_date: z.string().nullish(),
    first_air_date: z.string().nullish(),
});
export type TmdbEntry = z.infer<typeof tmdbEntrySchema>;

export function tmdbPageSchema<T extends z.ZodTypeAny>(item: T) {
    return z.object({
        page: zeroIfMissing,
        results: z
            .array(item)
            .nullish()
            .transform((v) => v ?? []),
        total_pages: zeroIfMissing,
        total_results: zeroIfMissing,
    });
}

export const genreEntrySchema = z.object({ id: z.number(), name: z.string() });
export type GenreEntry = z.infer<typeof genreEntrySchema>;

export const genreListSchema = z.object({
    genres: z
        .array(genreEntrySchema)
        .nullish()
        .transform((v) => v ?? []),
});

export const movieDetailSchema = z.object({
    id: z.number(),
    title: z.string().nullish(),
    overview: z.string().nullish(),
    poster_path: z.string().nullish(),
    backdrop_path: z.string().nullish(),
    vote_average: zeroIfMissing,
    genres: z
        .array(genreEntrySchema)
        .nullish()
        .transform((v) => v ?? []),
    release_date: z.string().nullish(),
    runtime: z.number().nullish(),
});

export const tvDetailSchema = z.object({
    id: z.number(),
    name: z.string().nullish(),
    overview: z.string().nullish(),
    poster_path: z.string().nullish(),
    backdrop_path: z.string().nullish(),
    vote_average: zeroIfMissing,
    genres: z
        .array(genreEntrySchema)
        .nullish()
        .transform((v) => v ?? []),
    first_air_date: z.string().nullish(),
    number_of_seasons: z.number().nullish(),
    number_of_episodes: z.number().nullish(),
    episode_run_time: z.array(z.number()).nullish(),
});

export const seasonDetailSchema = z.object({
    season_number: z.number().nullish(),
    name: z.string().nullish(),
    poster_path: z.string().nullish(),
    episodes: z
        .array(
            z.object({
                episode_number: z.number().nullish(),
                name: z.string().nullish(),
                overview: z.string().nullish(),
                still_path: z.string().nullish(),
                runtime: z.number().nullish(),
            }),
        )
        .nullish()
        .transform((v) => v ?? []),
});

export const imageConfigSchema = z.object({
    images: z
        .object({
            secure_base_url: z.string().nullish(),
            poster_sizes: z.array(z.string()).nullish(),
            backdrop_sizes: z.array(z.string()).nullish(),
        })
        .nullish(),
});
export type ImageSettings = NonNullable<z.infer<typeof imageConfigSchema>['images']>;

export const externalIdsSchema = z.object({ imdb_id: z.string().nullish() });
