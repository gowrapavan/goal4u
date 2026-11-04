import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketValueEUR, formatEUR, normaliseValues, mergeValues, normaliseMeta, normaliseDecorated, INR_PER_EUR } from './market-value.ts';

test('rupee crore values convert to euros at the documented rate', () => {
  assert.equal(parseMarketValueEUR('₹1,600 Cr'), Math.round((1600 * 1e7) / INR_PER_EUR));
  assert.equal(formatEUR(parseMarketValueEUR('₹1,600 Cr')), '€178M');
  assert.equal(formatEUR(parseMarketValueEUR('₹80 Cr')), '€8.9M');
  assert.equal(parseMarketValueEUR('₹25 Lakh'), Math.round(2_500_000 / INR_PER_EUR));
});
test('euro strings are passed through, not converted twice', () => {
  assert.equal(parseMarketValueEUR('€45m'), 45_000_000);
  assert.equal(parseMarketValueEUR('€1.2bn'), 1_200_000_000);
  assert.equal(parseMarketValueEUR('€500k'), 500_000);
});
test('unknown / unreadable is null, never zero', () => {
  for (const v of [undefined, null, '', '-', 'n/a', 'abc', '₹0 Cr', '12 widgets', {}]) assert.equal(parseMarketValueEUR(v as any), null);
  assert.equal(formatEUR(null), null);
  assert.equal(formatEUR(0), null);
});
test('rows with unreadable values are dropped; ids and age are handled safely', () => {
  const rows = [
    { player_name: 'A', market_value: '₹100 Cr', player_id: null, team_id: null, age: '1', tm_player_id: '1' },
    { player_name: 'B', market_value: 'n/a', tm_player_id: '2' },
    { player_name: 'C', market_value: '₹300 Cr', player_id: 7, team_id: 65, tm_player_id: '3' },
  ];
  const out = normaliseValues(rows, 'PL');
  assert.deepEqual(out.map((p) => p.name), ['C', 'A']);
  assert.equal(out[1].id, null);
  assert.equal(out[0].rank, 1);
  assert.ok(!('age' in out[0]));
});
test('ties break by league order; duplicates across leagues are merged once', () => {
  const pl = normaliseValues([{ player_name: 'Haaland', market_value: '₹1,600 Cr', tm_player_id: '9' }], 'PL');
  const pd = normaliseValues([{ player_name: 'Yamal', market_value: '₹1,600 Cr', tm_player_id: '8' }, { player_name: 'Haaland', market_value: '₹1,600 Cr', tm_player_id: '9' }], 'PD');
  const all = mergeValues([pd, pl]);
  assert.deepEqual(all.map((p) => p.name), ['Haaland', 'Yamal']);
});

test('league metadata: facts converted to euros, MVP extracted, missing fields are null', () => {
  const m = normaliseMeta({ number_of_teams: '20 teams', players: '553', avg_age: '27.0', avg_market_value: '₹76.05 Cr', total_market_value: '₹ 42,054 Cr',
    most_valuable_player: { name: 'Lamine Yamal', value: '₹1,600 Cr', player_id: 202283, tm_player_id: '937958' } })!;
  assert.equal(m.teams, '20'); assert.equal(m.players, '553');
  assert.equal(m.totalValue, '€4.67B'); assert.equal(m.avgValue, '€8.5M');
  assert.equal(m.mvp?.name, 'Lamine Yamal'); assert.equal(m.mvp?.id, 202283); assert.equal(m.mvp?.valueLabel, '€178M');
  const wrapped = normaliseMeta({ _meta: {}, data: { most_valuable_player: { name: 'X', value: 'n/a' } } })!;
  assert.equal(wrapped.mvp, null); assert.equal(wrapped.totalValue, null);
  assert.equal(normaliseMeta(null), null);
});
test('most decorated: sorted by titles, null ids kept as null, unknown counts dropped', () => {
  const out = normaliseDecorated([
    { player_name: 'B', total_titles: '10', player_id: 3218, tm_player_id: '2' },
    { player_name: 'A', total_titles: '12', player_id: null, tm_player_id: '1' },
    { player_name: 'C', total_titles: 'many' }, { player_name: 'D', total_titles: '0' },
  ]);
  assert.deepEqual(out.map((p) => [p.name, p.titles, p.rank]), [['A', 12, 1], ['B', 10, 2]]);
  assert.equal(out[0].id, null); assert.equal(out[1].id, 3218);
});
