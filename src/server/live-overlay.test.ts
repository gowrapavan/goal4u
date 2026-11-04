import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOverlay, applyLiveOverlay, inOverlayWindow } from './live-overlay.ts';
import { _resetResolverCache } from './match-resolver.ts';

const NOW = Date.parse('2026-10-24T22:30:00Z');
const iso = (minsFromNow: number) => new Date(NOW + minsFromNow * 60000).toISOString();
const team = (id: number, name: string) => ({ id, name, shortName: name, tla: name.slice(0, 3).toUpperCase() });
const fd = (id: number, status: string, minsFromNow: number, h = team(1, 'Napoli'), a = team(2, 'Roma')): any => ({ id, status, utcDate: iso(minsFromNow), minute: null, homeTeam: h, awayTeam: a, score: { fullTime: { home: null, away: null } } });
const game = (id: number, h: string, a: string, startMin: number, o: any = {}) => ({
  id, startTime: iso(startMin), statusGroup: 3, statusText: 'Second Half', gameTime: 70,
  homeCompetitor: { id: id * 10 + 1, name: h, nameForURL: h.toLowerCase(), score: 1 }, awayCompetitor: { id: id * 10 + 2, name: a, nameForURL: a.toLowerCase(), score: 0 }, ...o,
});
const fakeFetch = (games: any[], ok = true) => async () => ({ ok, status: ok ? 200 : 403, json: async () => ({ games }) });

test('only fixtures that kicked off 0-72 h ago and are not final are looked at', () => {
  assert.equal(inOverlayWindow(fd(1, 'TIMED', -30), NOW), true);
  assert.equal(inOverlayWindow(fd(1, 'IN_PLAY', -100), NOW), true);
  assert.equal(inOverlayWindow(fd(1, 'TIMED', +30), NOW), false);
  assert.equal(inOverlayWindow(fd(1, 'TIMED', -241), NOW), true);          // result never synced: still fixed from the live source
  assert.equal(inOverlayWindow(fd(1, 'IN_PLAY', -24 * 60), NOW), true);    // stale IN_PLAY from a mid-match snapshot
  assert.equal(inOverlayWindow(fd(1, 'TIMED', -73 * 60), NOW), false);
  assert.equal(inOverlayWindow(fd(1, 'FINISHED', -30), NOW), false);
  assert.equal(inOverlayWindow(fd(1, 'POSTPONED', -30), NOW), false);
});

test('live source says live: IN_PLAY with its score and minute', () => {
  const out = mergeOverlay(fd(1, 'TIMED', -70), { state: 'live', minute: 70, score: { home: 1, away: 0, ht_home: 0, ht_away: 0 } });
  assert.equal(out.status, 'IN_PLAY'); assert.equal(out.minute, 70); assert.equal(out.liveCheck, 'koora');
  assert.deepEqual(out.score.fullTime, { home: 1, away: 0 }); assert.deepEqual(out.score.halfTime, { home: 0, away: 0 });
});
test('half time → PAUSED; ended → FINISHED (only with a real score)', () => {
  assert.equal(mergeOverlay(fd(1, 'TIMED', -50), { state: 'half time', minute: 45, score: { home: 0, away: 0, ht_home: 0, ht_away: 0 } }).status, 'PAUSED');
  const fin = mergeOverlay(fd(1, 'IN_PLAY', -120), { state: 'full time', minute: null, score: { home: 2, away: 1, ht_home: 1, ht_away: 1 } });
  assert.equal(fin.status, 'FINISHED'); assert.deepEqual(fin.score.fullTime, { home: 2, away: 1 });
  assert.equal(mergeOverlay(fd(1, 'IN_PLAY', -120), { state: 'full time', minute: null, score: { home: null, away: null, ht_home: null, ht_away: null } }).status, 'IN_PLAY');
});
test('not started → flagged so the client does not guess LIVE; no answer → untouched', () => {
  const late = mergeOverlay(fd(1, 'TIMED', -10), { state: 'scheduled', minute: null, score: { home: null, away: null, ht_home: null, ht_away: null } });
  assert.equal(late.status, 'TIMED'); assert.equal(late.liveCheck, 'not_started');
  const m = fd(1, 'TIMED', -10); assert.equal(mergeOverlay(m, null), m);
});

test('applyLiveOverlay pairs by both teams + kick-off, one request for the whole day, orients the score to the home side', async () => {
  _resetResolverCache();
  let calls = 0;
  const f = async (...a: any[]) => { calls++; return (fakeFetch([game(11, 'Napoli', 'Roma', -70), game(12, 'Roma', 'Lazio', -300)]) as any)(...a); };
  const ms = [fd(1, 'TIMED', -70), fd(2, 'FINISHED', -200, team(3, 'Lazio'), team(4, 'Parma')), fd(3, 'TIMED', +60, team(5, 'Inter'), team(6, 'Milan'))];
  const out = await applyLiveOverlay(ms, f as any, NOW);
  assert.equal(out[0].status, 'IN_PLAY'); assert.equal(out[0].minute, 70); assert.deepEqual(out[0].score.fullTime, { home: 1, away: 0 });
  assert.equal(out[1], ms[1]); assert.equal(out[2], ms[2]);        // final and future fixtures are untouched
  assert.ok(calls <= 2, `expected the day list to be shared, got ${calls} requests`);   // kick-off day (+ neighbouring day only near midnight)
});
test('a swapped home/away on the live source still gives the score to the right side', async () => {
  _resetResolverCache();
  const f = fakeFetch([game(21, 'Roma', 'Napoli', -70)]);        // live source lists Roma as home: Roma 1 - 0 Napoli
  const out = await applyLiveOverlay([fd(1, 'TIMED', -70)], f as any, NOW);
  assert.deepEqual(out[0].score.fullTime, { home: 0, away: 1 });     // Napoli (our home) is the one trailing
});
test('live source unreachable (403) or the fixture cannot be paired: repo data kept, flagged unverified so the client does not over-trust its LIVE guess', async () => {
  _resetResolverCache();
  const m = fd(1, 'TIMED', -70);
  const a = (await applyLiveOverlay([m], fakeFetch([], false) as any, NOW))[0];
  assert.deepEqual({ ...a, liveCheck: undefined }, { ...m, liveCheck: undefined }); assert.equal(a.liveCheck, 'unverified'); assert.equal(a.status, 'TIMED');
  _resetResolverCache();
  assert.equal((await applyLiveOverlay([m], fakeFetch([game(31, 'Chelsea', 'Spurs', -70)]) as any, NOW))[0].liveCheck, 'unverified');
  // a repo fixture that already says IN_PLAY is not relabelled
  _resetResolverCache();
  const live = fd(2, 'IN_PLAY', -70); assert.equal((await applyLiveOverlay([live], fakeFetch([], false) as any, NOW))[0], live);
});
