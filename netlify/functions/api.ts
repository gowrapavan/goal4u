/**
 * Netlify Function (v2) that IS the Goal4U backend: /api/data/* (feed, matches, players, related players, live overlay, …) and
 * /api/news/*. It runs the same Express routers as server.ts, so there is nothing else to host: gowra-api (Render) only serves the data
 * files at /goal4u-data, and this function reads them from there (GOAL4U_DATA_URL) and does all the computing.
 *
 * How: the first request in a warm container starts the Express app on a private loopback port; every request is forwarded to it.
 * Warm containers keep the routers' in-memory caches (so repeat calls are cheap); a cold container simply rebuilds them.
 *
 * Guarded in front of it (src/server/api-guard.ts): URL length cap, GET/HEAD only, other websites refused (origin / cross-site check), a per-address rate limit,
 * no CORS unless ALLOWED_ORIGINS lists the origin, and security headers on every answer.
 *
 * Caching in front of it: Netlify's CDN keeps successful GET responses for a short time and serves a stale copy while it refreshes
 * (Netlify-CDN-Cache-Control). That is what keeps pages fast when the function or the Render service is waking up.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import newsRouter from '../../src/server/news-api';
import dataRouter from '../../src/server/data-api';
import { cdnCacheFor } from '../../src/server/api-cache';
import { allowedHosts, originVerdict, directVerdict, makeLimiter, LIMITS, bucketOf, clientIp, corsHeaders, API_SECURITY_HEADERS, MAX_URL_LENGTH } from '../../src/server/api-guard';

let booted: Promise<number> | null = null;
function boot(): Promise<number> {
  if (!booted) {
    booted = new Promise<number>((resolve, reject) => {
      const app = express();
      app.set('query parser', 'simple');          // plain key=value only (see server.ts)
      app.set('trust proxy', 1);
      app.disable('x-powered-by');
      app.use('/api/news', newsRouter);
      app.use('/api/data', dataRouter);
      // Unknown API paths are a JSON 404, never an HTML page.
      app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });
      app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error('api error:', err);
        res.status(err?.status || 500).json({ error: 'Internal Server Error' });
      });
      const server = http.createServer(app);
      server.once('error', (e) => { booted = null; reject(e); });
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
      server.unref();
    });
  }
  return booted;
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'upgrade']);
const limiters = { data: makeLimiter(LIMITS.data), img: makeLimiter(LIMITS.img), news: makeLimiter(LIMITS.news) };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...API_SECURITY_HEADERS, ...extra } });

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Method not allowed' }, { Allow: 'GET, HEAD' });
  const url = new URL(req.url);
  if (url.pathname.length + url.search.length > MAX_URL_LENGTH) return json(414, { error: 'URL too long' });

  // other websites: no cross-site fetches, no hot-linked pictures
  const h = (n: string) => req.headers.get(n);
  const verdict = originVerdict({ origin: h('origin'), referer: h('referer'), secFetchSite: h('sec-fetch-site'), secFetchDest: h('sec-fetch-dest') }, allowedHosts(process.env, h('host') || url.host));
  if (!verdict.ok) return json(403, { error: 'Forbidden' });
  // only the site's own pages: a pasted address, a link, curl or a plain script gets 403 (API_ALLOW_DIRECT=1 turns this off for debugging)
  const direct = directVerdict({ origin: h('origin'), referer: h('referer'), secFetchSite: h('sec-fetch-site'), secFetchDest: h('sec-fetch-dest'), secFetchMode: h('sec-fetch-mode') }, allowedHosts(process.env, h('host') || url.host), process.env.API_ALLOW_DIRECT === '1');
  if (!direct.ok) return json(403, { error: 'Forbidden' });

  // one address cannot flood the data service: a per-minute budget per kind of call
  const rl = limiters[bucketOf(url.pathname)].hit(clientIp(h));
  if (!rl.ok) return json(429, { error: 'Too many requests, please slow down' }, { 'Retry-After': String(rl.retryAfterSec) });

  let port: number;
  try { port = await boot(); } catch (e) { console.error('api boot failed:', e); return json(500, { error: 'Internal Server Error' }); }
  let upstream: Response;
  try {
    upstream = await fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
      method: req.method,
      headers: { accept: req.headers.get('accept') || '*/*', 'x-forwarded-proto': 'https', 'x-forwarded-for': req.headers.get('x-nf-client-connection-ip') || '' },
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) { console.error('api upstream failed:', e); return json(504, { error: 'The data service is taking too long, please retry' }); }
  const headers = new Headers();
  upstream.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v); });
  for (const [k, v] of Object.entries({ ...API_SECURITY_HEADERS, ...corsHeaders(h('origin'), process.env) })) headers.set(k, v);
  headers.delete('set-cookie');
  if (req.method === 'GET' && upstream.status === 200) headers.set('Netlify-CDN-Cache-Control', cdnCacheFor(url.pathname));
  return new Response(req.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
};

export const config = { path: ['/api', '/api/*'] };
