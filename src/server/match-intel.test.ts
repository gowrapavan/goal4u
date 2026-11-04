/**
 * Run with: npm test   (node's built-in test runner via tsx — no extra dependency)
 * Optional real-data checks: GOAL4U_SAMPLE_DIR=/path/with/matches.json,stats.json npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildMatchIntel, computeTable, headToHead, previousSeason, regularGoals, rowsFromMatches, seasonOfMatch, seasonRecord, teamForm, type RawMatch } from './match-intel';
import { validateLegacyRecord } from './legacy-stats-validation';

/* ───────── fixtures ───────── */
const T = (id: number, name: string) => ({ id, name: `${name} FC`, shortName: name, tla: name.slice(0, 3).toUpperCase(), crest: '' });
const A = T(1, 'Alpha'), B = T(2, 'Bravo'), C = T(3, 'Charlie'), D = T(4, 'Delta');
let nextId = 100;
function mk(home: any, away: any, date: string, ft: [number, number] | null, ht: [number, number] | null = null, over: any = {}): RawMatch {
  return {
    id: over.id ?? nextId++, utcDate: date, status: over.status ?? (ft ? 'FINISHED' : 'TIMED'), matchday: over.matchday ?? 1, stage: over.stage ?? 'REGULAR_SEASON',
    competition: over.competition ?? { id: 1, code: 'XX', type: 'LEAGUE', name: 'Test League' },
    season: { startDate: '2026-08-01', endDate: '2027-05-30' },
    homeTeam: home, awayTeam: away,
    score: { winner: null, duration: over.duration ?? 'REGULAR', fullTime: { home: ft?.[0] ?? null, away: ft?.[1] ?? null }, halfTime: { home: ht?.[0] ?? null, away: ht?.[1] ?? null }, regularTime: over.regularTime ?? { home: null, away: null }, extraTime: { home: null, away: null }, penalties: over.penalties ?? { home: null, away: null } },
  };
}
const file = (matches: RawMatch[], season = '2026-2027', code = 'XX') => ({ season, code, matches });

/* ───────── score semantics ───────── */
test('regularGoals: REGULAR uses fullTime; unknown is null, never zero', () => {
  assert.deepEqual(regularGoals(mk(A, B, '2026-08-01T15:00:00Z', [2, 1])), { home: 2, away: 1 });
  assert.equal(regularGoals(mk(A, B, '2026-08-01T15:00:00Z', null, null, { status: 'FINISHED' })), null);
  assert.equal(regularGoals(mk(A, B, '2026-08-01T15:00:00Z', [1, 0], null, { status: 'POSTPONED' })), null);
});
test('regularGoals: extra time / shoot-out only trusts an explicit regularTime and never adds penalties', () => {
  const shoot = mk(A, B, '2026-08-01T15:00:00Z', [3, 3], null, { duration: 'PENALTY_SHOOTOUT', penalties: { home: 4, away: 2 } });
  assert.equal(regularGoals(shoot), null);
  const withReg = mk(A, B, '2026-08-01T15:00:00Z', [3, 3], null, { duration: 'PENALTY_SHOOTOUT', regularTime: { home: 1, away: 1 }, penalties: { home: 4, away: 2 } });
  assert.deepEqual(regularGoals(withReg), { home: 1, away: 1 });
  const aet = mk(A, B, '2026-08-01T15:00:00Z', [2, 1], null, { duration: 'EXTRA_TIME' });
  assert.equal(regularGoals(aet), null);
});
test('seasonOfMatch / previousSeason', () => {
  assert.equal(seasonOfMatch(mk(A, B, '2026-08-01T15:00:00Z', null)), '2026-2027');
  assert.equal(seasonOfMatch({ season: { startDate: '2026-06-11', endDate: '2026-07-19' } }), undefined); // tournament: not a league season
  assert.equal(previousSeason('2026-2027'), '2025-2026');
  assert.equal(previousSeason('world-cup-2026'), null);
});

/* ───────── table ───────── */
const season = [
  mk(A, B, '2026-08-01T15:00:00Z', [2, 0], [1, 0], { id: 1 }),
  mk(C, D, '2026-08-01T15:00:00Z', [1, 1], [0, 1], { id: 2 }),
  mk(B, C, '2026-08-08T15:00:00Z', [3, 0], [1, 0], { id: 3 }),
  mk(D, A, '2026-08-08T15:00:00Z', [0, 0], [0, 0], { id: 4 }),
  mk(A, C, '2026-08-15T15:00:00Z', null, null, { id: 5 }), // the match being viewed
  mk(B, D, '2026-08-15T15:00:00Z', [9, 9], null, { id: 6 }), // same kickoff: must be excluded from "before"
];
test('table: as of kickoff, excludes current match and any match not strictly earlier, ranks by pts/GD/GF', () => {
  const { rows, excluded } = rowsFromMatches(season, '2026-2027', 'XX');
  const t = computeTable(season, rows, excluded.length, 'XX', Date.parse('2026-08-15T15:00:00Z'), 5)!;
  assert.equal(t.completedMatches, 4);
  const by = Object.fromEntries(t.rows.map((r) => [r.team.id, r]));
  assert.equal(by[1].points, 4); assert.equal(by[2].points, 3); assert.equal(by[4].points, 2); assert.equal(by[3].points, 1);
  assert.deepEqual(t.rows.map((r) => r.team.id), [1, 2, 4, 3]);
  assert.equal(by[1].playedGames, 2);
});
test('table: null before any completed match; non-PL leagues flag ties on points as uncertain', () => {
  const { rows } = rowsFromMatches(season, '2026-2027', 'XX');
  assert.equal(computeTable(season, rows, 0, 'XX', Date.parse('2026-08-01T15:00:00Z'), 1), null);
  const tie = [mk(A, B, '2026-08-01T15:00:00Z', [1, 0]), mk(C, D, '2026-08-01T15:00:00Z', [3, 0]), mk(A, C, '2026-08-20T15:00:00Z', null)];
  const r2 = rowsFromMatches(tie, '2026-2027', 'XX').rows;
  const t = computeTable(tie, r2, 0, 'XX', Date.parse('2026-08-20T15:00:00Z'), tie[2].id)!;
  assert.ok(t.rows.find((r) => r.team.id === 1)!.positionUncertain);   // level on points with C; unverified rules
  const tPL = computeTable(tie, r2, 0, 'PL', Date.parse('2026-08-20T15:00:00Z'), tie[2].id)!;
  assert.ok(!tPL.rows.find((r) => r.team.id === 1)!.positionUncertain); // PL: GD differs, so resolved
});

/* ───────── form, season record, head-to-head ───────── */
test('form: last 5 oldest→newest, never pads, excludes current match and later matches, venue filter works', () => {
  const ms = [1, 2, 3, 4, 5, 6, 7].map((d) => mk(d % 2 ? A : B, d % 2 ? B : A, `2026-08-0${d}T15:00:00Z`, [d % 3, 1]));
  const cur = mk(A, B, '2026-08-05T15:00:00Z', null);
  const rows = rowsFromMatches([...ms, cur], '2026-2027', 'XX').rows;
  const f = teamForm(rows, 1, Date.parse(cur.utcDate), cur.id, 5);
  assert.equal(f.count, 4);                       // only 4 prior matches exist → shown as 4, not padded to 5
  assert.deepEqual(f.items.map((i) => i.date.slice(8, 10)), ['01', '02', '03', '04']);
  assert.ok(f.items.every((i) => i.matchId !== cur.id));
  const home = teamForm(rows, 1, Date.parse(cur.utcDate), cur.id, 5, 'H');
  assert.ok(home.items.every((i) => i.venue === 'H'));
  assert.equal(teamForm(rows, 99, 0, 0).pointsPerMatch, null);
});
test('seasonRecord: clean sheets, failed-to-score, home/away split, half splits only where half-time exists', () => {
  const ms = [mk(A, B, '2026-08-01T15:00:00Z', [2, 0], [1, 0]), mk(C, A, '2026-08-08T15:00:00Z', [1, 0], null), mk(A, D, '2026-08-15T15:00:00Z', [1, 1], [0, 1])];
  const rows = rowsFromMatches(ms, '2026-2027', 'XX').rows;
  const s = seasonRecord(rows, 1, Date.parse('2026-09-01T00:00:00Z'), -1);
  assert.equal(s.played, 3); assert.equal(s.cleanSheets, 1); assert.equal(s.failedToScore, 1);
  assert.equal(s.home.played, 2); assert.equal(s.away.played, 1); assert.equal(s.points, 4);
  assert.deepEqual(s.firstHalf, { goalsFor: 1, goalsAgainst: 1, matches: 2 }); // the match without HT is not counted as 0–0
  assert.deepEqual(s.secondHalf, { goalsFor: 2, goalsAgainst: 0, matches: 2 });
});
test('head-to-head: by team id regardless of venue, excludes current, dedupes across files, counts unusable meetings', () => {
  const m1 = mk(A, B, '2025-01-01T15:00:00Z', [2, 1], null, { id: 11 });
  const m2 = mk(B, A, '2025-09-01T15:00:00Z', [0, 0], null, { id: 12 });
  const m3 = mk(B, A, '2026-01-01T15:00:00Z', [3, 1], null, { id: 13 });
  const pens = mk(A, B, '2026-03-01T15:00:00Z', [1, 1], null, { id: 14, duration: 'PENALTY_SHOOTOUT', penalties: { home: 5, away: 4 } });
  const cur = mk(A, B, '2026-09-01T15:00:00Z', null, null, { id: 15 });
  const files = [file([m1, m2]), file([m2, m3, pens, cur], '2025-2026')]; // m2 appears in both files
  const built = files.map((f) => rowsFromMatches(f.matches, f.season, f.code));
  const h = headToHead(built.flatMap((b) => b.rows), built.flatMap((b) => b.excluded), 1, 2, Date.parse(cur.utcDate), cur.id);
  assert.equal(h.meetings, 3); assert.equal(h.teamAWins, 1); assert.equal(h.draws, 1); assert.equal(h.teamBWins, 1);
  assert.equal(h.teamAGoals, 3); assert.equal(h.teamBGoals, 4);
  assert.equal(h.excludedMeetings, 1);                      // shoot-out without regular-time score is not guessed
  assert.deepEqual(h.last.map((x) => x.matchId), [13, 12, 11]); // newest first
  assert.equal(h.teamAAtHome.meetings, 1);
});

/* ───────── whole-intel behaviour ───────── */
test('buildMatchIntel: upcoming 2026-27 match works with matches only (no stats anywhere)', () => {
  const cur = season[4];
  const i = buildMatchIntel({ match: cur, code: 'XX', season: '2026-2027', files: [file(season)] });
  assert.equal(i.result, null);
  assert.ok(i.table && i.table.rows.length === 4);
  assert.ok(i.facts.some((f) => f.includes('table calculated from results now')));
  assert.equal(i.form.home.overall.count, 2);
});
test('facts: pluralisation, and no table sentence until both clubs have played', () => {
  const ms = [mk(A, B, '2026-08-01T15:00:00Z', [1, 0], null, { id: 21 }), mk(C, D, '2026-08-08T15:00:00Z', null, null, { id: 22 })];
  const i1 = buildMatchIntel({ match: ms[1], code: 'XX', season: '2026-2027', files: [file(ms)] });
  assert.ok(!i1.facts.some((f) => f.includes('table calculated')));            // C and D have not played
  const cur = mk(A, C, '2026-08-20T15:00:00Z', null, null, { id: 23 });
  const all = [...ms, cur];
  const i2 = buildMatchIntel({ match: cur, code: 'XX', season: '2026-2027', files: [file(all)] });
  assert.ok(!i2.facts.some((f) => f.includes('table calculated')));            // C has not played
  assert.ok(!i2.facts.some((f) => /matchs/.test(f)));
});
test('buildMatchIntel: finished match gets result facts incl. comeback; cup/knockout has no table and an unverified-rules note', () => {
  const m = mk(A, B, '2026-09-01T15:00:00Z', [1, 2], [1, 0], { id: 900 });
  const i = buildMatchIntel({ match: m, code: 'XX', season: '2026-2027', files: [file([m])] });
  assert.ok(i.facts.some((f) => /Bravo came from behind to win/.test(f)));
  const cup = mk(A, B, '2026-09-01T15:00:00Z', [2, 2], null, { id: 901, stage: 'LAST_16', duration: 'PENALTY_SHOOTOUT', competition: { id: 2, code: 'CL', type: 'CUP', name: 'Cup' } });
  const c = buildMatchIntel({ match: cup, code: 'CL', season: '2026-2027', files: [file([cup], '2026-2027', 'CL')] });
  assert.equal(c.table, null); assert.ok(c.tableNote);
  assert.equal(c.result, null);                                    // regular-time score unknown → no result sentence
  assert.ok(c.notes.some((n) => /unverified/i.test(n)));
  assert.ok(!c.facts.some((f) => /beat|won|drew/.test(f)));
});

/* ───────── legacy stats validation ───────── */
const fin = mk(A, B, '2024-08-17T14:00:00Z', [0, 3], [0, 1], { id: 777 });
const goal = (team: string, minute: number) => ({ type: 'goal', team, minute, player: 'P. Player', goal_type: 'normal' });
const squad = () => Array.from({ length: 11 }, (_, i) => ({ name: `Player ${i}`, number: String(i + 1), position: 'm', rating: '6.5' }));
const rec = (over: any = {}) => ({
  match_id: 777, fd_competition_code: 'XX', source_url: 'https://example.invalid/live/alpha-bravo-2024-08-17/', status: 'full time',
  home_team: 'Alpha', away_team: 'Bravo', score: { home: 0, away: 3, ht_home: 0, ht_away: 1 },
  stats: { possession: { home: '37%', away: '63%' }, shots: { home: 9, away: 10 }, shots_on_target: { home: 1, away: 5 }, corners: { home: 1, away: 5 } },
  events: [goal('away', 26), goal('away', 60), goal('away', 80)],
  lineups: { home: { formation: null, starting: squad(), subs: [], coach: null }, away: { formation: null, starting: squad(), subs: [], coach: 'C' } },
  ...over,
});
test('legacy: a consistent record is verified; absent statistics stay absent (never 0)', () => {
  const v = validateLegacyRecord(rec(), fin, '777', 'XX');
  assert.equal(v.state, 'verified');
  assert.equal(v.stats!.possession.hn, 37);
  assert.equal(v.stats!.fouls, undefined);
  assert.equal(v.eventsState, 'consistent');
  assert.ok(v.lineups!.home && v.lineups!.away);
});
test('legacy: missing record → missing; record without enough corroboration → unavailable', () => {
  assert.equal(validateLegacyRecord(undefined, fin, '777', 'XX').state, 'missing');
  assert.equal(validateLegacyRecord({ stats: { shots: { home: 1, away: 2 } } }, fin, '777', 'XX').state, 'unavailable');
});
test('legacy: mismatched fixture (score, date, swapped or wrong teams, wrong key) is invalid and exposes nothing', () => {
  for (const bad of [
    rec({ score: { home: 3, away: 0, ht_home: 1, ht_away: 0 } }),
    rec({ source_url: 'https://example.invalid/live/alpha-bravo-2024-09-30/' }),
    rec({ home_team: 'Bravo', away_team: 'Alpha' }),
    rec({ home_team: 'Charlie', away_team: 'Delta' }),
    rec({ match_id: 778 }),
    rec({ fd_competition_code: 'ZZ' }),
  ]) {
    const v = validateLegacyRecord(bad, fin, '777', 'XX');
    assert.equal(v.state, 'invalid', JSON.stringify(v.reasons));
    assert.equal(v.stats, null); assert.equal(v.events, null); assert.equal(v.lineups, null);
  }
  assert.equal(validateLegacyRecord(rec(), fin, '776', 'XX').state, 'invalid'); // record filed under another key is never re-attached
});
test('legacy: an incomplete event list hides only the events — valid statistics and lineups still show', () => {
  const v = validateLegacyRecord(rec({ events: [goal('away', 26)] }), fin, '777', 'XX'); // 1 goal event, score says 3
  assert.equal(v.state, 'verified');
  assert.ok(v.stats && v.stats.possession);
  assert.equal(v.events, null); assert.equal(v.eventsState, 'excluded'); assert.ok(v.eventsReason);
  assert.ok(v.lineups);
});
test('legacy: one contradictory statistic is dropped; the others survive; one-sided values are unknown', () => {
  const v = validateLegacyRecord(rec({ stats: { shots: { home: 2, away: 3 }, shots_on_target: { home: 5, away: 1 }, corners: { home: 4, away: 6 }, fouls: { home: 7, away: null }, possession: { home: '70%', away: '70%' } } }), fin, '777', 'XX');
  assert.equal(v.state, 'verified');
  assert.deepEqual(Object.keys(v.stats!).sort(), ['corners']);
  for (const k of ['shots', 'shots_on_target', 'fouls', 'possession']) assert.ok(v.droppedStats.includes(k), k);
});
test('legacy: card events that disagree with card totals are hidden; goals and subs remain', () => {
  const ev = [goal('away', 26), goal('away', 60), goal('away', 80), { type: 'yellow_card', team: 'home', minute: 10, player: 'X. Y' }];
  const v = validateLegacyRecord(rec({ events: ev, stats: { yellow_cards: { home: 0, away: 0 } } }), fin, '777', 'XX');
  assert.equal(v.eventsState, 'consistent');
  assert.ok(v.events!.every((e: any) => e.type !== 'yellow_card')); assert.ok(v.eventsNote);
});
test('legacy: lineup side without 11 named starters is withheld', () => {
  const v = validateLegacyRecord(rec({ lineups: { home: { starting: squad().slice(0, 10) }, away: { starting: squad() } } }), fin, '777', 'XX');
  assert.equal(v.lineups!.home, null); assert.ok(v.lineups!.away);
});
test('legacy: validation never mutates the source record', () => {
  const r = rec(); const copy = JSON.stringify(r);
  validateLegacyRecord(r, fin, '777', 'XX');
  assert.equal(JSON.stringify(r), copy);
});

/* ───────── optional: real sample files ───────── */
const dir = process.env.GOAL4U_SAMPLE_DIR;
const have = !!dir && existsSync(`${dir}/matches.json`) && existsSync(`${dir}/stats.json`);
test('sample data: every finished 2026-27 match builds; table points are conserved; stats from another season are never attached', { skip: !have }, () => {
  const matches: RawMatch[] = JSON.parse(readFileSync(`${dir}/matches.json`, 'utf8')).data;
  const stats = JSON.parse(readFileSync(`${dir}/stats.json`, 'utf8')).data;
  const season = '2026-2027';
  const finished = matches.filter((m) => m.status === 'FINISHED');
  assert.ok(finished.length > 0);
  for (const m of finished) assert.doesNotThrow(() => buildMatchIntel({ match: m, code: 'PL', season, files: [{ season, code: 'PL', matches }] }));
  const rows = rowsFromMatches(matches, season, 'PL');
  const t = computeTable(matches, rows.rows, rows.excluded.length, 'PL', Date.parse('2100-01-01'), -1)!;
  const expected = finished.reduce((n, m) => n + (m.score.fullTime.home === m.score.fullTime.away ? 2 : 3), 0);
  assert.equal(t.rows.reduce((n, r) => n + r.points, 0), expected);
  // 2026-27 matches have no legacy record at all
  assert.equal(validateLegacyRecord(stats[String(finished[0].id)], finished[0], String(finished[0].id), 'PL').state, 'missing');
  // a 2024-25 record forced onto a 2026-27 match must be rejected, not attached
  const [k, r] = Object.entries<any>(stats)[0];
  assert.equal(validateLegacyRecord(r, finished[0], k, 'PL').state, 'invalid');
});
