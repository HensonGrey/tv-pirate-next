import type { NextRequest } from 'next/server';
import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { TTL } from '@/lib/tmdb/client';
import { parsePage, parseQuery } from '@/lib/tmdb/params';
import { search } from '@/lib/tmdb/service';

/** Title search across movies + shows (people never enter the results). */
export const GET = protectedRoute(async (_session, request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const query = parseQuery(params.get('query'));
    const page = parsePage(params.get('page'));
    return cachedJson(await search(query, page), TTL.list);
});
