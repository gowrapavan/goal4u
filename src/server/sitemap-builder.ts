/** Pure sitemap generation: URL entries → chunked <urlset> files → <sitemapindex>. No I/O, no globals. */
export const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
/** Google's hard limits are 50,000 URLs and 50 MB uncompressed per file; we stay well inside both by default. */
export const GOOGLE_MAX_URLS = 50_000;
export const GOOGLE_MAX_BYTES = 50 * 1024 * 1024;

export interface UrlEntry { path: string; lastmod?: string }
export interface UrlGroup { name: string; entries: UrlEntry[] }
export interface BuildOptions { origin: string; maxUrls?: number; maxBytes?: number }
export interface SitemapFile { name: string; xml: string; count: number; lastmod?: string }
export interface SitemapSet { files: SitemapFile[]; indexXml: string; totalUrls: number }

// XML 1.0 forbids most control characters; strip them, then escape the five predefined entities.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
export const escapeXml = (s: string) => s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Absolute, properly percent-encoded URL on the configured origin. Returns null for anything that is not a same-origin path. */
export function absoluteUrl(origin: string, path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  try { const base = new URL(origin); const u = new URL(path, base); return u.origin === base.origin ? u.href : null; } catch { return null; }
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const urlXml = (loc: string, lastmod?: string) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>\n` : ''}  </url>\n`;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

export function buildSitemaps(groups: UrlGroup[], opts: BuildOptions): SitemapSet {
  const maxUrls = Math.min(opts.maxUrls ?? 10_000, GOOGLE_MAX_URLS);
  const maxBytes = Math.min(opts.maxBytes ?? 10 * 1024 * 1024, GOOGLE_MAX_BYTES);
  const seen = new Set<string>();                                   // a URL appears once across the whole set
  const files: SitemapFile[] = [];

  for (const g of groups) {
    let chunk: string[] = []; let size = 0; let n = 0; let last: string | undefined;
    const open = HEAD + `<urlset xmlns="${SITEMAP_NS}">\n`, close = '</urlset>\n';
    const flush = () => {
      if (!chunk.length) return;
      n++; files.push({ name: `sitemap-${g.name}-${n}.xml`, xml: open + chunk.join('') + close, count: chunk.length, lastmod: last });
      chunk = []; size = bytes(open) + bytes(close); last = undefined;
    };
    size = bytes(open) + bytes(close);
    for (const e of g.entries) {
      const loc = absoluteUrl(opts.origin, e.path);
      if (!loc || seen.has(loc)) continue;
      const xml = urlXml(loc, e.lastmod); const b = bytes(xml);
      if (chunk.length >= maxUrls || size + b > maxBytes) flush();
      seen.add(loc); chunk.push(xml); size += b;
      if (e.lastmod && (!last || e.lastmod > last)) last = e.lastmod;
    }
    flush();                                                       // never emits an empty file
  }

  const indexXml = HEAD + `<sitemapindex xmlns="${SITEMAP_NS}">\n` + files.map((f) =>
    `  <sitemap>\n    <loc>${escapeXml(absoluteUrl(opts.origin, '/' + f.name)!)}</loc>\n${f.lastmod ? `    <lastmod>${escapeXml(f.lastmod)}</lastmod>\n` : ''}  </sitemap>\n`).join('') + '</sitemapindex>\n';
  return { files, indexXml, totalUrls: files.reduce((n, f) => n + f.count, 0) };
}

/** Throws (so a bad set is never served) if limits, protocol or index/file consistency are violated. */
export function validateSitemapSet(set: SitemapSet, opts: BuildOptions): void {
  const maxUrls = Math.min(opts.maxUrls ?? 10_000, GOOGLE_MAX_URLS), maxBytes = Math.min(opts.maxBytes ?? 10 * 1024 * 1024, GOOGLE_MAX_BYTES);
  if (!/^https:\/\//.test(opts.origin) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(opts.origin)) throw new Error(`Sitemap origin must be HTTPS: ${opts.origin}`);
  const names = new Set(set.files.map((f) => f.name));
  if (names.size !== set.files.length) throw new Error('Duplicate sitemap file names');
  for (const f of set.files) {
    if (f.count < 1) throw new Error(`${f.name} is empty`);
    if (f.count > maxUrls) throw new Error(`${f.name} has ${f.count} URLs (limit ${maxUrls})`);
    if (bytes(f.xml) > maxBytes) throw new Error(`${f.name} is ${bytes(f.xml)} bytes (limit ${maxBytes})`);
  }
  const refs = [...set.indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  if (refs.length !== set.files.length) throw new Error('Index entry count does not match generated files');
  for (const r of refs) if (!names.has(r.slice(r.lastIndexOf('/') + 1))) throw new Error(`Index references a missing file: ${r}`);
}

/** Group the normalised index into sitemap groups. Eligibility lives in seo-data.ts; this only formats. */
export function groupsFromIndex(
  idx: { competitions: { path: string }[]; matches: { path: string; lastmod?: string }[]; teams: { path: string }[] },
  staticPaths: readonly string[],
): UrlGroup[] {
  return [
    { name: 'pages', entries: staticPaths.map((path) => ({ path })) },
    { name: 'competitions', entries: idx.competitions.map((c) => ({ path: c.path })) },
    { name: 'teams', entries: idx.teams.map((t) => ({ path: t.path })) },
    { name: 'matches', entries: idx.matches.map((m) => ({ path: m.path, lastmod: m.lastmod })) },
  ];
}
