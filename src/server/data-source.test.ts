import test from 'node:test';
import assert from 'node:assert/strict';
import { dataOrigin, isMirror, maskGithubUrls } from './data-source.ts';

const GH = 'https://raw.githubusercontent.com/gowrapavan/goal4u-data/main';
const MIRROR = { VITE_GOAL4U_DATA_URL: 'https://gowra-api.onrender.com/goal4u-data/' };

test('no setting → GitHub directly; the mirror address is used (trailing slash trimmed) when VITE_GOAL4U_DATA_URL is set', () => {
  assert.equal(dataOrigin({}), GH); assert.equal(isMirror({}), false);
  assert.equal(dataOrigin(MIRROR), 'https://gowra-api.onrender.com/goal4u-data'); assert.equal(isMirror(MIRROR), true);
});
test('older names still work, the new one wins, junk is ignored', () => {
  assert.equal(dataOrigin({ GOAL4U_DATA_BASE: 'https://a.test/x' }), 'https://a.test/x');
  assert.equal(dataOrigin({ VITE_DATA_BASE: 'https://b.test/y' }), 'https://b.test/y');
  assert.equal(dataOrigin({ VITE_GOAL4U_DATA_URL: 'https://new.test/z', GOAL4U_DATA_BASE: 'https://old.test/z' }), 'https://new.test/z');
  assert.equal(dataOrigin({ VITE_GOAL4U_DATA_URL: 'not a url' }), GH);
});
test('maskGithubUrls rewrites GitHub addresses inside strings, arrays and objects when a mirror is set, without touching the input', () => {
  const input = { photo: `${GH}/public/headshot/10.png`, list: [`${GH}/public/a.png`, 'https://example.com/x.png', 3, null], nested: { u: `see ${GH}/data/x.json` } };
  const copy = JSON.stringify(input);
  const out: any = maskGithubUrls(input, MIRROR);
  assert.equal(out.photo, 'https://gowra-api.onrender.com/goal4u-data/public/headshot/10.png');
  assert.deepEqual(out.list, ['https://gowra-api.onrender.com/goal4u-data/public/a.png', 'https://example.com/x.png', 3, null]);
  assert.equal(out.nested.u, 'see https://gowra-api.onrender.com/goal4u-data/data/x.json');
  assert.equal(JSON.stringify(input), copy);
  assert.equal(maskGithubUrls(`${GH}/public/q.png`, MIRROR), 'https://gowra-api.onrender.com/goal4u-data/public/q.png');
});
test('without a mirror there is nothing to point to: the value comes back as it is', () => {
  const v = { a: `${GH}/public/x.png` };
  assert.equal(maskGithubUrls(v, {}), v);
});
