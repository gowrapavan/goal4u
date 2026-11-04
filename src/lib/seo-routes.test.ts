import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyPath, canonicalPath, breadcrumbTrail, TAB_ALIASES } from './routes';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

// Collect the real router's paths so the SEO layer cannot drift from App.tsx.
const literal = [...app.matchAll(/<Route\s+(?:index|path="([^"]+)")/g)].map((m) => m[1]).filter((p): p is string => !!p && p !== '/' && p !== '*');
const tabs = (app.match(/\[('standings'[^\]]+)\]/)?.[1] || '').split(',').map((s) => s.trim().replace(/'/g, ''));
const fill = (p: string) => '/' + p.replace(/:season/g, '2025-2026').replace(/:id/g, '123').replace(/:[a-z]+/gi, 'premier-league');

test('the tab-alias list in routes.ts equals the one in App.tsx', () => assert.deepEqual([...TAB_ALIASES], tabs));

test('every concrete <Route> in App.tsx is understood by classifyPath (no route is silently missing)', () => {
  const concrete = literal.filter((p) => !p.includes('${'));
  const expanded = [...concrete, ...tabs.flatMap((t) => [`${t}/:slug`, `${t}/:slug/:season`])];
  assert.ok(expanded.length >= 20, `only found ${expanded.length} routes — did the router move?`);
  for (const p of expanded) assert.notEqual(classifyPath(fill(p)).kind, 'notfound', `App.tsx route "${p}" is unknown to classifyPath`);
});

test('the real router redirects match the redirects the server issues', () => {
  assert.match(app, /path="live" element=\{<Navigate replace to="\/matches\?filter=live"/);
  assert.match(app, /path="media" element=\{<Navigate replace to="\/watch"/);
  assert.match(app, /path="h2h\/:teams" element=\{<Navigate replace to="\/matches"/);
  assert.equal(classifyPath('/live').redirectTo, '/matches?filter=live');
  assert.equal(classifyPath('/media').redirectTo, '/watch');
  assert.equal(classifyPath('/h2h/arsenal-vs-chelsea').redirectTo, '/matches');
  assert.equal(classifyPath('/top-scorers/la-liga').redirectTo, '/competition/la-liga?tab=stats');
  assert.equal(classifyPath('/archive/serie-a/2024-2025').redirectTo, '/competition/serie-a/2024-2025');
});

test('page kinds', () => {
  assert.equal(classifyPath('/').kind, 'home');
  assert.deepEqual(classifyPath('/match/123'), { kind: 'match', params: { id: '123' }, redirectTo: undefined });
  assert.equal(classifyPath('/2024-2025/match/9').params.season, '2024-2025');
  assert.equal(classifyPath('/competition/premier-league').kind, 'competition');
  assert.equal(classifyPath('/standings/premier-league').kind, 'competition-alias');
  assert.equal(classifyPath('/team/premier-league').kind, 'team');
  assert.equal(classifyPath('/player/44').kind, 'player');
  assert.equal(classifyPath('/definitely/not/a/page').kind, 'notfound');
  assert.equal(classifyPath('/match').kind, 'notfound');
});

test('canonical: identifying params are kept, presentation params are dropped', () => {
  assert.equal(canonicalPath('/team/premier-league', '?teamId=65&tab=squad'), '/team/premier-league?teamId=65');
  assert.equal(canonicalPath('/team/champions-league', '?teamId=65'), '/team/champions-league?teamId=65');
  assert.equal(canonicalPath('/match/555', '?c=pl&utm_source=x'), '/match/555?c=PL');
  assert.equal(canonicalPath('/match/555', '?c=ZZ'), '/match/555');
  assert.equal(canonicalPath('/competition/premier-league', '?tab=stats&md=7'), '/competition/premier-league');
  assert.equal(canonicalPath('/matches', '?filter=live'), '/matches');
});

test('canonical: aliases consolidate onto the competition page; redirects and unknown things have none', () => {
  assert.equal(canonicalPath('/standings/premier-league'), '/competition/premier-league');
  assert.equal(canonicalPath('/fixtures/la-liga/2025-2026'), '/competition/la-liga/2025-2026');
  assert.equal(canonicalPath('/competition/uefa-champions-league'), '/competition/champions-league');   // alias slug → canonical slug
  assert.equal(canonicalPath('/live'), null);
  assert.equal(canonicalPath('/competition/no-such-league'), null);
  assert.equal(canonicalPath('/team/premier-league'), null);          // no teamId → not a real page
  assert.equal(canonicalPath('/match/abc'), null);
});

test('breadcrumbs follow the page hierarchy', () => {
  const t = breadcrumbTrail('/match/9', '?c=PL', 'Arsenal vs Leeds');
  assert.deepEqual(t.map((x) => x.name), ['Goal4U', 'Scores & fixtures', 'Premier League', 'Arsenal vs Leeds']);
  assert.equal(t[3].path, '/match/9?c=PL');
  assert.deepEqual(breadcrumbTrail('/nope'), []);
});
