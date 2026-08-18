import { NextResponse, type NextRequest } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { protectedRoute } from '@/lib/api/handler';
import { remove } from '@/lib/progress/service';
import { parseMediaType, parseTmdbId } from '@/lib/tmdb/params';

/** Title-level by default ("Start over"); episode-level when both coordinates
 * are given. One without the other would target nothing, so it is a 400. */
export const DELETE = protectedRoute(
    async (
        session,
        request: NextRequest,
        context: RouteContext<'/api/progress/[type]/[tmdbId]'>,
    ) => {
        const { type, tmdbId } = await context.params;
        const params = request.nextUrl.searchParams;
        const season = params.get('season');
        const episode = params.get('episode');
        if ((season === null) !== (episode === null)) {
            badRequest('season and episode must be set together');
        }
        await remove(
            session.user.id,
            parseMediaType(type),
            parseTmdbId(tmdbId),
            season === null ? null : Number(season),
            episode === null ? null : Number(episode),
        );
        return new NextResponse(null, { status: 204 });
    },
);
