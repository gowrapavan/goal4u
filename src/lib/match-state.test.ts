import test from 'node:test';
import assert from 'node:assert/strict';
import { phase, isLive, isOpen, uniqueMatches, UNVERIFIED_LIVE_MIN, holdLabel } from './match-state.ts';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const at = (minsFromNow: number) => new Date(NOW + minsFromNow * 60000).toISOString();
const mk = (id: number, status: string, utcDate: string, h = 1, a = 2): any => ({ id, status, utcDate, homeTeam: { id: h }, awayTeam: { id: a } });

test('LIVE when the feed says the match is in play', () => {
  for (const s of ['IN_PLAY', 'PAUSED', 'LIVE', 'EXTRA_TIME', 'PENALTY_SHOOTOUT']) assert.equal(phase(mk(1, s, at(-30)), NOW), 'live');
  assert.equal(isLive(mk(1, 'IN_PLAY', at(-30)), NOW), true);
});
test('a future match is upcoming and is never live', () => {
  const m = mk(2, 'TIMED', at(+90));
  assert.equal(phase(m, NOW), 'upcoming'); assert.equal(isLive(m, NOW), false);
});
test('kick-off passed, feed not caught up: LIVE for the next 2.5 hours (estimate), then "pending"', () => {
  const m = mk(3, 'TIMED', at(-30));
  assert.equal(phase(m, NOW), 'live'); assert.equal(isLive(m, NOW), true); assert.equal(isOpen(m, NOW), true);
  assert.equal(phase(mk(3, 'SCHEDULED', at(-149)), NOW), 'live');
  assert.equal(phase(mk(3, 'SCHEDULED', at(-150)), NOW), 'pending');
  assert.equal(phase(mk(3, 'TIMED', at(-5)), NOW), 'live');
});
test('the live source saying "not started" keeps a late match at "Kicked off" instead of guessing LIVE', () => {
  const late = { ...mk(7, 'TIMED', at(-20)), liveCheck: 'not_started' };
  assert.equal(phase(late, NOW), 'started'); assert.equal(isLive(late, NOW), false);
  assert.equal(phase({ ...late, status: 'IN_PLAY' }, NOW), 'live');   // once the feed says in play, it is live
});
test('a result already in the feed is never turned back into LIVE by the time window', () => {
  assert.equal(phase(mk(8, 'FINISHED', at(-30)), NOW), 'ft');
  assert.equal(phase(mk(9, 'POSTPONED', at(-30)), NOW), 'postponed');
});
test('long past with no result is "pending"; finished is ft; postponed is not open', () => {
  assert.equal(phase(mk(4, 'SCHEDULED', at(-300)), NOW), 'pending');
  assert.equal(phase(mk(5, 'FINISHED', at(-300)), NOW), 'ft');
  assert.equal(isOpen(mk(5, 'FINISHED', at(-300)), NOW), false);
  assert.equal(phase(mk(6, 'POSTPONED', at(+300)), NOW), 'postponed');
  assert.equal(isOpen(mk(6, 'POSTPONED', at(+300)), NOW), false);
});
test('merging domestic and European schedules removes duplicates by id', () => {
  const out = uniqueMatches([mk(10, 'TIMED', at(+60)), mk(11, 'TIMED', at(+120), 3, 4), mk(10, 'TIMED', at(+60))]);
  assert.deepEqual(out.map((m) => m.id).sort(), [10, 11]);
});
test('the same fixture under two ids (same teams, same day) is kept once, preferring the most complete record', () => {
  const out = uniqueMatches([mk(20, 'TIMED', '2026-10-10T19:00:00Z'), mk(21, 'FINISHED', '2026-10-10T19:00:00Z')]);
  assert.equal(out.length, 1); assert.equal(out[0].status, 'FINISHED');
});
test('different teams on the same day are not merged', () => {
  assert.equal(uniqueMatches([mk(30, 'TIMED', at(60), 1, 2), mk(31, 'TIMED', at(60), 3, 4)]).length, 2);
});
test('a reverse fixture on a different day (home/away swap) is kept', () => {
  assert.equal(uniqueMatches([mk(40, 'TIMED', '2026-10-10T19:00:00Z', 1, 2), mk(41, 'TIMED', '2026-11-10T19:00:00Z', 2, 1)]).length, 2);
});

import { roundLabel, competitionLine, roundShort } from './match-round';
test('round wording: Champions League says Round, leagues say Matchday, knockouts use the stage name', () => {
  assert.equal(roundLabel({ stage: 'LEAGUE_STAGE', matchday: 3 }, 'CL'), 'Round 3');
  assert.equal(roundLabel({ stage: 'REGULAR_SEASON', matchday: 7 }, 'PL'), 'Matchday 7');
  assert.equal(roundLabel({ stage: 'LAST_16', matchday: 1 }, 'CL'), 'Round of 16');
  assert.equal(roundLabel({ stage: 'GROUP_STAGE', matchday: 2, group: 'GROUP_A' }, 'WC'), 'Group A · Matchday 2');
  assert.equal(competitionLine({ stage: 'LEAGUE_STAGE', matchday: 3 }, 'CL'), 'Europe, UEFA Champions League, Round 3');
  assert.equal(competitionLine({ matchday: 7 }, 'PL'), 'England, Premier League, Matchday 7');
  assert.equal(roundShort({ matchday: 3 }, 'CL'), 'R3'); assert.equal(roundShort({ matchday: 3 }, 'PL'), 'MD3'); assert.equal(roundShort({ stage: 'FINAL', matchday: 1 }, 'CL'), null);
});

test('a stale IN_PLAY from the repo is not believed 3 h after kick-off, unless the live source confirmed it', () => {
  assert.equal(phase(mk(50, 'IN_PLAY', at(-179)), NOW), 'live');
  assert.equal(phase(mk(50, 'IN_PLAY', at(-181)), NOW), 'pending');
  assert.equal(phase(mk(50, 'PAUSED', at(-24 * 60)), NOW), 'pending');
  assert.equal(phase({ ...mk(50, 'IN_PLAY', at(-200)), liveCheck: 'koora' }, NOW), 'live');   // extra time / penalties, confirmed live
  assert.equal(phase({ ...mk(50, 'FINISHED', at(-24 * 60)), liveCheck: 'koora' }, NOW), 'ft');   // the live source said full time → FINISHED
  assert.equal(isOpen(mk(50, 'IN_PLAY', at(-181)), NOW), true);
});

test('live source could not be asked (unverified): the LIVE guess stops after 125 min instead of 150', () => {
  const u = (mins: number) => ({ ...mk(60, 'TIMED', at(-mins)), liveCheck: 'unverified' });
  assert.equal(UNVERIFIED_LIVE_MIN, 125);
  assert.equal(phase(u(10), NOW), 'live');
  assert.equal(phase(u(124), NOW), 'live');
  assert.equal(phase(u(125), NOW), 'pending');
  assert.equal(phase(u(149), NOW), 'pending');
  assert.equal(phase(u(-30), NOW), 'upcoming');
  // verified or untouched fixtures keep the 150-minute window
  assert.equal(phase(mk(61, 'TIMED', at(-140)), NOW), 'live');
});

test('holdLabel names only what the feed itself says (half time, suspended, postponed, ...), never a guess', () => {
  assert.equal(holdLabel({ status: 'PAUSED' }), 'Half time');
  assert.equal(holdLabel({ status: 'SUSPENDED' }), 'Suspended');
  assert.equal(holdLabel({ status: 'POSTPONED' }), 'Postponed');
  assert.equal(holdLabel({ status: 'CANCELLED' }), 'Cancelled');
  assert.equal(holdLabel({ status: 'AWARDED' }), 'Awarded');
  assert.equal(holdLabel({ status: 'TIMED' }), null);
  assert.equal(holdLabel({ status: 'IN_PLAY' }), null);
});
