import test from 'node:test';
import assert from 'node:assert/strict';
import { cdnCacheFor } from './api-cache.ts';

test('live endpoints: fresh for seconds; news and videos for minutes; everything else for two — each with a long stale-while-revalidate', () => {
  assert.match(cdnCacheFor('/api/data/feed'), /s-maxage=15, stale-while-revalidate=300/);
  assert.match(cdnCacheFor('/api/data/match/565832'), /s-maxage=15,/);
  assert.match(cdnCacheFor('/api/news'), /s-maxage=900, stale-while-revalidate=21600/);
  assert.match(cdnCacheFor('/api/news/focus'), /s-maxage=900,/);
  assert.match(cdnCacheFor('/api/data/videos'), /s-maxage=600,/);
  assert.match(cdnCacheFor('/api/data/shorts'), /s-maxage=600,/);
  assert.match(cdnCacheFor('/api/data/player-related/3374'), /s-maxage=120,/);
  assert.match(cdnCacheFor('/api/data/seasons'), /s-maxage=120,/);
  assert.match(cdnCacheFor('/api/data/feedback'), /s-maxage=120,/);   // prefix match must not catch look-alike names
  assert.match(cdnCacheFor('/api/data/videosX'), /s-maxage=120,/);
});

test('proxied crest pictures (/api/data/ext/…) are cached like other pictures, for a day', () => {
  assert.match(cdnCacheFor('/api/data/ext/c/laliga.png'), /s-maxage=86400/);
});
