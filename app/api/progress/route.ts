import { NextResponse, type NextRequest } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { protectedRoute } from '@/lib/api/handler';
import { list, upsert } from '@/lib/progress/service';
import type { MediaType } from '@/lib/tmdb/types';

/** All saved positions for the caller, newest first. */
export const GET = protectedRoute(async (session) =>
    NextResponse.json(await list(session.user.id), {
        headers: { 'cache-control': 'no-store' },
    }),
);

/**
 * One heartbeat. This stays a route handler rather than a server action: actions
 * serialise per client, so playback heartbeats would queue behind UI mutations
 * and lose positions. see: docs/decisions/watch-progress.md#cadence
 */
export const PUT = protectedRoute(async (session, request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const mediaType = body?.mediaType;
    if (mediaType !== 'movie' && mediaType !== 'tv') badRequest('mediaType must be movie or tv');
    const tmdbId = Number(body?.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId < 1) badRequest('tmdbId is required');
    const season = body?.season == null ? null : Number(body.season);
    const episode = body?.episode == null ? null : Number(body.episode);
    if (mediaType === 'tv' && (season == null || episode == null)) {
        badRequest('season and episode are required for tv');
    }
    const progressSeconds = Number(body?.progressSeconds);
    if (!Number.isFinite(progressSeconds) || progressSeconds < 0) {
        badRequest('progressSeconds must be >= 0');
    }
    const durationSeconds = body?.durationSeconds == null ? null : Number(body.durationSeconds);
    if (durationSeconds != null && durationSeconds <= 0) {
        badRequest('durationSeconds must be > 0');
    }

    await upsert(session.user.id, {
        tmdbId,
        mediaType: mediaType as MediaType,
        season,
        episode,
        progressSeconds: Math.floor(progressSeconds),
        durationSeconds: durationSeconds == null ? null : Math.floor(durationSeconds),
    });
    return new NextResponse(null, { status: 204 });
});
