import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { TTL } from '@/lib/tmdb/client';
import { genres } from '@/lib/tmdb/service';

/** The selectable genre list, movie + tv tables merged. */
export const GET = protectedRoute(async () => cachedJson(await genres(), TTL.genres));
