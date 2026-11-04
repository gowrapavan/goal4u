/**
 * Local stand-in for Netlify's routing so `npm run seo:verify` can be run before deploying:
 *   1. a real file in dist/ wins (assets, robots.txt, sitemaps, …)       ← preferStatic: true
 *   2. everything else goes to the page function, run by the real Netlify CLI function runtime
 *        npx netlify functions:serve --offline --port 9999     (in another terminal)
 *        npm run build:netlify
 *        npx tsx scripts/local-netlify.ts                        → http://localhost:8888
 * It is an approximation of Netlify's edge, NOT a replacement for testing the deployed site.
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] || 'dist'); const FN = process.env.FUNCTIONS_URL || 'http://localhost:9999'; const PORT = Number(process.env.PORT || 8888);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };

http.createServer(async (req, res) => {
  const u = new URL('http://localhost' + (req.url || '/'));      // concatenate: new URL('//evil.com/', base) would read it as a host
  const file = path.join(DIST, decodeURIComponent(u.pathname));
  if (file.startsWith(DIST) && u.pathname !== '/' && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); return createReadStream(file).pipe(res);
  }
  try {
    const r = await fetch(FN + u.pathname + u.search, { method: req.method, redirect: 'manual' });
    const headers: Record<string, string> = {}; r.headers.forEach((v, k) => { if (k !== 'content-encoding' && k !== 'content-length' && k !== 'transfer-encoding') headers[k] = v; });
    res.writeHead(r.status, headers); res.end(req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer()));
  } catch (e: any) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('functions server not reachable: ' + e.message); }
}).listen(PORT, () => console.log(`local netlify stand-in on http://localhost:${PORT}  (static: ${DIST}, functions: ${FN})`));
