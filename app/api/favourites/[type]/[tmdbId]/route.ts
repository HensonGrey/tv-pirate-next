import { NextResponse } from 'next/server';
import { protectedRoute } from '@/lib/api/handler';
import { remove } from '@/lib/favourites/service';
import { parseMediaType, parseTmdbId } from '@/lib/tmdb/params';

/** Idempotent remove — a missing row is not an error. */
export const DELETE = protectedRoute(
    async (
        session,
        _request: Request,
        context: RouteContext<'/api/favourites/[type]/[tmdbId]'>,
    ) => {
        const { type, tmdbId } = await context.params;
        await remove(session.user.id, parseTmdbId(tmdbId), parseMediaType(type));
        return new NextResponse(null, { status: 204 });
    },
);
