import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'smol-toml';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const toml: any = parse(read('netlify.toml')); const pkg = JSON.parse(read('package.json'));

test('netlify.toml: builds with the SEO-aware script, publishes dist, runs on a current Node', () => {
  assert.equal(toml.build.command, 'npm run build:netlify'); assert.equal(toml.build.publish, 'dist');
  assert.ok(Number(toml.build.environment.NODE_VERSION) >= 20);
  assert.ok(pkg.scripts['build:netlify'] && existsSync(new URL('scripts/build-netlify.ts', root)));
  assert.ok(pkg.scripts['seo:verify'] && existsSync(new URL('scripts/verify-seo.ts', root)));
  assert.ok(pkg.scripts.build.includes('vite build'));                                         // the Express build still works
});

test('functions: directory exists, both functions are there, esbuild bundler, and the files the page function reads are packaged', () => {
  assert.equal(toml.functions.directory, 'netlify/functions'); assert.equal(toml.functions.node_bundler, 'esbuild');
  for (const f of ['page.ts', 'rebuild.ts', 'api.ts']) assert.ok(existsSync(new URL(`netlify/functions/${f}`, root)), f);
  const included: string[] = toml.functions.page.included_files; const fn = read('netlify/functions/page.ts');
  for (const rel of ['app-shell.html', '_seo/index.json']) {
    assert.ok(included.includes(`dist/${rel}`), `${rel} must be in included_files`);
    assert.ok(fn.includes(`readAsset('${rel}'`), `page.ts must read ${rel}`);
    assert.ok(read('scripts/build-netlify.ts').includes(rel.split('/')[0]) || read('src/server/seo-build.ts').includes(rel), `${rel} must be produced by the build`);
  }
});

test('no [[redirects]] rule can shadow the function; the SPA fallback is the function itself (preferStatic)', () => {
  assert.equal(toml.redirects, undefined);
  assert.match(read('netlify/functions/page.ts'), /export const config = \{ path: '\/\*', excludedPath: \['\/api', '\/api\/\*'\], preferStatic: true \}/);
  assert.match(read('scripts/build-netlify.ts'), /rmSync\('dist\/index\.html'\)/);                // so "/" is not a static file
});

test('headers: immutable caching for fingerprinted assets, correct XML/text types and short cache for sitemaps/robots, /_seo not indexable', () => {
  const h: any[] = toml.headers; const f = (p: string) => h.find((x) => x.for === p)?.values;
  assert.match(f('/assets/*')['Cache-Control'], /immutable/);
  assert.match(f('/sitemap*.xml')['Content-Type'], /^application\/xml/); assert.match(f('/robots.txt')['Content-Type'], /^text\/plain/);
  assert.equal(f('/_seo/*')['X-Robots-Tag'], 'noindex'); assert.equal(f('/app-shell.html')['X-Robots-Tag'], 'noindex');   // internal files are not pages
});

test('the environment variables the deployment needs are documented', () => {
  const doc = read('netlify.toml') + read('.env.example');
  for (const v of ['APP_URL', 'VITE_GOAL4U_DATA_URL', 'VITE_GOAL4U_TOKEN', 'BUILD_HOOK_URL']) assert.ok(doc.includes(v), `${v} is not documented`);
});
