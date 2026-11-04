import test from 'node:test';
import assert from 'node:assert/strict';
import { selectIndexNowUrls } from './indexnow-select.ts';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const h = (n: number) => new Date(NOW + n * 3600_000).toISOString();
const IDX = {
  matches: [
    { path: '/match/1?c=PL', utcDate: h(-30), lastmod: h(-2) },     // played 30 h ago, data touched 2 h ago
    { path: '/match/2?c=PL', utcDate: h(-300), lastmod: h(-290) },  // old and untouched
    { path: '/match/3?c=PD', utcDate: h(20) },                       // kicks off within the window
    { path: '/match/4?c=SA', utcDate: h(400) },                      // far future
    { path: '/match/5?c=SA', utcDate: h(-100), lastmod: h(30) },     // lastmod in the future: not believed
  ],
  competitions: [{ path: '/competition/premier-league' }],
};
test('only matches that changed or are happening inside the window are selected', () => {
  assert.deepEqual(selectIndexNowUrls(IDX, 'https://x.test', NOW), ['https://x.test/match/1?c=PL', 'https://x.test/match/3?c=PD']);
});
test('static pages only when asked; a different window changes the selection; the cap is honoured', () => {
  const withStatic = selectIndexNowUrls(IDX, 'https://x.test/', NOW, { includeStatic: true });
  assert.ok(withStatic.includes('https://x.test/') && withStatic.includes('https://x.test/competition/premier-league'));
  assert.equal(selectIndexNowUrls(IDX, 'https://x.test', NOW, { hours: 6 }).length, 1);       // only match 1 (updated 2 h ago)
  assert.equal(selectIndexNowUrls(IDX, 'https://x.test', NOW, { includeStatic: true, max: 2 }).length, 2);
});
test('unreadable dates never select a URL', () => {
  assert.deepEqual(selectIndexNowUrls({ matches: [{ path: '/match/9', utcDate: 'nonsense', lastmod: 'also nonsense' }] }, 'https://x.test', NOW), []);
});
