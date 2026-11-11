/**
 * How long Netlify's CDN may keep a successful /api response (Netlify-CDN-Cache-Control), by what it is.
 * s-maxage = served as it is; stale-while-revalidate = after that, the previous answer is still served AT ONCE while a fresh one is fetched behind it,
 * so a visitor never waits for the slow path (function start, data service, live source) unless nobody has asked for a long time.
 */
/**
 * What the CDN copy of an /api answer may be shared between. The address's QUERY STRING must be part of it: /api/data/feed?codes=PD and
 * /api/data/feed?from=…&to=… are different answers on one path. A Netlify-Vary that only names headers left the query out, so one cached
 * answer could be handed out for another address (La Liga showing Serie A games, a club with "no matches played"). `query` = every parameter.
 */
export const NETLIFY_VARY = 'query,header=Sec-Fetch-Dest|Sec-Fetch-Mode|Sec-Fetch-Site';

export function cdnCacheFor(pathname: string): string {
  if (/^\/api\/streams(\/|$)/.test(pathname)) return 'no-store';   // the secret stream API may be key-protected: a shared copy would hand it to anyone
  if (/^\/api\/(data\/)?(img|ext)(\/|$)/.test(pathname)) return 'public, s-maxage=86400, stale-while-revalidate=604800';          // pictures hardly ever change; a CDN hit costs no function call
  if (/^\/api\/news(\/|$)/.test(pathname)) return 'public, s-maxage=900, stale-while-revalidate=21600';   // NewsAPI's free plan has a tiny daily quota
  if (/^\/api\/data\/(feed|match|matches|live)(\/|$)/.test(pathname)) return 'public, s-maxage=15, stale-while-revalidate=300';
  if (/^\/api\/data\/(videos|shorts)(\/|$)/.test(pathname)) return 'public, s-maxage=600, stale-while-revalidate=21600';
  return 'public, s-maxage=120, stale-while-revalidate=1800';
}
