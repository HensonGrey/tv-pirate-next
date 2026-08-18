import { NextResponse, type NextRequest } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { protectedRoute } from '@/lib/api/handler';
import { resolveSources } from '@/lib/stream/registry';
import { seal } from '@/lib/stream/token';
import { parseMediaType, parseTmdbId } from '@/lib/tmdb/params';

/** Resolve exactly the named provider. Each source comes back as a proxied URL —
 * the real one and its referer headers never leave the server.
 * see: docs/local/streaming-providers.md#architecture */
export const GET = protectedRoute(async (_session, request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const provider = params.get('provider');
    if (!provider) badRequest('provider is required');
    const mediaType = parseMediaType(params.get('type'));
    const tmdbId = parseTmdbId(params.get('tmdbId') ?? '');
    const season = params.get('season') === null ? null : Number(params.get('season'));
    const episode = params.get('episode') === null ? null : Number(params.get('episode'));
    if (mediaType === 'tv' && (season === null || episode === null)) {
        badRequest('season and episode are required for tv');
    }

    const sources = await resolveSources(provider, { mediaType, tmdbId, season, episode });
    return NextResponse.json(
        sources.map((source) => ({
            quality: source.quality,
            format: source.format,
            proxyUrl: `/api/stream/proxy/${seal({ url: source.url, headers: source.headers })}`,
        })),
        // Sources hold short-lived upstream tokens; never let a browser reuse them.
        { headers: { 'cache-control': 'no-store' } },
    );
});
