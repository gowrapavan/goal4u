import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const mk = (id: number, name: string) => ({ id, name, shortName: name, tla: name.slice(0, 3).toUpperCase(), crest: `/c/${id}.png` });

test('match hero: teams, score, scorers in minute order (each from its own side), footer facts', async () => {
  const { MatchHero } = await import('./MatchHero');
  const m: any = { id: 1, utcDate: '2026-11-02T19:45:00Z', status: 'FINISHED', matchday: 9, homeTeam: mk(1, 'Marseille'), awayTeam: mk(2, 'Toulouse'), score: { fullTime: { home: 2, away: 1 }, halfTime: { home: 2, away: 0 } }, competition: {} };
  const events = [
    { type: 'goal', team: 'home', player: 'Amine Harit', minute: 1 },
    { type: 'goal', team: 'away', player: 'Zed Away', minute: 70 },
    { type: 'goal', team: 'home', player: 'Amine Gouiri', minute: 25 },
  ];
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(MatchHero, {
    m, raw: m, code: 'FL1', season: null, events, venue: 'Cepac Velodrome', referee: 'Hakim Ben El Hadj Salem', attendance: 39094, ht: { home: 2, away: 0 }, hasRes: true, dur: null, pen: null,
  })));
  for (const t of ['Marseille', 'Toulouse', 'Cepac Velodrome', 'Referee: Hakim Ben El Hadj Salem', 'Attendance: 39,094', 'HT 2 - 0', 'aria-label="2 to 1"']) assert.ok(html.includes(t), `missing ${t}`);
  const at = (x: string) => html.indexOf(x);
  // Each goal sits in its own team's column: home column first, then (order-3) the away column. Both home scorers come before the away scorer in the markup.
  assert.ok(at('Amine Harit') < at('Amine Gouiri') && at('Amine Gouiri') < at('Zed Away'), 'home scorers (by minute) then the away scorer');
  assert.ok(html.includes('aria-label="Home goal scorers"') && html.includes('aria-label="Away goal scorers"'));
  const homeList = html.slice(html.indexOf('aria-label="Home goal scorers"'), html.indexOf('aria-label="Away goal scorers"'));
  const awayList = html.slice(html.indexOf('aria-label="Away goal scorers"'));
  assert.ok(homeList.includes('Amine Harit') && homeList.includes('Amine Gouiri') && !homeList.includes('Zed Away'), 'no away goal under the home team');
  assert.ok(awayList.includes('Zed Away') && !awayList.includes('Amine'), 'no home goal under the away team');
});
