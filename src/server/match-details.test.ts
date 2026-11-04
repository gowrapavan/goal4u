import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchDetails, PLAYER_STAT_LABELS } from './match-details';
import './test-data-env.ts';
import { pitchLayout, playerPhoto, ratingTone, fromLegacyLineup } from '../lib/match-details-types';
import { realGame, realFd, realMap } from './match-details-fixture';

const D = () => buildMatchDetails(realFd(), realMap, realGame())!;
const ARABIC = /[\u0600-\u06FF]/;
const strings = (o: any, out: string[] = []): string[] => { if (typeof o === 'string') out.push(o); else if (o && typeof o === 'object') Object.values(o).forEach((v) => strings(v, out)); return out; };

test('line-up: 11 starters per side with positions, athlete ids, ratings; formation and coach', () => {
  const d = D(); assert.equal(d.home.starters.length, 11); assert.equal(d.away.starters.length, 11);
  assert.equal(d.home.formation, '4-2-3-1'); assert.equal(d.home.coach!.name, 'Jose Mourinho'); assert.equal(d.home.coach!.athleteId, 46116);
  const mb = d.home.starters.find((p) => p.name === 'Kylian Mbappe')!;
  assert.deepEqual([mb.athleteId, mb.number, mb.pos, mb.role, mb.line, mb.side, mb.rating, mb.minutes], [39820, '10', 'f', 'Centre Forward', 5, 50, 8.3, 84]);
  assert.equal(d.home.starters[0].name, 'Thibaut Courtois'); assert.equal(d.home.starters[0].line, 1);
});

test('goals, penalty goals, assists and cards are counted per player from the events', () => {
  const d = D(); const get = (n: string) => [...d.home.starters, ...d.home.bench, ...d.away.starters, ...d.away.bench].find((p) => p.name === n)!;
  assert.equal(get('Kylian Mbappe').goals, 2); assert.equal(get('Arda Guler').goals, 1); assert.equal(get('Yan Diomande').goals, 1); assert.equal(get('Yan Diomande').assists, 1);
  assert.equal(get('Jude Bellingham').assists, 1); assert.equal(get('Aurelien Tchouameni').assists, 1); assert.equal(get('Manu Bueno').goals, 1); assert.equal(get('Lucas Stassin').assists, 1);
  assert.equal(get('Dean Huijsen').yellow, 1); assert.equal(get('Marc Cucurella').yellow, 1); assert.equal(get('Juan Iglesias').yellow, 1); assert.equal(get('Thibaut Courtois').yellow, 0);
  assert.equal(d.home.starters.reduce((n, p) => n + p.goals, 0) + d.home.bench.reduce((n, p) => n + p.goals, 0), 4);
});

test('substitutions: minute, who came on for whom; both players are marked', () => {
  const d = D(); assert.deepEqual(d.home.subs.map((s) => [s.minute, s.playerIn.name, s.playerOut.name]), [
    [69, 'Brahim Diaz', 'Endrick'], [70, 'Bernardo Silva', 'Jude Bellingham'], [78, 'Eduardo Camavinga', 'Arda Guler'], [85, 'Eder Militao', 'Federico Valverde'], [85, 'Carlos Espi', 'Kylian Mbappe']]);
  assert.equal(d.home.starters.find((p) => p.name === 'Endrick')!.subbedOffAt, 69); assert.equal(d.home.bench.find((p) => p.name === 'Brahim Diaz')!.subbedOnAt, 69);
  assert.equal(d.away.subs[0].minute, 46); assert.equal(d.away.subs.length, 5);
  assert.deepEqual(d.home.bench.slice(0, 5).map((p) => p.subbedOnAt), [69, 70, 78, 85, 85]);                      // those who played first, in order
  assert.equal(d.home.bench[5].name, 'Andriy Lunin'); assert.equal(d.home.bench[5].subbedOnAt, null);
});

test('missing players: injury (translated from the provider constant) and suspension, with the expected return', () => {
  const m = D().home.missing; const by = (n: string) => m.find((x) => x.name === n)!;
  assert.deepEqual([by('Vinicius Junior').kind, by('Vinicius Junior').reason], ['suspension', 'Suspended (red card)']);
  assert.deepEqual([by('Raul Asencio').reason, by('Raul Asencio').expectedReturn], ['Leg injury', 'Early January 2027']);
  assert.deepEqual([by('Rodrygo').reason, by('Rodrygo').expectedReturn], ['Cruciate ligament injury', 'Late December 2026']);
  assert.equal(by('Ferland Mendy').expectedReturn, 'Back in training'); assert.equal(D().away.missing.find((x) => x.name === 'Marcao')!.reason, 'Muscle injury');
});

test('player statistics: translated labels, Arabic-only and zero values dropped, goals with penalties cleaned, minutes kept out of the list', () => {
  const mb = D().home.starters.find((p) => p.name === 'Kylian Mbappe')!;
  assert.deepEqual(mb.stats.map((s) => `${s.label}: ${s.value}`), ['Goals: 2 (1 pen)', 'Penalties won: 1', 'Expected goals (xG): 1.8', 'Shots: 5', 'Shots on target: 3', 'Accurate passes: 25/32 (78%)', 'Big chances scored: 2', 'Touches: 54']);
  assert.ok(Object.values(PLAYER_STAT_LABELS).every((l) => !ARABIC.test(l)));
});

test('NOTHING Arabic anywhere in the details', () => { assert.deepEqual(strings(D()).filter((s) => ARABIC.test(s)), []); });

test('shot map: orientation to the fixture home side, outcomes, body part, situation, xG', () => {
  const s = D().shots; assert.equal(s.length, 9); assert.equal(s[0].minute, 3); assert.equal(s[0].team, 'away');
  const pen = s.find((x) => x.minute === 63)!; assert.deepEqual([pen.team, pen.player, pen.outcome, pen.situation, pen.body, pen.xg, pen.xgot], ['home', 'Kylian Mbappe', 'goal', 'Penalty', 'Right foot', 0.79, 0.93]);
  assert.equal(s.filter((x) => x.outcome === 'goal').length, 5); assert.equal(s.find((x) => x.minute === 90)!.outcome, 'saved');
  const swapped = buildMatchDetails(realFd({ homeTeam: realFd().awayTeam, awayTeam: realFd().homeTeam }), { ...realMap, fd_home_s365_id: realMap.fd_away_s365_id, fd_away_s365_id: realMap.fd_home_s365_id }, realGame())!;
  assert.equal(swapped.shots.find((x) => x.minute === 63)!.team, 'away');
  assert.equal(swapped.home.starters[0].name, 'Odisseas Vlachodimos');
});

test('top performers, match info, fan vote, ball-in-play time, highlights', () => {
  const d = D(); assert.deepEqual(d.performers.map((p) => p.category), ['Attack', 'Midfield', 'Defence']);
  assert.equal(d.performers[0].home!.name, 'Kylian Mbappe'); assert.deepEqual(d.performers[0].home!.stats.map((s) => s.label), ['Expected goals (xG)', 'Shots on target', 'Minutes']);
  assert.equal(d.performers[2].away!.name, 'Jose Angel Carmona');
  assert.deepEqual(d.info, { venue: 'Santiago Bernabeu', attendance: 73907, capacity: 81044, referee: 'Mateo Busquets Ferrer', tv: 'beIN SPORTS HD 1' });
  assert.deepEqual(d.fans, { win: { home: 79, draw: 8, away: 13, votes: 113993 }, goals: { line: 2.5, under: 25, over: 75, votes: 1863 } });
  assert.deepEqual([d.playTime!.played, d.playTime!.total, Math.round(d.playTime!.share * 100)], ['60:38', '98:09', 62]);
  assert.deepEqual(d.highlights, { id: 'yu_va7r7kko', url: 'https://www.youtube.com/watch?v=yu_va7r7kko' });
});

test('a stale pairing returns nothing rather than another match', () => { assert.equal(buildMatchDetails(realFd(), { ...realMap, fd_home_s365_id: 1, fd_away_s365_id: 2 }, realGame()), null); });

test('pitch layout from the provider positions: rows by line, left-to-right by side, goalkeeper at the bottom', () => {
  const d = D(); const placed = pitchLayout(d.home.starters, d.home.formation); assert.equal(placed.length, 11);
  const at = (n: string) => placed.find((p) => p.player.name === n)!;
  assert.ok(at('Thibaut Courtois').y > at('Marc Cucurella').y && at('Marc Cucurella').y > at('Aurelien Tchouameni').y && at('Aurelien Tchouameni').y > at('Jude Bellingham').y && at('Jude Bellingham').y > at('Kylian Mbappe').y);
  assert.ok(at('Marc Cucurella').x < at('Dean Huijsen').x && at('Dean Huijsen').x < at('Ibrahima Konate').x && at('Ibrahima Konate').x < at('Federico Valverde').x);
  assert.ok(placed.every((p) => p.x >= 5 && p.x <= 95 && p.y >= 5 && p.y <= 95));
});

test('pitch layout without positions (stats.json line-ups): rebuilt from the formation string; unusable formation → by position', () => {
  const side = { formation: '4-2-3-1', coach: 'C', starting: Array.from({ length: 11 }, (_, i) => ({ name: `P${i}`, number: String(i + 1), position: i === 0 ? 'g' : i < 5 ? 'd' : i < 9 ? 'm' : 'f', rating: '6.5' })), subs: [{ name: 'S', number: '12' }] };
  const t = fromLegacyLineup(side)!; const rows = (pl: ReturnType<typeof pitchLayout>) => [...new Set(pl.map((p) => Math.round(p.y)))].map((y) => pl.filter((p) => Math.round(p.y) === y).length);
  assert.deepEqual(rows(pitchLayout(t.starters, '4-2-3-1')), [1, 4, 2, 3, 1].reverse().reverse());
  assert.deepEqual(rows(pitchLayout(t.starters, 'nonsense')), [1, 4, 4, 2]);
  assert.equal(fromLegacyLineup({ starting: [] }), null); assert.equal(t.bench.length, 1); assert.equal(t.starters[0].rating, 6.5);
});

test('photo URL and rating tones', () => {
  assert.equal(playerPhoto(46116, 32), '/api/data/img/headshot/46116.png');
  assert.deepEqual([8.3, 7.7, 6.9, 5.4, null].map(ratingTone), ['blue', 'green', 'amber', 'red', 'none']);
});

import { resolveMatchDetails } from './match-details';
test('details route: too early → not_yet; unpaired → no_mapping; feed down → upstream_unavailable; wrong game → mismatch; otherwise the details', async () => {
  const NOW = Date.parse('2026-10-18T21:00:00Z'); const snap = async () => ({ game: realGame() });
  assert.deepEqual(await resolveMatchDetails({ match: realFd({ utcDate: '2026-10-19T19:00:00Z' }), mapEntry: realMap, loadSnapshot: snap, nowMs: NOW }), { available: false, reason: 'not_yet' });
  assert.deepEqual(await resolveMatchDetails({ match: realFd(), mapEntry: null, resolveMap: async () => null, loadSnapshot: snap, nowMs: NOW }), { available: false, reason: 'no_mapping' });
  assert.deepEqual(await resolveMatchDetails({ match: realFd(), mapEntry: realMap, loadSnapshot: async () => null, nowMs: NOW }), { available: false, reason: 'upstream_unavailable' });
  assert.deepEqual(await resolveMatchDetails({ match: realFd(), mapEntry: { ...realMap, fd_home_s365_id: 9, fd_away_s365_id: 8 }, loadSnapshot: snap, nowMs: NOW }), { available: false, reason: 'mismatch' });
  const ok = await resolveMatchDetails({ match: realFd(), mapEntry: null, resolveMap: async () => realMap, loadSnapshot: snap, nowMs: NOW });
  assert.ok(ok.available && ok.details.home.starters.length === 11);
  const early = await resolveMatchDetails({ match: realFd({ utcDate: '2026-10-18T22:30:00Z' }), mapEntry: realMap, loadSnapshot: snap, nowMs: NOW });   // 1.5 h before kick-off: allowed
  assert.ok(early.available);
});
