import { eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { subtitleCache } from '@/db/schema';
import { ApiError } from '@/lib/api/errors';
import { BROWSER_UA } from '@/lib/stream/provider';
import type { MediaType } from '@/lib/tmdb/types';

/**
 * OpenSubtitles proxy: search by TMDB id, download once, serve from the cache
 * thereafter. Download links expire and every download counts against a daily
 * quota in the single digits, so only cached bytes are ever re-served. SRT is
 * converted to VTT because browsers only speak WebVTT.
 * see: docs/decisions/subtitles.md
 */

const BASE_URL = 'https://api.opensubtitles.com/api/v1';
const CACHE_TTL_DAYS = 30;

/** SRT timestamps use commas where VTT wants dots; only timestamp lines change. */
const SRT_TIME = /(\d{2}:\d{2}:\d{2}),(\d{3})/g;

interface SearchFile {
    file_id: number;
    file_name?: string;
}

interface SearchEntry {
    attributes?: {
        hearing_impaired?: boolean;
        machine_translated?: boolean;
        download_count?: number;
        files?: SearchFile[];
    };
}

function apiKey(): string {
    const key = process.env.OPENSUBTITLES_API_KEY;
    if (!key) {
        throw new ApiError(
            503,
            'OpenSubtitles API key not configured — add OPENSUBTITLES_API_KEY to .env.local',
        );
    }
    return key;
}

function apiHeaders() {
    return {
        'Api-Key': apiKey(),
        // POST /download blocks user-agent-less clients (kong-user-agent-block).
        'User-Agent': BROWSER_UA,
        'Content-Type': 'application/json',
    };
}

/** Hearing-impaired and machine translations are penalised, not banned: a title
 * with only HI subs still gets captions rather than none. */
function penalty(entry: SearchEntry): number {
    const attributes = entry.attributes;
    if (!attributes) return 0;
    return (attributes.hearing_impaired ? 1 : 0) + (attributes.machine_translated ? 1 : 0);
}

function downloadCount(entry: SearchEntry): number {
    return entry.attributes?.download_count ?? 0;
}

/** Best = most-downloaded clean subtitle. */
function pick(entries: SearchEntry[]): SearchEntry | null {
    const withFiles = entries.filter((entry) => (entry.attributes?.files?.length ?? 0) > 0);
    if (withFiles.length === 0) return null;
    return withFiles.sort(
        (a, b) => penalty(a) - penalty(b) || downloadCount(b) - downloadCount(a),
    )[0];
}

/** WEBVTT passes through; SRT gets the header plus dot timestamps. */
function toVtt(text: string): string {
    if (text.startsWith('WEBVTT')) return text;
    if (text.startsWith('[Script Info]')) {
        // ASS slipped through despite sub_format=vtt — browsers cannot show it.
        throw new ApiError(404, 'subtitle format unsupported');
    }
    return `WEBVTT\n\n${text.replace(SRT_TIME, '$1.$2')}`;
}

function mapUpstreamFailure(status: number): never {
    if (status === 429) {
        throw new ApiError(503, 'OpenSubtitles daily quota exhausted — try again tomorrow');
    }
    if (status === 401 || status === 403) {
        throw new ApiError(
            503,
            "OpenSubtitles rejects this API key — check the key and the consumer's anonymous-downloads setting",
        );
    }
    throw new ApiError(502, 'OpenSubtitles is not answering right now — try again shortly');
}

/** The subtitle track for one title or episode as VTT text. */
export async function resolveSubtitle(
    mediaType: MediaType,
    tmdbId: number,
    season: number | null,
    episode: number | null,
    lang: string,
): Promise<string> {
    // Query params MUST be alphabetical or the Kong gateway 301s the request
    // (X-OS-Rule: canonical), and a 301 loses the Api-Key header.
    const params = new URLSearchParams();
    if (episode != null) params.set('episode_number', String(episode));
    params.set('languages', lang);
    if (season != null) params.set('season_number', String(season));
    params.set('tmdb_id', String(tmdbId));

    let search: Response;
    try {
        search = await fetch(`${BASE_URL}/subtitles?${params}`, {
            headers: apiHeaders(),
            signal: AbortSignal.timeout(10_000),
            cache: 'no-store',
        });
    } catch (error) {
        console.warn('OpenSubtitles search failed', error);
        throw new ApiError(502, 'OpenSubtitles is unreachable — try again shortly');
    }
    if (!search.ok) {
        console.warn(`OpenSubtitles answered with status ${search.status}`);
        mapUpstreamFailure(search.status);
    }

    const { data } = (await search.json()) as { data?: SearchEntry[] };
    const best = pick(data ?? []);
    const fileId = best?.attributes?.files?.[0]?.file_id;
    if (!fileId) throw new ApiError(404, 'no subtitles found');

    const cached = await db
        .select({ content: subtitleCache.content })
        .from(subtitleCache)
        .where(eq(subtitleCache.fileId, fileId));
    if (cached.length > 0) return cached[0].content;

    // sub_format=vtt asks the upstream to convert: search results carry no file
    // extension, so filtering by name is not an option, and this keeps ASS away.
    let download: Response;
    try {
        download = await fetch(`${BASE_URL}/download`, {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify({ file_id: fileId, sub_format: 'vtt' }),
            signal: AbortSignal.timeout(10_000),
            cache: 'no-store',
        });
    } catch (error) {
        console.warn('OpenSubtitles download failed', error);
        throw new ApiError(502, 'OpenSubtitles is unreachable — try again shortly');
    }
    if (!download.ok) {
        console.warn(`OpenSubtitles download answered ${download.status}`);
        mapUpstreamFailure(download.status);
    }
    const { link, remaining } = (await download.json()) as {
        link?: string;
        remaining?: number;
    };
    if (!link) throw new ApiError(404, 'subtitle download link missing');
    console.info(`OpenSubtitles quota after download: ${remaining} remaining (file ${fileId})`);

    // The link is a one-shot CDN URL and gets no Api-Key, so the key never leaves
    // the API host.
    const file = await fetch(link, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
    });
    if (!file.ok) throw new ApiError(502, 'subtitle file could not be fetched');

    const content = toVtt(await file.text());
    // Keyed by file_id, so re-resolving a title that maps to the same file never
    // downloads again. Serving beats caching if the write fails.
    await db
        .insert(subtitleCache)
        .values({ fileId, content })
        .onConflictDoNothing()
        .catch((error) => console.warn('subtitle cache write failed', error));
    void sweepExpired();
    return content;
}

/** Lazy sweep after a successful download: drop entries past the TTL. */
async function sweepExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await db
        .delete(subtitleCache)
        .where(lt(subtitleCache.createdAt, cutoff))
        .catch((error) => console.warn('subtitle cache sweep failed', error));
}
