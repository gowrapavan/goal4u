import test from 'node:test';
import assert from 'node:assert/strict';
import { allRows, groupRows, keySummary, homeShare, leader, scorers, shortName } from './match-stats-view';

const P = (home: string, away: string, hn = parseFloat(home), an = parseFloat(away)) => ({ home, away, hn, an });
const stats = { possession: P('62%', '38%'), expected_goals: P('1.25', '0.21'), shots: P('11', '4'), shots_on_target: P('5', '2'), corners: P('1', '1'), fouls: P('4', '5'), yellow_cards: P('1', '1'), goals: P('1', '1'), shots_off_goal: P('0', '0') };
const more = [{ key: 'chances_created', name: 'Chances created', ...P('8', '4') }, { key: 'free_kicks', name: 'Free Kicks', ...P('3', '5') }, { key: 'weird_new_stat', name: 'Weird New Stat', ...P('2', '1') }];

test('rows: possession and the score are left to their own places; both-zero rows disappear; extras are merged', () => {
  const keys = allRows(stats, more).map((r) => r.key);
  assert.ok(!keys.includes('possession') && !keys.includes('goals') && !keys.includes('shots_off_goal')); assert.ok(keys.includes('chances_created') && keys.includes('weird_new_stat'));
  assert.equal(allRows(stats, more).find((r) => r.key === 'shots')!.label, 'Shots');
});

test('groups: fixed order, known keys in their group, unknown stats land in "More", empty groups are omitted', () => {
  const g = groupRows(allRows(stats, more));
  assert.deepEqual(g.map((x) => x.id), ['attack', 'discipline', 'setpieces', 'more']);
  assert.deepEqual(g[0].rows.map((r) => r.key), ['expected_goals', 'shots', 'shots_on_target', 'chances_created']);
  assert.deepEqual(g.find((x) => x.id === 'more')!.rows.map((r) => r.key), ['weird_new_stat']);
});

test('summary snapshot: possession + xG, shots, on target, chances, corners — only what exists', () => {
  const s = keySummary(stats, more); assert.equal(s.possession!.hn, 62);
  assert.deepEqual(s.rows.map((r) => r.label), ['Expected goals (xG)', 'Shots', 'Shots on target', 'Chances created', 'Corners']);
  assert.deepEqual(keySummary({ shots: P('3', '2') }, []).rows.map((r) => r.key), ['shots']);
  assert.equal(keySummary({ shots: P('3', '2') }, []).possession, null);
  assert.equal(keySummary(null, undefined).rows.length, 0);
  assert.equal(keySummary({}, [{ key: 'dangerous_chances', name: 'x', ...P('1', '1') }]).rows[0].label, 'Dangerous chances');   // fallback when "chances created" is absent
});

test('bar share and leader', () => {
  assert.equal(homeShare(11, 4), (11 / 15) * 100); assert.equal(homeShare(0, 0), 50); assert.equal(leader(3, 1), 'home'); assert.equal(leader(1, 3), 'away'); assert.equal(leader(2, 2), null);
});

test('scorers: grouped per side, a brace on one line, penalty / own-goal tags, ignores events without a name', () => {
  const ev = [
    { type: 'goal', team: 'home', player: 'Hassane Kamara', minute: 29, goal_type: 'normal' }, { type: 'yellow_card', team: 'home', player: 'X', minute: 30 },
    { type: 'goal', team: 'away', player: 'Anastasios Douvikas', minute: 54, goal_type: 'penalty' }, { type: 'goal', team: 'home', player: 'Hassane Kamara', minute: 70, goal_type: 'normal' },
    { type: 'goal', team: 'away', player: 'Jon Doe', minute: 80, goal_type: 'own_goal' }, { type: 'goal', team: 'home', player: '', minute: 5 }];
  const s = scorers(ev);
  assert.deepEqual(s.home.map((x) => [x.name, x.minutes]), [['Hassane Kamara', [29, 70]]]); assert.equal(s.home[0].short, 'H. Kamara');
  assert.deepEqual(s.away.map((x) => [x.name, x.minutes, x.tags]), [['Anastasios Douvikas', [54], ['pen']], ['Jon Doe', [80], ['og']]]);
  assert.deepEqual(scorers(null), { home: [], away: [] }); assert.equal(shortName('Pelé'), 'Pelé'); assert.equal(shortName('Kaiki Bruno da Silva'), 'K. Bruno da Silva');
});
