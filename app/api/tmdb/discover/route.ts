import type { NextRequest } from 'next/server';
import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { TTL } from '@/lib/tmdb/client';
import { parseGenres, parseMediaType, parsePage } from '@/lib/tmdb/params';
import { discover } from '@/lib/tmdb/service';

/** Popularity-sorted movies or tv, narrowed by genre names (OR semantics). */
export const GET = protectedRoute(async (_session, request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const type = parseMediaType(params.get('type'));
    const genres = parseGenres(params.get('genres'));
    const page = parsePage(params.get('page'));
    return cachedJson(await discover(type, genres, page), TTL.list);
});
