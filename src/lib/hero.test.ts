import test from 'node:test';
import assert from 'node:assert/strict';
import { pickHero, hasOpenMatch } from './hero.ts';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const at = (h: number) => new Date(NOW + h * 3600_000).toISOString();
let n = 0;
const mk = (home: number, away: number, hours: number, status = 'TIMED', code = 'PL'): any => ({ id: ++n, code, status, utcDate: at(hours), homeTeam: { id: home }, awayTeam: { id: away } });
const RM = 86, FCB = 81, MUN = 66, BAY = 5, PSG = 524, ARS = 57, MCI = 65, ATM = 78, OTHER1 = 1001, OTHER2 = 1002;

test('nearest priority-club match wins over a bigger but later fixture (Clásico on the 22nd)', () => {
  const clasico = mk(RM, FCB, 24 * 10);                       // 10 days out — beyond the horizon anyway
  const rmLeague = mk(RM, OTHER1, 30, 'TIMED', 'PD');         // Real Madrid, tomorrow+
  const fcbCup = mk(OTHER2, FCB, 80, 'TIMED', 'CL');
  assert.equal(pickHero([clasico, fcbCup, rmLeague], NOW), rmLeague);
});
test('even a Clásico inside the week does not jump the queue if another priority match is clearly earlier', () => {
  const early = mk(ARS, OTHER1, 20); const clasico = mk(RM, FCB, 24 * 5, 'TIMED', 'PD');
  assert.equal(pickHero([clasico, early], NOW), early);
});
test('matches kicking off within 3 hours of each other are compared on importance', () => {
  const single = mk(MCI, OTHER1, 48); const both = mk(RM, FCB, 49, 'TIMED', 'PD');
  assert.equal(pickHero([single, both], NOW), both);
  const rmOnly = mk(RM, OTHER1, 50); const atmOnly = mk(ATM, OTHER2, 49.5);
  assert.equal(pickHero([atmOnly, rmOnly], NOW), rmOnly);     // same window → better club rank
});
test('a live priority-club match beats any upcoming one; a live non-priority match does not', () => {
  const live = mk(BAY, OTHER1, -1, 'IN_PLAY', 'BL1'); const soon = mk(RM, OTHER2, 2);
  assert.equal(pickHero([soon, live], NOW), live);
  const liveOther = mk(OTHER1, OTHER2, -1, 'IN_PLAY'); const priorityLater = mk(PSG, OTHER1, 20, 'TIMED', 'FL1');
  assert.equal(pickHero([liveOther, priorityLater], NOW), priorityLater);
});
test('a priority match that kicked off recently but is unconfirmed ("started") is eligible and earliest', () => {
  const started = mk(MUN, OTHER1, -0.5); const later = mk(ARS, OTHER2, 5);
  assert.equal(pickHero([later, started], NOW), started);
});
test('finished matches are never chosen while a priority fixture is coming', () => {
  const done = mk(RM, OTHER1, -20, 'FINISHED'); const next = mk(FCB, OTHER2, 60, 'TIMED', 'PD');
  assert.equal(pickHero([done, next], NOW), next);
});
test('no priority club within 7 days: falls back to competition importance, then soonest', () => {
  const a = mk(OTHER1, OTHER2, 10, 'TIMED', 'ELC'); const b = mk(OTHER1, OTHER2, 20, 'TIMED', 'CL');
  assert.equal(pickHero([a, b], NOW), b);
  assert.equal(pickHero([mk(RM, OTHER1, 24 * 9)], NOW)?.homeTeam.id, RM);   // only match → still returned
});
test('empty input → undefined; only results → latest result', () => {
  assert.equal(pickHero([], NOW), undefined);
  const r1 = mk(OTHER1, OTHER2, -50, 'FINISHED'), r2 = mk(OTHER1, OTHER2, -10, 'FINISHED');
  assert.equal(pickHero([r1, r2], NOW), r2);
});

test('look-ahead: a window that holds only finished games (international break) asks for more; any open match does not', () => {
  const done = mk(RM, OTHER1, -48, 'FINISHED', 'PD'), done2 = mk(FCB, OTHER2, -72, 'FINISHED', 'PD');
  assert.equal(hasOpenMatch([done, done2], NOW), false);
  assert.equal(hasOpenMatch([], NOW), false);
  assert.equal(hasOpenMatch([done, mk(RM, OTHER1, 24 * 7)], NOW), true);                  // still to come
  assert.equal(hasOpenMatch([done, mk(RM, OTHER1, -1, 'IN_PLAY')], NOW), true);           // live
});
test('after the look-ahead, the next real fixture leads instead of the last result (RM on the 22nd, nothing before)', () => {
  const last = mk(ATM, FCB, -50, 'FINISHED', 'PD'); const rm = mk(RM, OTHER1, 24 * 11, 'TIMED', 'PD');
  assert.equal(pickHero([last, rm], NOW), rm);
});
