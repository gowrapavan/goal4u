import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A hook called after an early return changes the hook count between renders and crashes the page ("Something went wrong").
test('MatchDetail: every hook is called before the first early return', () => {
  const src = readFileSync(new URL('../pages/MatchDetail.tsx', import.meta.url), 'utf8');
  const firstReturn = src.indexOf('if (b.loading) return');
  assert.ok(firstReturn > 0);
  const after = src.slice(firstReturn);
  const late = after.match(/\b(use(?:State|Effect|Memo|Callback|Ref|Async|CrestColors|TeamColors|CenterActive))\(/g);
  assert.equal(late, null, `hooks after the early return: ${late}`);
});
