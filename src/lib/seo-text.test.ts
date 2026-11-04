import test from 'node:test';
import assert from 'node:assert/strict';
import { commonName, rivalry, matchSeo, matchHeading } from './seo-text';

test('common names: what fans search for, not legal names or the data\'s short names', () => {
  assert.equal(commonName(81, 'FC Barcelona'), 'Barcelona');          // data shortName is "Barça"
  assert.equal(commonName(86, 'Real Madrid CF'), 'Real Madrid');
  assert.equal(commonName(65, 'Manchester City FC'), 'Manchester City');
  assert.equal(commonName(341, 'Leeds United FC'), 'Leeds United');   // uncurated club: legal suffix stripped
  assert.equal(commonName(9999, 'FC Midtjylland'), 'Midtjylland');
  assert.equal(commonName(9998, 'Ajax'), 'Ajax');
});

test('derby names apply only when both clubs match, in either order', () => {
  assert.equal(rivalry(86, 81), 'El Clásico'); assert.equal(rivalry(81, 86), 'El Clásico');
  assert.equal(rivalry(65, 66), 'Manchester derby'); assert.equal(rivalry(86, 78), 'Madrid derby');
  assert.equal(rivalry(86, 65), undefined);
});

const base = { homeId: 86, awayId: 81, home: 'Real Madrid CF', away: 'FC Barcelona', compName: 'La Liga', compShort: 'La Liga', utcDate: '2026-10-26T19:00:00Z', matchday: 10 };
test('upcoming / live / finished wording, built only from the record', () => {
  assert.equal(matchSeo({ ...base, status: 'TIMED' }).title, 'Real Madrid vs Barcelona (El Clásico) – live score, stats & head to head | Goal4U');
  assert.match(matchSeo({ ...base, status: 'IN_PLAY', scoreHome: 1, scoreAway: 0 }).description, /live: score, events and match stats/);
  assert.equal(matchSeo({ ...base, status: 'FINISHED', scoreHome: 3, scoreAway: 2 }).title, 'Real Madrid 3-2 Barcelona (El Clásico) – result, stats & head to head | Goal4U');
  assert.ok(matchSeo({ ...base, status: 'TIMED' }).description.length <= 300);
  assert.doesNotMatch(JSON.stringify([matchSeo({ ...base, status: 'TIMED' }), matchSeo({ ...base, status: 'FINISHED', scoreHome: 1, scoreAway: 1 })]), /highlight/i);
  assert.equal(matchHeading({ ...base, status: 'TIMED' }), 'Real Madrid vs Barcelona – El Clásico, La Liga matchday 10');
});
