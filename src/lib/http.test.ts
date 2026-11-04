import test from 'node:test';
import assert from 'node:assert/strict';
import { getJSON } from './http.ts';
import { getDataProblem, setDataProblem } from './data-status.ts';

const reply = (status: number, body: any = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function stubFetch(...answers: (number | { status: number; body: any } | Error)[]) {
  let n = 0; const real = globalThis.fetch;
  (globalThis as any).fetch = async () => { const a = answers[Math.min(n++, answers.length - 1)]; if (a instanceof Error) throw a; return typeof a === 'number' ? reply(a, { ok: true }) : reply(a.status, a.body); };
  return { calls: () => n, restore: () => { (globalThis as any).fetch = real; } };
}
const quiet = async (fn: () => Promise<void>) => { const e = console.error; const logs: string[] = []; console.error = (...a: any[]) => logs.push(a.join(' ')); try { await fn(); } finally { console.error = e; } return logs; };

test('success clears the notice and returns the JSON', async () => {
  setDataProblem('unavailable'); const s = stubFetch(200);
  try { assert.deepEqual(await getJSON('/api/data/x', 0), { ok: true }); assert.equal(getDataProblem(), null); } finally { s.restore(); }
});
test('502 then 200: one retry and it works', async () => {
  const s = stubFetch(502, 200);
  try { assert.deepEqual(await getJSON('/api/data/x', 0), { ok: true }); assert.equal(s.calls(), 2); } finally { s.restore(); }
});
test('502 / 504 / network error every time: 4 tries, then a thrown error and the "unavailable" notice', async () => {
  for (const answers of [[502], [504], [new TypeError('fetch failed')]] as any[]) {
    setDataProblem(null); const s = stubFetch(...answers);
    try { await assert.rejects(() => getJSON('/api/data/x', 0)); assert.equal(s.calls(), 4); assert.equal(getDataProblem(), 'unavailable'); } finally { s.restore(); }
  }
});
test('429 (too many requests) is asked again, and works when the next answer is fine', async () => {
  const s = stubFetch(429, 500, 200);
  try { assert.deepEqual(await getJSON('/api/data/x', 0), { ok: true }); assert.equal(s.calls(), 3); assert.equal(getDataProblem(), null); } finally { s.restore(); }
});
test('a refused token (503 data_auth, or 401): NO retry, notice "auth", logged as "check the data token"', async () => {
  for (const a of [{ status: 503, body: { error: 'Data service unavailable', code: 'data_auth' } }, { status: 401, body: {} }]) {
    setDataProblem(null); const s = stubFetch(a);
    try { const logs = await quiet(async () => { await assert.rejects(() => getJSON('/api/data/x', 0)); }); assert.equal(s.calls(), 1); assert.equal(getDataProblem(), 'auth'); assert.ok(logs.some((l) => /check the data token/.test(l))); } finally { s.restore(); }
  }
});
test('404 is thrown as before, with no retry and no notice', async () => {
  setDataProblem(null); const s = stubFetch(404);
  try { await assert.rejects(() => getJSON('/api/data/x', 0), /^Error: 404 /); assert.equal(s.calls(), 1); assert.equal(getDataProblem(), null); } finally { s.restore(); }
});
test('a plain 503 (not about the token) counts as unavailable, after no retry loop beyond the rule', async () => {
  setDataProblem(null); const s = stubFetch({ status: 503, body: { error: 'down' } });
  try { await assert.rejects(() => getJSON('/api/data/x', 0)); assert.equal(getDataProblem(), 'unavailable'); } finally { s.restore(); }
});
