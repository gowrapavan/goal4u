import test from 'node:test';
import assert from 'node:assert/strict';
import { withBudget } from './budget.ts';

const later = <T,>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));
test('fast work: its own answer', async () => { assert.equal(await withBudget(later('real', 5), 200, () => 'fallback'), 'real'); });
test('slow work: the fallback after the budget, and the work still finishes in the background', async () => {
  let finished = false; const work = later('real', 120).then((v) => { finished = true; return v; });
  const t0 = Date.now(); assert.equal(await withBudget(work, 30, () => 'fallback'), 'fallback'); assert.ok(Date.now() - t0 < 100);
  await later(0, 160); assert.equal(finished, true);
});
test('failing work (before or after the budget): the fallback, never an unhandled error', async () => {
  assert.equal(await withBudget(Promise.reject(new Error('x')), 100, () => 'fallback'), 'fallback');
  assert.equal(await withBudget(later(0, 60).then(() => { throw new Error('late'); }), 10, async () => 'fallback'), 'fallback');
  await later(0, 100);
});
