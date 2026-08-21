import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

/** Providers are gray-market and their playlists are unvalidated wire content —
 * any URI in one becomes a server-side fetch. Block private/loopback/link-local
 * targets (including the 169.254.169.254 cloud metadata IP) so a malicious or
 * MITM'd upstream can't turn this proxy into an SSRF probe of our own network. */
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RESOLUTION_CACHE_TTL_MS = 60_000;
const resolutionCache = new Map<string, { safe: boolean; expiresAt: number }>();

function ipv4ToInt(address: string): number | null {
    const parts = address.split('.');
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
        value = (value << 8) | Number(part);
    }
    return value >>> 0;
}

const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10], // shared address space (CGNAT)
    ['127.0.0.0', 8],
    ['169.254.0.0', 16], // link-local — covers the cloud metadata IP
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved
];

function isPrivateIpv4(address: string): boolean {
    const value = ipv4ToInt(address);
    if (value === null) return true; // unparseable — fail closed
    return BLOCKED_IPV4_CIDRS.some(([base, prefix]) => {
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        return (value & mask) === (ipv4ToInt(base)! & mask);
    });
}

/** Only the ranges that matter for SSRF (loopback, unique-local, link-local,
 * IPv4-mapped) — not an exhaustive IANA reserved-block list. */
function isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase().split('%')[0];
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('::ffff:')) {
        const embedded = normalized.slice(7);
        return isIP(embedded) === 4 ? isPrivateIpv4(embedded) : true;
    }
    const head = normalized.split('::')[0];
    const firstGroup = head.split(':').find((group) => group.length > 0) ?? '0';
    const firstHextet = Number.parseInt(firstGroup, 16);
    if (Number.isNaN(firstHextet)) return true; // fail closed
    if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true; // unique local
    if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true; // link-local
    if (firstHextet >= 0xff00 && firstHextet <= 0xffff) return true; // multicast
    return false;
}

function isPrivateAddress(address: string): boolean {
    return isIP(address) === 6 ? isPrivateIpv6(address) : isPrivateIpv4(address);
}

/** DNS-cached per host for a minute — this runs per HLS segment, so re-resolving
 * on every request would add real latency across a playback session. */
async function isPublicHost(host: string): Promise<boolean> {
    if (isIP(host)) return !isPrivateAddress(host);
    const cached = resolutionCache.get(host);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.safe;
    const addresses = await lookup(host, { all: true }).then(
        (entries) => entries.map((entry) => entry.address),
        () => [] as string[], // resolution failure — fail closed
    );
    const safe = addresses.length > 0 && addresses.every((address) => !isPrivateAddress(address));
    resolutionCache.set(host, { safe, expiresAt: now + RESOLUTION_CACHE_TTL_MS });
    return safe;
}

/** Re-checked on every redirect hop too — a first-hop check alone would let a
 * 302 point anywhere. */
async function assertPublicTarget(rawUrl: string): Promise<void> {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`blocked target scheme: ${url.protocol}`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!(await isPublicHost(host))) throw new Error(`blocked target host: ${url.hostname}`);
}

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

    // Manual redirect handling so each hop gets the same SSRF check as the
    // first — 'follow' would let a redirect bypass it entirely.
    let currentUrl = target.url;
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
        await assertPublicTarget(currentUrl);
        // No timeout on the body: a slow-but-alive movie must not be cut off.
        const response = await fetch(currentUrl, { headers, cache: 'no-store', redirect: 'manual' });
        const location = response.headers.get('location');
        if (!REDIRECT_STATUSES.has(response.status) || !location) return response;
        currentUrl = new URL(location, currentUrl).toString();
    }
    throw new Error('too many redirects');
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
