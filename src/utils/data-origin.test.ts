import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { imageUrl } from './data-origin.ts';

test('imageUrl: a same-origin proxy URL — no data-service address, no token', () => {
  assert.equal(imageUrl('/headshot/10000.png'), '/api/data/img/headshot/10000.png');
  assert.equal(imageUrl('headshot/10000.png'), '/api/data/img/headshot/10000.png');
  assert.equal(imageUrl('//headshot/10000.png'), '/api/data/img/headshot/10000.png');
});
test('imageUrl: empty path → empty; a cache-busting query is kept; odd characters are percent-encoded per segment', () => {
  assert.equal(imageUrl(''), ''); assert.equal(imageUrl('   '), '');
  assert.equal(imageUrl('/x.png?v=2'), '/api/data/img/x.png?v=2');
  assert.equal(imageUrl('/trophies/Champions League.png'), '/api/data/img/trophies/Champions%20League.png');
});
test('the browser module reads no environment, has no token and no GitHub / data-service address', () => {
  const src = readFileSync(new URL('./data-origin.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/github|onrender|process\.env|import\.meta|token/i.test(src));
});
test('no browser code imports the server-only token module or reads the token variable', async () => {
  const { readdirSync } = await import('node:fs'); const { fileURLToPath } = await import('node:url'); const path = await import('node:path');
  const hits: string[] = [];
  for (const d of ['components', 'pages', 'lib', 'utils', 'hooks', 'services']) {
    const root = fileURLToPath(new URL(`../${d}/`, import.meta.url));
    for (const f of readdirSync(root, { recursive: true }) as string[]) {
      if (!/\.(tsx?|css)$/.test(f) || /\.test\./.test(f)) continue;
      if (/data-token|GOAL4U_TOKEN/.test(readFileSync(path.join(root, f), 'utf8'))) hits.push(`${d}/${f}`);
    }
  }
  assert.deepEqual(hits, []);
});
