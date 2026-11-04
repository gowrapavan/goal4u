import test from 'node:test';
import assert from 'node:assert/strict';
import { isSoccerArticle, dedupeArticles, rankArticles, topicOf, buildQueries, focusQueries, buildFocus, relatedMatch, teamTerms, hotScore } from './news-filter.ts';

const art = (title: string, description = '', extra: any = {}) => ({ title, description, url: `https://x.test/${encodeURIComponent(title)}`, publishedAt: '2026-10-11T10:00:00Z', ...extra });
const NOW = Date.parse('2026-10-12T08:00:00Z');

test('American football headlines AS THEY APPEAR (no "NFL" in the text) are rejected', () => {
  const rejected = [
    art('Do the Panthers play today? Schedule, time, channel for next Carolina football game', 'The Panthers might be one of football’s most explosive teams. But they’re slated to be silent in Week 5.'),
    art('College Football Rankings: Texas Drops, Unbeaten UCLA Takes Big Jump, New No. 1 & More'),
    art('Isaiah Marshall Stock Report: Kansas QB Continues to Rise After Career Day vs. Utah'),
    art('How Steve Sarkisian and Arch Manning faltered as ‘Texas beat Texas’'),
    art('Kalen DeBoer, Alabama football players respond to Dijon Lee Jr. foul'),
    art('“Sam Leavitt Is a Turnover Machine”: CFB Champ & Ex-NFLer Rips LSU QB After Dramatic Loss to Kentucky'),
    art('First Close Loss Of The Silverfield Era At Arkansas Features Several Red Flags'),
  ];
  for (const a of rejected) assert.equal(isSoccerArticle(a), false, a.title);
});
test('rugby, cricket, AFL and other sports are rejected — even when a club-like word appears', () => {
  for (const t of ['Leicester Tigers beat Bath in Premiership Rugby thriller', 'England rugby name Six Nations squad', 'Newcastle Falcons sign new fly-half',
    'Manchester Originals win in The Hundred cricket', 'AFL: Collingwood beat Geelong', 'Liverpool Super Rugby-style hybrid trial']) assert.equal(isSoccerArticle(art(t)), false, t);
});
test('generic football words alone are NOT enough (transfer / manager / penalty / derby)', () => {
  assert.equal(isSoccerArticle(art('Transfer window: manager sacked after derby penalty drama', 'The striker and midfielder were involved.')), false);
  assert.equal(isSoccerArticle(art('Football manager sacked after heavy defeat')), false);
});
test('real football stories are kept', () => {
  for (const t of ['Everything’s the Best: Wirtz at False Nine?', 'Man United made enquiry for Giuliano Simeone, surprise factor could influence next move',
    'Manchester City vs Liverpool: Latest City team news and predicted starting lineup', 'Real Madrid 1-0 Villarreal: Bellingham decisive again', 'Atlético Madrid v Manchester United: Champions League preview'])
    assert.equal(isSoccerArticle(art(t)), true, t);
});
test('clubs from our own data count as soccer markers; without them the same story is not assumed relevant', () => {
  const a = art('Huddersfield Town sign winger on loan');
  assert.equal(isSoccerArticle(a), false);
  assert.equal(isSoccerArticle(a, ['huddersfield town']), true);
  assert.equal(isSoccerArticle(art('Huddersfield Town hockey? no, rugby league win'), ['huddersfield town']), false);   // block still wins
});
test('"celtics" is not Celtic, "romance" is not Roma', () => {
  assert.equal(isSoccerArticle(art('Boston Celtics beat Lakers'), ['celtic']), false);
  assert.equal(isSoccerArticle(art('A romance about an aroma festival'), ['roma']), false);
});
test('team terms: clean names, distinctive short names, ambiguous words dropped', () => {
  const atm = teamTerms({ name: 'Club Atlético de Madrid', shortName: 'Atleti' });
  for (const t of ['atlético de madrid', 'atletico madrid', 'atleti']) assert.ok(atm.includes(t), t);
  assert.deepEqual(teamTerms({ name: 'OGC Nice', shortName: 'Nice' }), ['ogc nice']);
  assert.ok(teamTerms({ name: 'Manchester United FC', shortName: 'Man United' }).includes('man united'));
  assert.ok(teamTerms({ name: 'Paris Saint-Germain FC', shortName: 'PSG' }).includes('psg'));
  assert.equal(relatedMatch(art('Atletico Madrid v Man Utd preview'), buildFocus([fm(9, [78, 'Club Atlético de Madrid', 'Atleti'], [66, 'Manchester United FC', 'Man United'], 5)], NOW))?.both, true);   // no accents, alias used
});
test('duplicates are removed, keeping the first', () => {
  const a = art('Barcelona sign new striker'); const b = { ...art('Barcelona sign new striker!'), url: 'https://other.test/1' }; const c = { ...art('Different'), url: a.url };
  assert.equal(dedupeArticles([a, b, c]).length, 1);
});

// ── match awareness ──
const fm = (id: number, h: [number, string, string], a: [number, string, string], hoursFromNow: number, code = 'CL'): any => ({ id, code, utcDate: new Date(NOW + hoursFromNow * 3600_000).toISOString(), homeTeam: { id: h[0], name: h[1], shortName: h[2] }, awayTeam: { id: a[0], name: a[1], shortName: a[2] } });
const ATM = fm(1, [78, 'Club Atlético de Madrid', 'Atleti'], [66, 'Manchester United FC', 'Man United'], 30);
const LATER = fm(2, [86, 'Real Madrid CF', 'Real Madrid'], [100, 'AS Roma', 'Roma'], 24 * 6);   // outside the 3-day window
const OLD = fm(3, [57, 'Arsenal FC', 'Arsenal'], [101, 'Lille OSC', 'Lille'], -24 * 5);          // too long ago
const OTHER = fm(4, [900, 'Huddersfield Town', 'Huddersfield'], [901, 'Bolton Wanderers', 'Bolton'], 10, 'ELC');
test('focus = fixtures from the last 2 / next 3 days, priority clubs first', () => {
  const f = buildFocus([OTHER, ATM, LATER, OLD], NOW);
  assert.deepEqual(f.map((x) => x.id), [1, 4]);
});
test('a story naming both clubs is a match story; one club is team news; unrelated is neither', () => {
  const focus = buildFocus([ATM], NOW);
  assert.equal(relatedMatch(art('Atlético Madrid v Manchester United: Champions League preview'), focus)?.both, true);
  assert.equal(relatedMatch(art('Man United injury update ahead of midweek'), focus)?.both, false);
  assert.equal(relatedMatch(art('Real Madrid sign winger'), focus), null);
});
test('newest stories come first; inside the same 8-hour band, match stories outrank hot topics, which outrank generic news', () => {
  const focus = buildFocus([ATM], NOW);
  const matchStory = art('Atlético Madrid v Manchester United: team news and preview', '', { publishedAt: '2026-10-12T02:00:00Z' });   // 6 h old
  const hot = art('Real Madrid and Barcelona battle for wonderkid', '', { publishedAt: '2026-10-12T05:00:00Z' });                    // 3 h old, same band
  const generic = art('Serie A: Napoli prepare for Lazio clash', '', { publishedAt: '2026-10-12T06:00:00Z' });                        // 2 h old, same band
  assert.deepEqual(rankArticles([generic, hot, matchStory], NOW, focus).map((x) => x.title), [matchStory.title, hot.title, generic.title]);
  assert.ok(hotScore(matchStory, NOW, focus) > hotScore(matchStory, NOW, []));
  // an older band never beats a newer one, however hot: a 20 h-old match story sits below a 1 h-old generic story
  const old = art('Atlético Madrid v Manchester United: how the sides line up', '', { publishedAt: '2026-10-11T12:00:00Z' });
  const fresh = art('Lazio sign a striker', '', { publishedAt: '2026-10-12T07:00:00Z' });
  assert.deepEqual(rankArticles([old, fresh], NOW, focus).map((x) => x.title), [fresh.title, old.title]);
  // no date → last
  const undated = { title: 'No date', description: '', url: 'https://x.test/nd' };
  assert.equal(rankArticles([undated as any, old], NOW, focus)[1].title, 'No date');
});
test('topics are detected for the filter chips', () => {
  assert.equal(topicOf(art('Haaland scores again as City beat Villa')), 'Man City');
  assert.equal(topicOf(art('Cristiano Ronaldo eyes Portugal record')), 'Ronaldo & Portugal');
  assert.equal(topicOf(art('Serie A round-up')), null);
});
test('every NewsAPI query is under 500 chars and excludes other sports', () => {
  const focus = buildFocus([ATM, OTHER], NOW);
  const qs = [...buildQueries(), ...focusQueries(focus)];
  assert.ok(qs.length >= 4 && qs.length <= 5);
  for (const q of qs) { assert.ok(q.length < 500, `query too long (${q.length})`); assert.ok(/NOT \(.*rugby/.test(q)); }
  assert.ok(focusQueries(focus)[0].includes('"atleti"') || focusQueries(focus)[0].includes('"atlético de madrid"'));
});

test('focus matches carry the 3-letter team codes (tla) so the UI can shorten "Atleti v Man United" to "ATL v MUN"', () => {
  const f = buildFocus([{ id: 1, code: 'CL', utcDate: new Date(NOW + 3600_000).toISOString(),
    homeTeam: { id: 78, name: 'Club Atlético de Madrid', shortName: 'Atleti', tla: 'ATL' }, awayTeam: { id: 66, name: 'Manchester United FC', shortName: 'Man United', tla: 'MUN' } }] as any, NOW);
  assert.equal(f[0].homeTla, 'ATL'); assert.equal(f[0].awayTla, 'MUN');
  const g = buildFocus([{ id: 2, code: 'CL', utcDate: new Date(NOW + 3600_000).toISOString(), homeTeam: { id: 78, name: 'Club Atlético de Madrid' }, awayTeam: { id: 66, name: 'Manchester United FC' } }] as any, NOW);
  assert.equal(g[0].homeTla, undefined);          // missing tla → UI derives a 3-letter fallback from the name
});
