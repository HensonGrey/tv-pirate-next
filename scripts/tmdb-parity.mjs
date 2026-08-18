// Diffs every tmdb endpoint against the Spring backend still running on :8080.
// Usage: node scripts/tmdb-parity.mjs
// The old stack is the oracle for this migration — same request, same JSON.

const OLD = process.env.OLD_BASE ?? 'http://localhost:8080';
const NEW = process.env.NEW_BASE ?? 'http://localhost:3000';

const CASES = [
    '/api/tmdb/genres',
    '/api/tmdb/trending',
    '/api/tmdb/trending?window=week&page=2',
    '/api/tmdb/discover?type=movie',
    '/api/tmdb/discover?type=tv&page=3',
    '/api/tmdb/discover?type=movie&genres=Horror,Thriller',
    '/api/tmdb/discover?type=movie&genres=NotAGenre',
    '/api/tmdb/search?query=dexter',
    '/api/tmdb/search?query=breaking%20bad&page=2',
    '/api/tmdb/movie/550',
    '/api/tmdb/tv/1396',
    '/api/tmdb/tv/1396/season/1',
    '/api/tmdb/tv/1396/season/5',
];

const ERROR_CASES = [
    '/api/tmdb/trending?window=nope',
    '/api/tmdb/trending?page=0',
    '/api/tmdb/trending?page=501',
    '/api/tmdb/discover?type=person',
    '/api/tmdb/search?query=',
    '/api/tmdb/movie/99999999',
    '/api/tmdb/tv/1396/season/0',
];

/** The old API is cookie-authenticated; mint a guest there and reuse its cookies. */
async function oldAuth() {
    const response = await fetch(`${OLD}/api/auth/guest`, { method: 'POST' });
    if (!response.ok) throw new Error(`old backend guest login failed: ${response.status}`);
    return response.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
}

async function newAuth() {
    const response = await fetch(`${NEW}/api/auth/guest`, { method: 'POST' });
    if (!response.ok) throw new Error(`new app guest login failed: ${response.status}`);
    return response.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
}

/** Volatile fields: TMDB reorders equal-popularity rows between calls, so compare
 * structure and the parts that must match rather than raw equality of the array. */
function summarise(body) {
    if (Array.isArray(body)) return { kind: 'array', length: body.length, items: body };
    if (body && typeof body === 'object' && Array.isArray(body.results)) {
        return {
            kind: 'page',
            page: body.page,
            totalPages: body.totalPages,
            totalResults: body.totalResults,
            count: body.results.length,
            ids: body.results.map((r) => `${r.mediaType}:${r.id}`),
            keys: [...new Set(body.results.flatMap((r) => Object.keys(r)))].sort(),
            sample: body.results[0],
        };
    }
    return { kind: 'object', keys: Object.keys(body).sort(), body };
}

function diff(a, b, path = '') {
    const out = [];
    if (JSON.stringify(a) === JSON.stringify(b)) return out;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
        out.push(`${path || '(root)'}: old=${JSON.stringify(a)} new=${JSON.stringify(b)}`);
        return out;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        out.push(...diff(a[key], b[key], path ? `${path}.${key}` : key));
    }
    return out;
}

const oldCookie = await oldAuth();
const newCookie = await newAuth();
let pass = 0;
const failures = [];

for (const path of CASES) {
    const [oldRes, newRes] = await Promise.all([
        fetch(OLD + path, { headers: { cookie: oldCookie } }),
        fetch(NEW + path, { headers: { cookie: newCookie } }),
    ]);
    const [oldBody, newBody] = await Promise.all([oldRes.json(), newRes.json()]);
    const problems = [];
    if (oldRes.status !== newRes.status) {
        problems.push(`status old=${oldRes.status} new=${newRes.status}`);
    }
    const o = summarise(oldBody);
    const n = summarise(newBody);
    // Catalogue totals drift as TMDB adds titles, and the two stacks cached at
    // different moments — compare them proportionally, not exactly.
    const totalsDrift = (a, b) =>
        typeof a === 'number' && typeof b === 'number' && a > 0
            ? Math.abs(a - b) / a < 0.001
            : a === b;
    if (o.kind === 'page' && n.kind === 'page') {
        for (const field of ['totalResults', 'totalPages']) {
            if (totalsDrift(o[field], n[field])) {
                if (o[field] !== n[field]) {
                    console.log(
                        `    note ${path}: ${field} ${o[field]} -> ${n[field]} (upstream drift)`,
                    );
                }
                n[field] = o[field];
            }
        }
    }
    // Compare everything except the id ordering of equal-popularity results.
    problems.push(
        ...diff(
            { ...o, ids: undefined, items: undefined },
            { ...n, ids: undefined, items: undefined },
        ),
    );
    if (o.ids && n.ids) {
        const missing = o.ids.filter((id) => !n.ids.includes(id));
        const extra = n.ids.filter((id) => !o.ids.includes(id));
        // A couple of rows drifting is TMDB churn; a wholesale mismatch is a bug.
        if (missing.length > Math.max(2, o.ids.length * 0.2)) {
            problems.push(`results differ: ${missing.length}/${o.ids.length} old ids absent`);
        }
        if (o.ids.length !== n.ids.length) {
            problems.push(`result count old=${o.ids.length} new=${n.ids.length}`);
        }
        if (extra.length && missing.length) {
            console.log(`    note ${path}: ${missing.length} rows drifted (TMDB churn)`);
        }
    }
    if (o.kind === 'array' && n.kind === 'array') {
        problems.push(...diff(o.items, n.items, 'items'));
    }
    if (problems.length === 0) {
        pass++;
        console.log(`  PASS ${path}`);
    } else {
        failures.push({ path, problems });
        console.log(`  FAIL ${path}`);
        for (const p of problems.slice(0, 6)) console.log(`         ${p}`);
    }
}

console.log('\nerror cases (status codes must match):');
for (const path of ERROR_CASES) {
    const [oldRes, newRes] = await Promise.all([
        fetch(OLD + path, { headers: { cookie: oldCookie } }),
        fetch(NEW + path, { headers: { cookie: newCookie } }),
    ]);
    const ok = oldRes.status === newRes.status;
    if (ok) pass++;
    else failures.push({ path, problems: [`status old=${oldRes.status} new=${newRes.status}`] });
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${path} — old ${oldRes.status}, new ${newRes.status}`);
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
