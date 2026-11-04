/**
 * Netlify Function (v2) that serves EVERY page of the site except real static files (assets, images, robots.txt, sitemaps).
 * It does what server.ts + seo-page.ts do on the Express host: per-page <head>, crawlable body text, canonical, JSON-LD and
 * the right HTTP status (200 / 301 / 404) — but from the compact index the build wrote, so it needs no Express server and
 * no warm in-memory cache.
 *
 * Routing (config below): path "/*" with preferStatic → files in dist/ win; dist/index.html is renamed app-shell.html at build
 * time so "/" is handled here too.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveSeo, injectHead, verificationFromEnv } from '../../src/server/seo-meta';
import { hydrateIndex, SeoIndex, DEFAULT_SEO_CONFIG } from '../../src/server/seo-data';
import { requestOrigin, robotsTxt } from '../../src/server/site-url';
import { llmsTxt } from '../../src/server/llms';
import { buildSitemaps, groupsFromIndex, validateSitemapSet, type SitemapSet } from '../../src/server/sitemap-builder';
import { lookupMatchRemote, lookupPlayerRemote } from '../../src/server/remote-source';
import { preflight } from '../../src/server/seo-preflight';
import { PAGE_SECURITY_HEADERS } from '../../src/server/api-guard';

interface Assets { shell: string; index: SeoIndex; origin: string; indexable: boolean; builtAt: string }
let loaded: Promise<Assets> | null = null;

/** The shell + index are packaged with the function (included_files). If the file system layout differs, fall back to this deployment's own CDN. */
async function readAsset(rel: string, reqUrl: string): Promise<string> {
  const roots = [process.env.SEO_ASSET_DIR, path.join(process.cwd(), 'dist'), process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, 'dist'), '/var/task/dist'].filter(Boolean) as string[];
  for (const r of roots) { try { return readFileSync(path.join(r, rel), 'utf8'); } catch { /* try next */ } }
  const res = await fetch(new URL('/' + rel, reqUrl));
  if (!res.ok) throw new Error(`cannot read ${rel} (${res.status})`);
  return res.text();
}
function load(reqUrl: string): Promise<Assets> {
  if (!loaded) {
    loaded = (async () => {
      const [shell, raw] = await Promise.all([readAsset('app-shell.html', reqUrl), readAsset('_seo/index.json', reqUrl)]);
      const j = JSON.parse(raw);
      return { shell, index: hydrateIndex(j), origin: String(j.origin || '').replace(/\/+$/, ''), indexable: !j.context || j.context === 'production', builtAt: j.builtAt || '' };
    })().catch((e) => { loaded = null; throw e; });       // a failed load is retried on the next request, never cached
  }
  return loaded;
}
const sitemapSets = new Map<string, SitemapSet>();
export const _resetForTests = () => { loaded = null; sitemapSets.clear(); };

/** With no configured domain the build writes no robots.txt / sitemaps: they are made here for the domain that is asking. */
function seoFile(pathname: string, origin: string, a: Assets): Response | null {
  const text = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=900' };
  if (pathname === '/robots.txt') return new Response(a.indexable ? robotsTxt(origin) : 'User-agent: *\nDisallow: /\n', { status: 200, headers: text });
  if (pathname === '/llms.txt') return new Response(a.indexable ? llmsTxt(origin, a.index.competitions) : '', { status: a.indexable ? 200 : 404, headers: text });
  if (!/^\/sitemap[^/]*\.xml$/i.test(pathname)) return null;
  let set = sitemapSets.get(origin);
  if (!set) {
    const opts = { origin };
    set = buildSitemaps(groupsFromIndex(a.index, DEFAULT_SEO_CONFIG.staticPaths), opts); validateSitemapSet(set, opts);
    if (sitemapSets.size >= 8) sitemapSets.delete(sitemapSets.keys().next().value as string);
    sitemapSets.set(origin, set);
  }
  const xml = pathname === '/sitemap.xml' ? set.indexXml : set.files.find((f) => '/' + f.name === pathname)?.xml;
  if (!xml) return new Response('Sitemap not found', { status: 404, headers: text });
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}

const html = { 'Content-Type': 'text/html; charset=utf-8', ...PAGE_SECURITY_HEADERS };

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });

  const isSeoFile = url.pathname === '/robots.txt' || url.pathname === '/llms.txt' || /^\/sitemap[^/]*\.xml$/i.test(url.pathname);
  const pf = isSeoFile ? null : preflight(url.pathname, url.search);
  if (pf && 'redirect' in pf) return new Response(null, { status: 301, headers: { Location: pf.redirect, 'Cache-Control': 'public, max-age=3600' } });
  if (pf && 'plain404' in pf) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });

  let a: Assets;
  try { a = await load(req.url); } catch (e: any) {
    console.error('[page] assets unavailable:', e?.message);
    return new Response('Service temporarily unavailable', { status: 503, headers: { 'Retry-After': '300', 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  // The address of THIS request unless a domain is configured, so canonicals and sitemaps are right on any domain.
  const origin = a.origin || requestOrigin(req) || url.origin;
  if (isSeoFile && !a.origin) { const f = seoFile(url.pathname, origin, a); if (f) return req.method === 'HEAD' ? new Response(null, { status: f.status, headers: f.headers }) : f; }
  if (isSeoFile) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  const d = await resolveSeo({ path: url.pathname, search: url.search }, {
    origin, snapshot: { index: a.index, ready: true },
    lookupMatch: (id, code, season) => lookupMatchRemote(id, code, season),
    lookupPlayer: (id) => lookupPlayerRemote(id),
  });
  if (d.status === 301 && d.redirectTo) return new Response(null, { status: 301, headers: { Location: d.redirectTo, 'Cache-Control': 'public, max-age=3600' } });

  const ok = d.status === 200;
  const headers: Record<string, string> = {
    ...html,
    // browsers always revalidate; Netlify's CDN may serve it for 10 min and refresh in the background for a day
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Netlify-CDN-Cache-Control': ok ? 'public, max-age=600, stale-while-revalidate=86400' : 'public, max-age=60',
    // team and match pages are told apart by their query string
    'Netlify-Vary': 'query=teamId|c',
  };
  if (!a.indexable) headers['X-Robots-Tag'] = 'noindex, nofollow';          // deploy previews / branch deploys
  return new Response(req.method === 'HEAD' ? null : injectHead(a.shell, d, verificationFromEnv(process.env)), { status: d.status, headers });
};

export const config = { path: '/*', excludedPath: ['/api', '/api/*'], preferStatic: true };
