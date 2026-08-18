import type { NextRequest } from 'next/server';
import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { TTL } from '@/lib/tmdb/client';
import { parsePage, parseWindow } from '@/lib/tmdb/params';
import { trending } from '@/lib/tmdb/service';

/** Mixed movies + shows trending right now, re-ranked by rating. */
export const GET = protectedRoute(async (_session, request: NextRequest) => {
    const params = request.nextUrl.searchParams;
    const window = parseWindow(params.get('window'));
    const page = parsePage(params.get('page'));
    return cachedJson(await trending(window, page), TTL.list);
});
