import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { TTL } from '@/lib/tmdb/client';
import { parseMediaType, parseTmdbId } from '@/lib/tmdb/params';
import { detail } from '@/lib/tmdb/service';

/** Full detail for one title: runtime for movies, seasons/episodes for tv. */
export const GET = protectedRoute(
    async (_session, _request: Request, context: RouteContext<'/api/tmdb/[type]/[id]'>) => {
        const { type, id } = await context.params;
        return cachedJson(await detail(parseMediaType(type), parseTmdbId(id)), TTL.detail);
    },
);
