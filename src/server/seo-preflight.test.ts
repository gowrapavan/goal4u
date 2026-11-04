import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight, safePath } from './seo-preflight';

test('trailing slashes redirect to the one canonical form, query kept', () => {
  assert.deepEqual(preflight('/matches/', ''), { redirect: '/matches' });
  assert.deepEqual(preflight('/competition/premier-league//', '?tab=stats'), { redirect: '/competition/premier-league?tab=stats' });
  assert.equal(preflight('/', ''), null); assert.equal(preflight('/matches', ''), null);
});

test('SECURITY: a redirect can never leave the site (no open redirect via "//host" or "/\\host")', () => {
  for (const p of ['//evil.com/', '//evil.com', '///evil.com//', '/\\evil.com/', '/\\\\evil.com', '//evil.com/path/']) {
    const r = preflight(p, '?x=1'); assert.ok(r && 'redirect' in r, p);
    const loc = (r as any).redirect as string;
    assert.ok(loc.startsWith('/') && !loc.startsWith('//') && !loc.startsWith('/\\'), `${p} → ${loc}`);
    assert.equal(new URL(loc, 'https://goal4u.com').origin, 'https://goal4u.com', `${p} → ${loc}`);
  }
  assert.equal(safePath('//evil.com/'), '/evil.com'); assert.equal(safePath('/a/b///'), '/a/b');
});

test('missing files are plain 404s; pages are not', () => {
  for (const p of ['/sitemap-x-1.xml', '/robots.txt', '/a.png', '/assets/old.js', '/x.json', '/font.woff2']) assert.deepEqual(preflight(p, ''), { plain404: true }, p);
  for (const p of ['/match/123', '/team/la-liga', '/competition/premier-league', '/news']) assert.equal(preflight(p, ''), null, p);
});
