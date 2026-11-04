import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormation, slotsFor, buildXI, poolFromSquad, sectorOfPosition, DEFAULT_FORMATION, type PoolPlayer } from './formation.ts';

const P = (id: number, name: string, sector: PoolPlayer['sector'], side: number | null, starts: number, o: Partial<PoolPlayer> = {}): PoolPlayer =>
  ({ id, name, number: String(id), sector, role: null, side, starts, subs: 0, minutes: starts * 90, recent: starts, rating: 7, ...o });

// a realistic 4-3-3 pool: GK, LB LCB RCB RB, DM CM CM(att), LW ST RW + bench
const POOL: PoolPlayer[] = [
  P(1, 'Keeper', 'g', 50, 30), P(2, 'Left Back', 'd', 10, 28), P(3, 'Centre Back L', 'd', 38, 30), P(4, 'Centre Back R', 'd', 62, 29), P(5, 'Right Back', 'd', 90, 27),
  P(6, 'Anchor', 'm', 50, 30, { role: 'Defensive Midfield' }), P(7, 'Box To Box', 'm', 35, 26), P(8, 'Playmaker', 'm', 65, 25, { role: 'Attacking Midfield' }),
  P(9, 'Left Winger', 'f', 12, 24), P(10, 'Striker', 'f', 50, 29), P(11, 'Right Winger', 'f', 88, 27),
  P(12, 'Backup Keeper', 'g', 50, 2), P(13, 'Bench Mid', 'm', 50, 3, { subs: 14 }), P(14, 'Bench Fwd', 'f', 50, 2, { subs: 18 }), P(15, 'Bench Def', 'd', 50, 1, { subs: 6 }),
];

test('parseFormation accepts real shapes only', () => {
  assert.deepEqual(parseFormation('4-2-3-1'), [4, 2, 3, 1]);
  assert.deepEqual(parseFormation('3-5-2'), [3, 5, 2]);
  for (const bad of ['4-4-3', '442', 'x', '', null, undefined, '4-3-3-1-1-1', '0-5-5']) assert.equal(parseFormation(bad as any), null, String(bad));
});

test('slotsFor gives 11 places: keeper at the bottom, attack at the top, rows left to right', () => {
  for (const f of ['4-3-3', '4-2-3-1', '3-5-2', '5-3-2', '4-4-1-1']) assert.equal(slotsFor(f).length, 11, f);
  const s = slotsFor('4-3-3');
  assert.equal(s[0].sector, 'g'); assert.ok(s[0].y > s[1].y);
  const defs = s.filter((x) => x.sector === 'd'), fwds = s.filter((x) => x.sector === 'f');
  assert.equal(defs.length, 4); assert.equal(fwds.length, 3);
  assert.ok(defs.every((d) => d.y > fwds[0].y));
  assert.deepEqual(defs.map((d) => d.x), [...defs.map((d) => d.x)].sort((a, b) => a - b));
  assert.equal(slotsFor('nonsense').length, 11);   // falls back to the default shape
  assert.equal(slotsFor('4-2-3-1').filter((x) => x.sector === 'm').length, 5);
});

test('buildXI puts each player where he usually plays: sector first, then his side of the pitch', () => {
  const xi = buildXI(POOL, '4-3-3');
  const at = (key: string) => xi.slots.find((s) => s.key === key)!.player?.name;
  assert.equal(at('gk'), 'Keeper');
  assert.equal(at('r0c0'), 'Left Back'); assert.equal(at('r0c3'), 'Right Back');
  assert.equal(at('r2c0'), 'Left Winger'); assert.equal(at('r2c1'), 'Striker'); assert.equal(at('r2c2'), 'Right Winger');
  assert.equal(xi.slots.length, 11); assert.equal(new Set(xi.slots.map((s) => s.player?.id)).size, 11);
});

test('another shape re-uses the same players sensibly (4-2-3-1: two holders, three behind the striker)', () => {
  const xi = buildXI(POOL, '4-2-3-1');
  const mids = xi.slots.filter((s) => s.sector === 'm').map((s) => s.player!.sector);
  assert.equal(xi.slots.filter((s) => s.row === 1).length, 2);
  assert.ok(xi.slots.find((s) => s.sector === 'f')!.player!.name === 'Striker');
  assert.equal(mids.length, 5);
  assert.equal(xi.slots.find((s) => s.row === 1 && s.x < 50)!.player!.sector, 'm');   // a midfielder, not a winger, holds the pivot
});

test('a goalkeeper never plays outfield and the bench is the next-best players', () => {
  const xi = buildXI(POOL, '4-3-3');
  assert.ok(xi.slots.filter((s) => s.sector !== 'g').every((s) => s.player!.sector !== 'g'));
  assert.ok(xi.bench.some((b) => b.name === 'Backup Keeper'));
  assert.ok(xi.bench.length <= 9);
  assert.ok(xi.bench.every((b) => !xi.slots.some((s) => s.player?.id === b.id)));
});

test('too few players: real players are placed, the rest stay empty', () => {
  const xi = buildXI(POOL.slice(0, 7), '4-4-2');
  assert.equal(xi.slots.filter((s) => s.player).length, 7); assert.equal(xi.slots.filter((s) => !s.player).length, 4);
});

test('no match history: the squad list alone still fills a 4-3-3 by position', () => {
  const squad = [
    ...['GK1', 'GK2'].map((n, i) => ({ id: 100 + i, name: n, position: 'Goalkeeper' })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: 200 + i, name: `D${i}`, position: 'Centre-Back' })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: 300 + i, name: `M${i}`, position: 'Central Midfield' })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 400 + i, name: `F${i}`, position: 'Left Winger' })),
  ];
  const xi = buildXI(poolFromSquad(squad), DEFAULT_FORMATION);
  assert.equal(xi.slots.filter((s) => s.player).length, 11);
  assert.equal(xi.slots[0].player!.name, 'GK1');
  assert.equal(sectorOfPosition('Right Winger'), 'f'); assert.equal(sectorOfPosition('Defensive Midfield'), 'm'); assert.equal(sectorOfPosition(''), null);
});
