import './test-data-env.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailsFromRecord, s365ToRepoIds, remapToRepoIds, mergeDetails, hasGaps, expectedReturnEn } from './match-details-record';
import { resolveMatchDetails, buildMatchDetails } from './match-details';
import { pitchLayout, playerPhoto } from '../lib/match-details-types';
import { realGame, realFd, realMap } from './match-details-fixture';

// A real record from goal4u-data/data/2026-2027/PL/stats.json (Arsenal 3-0 Coventry), heatmap URLs removed.
const REC = () => JSON.parse(readFileSync(new URL('./match-details-record-fixture.json', import.meta.url), 'utf8'));
const D = () => detailsFromRecord(REC())!;
const ARABIC = /[\u0600-\u06FF]/;
const strings = (o: any, out: string[] = []): string[] => { if (typeof o === 'string') out.push(o); else if (o && typeof o === 'object') Object.values(o).forEach((v) => strings(v, out)); return out; };

test('record line-up: 11 starters with repo ids, pitch positions, ratings, formation and coach', () => {
  const d = D(); assert.equal(d.source, 'stats.json'); assert.equal(d.home.starters.length, 11); assert.equal(d.away.starters.length, 11);
  assert.equal(d.home.formation, '4-2-3-1'); assert.equal(d.home.coach!.name, 'Mikel Arteta'); assert.equal(d.home.coach!.athleteId, 179744);
  const gk = d.home.starters[0]; assert.deepEqual([gk.name, gk.athleteId, gk.s365Id, gk.number, gk.pos, gk.role, gk.line, gk.side, gk.rating, gk.minutes], ['David Raya', 4832, 3941, '1', 'g', 'Goalkeeper', 1, 50, 7.2, 90]);
  const placed = pitchLayout(d.home.starters, d.home.formation); assert.equal(placed.length, 11);
  assert.ok(placed.find((p) => p.player.name === 'David Raya')!.y > placed.find((p) => p.player.name === 'Kai Havertz')!.y);
});

test('goals, assists, cards and substitutions come from the record events', () => {
  const d = D(); const all = [...d.home.starters, ...d.home.bench, ...d.away.starters, ...d.away.bench]; const get = (n: string) => all.find((p) => p.name === n)!;
  assert.equal(get('Kai Havertz').goals, 1); assert.equal(get('Riccardo Calafiori').assists, 1); assert.equal(get('Bukayo Saka').goals, 1); assert.equal(get('Magalhaes Gabriel').yellow, 1);
  assert.deepEqual(d.home.subs.slice(0, 2).map((s) => [s.minute, s.playerIn.name, s.playerOut.name]), [[68, 'Noni Madueke', 'Bukayo Saka'], [68, 'Martin Zubimendi', 'Declan Rice']]);
  assert.equal(get('Bukayo Saka').subbedOffAt, 68); assert.equal(get('Noni Madueke').subbedOnAt, 68);
  assert.equal(d.home.starters.reduce((n, p) => n + p.goals, 0) + d.home.bench.reduce((n, p) => n + p.goals, 0), 3);
});

test('player statistics are English labels with clean values (penalty goals, made/total)', () => {
  const d = D(); const gk = d.home.starters[0]; const lab = (l: string) => gk.stats.find((s) => s.label === l)?.value;
  assert.equal(lab('Saves'), '1'); assert.equal(lab('Accurate passes'), '14/18 (78%)'); assert.equal(lab('Expected goals (xG)'), undefined);
  const pen = detailsFromRecord({ ...REC(), lineups: { ...REC().lineups, home: { ...REC().lineups.home, starting: [{ id: 1, name: 'Pen Taker', position: 'f', stats: { goals: 2, penalty_goals: 1 } }] } } })!;
  assert.equal(pen.home.starters[0].stats[0].value, '2 (1 pen)');
});

test('summary data from the record: shots, top performers, info, fans, ball in play, highlights', () => {
  const d = D(); assert.equal(d.shots.length, 24); assert.equal(d.shots[0].outcome, 'off'); assert.equal(d.shots[0].body, 'Right foot'); assert.equal(d.shots[0].situation, 'Open play');
  assert.deepEqual(d.performers.map((p) => p.category), ['Attack', 'Midfield', 'Defence']); assert.equal(d.performers[0].home!.name, 'Kai Havertz'); assert.equal(d.performers[0].home!.athleteId, 171);
  assert.deepEqual(d.info, { venue: 'Emirates Stadium', attendance: 60098, capacity: 60704, referee: 'Thomas Bramall', tv: null });
  assert.deepEqual(d.fans, { win: { home: 84, draw: 7, away: 9, votes: 42076 }, goals: { line: 2.5, under: 24, over: 76, votes: 3602 } });
  assert.deepEqual([d.playTime!.played, d.playTime!.total, Math.round(d.playTime!.share * 100)], ['60:34', '96:46', 63]);
  assert.deepEqual(d.highlights, { id: 'J4334NsIoCs', url: 'https://www.youtube.com/watch?v=J4334NsIoCs' });
});

test('record output is English only (Arabic injury notes are translated or dropped)', () => {
  const d = D(); assert.ok(strings(d).every((s) => !ARABIC.test(s)));
  assert.equal(d.home.missing[0].expectedReturn, 'Doubtful'); assert.equal(d.home.missing[2].expectedReturn, 'Unknown'); assert.equal(d.home.missing[0].reason, 'Muscle Injury');
  assert.equal(expectedReturnEn('منتصف سبتمبر 2025'), 'Mid September 2025'); assert.equal(expectedReturnEn('Late October 2026'), 'Late October 2026'); assert.equal(expectedReturnEn('شيء غير معروف'), null);
});

test('photo URL is the same-origin image proxy path named by the repo id (no token in the page)', () => {
  assert.equal(playerPhoto(4832), '/api/data/img/headshot/4832.png');
  assert.equal(D().home.starters[0].athleteId, 4832);   // not the 365scores id (3941)
});

test('empty / unusable record → null', () => { assert.equal(detailsFromRecord(null), null); assert.equal(detailsFromRecord({ lineups: { home: {}, away: {} }, shots: [] }), null); });

test('live-feed people get repo ids through s365_id; unknown ones get initials', () => {
  const ids = new Map<number, number>([[39820, 777]]); const live = buildMatchDetails(realFd(), realMap, realGame())!; remapToRepoIds(live, ids);
  const mb = live.home.starters.find((p) => p.name === 'Kylian Mbappe')!; assert.deepEqual([mb.athleteId, mb.s365Id], [777, 39820]);
  assert.equal(live.home.starters[0].athleteId, null);
  assert.equal(s365ToRepoIds(REC()).get(3941), 4832); assert.equal(s365ToRepoIds(REC()).get(45579), 171);
});

test('merge fills only what the record lacks: positions, shots, info', () => {
  const rec = D(); rec.shots = []; rec.info.referee = null; rec.home.starters.forEach((p) => { p.line = null; p.side = null; });
  assert.ok(hasGaps(rec));
  const live = buildMatchDetails(realFd(), realMap, realGame())!; const m = mergeDetails(rec, live);
  assert.equal(m.source, 'mixed'); assert.equal(m.shots.length, live.shots.length); assert.equal(m.info.referee, 'Mateo Busquets Ferrer'); assert.equal(m.info.venue, 'Emirates Stadium');
  assert.equal(m.home.coach!.name, 'Mikel Arteta');                       // the record's value is kept
  assert.ok(m.home.starters.every((p) => p.line == null && p.side == null));   // different players: no half-filled pitch
});

test('route: a verified finished record answers alone — the live feed is not asked', async () => {
  let asked = 0; const r = await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: REC(), inPlay: false, loadSnapshot: async () => { asked++; return { game: realGame() }; }, nowMs: Date.parse('2026-10-20T00:00:00Z') });
  assert.ok(r.available && r.details.source === 'stats.json' && r.details.home.starters[0].athleteId === 4832); assert.equal(asked, 0);
});

test('route: a record with gaps asks the live feed for those fields only; a dead feed still returns the record', async () => {
  const rec = REC(); rec.shots = []; delete rec.venue; delete rec.referee;
  const ok = await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: rec, inPlay: false, loadSnapshot: async () => ({ game: realGame() }), nowMs: Date.parse('2026-10-20T00:00:00Z') });
  assert.ok(ok.available && ok.details.source === 'mixed' && ok.details.shots.length > 0 && ok.details.home.starters[0].name === 'David Raya');
  const down = await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: rec, inPlay: false, loadSnapshot: async () => null, nowMs: Date.parse('2026-10-20T00:00:00Z') });
  assert.ok(down.available && down.details.source === 'stats.json' && down.details.shots.length === 0);
});

test('route: in play → live first, the record fills gaps; no record → live alone; nothing → reason', async () => {
  const live = await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: REC(), inPlay: true, loadSnapshot: async () => ({ game: realGame() }), nowMs: Date.parse('2026-10-18T21:00:00Z') });
  assert.ok(live.available && live.details.home.starters[0].name === 'Thibaut Courtois');
  const alone = await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: null, loadSnapshot: async () => ({ game: realGame() }), nowMs: Date.parse('2026-10-18T21:00:00Z') });
  assert.ok(alone.available && alone.details.source === 'live' && alone.details.home.starters[0].athleteId === null);
  assert.deepEqual(await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: null, loadSnapshot: async () => null, nowMs: Date.parse('2026-10-18T21:00:00Z') }), { available: false, reason: 'upstream_unavailable' });
});

import { lineupRows, bothTeamsLayout } from '../lib/match-details-types';
test('formation decides the rows; pitch side only orders players inside a row', () => {
  const d = D(); const rows = lineupRows(d.home.starters, d.home.formation);
  assert.deepEqual(rows.map((r) => r.length), [1, 4, 2, 3, 1]); assert.equal(rows[0][0].name, 'David Raya');
  assert.deepEqual(lineupRows(d.away.starters, d.away.formation).map((r) => r.length), [1, 4, 1, 4, 1]);   // 4-1-4-1
  rows.forEach((r) => assert.deepEqual(r.map((p) => p.side), [...r.map((p) => p.side)].sort((a, b) => (a as number) - (b as number))));
  // a formation that does not add up to 10 outfield players falls back to the provider's pitch lines
  assert.deepEqual(lineupRows(d.home.starters, '9-9').map((r) => r.length), [1, 4, 2, 3, 1]);
  // no pitch data at all → position letters
  const bare = d.home.starters.map((p) => ({ ...p, line: null, side: null })); const br = lineupRows(bare, null).map((r) => r.length); assert.equal(br[0], 1); assert.equal(br.reduce((a, b) => a + b, 0), 11);
});
test('both teams on one pitch: landscape (home left, away right) and upright for phones; everyone inside the pitch', () => {
  const d = D();
  for (const vertical of [false, true]) {
    const pl = bothTeamsLayout(d.home, d.away, vertical); assert.equal(pl.length, 22);
    assert.ok(pl.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100));
    const gk = (t: 'home' | 'away') => pl.find((p) => p.team === t && p.player.pos === 'g')!; const fw = (t: 'home' | 'away') => pl.filter((p) => p.team === t && p.player.pos === 'f');
    if (!vertical) { assert.ok(gk('home').x < 15 && gk('away').x > 85); assert.ok(fw('home')[0].x > gk('home').x); }
    else { assert.ok(gk('home').y < 15 && gk('away').y > 85); assert.ok(fw('away')[0].y < gk('away').y); }
  }
});
test('heatmap, player of the match and injury season stats are carried through', () => {
  const d = D(); assert.match(d.home.starters[0].heatmap ?? '', /^https:\/\/imagecache\.365scores\.com\//);
  assert.deepEqual(d.potm, { athleteId: 7427, name: 'Martin Odegaard', team: 'home', rating: 8.3 }); assert.deepEqual(d.home.missing[0].season, { appearances: 5, matches: 7, goals: 2 });
});

import { highlightFromVideos } from './match-details-record';
test('highlights fallback: a "highlights" video naming both clubs, uploaded around the match', () => {
  const m = { homeTeam: { id: 65, name: 'Manchester City FC', shortName: 'Man City' }, awayTeam: { id: 524, name: 'Paris Saint-Germain FC', shortName: 'PSG' }, utcDate: '2026-10-20T19:00:00Z' };
  const v = (id: string, title: string, d: string) => ({ videoId: id, title, uploadDate: d });
  const list = [v('aaaaaaaaaaa', 'Man City 2-5 PSG | Champions League Highlights', '2026-10-20T22:00:00Z'), v('bbbbbbbbbbb', 'Man City vs PSG press conference', '2026-10-20T22:30:00Z'), v('ccccccccccc', 'Man City 1-0 Arsenal | Highlights', '2026-10-20T22:00:00Z'), v('ddddddddddd', 'Man City v PSG | Highlights', '2026-09-01T22:00:00Z')];
  assert.deepEqual(highlightFromVideos(list, m), { id: 'aaaaaaaaaaa', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' });
  assert.equal(highlightFromVideos([list[1], list[2], list[3]], m), null); assert.equal(highlightFromVideos(null, m), null);
});

import { cleanRecordParts } from './legacy-stats-validation';
test('live: events stay visible when the score is a goal ahead of the event list; finished matches stay strict', () => {
  const ev = [{ type: 'goal', team: 'home', minute: 12, player: 'A Striker' }, { type: 'yellow_card', team: 'away', minute: 30, player: 'B Defender' }];
  const rec = { stats: { yellow_cards: { home: 0, away: 0 } }, events: ev };          // card total (0) disagrees with the one card event
  const score = { status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: 2, away: 0 } } };   // the live score already says 2–0
  const live = cleanRecordParts(rec, score, true);
  assert.equal(live.events!.length, 2); assert.equal(live.eventsState, 'consistent'); assert.match(live.eventsNote ?? '', /trail the score/);
  const strict = cleanRecordParts(rec, score, false); assert.equal(strict.events, null); assert.equal(strict.eventsState, 'excluded');
});

import { s365ToRepoIdsAll } from './match-details-record';
test('a match in play (no record of its own) still gets repo headshot ids from the rest of stats.json', async () => {
  const all = s365ToRepoIdsAll({ data: { 1: REC() } }); assert.equal(all.get(3941), 4832); assert.equal(s365ToRepoIdsAll({ data: { 1: REC() } }) instanceof Map, true);
  const r = await resolveMatchDetails({ match: realFd(), mapEntry: realMap, record: null, idMap: new Map([[39820, 777]]), loadSnapshot: async () => ({ game: realGame() }), nowMs: Date.parse('2026-10-18T21:00:00Z') });
  assert.ok(r.available); if (r.available) assert.equal(r.details.home.starters.find((p) => p.name === 'Kylian Mbappe')!.athleteId, 777);
});

import { playerImageSources } from '../utils/formatting';
import { injectHead } from './seo-meta';
test('player photos: headshot png first, then the page image path, then player_images jpg', () => {
  const base = '/api/data/img'; const q = '';   // same-origin proxy: no data-service address, no token in the page
  assert.deepEqual(playerImageSources(38101), [`${base}/headshot/38101.png${q}`, `${base}/assets/player_images/38101.jpg${q}`]);
  assert.deepEqual(playerImageSources(5, '/assets/player_images/x.jpg'), [`${base}/headshot/5.png${q}`, `${base}/assets/player_images/x.jpg${q}`, `${base}/assets/player_images/5.jpg${q}`]);
  assert.deepEqual(playerImageSources(null), []);
});
test('seo: default share image is the site logo, absolute, with a "summary" card', () => {
  const html = injectHead('<html><head><title>x</title></head></html>', { status: 200, title: 'T', description: 'D', canonical: 'https://goal4u.com/matches', robots: 'index,follow', ogType: 'website', image: '/logo/android-chrome-512x512.png', jsonLd: [] } as any);
  assert.match(html, /og:image" content="https:\/\/goal4u\.com\/logo\/android-chrome-512x512\.png"/); assert.match(html, /twitter:card" content="summary"/); assert.match(html, /og:locale/);
  assert.doesNotMatch(html, /unsplash/);
});

import { locateMatch, DataUnavailable } from './data-api';
test('match lookup: a failed fetch is a 503-style failure, never "match not found"', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error('network down'); }) as any;
    await assert.rejects(() => locateMatch('999999991', 'PD', '2031-2032'), (e: any) => e instanceof DataUnavailable);
  } finally { globalThis.fetch = realFetch; }
});

import { classifyPath, canonicalPath, breadcrumbTrail } from '../lib/routes';
import { infoBody } from './seo-body';
test('information pages: routed, canonical, breadcrumbed, and server-rendered with their text', () => {
  for (const slug of ['about', 'contact', 'privacy', 'terms']) {
    assert.equal(classifyPath(`/${slug}`).kind, 'info'); assert.equal(canonicalPath(`/${slug}`), `/${slug}`);
    assert.equal(breadcrumbTrail(`/${slug}`).length, 2);
    assert.match(infoBody(slug as any), /<h1>.+<\/h1>/);
  }
  assert.equal(classifyPath('/privacy/x').kind, 'notfound');
});
