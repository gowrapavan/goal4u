import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import page, { config, _resetForTests } from '../../netlify/functions/page';
import rebuild, { config as rebuildConfig } from '../../netlify/functions/rebuild';
import { writeSeoFiles } from './seo-build';
import { fixtureSource, match, ARS, LEE } from './seo-fixtures';

const SITE = 'https://goal4u.com';
const realFetch = globalThis.fetch; const realCwd = process.cwd();
/** A deploy folder shaped like dist/ after `npm run build:netlify`. */
function deployDir(context?: string) {
  const d = mkdtempSync(path.join(tmpdir(), 'deploy-')); writeSeoFiles(fixtureSource(), { outDir: d, origin: SITE, context });
  copyFileSync(path.join(realCwd, 'index.html'), path.join(d, 'app-shell.html')); return d;
}
const req = (p: string, init: RequestInit = {}) => new Request(SITE + p, init);
const run = async (p: string, init?: RequestInit) => { const r = await page(req(p, init)); return { r, html: await r.text() }; };
const canonical = (h: string) => h.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
const resp = (body: any, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });

beforeEach(() => { _resetForTests(); process.env.SEO_ASSET_DIR = deployDir(); globalThis.fetch = (async () => { throw new Error('network blocked in test'); }) as any; });
after(() => { globalThis.fetch = realFetch; process.chdir(realCwd); delete process.env.SEO_ASSET_DIR; });

test('routing config: every path goes to the function, but real files in dist/ (assets, sitemaps, robots) win', () => {
  assert.equal(config.path, '/*'); assert.equal(config.preferStatic, true);
});

test('a match page: 200 + canonical + keyword title + crawlable body, with CDN caching and per-query variants', async () => {
  const { r, html } = await run('/match/2001?c=PD&utm_source=x');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type')!, /text\/html/);
  assert.equal(canonical(html), `${SITE}/match/2001?c=PD`);
  assert.match(html, /<title>Real Madrid 2-1 Barcelona \(El Clásico\) – result, stats &amp; head to head \| Goal4U<\/title>/);
  assert.match(html, /<h1>Real Madrid vs Barcelona – El Clásico, La Liga matchday 9<\/h1>/);
  assert.match(html, /<a href="\/match\/2000\?c=PD">Barcelona 0-3 Real Madrid<\/a>/);
  assert.match(r.headers.get('netlify-cdn-cache-control')!, /stale-while-revalidate/); assert.match(r.headers.get('netlify-vary')!, /teamId/); assert.match(r.headers.get('netlify-vary')!, /\bc\b/);
  assert.equal(r.headers.get('x-robots-tag'), null);
});

test('"/" is served by the function too, with WebSite structured data (no static index.html shadows it)', async () => {
  const { r, html } = await run('/'); assert.equal(r.status, 200); assert.equal(canonical(html), `${SITE}/`);
  assert.match(html, /"@type":"WebSite"/); assert.match(html, /<h1>Live football scores, fixtures &amp; league tables<\/h1>/);
});

test('team, competition and listing pages', async () => {
  const t = await run('/team/la-liga?teamId=86'); assert.equal(t.r.status, 200); assert.equal(canonical(t.html), `${SITE}/team/la-liga?teamId=86`); assert.match(t.html, /"@type":"SportsTeam"/);
  assert.equal((await run('/team/la-liga')).r.status, 404); assert.equal((await run('/team/la-liga?teamId=31337')).r.status, 404);
  const c = await run('/standings/premier-league'); assert.equal(c.r.status, 200); assert.equal(canonical(c.html), `${SITE}/competition/premier-league`);
  for (const p of ['/matches', '/news', '/watch']) { const x = await run(p); assert.equal(x.r.status, 200); assert.match(x.html, /<h1>/); assert.match(x.html, /<a href="\//); }
});

test('real HTTP redirects, trailing-slash normalisation, and true 404s', async () => {
  for (const [from, to] of [['/live', '/matches?filter=live'], ['/media', '/watch'], ['/h2h/a-vs-b', '/matches'], ['/top-scorers/la-liga', '/competition/la-liga?tab=stats'], ['/matches/', '/matches'], ['/competition/premier-league/?tab=stats', '/competition/premier-league?tab=stats']]) {
    const r = await page(req(from)); assert.equal(r.status, 301, from); assert.equal(r.headers.get('location'), to, from);
  }
  const nf = await run('/this/is/nothing'); assert.equal(nf.r.status, 404); assert.match(nf.html, /name="robots" content="noindex,follow"/); assert.equal(canonical(nf.html), undefined);
  assert.equal((await run('/competition/no-such-league')).r.status, 404);
});

test('a missing FILE (sitemap, image, script) is a plain-text 404, never the HTML app shell', async () => {
  for (const p of ['/sitemap-nope-1.xml', '/sitemap-matches-99.xml', '/missing.png', '/assets/old-hash.js', '/x.json']) {
    const { r, html } = await run(p); assert.equal(r.status, 404, p); assert.match(r.headers.get('content-type')!, /text\/plain/); assert.doesNotMatch(html, /<html/i);
  }
});

test('HEAD returns headers only; other methods are rejected', async () => {
  const h = await page(req('/matches', { method: 'HEAD' })); assert.equal(h.status, 200); assert.equal(await h.text(), '');
  const p = await page(req('/matches', { method: 'POST' })); assert.equal(p.status, 405); assert.equal(p.headers.get('allow'), 'GET, HEAD');
});

test('unknown match id: source says "not there" → 404; source unreachable → served but noindex (never a false 404); older season found → 200', async () => {
  globalThis.fetch = (async () => resp({ data: [] })) as any;
  const gone = await run('/match/424242?c=PL'); assert.equal(gone.r.status, 404); assert.match(gone.html, /<title>Page not found/);
  globalThis.fetch = (async () => { throw new Error('offline'); }) as any;
  const out = await run('/match/424242?c=PL'); assert.equal(out.r.status, 200); assert.match(out.html, /name="robots" content="noindex,follow"/); assert.equal(canonical(out.html), undefined);
  globalThis.fetch = (async (u: any) => String(u).includes('2025-2026/PL') ? resp({ data: [match(7777, ARS, LEE, { utcDate: '2026-03-02T15:00:00Z' })] }) : resp({ data: [] })) as any;
  const old = await run('/match/7777?c=PL'); assert.equal(old.r.status, 200); assert.match(old.html, /Arsenal 2-1 Leeds United/); assert.equal(canonical(old.html), `${SITE}/match/7777?c=PL`);
});

test('deploy previews and branch deploys send X-Robots-Tag: noindex', async () => {
  _resetForTests(); process.env.SEO_ASSET_DIR = deployDir('deploy-preview');
  assert.equal((await page(req('/matches'))).headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('if the packaged assets cannot be found anywhere, answer 503 + Retry-After (retried on the next request, not cached)', async () => {
  _resetForTests(); const empty = mkdtempSync(path.join(tmpdir(), 'empty-')); process.env.SEO_ASSET_DIR = empty; process.chdir(empty);
  const r = await page(req('/matches')); assert.equal(r.status, 503); assert.ok(Number(r.headers.get('retry-after')) > 0);
  process.chdir(realCwd); process.env.SEO_ASSET_DIR = deployDir();
  assert.equal((await page(req('/matches'))).status, 200);                                  // recovered without a restart
});

test('assets fall back to the deployment\'s own CDN when the files are not on disk', async () => {
  _resetForTests(); const empty = mkdtempSync(path.join(tmpdir(), 'empty-')); process.env.SEO_ASSET_DIR = empty; process.chdir(empty);
  const dir = deployDir(); const seen: string[] = [];
  globalThis.fetch = (async (u: any) => { const url = new URL(String(u)); seen.push(url.pathname); const f = path.join(dir, url.pathname); try { const body = readFileSync(f, 'utf8'); return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) }; } catch { return resp({}, false, 404); } }) as any;
  const r = await page(req('/matches')); process.chdir(realCwd); assert.equal(r.status, 200); assert.deepEqual(seen.sort(), ['/_seo/index.json', '/app-shell.html']);
});

test('scheduled rebuild: runs every 6 hours, calls only a real Netlify build hook, and says so when it is not configured', async () => {
  assert.equal(rebuildConfig.schedule, '0 */6 * * *'); assert.equal(rebuildConfig.schedule.split(' ').length, 5);
  const calls: any[] = []; globalThis.fetch = (async (u: any, i: any) => { calls.push([String(u), i?.method]); return resp({}); }) as any;
  delete process.env.BUILD_HOOK_URL; await rebuild(); assert.equal(calls.length, 0);
  process.env.BUILD_HOOK_URL = 'https://evil.example.com/hook'; await rebuild(); assert.equal(calls.length, 0);
  process.env.BUILD_HOOK_URL = 'https://api.netlify.com/build_hooks/abc123DEF'; await rebuild(); assert.deepEqual(calls, [['https://api.netlify.com/build_hooks/abc123DEF', 'POST']]);
  delete process.env.BUILD_HOOK_URL;
});

test('SECURITY: the function never redirects off-site (//evil.com/ , /\\evil.com/)', async () => {
  for (const raw of ['https://goal4u.com//evil.com/', 'https://goal4u.com///evil.com//']) {
    const r = await page(new Request(raw)); assert.equal(r.status, 301, raw);
    const loc = r.headers.get('location')!; assert.ok(loc.startsWith('/') && !loc.startsWith('//'), `${raw} → ${loc}`);
    assert.equal(new URL(loc, SITE).origin, SITE);
  }
});

/** A deploy built with NO configured domain (origin ''), as when APP_URL / Netlify's URL are not set. */
function autoDeployDir() {
  const d = mkdtempSync(path.join(tmpdir(), 'deploy-auto-')); const res = writeSeoFiles(fixtureSource(), { outDir: d, origin: '' });
  copyFileSync(path.join(realCwd, 'index.html'), path.join(d, 'app-shell.html')); return { d, res };
}
test('NO domain configured: the build writes no robots/sitemaps, and the function serves them for whichever domain asks', async () => {
  const { d, res } = autoDeployDir(); process.env.SEO_ASSET_DIR = d; _resetForTests();
  assert.ok(!res.files.includes('robots.txt') && !res.files.includes('sitemap.xml')); assert.ok(res.files.includes('_seo/index.json'));
  for (const host of ['https://one.netlify.app', 'https://www.new-domain.com']) {
    const robots = await (await page(new Request(host + '/robots.txt'))).text();
    assert.match(robots, new RegExp(`Sitemap: ${host.replace(/\./g, '\\.')}/sitemap\\.xml`)); assert.doesNotMatch(robots, /goal4u\.com/);
    const idx = await page(new Request(host + '/sitemap.xml')); assert.equal(idx.status, 200); assert.match(idx.headers.get('content-type')!, /xml/);
    const xml = await idx.text(); assert.match(xml, new RegExp(`<loc>${host.replace(/\./g, '\\.')}/sitemap-`)); assert.doesNotMatch(xml, /goal4u\.com/);
    const child = xml.match(/<loc>([^<]+sitemap-[^<]+\.xml)<\/loc>/)![1];
    const c = await page(new Request(child)); assert.equal(c.status, 200); assert.match(await c.text(), new RegExp(`<loc>${host.replace(/\./g, '\\.')}/`));
    const { html } = { html: await (await page(new Request(host + '/match/2001?c=PD'))).text() };
    assert.equal(canonical(html), `${host}/match/2001?c=PD`);                    // canonicals follow the domain being served
  }
  assert.equal((await page(new Request('https://one.netlify.app/sitemap-nope.xml'))).status, 404);
});
