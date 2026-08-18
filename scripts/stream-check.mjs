// Walks the whole playback chain for one title: resolve -> master playlist ->
// rendition -> first segment, all through our proxy.
// Usage: node scripts/stream-check.mjs [provider] [type] [tmdbId] [season] [episode]

const BASE = process.env.NEW_BASE ?? 'http://localhost:3000';
const [provider = 'vidsrc-hair', type = 'movie', tmdbId = '550', season, episode] =
    process.argv.slice(2);

const auth = await fetch(`${BASE}/api/auth/guest`, { method: 'POST' });
const cookie = auth.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');

const params = new URLSearchParams({ provider, type, tmdbId });
if (season) params.set('season', season);
if (episode) params.set('episode', episode);

const sourcesResponse = await fetch(`${BASE}/api/stream/sources?${params}`, {
    headers: { cookie },
});
console.log(
    `1. resolve ${provider} ${type}/${tmdbId}${season ? ` S${season}E${episode}` : ''} -> ${sourcesResponse.status}`,
);
if (!sourcesResponse.ok) {
    console.log('   body:', (await sourcesResponse.text()).slice(0, 200));
    process.exit(1);
}
const sources = await sourcesResponse.json();
console.log(
    `   ${sources.length} source(s):`,
    sources.map((s) => `${s.quality}/${s.format}`).join(', '),
);
if (sources.length === 0) {
    console.log('   provider served nothing — that is a live upstream problem, not a code one');
    process.exit(1);
}
// The proxy URL must not reveal the upstream host.
const leaks = sources.filter((s) => /https?%3A|https?:/i.test(s.proxyUrl));
console.log(`   upstream url hidden in token: ${leaks.length === 0 ? 'yes' : 'NO — leaking'}`);

const master = sources[0].proxyUrl;
const masterResponse = await fetch(BASE + master);
// Never read the body as text unless it really is a manifest: a provider that
// hands back a direct video file would otherwise be buffered whole (a 1 GB MKV
// killed this script once).
const masterType = masterResponse.headers.get('content-type') ?? '';
const masterLength = Number(masterResponse.headers.get('content-length') ?? '0');
if (!/mpegurl|m3u8|text/i.test(masterType) || masterLength > 5_000_000) {
    console.log(
        `2. NOT a playlist -> ${masterResponse.status} ${masterType} ${masterLength} bytes — browsers cannot play this`,
    );
    await masterResponse.body?.cancel();
    process.exit(1);
}
const masterBody = await masterResponse.text();
console.log(`2. master playlist -> ${masterResponse.status} (${masterBody.length} bytes)`);
console.log(
    `   rewritten to proxy paths: ${masterBody.includes('/api/stream/proxy/') ? 'yes' : 'no'}`,
);
console.log(
    `   original hosts left behind: ${/^https?:\/\//m.test(masterBody) ? 'YES — leaking' : 'none'}`,
);

const lines = masterBody.split('\n').filter((l) => l.startsWith('/api/stream/proxy/'));
if (lines.length === 0) {
    console.log('   no child URIs found — nothing further to walk');
    process.exit(1);
}
console.log(`   ${lines.length} child URI(s)`);

const childResponse = await fetch(BASE + lines[0]);
const childType = childResponse.headers.get('content-type') ?? '';
console.log(`3. first child -> ${childResponse.status} (${childType})`);

// If the child is another playlist (a rendition), walk one more level to a segment.
let segmentUrl = lines[0];
if (childType.includes('mpegurl') || childType.includes('octet-stream')) {
    const childBody = await childResponse.text();
    const segments = childBody.split('\n').filter((l) => l.startsWith('/api/stream/proxy/'));
    console.log(`   rendition with ${segments.length} segment(s)`);
    if (segments.length > 0) segmentUrl = segments[0];
} else {
    await childResponse.arrayBuffer();
}

const segment = await fetch(BASE + segmentUrl, { headers: { range: 'bytes=0-1023' } });
const bytes = (await segment.arrayBuffer()).byteLength;
console.log(
    `4. segment with Range -> ${segment.status} (${bytes} bytes, content-range: ${segment.headers.get('content-range') ?? 'none'})`,
);
console.log(
    `   206 partial content honoured: ${segment.status === 206 ? 'yes' : 'no (some CDNs answer 200)'}`,
);

// A tampered token must be refused.
const tampered = master.slice(0, -4) + 'AAAA';
const tamperedResponse = await fetch(BASE + tampered);
console.log(`5. tampered token -> ${tamperedResponse.status} (404 expected)`);

console.log(
    `\n${segment.status === 200 || segment.status === 206 ? 'PLAYABLE — bytes flowed through the proxy' : 'FAILED at the segment step'}`,
);
