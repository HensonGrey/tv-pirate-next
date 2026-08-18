import { badRequest } from '@/lib/api/errors';
import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { TTL } from '@/lib/tmdb/client';
import { parseMediaType, parseSeason, parseTmdbId } from '@/lib/tmdb/params';
import { seasonEpisodes } from '@/lib/tmdb/service';

/** One season of a show — the episode list feeding the picker. Lives under the
 * shared [type] segment because a literal "tv" folder would shadow it for
 * /api/tmdb/tv/{id} (the App Router does not fall back to a dynamic sibling). */
export const GET = protectedRoute(
    async (
        _session,
        _request: Request,
        context: RouteContext<'/api/tmdb/[type]/[id]/season/[season]'>,
    ) => {
        const { type, id, season } = await context.params;
        if (parseMediaType(type) !== 'tv') badRequest('seasons only exist for tv');
        return cachedJson(await seasonEpisodes(parseTmdbId(id), parseSeason(season)), TTL.detail);
    },
);
