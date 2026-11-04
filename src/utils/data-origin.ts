/**
 * Image URLs for the BROWSER.
 *
 * The browser never talks to the data service and never holds its token. Every picture that lives on the data service (player headshots,
 * trophies, fallbacks) is requested from this site's own server instead:
 *
 *     imageUrl('/headshot/10000.png')  →  /api/data/img/headshot/10000.png
 *
 * and the server (data-api.ts → GET /img/*) checks the path, adds the access token and streams the picture back with a long cache lifetime.
 * So: no data-service address, no token and no GitHub address in the bundle — this module imports nothing and reads no environment.
 */
const clean = (path: string): string => String(path ?? '').trim().replace(/^\/+/, '');

/** '' for an empty path; otherwise the same-origin proxy URL. A picture that does not exist answers 404 and the <img>'s onError fallback takes over. */
export function imageUrl(path: string): string {
  const p = clean(path);
  if (!p) return '';
  const q = p.indexOf('?');                                   // a query ("?v=2") is kept for cache-busting, never forwarded upstream
  const file = q === -1 ? p : p.slice(0, q), query = q === -1 ? '' : p.slice(q);
  return `/api/data/img/${file.split('/').map(encodeURIComponent).join('/')}${query}`;
}
