import './test-data-env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMediaJSON, _resetMediaCache } from './data-cache';

const realFetch = globalThis.fetch;
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('media file: concurrent requests share ONE download', async () => {
  _resetMediaCache(); let calls = 0;
  globalThis.fetch = (async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return json([{ videoId: 'a' }]); }) as any;
  try {
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => getMediaJSON('https://example.test/m1.json')));
    assert.equal(calls, 1);
    assert.ok(a.ok && b.ok && c.ok);
  } finally { globalThis.fetch = realFetch; }
});

test('media file: a transient failure is reported as transient (not 404) and a second try succeeds', async () => {
  _resetMediaCache(); let calls = 0;
  globalThis.fetch = (async () => { calls++; return calls === 1 ? json({}, 503) : json([{ videoId: 'x' }]); }) as any;
  try {
    const r = await getMediaJSON('https://example.test/m2.json');
    assert.ok(r.ok);                                   // the inner second try recovered
  } finally { globalThis.fetch = realFetch; }
  _resetMediaCache();
  globalThis.fetch = (async () => json({}, 503)) as any;
  try {
    const r = await getMediaJSON('https://example.test/m3.json');
    assert.equal(r.ok, false);
    assert.notEqual((r as any).status, 404);           // 503 → the route answers 502, which the browser retries
  } finally { globalThis.fetch = realFetch; }
});

test('media file: a real 404 stays a 404', async () => {
  _resetMediaCache();
  globalThis.fetch = (async () => json({}, 404)) as any;
  try { const r = await getMediaJSON('https://example.test/m4.json'); assert.deepEqual(r, { ok: false, status: 404 }); }
  finally { globalThis.fetch = realFetch; }
});
