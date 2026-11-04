import test from 'node:test';
import assert from 'node:assert/strict';
import { phase, isLive, uniqueMatches, leagueHeaderBg, stadiumBg, matchHref, type FMatch } from './api.ts';

const T = (id: number) => ({ id, name: `T${id}`, shortName: null, tla: null, crest: '' });
const mk = (o: Partial<FMatch> & { minsAgo?: number }): FMatch => ({
  id: 1, code: 'PL', competition: {}, utcDate: new Date(Date.now() - (o.minsAgo ?? -600) * 60000).toISOString(),
  status: 'TIMED', minute: null, matchday: 1, homeTeam: T(1), awayTeam: T(2), ...o,
} as FMatch);

test('LIVE when the feed says so, and for 2.5 h after kick-off when the feed has not caught up', () => {
  assert.equal(phase(mk({ status: 'IN_PLAY' })), 'live');
  assert.equal(phase(mk({ status: 'PAUSED' })), 'live');
  assert.equal(phase(mk({ status: 'EXTRA_TIME' })), 'live');
  assert.equal(phase(mk({ status: 'TIMED', minsAgo: 30 })), 'live');
  assert.equal(isLive(mk({ status: 'TIMED', minsAgo: 30 })), true);
  assert.equal(phase(mk({ status: 'TIMED', minsAgo: 30, liveCheck: 'not_started' })), 'started');
});
test('upcoming matches are never live; finished / postponed / stale map correctly', () => {
  assert.equal(phase(mk({ status: 'TIMED', minsAgo: -120 })), 'upcoming');
  assert.equal(phase(mk({ status: 'SCHEDULED', minsAgo: -5 })), 'upcoming');
  assert.equal(phase(mk({ status: 'FINISHED', minsAgo: 300 })), 'ft');
  assert.equal(phase(mk({ status: 'POSTPONED' })), 'postponed');
  assert.equal(phase(mk({ status: 'TIMED', minsAgo: 400 })), 'pending');
});
test('duplicate fixtures (same id, or same teams + day across competitions) collapse to the most complete record', () => {
  const a = mk({ id: 5, code: 'PL', status: 'TIMED' });
  const b = mk({ id: 5, code: 'PL', status: 'FINISHED' });
  const c = mk({ id: 99, code: 'CL', status: 'TIMED', utcDate: a.utcDate });          // same teams, same day
  const d = mk({ id: 7, homeTeam: T(1), awayTeam: T(3) });                           // different opponent: kept
  const out = uniqueMatches([a, b, c, d]);
  assert.equal(out.length, 2);
  assert.equal(out.find((m) => m.id === 5)?.status, 'FINISHED');
  assert.ok(out.some((m) => m.id === 7));
});
test('league artwork paths use the competition slug, fall back to the default stadium', () => {
  assert.match(leagueHeaderBg('PD'), /la-liga-header\.png/);
  assert.match(stadiumBg('PL'), /match-stadium-premier-league-bg\.png/);
  assert.match(stadiumBg('PL'), /match-stadium-bg\.webp'\)$/);
  assert.match(stadiumBg('XX'), /match-stadium-bg\.webp/);
});
test('match links keep the season for archived matches only', () => {
  assert.equal(matchHref({ id: 1, code: 'PL', seasonSlug: '2019-2020' }), '/2019-2020/match/1?c=PL');
});
