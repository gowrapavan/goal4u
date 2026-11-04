import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import sax from 'sax';
import { createSitemapRouter } from './sitemap-api';
import { createSeoStore } from './seo-store';
import { createPageHandler } from './seo-page';
import { robotsTxt } from './site-url';
import { classifyPath } from '../lib/routes';
import { fixtureSource, match, ARS, LEE } from './seo-fixtures';
import type { SeoSource } from './seo-data';

const ORIGIN = 'https://goal4u.com';
const TEMPLATE = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');       // the REAL index.html shell

function startApp(source: () => SeoSource, lookup: (id: string) => Promise<any> = async () => null) {
  const store = createSeoStore(source, undefined, 0);                                         // ttl 0 → always fresh
  const app = express();
  app.use(createSitemapRouter({ store, origin: () => ORIGIN, ttlMs: 0 }));
  app.get('/robots.txt', (_q, r) => { r.type('text/plain; charset=utf-8'); r.send(robotsTxt(ORIGIN)); });
  app.use('/api', (_q, r) => { r.status(404).json({ error: 'Not found' }); });
  const page = createPageHandler({ store, origin: () => ORIGIN, lookupMatch: (id) => lookup(id), now: () => Date.UTC(2026, 9, 20) });
  app.get('*', (req, res, next) => { page(req, res, TEMPLATE).catch(next); });
  const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
}
const get = (base: string, path: string) => fetch(base + path, { redirect: 'manual' });
const xmlOk = (xml: string) => { const p = sax.parser(true); p.onerror = (e) => { throw e; }; p.write(xml).close(); };
const meta = (html: string, re: RegExp) => html.match(re)?.[1];
const canonical = (html: string) => meta(html, /<link rel="canonical" href="([^"]+)"/);
const unesc = (s?: string) => (s || '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ldBlocks = (html: string) => [...html.matchAll(/<script type="application\/ld\+json" data-rh="true">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

let ok: ReturnType<typeof startApp>, cold: ReturnType<typeof startApp>;
before(() => { ok = startApp(fixtureSource, async (id) => (id === '7777' ? { code: 'PL', match: match(7777, ARS, LEE, { utcDate: '2024-03-02T15:00:00Z' }) } : null)); cold = startApp(() => ({ competitions: [], matches: {}, teams: {} })); });
after(async () => { await ok.close(); await cold.close(); });

test('GET /robots.txt and /sitemap.xml: HTTP 200 with the right content types, robots references the real index', async () => {
  const r = await get(ok.base, '/robots.txt'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type')!, /text\/plain/);
  assert.match(await r.text(), /Sitemap: https:\/\/goal4u\.com\/sitemap\.xml/);
  const s = await get(ok.base, '/sitemap.xml'); assert.equal(s.status, 200); assert.match(s.headers.get('content-type')!, /application\/xml/);
  xmlOk(await s.text());
});

test('every child sitemap listed in the index is reachable, valid XML, application/xml', async () => {
  const idx = await (await get(ok.base, '/sitemap.xml')).text();
  const locs = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]); assert.ok(locs.length >= 4);
  for (const loc of locs) {
    const res = await get(ok.base, new URL(loc).pathname); assert.equal(res.status, 200, loc);
    assert.match(res.headers.get('content-type')!, /application\/xml/); xmlOk(await res.text());
  }
});

test('an unknown sitemap is a plain 404 — never the HTML app shell; removed legacy sitemaps redirect or are gone', async () => {
  const r = await get(ok.base, '/sitemap-nope-1.xml'); assert.equal(r.status, 404); assert.doesNotMatch(r.headers.get('content-type')!, /html/);
  assert.equal((await get(ok.base, '/sitemap-matches-99.xml')).status, 404);
  const m = await get(ok.base, '/sitemap-matches.xml'); assert.equal(m.status, 301); assert.equal(m.headers.get('location'), '/sitemap-matches-1.xml');
  assert.equal((await get(ok.base, '/sitemap-h2h.xml')).status, 410); assert.equal((await get(ok.base, '/sitemap-players.xml')).status, 410);
});

test('while the data cache is still empty the sitemap answers 503 + Retry-After instead of a partial file', async () => {
  const r = await get(cold.base, '/sitemap.xml'); assert.equal(r.status, 503); assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await get(cold.base, '/sitemap-matches-1.xml')).status, 503);
});

test('a real match page: 200, canonical equals its sitemap URL, title/description from the real record, valid JSON-LD', async () => {
  const sm = await (await get(ok.base, '/sitemap-matches-1.xml')).text();
  const loc = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unesc(m[1])).find((l) => l.includes('/match/1001'))!;
  assert.equal(loc, `${ORIGIN}/match/1001?c=PL`);
  const u = new URL(loc);
  const r = await get(ok.base, u.pathname + u.search + '&utm_campaign=x'); assert.equal(r.status, 200);
  const html = await r.text();
  assert.equal(canonical(html), loc);                                                             // page canonical == sitemap loc, tracking param stripped
  assert.equal((html.match(/<title>/g) || []).length, 1); assert.match(html, /<title>Arsenal 2-1 Leeds United – result, stats &amp; head to head \| Goal4U<\/title>/);
  assert.equal((html.match(/<meta name="description"/g) || []).length, 1);
  assert.match(html, /<meta name="robots" content="index,follow"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/goal4u\.com\/match\/1001\?c=PL"/);
  const ld = ldBlocks(html); const ev = ld.find((x) => x['@type'] === 'SportsEvent'); const bc = ld.find((x) => x['@type'] === 'BreadcrumbList');
  assert.equal(ev.name, 'Arsenal vs Leeds United'); assert.equal(ev.startDate, '2026-10-10T14:00:00.000Z'); assert.ok(!('location' in ev), 'no venue is in the data, so none is claimed');
  assert.deepEqual(bc.itemListElement.map((i: any) => i.name), ['Goal4U', 'Scores & fixtures', 'Premier League', 'Arsenal vs Leeds United']);
  assert.match(html, /<div id="root"><main data-seo-fallback="true"/);                           // app shell intact, now with real content inside
});

test('an upcoming match targets "live score, stats & head to head" and never invents a score', async () => {
  const html = await (await get(ok.base, '/match/1002?c=PL')).text();
  assert.match(html, /<title>Chelsea vs A&amp;B &lt;Rovers&gt; "FC" – live score, stats &amp; head to head \| Goal4U<\/title>/);
  assert.match(html, /name="description" content="Chelsea vs A&amp;B[^"]*on 1 Nov 2026\. Live score on the day/);
  assert.doesNotMatch(html, /og:description" content="[^"]*\d-\d/);
});

test('special characters in team names are escaped in HTML attributes and JSON-LD (no markup injection)', async () => {
  const html = await (await get(ok.base, '/match/1002?c=PL')).text();
  assert.ok(!html.includes('<Rovers>'), 'raw < > from a team name leaked into the HTML');
  assert.match(html, /A&amp;B &lt;Rovers&gt; &quot;FC&quot;/);
  const raw = html.match(/<script type="application\/ld\+json" data-rh="true">([\s\S]*?)<\/script>/)![1];
  assert.ok(!raw.includes('<'), 'a "<" appears unescaped inside a JSON-LD script');
  assert.equal(ldBlocks(html).find((x) => x['@type'] === 'SportsEvent').awayTeam.name, 'A&B <Rovers> "FC"');
});

test('unknown match IDs do NOT return a successful homepage: 404 + noindex + not-found metadata', async () => {
  for (const p of ['/match/424242', '/match/424242?c=PL', '/match/not-a-number']) {
    const r = await get(ok.base, p); assert.equal(r.status, 404, p);
    const html = await r.text(); assert.match(html, /<title>Page not found \| Goal4U<\/title>/); assert.match(html, /name="robots" content="noindex,follow"/); assert.equal(canonical(html), undefined);
  }
});

test('an older-season match found by the authoritative lookup is served (200) with its own record, not 404', async () => {
  const r = await get(ok.base, '/match/7777?c=PL'); assert.equal(r.status, 200);
  assert.match(await r.text(), /Arsenal 2-1 Leeds United/);
});

test('if the data cache is not ready, an unverifiable match is served but marked noindex (never a false 404)', async () => {
  const r = await get(cold.base, '/match/123?c=PL'); assert.equal(r.status, 200); assert.match(await r.text(), /name="robots" content="noindex,follow"/);
});

test('competition pages: real → 200 with canonical; aliases canonicalise to the competition; unknown → 404', async () => {
  const a = await get(ok.base, '/competition/premier-league'); assert.equal(a.status, 200);
  const html = await a.text(); assert.equal(canonical(html), `${ORIGIN}/competition/premier-league`); assert.match(html, /<title>Premier League 2026\/2027 Table, Fixtures, Results &amp; Stats \| Goal4U<\/title>/);
  assert.equal(canonical(await (await get(ok.base, '/standings/premier-league?tab=stats')).text()), `${ORIGIN}/competition/premier-league`);
  assert.equal(canonical(await (await get(ok.base, '/competition/uefa-champions-league')).text()), `${ORIGIN}/competition/champions-league`);
  assert.equal((await get(ok.base, '/competition/no-such-league')).status, 404);
});

test('team pages: known club → 200 with SportsTeam JSON-LD and ?teamId kept in the canonical; unknown / missing id → 404', async () => {
  const r = await get(ok.base, '/team/la-liga?teamId=86&tab=squad'); assert.equal(r.status, 200);
  const html = await r.text(); assert.equal(canonical(html), `${ORIGIN}/team/la-liga?teamId=86`);
  assert.equal(ldBlocks(html).find((x) => x['@type'] === 'SportsTeam').name, 'Real Madrid');
  assert.equal((await get(ok.base, '/team/la-liga?teamId=31337')).status, 404);
  assert.equal((await get(ok.base, '/team/la-liga')).status, 404);
});

test('the app\'s own redirects are real HTTP 301s with the same targets as the router; unknown paths are 404', async () => {
  for (const [from, to] of [['/live', '/matches?filter=live'], ['/media', '/watch'], ['/h2h/a-vs-b', '/matches'], ['/top-scorers/la-liga', '/competition/la-liga?tab=stats']]) {
    const r = await get(ok.base, from); assert.equal(r.status, 301, from); assert.equal(r.headers.get('location'), to);
    assert.equal(classifyPath(from).redirectTo, to);
  }
  assert.equal((await get(ok.base, '/this/page/is/not/real')).status, 404);
  assert.equal((await get(ok.base, '/api/unknown')).status, 404); assert.match((await get(ok.base, '/api/unknown')).headers.get('content-type')!, /json/);
});

test('static pages are indexable with their canonical; the homepage has WebSite + Organization data', async () => {
  for (const p of ['/', '/matches', '/news', '/watch']) { const r = await get(ok.base, p); assert.equal(r.status, 200); const html = await r.text(); assert.equal(canonical(html), ORIGIN + p); assert.match(html, /name="robots" content="index,follow"/); }
  const types = ldBlocks(await (await get(ok.base, '/')).text()).map((x) => x['@type']); assert.deepEqual(types, ['WebSite', 'Organization']);
  const home = await (await get(ok.base, '/')).text(); const site = ldBlocks(home).find((x) => x['@type'] === 'WebSite');
  assert.deepEqual(site.alternateName, ['Goal4U Live', 'Goal 4 U', 'Goal U']);                       // brand spellings people search
  assert.match(home, /<title>Goal4U Live – Football Scores, Fixtures, Tables &amp; Match Centre<\/title>/);
});

test('no page marked noindex is listed in the sitemap, and every listed URL serves 200 + index', async () => {
  const idx = await (await get(ok.base, '/sitemap.xml')).text();
  for (const sm of [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)) {
    const x = await (await get(ok.base, sm)).text();
    for (const loc of [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unesc(m[1]))) {
      const u = new URL(loc); const r = await get(ok.base, u.pathname + u.search); assert.equal(r.status, 200, loc);
      const html = await r.text(); assert.match(html, /name="robots" content="index,follow"/, loc); assert.equal(canonical(html), loc, `canonical != sitemap URL for ${loc}`);
    }
  }
});

test('malformed sitemap-looking URLs are plain 404s too (never HTML)', async () => {
  for (const p of ['/sitemap-.xml', '/sitemap_x.xml', '/sitemap-Matches-1.xml', '/sitemap-a-b-c.xml']) {
    const r = await get(ok.base, p); assert.equal(r.status, 404, p); assert.doesNotMatch(r.headers.get('content-type')!, /html/, p);
  }
});

const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');

test('El Clásico: the exact phrase people search, with the derby name, in title, description, h1 and JSON-LD', async () => {
  const html = await (await get(ok.base, '/match/2001?c=PD')).text();
  assert.match(html, /<title>Real Madrid 2-1 Barcelona \(El Clásico\) – result, stats &amp; head to head \| Goal4U<\/title>/);
  assert.match(html, /name="description" content="Real Madrid 2-1 Barcelona \(El Clásico\) in the La Liga, matchday 9/);
  assert.match(html, /<h1>Real Madrid vs Barcelona – El Clásico, La Liga matchday 9<\/h1>/);
  assert.equal(ldBlocks(html).find((x) => x['@type'] === 'SportsEvent').name, 'Real Madrid vs Barcelona');
  const other = await (await get(ok.base, '/match/3001?c=SA')).text();                         // a non-derby gets no derby label
  assert.doesNotMatch(other, /El Clásico|derby/);
});

test('the first HTML response already contains real content: h1, facts, previous meetings and internal links', async () => {
  const html = await (await get(ok.base, '/match/2001?c=PD')).text();
  const body = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script/)?.[1] || html.match(/<div id="root">([\s\S]*)<\/main>/)![1];
  assert.match(body, /data-seo-fallback="true"/);
  assert.match(body, /Competition: <a href="\/competition\/la-liga">La Liga<\/a>/);
  assert.match(body, /Kick-off: 10 October 2026/);
  assert.match(body, /<h2>Head to head: Real Madrid v Barcelona<\/h2>/);
  assert.match(body, /<a href="\/match\/2000\?c=PD">Barcelona 0-3 Real Madrid<\/a>/);       // a real earlier meeting, linked
  assert.match(body, /<a href="\/team\/la-liga\?teamId=86">Real Madrid fixtures, results &amp; squad<\/a>/);
  assert.doesNotMatch(body, /\/match\/2001/);                                                  // the page does not list itself as a "previous" meeting
});

test('home, competition and team pages also ship crawlable text and links to match pages', async () => {
  const home = await (await get(ok.base, '/')).text();
  assert.match(home, /<h1>Live football scores, fixtures &amp; league tables<\/h1>/); assert.match(home, /<a href="\/match\/1002\?c=PL">Chelsea vs A&amp;B &lt;Rovers&gt; "FC"<\/a>/);
  const comp = await (await get(ok.base, '/competition/la-liga')).text();
  assert.match(comp, /<h1>La Liga 2026\/2027 table, fixtures &amp; results<\/h1>/); assert.match(comp, /<a href="\/team\/la-liga\?teamId=81">Barcelona<\/a>/);
  const team = await (await get(ok.base, '/team/la-liga?teamId=86')).text();
  assert.match(team, /<h1>Real Madrid fixtures, results &amp; squad<\/h1>/); assert.match(team, /\/match\/2001\?c=PD/);
});

test('no title, description or page text promises "highlights" until the page really has them', async () => {
  for (const p of ['/', '/matches', '/competition/premier-league', '/team/la-liga?teamId=86', '/match/2001?c=PD', '/match/1002?c=PL']) {
    const html = await (await get(ok.base, p)).text();
    assert.doesNotMatch(html.match(/<title>[\s\S]*?<\/title>/)![0] + (html.match(/name="description" content="[^"]*"/)?.[0] || '') + text(html.match(/<div id="root">[\s\S]*<\/main>/)?.[0] || ''), /highlight/i, p);
  }
});

test('page body text is escaped (no raw markup from team names) and the app shell root is still a single element', async () => {
  const html = await (await get(ok.base, '/match/1002?c=PL')).text();
  assert.ok(!html.includes('<Rovers>')); assert.equal((html.match(/id="root"/g) || []).length, 1);
});

test('Express host has the same URL hygiene as Netlify: trailing slash → 301, no open redirect, missing files → plain 404', async () => {
  const r = await get(ok.base, '/matches/'); assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/matches');
  const s2 = await get(ok.base, '/competition/premier-league/?tab=stats'); assert.equal(s2.headers.get('location'), '/competition/premier-league?tab=stats');
  const ev = await fetch(ok.base + '//evil.com/', { redirect: 'manual' }); const loc = ev.headers.get('location'); assert.equal(ev.status, 301); assert.ok(loc && loc.startsWith('/') && !loc.startsWith('//'), String(loc));
  const png = await get(ok.base, '/missing.png'); assert.equal(png.status, 404); assert.match(png.headers.get('content-type')!, /text\/plain/);
});
