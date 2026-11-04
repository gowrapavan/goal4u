import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLivePayload, convertEvents, buildLineup, gameScore, liveStatus, orient, slugName, playerName, statsFromPlayers, loadKooraSnapshot, loadLive, _resetKooraCache, looseNum } from './koora-live';
import { sampleGame, sampleStats, sampleFd, sampleMap } from './koora-fixtures';

test('names come from the URL slug exactly as workers/stats365.py writes them', () => {
  assert.equal(slugName('maduka-okoye'), 'Maduka Okoye');
  assert.equal(slugName('l.-miller'), 'L. Miller');
  assert.equal(slugName('ac-milan', true), 'AC Milan');
  assert.equal(slugName('kaiki-bruno-da-silva'), 'Kaiki Bruno da Silva');
  assert.equal(playerName({ nameForURL: 'NOT VALID', name: ' Arabic ' }), 'Arabic');
  assert.equal(looseNum('12 (50%)'), 12); assert.equal(looseNum('26%'), 26); assert.equal(looseNum('x'), null);
});

test('events: goal + assist, cards, substitution; unknown event types (woodwork) are ignored', () => {
  const { events } = convertEvents(sampleGame(), 229, 6117);
  assert.deepEqual(events.map((e) => `${e.minute}${e.type}${e.team}`), ['28yellow_cardhome', '29goalhome', '41yellow_cardhome', '46substitutionhome', '54goalaway', '90yellow_cardhome']);
  const g = events[1]; assert.equal(g.player, 'Hassane Kamara'); assert.equal(g.assistant, 'Jurgen Ekkelenkamp'); assert.equal(g.goal_type, 'normal');
  assert.equal(events[3].player, 'Enzo Ebosse'); assert.equal(events[3].player_out, 'Matteo Palma');
});

test('a second yellow is folded into a red_card and counted as yellow2rcards', () => {
  const g = sampleGame(); const yc = (min: number) => ({ competitorId: 229, stageId: 9, gameTime: min, gameTimeDisplay: `${min}'`, playerId: 3679392, eventType: { id: 2, name: 'بطاقة صفراء', subTypeId: -1 } });
  g.events = [yc(20), yc(70)];
  const { events, yellow2 } = convertEvents(g, 229, 6117);
  assert.deepEqual(events.map((e) => e.type), ['yellow_card', 'red_card']); assert.equal(yellow2.home, 1);
});

test('penalty shoot-out kicks and cancelled goals are not events', () => {
  const g = sampleGame(); g.events = [
    { competitorId: 229, stageId: 11, gameTime: 120, gameTimeDisplay: '1', playerId: 489221, eventType: { id: 1, subTypeName: 'penalty' } },
    { competitorId: 229, stageId: 9, gameTime: 30, gameTimeDisplay: "30'", playerId: 489221, eventType: { id: 1, name: 'هدف', subTypeName: 'ملغى' } }];
  assert.deepEqual(convertEvents(g, 229, 6117).events, []);
});

test('line-ups: 11 starters, goalkeeper first, coach found, injured players skipped, rating string', () => {
  const g = sampleGame(); const lu = buildLineup(g.homeCompetitor, g);
  assert.equal(lu.starting.length, 11); assert.equal(lu.starting[0].position, 'g'); assert.equal(lu.starting[0].name, 'Maduka Okoye'); assert.equal(lu.starting[0].number, '40');
  assert.equal(lu.coach, 'Kosta Runjaic'); assert.equal(lu.formation, '3-4-2-1'); assert.equal(lu.subs.length, 1); assert.equal(lu.starting.find((p) => p.name === 'Hassane Kamara')!.rating, '7.9');
});

test('score is oriented to the football-data home side; half-time comes from stage 7', () => {
  assert.deepEqual(gameScore(sampleGame(), 229), { home: 1, away: 1, ht_home: 1, ht_away: 0 });
  assert.deepEqual(gameScore(sampleGame(), 6117), { home: 1, away: 1, ht_home: 0, ht_away: 1 });          // fd home = koora away → swapped
});

test('status: ended / in play / half time / not started', () => {
  assert.equal(liveStatus(sampleGame()), 'full time');
  assert.equal(liveStatus(sampleGame({ statusGroup: 3, statusText: 'الشوط الأول', gameTime: 33 })), 'live');
  assert.equal(liveStatus(sampleGame({ statusGroup: 3, statusText: 'استراحة', gameTime: 45 })), 'half time');
  const ns = sampleGame({ statusGroup: 2, gameTime: -1 }); ns.homeCompetitor.score = -1.0; assert.equal(liveStatus(ns), 'scheduled');
  const pp = sampleGame({ statusGroup: 4 }); pp.homeCompetitor.score = -1.0; assert.equal(liveStatus(pp), 'scheduled');   // postponed is not "final"
});

test('orientation is verified against the game; a stale mapping is refused', () => {
  assert.deepEqual(orient(sampleFd(), sampleMap, sampleGame()), { h: 229, a: 6117 });
  assert.equal(orient(sampleFd(), { ...sampleMap, fd_home_s365_id: 1, fd_away_s365_id: 2 }, sampleGame()), null);
  assert.deepEqual(orient(sampleFd(), { s365_id: 1, how: 'teams' }, sampleGame()), { h: 229, a: 6117 });          // by team names
  const sw = sampleFd({ homeTeam: sampleFd().awayTeam, awayTeam: sampleFd().homeTeam });
  assert.deepEqual(orient(sw, { s365_id: 1 }, sampleGame()), { h: 6117, a: 229 });
});

test('payload with /stats: old stat keys, formatted values, more-stats in English only, events agree with the score', () => {
  const r = buildLivePayload(sampleFd(), 'SA', sampleMap, sampleGame(), sampleStats());
  assert.ok(r.available); if (!r.available) return;
  assert.equal(r.status, 'full time'); assert.equal(r.minute, null); assert.equal(r.statsDerived, false);
  assert.equal(r.stats!.possession.home, '38%'); assert.equal(r.stats!.possession.hn, 38); assert.equal(r.stats!.shots.home, '13'); assert.equal(r.stats!.expected_goals.away, '1.05'); assert.equal(r.stats!.corners.hn, 5);
  assert.equal(r.stats!.goals.home, '1');
  assert.deepEqual(r.moreStats.map((x) => x.name), ['Successful Tackles']);                                 // untranslated (Arabic) id 999 is withheld
  assert.equal(r.eventsState, 'consistent'); assert.equal(r.events!.length, 6);
  assert.equal(r.lineups!.home.starting.length, 11); assert.equal(r.lineups!.away.coach, 'Cesc Fabregas');
});

test('without /stats the team numbers are exact sums of the per-player numbers, and flagged as derived', () => {
  const g = sampleGame(); const idx = statsFromPlayers(g, 229, 6117);
  assert.equal(idx.get(3)!.home, 3 + 1 + 2 + 2 + 3 + 3); assert.equal(idx.get(4)!.home, 2); assert.equal(idx.get(19)!.home, 25 + 29 + 29); assert.equal(idx.get(23)!.away, 2);
  const r = buildLivePayload(sampleFd(), 'SA', sampleMap, g, null); assert.ok(r.available); if (!r.available) return;
  assert.equal(r.statsDerived, true); assert.equal(r.stats!.shots.home, '14'); assert.equal(r.stats!.possession, undefined);
});

test('while in play: minute and the LIVE score come from koora, events are judged against that score', () => {
  const g = sampleGame({ statusGroup: 3, statusText: 'الشوط الأول', gameTime: 33.0 }); g.homeCompetitor.score = 1.0; g.awayCompetitor.score = 0.0;
  g.events = g.events.filter((e: any) => e.gameTime <= 33);
  const r = buildLivePayload(sampleFd({ status: 'IN_PLAY', score: { fullTime: { home: null, away: null } } }), 'SA', sampleMap, g, null);
  assert.ok(r.available); if (!r.available) return;
  assert.equal(r.status, 'live'); assert.equal(r.minute, 33); assert.deepEqual([r.score.home, r.score.away], [1, 0]); assert.equal(r.eventsState, 'consistent');
});

test('in play: events stay visible when the score is ahead of the event list (the score updates first), with a note', () => {
  const g = sampleGame({ statusGroup: 3, gameTime: 60 }); g.awayCompetitor.score = 2.0;
  const r = buildLivePayload(sampleFd({ status: 'IN_PLAY' }), 'SA', sampleMap, g, null); assert.ok(r.available); if (!r.available) return;
  assert.ok(Array.isArray(r.events) && r.events.length > 0); assert.equal(r.eventsState, 'consistent'); assert.match(r.eventsNote ?? '', /trail the score/);
});

test('not started / wrong game → unavailable, never invented data', () => {
  const ns = sampleGame({ statusGroup: 2 }); ns.homeCompetitor.score = -1.0;
  assert.deepEqual(buildLivePayload(sampleFd(), 'SA', sampleMap, ns, null), { available: false, reason: 'not_started' });
  assert.deepEqual(buildLivePayload(sampleFd(), 'SA', { ...sampleMap, fd_home_s365_id: 7, fd_away_s365_id: 8 }, sampleGame(), null), { available: false, reason: 'mismatch' });
});

test('loadKooraSnapshot: one upstream request per id within the TTL, shared by concurrent callers; failures are cached briefly', async () => {
  _resetKooraCache(); const urls: string[] = [];
  const f: any = async (u: string) => { urls.push(u); return { ok: true, status: 200, json: async () => (u.includes('/game/') ? { game: sampleGame({ statusGroup: 3, gameTime: 10 }) } : sampleStats()) }; };
  const [a, b] = await Promise.all([loadKooraSnapshot(1, f, 1000), loadKooraSnapshot(1, f, 1000)]);
  assert.ok(a && b); assert.equal(urls.length, 2);                                                   // /game + /stats, once
  await loadKooraSnapshot(1, f, 1000 + 14_000); assert.equal(urls.length, 2);                        // still fresh (15 s)
  await loadKooraSnapshot(1, f, 1000 + 16_000); assert.equal(urls.length, 4);                        // expired → refreshed
  _resetKooraCache(); let calls = 0; const bad: any = async () => { calls++; return { ok: false, status: 403, json: async () => ({}) }; };
  assert.equal(await loadKooraSnapshot(2, bad, 0), null); assert.equal(await loadKooraSnapshot(2, bad, 10_000), null); assert.equal(calls, 2);   // 2nd call served from the failure cache
  const r = await loadLive(sampleFd(), 'SA', sampleMap, bad); assert.deepEqual(r, { available: false, reason: 'upstream_unavailable' });
  assert.deepEqual(await loadLive(sampleFd(), 'SA', null, bad), { available: false, reason: 'no_mapping' });
});

import { gameScore as gameScoreHT } from './koora-live.ts';
test('a half-time score of -1 (not reached yet) is unknown, never "HT -1–-1"', () => {
  const g = { homeCompetitor: { id: 1, score: 1 }, awayCompetitor: { id: 2, score: 2 }, stages: [{ id: 7, homeCompetitorScore: -1, awayCompetitorScore: -1 }] };
  const s = gameScoreHT(g, 1);
  assert.deepEqual([s.home, s.away, s.ht_home, s.ht_away], [1, 2, null, null]);
  const half = gameScoreHT({ ...g, stages: [{ id: 7, homeCompetitorScore: 1, awayCompetitorScore: 1 }] }, 1);
  assert.deepEqual([half.ht_home, half.ht_away], [1, 1]);
  const one = gameScoreHT({ ...g, stages: [{ id: 7, homeCompetitorScore: 1, awayCompetitorScore: -1 }] }, 1);
  assert.deepEqual([one.ht_home, one.ht_away], [null, null]);            // half a half-time score is no half-time score
});
