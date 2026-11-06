/** The stream page's <head> decision for the page handlers: 200 + noindex when it is switched on and the path matches; null otherwise (the page then does not exist: 404). */
import { streamsEnabled, streamsPath } from './config';

export function streamsSeoDecision(pathname: string, env: Record<string, string | undefined> = process.env) {
  if (!streamsEnabled(env)) return null;
  if (pathname.replace(/^\/+|\/+$/g, '').toLowerCase() !== streamsPath(env)) return null;
  return { status: 200 as const, title: 'Stream desk', description: 'Private page.', robots: 'noindex,nofollow' as const, ogType: 'website', image: '', jsonLd: [] as object[] };
}
