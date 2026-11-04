import test from 'node:test';
import assert from 'node:assert/strict';
import { playerFactsFrom, playerTitle, playerDescription, playerJsonLd, playerRows } from './player-seo.ts';

const REC = { player_id: 3374, name: 'Kylian Mbappé', details: { position: 'Centre-Forward', current_club_name: 'Real Madrid', citizenship: ['France', 'Cameroon'], national_team_name: 'France', market_value: '€160.00m' } };

test('facts come from the record only; a record without a usable name has no page text', () => {
  const f = playerFactsFrom(REC)!;
  assert.deepEqual(f, { name: 'Kylian Mbappé', position: 'Centre-Forward', club: 'Real Madrid', nationality: 'France', nationalTeam: 'France', marketValue: '€160.00m' });
  assert.deepEqual(playerFactsFrom({ data: REC }), f);                               // wrapped in { data }
  assert.equal(playerFactsFrom(null), null); assert.equal(playerFactsFrom({ name: '  ' }), null); assert.equal(playerFactsFrom({ name: 'محمد صلاح' }), null);
});
test('title and description say what the record says — and nothing it does not', () => {
  const f = playerFactsFrom(REC)!;
  assert.equal(playerTitle(f), 'Kylian Mbappé Profile, Market Value & Career | Goal4U');
  assert.equal(playerDescription(f), 'Kylian Mbappé · Centre-Forward · Real Madrid · France. Market value €160.00m. Season stats, recent form and honours on Goal4U.');
  const bare = playerFactsFrom({ name: 'Some Player' })!;
  assert.equal(playerTitle(bare), 'Some Player Profile, Stats & Career | Goal4U');       // no market value in the record → the title does not promise one
  assert.equal(playerDescription(bare), 'Some Player. Season stats, recent form and honours on Goal4U.');
  assert.ok(playerDescription(f).length <= 160);
});
test('structured data and body rows skip missing fields', () => {
  const ld: any = playerJsonLd(playerFactsFrom(REC)!, 'https://x.test/player/3374');
  assert.equal(ld['@type'], 'Person'); assert.equal(ld.memberOf.name, 'Real Madrid'); assert.equal(ld.nationality, 'France'); assert.equal(ld.url, 'https://x.test/player/3374');
  const bare: any = playerJsonLd(playerFactsFrom({ name: 'Some Player' })!, 'https://x.test/player/1');
  assert.equal(bare.memberOf, undefined); assert.equal(bare.nationality, undefined);
  assert.deepEqual(playerRows(playerFactsFrom({ name: 'A', details: { position: 'Goalkeeper' } })!), [['Position', 'Goalkeeper']]);
});
