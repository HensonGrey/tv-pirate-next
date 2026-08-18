import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { watchProgress } from '@/db/schema';
import type { MediaType } from '@/lib/tmdb/types';

/** One saved playback position. */
export interface ProgressRow {
    tmdbId: number;
    mediaType: MediaType;
    season: number | null;
    episode: number | null;
    progressSeconds: number;
    durationSeconds: number | null;
    updatedAt: string;
}

export interface SaveProgressInput {
    tmdbId: number;
    mediaType: MediaType;
    season?: number | null;
    episode?: number | null;
    progressSeconds: number;
    durationSeconds?: number | null;
}

/** Newest first — the client picks the winning row per title. */
export async function list(userId: string): Promise<ProgressRow[]> {
    const rows = await db
        .select()
        .from(watchProgress)
        .where(eq(watchProgress.userId, userId))
        .orderBy(desc(watchProgress.updatedAt));
    return rows.map((row) => ({
        tmdbId: row.tmdbId,
        mediaType: row.mediaType as MediaType,
        season: row.seasonNumber,
        episode: row.episodeNumber,
        progressSeconds: row.progressSeconds,
        durationSeconds: row.durationSeconds,
        updatedAt: row.updatedAt.toISOString(),
    }));
}

/**
 * Last-write-wins upsert, with no monotonic guard on purpose: progress only grows
 * inside one viewing session, and a rewatch starts near zero and has to be able
 * to overwrite a mid-episode value.
 *
 * The conflict targets are the two partial indexes, so each needs its predicate
 * spelled out — naming the columns alone would not match either index and would
 * silently insert duplicates.
 * see: docs/decisions/watch-progress.md#schema
 */
export async function upsert(userId: string, input: SaveProgressInput): Promise<void> {
    // Sub-5-second plays are accidental opens, not viewing. Never create a row.
    if (input.progressSeconds < 5) return;

    const isTv = input.mediaType === 'tv';
    // Movie coordinates are normalised away regardless of what the client sent.
    const seasonNumber = isTv ? (input.season ?? null) : null;
    const episodeNumber = isTv ? (input.episode ?? null) : null;
    const values = {
        userId,
        tmdbId: input.tmdbId,
        mediaType: input.mediaType,
        seasonNumber,
        episodeNumber,
        progressSeconds: input.progressSeconds,
        durationSeconds: input.durationSeconds ?? null,
        updatedAt: new Date(),
    };
    const set = {
        progressSeconds: values.progressSeconds,
        durationSeconds: values.durationSeconds,
        updatedAt: values.updatedAt,
    };

    if (isTv) {
        await db
            .insert(watchProgress)
            .values(values)
            .onConflictDoUpdate({
                target: [
                    watchProgress.userId,
                    watchProgress.tmdbId,
                    watchProgress.seasonNumber,
                    watchProgress.episodeNumber,
                ],
                targetWhere: isNotNull(watchProgress.seasonNumber),
                set,
            });
        return;
    }
    await db
        .insert(watchProgress)
        .values(values)
        .onConflictDoUpdate({
            target: [watchProgress.userId, watchProgress.tmdbId],
            targetWhere: isNull(watchProgress.seasonNumber),
            set,
        });
}

/** With season+episode: one episode's row. Without: every row for the title, so
 * "Start over" on a show restarts it at S1E1 rather than resuming a different
 * episode next visit. see: docs/decisions/watch-progress.md#start-over */
export async function remove(
    userId: string,
    mediaType: MediaType,
    tmdbId: number,
    season?: number | null,
    episode?: number | null,
): Promise<void> {
    const base = and(
        eq(watchProgress.userId, userId),
        eq(watchProgress.tmdbId, tmdbId),
        eq(watchProgress.mediaType, mediaType),
    );
    if (mediaType === 'tv' && season != null && episode != null) {
        await db
            .delete(watchProgress)
            .where(
                and(
                    base,
                    eq(watchProgress.seasonNumber, season),
                    eq(watchProgress.episodeNumber, episode),
                ),
            );
        return;
    }
    await db.delete(watchProgress).where(base);
}
