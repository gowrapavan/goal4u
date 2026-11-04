import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sax from 'sax';
import { writeSeoFiles } from './seo-build';
import { hydrateIndex } from './seo-data';
import { fixtureSource, deepFreeze } from './seo-fixtures';
import { classifyPath, canonicalPath } from '../lib/routes';

const ORIGIN = 'https://goal4u.com';
const tmp = () => mkdtempSync(path.join(tmpdir(), 'seo-build-'));
const xml = (s: string) => { const p = sax.parser(true); p.onerror = (e) => { throw e; }; p.write(s).close(); };
const read = (d: string, f: string) => readFileSync(path.join(d, f), 'utf8');

test('writes robots.txt, the sitemap index, every child and the page index — all valid and consistent', () => {
  const out = tmp(); const r = writeSeoFiles(fixtureSource(), { outDir: out, origin: ORIGIN, builtAt: '2026-10-17T00:00:00.000Z' });
  assert.deepEqual(r.files.sort(), ['_seo/index.json', 'llms.txt', 'robots.txt', 'sitemap-competitions-1.xml', 'sitemap-matches-1.xml', 'sitemap-pages-1.xml', 'sitemap-teams-1.xml', 'sitemap.xml']);
  assert.match(read(out, 'robots.txt'), /Disallow: \/api\/\n\nSitemap: https:\/\/goal4u\.com\/sitemap\.xml\n$/);
  xml(read(out, 'sitemap.xml')); for (const f of r.files.filter((x) => /^sitemap-/.test(x))) xml(read(out, f));
  const refs = [...read(out, 'sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].split('/').pop()!);
  assert.deepEqual(refs.sort(), r.files.filter((x) => /^sitemap-/.test(x)).sort());                 // index ↔ files
  assert.equal(r.totalUrls, 8 + 5 + 11 + 7);
});

test('the page index round-trips exactly (what the function reads equals what the build indexed)', () => {
  const out = tmp(); const r = writeSeoFiles(fixtureSource(), { outDir: out, origin: ORIGIN, builtAt: '2026-10-17T00:00:00.000Z' });
  const j = JSON.parse(read(out, '_seo/index.json')); assert.equal(j.origin, ORIGIN); assert.equal(j.context, 'production'); assert.equal(j.builtAt, '2026-10-17T00:00:00.000Z');
  const h = hydrateIndex(j);
  assert.deepEqual(h.matches, r.index.matches); assert.deepEqual(h.teams, r.index.teams); assert.deepEqual(h.competitions, r.index.competitions);
  assert.equal(h.matchById.get(2001)!.path, '/match/2001?c=PD'); assert.equal(h.teamById.get(86)!.path, '/team/la-liga?teamId=86');
  assert.throws(() => hydrateIndex({ v: 2 } as any), /Unsupported/);
});

test('every URL written to the sitemaps is a real route and its own canonical', () => {
  const out = tmp(); writeSeoFiles(fixtureSource(), { outDir: out, origin: ORIGIN });
  for (const f of readdirSync(out).filter((x) => /^sitemap-/.test(x))) for (const m of read(out, f).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = new URL(m[1].replace(/&amp;/g, '&')); assert.ok(['home', 'matches', 'news', 'watch', 'info', 'competition', 'match', 'team'].includes(classifyPath(u.pathname).kind), m[1]);
    assert.equal(canonicalPath(u.pathname, u.search), u.pathname + u.search);
  }
});

test('incomplete data FAILS the build and writes nothing — a partial sitemap is never published', () => {
  const out = tmp();
  assert.throws(() => writeSeoFiles({ competitions: [], matches: {}, teams: {} }, { outDir: out, origin: ORIGIN }), /incomplete/);
  const half = fixtureSource(); half.matches = { PL: half.matches.PL };
  assert.throws(() => writeSeoFiles(half, { outDir: out, origin: ORIGIN }), /incomplete/);
  const none = fixtureSource(); for (const k of Object.keys(none.matches)) none.matches[k] = none.matches[k].map(() => ({ id: 'x' }));
  assert.throws(() => writeSeoFiles(none, { outDir: out, origin: ORIGIN }), /nothing indexable/);
  assert.deepEqual(readdirSync(out), []);
});

test('deploy previews / branch deploys are kept out of search engines', () => {
  const out = tmp(); const r = writeSeoFiles(fixtureSource(), { outDir: out, origin: ORIGIN, context: 'deploy-preview' });
  assert.equal(read(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n'); assert.equal(r.indexable, false);
  assert.equal(JSON.parse(read(out, '_seo/index.json')).context, 'deploy-preview'); assert.ok(r.warnings.some((w) => /not production/.test(w)));
});

test('API_ORIGIN becomes a Netlify proxy rule for /api/*; a bad value fails the build; a missing one is fine (the function serves /api/*)', () => {
  const a = tmp(); const r1 = writeSeoFiles(fixtureSource(), { outDir: a, origin: ORIGIN, apiOrigin: 'https://api.example.com/' });
  assert.equal(read(a, '_redirects'), '/api/*  https://api.example.com/api/:splat  200\n'); assert.equal(r1.warnings.length, 0);
  assert.throws(() => writeSeoFiles(fixtureSource(), { outDir: tmp(), origin: ORIGIN, apiOrigin: 'http://insecure.example.com' }), /https origin/);
  assert.throws(() => writeSeoFiles(fixtureSource(), { outDir: tmp(), origin: ORIGIN, apiOrigin: 'https://x.com/evil path' }), /https origin/);
  const b = tmp(); const r2 = writeSeoFiles(fixtureSource(), { outDir: b, origin: ORIGIN });
  assert.ok(!existsSync(path.join(b, '_redirects'))); assert.ok(!r2.warnings.some((w) => /API_ORIGIN/.test(w)));
});

test('the build never modifies the source football data', () => {
  const src = fixtureSource(); const before = JSON.stringify(src); deepFreeze(src);
  writeSeoFiles(src, { outDir: tmp(), origin: ORIGIN }); assert.equal(JSON.stringify(src), before);
});
