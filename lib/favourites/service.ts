import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { favourites } from '@/db/schema';
import type { MediaType } from '@/lib/tmdb/types';

/** One saved favourite: the title's identity in both TMDB id spaces. */
export interface FavouriteRow {
    tmdbId: number;
    mediaType: MediaType;
}

export async function list(userId: string): Promise<FavouriteRow[]> {
    const rows = await db
        .select({ tmdbId: favourites.tmdbId, mediaType: favourites.mediaType })
        .from(favourites)
        .where(eq(favourites.userId, userId))
        .orderBy(asc(favourites.createdAt));
    return rows.map((row) => ({ tmdbId: row.tmdbId, mediaType: row.mediaType as MediaType }));
}

/** Idempotent: the UI fires these optimistically and may retry, so a replay
 * must not duplicate or error. ON CONFLICT closes the concurrent-first-add race
 * the previous stack left open. see: docs/decisions/favourites.md#optimistic-revert */
export async function add(userId: string, tmdbId: number, mediaType: MediaType) {
    await db.insert(favourites).values({ userId, tmdbId, mediaType }).onConflictDoNothing();
}

export async function remove(userId: string, tmdbId: number, mediaType: MediaType) {
    await db
        .delete(favourites)
        .where(
            and(
                eq(favourites.userId, userId),
                eq(favourites.tmdbId, tmdbId),
                eq(favourites.mediaType, mediaType),
            ),
        );
}
