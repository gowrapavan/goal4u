/**
 * Checks that run BEFORE page resolution, shared by the Express host (seo-page.ts) and the Netlify function (page.ts) so the
 * two can never behave differently:
 *   • one URL per page: "/matches/" → 301 "/matches"
 *   • a missing FILE (sitemap, image, script …) is a plain-text 404, never the HTML app shell
 */
export type Preflight = { redirect: string } | { plain404: true } | null;

const FILE_EXT = /\.(xml|txt|json|js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|pdf|zip|gz)$/i;

/**
 * The redirect target is ALWAYS a same-site absolute path. Leading slashes are collapsed: "//evil.com/" must never become
 * `Location: //evil.com` (browsers treat that as another site — an open redirect).
 */
export const safePath = (pathname: string) => '/' + pathname.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');

export function preflight(pathname: string, search: string): Preflight {
  if (/[/\\]{2,}/.test(pathname.slice(0, 3)) || pathname.startsWith('/\\')) return { redirect: safePath(pathname) + search };   // "//x", "/\x"
  if (pathname.length > 1 && /[/\\]+$/.test(pathname)) return { redirect: safePath(pathname) + search };
  if (FILE_EXT.test(pathname)) return { plain404: true };
  return null;
}
