import test from 'node:test';
import assert from 'node:assert/strict';
import { dominantColor, inkOn } from './team-colors';

const px = (rgba: number[], n: number) => Array.from({ length: n }, () => rgba).flat();
test('dominantColor ignores white, grey and transparent pixels and finds the crest colour', () => {
  const data = new Uint8ClampedArray([...px([255, 255, 255, 255], 400), ...px([120, 120, 120, 255], 200), ...px([0, 0, 0, 0], 300), ...px([200, 16, 46, 255], 150)]);
  const c = dominantColor(data)!;
  assert.ok(c); const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  assert.ok(r > 150 && g < 60 && b < 90, c);
});
test('dominantColor returns null for a crest with no colour (all white)', () => {
  assert.equal(dominantColor(new Uint8ClampedArray(px([255, 255, 255, 255], 500))), null);
});
test('inkOn picks readable text', () => {
  assert.equal(inkOn('#0b3bbf'), '#ffffff');
  assert.equal(inkOn('#f5d000'), '#161616');
});

test('peekCrestColor: no crest means "known, none"; an unread crest is "unknown" (undefined) until read', async () => {
  const { peekCrestColor } = await import('./team-colors');
  assert.equal(peekCrestColor(null), null);
  assert.equal(peekCrestColor('/never-seen.png'), undefined);
});
