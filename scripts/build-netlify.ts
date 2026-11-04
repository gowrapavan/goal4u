/**
 * Netlify build: Vite app → dist/, then SEO files from the live GitHub data.
 *   npm run build:netlify          (what netlify.toml runs)
 * Env: APP_URL (production origin; Netlify's URL is the fallback), GOAL4U_DATA_URL (gowra-api's /goal4u-data address),
 *      CONTEXT (set by Netlify). Fails the build when data is incomplete.
 */
import { DATA_ORIGIN, USING_GITHUB_DIRECT, dataAuthFailures } from '../src/server/data-source';
import { DATA_TOKEN } from '../src/server/data-token';
import { findLeaks } from '../src/server/bundle-scan';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { getIndexNowKey } from '../src/server/indexnow';
import { loadSeoSourceRemote } from '../src/server/remote-source';
import { writeSeoFiles } from '../src/server/seo-build';
import { configuredOrigin } from '../src/server/site-url';

// Read .env like the dev server does (Node 20.12+/21.7+); values already in the environment (Netlify's UI) win.
try { (process as any).loadEnvFile?.('.env'); } catch { /* no .env file: fine */ }
const origin = configuredOrigin(process.env) ?? '';
console.log(origin ? `[seo] site origin: ${origin} (from APP_URL / Netlify URL)` : '[seo] no APP_URL set: every page, canonical link and sitemap will use the address of the domain it is served on (works on any domain)');
const vite = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_APP_URL: origin }, shell: process.platform === 'win32' });
if (vite.status !== 0) { console.error('[seo] vite build failed'); process.exit(vite.status ?? 1); }

// The browser bundle must never carry the data-service token or the data-service address (images go through /api/data/img; the server adds the token).
{
  const files: { name: string; text: string }[] = [];
  const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = `${dir}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (/\.(js|css|html|json|webmanifest|map)$/i.test(f)) files.push({ name: p, text: readFileSync(p, 'utf8') }); } };
  walk('dist');
  const host = USING_GITHUB_DIRECT ? '' : DATA_ORIGIN;
  const leaks = findLeaks(files, [{ label: 'the data-service token', value: DATA_TOKEN }, { label: 'the data-service address', value: host }]);
  if (leaks.length) { for (const l of leaks) console.error(`[security] ${l.label} is inside the browser bundle: ${l.file}`); console.error('[security] build stopped: a secret would be public. Remove any VITE_ prefix from the token variable (use GOAL4U_TOKEN) and make sure no browser code reads it.'); process.exit(1); }
  console.log(`[security] browser bundle checked (${files.length} files): no token, no data-service address`);
}
console.log(`[seo] football data is read from: ${DATA_ORIGIN}${USING_GITHUB_DIRECT ? '  (GitHub directly: GOAL4U_DATA_URL is not set)' : '  (your gowra-api mirror)'}`);
const report = await loadSeoSourceRemote();
console.log(`[seo] season ${report.season}; competitions via ${report.compsSource}`);
console.table(report.fetched);
const totalMatches = Object.values(report.fetched).reduce((n: number, x: any) => n + (x?.matches ?? 0), 0);
if (dataAuthFailures() > 0) console.error(`\n[seo] the data service answered 401 ${dataAuthFailures()} time(s): GOAL4U_TOKEN is missing or wrong (Netlify → Environment variables, or .env locally).`);
if (totalMatches === 0) {
  console.error(`\n[seo] NO football data could be read from ${DATA_ORIGIN}. Check, in this order:
  1. open ${DATA_ORIGIN}/data/${report.season}/PL/matches in a browser: it must show JSON (not an error page, not "localhost refused");
  2. GOAL4U_DATA_URL (your .env, or Netlify → Environment variables, or a value set in this terminal session) must be your PUBLIC gowra-api address ending in /goal4u-data;
  3. if the service is on Render's free plan, open its /health first so it wakes up, then run the build again.\n`);
}
// /api/* is served by netlify/functions/api.ts, so no proxy rule (a leftover API_ORIGIN setting is ignored on purpose).
const res = writeSeoFiles(report.source, { outDir: 'dist', origin, context: process.env.CONTEXT });

// IndexNow ownership proof: Express serves /<key>.txt itself; on Netlify it has to be a real file.
writeFileSync(`dist/${getIndexNowKey()}.txt`, getIndexNowKey());

// The app shell must not be a static file at "/": the page function has to handle "/" (and every other page) so each response gets its own <head>.
if (!existsSync('dist/index.html')) throw new Error('dist/index.html missing after vite build');
copyFileSync('dist/index.html', 'dist/app-shell.html'); rmSync('dist/index.html');

console.log(`[seo] ${res.files.length} files, ${res.totalUrls} sitemap URLs (matches ${res.index.matches.length}, teams ${res.index.teams.length}, competitions ${res.index.competitions.length})`);
console.log('[seo] skipped records:', res.index.skipped);
for (const w of res.warnings) console.warn(`[seo] WARNING: ${w}`);
