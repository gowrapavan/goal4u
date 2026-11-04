/**
 * Abuse controls for /api/*, shared by the Netlify function (netlify/functions/api.ts) and the Express host (server.ts).
 * Pure functions, no I/O, so every rule is unit-tested.
 *
 *   1. rate limit     a fixed-window counter per client address (memory is bounded)
 *   2. origin check   a browser request from another website is refused: no cross-site fetches, no hot-linked pictures
 *   3. CORS           NO cross-origin access by default (the site calls its own /api). Other origins only when listed in ALLOWED_ORIGINS
 *   4. headers        nosniff, no referrer, not indexable, same-site resource policy
 *
 * Honest limits: this keeps other websites and careless scripts off the API and caps what one address can do. It is not a login — the data is
 * public football data. What protects the data SERVICE is that its token lives only on the server and every URL is checked (data-source.ts).
 * Netlify runs several function instances, each with its own counters, so the effective limit is "per instance"; a CDN hit never reaches it.
 */
import { configuredOrigin } from './site-url';

/* ── 1. rate limit ── */
export interface Limiter { hit(key: string, now?: number): { ok: boolean; remaining: number; retryAfterSec: number } }
export function makeLimiter(o: { windowMs: number; max: number; maxKeys?: number }): Limiter {
  const maxKeys = o.maxKeys ?? 5000;
  let counts = new Map<string, { n: number; reset: number }>();
  return {
    hit(key, now = Date.now()) {
      let e = counts.get(key);
      if (!e || now >= e.reset) {
        if (counts.size >= maxKeys) {                                         // memory guard: drop expired entries first, then start over rather than grow
          for (const [k, v] of counts) if (now >= v.reset) counts.delete(k);
          if (counts.size >= maxKeys) counts = new Map();
        }
        e = { n: 0, reset: now + o.windowMs }; counts.set(key, e);
      }
      e.n++;
      return { ok: e.n <= o.max, remaining: Math.max(0, o.max - e.n), retryAfterSec: Math.max(1, Math.ceil((e.reset - now) / 1000)) };
    },
  };
}

/** The caller's address. Netlify sets x-nf-client-connection-ip itself (a client cannot forge it); x-forwarded-for is only the fallback (first entry). */
export function clientIp(get: (name: string) => string | null | undefined): string {
  const nf = get('x-nf-client-connection-ip')?.trim();
  if (nf) return nf.slice(0, 64);
  const xff = get('x-forwarded-for')?.split(',')[0]?.trim();
  return (xff || 'unknown').slice(0, 64);
}

/** Which bucket a request counts against: pictures are many per page, news calls are expensive (a small daily quota upstream). */
export type Bucket = 'img' | 'news' | 'data';
export const bucketOf = (pathname: string): Bucket => (/^\/api\/(data\/)?(img|ext)(\/|$)/.test(pathname) ? 'img' : /^\/api\/news(\/|$)/.test(pathname) ? 'news' : 'data');
export const LIMITS: Record<Bucket, { windowMs: number; max: number }> = {
  data: { windowMs: 60_000, max: 240 },     // a page load makes 10-15 calls; 240 a minute is a very busy human
  img:  { windowMs: 60_000, max: 900 },     // a squad page shows ~50 headshots
  news: { windowMs: 60_000, max: 40 },
};

/* ── 2. origin check ── */
const hostOf = (v: string | null | undefined): string | null => { if (!v) return null; try { return new URL(v).host.toLowerCase(); } catch { return null; } };

/** The hosts allowed to call the API from a browser: this request's own host, the configured site (APP_URL / Netlify URL), and ALLOWED_ORIGINS (comma list of origins or hosts). */
export function allowedHosts(env: Record<string, string | undefined>, requestHost: string | null | undefined): Set<string> {
  const set = new Set<string>();
  const add = (h: string | null | undefined) => { if (h) set.add(h.toLowerCase()); };
  add(requestHost);
  add(hostOf(configuredOrigin(env as any)));
  for (const raw of String(env.ALLOWED_ORIGINS ?? '').split(',')) { const t = raw.trim(); if (t) add(/^https?:\/\//i.test(t) ? hostOf(t) : t); }
  return set;
}

export interface OriginInput { origin?: string | null; referer?: string | null; secFetchSite?: string | null; secFetchDest?: string | null }
export type Verdict = { ok: true } | { ok: false; why: string };
export function originVerdict(i: OriginInput, allowed: Set<string>): Verdict {
  if (i.origin != null && i.origin !== '') {                                  // browsers send Origin on every cross-origin fetch
    const h = hostOf(i.origin);
    return h && allowed.has(h) ? { ok: true } : { ok: false, why: 'origin not allowed' };
  }
  const site = (i.secFetchSite || '').toLowerCase(), dest = (i.secFetchDest || '').toLowerCase();
  if (site === 'cross-site' && dest !== 'document') return { ok: false, why: 'cross-site request' };     // an <img>/<script>/fetch from another website; opening a link is fine
  if (!site && i.referer && dest !== 'document') {                            // older browsers: judge by Referer
    const h = hostOf(i.referer);
    if (h && !allowed.has(h)) return { ok: false, why: 'foreign referer' };
  }
  return { ok: true };
}

/**
 * Only the site's own pages may read /api: opening an API address in the address bar, a link from anywhere, curl and plain scripts are refused.
 *  - A browser says what it is doing (Sec-Fetch-*): "navigate / document" = somebody opened the address directly → refused;
 *    the site's own fetch / <img> says same-origin → allowed.
 *  - Without those headers (curl, python, old browsers) the request must at least carry an Origin or Referer of this site.
 * Honest limit: headers can be forged by a determined person, so this stops casual copying and hot-linking, it does not make shown data secret.
 * API_ALLOW_DIRECT=1 switches it off (for debugging an address in the browser).
 */
export interface DirectInput extends OriginInput { secFetchMode?: string | null }
export function directVerdict(i: DirectInput, allowed: Set<string>, allowDirect = false): Verdict {
  if (allowDirect) return { ok: true };
  const site = (i.secFetchSite || '').toLowerCase(), dest = (i.secFetchDest || '').toLowerCase(), mode = (i.secFetchMode || '').toLowerCase();
  if (dest === 'document' || dest === 'iframe' || dest === 'frame' || mode === 'navigate') return { ok: false, why: 'opened directly' };
  if (site) return site === 'same-origin' || site === 'same-site' ? { ok: true } : { ok: false, why: 'not from the site' };
  const h = hostOf(String(i.origin || i.referer || ''));
  return h && allowed.has(h) ? { ok: true } : { ok: false, why: 'no browser proof' };
}

/* ── 3. CORS: nothing unless the origin is explicitly listed ── */
export function corsHeaders(origin: string | null | undefined, env: Record<string, string | undefined>): Record<string, string> {
  const listed = new Set(String(env.ALLOWED_ORIGINS ?? '').split(',').map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x)).map((x) => x.replace(/\/+$/, '')));
  const o = (origin || '').replace(/\/+$/, '');
  return o && listed.has(o) ? { 'Access-Control-Allow-Origin': o, Vary: 'Origin' } : {};
}

/* ── 4. headers on every API answer ── */
export const API_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',                                       // JSON endpoints are not pages
  'Cross-Origin-Resource-Policy': 'same-site',
};

/** Headers for HTML pages (the Netlify page function; Express uses helmet). A safe subset of CSP: it forbids framing, plugins and foreign <base>/forms without touching scripts, styles, fonts or YouTube embeds. */
export const PAGE_SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',                      // YouTube embeds need a referrer
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Longest URL (path + query) the API will look at. */
export const MAX_URL_LENGTH = 2000;
