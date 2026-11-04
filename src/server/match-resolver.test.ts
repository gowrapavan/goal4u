import test from 'node:test';
import assert from 'node:assert/strict';
import { matchOne, sameTeam365, resolveMapEntry, norm, _resetResolverCache } from './match-resolver';

const team = (id: number, name: string, shortName?: string, tla?: string) => ({ id, name, shortName: shortName ?? name, tla });
const g = (id: number, start: string, h: [number, string, string], a: [number, string, string]) => ({ id, startTime: start, competitionId: 11,
  homeCompetitor: { id: h[0], name: h[1], nameForURL: h[2] }, awayCompetitor: { id: a[0], name: a[1], nameForURL: a[2] } });
const fd = (o: any = {}) => ({ id: 564716, utcDate: '2026-10-17T19:00:00Z', homeTeam: team(1, 'RC Deportivo de La Coruña', 'Deportivo', 'DEP'), awayTeam: team(2, 'Levante UD', 'Levante', 'LEV'), ...o });
const day = [
  g(901, '2026-10-17T19:00:00+00:00', [10, 'Real Betis', 'real-betis'], [11, 'Getafe', 'getafe']),
  g(902, '2026-10-17T19:00:00+00:00', [20, 'Deportivo', 'deportivo-la-coruna'], [21, 'Levante', 'levante']),
  g(903, '2026-10-17T21:00:00+00:00', [30, 'Real Madrid', 'real-madrid'], [31, 'Sevilla', 'sevilla']),
];

test('names are normalised like the worker (accents, club suffixes, punctuation)', () => {
  assert.equal(norm('FC Internazionale Milano'), 'internazionalemilano'); assert.equal(norm('Atlético de Madrid'), 'atleticomadrid'); assert.equal(norm('Como 1907'), 'como1907');
  assert.ok(sameTeam365(team(1, 'Levante UD', 'Levante'), { name: 'Levante', nameForURL: 'levante' }));
  assert.ok(sameTeam365(team(3, 'FC Internazionale Milano', 'Inter', 'INT'), { name: 'Inter', nameForURL: 'inter' }));
  assert.ok(sameTeam365(team(4, 'Manchester United FC', 'Man United'), { name: 'Manchester United', nameForURL: 'manchester-united' }));
  assert.ok(!sameTeam365(team(5, 'Real Madrid CF', 'Real Madrid'), { name: 'Real Betis', nameForURL: 'real-betis' }));
  assert.ok(!sameTeam365(team(6, 'Sevilla FC', 'Sevilla'), { name: 'Valencia', nameForURL: 'valencia' }));
});

test('matchOne pairs by BOTH teams and kick-off, and knows which side is home', () => {
  assert.deepEqual(matchOne(fd(), day), { s365_id: 902, fd_home_s365_id: 20, fd_away_s365_id: 21, how: 'auto', fd_home_id: 1, fd_away_id: 2 });
  const sw = matchOne(fd({ homeTeam: team(2, 'Levante UD', 'Levante'), awayTeam: team(1, 'RC Deportivo de La Coruña', 'Deportivo') }), day)!;
  assert.equal(sw.s365_id, 902); assert.equal(sw.fd_home_s365_id, 21); assert.equal(sw.fd_away_s365_id, 20);        // fd home = 365 away
  assert.equal(matchOne(fd({ utcDate: '2026-10-17T19:10:00Z' }), day)!.how, 'auto');                                  // within ±15 min
  assert.equal(matchOne(fd({ utcDate: '2026-10-17T22:00:00Z' }), day)!.how, 'auto_loose');                            // rescheduled: both teams, other time
});

test('a one-team guess or a different day is never accepted (no wrong statistics on a page)', () => {
  assert.equal(matchOne(fd({ awayTeam: team(9, 'Valencia CF', 'Valencia') }), day), null);
  assert.equal(matchOne(fd({ utcDate: '2026-10-20T19:00:00Z' }), day), null);
  assert.equal(matchOne(fd({ homeTeam: { id: 0, name: 'x' } }), day), null);
});

test('resolveMapEntry: one request per day, found pairings cached, misses cached briefly, an unreachable source retried soon', async () => {
  _resetResolverCache(); const urls: string[] = [];
  const f: any = async (u: string) => { urls.push(u); return { ok: true, status: 200, json: async () => ({ games: day }) }; };
  const e = await resolveMapEntry(fd(), f, 1_000); assert.equal(e!.s365_id, 902);
  assert.ok(urls.every((u) => u.includes('startDate=17%2F10%2F2026'))); assert.equal(urls.length, 1);                  // 19:00 UTC: just that day
  await resolveMapEntry(fd(), f, 60_000); assert.equal(urls.length, 1);                                                // cached
  const other = fd({ id: 777, homeTeam: team(1, 'RC Deportivo de La Coruña', 'Deportivo'), awayTeam: team(2, 'Levante UD', 'Levante') });
  await resolveMapEntry(other, f, 2_000); assert.equal(urls.length, 1);                                                // the day's games are shared between fixtures

  _resetResolverCache(); let n = 0; const down: any = async () => { n++; return { ok: false, status: 403, json: async () => ({}) }; };
  assert.equal(await resolveMapEntry(fd(), down, 0), null); assert.equal(await resolveMapEntry(fd(), down, 30_000), null); assert.equal(n, 1);   // failure cached 1 min
  await resolveMapEntry(fd(), down, 90_000); assert.equal(n, 2);
});

test('a fixture near midnight also looks at the neighbouring day', async () => {
  _resetResolverCache(); const urls: string[] = [];
  const f: any = async (u: string) => { urls.push(decodeURIComponent(u)); return { ok: true, status: 200, json: async () => ({ games: [] }) }; };
  await resolveMapEntry(fd({ utcDate: '2026-10-17T23:50:00Z' }), f, 0);
  assert.deepEqual(urls.map((u) => /startDate=(\d\d\/\d\d\/\d{4})/.exec(u)![1]).sort(), ['17/10/2026', '18/10/2026']);
});
