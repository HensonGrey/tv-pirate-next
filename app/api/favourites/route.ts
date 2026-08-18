import { NextResponse, type NextRequest } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { protectedRoute } from '@/lib/api/handler';
import { add, list } from '@/lib/favourites/service';
import type { MediaType } from '@/lib/tmdb/types';

/** One shared list seeds every page's hearts. */
export const GET = protectedRoute(async (session) =>
    NextResponse.json(await list(session.user.id)),
);

/** Idempotent add — the optimistic toggle may replay it. */
export const PUT = protectedRoute(async (session, request: NextRequest) => {
    const body = await request.json().catch(() => null);
    const tmdbId = Number(body?.tmdbId);
    const mediaType = body?.mediaType;
    if (!Number.isInteger(tmdbId) || tmdbId < 1) badRequest('tmdbId is required');
    if (mediaType !== 'movie' && mediaType !== 'tv') badRequest('mediaType must be movie or tv');
    await add(session.user.id, tmdbId, mediaType as MediaType);
    return new NextResponse(null, { status: 204 });
});
