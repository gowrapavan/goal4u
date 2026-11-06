import './test-data-env.ts';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dataFetch, listDir, backupUrlFor, _resetMirrorState, mirrorIsCoolingDown, BACKUP_HEADER } from './data-source.ts';

const TOKEN = 'tok_TEST_1234567890abcdef';
const BASE = 'https://data.test/goal4u-data';
const GH = 'https://raw.githubusercontent.com/gowrapavan/goal4u-data/main';
const res = (status: number, body: any = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const abortError = () => Object.assign(new Error('aborted'), { name: 'TimeoutError' });
/** answers per call; a function answer gets the request's signal (to model "never answers") */
const scripted = (...answers: (number | Error | 'hang')[]) => {
  const calls: { url: string; headers: Headers }[] = [];
  const f: any = async (url: string, init: any) => {
    calls.push({ url, headers: new Headers(init?.headers) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a === 'hang') return new Promise((_, rej) => { const keep = setInterval(() => {}, 1000); init.signal.addEventListener('abort', () => { clearInterval(keep); rej(abortError()); }); });   // a real pending request keeps the process alive too
    if (a instanceof Error) throw a; return res(a);
  };
  return { f, calls };
};
const quiet = async <T>(fn: () => Promise<T>) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };
beforeEach(() => _resetMirrorState());

test('only repo files have a GitHub twin: data/, stream-data/, public/', () => {
  assert.equal(backupUrlFor(`${BASE}/stream-data/sportsonline.json`), `${GH}/stream-data/sportsonline.json`);
  assert.equal(backupUrlFor(`${BASE}/data/2026-2027/PL/matches.json`), `${GH}/data/2026-2027/PL/matches.json`);
  assert.equal(backupUrlFor(`${BASE}/public/headshot/1.png`), `${GH}/public/headshot/1.png`);
  assert.equal(backupUrlFor(`${BASE}/_ls/data`), null);
  assert.equal(backupUrlFor('https://other.test/data/x.json'), null);
});

test('no answer within 10 s → the same file from GitHub, without the token, tagged as backup', async () => {
  const s = scripted('hang', 200);
  const t0 = Date.now();
  const r = await quiet(() => dataFetch(`${BASE}/data/x.json`, { timeoutMs: 40 }, s.f));   // 40 ms stands in for the 10 s
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(r.status, 200); assert.equal(r.headers.get(BACKUP_HEADER), 'github-backup');
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].url, `${BASE}/data/x.json`); assert.equal(s.calls[0].headers.get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(s.calls[1].url, `${GH}/data/x.json`); assert.equal(s.calls[1].headers.get('authorization'), null);
});

test('502 / 503 / 504 and network errors also go to GitHub at once (no second wait on the sleeping service)', async () => {
  for (const first of [502, 503, 504, new TypeError('fetch failed')] as const) {
    _resetMirrorState();
    const s = scripted(first, 200); const r = await quiet(() => dataFetch(`${BASE}/stream-data/a.json`, {}, s.f));
    assert.equal(r.status, 200); assert.equal(s.calls[1].url, `${GH}/stream-data/a.json`);
  }
});

test('after a failure the next minute goes straight to GitHub; once it is over the data service is asked again', async () => {
  const s = scripted(503, 200, 200, 200);
  await quiet(() => dataFetch(`${BASE}/data/a.json`, {}, s.f));
  assert.ok(mirrorIsCoolingDown());
  await dataFetch(`${BASE}/data/b.json`, {}, s.f);
  assert.equal(s.calls[2].url, `${GH}/data/b.json`);                                 // no mirror attempt in between
  _resetMirrorState();
  const ok = scripted(200); const r = await dataFetch(`${BASE}/data/c.json`, {}, ok.f);
  assert.equal(ok.calls[0].url, `${BASE}/data/c.json`); assert.equal(r.headers.get(BACKUP_HEADER), null);
});

test('real answers are never replaced: 200, 404 and 401 stay as the data service gave them', async () => {
  for (const code of [200, 404, 401]) {
    _resetMirrorState();
    const s = scripted(code, 200); const r = await dataFetch(`${BASE}/data/z.json`, {}, s.f);
    assert.equal(r.status, code); assert.equal(s.calls.length, 1);
  }
});

test('the caller\'s own deadline is respected: no backup once it has passed', async () => {
  const s = scripted('hang');
  await assert.rejects(() => dataFetch(`${BASE}/data/x.json`, { signal: AbortSignal.timeout(30) }, s.f));
  assert.equal(s.calls.length, 1);
});

test('fallback:false switches the backup off; other paths keep the old retry', async () => {
  const s = scripted(503, 200); const r = await dataFetch(`${BASE}/data/x.json`, { fallback: false, retryDelayMs: 0 }, s.f);
  assert.equal(r.status, 200); assert.equal(s.calls[1].url, `${BASE}/data/x.json`);
});

test('folder listing: the mirror failing gives the GitHub listing', async () => {
  const urls: string[] = [];
  const f: any = async (url: string) => { urls.push(url); return url.startsWith(BASE) ? res(503) : res(200, [{ name: 'PL', type: 'dir' }]); };
  const out = await quiet(() => listDir('data', f, { VITE_GOAL4U_DATA_URL: BASE }));
  assert.deepEqual(out, [{ name: 'PL', type: 'dir' }]);
  assert.match(urls[1], /^https:\/\/api\.github\.com\/repos\/gowrapavan\/goal4u-data\/contents\/data/);
});
