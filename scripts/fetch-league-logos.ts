/**
 * Saves the league logos into public/assets/<code>.png so they are served from your own site and never depend on another host.
 *   npm run logos            (needs internet; files that already exist are kept)
 *   npm run logos -- --force (download again and overwrite)
 * Dark-mode versions are yours to add by hand: public/assets/<code>-dark.png (the site uses them automatically).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES: Record<string, string> = { pl: 'PL', pd: 'laliga', sa: 'c111', bl1: 'BL1', fl1: 'FL1', cl: 'CL', elc: 'ELC', wc: 'wm26', ec: 'ec' };
const force = process.argv.includes('--force');
const dir = join(process.cwd(), 'public', 'assets');
mkdirSync(dir, { recursive: true });

let failed = 0;
for (const [code, remote] of Object.entries(FILES)) {
  const out = join(dir, `${code}.png`);
  if (existsSync(out) && !force) { console.log(`keep   ${code}.png (already there)`); continue; }
  try {
    const r = await fetch(`https://crests.football-data.org/${remote}.png`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/png,image/*' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) throw new Error(`status ${r.status} ${type}`);
    writeFileSync(out, Buffer.from(await r.arrayBuffer()));
    console.log(`saved  ${code}.png`);
  } catch (e: any) { failed++; console.error(`FAILED ${code}.png: ${e?.message || e}`); }
}
if (failed) { console.error(`\n${failed} file(s) could not be downloaded. Save those logos by hand as public/assets/<code>.png.`); process.exit(1); }
console.log('\nDone. Rebuild / redeploy to publish the logos.');
