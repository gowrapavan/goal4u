import test from 'node:test';
import assert from 'node:assert/strict';
import { leagueLogoSources } from './league-logo.ts';
import { publicUrl } from './public-files.ts';

const FILES = { 'assets/pl.png': 'aaaa1111', 'assets/pl-dark.png': 'bbbb2222', 'assets/pd.png': 'cccc3333' };
const EMBLEM = 'https://crests.football-data.org/PL.png';

test('light background: <code>.png (with its version), then the competition emblem', () => {
  assert.deepEqual(leagueLogoSources('PL', 'light', EMBLEM, FILES), ['/assets/pl.png?v=aaaa1111', EMBLEM]);
});
test('dark background: <code>-dark.png first, then the light file, then the emblem', () => {
  assert.deepEqual(leagueLogoSources('PL', 'dark', EMBLEM, FILES), ['/assets/pl-dark.png?v=bbbb2222', '/assets/pl.png?v=aaaa1111', EMBLEM]);
});
test('no dark file yet: dark mode uses the light logo; no file at all: only the emblem; nothing known: nothing', () => {
  assert.deepEqual(leagueLogoSources('PD', 'dark', undefined, FILES), ['/assets/pd.png?v=cccc3333']);
  assert.deepEqual(leagueLogoSources('SA', 'light', EMBLEM, FILES), [EMBLEM]);
  assert.deepEqual(leagueLogoSources('SA', 'light', undefined, FILES), []);
  assert.deepEqual(leagueLogoSources(undefined, 'dark', undefined, FILES), []);
});
test('only real file names are built from the code (no path tricks); an unknown file list assumes the files exist', () => {
  assert.deepEqual(leagueLogoSources('../x', 'light', undefined, FILES), []);
  assert.deepEqual(leagueLogoSources('bl1', 'dark', undefined, null), ['/assets/bl1-dark.png', '/assets/bl1.png']);
});
test('publicUrl: versioned when the file exists, null when the build says it does not', () => {
  assert.equal(publicUrl('/assets/pl.png', FILES), '/assets/pl.png?v=aaaa1111');
  assert.equal(publicUrl('images/missing.png', FILES), null);
  assert.equal(publicUrl('images/x.png', null), '/images/x.png');
});
