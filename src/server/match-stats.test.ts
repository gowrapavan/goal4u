import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatchStats, liveWindow } from './match-stats';
import { buildLivePayload } from './koora-live';
import { validateStats365Record, validateLegacyRecord, isStats365Record } from './legacy-stats-validation';
import { sampleGame, sampleStats, sampleFd, sampleMap } from './koora-fixtures';

const NOW = Date.parse('2026-08-22T18:00:00Z');                 // 90 min after kick-off
const KEY = '558629';
const lineup = (n: string) => ({ formation: '4-4-2', coach: 'C', starting: Array.from({ length: 11 }, (_, i) => ({ name: `${n}${i}`, number: String(i + 1), position: i ? 'm' : 'g', rating: '6.5' })), subs: [] });
/** a record exactly as workers/stats365.py writes it */
const rec365 = (o: any = {}) => ({
  scraped_at: '2026-08-22T19:00:00Z', source_url: 'https://www.koora-l.live/game/4732358', status: 'full time', home_team: 'Udinese', away_team: 'Como',
  score: { home: 1, away: 1, ht_home: 1, ht_away: 0 }, stats: { possession: { home: '38%', away: '62%' }, shots: { home: 13, away: 11 }, shots_on_target: { home: 4, away: 3 }, corners: { home: 5, away: 3 } },
  events: [{ minute: 29, type: 'goal', team: 'home', player: 'Hassane Kamara', goal_type: 'normal' }, { minute: 54, type: 'goal', team: 'away', player: 'Anastasios Douvikas', goal_type: 'normal' }],
  lineups: { home: lineup('H'), away: lineup('A') }, match_id: 558629, fd_competition_code: 'SA', s365_id: 4732358, recorded: true,
  all_stats: { tackles_won: { id: 51, name: 'Successful Tackles', home: 9, away: 7 }, possession: { id: 10, name: 'Possession', home: 38, away: 62 }, stat_999: { id: 999, name: 'إحصائية', home: 3, away: 2 } }, ...o,
});
const never = async () => { throw new Error('live must not be asked'); };

test('liveWindow: in play, kicked-off-but-unconfirmed, just-finished-unrecorded; nothing else', () => {
  const m = (status: string, mins: number) => ({ status, utcDate: new Date(NOW - mins * 60_000).toISOString() });
  assert.equal(liveWindow(m('IN_PLAY', 30), false, NOW), 'live'); assert.equal(liveWindow(m('PAUSED', 46), false, NOW), 'live');
  assert.equal(liveWindow(m('TIMED', 10), false, NOW), 'live'); assert.equal(liveWindow(m('TIMED', -30), false, NOW), null); assert.equal(liveWindow(m('SCHEDULED', 300), false, NOW), 'recent'); assert.equal(liveWindow(m('SCHEDULED', 60 * 24 * 4), false, NOW), null);
  assert.equal(liveWindow(m('IN_PLAY', 600), false, NOW), 'recent');   // repo still says IN_PLAY long after the match: final numbers only
  assert.equal(liveWindow(m('FINISHED', 120), false, NOW), 'recent'); assert.equal(liveWindow(m('FINISHED', 120), true, NOW), null);
  assert.equal(liveWindow(m('FINISHED', 60 * 24 * 3), false, NOW), 'recent');            // finished days ago, nothing recorded: the live source still has the final numbers
  assert.equal(liveWindow(m('FINISHED', 60 * 24 * 70), false, NOW), null);
});

test('finished + recorded stats.json → stats365 tier, live is NEVER asked', async () => {
  const r = await resolveMatchStats({ match: sampleFd(), code: 'SA', key: KEY, record: rec365(), mapEntry: sampleMap, fetchLive: never, nowMs: NOW });
  assert.equal(r.statsSource, 'stats365'); assert.equal(r.stats!.stats!.possession.hn, 38); assert.equal(r.stats!.lineups!.home!.starting.length, 11);
  assert.deepEqual(r.stats!.moreStats!.map((x) => x.name), ['Successful Tackles']); assert.equal(r.live, null); assert.equal(r.liveEligible, false);
});

test('in play → live tier, with the payload and polling flag; stats.json is not consulted for the numbers', async () => {
  const g = sampleGame({ statusGroup: 3, statusText: 'الشوط الثاني', gameTime: 60 }); const fd = sampleFd({ status: 'IN_PLAY' });
  const r = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: null, mapEntry: sampleMap, nowMs: NOW, fetchLive: async () => buildLivePayload(fd, 'SA', sampleMap, g, sampleStats()) });
  assert.equal(r.statsSource, 'live'); assert.equal(r.live!.status, 'live'); assert.equal(r.liveEligible, true); assert.equal(r.stats!.source, 'koora_live_v1'); assert.equal(r.stats!.stats!.shots.hn, 13);
});

test('finished a little while ago and not recorded yet → live tier gives the final numbers; no more polling', async () => {
  const fd = sampleFd();
  const r = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: null, mapEntry: sampleMap, nowMs: NOW, fetchLive: async () => buildLivePayload(fd, 'SA', sampleMap, sampleGame(), sampleStats()) });
  assert.equal(r.statsSource, 'live'); assert.equal(r.live!.status, 'full time'); assert.equal(r.liveEligible, false);
});

test('live source down while in play → falls back to the stats.json snapshot, and keeps polling', async () => {
  const fd = sampleFd({ status: 'IN_PLAY' });
  const snap = rec365({ status: 'live', recorded: false, score: { home: 1, away: 0, ht_home: 1, ht_away: 0 }, events: [{ minute: 29, type: 'goal', team: 'home', player: 'Hassane Kamara', goal_type: 'normal' }] });
  const r = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: snap, mapEntry: sampleMap, nowMs: NOW, fetchLive: async () => ({ available: false, reason: 'upstream_unavailable' }) });
  assert.equal(r.statsSource, 'stats365'); assert.equal(r.liveEligible, true);
});

test('a snapshot taken mid-match is never shown as the final numbers of a finished match', async () => {
  const v = validateStats365Record(rec365({ status: 'live', recorded: false }), sampleFd(), KEY, 'SA', sampleMap);
  assert.equal(v.state, 'unavailable'); assert.equal(v.stats, null);
  const r = await resolveMatchStats({ match: sampleFd(), code: 'SA', key: KEY, record: rec365({ status: 'half time', recorded: false }), mapEntry: null, fetchLive: never, nowMs: NOW });
  assert.equal(r.statsSource, 'none');
});

test('association rules: wrong id / wrong competition / wrong score / reversed teams / mismatching 365 id are refused', () => {
  const t = (o: any, map: any = sampleMap, fd: any = sampleFd()) => validateStats365Record(rec365(o), fd, KEY, 'SA', map).state;
  assert.equal(t({}), 'verified');
  assert.equal(t({ match_id: 1 }), 'invalid'); assert.equal(t({ fd_competition_code: 'PL' }), 'invalid');
  assert.equal(t({ score: { home: 3, away: 0, ht_home: 1, ht_away: 0 } }), 'invalid'); assert.equal(t({ home_team: 'Como', away_team: 'Udinese' }), 'invalid');
  assert.equal(t({}, { ...sampleMap, s365_id: 5 }), 'invalid');
  assert.equal(t({}, { ...sampleMap, how: 'weak' }), 'verified');                                       // names confirm it → fine
  assert.equal(t({ home_team: 'Zzz', away_team: 'Como' }, { ...sampleMap, how: 'weak' }), 'unavailable');   // weak pairing + one name unconfirmed
  assert.equal(t({}, null), 'verified');                                                                 // score + teams are enough without match_map
});

test('extra time: events are judged against the full-time score; goals that do not add up are withheld', () => {
  const et = sampleFd({ score: { duration: 'EXTRA_TIME', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } } });
  const ev = [{ minute: 29, type: 'goal', team: 'home', player: 'A' }, { minute: 54, type: 'goal', team: 'away', player: 'B' }, { minute: 105, type: 'goal', team: 'home', player: 'C' }];
  const ok = validateStats365Record(rec365({ score: { home: 2, away: 1, ht_home: 1, ht_away: 0 }, events: ev }), et, KEY, 'SA', sampleMap);
  assert.equal(ok.state, 'verified'); assert.equal(ok.eventsState, 'consistent');
  const bad = validateStats365Record(rec365({ events: ev.slice(0, 1) }), sampleFd(), KEY, 'SA', sampleMap);
  assert.equal(bad.eventsState, 'excluded'); assert.ok(bad.stats);                                       // events hidden, statistics still shown
});

test('BACKUP: old yallashoot-format records and missing records still use the existing legacy path, unchanged', async () => {
  const legacy = { scraped_at: 'x', source_url: 'https://yallashoot.soccer/live/udinese-como-2026-08-22/', status: 'full time', home_team: 'Udinese', away_team: 'Como', score: { home: 1, away: 1, ht_home: 1, ht_away: 0 },
    stats: { possession: { home: '40%', away: '60%' }, shots: { home: 10, away: 9 } }, events: [], lineups: {}, match_id: 558629, fd_competition_code: 'SA' };
  assert.equal(isStats365Record(legacy), false);
  const r = await resolveMatchStats({ match: sampleFd(), code: 'SA', key: KEY, record: legacy, mapEntry: null, fetchLive: never, nowMs: NOW });
  assert.equal(r.statsSource, 'legacy'); assert.equal(r.stats!.source, 'legacy_yallashoot_v1'); assert.equal(r.stats!.stats!.possession.hn, 40);
  assert.equal(JSON.stringify(r.statsStatus.state), JSON.stringify(validateLegacyRecord(legacy, sampleFd(), KEY, 'SA').state));
  const none = await resolveMatchStats({ match: sampleFd({ utcDate: '2026-08-01T10:00:00Z' }), code: 'SA', key: KEY, record: null, mapEntry: null, fetchLive: never, nowMs: NOW });
  assert.equal(none.statsSource, 'none'); assert.equal(none.stats, null); assert.equal(none.statsStatus.state, 'missing');
});

test('no pairing available → the live feed is never asked, and a match in play keeps retrying the pairing', async () => {
  const r = await resolveMatchStats({ match: sampleFd({ status: 'IN_PLAY' }), code: 'SA', key: KEY, record: null, mapEntry: null, fetchLive: never, nowMs: NOW });
  assert.equal(r.statsSource, 'none'); assert.equal(r.liveEligible, true); assert.equal(r.liveReason, 'no_mapping');
});

test('NO match_map.json at all: an in-play match is paired on demand and shows live stats', async () => {
  const fd = sampleFd({ status: 'IN_PLAY' }); let paired = 0;
  const g = sampleGame({ statusGroup: 3, statusText: 'الشوط الثاني', gameTime: 60 });
  const r = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: null, mapEntry: null, nowMs: NOW,
    resolveMap: async () => { paired++; return sampleMap; }, fetchLive: async (m) => buildLivePayload(fd, 'SA', m, g, sampleStats()) });
  assert.equal(paired, 1); assert.equal(r.statsSource, 'live'); assert.equal(r.liveEligible, true); assert.equal(r.liveReason, null);
});

test('NO match_map.json and NO stats.json: a match finished days ago gets its final numbers from the live source', async () => {
  const fd = sampleFd({ utcDate: new Date(NOW - 3 * 86_400_000).toISOString() });
  const r = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: null, mapEntry: null, nowMs: NOW,
    resolveMap: async () => sampleMap, fetchLive: async (m) => buildLivePayload(fd, 'SA', m, sampleGame(), sampleStats()) });
  assert.equal(r.statsSource, 'live'); assert.equal(r.live!.status, 'full time'); assert.equal(r.liveEligible, false); assert.equal(r.stats!.stats!.shots.hn, 13);
});

test('pairing fails or the feed is down: the page is told WHY, and a live match keeps being retried', async () => {
  const inPlay = sampleFd({ status: 'IN_PLAY' });
  const a = await resolveMatchStats({ match: inPlay, code: 'SA', key: KEY, record: null, mapEntry: null, nowMs: NOW, resolveMap: async () => null, fetchLive: never });
  assert.equal(a.statsSource, 'none'); assert.equal(a.liveReason, 'no_mapping'); assert.equal(a.liveEligible, true);
  const b = await resolveMatchStats({ match: sampleFd(), code: 'SA', key: KEY, record: null, mapEntry: null, nowMs: NOW, resolveMap: async () => sampleMap, fetchLive: async () => ({ available: false, reason: 'upstream_unavailable' }) });
  assert.equal(b.liveReason, 'upstream_unavailable'); assert.equal(b.liveEligible, false);
});

test('a recorded match never triggers pairing or a live request', async () => {
  const r = await resolveMatchStats({ match: sampleFd(), code: 'SA', key: KEY, record: rec365(), mapEntry: null, nowMs: NOW, resolveMap: never as any, fetchLive: never });
  assert.equal(r.statsSource, 'stats365');
});

test('ORDER, finished match: valid JSON in GitHub wins and the API is never called — recorded or legacy format', async () => {
  const legacy = { scraped_at: 'x', source_url: 'https://yallashoot.soccer/live/udinese-como-2026-08-22/', status: 'full time', home_team: 'Udinese', away_team: 'Como', score: { home: 1, away: 1, ht_home: 1, ht_away: 0 },
    stats: { possession: { home: '40%', away: '60%' }, shots: { home: 10, away: 9 } }, events: [], lineups: {}, match_id: 558629, fd_competition_code: 'SA' };
  for (const [record, src] of [[rec365(), 'stats365'], [legacy, 'legacy']] as const) {
    const r = await resolveMatchStats({ match: sampleFd(), code: 'SA', key: KEY, record, mapEntry: sampleMap, nowMs: NOW, resolveMap: never as any, fetchLive: never });
    assert.equal(r.statsSource, src);
  }
});

test('ORDER, finished match: the API is the fallback when the JSON is missing, a mid-match snapshot, or invalid', async () => {
  const fd = sampleFd(); const live = async (m: any) => buildLivePayload(fd, 'SA', m, sampleGame(), sampleStats());
  for (const record of [null, rec365({ status: 'live', recorded: false }), rec365({ match_id: 1 })]) {
    const r = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record, mapEntry: sampleMap, nowMs: NOW, fetchLive: live });
    assert.equal(r.statsSource, 'live');
  }
});

test('ORDER, in play: the API first (a stored snapshot is stale); the snapshot only when the API gives nothing', async () => {
  const fd = sampleFd({ status: 'IN_PLAY' }); const g = sampleGame({ statusGroup: 3, gameTime: 60 });
  const snap = rec365({ status: 'live', recorded: false, score: { home: 1, away: 0, ht_home: 1, ht_away: 0 }, events: [{ minute: 29, type: 'goal', team: 'home', player: 'Hassane Kamara', goal_type: 'normal' }] });
  const a = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: snap, mapEntry: sampleMap, nowMs: NOW, fetchLive: async (m) => buildLivePayload(fd, 'SA', m, g, sampleStats()) });
  assert.equal(a.statsSource, 'live');
  const b = await resolveMatchStats({ match: fd, code: 'SA', key: KEY, record: snap, mapEntry: sampleMap, nowMs: NOW, fetchLive: async () => ({ available: false, reason: 'upstream_unavailable' }) });
  assert.equal(b.statsSource, 'stats365'); assert.equal(b.liveReason, 'upstream_unavailable');
});
