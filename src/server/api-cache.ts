/**
 * How long Netlify's CDN may keep a successful /api response (Netlify-CDN-Cache-Control), by what it is.
 * s-maxage = served as it is; stale-while-revalidate = after that, the previous answer is still served AT ONCE while a fresh one is fetched behind it,
 * so a visitor never waits for the slow path (function start, data service, live source) unless nobody has asked for a long time.
 */
export function cdnCacheFor(pathname: string): string {
  if (/^\/api\/(data\/)?(img|ext)(\/|$)/.test(pathname)) return 'public, s-maxage=86400, stale-while-revalidate=604800';          // pictures hardly ever change; a CDN hit costs no function call
  if (/^\/api\/news(\/|$)/.test(pathname)) return 'public, s-maxage=900, stale-while-revalidate=21600';   // NewsAPI's free plan has a tiny daily quota
  if (/^\/api\/data\/(feed|match|matches|live)(\/|$)/.test(pathname)) return 'public, s-maxage=15, stale-while-revalidate=300';
  if (/^\/api\/data\/(videos|shorts)(\/|$)/.test(pathname)) return 'public, s-maxage=600, stale-while-revalidate=21600';
  return 'public, s-maxage=120, stale-while-revalidate=1800';
}
