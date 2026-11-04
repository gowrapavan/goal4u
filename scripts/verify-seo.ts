/**
 * Black-box SEO verification of a RUNNING site (production or local):
 *   npm run seo:verify -- https://your-site.netlify.app
 * Exit code 1 if any check fails. It reports what it actually fetched; it cannot tell you whether Google has indexed anything.
 */
import sax from 'sax';

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) { console.error('usage: npm run seo:verify -- https://your-site'); process.exit(2); }
const SAMPLE = Number(process.env.SAMPLE || 24);

type Row = { ok: 'PASS' | 'FAIL' | 'WARN'; what: string; detail?: string };
const rows: Row[] = []; const rec = (ok: Row['ok'], what: string, detail = '') => rows.push({ ok, what, detail });
const check = (cond: boolean, what: string, detail = '') => rec(cond ? 'PASS' : 'FAIL', what, cond ? '' : detail);

const get = (p: string, init: RequestInit = {}) => fetch(p.startsWith('http') ? p : base + p, { redirect: 'manual', ...init });
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseXml(xml: string) {
  const p = sax.parser(true, { xmlns: true }); let root = '', cur = ''; const locs: string[] = []; let err: string | null = null;
  p.onerror = (e) => { err = e.message.split('\n')[0]; p.error = null as any; p.resume(); };
  p.onopentag = (n: any) => { if (!root) root = n.local; cur = n.local; };
  p.ontext = (t) => { if (cur === 'loc') locs.push(t.trim()); };
  p.onclosetag = () => { cur = ''; };
  try { p.write(xml).close(); } catch (e: any) { err = e.message; }
  return { root, locs, err };
}
const ip0 = (xml: string) => { const m = xml.match(/<loc>\s*(https?:\/\/[^/<]+)/); return m ? m[1] : null; };
const one = (html: string, re: RegExp) => html.match(re)?.[1];
const count = (html: string, re: RegExp) => (html.match(re) || []).length;

async function main() {
  const origin = new URL(base).origin;
  let siteOrigin = origin;          // the origin the SITE declares (canonicals/sitemaps); differs from `origin` when testing a preview or localhost
  console.log(`Verifying ${base}\n`);

  // ── robots.txt
  const rb = await get('/robots.txt'); const rbt = await rb.text();
  check(rb.status === 200, 'robots.txt returns 200', `got ${rb.status}`);
  check(/text\/plain/.test(rb.headers.get('content-type') || ''), 'robots.txt is text/plain', rb.headers.get('content-type') || '');
  const sm = rbt.match(/^Sitemap:\s*(\S+)/im)?.[1];
  check(!!sm, 'robots.txt advertises a Sitemap', rbt.slice(0, 120));
  if (/^Disallow:\s*\/\s*$/m.test(rbt)) rec('WARN', 'robots.txt blocks the whole site', 'expected on deploy previews, NOT on production');
  else check(true, 'robots.txt does not block the site');
  if (sm && new URL(sm).origin !== origin) rec('WARN', 'robots.txt Sitemap points at a different origin than the one tested', `${sm} vs ${origin} (fine if you are testing a preview URL)`);

  // ── sitemap index + children
  const ix = await get('/sitemap.xml'); const ixt = await ix.text();
  check(ix.status === 200, 'sitemap.xml returns 200', `got ${ix.status}`);
  check(/xml/.test(ix.headers.get('content-type') || ''), 'sitemap.xml has an XML content-type', ix.headers.get('content-type') || '');
  if (ip0(ixt)) siteOrigin = ip0(ixt)!;
  const ip = parseXml(ixt); check(!ip.err && ip.root === 'sitemapindex', 'sitemap.xml is a valid <sitemapindex>', ip.err || ip.root);
  const all: string[] = []; const seen = new Set<string>(); let dup = 0;
  for (const loc of ip.locs) {
    const r = await get(new URL(loc).pathname); const t = await r.text(); const p = parseXml(t);
    check(r.status === 200 && /xml/.test(r.headers.get('content-type') || ''), `child ${loc.split('/').pop()} → 200 + xml`, `status ${r.status} ${r.headers.get('content-type')}`);
    check(!p.err && p.root === 'urlset', `child ${loc.split('/').pop()} is valid XML <urlset>`, p.err || p.root);
    check(p.locs.length > 0 && p.locs.length <= 50000, `child ${loc.split('/').pop()} has 1–50,000 URLs`, String(p.locs.length));
    check(Buffer.byteLength(t) < 50 * 1024 * 1024, `child ${loc.split('/').pop()} < 50 MB`);
    for (const u of p.locs) { if (seen.has(u)) dup++; seen.add(u); all.push(u); }
  }
  check(all.length > 0, `sitemaps list URLs`, '0 URLs'); check(dup === 0, 'no URL appears twice across the sitemaps', `${dup} duplicates`);
  check(all.every((u) => u.startsWith('https://') || u.startsWith('http://localhost')), 'every sitemap URL is HTTPS');
  console.log(`  ${all.length} sitemap URLs across ${ip.locs.length} child sitemaps\n`);

  // ── representative pages: every competition, some teams, matches spread across the list
  const by = (re: RegExp) => all.filter((u) => re.test(u));
  const pick = (a: string[], n: number) => a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor((i * a.length) / n)]);
  const sample = [...by(/\/competition\//), ...pick(by(/\/team\//), 5), ...pick(by(/\/match\//), Math.max(6, SAMPLE - 12)), ...by(/^https?:\/\/[^/]+\/(matches|news|watch)?$/)];
  const canon = new Map<string, string>();
  for (const url of sample) {
    const u = new URL(url); const path = u.pathname + u.search;
    const r = await get(path); const h = await r.text(); const tag = `${path}`;
    if (r.status !== 200) { rec('FAIL', `${tag} returns 200`, `got ${r.status}`); continue; }
    const c = one(h, /<link rel="canonical" href="([^"]+)"/);
    check(!!c && unesc(c) === url, `${tag} canonical equals its sitemap URL`, `canonical=${c} sitemap=${url}`);
    check(count(h, /<title>/g) === 1 && (one(h, /<title>([^<]{10,})<\/title>/) || '') !== '', `${tag} has exactly one non-empty <title>`, one(h, /<title>([^<]*)<\/title>/) || 'none');
    check(count(h, /<meta name="description"/g) === 1 && (one(h, /name="description" content="([^"]{30,})"/) || '') !== '', `${tag} has one useful meta description`);
    check(/name="robots" content="index,follow"/.test(h) && !/noindex/.test(h.split('</head>')[0].replace(/<script[\s\S]*?<\/script>/g, '')), `${tag} is indexable (no noindex)`);
    check(!!one(h, /property="og:title" content="([^"]+)"/) && !!one(h, /property="og:url" content="([^"]+)"/), `${tag} has Open Graph tags`);
    check(count(h, /<h1[ >]/g) >= 1, `${tag} has an <h1> in the first HTML`);
    check(count(h, /<a href="\//g) >= 2, `${tag} has crawlable internal links in the first HTML`);
    let ldOk = true, ldTypes: string[] = []; for (const m of h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); ldTypes.push(j['@type']); } catch { ldOk = false; } }
    check(ldOk && ldTypes.length > 0, `${tag} JSON-LD parses (${ldTypes.join(', ')})`);
    const ct = r.headers.get('content-type') || ''; check(/text\/html/.test(ct), `${tag} is text/html`, ct);
    if (c) { if (canon.has(c) && canon.get(c) !== url) rec('FAIL', `${tag} canonical shared with another URL`, c); canon.set(c, url); }
  }
  check(true, `checked ${sample.length} representative pages`);

  // ── status codes & redirects
  const expect = async (path: string, status: number, loc?: string, note = '') => {
    const r = await get(path); const okStatus = r.status === status; const okLoc = !loc || (r.headers.get('location') || '').replace(origin, '') === loc;
    check(okStatus && okLoc, `${path} → ${status}${loc ? ` → ${loc}` : ''}${note}`, `got ${r.status}${r.headers.get('location') ? ' → ' + r.headers.get('location') : ''}`);
    return r;
  };
  await expect('/live', 301, '/matches?filter=live'); await expect('/media', 301, '/watch'); await expect('/h2h/a-vs-b', 301, '/matches');
  await expect('/top-scorers/la-liga', 301, '/competition/la-liga?tab=stats'); await expect('/matches/', 301, '/matches', ' (trailing slash)');
  await expect('/this/page/does/not/exist', 404); await expect('/competition/no-such-league', 404); await expect('/team/la-liga', 404, undefined, ' (no teamId)');
  const um = await get('/match/99999999?c=PL'); const umt = await um.text();
  if (um.status === 404) check(/name="robots" content="noindex/.test(umt), '/match/99999999?c=PL → 404 + noindex');
  else rec('FAIL', 'unknown match id must not be a successful page', `got ${um.status}`);
  const sx = await get('/sitemap-nope-1.xml'); check(sx.status === 404 && !/html/.test(sx.headers.get('content-type') || ''), 'unknown sitemap → plain 404 (never the HTML app shell)', `got ${sx.status} ${sx.headers.get('content-type')}`);

  // ── duplicate-URL hygiene: the same page under variants must canonicalise to ONE url
  const a = await get('/standings/premier-league'); const at = await a.text();
  check(a.status === 200 && unesc(one(at, /<link rel="canonical" href="([^"]+)"/) || '') === `${siteOrigin}/competition/premier-league`, '/standings/premier-league canonicalises to /competition/premier-league');
  const tm = by(/\/team\//)[0]; if (tm) { const t = new URL(tm); const v = await get(t.pathname + t.search + '&tab=squad&utm_source=x'); const vt = await v.text(); check(unesc(one(vt, /<link rel="canonical" href="([^"]+)"/) || '') === tm, 'tracking/tab parameters do not create a new canonical (team page)'); }

  // ── report
  const w = Math.max(...rows.map((r) => r.what.length));
  for (const r of rows.filter((x) => x.ok !== 'PASS')) console.log(`${r.ok === 'FAIL' ? '✗ FAIL' : '! WARN'}  ${r.what}${r.detail ? `\n         ${r.detail}` : ''}`);
  const pass = rows.filter((r) => r.ok === 'PASS').length, fail = rows.filter((r) => r.ok === 'FAIL').length, warn = rows.filter((r) => r.ok === 'WARN').length;
  console.log(`\n${pass} passed, ${fail} failed, ${warn} warnings  (${rows.length} checks)`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('verification crashed:', e); process.exit(2); });
