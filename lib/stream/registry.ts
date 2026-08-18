import { unstable_cache } from 'next/cache';
import { ApiError } from '@/lib/api/errors';
import type { ResolveRequest, StreamProvider, StreamSource } from './provider';
import { videasy } from './providers/videasy';
import { vixsrc } from './providers/vixsrc';

/**
 * The provider list. Registration is this array — Spring injected every
 * @Component implementing the interface; here it is explicit, which also fixes
 * the order the picker shows.
 * see: docs/local/streaming-providers.md#architecture
 */
const PROVIDERS: StreamProvider[] = [videasy, vixsrc];

export function providerNames(): string[] {
    return PROVIDERS.map((provider) => provider.name).sort();
}

/** Resolve exactly the named provider — no health checks, no fallback chains.
 * The user picks a provider and a broken one is removed by hand, which is the
 * flow decided for the previous stack and kept here. */
async function resolveUncached(provider: string, request: ResolveRequest): Promise<StreamSource[]> {
    const impl = PROVIDERS.find((candidate) => candidate.name === provider);
    if (!impl) throw new ApiError(400, `unknown provider: ${provider}`);
    return impl.resolve(request);
}

/**
 * Five minutes, so a re-click does not re-hammer an upstream — and empty results
 * are cached too, which is the point of negative caching. This replaces the
 * Caffeine cache; note it does not give single-flight, so two simultaneous first
 * requests can both resolve. One extra upstream call in a race is acceptable.
 */
export const resolveSources = unstable_cache(resolveUncached, ['stream-sources'], {
    revalidate: 300,
});
