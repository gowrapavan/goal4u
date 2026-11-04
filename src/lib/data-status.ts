/**
 * Whether the data service is giving trouble, as the browser sees it through /api/data. Read by the banner in the layout, written by getJSON().
 *   'auth'         the server says the data service refused its token (503, code data_auth) — the site owner must check the data token configured on the server
 *   'unavailable'  502 / 504 / network error, after one retry
 *   null           fine (any successful answer clears it)
 */
export type DataProblem = 'auth' | 'unavailable' | null;
let current: DataProblem = null;
const subs = new Set<() => void>();
export const getDataProblem = (): DataProblem => current;
export const subscribeDataProblem = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export function setDataProblem(p: DataProblem): void { if (p === current) return; current = p; subs.forEach((f) => f()); }
