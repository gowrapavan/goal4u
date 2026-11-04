import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrapList, lookupMatchRemote, loadSeoSourceRemote, DATA_BASE, FetchLike } from './remote-source';
import { match, ARS, LEE } from './seo-fixtures';

const resp = (body: any, ok = true, status = 200) => ({ ok, status, json: async () => body });
const NOW = new Date('2026-10-17T12:00:00Z');       // season 2026-2027

test('unwrapList accepts every file shape the repo uses', () => {
  assert.deepEqual(unwrapList({ data: [1, 2] }, 'matches'), [1, 2]);
  assert.deepEqual(unwrapList({ data: { matches: [3] } }, 'matches'), [3]);
  assert.deepEqual(unwrapList({ matches: [4] }, 'matches'), [4]);
  assert.deepEqual(unwrapList([5], 'matches'), [5]);
  assert.deepEqual(unwrapList(null, 'matches'), []); assert.deepEqual(unwrapList({ data: 'x' }, 'matches'), []);
});

test('lookupMatchRemote: with a competition hint it checks this and the two previous seasons, nothing else', async () => {
  const urls: string[] = [];
  const f: FetchLike = async (u) => { urls.push(u); return u.includes('2024-2025/PL') ? resp({ data: [match(7777, ARS, LEE)] }) : resp({ data: [] }); };
  const hit = await lookupMatchRemote('7777', 'PL', undefined, f, NOW);
  assert.equal(hit?.code, 'PL'); assert.equal(hit?.match.id, 7777);
  assert.deepEqual(urls.sort(), ['2024-2025', '2025-2026', '2026-2027'].map((s) => `${DATA_BASE}/${s}/PL/matches.json`));
});

test('lookupMatchRemote: no hint → current season of every competition; explicit season is honoured', async () => {
  const urls: string[] = []; const f: FetchLike = async (u) => { urls.push(u); return resp({ data: [] }); };
  assert.equal(await lookupMatchRemote('1', undefined, undefined, f, NOW), null); assert.equal(urls.length, 7); assert.ok(urls.every((u) => u.includes('/2026-2027/')));
  urls.length = 0; await lookupMatchRemote('1', 'PD', '2023-2024', f, NOW); assert.deepEqual(urls, [`${DATA_BASE}/2023-2024/PD/matches.json`]);
});

test('lookupMatchRemote: "not found" (source answered) is null, but an unreachable source THROWS — an outage is never mistaken for a missing match', async () => {
  assert.equal(await lookupMatchRemote('9', 'PL', undefined, async () => resp({ data: [] }), NOW), null);
  await assert.rejects(lookupMatchRemote('9', 'PL', undefined, async () => { throw new Error('offline'); }, NOW), /unreachable/);
  await assert.rejects(lookupMatchRemote('9', 'PL', undefined, async () => resp({}, false, 503), NOW), /unreachable/);
});

test('loadSeoSourceRemote fetches matches.json + teams.json once per competition (never per match) and reports counts', async () => {
  const real = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async (u: any) => { const url = String(u); calls.push(url);
    if (url.endsWith('competitionInfo.json')) return resp({ data: { code: url.split('/').slice(-2)[0], name: 'X', currentSeason: { startDate: '2026-08-15' } } });
    if (url.endsWith('matches.json')) return resp({ data: [match(1, ARS, LEE)] });
    if (url.endsWith('teams.json')) return resp({ data: [ARS, LEE] });
    return resp({}, false, 404); }) as any;
  try {
    const r = await loadSeoSourceRemote(undefined, NOW);
    assert.equal(r.season, '2026-2027'); assert.deepEqual(r.fetched.PL, { matches: 1, teams: 2 });
    assert.equal(calls.filter((c) => c.endsWith('matches.json')).length, 7); assert.equal(calls.filter((c) => c.endsWith('teams.json')).length, 7);
  } finally { globalThis.fetch = real; }
});

import { loadSeoSourceRemote as loadRemoteRetry } from './remote-source.ts';
test('a data service that is still waking (502, then a timeout, then fine) is retried instead of reported as missing', async () => {
  const calls: Record<string, number> = {};
  const f: any = async (url: string) => {
    calls[url] = (calls[url] ?? 0) + 1;
    if (!/matches\.json$/.test(url)) return { ok: false, status: 404, json: async () => ({}) };
    if (calls[url] === 1) return { ok: false, status: 502, json: async () => ({}) };
    if (calls[url] === 2) throw new Error('timeout');
    return { ok: true, status: 200, json: async () => ({ data: { matches: [{ id: 1 }] } }) };
  };
  const rep = await loadRemoteRetry(f, new Date('2026-10-20T00:00:00Z'));
  assert.ok(Object.values(rep.fetched).some((x) => x.matches === 1), 'matches arrived after the retries');
  assert.ok(Object.entries(calls).some(([u, n]) => /matches\.json$/.test(u) && n === 3));
  const teams = Object.entries(calls).filter(([u]) => /teams\.json$/.test(u));
  assert.ok(teams.length && teams.every(([, n]) => n === 1), 'a 404 is an answer, not retried');
});
