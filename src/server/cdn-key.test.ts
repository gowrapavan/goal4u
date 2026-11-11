import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NETLIFY_VARY, cdnCacheFor } from './api-cache.ts';
import { feedKey } from '../lib/feed-key.ts';

test('the CDN cache key includes the query string, so /feed?codes=PD can never be served for another /feed address', () => {
  assert.match(NETLIFY_VARY, /(^|,)query(,|$)/);                                // every query parameter
  assert.match(NETLIFY_VARY, /header=Sec-Fetch-Dest\|Sec-Fetch-Mode\|Sec-Fetch-Site/);   // and the fetch headers that block address-bar visits
  const fn = readFileSync(new URL('../../netlify/functions/api.ts', import.meta.url), 'utf8');
  assert.ok(fn.includes("headers.set('Netlify-Vary', NETLIFY_VARY)"), 'the function must use the shared value');
  assert.ok(!/Netlify-Vary', '/.test(fn), 'no hand-written Netlify-Vary left in the function');
});

test('the data and feed answers are still CDN-cacheable (the query fix does not turn caching off)', () => {
  assert.notEqual(cdnCacheFor('/api/data/feed'), 'no-store');
});

test('feedKey: same request → same key, whatever the order or case of the codes; different request → different key', () => {
  assert.equal(feedKey(['pd', 'CL'], '2026-11-01', '2026-11-20'), feedKey(['CL', 'PD'], '2026-11-01', '2026-11-20'));
  assert.equal(feedKey(undefined, '2026-11-03', '2026-11-19'), '|2026-11-03|2026-11-19|');
  assert.notEqual(feedKey(['PD']), feedKey(undefined));
  assert.notEqual(feedKey(['PD'], undefined, undefined, '2025-2026'), feedKey(['PD']));
  assert.notEqual(feedKey(['BL1', 'CL']), feedKey(['BL1']));
});
