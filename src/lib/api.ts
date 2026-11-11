import { publicUrl } from './public-files';
import { feedKey } from './feed-key';
import { getJSON } from './http';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchStandings, fetchScorers, fetchTeams, fetchTMTeamInfo, fetchTMPlayerInfo,
  fetchH2HAnalytics, fetchForecast, fetchTMLeagueInfo,
} from '../services/api';
import type { MatchIntel } from '../server/match-intel';
import type { StatPair, AssociationState, EventsState } from '../server/legacy-stats-validation';

export type { MatchIntel, StatPair };

export { fetchStandings, fetchScorers, fetchTeams, fetchTMTeamInfo, fetchTMPlayerInfo, fetchH2HAnalytics, fetchForecast, fetchTMLeagueInfo };

/* ─────────────── Competition catalog (shared with the server: src/lib/competitions.ts) ─────────────── */
import { COMPS, TOURNAMENTS, compByCode, compBySlug } from './competitions';
import { matchPath, teamPath } from './routes';
import type { Comp } from './competitions';
export { COMPS, TOURNAMENTS, compByCode, compBySlug };
export type { Comp };

/* ─────────────── Types ─────────────── */
export type FTeam = { id: number; name: string; shortName: string | null; tla: string | null; crest: string };
export type FMatch = {
  id: number; code: string; seasonSlug?: string; competition: { name?: string; emblem?: string; type?: string };
  utcDate: string; status: string; minute: number | null; matchday: number | null; stage?: string; group?: string | null;
  homeTeam: FTeam; awayTeam: FTeam;
  /** Set by the server when it asked the live source about this fixture ('koora' = confirmed there, 'not_started' = live source says not begun). */
  liveCheck?: 'koora' | 'not_started' | 'unverified' | null;
  score?: { winner?: string | null; duration?: string; fullTime?: { home: number | null; away: number | null }; halfTime?: { home: number | null; away: number | null }; penalties?: { home: number | null; away: number | null } };
};
export type Video = { videoId: string; title: string; channelName: string; uploadDate: string; thumbnail?: string; embedUrl?: string; channelLogo?: string };

/* ─────────────── Fetch + tiny cache ─────────────── */
const mem = new Map<string, { t: number; p: Promise<any> }>();
export function cached<T>(key: string, fn: () => Promise<T>, ttl = 45_000): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = fn().catch((e) => { mem.delete(key); throw e; });
  mem.set(key, { t: Date.now(), p });
  return p;
}
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function getFeed(opts: { from?: string; to?: string; codes?: string[]; season?: string } = {}): Promise<FMatch[]> {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  if (opts.codes?.length) q.set('codes', opts.codes.join(','));
  if (opts.season) q.set('season', opts.season);
  const url = `/api/data/feed?${q}`;
  const want = feedKey(opts.codes, opts.from, opts.to, opts.season);
  return cached(url, async () => {
    let r = await getJSON(url);
    // The answer says which request it belongs to. A different one means a shared cache gave us someone else's copy: ask again under a unique address.
    if (typeof r?.key === 'string' && r.key !== want) r = await getJSON(`${url}${q.toString() ? '&' : ''}_r=${Date.now().toString(36)}`);
    return r.matches as FMatch[];
  });
}
export type StatsStatus = {
  state: AssociationState; reasons: string[]; source: string; droppedStats: string[];
  events: { state: EventsState; reason: string | null; note: string | null };
};
/** Where a match page's numbers come from: live feed, the stats.json written by workers/stats365.py, the legacy backup, or nothing. */
import type { DetailsResponse } from './match-details-types';
export type StatsSource = 'live' | 'stats365' | 'legacy' | 'none';
export type LiveInfo = { available: true; status: 'live' | 'half time' | 'full time'; minute: number | null; score: { home: number | null; away: number | null; ht_home: number | null; ht_away: number | null }; statsDerived: boolean; fetchedAt: string };
export type MoreStatRow = { key: string; name: string; home: string; away: string; hn: number; an: number };
/** The statistics half of /api/data/match/:id (also what /match/:id/live returns while polling). */
export type StatsPart = {
  stats: { stats: Record<string, { home: string; away: string; hn: number; an: number }> | null; moreStats?: MoreStatRow[]; events: any[] | null; lineups: { home: any; away: any } | null; source: string; asOf?: string | null } | null;
  statsStatus: StatsStatus; statsSource: StatsSource; live: LiveInfo | null; liveEligible: boolean; liveReason?: string | null;
};
/** Always fresh (no client cache): polled every ~20 s while a match is in play. */
export const getMatchLive = (id: string, c?: string, season?: string): Promise<StatsPart> => {
  const q = new URLSearchParams(); if (c) q.set('c', c); if (season) q.set('season', season);
  return getJSON(`/api/data/match/${id}/live?${q}`);
};
/** Line-ups, shot map, top performers ... (English only). Pass `fresh` while a match is in play. */
export const getMatchDetails = (id: string, c?: string, season?: string, fresh = false): Promise<DetailsResponse> => {
  const q = new URLSearchParams(); if (c) q.set('c', c); if (season) q.set('season', season);
  const url = `/api/data/match/${id}/details?${q}`;
  return fresh ? getJSON(url) : cached(url, () => getJSON(url), 60_000);
};
export const getMatchBundle = (id: string, c?: string, season?: string) => {
  const q = new URLSearchParams(); if (c) q.set('c', c); if (season) q.set('season', season);
  const url = `/api/data/match/${id}?${q}`;
  return cached(url, () => getJSON(url), 20_000);
};
/** Pre-match context (table, form, season record, head-to-head, facts) — derived from matches.json only. */
export const getMatchIntel = (id: string, c?: string, season?: string): Promise<MatchIntel> => {
  const q = new URLSearchParams(); if (c) q.set('c', c); if (season) q.set('season', season);
  const url = `/api/data/match/${id}/intel?${q}`;
  return cached(url, () => getJSON(url), 45_000);
};
const decode = (s = '') => { if (typeof document === 'undefined') return s; const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
const clean = (v: Video): Video => ({ ...v, title: decode(v.title), channelName: decode(v.channelName) });
export const getVideos = (limit = 48): Promise<Video[]> => cached(`v${limit}`, async () => (await getJSON(`/api/data/videos?limit=${limit}&kind=video`)).map(clean), 300_000);
export const getShorts = (limit = 40): Promise<Video[]> => cached(`s${limit}`, async () => (await getJSON(`/api/data/shorts?limit=${limit}`)).map(clean), 300_000);
export type NewsResult = { articles: any[]; error: string | null };
/** Never throws: returns the server's reason (e.g. missing key, NewsAPI rejection) so the page can explain it. */
export const getNews = (): Promise<NewsResult> => cached('news', async (): Promise<NewsResult> => {
  try {
    const r = await fetch('/api/news?page=1');
    const j = await r.json().catch(() => null);
    if (!r.ok) return { articles: [], error: j?.error || j?.message || `The news service returned HTTP ${r.status}.` };
    if (j?.status === 'error') return { articles: [], error: j.message || 'NewsAPI returned an error.' };
    return { articles: j?.articles || [], error: null };
  } catch { return { articles: [], error: 'Could not reach the news service.' }; }
}, 300_000);

export async function getTables(code: string, season?: string) {
  const raw = await cached(`tbl-${code}-${season}`, () => fetchStandings(code, season));
  // services/api.ts fetchWithRetry unwraps `.standings` into a bare array — accept both shapes
  const sets: any[] = Array.isArray(raw) ? raw : raw?.standings || [];
  return sets.filter((s) => s.type === 'TOTAL').map((s) => ({ stage: s.stage as string, group: s.group as string | null, table: s.table as any[] }));
}
export const getScorers = async (code: string, season?: string): Promise<any[]> =>
{
  const raw = await cached(`sc-${code}-${season}`, () => fetchScorers(code, season));
  return Array.isArray(raw) ? raw : raw?.scorers || [];
};

/* ─────────────── Match helpers ─────────────── */
export { phase, isLive, isOpen, uniqueMatches } from './match-state';
export type { Phase } from './match-state';
import { uniqueMatches as _unique } from './match-state';

/** All of one team's matches across the given competitions, de-duplicated, oldest first. */
export async function getTeamMatches(teamId: number, codes: string[], season?: string): Promise<FMatch[]> {
  const all = await getFeed({ codes, season });
  return _unique(all.filter((m) => m.homeTeam?.id === teamId || m.awayTeam?.id === teamId)).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

/* ─────────────── League artwork (drop files into public/images/) ───────────────
   Team header : {league}-header.png            e.g. premier-league-header.png
   Match banner: match-stadium-{league}-bg.png  e.g. match-stadium-la-liga-bg.png
   {league} is the competition slug (see COMPS). The league-code form (pl, pd, sa, bl1, fl1, cl) is also tried.
   Layers fall back in order, so a missing file just shows the next one (or the gradient). */
export const IMG_DIR = '/images';
export const DEFAULT_STADIUM = `${IMG_DIR}/match-stadium-bg.webp`;
export const VS_IMAGE = `${IMG_DIR}/vs.png`;
/** Only artwork that really exists is requested (the build lists public/images): a missing file is a wasted request, and on Netlify a 404 is a function call. */
const art = (file: string) => publicUrl(`images/${file}`);
export function leagueHeaderBg(code?: string): string {
  const c = compByCode(code); const names = [c?.slug, code?.toLowerCase()].filter(Boolean) as string[];
  return [...new Set(names)].map((n) => art(`${n}-header.png`)).filter((u): u is string => !!u).map((u) => `url('${u}')`).join(', ');
}
export function stadiumBg(code?: string): string {
  const c = compByCode(code); const names = [c?.slug, code?.toLowerCase()].filter(Boolean) as string[];
  const layers = [...new Set(names)].map((n) => art(`match-stadium-${n}-bg.png`)).filter((u): u is string => !!u);
  layers.push(art('match-stadium-bg.webp') ?? DEFAULT_STADIUM);
  return layers.map((u) => `url('${u}')`).join(', ');
}

/* ─────────────── Transfermarkt league intelligence (euros) ───────────────
   Uses the EXISTING /api/data/league-info/:code/:type service (fetchTMLeagueInfo):
     metadata            → league_metadata.json      (league facts + most_valuable_player)
     market-values       → market_values.json         (top players by value)
     successful-players  → successful_players.json    (most decorated: all-time league titles)
   Values arrive in ₹ Crore and are normalised to euros by src/server/market-value.ts. */
import { normaliseValues, mergeValues, normaliseMeta, normaliseDecorated } from '../server/market-value';
import type { ValuedPlayer as _VP, LeagueMeta as _LM, DecoratedPlayer as _DP } from '../server/market-value';
export type ValuedPlayer = _VP; export type LeagueMeta = _LM; export type DecoratedPlayer = _DP;
export const VALUE_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1'];

// No .catch here: a failed request must throw so cached() forgets it. Swallowing it as [] made one hiccup "No market values" for 10 minutes.
const leagueValues = (code: string) => cached(`lv-${code}`, async () => normaliseValues(await fetchTMLeagueInfo(code, 'market-values'), code), 600_000);

/** Top players by market value for one league, or across the top five leagues with code = 'all'. */
export const getMarketValues = (code: string = 'all', limit = 10): Promise<ValuedPlayer[]> =>
  cached(`mv-${code}-${limit}`, async () => {
    if (code !== 'all') return VALUE_CODES.includes(code) ? (await leagueValues(code)).slice(0, limit) : [];
    const parts = await Promise.allSettled(VALUE_CODES.map(leagueValues));     // one league failing must not hide the others
    const ok = parts.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []));
    if (!ok.length) throw new Error('market values unavailable');
    return mergeValues(ok).slice(0, limit);
  }, 600_000);

/** League facts + the league's most valuable player (club/position joined from the market-values list). */
export type LeagueIntel = LeagueMeta & { mvpClub?: string | null; mvpPosition?: string | null; mvpTeamId?: number | null };
export const getLeagueMeta = (code: string): Promise<LeagueIntel | null> =>
  cached(`lm-${code}`, async () => {
    if (!VALUE_CODES.includes(code)) return null;
    const meta = normaliseMeta(await fetchTMLeagueInfo(code, 'metadata'));
    if (!meta) return null;
    const row = meta.mvp ? (await leagueValues(code).catch(() => [] as ValuedPlayer[])).find((p) => (meta.mvp!.tmId && p.tmId === meta.mvp!.tmId) || p.name === meta.mvp!.name) : null;
    return { ...meta, mvpClub: row?.club ?? null, mvpPosition: row?.position ?? null, mvpTeamId: row?.teamId ?? null };
  }, 600_000);

/** Most decorated players: all-time league titles (successful_players.json). */
export const getDecorated = (code: string): Promise<DecoratedPlayer[]> =>
  cached(`dp-${code}`, async () => (VALUE_CODES.includes(code) ? normaliseDecorated(await fetchTMLeagueInfo(code, 'successful-players')) : []), 3_600_000);

export const scoreOf = (m: FMatch) => ({ h: m.score?.fullTime?.home ?? null, a: m.score?.fullTime?.away ?? null });
export const hasScore = (m: FMatch) => { const s = scoreOf(m); return s.h !== null && s.a !== null; };
/** Season-aware link: matches from an earlier season keep their season in the URL; current-season links are unchanged. */
export const matchHref = (m: Pick<FMatch, 'id' | 'code'> & { seasonSlug?: string }) => matchPath(m);
export const teamHref = (code: string, id: number | string) => teamPath(code, id);
export const winnerOf = (m: FMatch): 'h' | 'a' | null => (m.score?.winner === 'HOME_TEAM' ? 'h' : m.score?.winner === 'AWAY_TEAM' ? 'a' : null);

const rtf = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
export const kickoff = (iso: string) => rtf?.format(new Date(iso)) ?? iso.slice(11, 16);
export function dayLabel(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Math.round((new Date(ymd(d)).getTime() - new Date(ymd(new Date())).getTime()) / 86400000);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
export const timeAgo = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return shortDate(iso);
};
export const tn = (t?: FTeam | null) => t?.shortName || t?.name || '—';

/** group matches by local calendar day */
export function groupByDay(ms: FMatch[]) {
  const map = new Map<string, FMatch[]>();
  for (const m of ms) { const k = ymd(new Date(m.utcDate)); (map.get(k) || map.set(k, []).get(k)!).push(m); }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
/** group matches by competition, ordered by catalog */
export function groupByComp(ms: FMatch[]) {
  const map = new Map<string, FMatch[]>();
  for (const m of ms) (map.get(m.code) || map.set(m.code, []).get(m.code)!).push(m);
  return [...map.entries()].sort(([a], [b]) => COMPS.findIndex((c) => c.code === a) - COMPS.findIndex((c) => c.code === b));
}

/* ─────────────── Hook ─────────────── */
/**
 * Runs `fn` and keeps trying for you. A failed request is NOT shown as an error straight away: the page keeps its loading skeleton while the
 * request is repeated (6 more tries, growing pauses, about 50 s in all, which covers a data service that is waking up). Only then does `error`
 * become true, and even then it asks again quietly every 20 s (up to 6 times) while the tab is open. "Not found" answers (404 / 400) are final.
 * `retry()` asks again at once; coming back online asks again for whatever failed.
 */
export const AUTO_RETRIES = 6;
const statusOf = (e: any) => Number(/^(\d{3})\b/.exec(String(e?.message ?? ''))?.[1]) || 0;
export function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
  const [s, set] = useState<{ data: T | null; loading: boolean; error: boolean; status?: number }>({ data: null, loading: true, error: false });
  const [attempt, setAttempt] = useState(0);
  const key = useRef('');
  const failed = useRef(false);
  const quiet = useRef(0);                         // quiet re-asks done after the automatic tries ran out
  failed.current = s.error;
  useEffect(() => {
    let live = true;
    // Same request as last time (a retry, not new inputs): if it fails again, what was already loaded stays on screen.
    let k = ''; try { k = JSON.stringify(deps); } catch { /* not serialisable: treated as new inputs */ }
    const again = k !== '' && k === key.current; key.current = k;
    if (!again) quiet.current = 0;
    set((p) => ({ ...p, loading: true, error: false }));
    (async () => {
      let pause = 1500;
      for (let i = 0; ; i++) {
        try { return await fn(); }
        catch (e) {
          const st = statusOf(e);
          if (!live || st === 404 || st === 400 || i >= AUTO_RETRIES) throw e;
          await new Promise((r) => setTimeout(r, pause)); pause = Math.min(pause * 1.8, 12_000);
          if (!live) throw e;
        }
      }
    })().then((data) => { if (live) { quiet.current = 0; set({ data, loading: false, error: false }); } })
      .catch((e) => live && set((p) => ({ data: again ? p.data : null, loading: false, error: true, status: statusOf(e) })));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  // The automatic tries ran out: keep asking quietly in the background (the error card has a Try again button as well).
  useEffect(() => {
    if (!s.error || s.status === 404 || s.status === 400 || quiet.current >= 6) return undefined;
    const t = setTimeout(() => { if (!document.hidden) { quiet.current += 1; setAttempt((n) => n + 1); } }, 20_000);
    return () => clearTimeout(t);
  }, [s.error, s.status, attempt]);
  // The browser is back online: ask again, once, for whatever failed while it was offline.
  useEffect(() => {
    const back = () => { if (failed.current) setAttempt((n) => n + 1); };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);
  const retry = useCallback(() => { quiet.current = 0; setAttempt((n) => n + 1); }, []);
  return useMemo(() => ({ ...s, retry }), [s, retry]);
}

export interface PlayerSeason {
  id: number; season: string; role: string | null; club: { id: number; name: string; crest: string | null; code: string } | null;
  totals: { apps: number; starts: number; minutes: number; goals: number; assists: number; yellow: number; red: number; xg: number; shots: number; avgRating: number | null };
  matches: { matchId: number; code: string; date: string; venue: 'H' | 'A'; started: boolean; team: { id: number; name: string; crest: string | null }; opp: { id: number; name: string; crest: string | null }; gf: number | null; ga: number | null; status: string; rating: number | null; minutes: number | null; goals: number; assists: number; yellow: number; red: number }[];
}
export interface RelatedPlayer { id: number; name: string; position: string | null; nationality?: string | null; valueEur: number | null; valueLabel: string | null; alsoNational?: boolean }
export interface RelatedGroup { key: 'club' | 'national'; title: string; teamId: number | null; teamName: string | null; players: RelatedPlayer[] }
/** Club teammates + national-team players of a player (server: related-players.ts). `clubId` is a hint that saves the server a lookup. */
export const getPlayerRelated = (id: string | number, clubId?: number | null): Promise<{ groups: RelatedGroup[] }> =>
  cached(`pr${id}-${clubId ?? ''}`, () => getJSON(`/api/data/player-related/${id}${clubId ? `?club=${clubId}` : ''}`), 300_000);
export interface TeamFormation {
  matches: number; formation: string | null;
  usage: { formation: string; count: number; share: number; last: number }[];
  sectors: { defence: { value: number; count: number; share: number } | null; midfield: { value: number; count: number; share: number } | null; attack: { value: number; count: number; share: number } | null };
  pool: import('./formation').PoolPlayer[];
}
/** A team's favourite formation and player pool from its previous line-ups (server: team-formation.ts). */
export const getTeamFormation = (teamId: number | string): Promise<TeamFormation> => cached(`tf${teamId}`, () => getJSON(`/api/data/team-formation/${teamId}`), 600_000);
/** This season's appearances of a player, from the stats.json files (rating, minutes, goals, assists, cards). */
export const getPlayerSeason = (id: string | number): Promise<PlayerSeason> => cached(`ps${id}`, () => getJSON(`/api/data/player-matches/${id}`), 60_000);
