import test from 'node:test';
import assert from 'node:assert/strict';
import { dayChip } from './day-chip.ts';

const NOW = new Date(2026, 10, 11, 12, 0).getTime();            // Wednesday 11 Nov 2026, local noon
const at = (m: number, d: number, h = 18) => new Date(2026, m, d, h).toISOString();
const weekday = (m: number, d: number) => new Date(2026, m, d).toLocaleDateString(undefined, { weekday: 'short' });
const date = (m: number, d: number) => new Date(2026, m, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

test('within the next 6 days the weekday is shown', () => {
  assert.equal(dayChip(at(10, 12), NOW), weekday(10, 12));        // tomorrow
  assert.equal(dayChip(at(10, 14), NOW), weekday(10, 14));        // this Saturday
  assert.equal(dayChip(at(10, 17), NOW), weekday(10, 17));        // 6 days ahead
});

test('Saturday 21 Nov, seen on Wednesday 11 Nov, shows the DATE, not "Sat" (which would mean this Saturday)', () => {
  const chip = dayChip(at(10, 21), NOW);
  assert.equal(chip, date(10, 21));
  assert.notEqual(chip, weekday(10, 21));
  assert.equal(dayChip(at(10, 18), NOW), date(10, 18));           // exactly 7 days ahead is already ambiguous
});

test('late-night kick-offs count by the local calendar day, and past days show a date', () => {
  assert.equal(dayChip(new Date(2026, 10, 12, 0, 30).toISOString(), NOW), weekday(10, 12));
  assert.equal(dayChip(at(10, 9), NOW), date(10, 9));
});
