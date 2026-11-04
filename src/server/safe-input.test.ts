import test from 'node:test';
import assert from 'node:assert/strict';
import { qs, safeCode, safeId, safeSeason, safeSquadFile, safeDate, safeCodeList, safeImagePath, encodePath, capMap } from './safe-input.ts';

const TRAVERSAL = ['..', '.', '../x', 'a/../b', '%2e%2e', '%2e%2e%2f', '..%2f', '....//', 'a\\b', '/etc/passwd', 'x/..', '\u002e\u002e', 'a b', 'a;b', 'a?b=1', 'a#b', 'a\u0000b', '', ' '];

test('qs: only a plain string (arrays / objects / absent / too long are no value)', () => {
  assert.equal(qs('PL'), 'PL'); assert.equal(qs(['a', 'b'] as any), undefined); assert.equal(qs({ a: 1 } as any), undefined);
  assert.equal(qs(undefined), undefined); assert.equal(qs(5 as any), undefined); assert.equal(qs('x'.repeat(201)), undefined);
});
test('safeCode accepts real competition codes and refuses dots, slashes, dot-segments and encodings', () => {
  for (const ok of ['PL', 'PD', 'CL', 'BL1', 'world-cup', 'euro-2024', 'GB1', 'hd_streams']) assert.equal(safeCode(ok), ok);
  for (const bad of [...TRAVERSAL, 'a.b', 'x'.repeat(41), '-x', '_x']) assert.equal(safeCode(bad), undefined, JSON.stringify(bad));
});
test('safeId: digits only, 1-12', () => {
  assert.equal(safeId('10000'), '10000'); assert.equal(safeId('7'), '7');
  for (const bad of ['', '0x1', '12a', '-1', '1.5', '1'.repeat(13), '../1', ' 1', '1 ']) assert.equal(safeId(bad), undefined, bad);
});
test('safeSeason: league seasons, tournament years and slugs only', () => {
  for (const ok of ['2026-2027', '2025-2026', '2026', 'world-cup-2026', 'euro-2024', 'EURO-2028']) assert.equal(safeSeason(ok), ok);
  for (const bad of [...TRAVERSAL, '2026-27', 'current', '2026-2027/..', 'world-cup-', 'euro-24', '../../x', '2026-2027.json']) assert.equal(safeSeason(bad), undefined, JSON.stringify(bad));
});
test('safeSquadFile: a single *.json file name, never a path', () => {
  for (const ok of ['2026-2027-squad.json', 'national-team-2026.json', 'cl-2025-2026.json', 'hd_streams.json']) assert.equal(safeSquadFile(ok), ok);
  for (const bad of ['../../x.json', '../x.json', 'a/b.json', 'x.json/..', 'x.JSON.exe', 'x', '.json', '..json', '%2e%2e%2fx.json', 'a\\b.json', 'x.json?y=1']) assert.equal(safeSquadFile(bad), undefined, bad);
});
test('safeDate: a real YYYY-MM-DD', () => {
  assert.equal(safeDate('2026-10-31'), '2026-10-31');
  for (const bad of ['2026-13-01', '2026-02-30', '26-10-31', '2026-10-31T00:00', '', '2026-1-1', '../..']) assert.equal(safeDate(bad), undefined, bad);
});
test('safeCodeList: valid codes only, at most max, junk dropped', () => {
  assert.deepEqual(safeCodeList('PL,PD, CL ,..,a/b,'), ['PL', 'PD', 'CL']);
  assert.deepEqual(safeCodeList(undefined), []); assert.deepEqual(safeCodeList(['PL'] as any), []);
  assert.equal(safeCodeList(Array.from({ length: 30 }, (_, i) => `C${i}`).join(',')).length, 14);
});
test('safeImagePath: nested names with an image extension; no traversal, no absolute paths, no other file types', () => {
  for (const ok of ['headshot/10000.png', 'assets/player_images/default.jpg', 'trophies/Champions League.png', 'League_backdrops/PL.png', 'a/b/c/d/e/f.webp', 'x/Atlético (1).png']) assert.equal(safeImagePath(ok), ok, ok);
  for (const bad of ['../x.png', 'a/../x.png', '/x.png', 'a//x.png', 'x.png/..', './x.png', 'x.txt', 'x.png.php', 'x.html', 'a/b/c/d/e/f/g.png', '.png', 'a/.hidden.png', '%2e%2e/x.png', 'a\\b.png', 'x.png?token=1', 'x..png']) assert.equal(safeImagePath(bad), undefined, bad);
});
test('encodePath encodes each segment and keeps the slashes', () => assert.equal(encodePath('trophies/Champions League.png'), 'trophies/Champions%20League.png'));
test('capMap keeps a Map under its limit, dropping the oldest first', () => {
  const m = new Map<number, number>(); for (let i = 0; i < 10; i++) { m.set(i, i); capMap(m, 4); }
  assert.deepEqual([...m.keys()], [6, 7, 8, 9]);
});
