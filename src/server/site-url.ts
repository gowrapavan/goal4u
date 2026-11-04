/**
 * The site's public address (https, no trailing slash) for canonicals, sitemaps, robots.txt and social tags.
 *
 * NO domain is hard-coded. Resolution order:
 *   1. APP_URL (or VITE_APP_URL) when you set it,
 *   2. Netlify's URL variable (your site's primary domain, set automatically by Netlify),
 *   3. otherwise the address of the REQUEST itself — so the site works on any domain (a netlify.app address today,
 *      the domain you buy tomorrow) without changing anything.
 */
const PLACEHOLDER = /my_app_url|your-production-domain|your-domain/i;

/** The configured origin, or null when none is set (or it is an unfilled template value). */
export function configuredOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.APP_URL || env.VITE_APP_URL || env.URL || '').trim().replace(/\/+$/, '');
  if (!raw || PLACEHOLDER.test(raw)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    // Production must be HTTPS; plain http is only tolerated for localhost development.
    if (u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) u.protocol = 'https:';
    return u.origin;
  } catch { return null; }
}

/** The origin a request came in on: a Fetch Request (Netlify) or an Express request behind a proxy. '' when it cannot be told safely. */
export function requestOrigin(req: any): string {
  if (!req) return '';
  if (typeof req.url === 'string' && /^https?:\/\//i.test(req.url)) { try { return new URL(req.url).origin; } catch { return ''; } }
  const h = (k: string): string => { const v = typeof req.headers?.get === 'function' ? req.headers.get(k) : req.headers?.[k]; return String(Array.isArray(v) ? v[0] : v ?? '').split(',')[0].trim(); };
  const host = h('x-forwarded-host') || h('host');
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return '';                    // anything odd is not trusted as a canonical address
  let proto = (h('x-forwarded-proto') || String(req.protocol || 'https')).toLowerCase();
  if (proto !== 'http' && proto !== 'https') proto = 'https';
  if (proto === 'http' && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) proto = 'https';
  return `${proto}://${host}`;
}

/** The configured origin, else the request's own, else '' (unknown). */
export function siteOrigin(env: Record<string, string | undefined> = process.env, req?: any): string {
  return configuredOrigin(env) ?? requestOrigin(req);
}

/** robots.txt body. The API is not for crawlers; everything else is allowed; the sitemap index is advertised (it needs an absolute address). */
export const robotsTxt = (origin: string) => `User-agent: *\nAllow: /\nDisallow: /api/\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`;
