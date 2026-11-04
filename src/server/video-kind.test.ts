import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, kindFromOEmbed, pickLongForm, titleSaysShort, _resetVideoKindCache, hasRealThumbnail, MIN_THUMB_BYTES, Fetcher } from './video-kind.ts';

const oembed = (w: number, h: number): Fetcher => async () => ({ ok: true, status: 200, json: async () => ({ width: w, height: h }) });
const v = (id: string, title = 'Highlights') => ({ videoId: id, title });

test('portrait player = short, landscape = video, garbage = unknown', () => {
  assert.equal(kindFromOEmbed({ width: 113, height: 200 }), 'short');
  assert.equal(kindFromOEmbed({ width: 200, height: 113 }), 'video');
  assert.equal(kindFromOEmbed({}), 'unknown'); assert.equal(kindFromOEmbed(null), 'unknown');
});
test('#shorts in the title is recognised', () => {
  assert.equal(titleSaysShort('Great goal #shorts'), true); assert.equal(titleSaysShort('Great goal #Short'), true);
  assert.equal(titleSaysShort('Shorts-style highlights'), false);
});
test('answers are cached: each video is asked about once', async () => {
  _resetVideoKindCache(); let calls = 0;
  const f: Fetcher = async () => { calls++; return { ok: true, status: 200, json: async () => ({ width: 200, height: 113 }) }; };
  await classify('a1', f); await classify('a1', f); await classify('a1', f);
  assert.equal(calls, 1);
});
test('pickLongForm drops shorts, keeps order, and stops once the limit is reached', async () => {
  _resetVideoKindCache(); const asked: string[] = [];
  const f: Fetcher = async (url) => { const id = decodeURIComponent(url).match(/v=([^&]+)/)![1]; asked.push(id); const short = id.startsWith('s'); return { ok: true, status: 200, json: async () => (short ? { width: 113, height: 200 } : { width: 200, height: 113 }) }; };
  const list = [v('s1'), v('L1'), v('s2'), v('L2'), v('L3'), v('s3'), v('L4'), v('L5')];
  const out = await pickLongForm(list, 3, { fetcher: f, batch: 4 });
  assert.deepEqual(out.map((x) => x.videoId), ['L1', 'L2', 'L3']);
  assert.ok(asked.length <= 8);
});
test('title-flagged shorts are removed without asking YouTube', async () => {
  _resetVideoKindCache(); let calls = 0; const f: Fetcher = async () => { calls++; return { ok: true, status: 200, json: async () => ({ width: 200, height: 113 }) }; };
  const out = await pickLongForm([v('x1', 'Goal #shorts'), v('x2')], 5, { fetcher: f });
  assert.deepEqual(out.map((x) => x.videoId), ['x2']); assert.equal(calls, 1);
});
test('if YouTube is unreachable, videos are kept (unknown is never dropped) and not re-asked immediately', async () => {
  _resetVideoKindCache(); let calls = 0; const f: Fetcher = async () => { calls++; throw new Error('offline'); };
  const out = await pickLongForm([v('u1'), v('u2')], 5, { fetcher: f });
  assert.equal(out.length, 2); const callsAfterFirst = calls;
  await pickLongForm([v('u1'), v('u2')], 5, { fetcher: f });
  assert.equal(calls, callsAfterFirst);
});

test('ids already listed in the shorts dataset are excluded even when YouTube is unreachable', async () => {
  _resetVideoKindCache(); const f: Fetcher = async () => { throw new Error('offline'); };
  const out = await pickLongForm([v('k1'), v('k2'), v('k3')], 5, { fetcher: f, exclude: new Set(['k2']) });
  assert.deepEqual(out.map((x) => x.videoId), ['k1', 'k3']);
});

test('private / deleted / embedding-disabled videos (oEmbed 401, 403, 404) are dropped', async () => {
  _resetVideoKindCache();
  const f: Fetcher = async (url) => { const id = decodeURIComponent(url).match(/v=([^&]+)/)![1]; const st = ({ p1: 401, d1: 404, n1: 403 } as any)[id];
    return st ? { ok: false, status: st, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ width: 200, height: 113 }) }; };
  assert.equal(await classify('p1', f), 'gone');
  const out = await pickLongForm([v('p1'), v('ok1'), v('d1'), v('n1'), v('ok2')], 5, { fetcher: f });
  assert.deepEqual(out.map((x) => x.videoId), ['ok1', 'ok2']);
});
test('a 5xx from oEmbed is NOT treated as gone (kept as unknown)', async () => {
  _resetVideoKindCache(); const f: Fetcher = async () => ({ ok: false, status: 503, json: async () => ({}) });
  assert.equal(await classify('s5', f), 'unknown');
});
test('videos with YouTube\'s tiny placeholder thumbnail are removed; unreachable thumbnails are kept', async () => {
  _resetVideoKindCache();
  const f = oembed(200, 113);
  const probe = async (url: string) => { const id = url.match(/vi\/([^/]+)\//)![1]; if (id === 'net') throw new Error('offline'); return id.startsWith('ph') ? 1100 : 18000; };
  const out = await pickLongForm([v('ph1'), v('real1'), v('net'), v('ph2'), v('real2')], 10, { fetcher: f, thumbProbe: probe });
  assert.deepEqual(out.map((x) => x.videoId), ['real1', 'net', 'real2']);
  assert.equal(await hasRealThumbnail('x', async () => MIN_THUMB_BYTES - 1), false);
  assert.equal(await hasRealThumbnail('y', async () => MIN_THUMB_BYTES), true);
});

import { uploadTime, newestFirst } from './video-kind.ts';
test('uploadTime reads ISO, compact and written dates; junk and far-future dates sort last', () => {
  const NOW = Date.parse('2026-10-25T12:00:00Z');
  assert.equal(uploadTime({ uploadDate: '2026-10-20T10:00:00Z' }, NOW), Date.parse('2026-10-20T10:00:00Z'));
  assert.equal(uploadTime({ uploadDate: '20261020' }, NOW), Date.UTC(2026, 9, 20));
  assert.equal(uploadTime({ uploadDate: 'Oct 20, 2026' }, NOW) > 0, true);
  assert.equal(uploadTime({ uploadDate: 'yesterday-ish' }, NOW), 0); assert.equal(uploadTime({}, NOW), 0);
  assert.equal(uploadTime({ uploadDate: '2027-03-01' }, NOW), 0);
});
test('newestFirst orders by real time even when the formats are mixed (string comparison got this wrong)', () => {
  const NOW = Date.parse('2026-10-25T12:00:00Z');
  const list = [{ id: 'old', uploadDate: '20260620' }, { id: 'new', uploadDate: '2026-10-24T08:00:00Z' }, { id: 'mid', uploadDate: '2026-08-20' }, { id: 'bad', uploadDate: '' }];
  assert.deepEqual(newestFirst(list, NOW).map((x) => x.id), ['new', 'mid', 'old', 'bad']);
  assert.deepEqual(list.map((x) => x.id), ['old', 'new', 'mid', 'bad']);   // the input is not mutated
});

import { keepRealThumbs } from './video-kind.ts';
test("keepRealThumbs drops items whose thumbnail is YouTube's tiny grey placeholder and keeps unknowns", async () => {
  _resetVideoKindCache();
  const sizes: Record<string, number | null> = { good1: 9000, grey1: 900, good2: 20000, unk1: null };
  const probe = async (url: string) => { const id = url.split('/vi/')[1].split('/')[0]; const v = sizes[id]; if (v === null) throw new Error('offline'); return v; };
  const out = await keepRealThumbs([{ videoId: 'good1' }, { videoId: 'grey1' }, { videoId: 'unk1' }, { videoId: 'good2' }], probe, 2);
  assert.deepEqual(out.map((x) => x.videoId), ['good1', 'unk1', 'good2']);
});
