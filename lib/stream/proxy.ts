import { BROWSER_UA } from './provider';
import { seal, type ProxyTarget } from './token';

/**
 * Streaming passthrough for provider sources. Every request upstream replays the
 * source's referer/origin headers — the one thing a plain <video> tag can never
 * do — and the browser's Range header goes through untouched so seeking works.
 * see: docs/local/streaming-providers.md#architecture
 */

/** Encrypted-HLS key URIs and fMP4 init maps both live in this attribute. */
const URI_ATTRIBUTE = /URI="([^"]+)"/;

/** Provider CDNs flap under load: segments intermittently 404 while the same
 * URL answers 200 a moment later. One immediate re-fetch, then give up. This is
 * proxy resilience, not provider fallback — the target never changes. */
const RETRY_DELAY_MS = 300;

function proxyPath(url: string, parent: ProxyTarget): string {
    return `/api/stream/proxy/${seal({ url, headers: parent.headers })}`;
}

function isPlaylist(contentType: string | null, url: string) {
    if (contentType && (contentType.includes('mpegurl') || contentType.includes('m3u8'))) {
        return true;
    }
    // Some CDNs serve playlists as text/plain or octet-stream.
    return new URL(url).pathname.endsWith('.m3u8');
}

async function fetchUpstream(target: ProxyTarget, range: string | null) {
    const headers: Record<string, string> = { 'User-Agent': BROWSER_UA, ...target.headers };
    if (range) headers.Range = range;
    // No timeout on the body: a slow-but-alive movie must not be cut off.
    return fetch(target.url, { headers, cache: 'no-store', redirect: 'follow' });
}

/**
 * Rewrites every URI in a playlist to a proxied one, resolving relative entries
 * against the playlist's own URL. Children inherit the parent's headers, because
 * the referer requirement applies to segments and init maps exactly as it does to
 * the manifest. Missing that is why hls.js would 403 on segments.
 *
 * Each child gets its own sealed token rather than reusing the parent's: HLS
 * segments routinely live on a different host from the manifest (vixsrc does
 * exactly this), so anything that pinned children to the parent's origin would
 * 404 every segment. Sealing means we minted it, so no such restriction is needed.
 */
function rewritePlaylist(body: string, target: ProxyTarget): string {
    const parent = new URL(target.url);
    return body
        .split(/\r?\n/)
        .map((line) => {
            if (line === '') return line;
            if (line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-MAP')) {
                const match = URI_ATTRIBUTE.exec(line);
                if (!match) return line;
                const absolute = new URL(match[1], parent).toString();
                return line.replace(URI_ATTRIBUTE, `URI="${proxyPath(absolute, target)}"`);
            }
            if (line.startsWith('#')) return line;
            // A bare URI line: a rendition or a segment.
            return proxyPath(new URL(line.trim(), parent).toString(), target);
        })
        .join('\n');
}

export async function proxyStream(target: ProxyTarget, range: string | null): Promise<Response> {
    let upstream: Response | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            upstream = await fetchUpstream(target, range);
            if (upstream.ok || upstream.status === 206) break;
            if (attempt === 1) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                continue;
            }
            // Pass the upstream's own failure status through so hls.js sees the truth.
            return new Response(null, { status: upstream.status });
        } catch (error) {
            if (attempt === 1) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                continue;
            }
            console.warn('proxy fetch failed', error);
            return new Response(null, { status: 502 });
        }
    }
    if (!upstream) return new Response(null, { status: 502 });

    const contentType = upstream.headers.get('content-type');
    if (isPlaylist(contentType, target.url)) {
        // Playlists are small, so buffering to rewrite them is fine. Everything
        // else streams.
        const rewritten = rewritePlaylist(await upstream.text(), target);
        return new Response(rewritten, {
            status: upstream.status,
            headers: {
                'content-type': contentType ?? 'application/vnd.apple.mpegurl',
                'cache-control': 'no-store',
            },
        });
    }

    const headers = new Headers();
    for (const name of ['content-type', 'content-range', 'accept-ranges', 'content-length']) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
    }
    headers.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers });
}
