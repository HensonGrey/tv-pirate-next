import { type NextRequest } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { protectedRoute } from '@/lib/api/handler';
import { resolveSubtitle } from '@/lib/subtitles/service';
import { parseMediaType, parseTmdbId } from '@/lib/tmdb/params';

/** Language codes only — anything else is a typo, not a search. */
const LANG_PATTERN = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/** One VTT track per title or episode, resolved and cached server-side so the
 * OpenSubtitles key never reaches the browser. A miss just means the player runs
 * without captions. see: docs/decisions/subtitles.md */
export const GET = protectedRoute(async (_session, request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const mediaType = parseMediaType(params.get('type'));
    const tmdbId = parseTmdbId(params.get('tmdbId') ?? '');
    const season = params.get('season') === null ? null : Number(params.get('season'));
    const episode = params.get('episode') === null ? null : Number(params.get('episode'));
    if (mediaType === 'tv' && (season === null || episode === null)) {
        badRequest('season and episode are required for tv');
    }
    const lang = params.get('lang') ?? 'en';
    if (!LANG_PATTERN.test(lang)) badRequest('lang must be an ISO 639 code like en or pt-BR');

    const vtt = await resolveSubtitle(mediaType, tmdbId, season, episode, lang);
    return new Response(vtt, {
        headers: {
            'content-type': 'text/vtt; charset=utf-8',
            // One hour: re-resolving the same episode only touches the cache table.
            'cache-control': 'private, max-age=3600',
        },
    });
});
