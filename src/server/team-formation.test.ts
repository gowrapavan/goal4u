import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceFrom, analyseFormation, type Appearance, type LineupPlayer } from './team-formation.ts';

const lp = (id: number, pos: LineupPlayer['pos'], side: number | null, o: Partial<LineupPlayer> = {}): LineupPlayer =>
  ({ id, name: `P${id}`, number: String(id), pos, role: null, side, minutes: 90, rating: 7, subOn: null, ...o });
const XI = (ids: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]): LineupPlayer[] => ids.map((id, i) => lp(id, i === 0 ? 'g' : i < 5 ? 'd' : i < 8 ? 'm' : 'f', i === 0 ? 50 : 10 + i * 7));
const app = (ts: number, formation: string | null, bench: LineupPlayer[] = [], starters = XI()): Appearance => ({ ts, formation, starters, bench });

test('the favourite formation is the one used most, recent matches counting more', () => {
  const apps = [app(10, '4-3-3'), app(9, '4-3-3'), app(8, '4-2-3-1'), app(7, '4-2-3-1')];
  const a = analyseFormation(apps);
  assert.equal(a.matches, 4);
  assert.equal(a.usage.find((u) => u.formation === '4-2-3-1')!.count, 2);
  // two recent uses of 4-3-3 (1 + .92) outweigh two older uses of 4-2-3-1 (.92² + .92³)
  assert.equal(a.formation, '4-3-3');
  assert.equal(analyseFormation([app(10, '4-2-3-1'), app(9, '4-2-3-1'), app(8, '4-3-3')]).formation, '4-2-3-1');
});

test('no line-up carried a formation: null (the page then uses 4-3-3)', () => {
  const a = analyseFormation([app(3, null), app(2, null)]);
  assert.equal(a.formation, null); assert.deepEqual(a.usage, []); assert.equal(a.sectors.defence, null);
  assert.equal(analyseFormation([]).matches, 0);
});

test('favourite back / midfield / front numbers with their share', () => {
  const a = analyseFormation([app(5, '4-3-3'), app(4, '4-3-3'), app(3, '4-2-3-1'), app(2, '3-5-2')]);
  assert.deepEqual(a.sectors.defence, { value: 4, count: 3, share: 0.75 });
  assert.deepEqual(a.sectors.midfield, { value: 3, count: 2, share: 0.5 });   // 3 twice (4-3-3), 5 twice (4-2-3-1, 3-5-2): a tie goes to the more recent one
  assert.deepEqual(a.sectors.attack, { value: 3, count: 2, share: 0.5 });
});

test('the pool counts starts AND bench appearances, with usual sector and side', () => {
  const bench = [lp(50, 'm', null, { minutes: 20, subOn: 70 }), lp(51, 'f', null, { minutes: 0, subOn: null })];
  const a = analyseFormation([app(3, '4-3-3', bench), app(2, '4-3-3', bench), app(1, '4-3-3')]);
  const sub = a.pool.find((p) => p.id === 50)!;
  assert.equal(sub.subs, 2); assert.equal(sub.starts, 0); assert.equal(sub.minutes, 40); assert.equal(sub.sector, 'm');
  assert.equal(a.pool.find((p) => p.id === 51), undefined);   // an unused substitute has not played
  const gk = a.pool.find((p) => p.id === 1)!;
  assert.equal(gk.starts, 3); assert.equal(gk.sector, 'g'); assert.equal(gk.side, 50); assert.equal(gk.rating, 7);
  assert.ok(a.pool[0].starts >= a.pool[a.pool.length - 1].starts);
});

test('appearanceFrom reads a stats.json lineup side and rejects thin or invalid ones', () => {
  const side = { formation: '4-2-3-1', starting: XI().map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.pos, position_detail: 'Centre Back', pitch: { line: 2, side: p.side }, minutes: 90, rating: 7.2 })), subs: [{ id: 99, name: 'Sub', position: 'f', minutes: 15, sub_on: 75 }] };
  const a = appearanceFrom(side, 123)!;
  assert.equal(a.formation, '4-2-3-1'); assert.equal(a.starters.length, 11); assert.equal(a.bench[0].subOn, 75); assert.equal(a.ts, 123);
  assert.equal(appearanceFrom({ ...side, formation: 'x' }, 1)!.formation, null);
  assert.equal(appearanceFrom({ starting: side.starting.slice(0, 5) }, 1), null);
  assert.equal(appearanceFrom(null, 1), null);
  assert.equal(appearanceFrom({ ...side, starting: side.starting.map((p: any) => ({ ...p, name: 'محمد' })) }, 1), null);   // non-English names are dropped, not shown raw
});
