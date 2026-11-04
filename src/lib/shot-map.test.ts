import test from 'node:test';
import assert from 'node:assert/strict';
import { shotXY, markerRadius, starPoints, filterShots, onTarget, VIEW_W, VIEW_H } from './shot-map.ts';

test('a shot at the goal line is at the top, a shot from the edge of the box is about 16 m down', () => {
  assert.ok(shotXY({ x: 100, y: 50 }).y <= 2);
  const edge = shotXY({ x: 100 - (16.5 / 105) * 100, y: 50 });
  assert.ok(Math.abs(edge.y - 16.5) < 0.2);
  assert.equal(shotXY({ x: 100, y: 0 }).x, 2); assert.equal(shotXY({ x: 100, y: 100 }).x, VIEW_W - 2);   // never off the pitch
  assert.equal(shotXY({ x: 100, y: 50 }).x, VIEW_W / 2);
});
test('a long shot is pinned to the bottom edge and flagged far', () => {
  const far = shotXY({ x: 45, y: 30 });
  assert.equal(far.far, true); assert.equal(far.y, VIEW_H - 2);
  assert.equal(shotXY({ x: 90, y: 30 }).far, false);
});
test('marker size grows with xG but stays sane', () => {
  assert.ok(markerRadius(0.78) > markerRadius(0.05)); assert.ok(markerRadius(0) > 1); assert.ok(markerRadius(0.78) < 6); assert.ok(markerRadius(-1) > 0);
});
test('a star has ten points', () => { assert.equal(starPoints(10, 10, 3).split(' ').length, 10); });
test('filters: goals, on target (goal, saved, post), missed (everything else)', () => {
  const s = ['goal', 'saved', 'post', 'off', 'blocked'].map((outcome) => ({ outcome }));
  assert.equal(filterShots(s, 'all').length, 5);
  assert.deepEqual(filterShots(s, 'goals').map((x) => x.outcome), ['goal']);
  assert.deepEqual(filterShots(s, 'target').map((x) => x.outcome), ['goal', 'saved', 'post']);
  assert.deepEqual(filterShots(s, 'missed').map((x) => x.outcome), ['off', 'blocked']);
  assert.equal(onTarget('blocked'), false);
});
