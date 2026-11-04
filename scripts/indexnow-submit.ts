/**
 * Tell Bing / Yandex (IndexNow) about what changed. A manual step, run when you want it:
 *
 *   APP_URL=https://your-domain npm run indexnow:submit            matches changed or played in the last 48 h
 *   APP_URL=https://your-domain npm run indexnow:submit -- --static   plus the home, scores, news, watch and competition pages
 *   ... -- --hours 24      a different window        ... -- --dry-run   only print what would be sent
 *
 * It reads dist/_seo/index.json (written by `npm run build:netlify`), refuses to run unless APP_URL is the production address that
 * build used, and first checks that the IndexNow key file is really online at that address. Google does not use IndexNow.
 */
import { readFileSync, existsSync } from 'node:fs';
import { getIndexNowKey, submitToIndexNow } from '../src/server/indexnow';
import { selectIndexNowUrls } from '../src/server/indexnow-select';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const hoursArg = args.indexOf('--hours'); const hours = hoursArg >= 0 ? Number(args[hoursArg + 1]) : 48;
const file = 'dist/_seo/index.json';
if (!existsSync(file)) { console.error(`[indexnow] ${file} not found: run "npm run build:netlify" first.`); process.exit(1); }
const idx = JSON.parse(readFileSync(file, 'utf8'));
const app = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[^\s/]+$/.test(app)) { console.error('[indexnow] set APP_URL to your production address, e.g. APP_URL=https://goal4u.netlify.app'); process.exit(1); }
if (idx.origin && idx.origin.replace(/\/+$/, '') !== app) { console.error(`[indexnow] APP_URL (${app}) is not the address the build used (${idx.origin}).`); process.exit(1); }
if (idx.context && idx.context !== 'production') { console.error(`[indexnow] the build was for "${idx.context}", not production.`); process.exit(1); }
if (!Number.isFinite(hours) || hours <= 0) { console.error('[indexnow] --hours needs a positive number'); process.exit(1); }

const urls = selectIndexNowUrls(idx, app, Date.now(), { hours, includeStatic: flag('--static') });
console.log(`[indexnow] ${urls.length} URL(s) selected (window ${hours} h${flag('--static') ? ', plus static pages' : ''})`);
urls.slice(0, 5).forEach((u) => console.log('   ' + u)); if (urls.length > 5) console.log(`   … and ${urls.length - 5} more`);
if (!urls.length) process.exit(0);
if (flag('--dry-run')) { console.log('[indexnow] dry run: nothing sent'); process.exit(0); }

const key = getIndexNowKey();
try {
  const r = await fetch(`${app}/${key}.txt`, { signal: AbortSignal.timeout(10000) });
  const body = (await r.text()).trim();
  if (!r.ok || body !== key) { console.error(`[indexnow] the key file ${app}/${key}.txt is not online (HTTP ${r.status}). Deploy first, then retry.`); process.exit(1); }
} catch (e: any) { console.error('[indexnow] could not reach the key file:', e?.message); process.exit(1); }
await submitToIndexNow(urls);
console.log('[indexnow] done (see the line above for the search engine\'s answer)');
