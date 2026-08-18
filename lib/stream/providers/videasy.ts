import { imdbId } from '@/lib/tmdb/client';
import { detail } from '@/lib/tmdb/service';
import {
    BROWSER_UA,
    fetchWithTimeout,
    qualityNumber,
    type ResolveRequest,
    type StreamProvider,
    type StreamSource,
} from '../provider';
import { decryptSources } from './videasy-cipher';

/**
 * Videasy (player.videasy.to). The published TMDB-Embed-API plugin is stale —
 * api.videasy.net is dead — so this follows the live frontend's own backend,
 * api.speedracelight.com, whose payloads come back encrypted.
 * see: docs/local/streaming-providers.md#videasy-wire
 */

const API_BASE = 'https://api.speedracelight.com';
const REFERER = 'https://player.videasy.to/';
const ORIGIN = 'https://player.videasy.to';

/** cdn serves HLS up to 2160p; downloader2 is the mp4 fallback. */
const SERVERS = ['cdn', 'downloader2'];

function apiHeaders() {
    return { 'User-Agent': BROWSER_UA, Referer: REFERER, Origin: ORIGIN };
}

/** Their frontend pre-encodes the title and the HTTP layer encodes again, so the
 * value on the wire is encoded twice. Built by hand because URLSearchParams
 * would add a third round. */
function doubleEncode(value: string): string {
    return encodeURIComponent(encodeURIComponent(value));
}

async function fetchSeed(tmdbId: number): Promise<string | null> {
    const response = await fetchWithTimeout(`${API_BASE}/seed?mediaId=${tmdbId}`, {
        headers: apiHeaders(),
        timeoutMs: 10_000,
    });
    if (!response.ok) return null;
    const { seed } = (await response.json()) as { seed?: string };
    return seed ?? null;
}

interface VideasySource {
    quality?: string;
    url?: string;
}

async function fetchFromServer(
    server: string,
    request: ResolveRequest,
    title: string,
    year: number,
    imdb: string,
    seed: string,
): Promise<VideasySource[] | null> {
    let query =
        `title=${doubleEncode(title)}` + `&mediaType=${request.mediaType}` + `&year=${year}`;
    if (request.mediaType === 'tv') {
        query += `&seasonId=${request.season}&episodeId=${request.episode}`;
    }
    query += `&tmdbId=${request.tmdbId}&imdbId=${imdb}&enc=2&seed=${seed}`;

    const response = await fetchWithTimeout(`${API_BASE}/${server}/sources-with-title?${query}`, {
        headers: apiHeaders(),
        timeoutMs: 10_000,
    });
    // A 401 means the seed is spent; the caller re-seeds and retries once.
    if (response.status === 401) throw new Error('seed rejected');
    if (!response.ok) return null;

    let payload = (await response.text()).trim();
    // Raw base64, occasionally JSON-quoted depending on the server.
    if (payload.startsWith('"') && payload.endsWith('"')) payload = payload.slice(1, -1);
    try {
        const decrypted = decryptSources(payload, seed, request.tmdbId);
        const parsed = JSON.parse(decrypted) as { sources?: VideasySource[] };
        return parsed.sources ?? null;
    } catch (error) {
        // A bad decrypt means a burned seed or a changed payload shape — try the
        // next server rather than failing the whole resolve.
        console.warn(`videasy decrypt failed on server ${server}`, error);
        return null;
    }
}

export const videasy: StreamProvider = {
    name: 'videasy',

    async resolve(request: ResolveRequest): Promise<StreamSource[]> {
        try {
            // Their API keys off title + year + imdb id, not the TMDB id alone.
            const [info, imdb] = await Promise.all([
                detail(request.mediaType, request.tmdbId).catch(() => null),
                imdbId(request.mediaType, request.tmdbId).catch(() => null),
            ]);
            if (!info?.title || info.year == null || !imdb) return [];

            let seed = await fetchSeed(request.tmdbId);
            if (!seed) return [];

            let sources: VideasySource[] | null = null;
            for (const server of SERVERS) {
                try {
                    sources = await fetchFromServer(
                        server,
                        request,
                        info.title,
                        info.year,
                        imdb,
                        seed,
                    );
                } catch {
                    // Seeds are single-use-ish: re-seed once, then give this server
                    // one more chance before moving on.
                    const fresh = await fetchSeed(request.tmdbId);
                    if (!fresh) return [];
                    seed = fresh;
                    sources = await fetchFromServer(
                        server,
                        request,
                        info.title,
                        info.year,
                        imdb,
                        seed,
                    ).catch(() => null);
                }
                if (sources && sources.length > 0) break;
            }
            if (!sources || sources.length === 0) return [];

            // Segment hosts are referer-locked to the player, so both headers ride
            // along through the proxy. Their playlists carry EXT-X-MAP, which the
            // proxy rewrites like any other URI.
            return sources
                .filter((source): source is { url: string; quality?: string } =>
                    Boolean(source.url),
                )
                .map((source) => ({
                    quality: source.quality ?? 'auto',
                    url: source.url,
                    headers: { Referer: REFERER, Origin: ORIGIN },
                    format: (source.url.includes('.m3u8') ? 'hls' : 'mp4') as 'hls' | 'mp4',
                }))
                .sort((a, b) => qualityNumber(a.quality) - qualityNumber(b.quality));
        } catch (error) {
            // Fast-fail: the caller surfaces "no sources", nothing retries here.
            console.warn(`videasy resolve failed for tmdb ${request.tmdbId}`, error);
            return [];
        }
    },
};
