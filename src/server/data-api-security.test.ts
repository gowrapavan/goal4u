/**
 * The REAL /api/data router, driven over HTTP, with the data service replaced by a stub. Proves: nothing a caller sends can reach a URL outside
 * the data folder, the token is added by the server only (and never shown), and pictures only come back when they really are small images.
 */
import './test-data-env.ts';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

const TOKEN = 'tok_TEST_1234567890abcdef';
const BASE = 'https://data.test/goal4u-data';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const upstream: { url: string; auth: string | null }[] = [];
let respond: (url: string) => Response = () => new Response('{}', { status: 404 });
const realFetch = globalThis.fetch;
let server: http.Server; let port = 0;

before(async () => {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith('https://data.test/')) return realFetch(input, init);
    upstream.push({ url, auth: new Headers(init?.headers).get('authorization') });
    return respond(url);
  }) as any;
  const { default: dataRouter } = await import('./data-api.ts');
  const app = express(); app.use('/api/data', dataRouter);
  server = http.createServer(app); await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); port = (server.address() as AddressInfo).port;
});
after(() => { globalThis.fetch = realFetch; server.close(); });

// node:http, not fetch: the path is sent EXACTLY as written (fetch would tidy "/../" away before it left)
const get = (path: string) => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path }, (res) => { const c: Buffer[] = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(c) })); }).on('error', reject);
});

test('traversal in a path parameter is a 400 and nothing is requested upstream', async () => {
  upstream.length = 0;
  for (const p of ['/api/data/matches/..', '/api/data/matches/%2e%2e', '/api/data/standings/%2e%2e%2f%2e%2e', '/api/data/league-info/%2e%2e/metadata', '/api/data/league-info/PL/..%2f..%2fx', '/api/data/backdrop/..', '/api/data/streams/..%2fx.json', '/api/data/team-info/1%2f..%2f2', '/api/data/analytics/h2h/1/..']) {
    const r = await get(p); assert.equal(r.status, 400, p);
  }
  assert.equal(upstream.length, 0);
});
test('traversal / junk in a query string is a 400: season, file, club, c, from, to, arrays, nested objects', async () => {
  upstream.length = 0;
  for (const q of ['/api/data/matches/PL?season=../../x', '/api/data/matches/PL?season=2026-2027&season=2025-2026', '/api/data/team-info/1/squad?file=../../x.json', '/api/data/team-info/1/squad?file=a/b.json',
    '/api/data/match/1?c=..', '/api/data/match/1?season=..%2f..', '/api/data/feed?from=../..', '/api/data/feed?to=2026-02-30', '/api/data/player-related/1?club=../1', '/api/data/matches/PL?season[a]=1', '/api/data/id-lookup?name=x&type=__proto__']) {
    const r = await get(q); assert.equal(r.status, 400, q);
  }
  assert.equal(upstream.length, 0);
});
test('more than 12 query parameters is refused', async () => {
  const q = Array.from({ length: 13 }, (_, i) => `k${i}=1`).join('&'); assert.equal((await get(`/api/data/matches/PL?${q}`)).status, 400);
});
test('every upstream request made for a legitimate call stays inside the data folder and carries the token as a header', async () => {
  upstream.length = 0; respond = () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await get('/api/data/matches/PL?season=2026-2027'); await get('/api/data/team-info/86/squad?file=2026-2027-squad.json'); await get('/api/data/streams/hd_streams.json');
  assert.ok(upstream.length >= 3);
  for (const u of upstream) { assert.ok(u.url.startsWith(`${BASE}/`), u.url); assert.ok(!u.url.includes('..'), u.url); assert.equal(u.auth, `Bearer ${TOKEN}`); assert.ok(!u.url.includes(TOKEN), 'header, not URL'); }
});
test('a stream file name with a dot is still allowed (regression: the dot rule must not break /streams/hd_streams.json)', async () => {
  respond = () => new Response(JSON.stringify([{ a: 1 }]), { status: 200 }); const r = await get('/api/data/streams/hd_streams.json'); assert.equal(r.status, 200);
});
test('id-lookup: prototype names are not registry entries', async () => {
  respond = () => new Response(JSON.stringify({ teams: { arsenal: 57 }, players: {} }), { status: 200 });
  assert.equal((await get('/api/data/id-lookup?name=arsenal')).status, 200);
  assert.equal((await get('/api/data/id-lookup?name=constructor')).status, 404); assert.equal((await get('/api/data/id-lookup?name=__proto__')).status, 404);
});

test('image proxy: a good picture comes back with the token added SERVER-side, long cache, nosniff — and the token is nowhere in the answer', async () => {
  upstream.length = 0; respond = () => new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } });
  const r = await get('/api/data/img/headshot/10000.png?v=3');
  assert.equal(r.status, 200); assert.equal(r.headers['content-type'], 'image/png'); assert.deepEqual(r.body, PNG);
  assert.match(String(r.headers['cache-control']), /max-age=86400/); assert.equal(r.headers['x-content-type-options'], 'nosniff'); assert.match(String(r.headers['content-security-policy']), /sandbox/);
  assert.equal(upstream[0].url, `${BASE}/public/headshot/10000.png?token=${TOKEN}`); assert.equal(upstream[0].auth, `Bearer ${TOKEN}`);   // ?v=3 is not forwarded
  assert.ok(!JSON.stringify(r.headers).includes(TOKEN) && !r.body.toString('latin1').includes(TOKEN));
});
test('image proxy: names with spaces / accents work and are re-encoded upstream', async () => {
  upstream.length = 0; respond = () => new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } });
  assert.equal((await get('/api/data/img/trophies/Champions%20League.png')).status, 200); assert.ok(upstream[0].url.includes('/trophies/Champions%20League.png'));
});
test('image proxy: bad paths are 400 and never requested; other file types, traversal, absolute paths', async () => {
  upstream.length = 0;
  for (const p of ['/api/data/img/..%2f..%2fdata%2fx.png', '/api/data/img/%2e%2e/x.png', '/api/data/img/a/../x.png', '/api/data/img/x.txt', '/api/data/img/x.png.html', '/api/data/img/', '/api/data/img/a%5cb.png', '/api/data/img/a/b/c/d/e/f/g.png', '/api/data/img/.hidden.png'])
    assert.equal((await get(p)).status, 400, p);
  assert.equal(upstream.length, 0);
});
test('image proxy: a non-image answer, an oversized image, a missing picture and a refused token are each handled', async () => {
  respond = () => new Response('<html>hi</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }); assert.equal((await get('/api/data/img/a.png')).status, 502);
  respond = () => new Response(Buffer.alloc(3 * 1024 * 1024 + 1), { status: 200, headers: { 'Content-Type': 'image/png' } }); assert.equal((await get('/api/data/img/big.png')).status, 502);
  respond = () => new Response('nope', { status: 404 }); const m = await get('/api/data/img/missing.png'); assert.equal(m.status, 404); assert.match(String(m.headers['cache-control']), /max-age=300/);
  respond = () => new Response('nope', { status: 401 }); const t = await get('/api/data/img/a.png'); assert.equal(t.status, 503); assert.equal(t.headers['cache-control'], 'no-store');
});
