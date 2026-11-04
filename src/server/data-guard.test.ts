import './test-data-env.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeDataUrl, dataFetch, withTokenQuery, UnsafeDataUrl, authHeaderFor } from './data-source.ts';
import { readToken } from './data-token.ts';
import { findLeaks } from './bundle-scan.ts';

const B = 'https://data.test/goal4u-data';
const TOKEN = 'tok_TEST_1234567890abcdef';

test('URL guard: dot segments (plain, encoded once / twice, backslash), credentials, odd schemes and bad escapes are refused', () => {
  const bad = [`${B}/data/2026-2027/../matches.json`, `${B}/data/%2e%2e/x`, `${B}/data/%252e%252e/x`, `${B}/data/..%2fx`, `${B}/data/.%2E/x`, `${B}\\..\\x`,
    'https://a@b.test/x', 'ftp://data.test/x', 'file:///etc/passwd', `${B}/data/./x`, `${B}/data/%zz`, `${B}/data/%2e%2e%2fgoal4u/api`, `${B}/data/x%00y`, 'not a url'];
  for (const u of bad) assert.throws(() => assertSafeDataUrl(u), UnsafeDataUrl, u);
});
test('URL guard: ordinary data URLs (dots inside names, tokens with dots) pass', () => {
  for (const u of [`${B}/data/2026-2027/PL/matches.json`, `${B}/public/headshot/10000.png?token=a.b..c`, `${B}/data/a.b/c..d.json`, `${B}/_ls/data/team_informations/86`, 'https://raw.githubusercontent.com/gowrapavan/shortsdata/main/shorts.json'])
    assert.doesNotThrow(() => assertSafeDataUrl(u), u);
});
test('dataFetch refuses an unsafe URL BEFORE any request: the token is never sent anywhere', async () => {
  let called = 0; const f: any = async () => { called++; return new Response('{}'); };
  await assert.rejects(() => dataFetch(`${B}/data/2026-2027/../../../goal4u/api/secret`, { retryDelayMs: 0 }, f), UnsafeDataUrl);
  assert.equal(called, 0);
});
test('withTokenQuery adds the token to data-service URLs only (for pictures), encoded', () => {
  assert.equal(withTokenQuery(`${B}/public/x.png`), `${B}/public/x.png?token=${TOKEN}`);
  assert.equal(withTokenQuery(`${B}/public/x.png?v=1`), `${B}/public/x.png?v=1&token=${TOKEN}`);
  assert.equal(withTokenQuery('https://i.ytimg.com/vi/x/mqdefault.jpg'), 'https://i.ytimg.com/vi/x/mqdefault.jpg');
  assert.equal(authHeaderFor('https://data.test.evil.example/x'), undefined);                        // look-alike host
  assert.equal(authHeaderFor('https://data.test@evil.example/x'), undefined);
});
test('the token is read from GOAL4U_TOKEN; a bad one is no token', () => {
  assert.equal(readToken(TOKEN), TOKEN);
  for (const bad of ['short', 'has space inside', 'ünïcode12345', '', null, undefined, 'x'.repeat(600)]) assert.equal(readToken(bad as any), '', String(bad));
});
test('bundle scan finds a token or the data-service address in browser files, and ignores empty / tiny secrets', () => {
  const files = [{ name: 'dist/assets/a.js', text: `var a="${TOKEN}";` }, { name: 'dist/assets/b.js', text: `fetch("${B}/x")` }, { name: 'dist/assets/c.js', text: 'clean' }];
  const leaks = findLeaks(files, [{ label: 'token', value: TOKEN }, { label: 'origin', value: B }, { label: 'empty', value: '' }, { label: 'tiny', value: 'a' }]);
  assert.deepEqual(leaks.map((l) => `${l.file}:${l.label}`).sort(), ['dist/assets/a.js:token', 'dist/assets/b.js:origin']);
  assert.deepEqual(findLeaks([{ name: 'x', text: 'nothing' }], [{ label: 't', value: TOKEN }]), []);
});

test('the "rename VITE_GOAL4U_TOKEN" reminder is logged ONCE, not on every data request (fresh process with only the old variable set)', async () => {
  const { spawnSync } = await import('node:child_process');
  const src = new URL('./data-source.ts', import.meta.url).href;
  const code = `const m = await import(${JSON.stringify(src)}); const f = async () => new Response('{}');
    for (let i = 0; i < 25; i++) await m.dataFetch('https://data.test/goal4u-data/data/x.json', { retryDelayMs: 0 }, f);`;
  const env: Record<string, string | undefined> = { ...process.env, VITE_GOAL4U_TOKEN: 'tok_LEGACY_1234567890', GOAL4U_DATA_URL: 'https://data.test/goal4u-data' };
  delete env.GOAL4U_TOKEN; delete env.VITE_GOAL4U_DATA_URL;
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env: env as any, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const n = (r.stderr.match(/rename that variable to GOAL4U_TOKEN/g) || []).length;
  assert.equal(n, 1, `the reminder was logged ${n} times`);
  assert.ok(!r.stderr.includes('tok_LEGACY'), 'the token must never be logged');
});
