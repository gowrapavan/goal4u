import '../server/test-data-env.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { streamsEnabled, streamsPath, streamsKey, streamFiles, explicitStreamFiles, jsonNamesOf } from './config.ts';
import { normalizeRows, rowsOf, safeLink } from './normalize.ts';
import { createStreamsService, loadStreamFile, createFileDiscovery } from './service.ts';
import { streamsSeoDecision } from './seo.ts';
import { filterRows, flatten, groupByLeague } from './view.ts';
import { cdnCacheFor } from '../server/api-cache.ts';
import { BACKUP_HEADER } from '../server/data-source.ts';

const json = (b: any, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: h });

test('config: off by default; path, key and files are validated', () => {
  assert.equal(streamsEnabled({}), false); assert.equal(streamsEnabled({ STREAMS_PAGE: '1' }), true); assert.equal(streamsEnabled({ STREAMS_PAGE: 'no' }), false);
  assert.equal(streamsPath({}), 'streams'); assert.equal(streamsPath({ STREAMS_PATH: '/Desk-7k2x/' }), 'desk-7k2x'); assert.equal(streamsPath({ STREAMS_PATH: '../x' }), 'streams');
  assert.equal(streamsKey({ STREAMS_KEY: 'short' }), ''); assert.equal(streamsKey({ STREAMS_KEY: ' longenough1 ' }), 'longenough1');
  assert.deepEqual(streamFiles({}), ['sportsonline', 'yallashots']);
  assert.deepEqual(streamFiles({ STREAMS_FILES: 'a.json, b ,../x,a' }), ['a', 'b']);
});

test('normalize: wrappers, aliases, merged rows, unsafe links dropped, unknown fields kept', () => {
  assert.equal(rowsOf({ data: [1, 2] }).length, 2); assert.equal(rowsOf({ matches: [1] }).length, 1); assert.equal(rowsOf({ data: { streams: [1, 2, 3] } }).length, 3); assert.equal(rowsOf(null).length, 0);
  assert.equal(safeLink('javascript:alert(1)'), ''); assert.equal(safeLink('https://a.test/x'), 'https://a.test/x');
  const m = normalizeRows([
    { home_team: 'Arsenal', away_team: 'Chelsea', league: 'Premier League', time: '20:00', url: 'https://s.test/hd1.php', label: 'HD 1', quality: 'hd' },
    { home_team: 'Arsenal', away_team: 'Chelsea', league: 'Premier League', time: '20:00', url: 'https://s.test/hd2.php', label: 'HD 2' },
    { title: 'Real Madrid vs Barcelona', servers: [{ url: 'https://s.test/a', label: 'A' }, { url: 'javascript:x' }, 'https://s.test/b'] },
    'junk', null,
  ], 'f');
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].servers.map((s) => s.label), ['HD 1', 'HD 2']); assert.equal(m[0].extra.quality, 'hd');
  assert.equal(m[1].home, 'Real Madrid'); assert.equal(m[1].away, 'Barcelona'); assert.equal(m[1].servers.length, 2);
});

test('service: reads stream-data/<file>.json, tags the backup, reports failures per file without touching the others', async () => {
  const urls: string[] = [];
  const f = async (url: string) => { urls.push(url); if (url.includes('bad')) return json({}, 404); if (url.includes('down')) throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    return json({ data: [{ home_team: 'A', away_team: 'B', url: 'https://s.test/1' }] }, 200, url.includes('gh') ? { [BACKUP_HEADER]: 'github-backup' } : {}); };
  assert.match((await loadStreamFile('ok', f)).file, /ok/); assert.match(urls[0], /\/stream-data\/ok\.json$/);
  const svc = createStreamsService({ files: () => ['ok', 'gh', 'bad', 'down'], fetcher: f as any });
  const p = await svc.load();
  assert.deepEqual(p.sources.map((s) => [s.file, s.ok, s.via]), [['ok', true, 'mirror'], ['gh', true, 'backup'], ['bad', false, 'mirror'], ['down', false, null]]);
  assert.equal(p.sources[2].error, 'File not found'); assert.equal(p.sources[3].error, 'Timed out');
});

test('service: 30 s memory cache, failures not cached, last good copy kept when a refresh fails', async () => {
  let t = 1000, n = 0, fail = false;
  const f = async () => { n++; if (fail) throw new Error('x'); return json([{ home_team: 'A', away_team: 'B', url: 'https://s.test/1' }]); };
  const svc = createStreamsService({ files: () => ['x'], fetcher: f as any, now: () => t });
  await svc.load(); await svc.load(); assert.equal(n, 1);
  t += 31_000; fail = true; const p = await svc.load();
  assert.equal(n, 2); assert.equal(p.sources[0].ok, true); assert.equal(p.sources[0].matches.length, 1); assert.match(p.sources[0].error!, /last good/);
});

test('seo: the page exists (200, noindex) only when switched on and on its own path', () => {
  assert.equal(streamsSeoDecision('/streams', {}), null);
  assert.equal(streamsSeoDecision('/streams', { STREAMS_PAGE: '1' })?.robots, 'noindex,nofollow');
  assert.equal(streamsSeoDecision('/desk-1x/', { STREAMS_PAGE: '1', STREAMS_PATH: 'desk-1x' })?.status, 200);
  assert.equal(streamsSeoDecision('/streams', { STREAMS_PAGE: '1', STREAMS_PATH: 'desk-1x' }), null);
});

test('the stream API is never shared-cached on the CDN', () => { assert.equal(cdnCacheFor('/api/streams'), 'no-store'); assert.equal(cdnCacheFor('/api/streams/gate'), 'no-store'); });

test('view: filter, group and flatten', () => {
  const src = [{ file: 'a', ok: true, via: 'mirror' as const, status: 200, rows: 2, fetchedAt: '', matches: [
    { id: '1', home: 'Arsenal', away: 'Chelsea', homeLogo: '', awayLogo: '', league: 'PL', time: '20:00', servers: [], extra: {} },
    { id: '2', home: 'Roma', away: 'Lazio', homeLogo: '', awayLogo: '', league: 'SA', time: '18:00', servers: [], extra: {} }] }];
  const rows = flatten(src); assert.equal(rows.length, 2);
  assert.equal(filterRows(rows, 'rom', '').length, 1); assert.equal(filterRows(rows, '', 'PL').length, 1);
  assert.deepEqual(groupByLeague(rows).map((g) => g.league), ['PL', 'SA']);
});

test('discovery: every .json in stream-data/ is shown; a new file appears by itself; STREAMS_FILES / STREAMS_EXCLUDE narrow it', async () => {
  assert.equal(explicitStreamFiles({}), null); assert.deepEqual(explicitStreamFiles({ STREAMS_FILES: 'a,b' }), ['a', 'b']);
  assert.deepEqual(jsonNamesOf([{ name: 'b.json', type: 'file' }, { name: 'a.json', type: 'file' }, { name: 'x.txt', type: 'file' }, { name: 'sub', type: 'dir' }, { name: '../evil.json', type: 'file' }]), ['a', 'b']);
  let t = 0; let listing = [{ name: 'fabortv.json', type: 'file' }, { name: 'hesgoal.json', type: 'file' }]; let calls = 0;
  const lister = async () => { calls++; return listing; };
  const env: Record<string, string> = {};
  const find = createFileDiscovery({ lister, env, now: () => t });
  assert.deepEqual(await find(), ['fabortv', 'hesgoal']); await find(); assert.equal(calls, 1);                       // remembered
  listing = [...listing, { name: 'new_source.json', type: 'file' }]; t += 301_000;
  assert.deepEqual(await find(), ['fabortv', 'hesgoal', 'new_source']);                                                  // appears without any setting
  env.STREAMS_EXCLUDE = 'HesGoal.json'; assert.deepEqual(await find(), ['fabortv', 'new_source']);
  env.STREAMS_FILES = 'only_this'; assert.deepEqual(await find(), ['only_this']);
});

test('discovery: a failed listing keeps the last list, or the two defaults on a first failure', async () => {
  let t = 0, fail = false;
  const find = createFileDiscovery({ lister: async () => { if (fail) throw new Error('x'); return [{ name: 'a.json', type: 'file' }]; }, env: {}, now: () => t });
  fail = true; assert.deepEqual(await find(), ['sportsonline', 'yallashots']);
  t += 31_000; fail = false; assert.deepEqual(await find(), ['a']);
  t += 301_000; fail = true; assert.deepEqual(await find(), ['a']);
});
