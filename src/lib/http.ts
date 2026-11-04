import { setDataProblem } from './data-status';

const pause = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
/** Answers worth asking again: busy (429), server trouble (500, 502, 503, 504). 404 and other client errors are final. */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
/**
 * Every /api call of the app. A 429/500/502/503/504 or a network error is tried again up to 4 times with growing pauses (the data service may be waking from sleep, which takes 30-50 s on a free host);
 * a refused token (503 + code data_auth, or a 401) is NOT retried: it is reported once ("check the data token") and the friendly banner appears.
 * A 404 is thrown as before. Nothing here ever shows or logs the token.
 */
export async function getJSON(url: string, retryDelayMs = 1500, attempts = 4) {
  let r: Response | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { r = await fetch(url); } catch { r = undefined; }
    if (r && !RETRY_STATUS.has(r.status)) break;
    if (r && (r.status === 401 || r.status === 503)) {                       // a refused token will not get better by asking again
      const body = await r.clone().json().catch(() => null);
      if (r.status === 401 || body?.code === 'data_auth') break;
    }
    if (attempt < attempts - 1) {
      const ra = Number(r?.headers.get('retry-after'));
      await pause(ra > 0 ? Math.min(ra * 1000, 8000) : Math.min(retryDelayMs * 2 ** attempt, 8000));
    }
  }
  if (!r) { setDataProblem('unavailable'); throw new Error(`network error ${url}`); }
  if (r.status === 503 || r.status === 401) {
    const body = await r.clone().json().catch(() => null);
    if (r.status === 401 || body?.code === 'data_auth') {
      setDataProblem('auth');
      console.error('[goal4u] data service unavailable: check the data token');
      throw new Error(`503 ${url}`);
    }
  }
  if (r.status === 502 || r.status === 503 || r.status === 504) { setDataProblem('unavailable'); throw new Error(`${r.status} ${url}`); }
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  setDataProblem(null);
  return r.json();
}
