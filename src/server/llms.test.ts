import test from 'node:test';
import assert from 'node:assert/strict';
import { llmsTxt } from './llms.ts';

const COMPS = [{ name: 'Premier League', path: '/competition/premier-league' }, { name: 'La Liga', path: '/competition/la-liga' }];
test('llms.txt: title, summary, real pages and competitions, all on the site\'s own address', () => {
  const t = llmsTxt('https://goal4u.netlify.app/', COMPS);
  assert.match(t, /^# Goal4U\n\n> /);
  for (const u of ['/', '/matches', '/news', '/watch', '/about', '/contact', '/privacy', '/terms', '/competition/premier-league', '/competition/la-liga']) assert.ok(t.includes(`](https://goal4u.netlify.app${u})`), u);
  const links = [...t.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 10 && links.every((l) => l.startsWith('https://goal4u.netlify.app/')), 'no link leaves the site');
  assert.equal(t.endsWith('\n'), true);
});
test('llms.txt never mentions the data service, GitHub, localhost or a placeholder', () => {
  const t = llmsTxt('https://goal4u.netlify.app', COMPS);
  assert.ok(!/github|raw\.githubusercontent|onrender|goal4u-data|gowra|localhost|placeholder|TODO|lorem/i.test(t));
});
test('llms.txt without competitions still has the main pages', () => {
  const t = llmsTxt('https://x.test', []);
  assert.ok(!t.includes('## Competitions')); assert.ok(t.includes('](https://x.test/matches)'));
});
