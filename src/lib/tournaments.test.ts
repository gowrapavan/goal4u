import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPS, TOURNAMENTS, compBySlug, compByCode } from './competitions';
import { canonicalPath } from './routes';
import { resolveSeo } from '../server/seo-meta';
import { buildSeoIndex } from '../server/seo-data';

test('tournaments are resolvable pages but NOT part of the league list that drives the sitemap', () => {
  assert.deepEqual(TOURNAMENTS.map((t) => t.code), ['WC', 'EC']);
  assert.ok(!COMPS.some((c) => c.tournament));
  assert.equal(compBySlug('fifa-world-cup')?.code, 'WC'); assert.equal(compBySlug('european-championship')?.code, 'EC'); assert.equal(compBySlug('euro')?.code, 'EC');
  assert.equal(compByCode('WC')?.name, 'FIFA World Cup');
  assert.equal(canonicalPath('/competition/fifa-world-cup', ''), '/competition/fifa-world-cup');
});

test('search results link to /competition/fifa-world-cup: it is a 200 page that is not indexed; unknown slugs stay 404', async () => {
  const snapshot = { index: buildSeoIndex({ matches: {}, teams: {}, competitions: [] } as any), ready: false };
  const env: any = { origin: 'https://goal4u.com', snapshot };
  const wc = await resolveSeo({ path: '/competition/fifa-world-cup', search: '' }, env);
  assert.equal(wc.status, 200); assert.equal(wc.robots, 'noindex,follow');
  const pl = await resolveSeo({ path: '/competition/premier-league', search: '' }, env);
  assert.equal(pl.status, 200); assert.equal(pl.robots, 'index,follow');
  assert.equal((await resolveSeo({ path: '/competition/nope', search: '' }, env)).status, 404);
});
