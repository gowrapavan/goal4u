/**
 * Build-time SEO output for static hosting (Netlify): robots.txt, sitemap index + children, the compact data index the
 * page function reads, and the /api proxy rule. Pure apart from writing into `outDir`; throws (so the deploy FAILS and the
 * previous good deploy stays live) when the data is incomplete — it never publishes a partial sitemap.
 */
import { llmsTxt } from './llms';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildSeoIndex, dataIsReady, DEFAULT_SEO_CONFIG, serializeIndex, SeoConfig, SeoIndex, SeoSource } from './seo-data';
import { buildSitemaps, groupsFromIndex, validateSitemapSet } from './sitemap-builder';
import { robotsTxt } from './site-url';

export interface BuildSeoOptions {
  outDir: string; origin: string;
  /** Netlify CONTEXT (production | deploy-preview | branch-deploy). Anything but production is kept out of search engines. */
  context?: string;
  /** Where the Express API is hosted. Written as a Netlify proxy rule so the app's /api/* calls reach it. */
  apiOrigin?: string;
  cfg?: SeoConfig; maxUrls?: number; builtAt?: string;
}
export interface BuildSeoResult { files: string[]; totalUrls: number; index: SeoIndex; warnings: string[]; indexable: boolean }

export function writeSeoFiles(source: SeoSource, o: BuildSeoOptions): BuildSeoResult {
  const cfg = o.cfg ?? DEFAULT_SEO_CONFIG; const warnings: string[] = [];
  if (!dataIsReady(source)) throw new Error('SEO build aborted: football data is incomplete (competitions missing, or fewer than half of the competitions returned matches). Not publishing a partial sitemap.');
  const index = buildSeoIndex(source, cfg);
  if (!index.matches.length || !index.competitions.length || !index.teams.length) throw new Error(`SEO build aborted: nothing indexable (matches=${index.matches.length}, teams=${index.teams.length}, competitions=${index.competitions.length}).`);
  const indexable = !o.context || o.context === 'production';

  // Without a configured origin the sitemaps are not written here: the page function generates robots.txt and the sitemaps per request,
  // each with the address of the domain it was asked on. They are still built once now so a broken set fails the deploy.
  const auto = !o.origin;
  const opts = { origin: o.origin || 'https://placeholder.invalid', maxUrls: o.maxUrls };
  const set = buildSitemaps(groupsFromIndex(index, cfg.staticPaths), opts);
  validateSitemapSet(set, opts);

  const files: string[] = []; const put = (rel: string, body: string) => { const f = path.join(o.outDir, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, body, 'utf8'); files.push(rel); };
  if (!auto) {
    put('robots.txt', indexable ? robotsTxt(o.origin) : 'User-agent: *\nDisallow: /\n');      // previews / branch deploys must never be indexed
    put('sitemap.xml', set.indexXml);
    if (indexable) put('llms.txt', llmsTxt(o.origin, index.competitions));      // optional AI-tool guide; never for previews
    for (const f of set.files) put(f.name, f.xml);
  } else warnings.push('No APP_URL / Netlify URL: robots.txt and the sitemaps are generated per request with the address of the domain they are asked on (works on any domain).');
  put('_seo/index.json', JSON.stringify({ ...serializeIndex(index, o.builtAt), origin: o.origin || '', context: o.context || 'production' }));

  if (o.apiOrigin) {
    if (!/^https:\/\/[^\s/]+$/.test(o.apiOrigin.replace(/\/+$/, ''))) throw new Error(`API_ORIGIN must be an https origin, got "${o.apiOrigin}"`);
    put('_redirects', `/api/*  ${o.apiOrigin.replace(/\/+$/, '')}/api/:splat  200\n`);
  }   // no API_ORIGIN: /api/* is served by netlify/functions/api.ts
  if (!indexable) warnings.push(`Context "${o.context}" is not production: robots.txt blocks all crawling.`);
  return { files, totalUrls: set.totalUrls, index, warnings, indexable };
}
