import test from 'node:test';
import assert from 'node:assert/strict';
import sax from 'sax';
import { buildSeoIndex, dataIsReady, DEFAULT_SEO_CONFIG } from './seo-data';
import { buildSitemaps, groupsFromIndex, validateSitemapSet, escapeXml, absoluteUrl, GOOGLE_MAX_URLS, SITEMAP_NS } from './sitemap-builder';
import { siteOrigin, robotsTxt } from './site-url';
import { classifyPath, canonicalPath } from '../lib/routes';
import { fixtureSource, deepFreeze } from './seo-fixtures';

const ORIGIN = 'https://goal4u.com';
/** Strict XML parse with a real parser: throws on any well-formedness error. Returns root name, namespace and decoded <loc> values. */
function parseXml(xml: string) {
  const p = sax.parser(true, { xmlns: true }); let root = '', ns = '', cur = ''; const locs: string[] = []; let urls = 0;
  p.onerror = (e) => { throw e; };
  p.onopentag = (n: any) => { if (!root) { root = n.local; ns = n.uri; } cur = n.local; if (n.local === 'url' || n.local === 'sitemap') urls++; };
  p.ontext = (t) => { if (cur === 'loc') locs.push(t); };
  p.onclosetag = () => { cur = ''; };
  p.write(xml).close();
  return { root, ns, locs, urls };
}
const build = (maxUrls?: number) => { const idx = buildSeoIndex(fixtureSource()); return { idx, set: buildSitemaps(groupsFromIndex(idx, DEFAULT_SEO_CONFIG.staticPaths), { origin: ORIGIN, maxUrls }) }; };

test('valid records become URLs; malformed, placeholder, duplicate and non-indexable ones are excluded', () => {
  const { idx } = build();
  const ids = idx.matches.map((m) => m.id);
  assert.deepEqual(ids, [1001, 1002, 2000, 2001, 3001, 4001, 5001]);               // 1001 once; 1003/4/5/6/7/8 + 'abc' dropped
  assert.equal(idx.skipped['match: duplicate id'], 2);                         // PL repeat + CL repeat
  assert.ok(idx.skipped['match: teams not decided yet'] >= 2);
  assert.equal(idx.skipped['match: invalid date'], 1);
  assert.ok(idx.skipped['match: status CANCELLED not indexable'] === 1 && idx.skipped['match: status POSTPONED not indexable'] === 1);
  assert.equal(idx.matchById.get(1001)!.lastmod, '2026-10-11T00:00:00.000Z');  // the newer duplicate wins
  assert.equal(idx.teams.length, 11);                                          // 4+2+2+2 league clubs + Sporting (CL only); invalid record dropped, repeated ids merged
  assert.equal(idx.teams.find((t) => t.id === 57)!.code, 'PL');                // domestic league beats the Champions League
});

test('match, team and competition URLs use the real route formats', () => {
  const { idx } = build();
  assert.equal(idx.matchById.get(2001)!.path, '/match/2001?c=PD');
  assert.equal(idx.teamById.get(86)!.path, '/team/la-liga?teamId=86');
  assert.equal(idx.teamById.get(498)!.path, '/team/champions-league?teamId=498');
  assert.deepEqual(idx.competitions.map((c) => c.path), ['/competition/premier-league', '/competition/la-liga', '/competition/serie-a', '/competition/bundesliga', '/competition/champions-league']);
});

test('every sitemap URL is a real route, is its own canonical, and is never a redirect / alias / unknown page', () => {
  const { set } = build();
  const kinds = new Set<string>();
  for (const f of set.files) for (const loc of parseXml(f.xml).locs) {
    const u = new URL(loc); assert.equal(u.origin, ORIGIN);
    const c = classifyPath(u.pathname); kinds.add(c.kind);
    assert.ok(['home', 'matches', 'news', 'watch', 'info', 'competition', 'match', 'team'].includes(c.kind), `${loc} is a ${c.kind} page`);
    assert.equal(canonicalPath(u.pathname, u.search), u.pathname + u.search, `${loc} is not its own canonical`);
  }
  assert.deepEqual([...kinds].sort(), ['competition', 'home', 'info', 'match', 'matches', 'news', 'team', 'watch']);
});

test('the sitemap never lists redirecting or duplicate-content URLs', () => {
  const all = build().set.files.flatMap((f) => parseXml(f.xml).locs).join('\n');
  for (const bad of ['/live', '/media', '/h2h/', '/standings/', '/results/', '/fixtures/', '/stats/', '/top-scorers/', '/archive/', '/player/']) assert.ok(!all.includes(bad), `found ${bad}`);
});

test('files: valid XML, standard namespace, no empty files, deterministic order, index references every file', () => {
  const { set } = build();
  assert.deepEqual(set.files.map((f) => f.name), ['sitemap-pages-1.xml', 'sitemap-competitions-1.xml', 'sitemap-teams-1.xml', 'sitemap-matches-1.xml']);
  for (const f of set.files) { const r = parseXml(f.xml); assert.equal(r.root, 'urlset'); assert.equal(r.ns, SITEMAP_NS); assert.equal(r.urls, f.count); assert.ok(f.count > 0); }
  const idx = parseXml(set.indexXml); assert.equal(idx.root, 'sitemapindex'); assert.equal(idx.ns, SITEMAP_NS);
  assert.deepEqual(idx.locs, set.files.map((f) => `${ORIGIN}/${f.name}`));
  assert.doesNotThrow(() => validateSitemapSet(set, { origin: ORIGIN }));
  assert.deepEqual(build().set.files.map((f) => f.xml), set.files.map((f) => f.xml));      // same input → identical output
});

test('chunking: a small batch size splits into numbered files and every file stays within the limit', () => {
  const { set } = build(2);
  const matchFiles = set.files.filter((f) => f.name.startsWith('sitemap-matches-'));
  assert.deepEqual(matchFiles.map((f) => f.name), ['sitemap-matches-1.xml', 'sitemap-matches-2.xml', 'sitemap-matches-3.xml', 'sitemap-matches-4.xml']);
  for (const f of set.files) assert.ok(f.count <= 2);
  assert.equal(set.totalUrls, 8 + 5 + 11 + 7);                                         // pages + competitions + teams + matches
  assert.doesNotThrow(() => validateSitemapSet(set, { origin: ORIGIN, maxUrls: 2 }));
  assert.equal(parseXml(set.indexXml).urls, set.files.length);
});

test('limits: never above 50,000 URLs / 50 MB, and an oversized or tampered set is rejected', () => {
  const entries = Array.from({ length: 120_000 }, (_, i) => ({ path: `/match/${i + 1}?c=PL` }));
  const big = buildSitemaps([{ name: 'matches', entries }], { origin: ORIGIN, maxUrls: 999_999 });          // caller asks for too much → clamped
  assert.equal(big.files.length, 3);
  for (const f of big.files) { assert.ok(f.count <= GOOGLE_MAX_URLS); assert.ok(Buffer.byteLength(f.xml) < 50 * 1024 * 1024); }
  assert.doesNotThrow(() => validateSitemapSet(big, { origin: ORIGIN, maxUrls: 999_999 }));
  const bytesLimited = buildSitemaps([{ name: 'matches', entries: entries.slice(0, 500) }], { origin: ORIGIN, maxBytes: 8_000 });
  assert.ok(bytesLimited.files.length > 1); for (const f of bytesLimited.files) assert.ok(Buffer.byteLength(f.xml) <= 8_000);
  assert.throws(() => validateSitemapSet({ ...big, files: [{ ...big.files[0], count: 60_000 }, ...big.files.slice(1)] }, { origin: ORIGIN, maxUrls: 999_999 }), /limit/);
  assert.throws(() => validateSitemapSet({ ...big, indexXml: big.indexXml.replace('sitemap-matches-2.xml', 'sitemap-ghost-9.xml') }, { origin: ORIGIN, maxUrls: 999_999 }), /missing file/);
  assert.throws(() => validateSitemapSet(big, { origin: 'http://goal4u.com', maxUrls: 999_999 }), /HTTPS/);
});

test('XML special characters and unicode are escaped once, correctly, and round-trip through a real parser', () => {
  assert.equal(escapeXml(`a&b <c> "d" 'e'`), 'a&amp;b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  assert.equal(escapeXml('x\u0000y\u000Bz'), 'xyz');                                                       // control chars are illegal in XML 1.0
  const set = buildSitemaps([{ name: 'teams', entries: [{ path: '/team/premier-league?teamId=5&x=<1>' }, { path: '/player/Müller & Söhne' }, { path: '/team/la-liga?teamId=6' }] }], { origin: ORIGIN });
  const locs = parseXml(set.files[0].xml).locs;                                                           // parser decodes entities exactly once
  assert.equal(locs[0], `${ORIGIN}/team/premier-league?teamId=5&x=%3C1%3E`);
  assert.equal(locs[1], `${ORIGIN}/player/M%C3%BCller%20&%20S%C3%B6hne`);
  assert.ok(set.files[0].xml.includes('teamId=5&amp;x=%3C1%3E'));                                          // exactly one level of escaping, no &amp;amp;
  assert.ok(!set.files[0].xml.includes('&amp;amp;'));
});

test('only same-origin absolute paths are accepted; duplicates collapse', () => {
  assert.equal(absoluteUrl(ORIGIN, '/matches'), 'https://goal4u.com/matches');
  assert.equal(absoluteUrl(ORIGIN, '//evil.com/x'), null);
  assert.equal(absoluteUrl(ORIGIN, 'https://evil.com/x'), null);
  assert.equal(absoluteUrl(ORIGIN, 'matches'), null);
  const s = buildSitemaps([{ name: 'a', entries: [{ path: '/matches' }, { path: '/matches' }, { path: '//x.com' }] }, { name: 'b', entries: [{ path: '/matches' }] }], { origin: ORIGIN });
  assert.equal(s.totalUrls, 1); assert.deepEqual(s.files.map((f) => f.name), ['sitemap-a-1.xml']);       // 'b' had only a duplicate → no empty file
});

test('origin: configured production origin is HTTPS; robots.txt points at the real sitemap index', () => {
  assert.equal(siteOrigin({}), '');                                       // no domain configured and no request: unknown, NOT a hard-coded domain
  assert.equal(siteOrigin({ APP_URL: 'http://example.org/' }), 'https://example.org');
  assert.equal(siteOrigin({ VITE_APP_URL: 'https://football.example' }), 'https://football.example');
  assert.equal(siteOrigin({ APP_URL: 'http://localhost:3000' }), 'http://localhost:3000');
  const r = robotsTxt('https://goal4u.com');
  assert.match(r, /^User-agent: \*\nAllow: \/\nDisallow: \/api\/\n/); assert.match(r, /Sitemap: https:\/\/goal4u\.com\/sitemap\.xml\n$/);
  assert.doesNotMatch(robotsTxt(''), /Sitemap:/);                          // a sitemap line needs an absolute address
});

test('origin: with no domain configured the REQUEST decides (any domain works); placeholders and bad values are ignored', () => {
  const req = (host: string, proto?: string) => ({ headers: { host, ...(proto ? { 'x-forwarded-proto': proto } : {}) }, protocol: 'http' });
  assert.equal(siteOrigin({}, req('my-site.netlify.app', 'https')), 'https://my-site.netlify.app');
  assert.equal(siteOrigin({}, req('www.newdomain.com')), 'https://www.newdomain.com');          // plain http on a public host is upgraded
  assert.equal(siteOrigin({}, req('localhost:3000')), 'http://localhost:3000');
  assert.equal(siteOrigin({}, new Request('https://shop.example.dev/matches')), 'https://shop.example.dev');
  assert.equal(siteOrigin({}, req('evil.com/<script>')), '');                                    // an odd Host header is never trusted
  assert.equal(siteOrigin({ APP_URL: 'MY_APP_URL' }, req('real.site')), 'https://real.site');    // the unfilled .env.example value
  assert.equal(siteOrigin({ APP_URL: 'https://your-production-domain' }, req('real.site')), 'https://real.site');
  assert.equal(siteOrigin({ APP_URL: 'https://set.example', URL: 'https://x.netlify.app' }, req('real.site')), 'https://set.example'); // configured wins
  assert.equal(siteOrigin({ URL: 'https://x.netlify.app' }, req('real.site')), 'https://x.netlify.app');
  assert.equal(siteOrigin({ APP_URL: 'mydomain.com' }), 'https://mydomain.com');                 // a missing scheme is tolerated
});

test('building the index/sitemaps never modifies or corrupts the source football data', () => {
  const src = fixtureSource(); const before = JSON.stringify(src);
  deepFreeze(src);                                                      // any write would throw in strict mode
  const idx = buildSeoIndex(src); buildSitemaps(groupsFromIndex(idx, DEFAULT_SEO_CONFIG.staticPaths), { origin: ORIGIN });
  assert.equal(JSON.stringify(src), before);
});

test('readiness: an empty / half-loaded cache is "not ready" so a partial sitemap is never served', () => {
  assert.equal(dataIsReady(fixtureSource()), true);
  assert.equal(dataIsReady({ competitions: [], matches: {}, teams: {} }), false);
  const s = fixtureSource(); s.matches = { PL: s.matches.PL }; assert.equal(dataIsReady(s), false);
});

test('a competition without any data is not listed (no empty placeholders)', () => {
  const idx = buildSeoIndex(fixtureSource());
  assert.ok(!idx.competitions.some((c) => c.code === 'ELC' || c.code === 'FL1'));
});
