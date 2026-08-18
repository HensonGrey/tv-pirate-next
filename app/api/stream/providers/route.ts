import { cachedJson, protectedRoute } from '@/lib/api/handler';
import { providerNames } from '@/lib/stream/registry';

/** The picker list, sorted so the UI shows a stable order between visits. */
export const GET = protectedRoute(async () => cachedJson(providerNames(), 300));
