/**
 * Normalised SEO data layer: turns the cached GitHub JSON (competitions, matches, teams) into validated records and
 * decides which pages deserve to be indexed. Pure functions — it never mutates the source data and never touches the network.
 */
import { COMPS, compByCode } from '../lib/competitions';
import { competitionPath, matchPath, teamPath } from '../lib/routes';

export interface SeoConfig {
  /** Match statuses that are indexable. CANCELLED / POSTPONED are left out: their date is not stable. */
  matchStatuses: ReadonlySet<string>;
  /** Static pages that exist as real, non-redirecting routes. */
  staticPaths: readonly string[];
  /** Player pages depend on live Transfermarkt look-ups that cannot be verified from the cache, so they are opt-in. */
  includePlayers: boolean;
}
export const DEFAULT_SEO_CONFIG: SeoConfig = {
  matchStatuses: new Set(['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE', 'FINISHED', 'AWARDED', 'SUSPENDED']),
  staticPaths: ['/', '/matches', '/news', '/watch', '/about', '/contact', '/privacy', '/terms'],
  includePlayers: false,
};

/** What the cache holds, keyed by competition code. */
export interface SeoSource {
  competitions: any[];
  matches: Record<string, any[]>;
  teams: Record<string, any[]>;
}
export interface SeoTeamRef { id: number; name: string; tla?: string; crest?: string }
export interface SeoMatch {
  id: number; code: string; path: string; utcDate: string; status: string; matchday: number | null; stage?: string;
  home: SeoTeamRef; away: SeoTeamRef; score: { home: number; away: number } | null; lastmod?: string;
}
export interface SeoCompetition { code: string; slug: string; name: string; country: string; path: string }
export interface SeoTeam { id: number; name: string; code: string; path: string; crest?: string; tla?: string }
export interface SeoIndex {
  competitions: SeoCompetition[]; matches: SeoMatch[]; teams: SeoTeam[];
  matchById: Map<number, SeoMatch>; teamById: Map<number, SeoTeam>;
  /** Why records were left out — handy for logs and tests. */
  skipped: Record<string, number>;
}

const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const PLACEHOLDER = /^(tbd|tba|to be (determined|announced)|winner|loser|unknown)\b/i;
const isoOrUndef = (v: unknown) => { if (!str(v)) return undefined; const d = new Date(v); return isNaN(+d) ? undefined : d.toISOString(); };
const goals = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

function teamRef(t: any): SeoTeamRef | null {
  if (!t || !posInt(t.id) || !str(t.name) || PLACEHOLDER.test(t.name.trim())) return null;
  return { id: t.id, name: t.name.trim(), tla: str(t.tla) ? t.tla.trim() : undefined, crest: str(t.crest) ? t.crest : undefined };
}

/** Validate ONE raw match record and normalise it. Returns null when it cannot back a real page. Status is NOT filtered here. */
export function normalizeMatch(m: any, code: string): { match?: SeoMatch; reason?: string } {
  if (!m || !posInt(m.id)) return { reason: 'match: invalid id' };
  const home = teamRef(m.homeTeam), away = teamRef(m.awayTeam);
  if (!home || !away) return { reason: 'match: teams not decided yet' };
  if (home.id === away.id) return { reason: 'match: same team on both sides' };
  const date = isoOrUndef(m.utcDate);
  if (!date) return { reason: 'match: invalid date' };
  const ft = m.score?.fullTime; const h = goals(ft?.home), a = goals(ft?.away);
  return { match: {
    id: m.id, code, path: matchPath({ id: m.id, code }), utcDate: date, status: str(m.status) ? m.status.trim().toUpperCase() : '',
    matchday: posInt(m.matchday) ? m.matchday : null, stage: str(m.stage) ? m.stage : undefined,
    home, away, score: h !== null && a !== null ? { home: h, away: a } : null, lastmod: isoOrUndef(m.lastUpdated),
  } };
}

export function buildSeoIndex(src: SeoSource, cfg: SeoConfig = DEFAULT_SEO_CONFIG): SeoIndex {
  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] || 0) + 1; };

  // ── matches: validate every record, de-duplicate by id (keep the most recently updated copy)
  const byId = new Map<number, SeoMatch>();
  for (const comp of COMPS) {
    for (const m of src.matches[comp.code] || []) {
      const { match: rec, reason } = normalizeMatch(m, comp.code);
      if (!rec) { skip(reason!); continue; }
      if (!cfg.matchStatuses.has(rec.status)) { skip(`match: status ${rec.status || 'missing'} not indexable`); continue; }
      const prev = byId.get(rec.id);
      if (prev) { skip('match: duplicate id'); if ((rec.lastmod || '') > (prev.lastmod || '')) byId.set(rec.id, rec); continue; }
      byId.set(rec.id, rec);
    }
  }
  const matches = [...byId.values()].sort((x, y) => x.id - y.id);          // deterministic order

  // ── teams: one page per club id; a club's domestic league wins over the Champions League
  const teamMap = new Map<number, SeoTeam>();
  const order = [...COMPS].sort((x, y) => Number(!!x.cup) - Number(!!y.cup));
  for (const comp of order) {
    for (const t of src.teams[comp.code] || []) {
      const ref = teamRef(t); if (!ref) { skip('team: invalid'); continue; }
      if (teamMap.has(ref.id)) continue;
      teamMap.set(ref.id, { id: ref.id, name: ref.name, code: comp.code, path: teamPath(comp.code, ref.id), crest: ref.crest, tla: ref.tla });
    }
  }
  const teams = [...teamMap.values()].sort((x, y) => x.id - y.id);

  // ── competitions: must have a real route (COMPS) and real data behind it
  const known = new Set((src.competitions || []).map((c) => c?.code).filter(str));
  const competitions: SeoCompetition[] = [];
  for (const comp of COMPS) {
    const hasData = known.has(comp.code) || (src.matches[comp.code] || []).length > 0 || (src.teams[comp.code] || []).length > 0;
    if (!hasData) { skip(`competition: ${comp.code} has no data`); continue; }
    competitions.push({ code: comp.code, slug: comp.slug, name: comp.name, country: comp.country, path: competitionPath(comp.code)! });
  }
  return { competitions, matches, teams, matchById: new Map(matches.map((m) => [m.id, m])), teamById: teamMap, skipped };
}

/** True when the cache demonstrably holds data, so absence of a record really means "does not exist". */
export function dataIsReady(src: SeoSource): boolean {
  const withMatches = COMPS.filter((c) => (src.matches[c.code] || []).length > 0).length;
  return (src.competitions || []).length > 0 && withMatches >= Math.ceil(COMPS.length / 2);
}

/** Compact, JSON-safe form of the index (Maps are rebuilt on load). Shipped to the Netlify function as /_seo/index.json. */
export interface SeoIndexJson { v: 1; builtAt: string; /** production origin the build used */ origin?: string; /** Netlify CONTEXT at build time */ context?: string; competitions: SeoCompetition[]; matches: SeoMatch[]; teams: SeoTeam[]; skipped: Record<string, number> }
export const serializeIndex = (i: SeoIndex, builtAt = new Date().toISOString()): SeoIndexJson => ({ v: 1, builtAt, competitions: i.competitions, matches: i.matches, teams: i.teams, skipped: i.skipped });
export function hydrateIndex(j: SeoIndexJson): SeoIndex {
  if (!j || j.v !== 1 || !Array.isArray(j.matches) || !Array.isArray(j.teams) || !Array.isArray(j.competitions)) throw new Error('Unsupported SEO index format');
  return { competitions: j.competitions, matches: j.matches, teams: j.teams, skipped: j.skipped || {}, matchById: new Map(j.matches.map((m) => [m.id, m])), teamById: new Map(j.teams.map((t) => [t.id, t])) };
}

export { compByCode };
