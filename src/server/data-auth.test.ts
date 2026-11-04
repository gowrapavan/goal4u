import './test-data-env.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaderFor, dataFetch, dataAuthFailures, dataAuthGuard, noteDataAuthFailure, listDir } from './data-source.ts';

const TOKEN = 'tok_TEST_1234567890abcdef';
const BASE = 'https://data.test/goal4u-data';
const res = (status: number, body: any = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const scripted = (...answers: (number | Error)[]) => {
  const calls: { url: string; headers: Headers }[] = [];
  const f: any = async (url: string, init: any) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a; return res(a);
  };
  return { f, calls };
};
const quiet = async <T>(fn: () => Promise<T>) => {   // capture console output (and prove the token never appears in it)
  const logs: string[] = []; const e = console.error, w = console.warn;
  console.error = (...a: any[]) => logs.push(a.join(' ')); console.warn = (...a: any[]) => logs.push(a.join(' '));
  try { return { out: await fn(), logs }; } finally { console.error = e; console.warn = w; }
};

test('the token is sent to the data service only: never to GitHub, YouTube, NewsAPI, koora or any other host', () => {
  assert.equal(authHeaderFor(`${BASE}/data/2026-2027/PL/matches.json`), `Bearer ${TOKEN}`);
  assert.equal(authHeaderFor(`${BASE}/_ls/data`), `Bearer ${TOKEN}`);
  for (const u of ['https://raw.githubusercontent.com/gowrapavan/shortsdata/main/videos.json', 'https://i.ytimg.com/vi/x/mqdefault.jpg', 'https://newsapi.org/v2/everything', 'https://www.koora-l.live/game/1', 'https://data.test.evil.com/goal4u-data/x', 'https://data.test/other/x'])
    assert.equal(authHeaderFor(u), undefined, u);
});

test('dataFetch adds Authorization: Bearer on data URLs (header, never in the URL) and nothing on other hosts', async () => {
  const a = scripted(200); await dataFetch(`${BASE}/data/x.json`, { retryDelayMs: 0 }, a.f);
  assert.equal(a.calls[0].headers.get('authorization'), `Bearer ${TOKEN}`); assert.ok(!a.calls[0].url.includes(TOKEN));
  const b = scripted(200); await dataFetch('https://raw.githubusercontent.com/gowrapavan/shortsdata/main/shorts.json', { retryDelayMs: 0 }, b.f);
  assert.equal(b.calls[0].headers.get('authorization'), null);
});

test('401: no retry, counted, logged once as "check GOAL4U_TOKEN" — and the log never contains the token', async () => {
  const before = dataAuthFailures();
  const s = scripted(401);
  const { out, logs } = await quiet(() => dataFetch(`${BASE}/data/x.json`, { retryDelayMs: 0 }, s.f));
  assert.equal(out.status, 401); assert.equal(s.calls.length, 1);
  assert.equal(dataAuthFailures(), before + 1);
  assert.ok(logs.some((l) => /check GOAL4U_TOKEN/.test(l)));
  assert.ok(logs.every((l) => !l.includes(TOKEN)));
});

test('404 is returned as it is, with no retry', async () => {
  const s = scripted(404); const r = await dataFetch(`${BASE}/data/missing.json`, { retryDelayMs: 0 }, s.f);
  assert.equal(r.status, 404); assert.equal(s.calls.length, 1);
});

test('502 / 503 / 504 or a network error: ONE retry, then the answer (or the error) is given back', async () => {
  const healed = scripted(502, 200); assert.equal((await dataFetch(`${BASE}/a`, { retryDelayMs: 0 }, healed.f)).status, 200); assert.equal(healed.calls.length, 2);
  const stuck = scripted(502); assert.equal((await dataFetch(`${BASE}/a`, { retryDelayMs: 0 }, stuck.f)).status, 502); assert.equal(stuck.calls.length, 2);
  const net = scripted(new TypeError('fetch failed'), 200); assert.equal((await dataFetch(`${BASE}/a`, { retryDelayMs: 0 }, net.f)).status, 200); assert.equal(net.calls.length, 2);
  const dead = scripted(new TypeError('fetch failed')); await assert.rejects(() => dataFetch(`${BASE}/a`, { retryDelayMs: 0 }, dead.f)); assert.equal(dead.calls.length, 2);
  const g = scripted(503, 200); assert.equal((await dataFetch(`${BASE}/a`, { retryDelayMs: 0 }, g.f)).status, 200);
});

test('a timeout is not retried (it already waited the full time), and retry:false switches the retry off', async () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const t = scripted(abort); await assert.rejects(() => dataFetch(`${BASE}/a`, { retryDelayMs: 0 }, t.f)); assert.equal(t.calls.length, 1);
  const n = scripted(502); await dataFetch(`${BASE}/a`, { retry: false }, n.f); assert.equal(n.calls.length, 1);
});

test('folder listings (/_ls) carry the token too', async () => {
  const s: any = { calls: [] as any[] };
  const f: any = async (url: string, init: any) => { s.calls.push({ url, headers: new Headers(init?.headers) }); return res(200, [{ name: '2026-2027', type: 'dir' }, { name: 'x.json', type: 'file' }]); };
  const out = await listDir('data', f, { VITE_GOAL4U_DATA_URL: BASE });
  assert.deepEqual(out, [{ name: '2026-2027', type: 'dir' }, { name: 'x.json', type: 'file' }]);
  assert.equal(s.calls[0].url, `${BASE}/_ls/data`); assert.equal(s.calls[0].headers.get('authorization'), `Bearer ${TOKEN}`);
});

test('/api/data guard: a refused token during the request becomes 503 "Data service unavailable" (never cached); otherwise the answer is untouched', async () => {
  const mk = () => { const r: any = { code: 200, headers: {} as any, sent: undefined as any };
    r.status = (c: number) => { r.code = c; return r; }; r.set = (k: string, v: string) => { r.headers[k] = v; return r; }; r.json = (b: any) => { r.sent = b; return r; }; return r; };
  const refused = mk();
  await quiet(async () => dataAuthGuard({}, refused, () => { noteDataAuthFailure(); refused.json({ matches: [] }); }));
  assert.equal(refused.code, 503); assert.deepEqual(refused.sent, { error: 'Data service unavailable', code: 'data_auth' }); assert.equal(refused.headers['Cache-Control'], 'no-store');
  const fine = mk(); dataAuthGuard({}, fine, () => { fine.json({ matches: [1] }); });
  assert.equal(fine.code, 200); assert.deepEqual(fine.sent, { matches: [1] });
  const nf = mk(); dataAuthGuard({}, nf, () => { nf.status(404).json({ error: 'Not found' }); });
  assert.equal(nf.code, 404); assert.deepEqual(nf.sent, { error: 'Not found' });                  // 404 stays a 404
});
