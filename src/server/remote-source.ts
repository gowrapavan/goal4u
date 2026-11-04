/**
 * Reads the football data straight from the GitHub data repo with plain `fetch` — no Express, no in-memory server cache —
 * so the SAME data pipeline can feed Netlify builds and functions. File locations mirror data-cache.ts / data-api.ts.
 */
import { COMPS } from '../lib/competitions';
import { getAutoLeagueSeason } from './season-resolver';
import { loadCompetitions } from './competitions-source';
import type { SeoSource } from './seo-data';

import { DATA_BASE, dataFetch } from './data-source';
export { DATA_BASE };
export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** The default fetcher: the central dataFetch (token header, 401 note). Its own retry is off: the callers below keep their own retry policy (the build waits for a sleeping service; a page request tries once). */
const dataFetchLike: FetchLike = (url, init) => dataFetch(url, { ...init, retry: false }) as any;

/** Files are { _meta, data: [...] } or { data: { matches: [...] } } or a bare array — accept all, like the server does. */
export const unwrapList = (j: any, key: string): any[] => {
  const d = j?.data ?? j; if (Array.isArray(d)) return d;
  return Array.isArray(d?.[key]) ? d[key] : Array.isArray(j?.[key]) ? j[key] : [];
};

/**
 * One JSON file. A timeout, a network error or a 5xx (a sleeping Render service answering 502/503 while it wakes) is retried with a longer
 * wait each time (15 s, 30 s, 45 s), so a cold gowra-api cannot make a build think the data is missing. A 404/400 is an answer: no retry.
 */
async function getJson(url: string, f: FetchLike, ms = 15000, tries = 3): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms * (i + 1));
    try {
      const r = await f(url, { signal: ctl.signal });
      if (r.ok) return await r.json();
      if (r.status === 404 || r.status === 400 || r.status === 401 || r.status === 403) return null;     // an answer (401 = wrong token: retrying cannot help)
    } catch { /* timeout or network error: try again */ } finally { clearTimeout(t); }
  }
  return null;
}

export interface LoadReport { source: SeoSource; season: string; fetched: Record<string, { matches: number; teams: number }>; compsSource: string }

/** One fetch per file per competition (matches.json + teams.json) — never one per match. */
export async function loadSeoSourceRemote(f: FetchLike = dataFetchLike, now: Date = new Date()): Promise<LoadReport> {
  const season = getAutoLeagueSeason(now).seasonStr;
  const { comps, source: compsSource } = await loadCompetitions();
  const matches: Record<string, any[]> = {}, teams: Record<string, any[]> = {}, fetched: LoadReport['fetched'] = {};
  await Promise.all(COMPS.map(async (c) => {
    const root = `${DATA_BASE}/${season}/${c.code}`;
    const [m, t] = await Promise.all([getJson(`${root}/matches.json`, f), getJson(`${root}/teams.json`, f)]);
    matches[c.code] = unwrapList(m, 'matches'); teams[c.code] = unwrapList(t, 'teams');
    fetched[c.code] = { matches: matches[c.code].length, teams: teams[c.code].length };
  }));
  return { source: { competitions: comps, matches, teams }, season, fetched, compsSource };
}

const seasonBack = (n: number, now: Date) => { const y = getAutoLeagueSeason(now).startYear - n; return `${y}-${y + 1}`; };

/** Find ONE match by id (also in older seasons) for URLs the build did not pre-index. Throws when the data source cannot be reached, so callers never mistake an outage for "does not exist". */
export async function lookupMatchRemote(id: string, code: string | undefined, season: string | undefined, f: FetchLike = dataFetchLike, now: Date = new Date()): Promise<{ code: string; match: any } | null> {
  const codes = code && COMPS.some((c) => c.code === code) ? [code] : COMPS.map((c) => c.code);
  const seasons = season ? [season] : code ? [0, 1, 2].map((n) => seasonBack(n, now)) : [seasonBack(0, now)];
  let reached = 0, attempts = 0;
  const jobs = codes.flatMap((c) => seasons.map((s) => ({ c, s })));
  const results = await Promise.all(jobs.map(async ({ c, s }) => {
    attempts++;
    const j = await getJson(`${DATA_BASE}/${s}/${c}/matches.json`, f, 6000, 1);   // a page request must not wait minutes: one quick try
    if (j) reached++;
    const m = unwrapList(j, 'matches').find((x) => String(x?.id) === id);
    return m ? { code: c, match: m } : null;
  }));
  const hit = results.find(Boolean) || null;
  if (!hit && reached === 0 && attempts > 0) throw new Error('match data source unreachable');
  return hit;
}

/* ── one player's record, for the player page's <head> ── */
const playerCache = new Map<string, { t: number; v: any | null }>();
export const _resetPlayerCache = () => playerCache.clear();
/**
 * data/player_information/<id>.json. null = the source says there is no such record (404); an unreachable source THROWS, so the caller can
 * tell "no record" from "could not look". One quick try (a page request must not wait), remembered for 30 minutes.
 */
export async function lookupPlayerRemote(id: string, f: FetchLike = dataFetchLike, now: number = Date.now()): Promise<any | null> {
  if (!/^\d{1,9}$/.test(id)) return null;
  const hit = playerCache.get(id); if (hit && now - hit.t < 30 * 60_000) return hit.v;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await f(`${DATA_BASE}/player_information/${id}.json`, { signal: ctl.signal });
    if (r.status === 404) { playerCache.set(id, { t: now, v: null }); return null; }
    if (!r.ok) throw new Error(`player record: HTTP ${r.status}`);
    const j = await r.json(); const v = j?.data && !j.details ? j.data : j;
    if (playerCache.size >= 500) playerCache.delete(playerCache.keys().next().value as string);
    playerCache.set(id, { t: now, v }); return v;
  } finally { clearTimeout(t); }
}
