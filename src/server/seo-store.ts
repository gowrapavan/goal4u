import { COMPS } from '../lib/competitions';
import { getCachedCompetitions, getCachedMatches, getCachedTeams } from './data-cache';
import { buildSeoIndex, dataIsReady, DEFAULT_SEO_CONFIG, SeoConfig, SeoIndex, SeoSource } from './seo-data';

/** Snapshot of what the in-memory GitHub cache holds right now (read-only — records are never modified). */
export function loadSourceFromCache(): SeoSource {
  const matches: Record<string, any[]> = {}, teams: Record<string, any[]> = {};
  for (const c of COMPS) { matches[c.code] = getCachedMatches(c.code); teams[c.code] = getCachedTeams(c.code); }
  return { competitions: getCachedCompetitions(), matches, teams };
}

export interface SeoSnapshot { index: SeoIndex; ready: boolean }
export interface SeoStore { get(): SeoSnapshot }

/** The normalised index is rebuilt at most once per `ttlMs`; a not-yet-ready snapshot is retried on the next call. */
export function createSeoStore(getSource: () => SeoSource = loadSourceFromCache, cfg: SeoConfig = DEFAULT_SEO_CONFIG, ttlMs = 5 * 60_000, now: () => number = Date.now): SeoStore {
  let snap: SeoSnapshot | null = null; let at = 0;
  return {
    get() {
      if (snap && (snap.ready ? now() - at < ttlMs : now() - at < 5_000)) return snap;
      const src = getSource();
      snap = { index: buildSeoIndex(src, cfg), ready: dataIsReady(src) }; at = now();
      return snap;
    },
  };
}
