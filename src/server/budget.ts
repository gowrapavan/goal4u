/**
 * Waits for `work` at most `ms`; after that the answer is `fallback()` and `work` keeps running in the background (so the caches it fills help the next request).
 * A failure of `work` also gives the fallback. Used where a slow extra (live scores, thumbnail checks) must not hold up a page.
 */
export async function withBudget<T>(work: Promise<T>, ms: number, fallback: () => T | Promise<T>): Promise<T> {
  work.catch(() => { /* stays quiet if it fails after the budget */ });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((res) => { timer = setTimeout(() => res('late'), ms); });
  try {
    const r = await Promise.race([work.then((v) => ({ v })), late]);
    return r === 'late' ? await fallback() : (r as { v: T }).v;
  } catch { return await fallback(); } finally { if (timer) clearTimeout(timer); }
}
