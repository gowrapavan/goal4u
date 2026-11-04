import http from 'node:http';
import { createReadStream, existsSync, statSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
process.env.SEO_ASSET_DIR = '/tmp/site';
const { writeSeoFiles } = await import('/home/claude/app/src/server/seo-build');
const { fixtureSource } = await import('/home/claude/app/src/server/seo-fixtures');
const ORIGIN = process.env.ORIGIN ?? 'https://goal4u.netlify.app';
const r = writeSeoFiles(fixtureSource(), { outDir: '/tmp/site', origin: ORIGIN, context: 'production' });
copyFileSync('/tmp/site/index.html', '/tmp/site/app-shell.html'); rmSync('/tmp/site/index.html');
console.log('files', r.files.length, 'urls', r.totalUrls);
const page = (await import('/home/claude/app/netlify/functions/page')).default;
const T: any = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.webmanifest':'application/manifest+json'};
http.createServer(async (req, res) => {
  const u = new URL('http://localhost' + req.url);
  const f = path.join('/tmp/site', decodeURIComponent(u.pathname));
  if (u.pathname !== '/' && f.startsWith('/tmp/site') && existsSync(f) && statSync(f).isFile() && !/app-shell/.test(f)) { res.writeHead(200, {'Content-Type': T[path.extname(f)]||'application/octet-stream'}); return createReadStream(f).pipe(res); }
  const resp = await page(new Request('http://localhost:8888' + req.url, { method: req.method }));
  const h: any = {}; resp.headers.forEach((v,k)=>h[k]=v); res.writeHead(resp.status, h); res.end(Buffer.from(await resp.arrayBuffer()));
}).listen(8888, () => console.log('up'));
