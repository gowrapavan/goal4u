/**
 * Pairs a football-data fixture with its 365scores game WITHOUT needing match_map.json.
 *
 * match_map.json (written by workers/stats365.py) stays the preferred source — it is read first. This is the fallback
 * for fixtures the worker has not mapped yet (or has never run for), so live and recorded statistics work from day one.
 * It is the worker's strict pass, ported: one request per UTC day to the 365scores fixtures endpoint, then
 * BOTH teams must be recognised and the kick-off must agree (±15 min; ±36 h for a rescheduled game). A one-team "weak"
 * guess is never made here: a wrong pairing would put another match's statistics on this page.
 */
import { httpJson, liveStatus, gameScore, type FetchFn, type LiveStatus, type Score } from './koora-live';
import type { MapEntry } from './legacy-stats-validation';

const ALLSCORES = () => process.env.S365_ALLSCORES_URL || 'https://webws.365scores.com/web/games/allscores/';
const MATCH_WINDOW_MIN = 15, LOOSE_WINDOW_H = 36;

/* ───────── names (same normalisation as the worker) ───────── */
const NOISE = /\b(fc|cf|ac|as|ssc|us|afc|calcio|club|de|1913|1899|1909)\b/g;
export const norm = (s: any): string => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(NOISE, ' ').replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string> = { inter: 'internazionale', manunited: 'manchesterunited', manutd: 'manchesterunited', spurs: 'tottenhamhotspur' };
const withAlias = (set: Set<string>) => { for (const n of [...set]) if (ALIAS[n]) set.add(ALIAS[n]); set.delete(''); return set; };
const namesFd = (t: any) => withAlias(new Set([norm(t?.name), norm(t?.shortName), norm(t?.tla)]));
const names365 = (c: any) => withAlias(new Set([norm(c?.name), norm(c?.shortName), norm(c?.nameForURL), norm(c?.symbolicName)]));
/** 1 − (edit distance / longer length): a stand-in for Python's SequenceMatcher ratio, used with the same 0.88 threshold. */
function similarity(a: string, b: string): number {
  if (a === b) return 1; const m = a.length, n = b.length; if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return 1 - prev[n] / Math.max(m, n);
}
export function sameTeam365(fdTeam: any, comp: any): boolean {
  const a = namesFd(fdTeam), b = names365(comp);
  for (const x of a) if (b.has(x)) return true;
  for (const x of a) for (const y of b) if ((x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) || similarity(x, y) >= 0.88) return true;
  return false;
}

/* ───────── one fixture against one day's games ───────── */
const entry = (g: any, fh: any, fa: any, h365: number, a365: number, how: string): MapEntry =>
  ({ s365_id: g.id, fd_home_s365_id: h365, fd_away_s365_id: a365, how, fd_home_id: fh?.id ?? null, fd_away_id: fa?.id ?? null });

export function matchOne(fd: any, games: any[]): MapEntry | null {
  const ko = Date.parse(fd?.utcDate); const fh = fd?.homeTeam ?? {}, fa = fd?.awayTeam ?? {};
  if (!Number.isFinite(ko) || !fh.id || !fa.id) return null;
  const pair = (g: any, how: string): MapEntry | null => {
    const h = g?.homeCompetitor ?? {}, a = g?.awayCompetitor ?? {};
    if (sameTeam365(fh, h) && sameTeam365(fa, a)) return entry(g, fh, fa, h.id, a.id, how);
    if (sameTeam365(fh, a) && sameTeam365(fa, h)) return entry(g, fh, fa, a.id, h.id, `${how}_swapped`);
    return null;
  };
  const dt = (g: any) => { const t = Date.parse(g?.startTime); return Number.isFinite(t) ? Math.abs(t - ko) : Infinity; };
  const sorted = [...games].sort((x, y) => dt(x) - dt(y));
  for (const g of sorted) if (dt(g) <= MATCH_WINDOW_MIN * 60_000) { const e = pair(g, 'auto'); if (e) return e; }
  for (const g of sorted) if (dt(g) <= LOOSE_WINDOW_H * 3_600_000) { const e = pair(g, 'auto_loose'); if (e) return e; }   // rescheduled; the same pair never meets twice within 36 h
  return null;
}

/* ───────── fetching + caches ───────── */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const ddmmyyyy = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
const dayCache = new Map<string, { t: number; games: any[] }>();
const dayInflight = new Map<string, Promise<any[] | null>>();
const mapCache = new Map<string, { t: number; ttl: number; v: MapEntry | null }>();
const mapInflight = new Map<string, Promise<MapEntry | null>>();
const DAY_TTL = 10 * 60_000, FOUND_TTL = 24 * 3_600_000, MISS_TTL = 10 * 60_000, FAIL_TTL = 60_000;

/** A list older than its TTL but younger than TTL + this is still served at once while a fresh one is fetched behind it. */
const STALE_GRACE = 4 * 60_000;
async function gamesForDay(key: string, f: FetchFn, nowMs: number, ttl: number = DAY_TTL): Promise<any[] | null> {
  const hit = dayCache.get(key); if (hit && nowMs - hit.t < ttl) return hit.games;
  const usable = hit && nowMs - hit.t < ttl + STALE_GRACE ? hit.games : null;      // stale but recent: better than making the page wait
  const running = dayInflight.get(key); if (running) return usable ?? running;
  const p = (async () => {
    const j = await httpJson(`${ALLSCORES()}?${new URLSearchParams({ appTypeId: '5', langId: '1', timezoneName: 'UTC', startDate: ddmmyyyy(key), endDate: ddmmyyyy(key), sports: '1' })}`, f);
    if (!j) return null;
    const games = Array.isArray(j.games) ? j.games : [];
    dayCache.set(key, { t: nowMs, games }); if (dayCache.size > 40) dayCache.delete(dayCache.keys().next().value as string);
    return games;
  })().finally(() => dayInflight.delete(key));
  dayInflight.set(key, p);
  if (usable) { p.catch(() => {}); return usable; }       // refresh behind the answer
  return p;
}

/** The 365scores pairing for a fixture, or null (not found / source unreachable). Cached: 24 h found, 10 min not found, 1 min unreachable. */
export async function resolveMapEntry(fd: any, f: FetchFn = fetch as any, nowMs: number = Date.now()): Promise<MapEntry | null> {
  const id = String(fd?.id); const hit = mapCache.get(id); if (hit && nowMs - hit.t < hit.ttl) return hit.v;
  const running = mapInflight.get(id); if (running) return running;
  const p = (async () => {
    const ko = Date.parse(fd?.utcDate); if (!Number.isFinite(ko)) return null;
    const days = new Set([dayKey(new Date(ko - 20 * 60_000)), dayKey(new Date(ko)), dayKey(new Date(ko + 20 * 60_000))]);   // near midnight the game can sit on the neighbouring day
    let games: any[] = [], reachable = false;
    for (const d of days) { const g = await gamesForDay(d, f, nowMs); if (g) { reachable = true; games = games.concat(g); } }
    const v = reachable ? matchOne(fd, games) : null;
    mapCache.set(id, { t: nowMs, ttl: v ? FOUND_TTL : reachable ? MISS_TTL : FAIL_TTL, v });
    if (mapCache.size > 500) mapCache.delete(mapCache.keys().next().value as string);
    return v;
  })().finally(() => mapInflight.delete(id));
  mapInflight.set(id, p); return p;
}

/* ───────── live overlay: what is the fixture doing RIGHT NOW, according to the live source? ───────── */
export interface LiveOverlay { state: LiveStatus; minute: number | null; score: Score }
const OVERLAY_TTL = 25_000;   // the day's game list is re-read at most every 25 s while a match is on

/**
 * The live source's view of one fixture (state, minute, score oriented to the football-data home side), or null when the
 * source is unreachable or the fixture cannot be paired with certainty (both teams + kick-off, same strict rule as above).
 * One request per UTC day serves every fixture of that day, so a feed full of live matches costs one call, not one per match.
 */
export async function liveOverlay(fd: any, f: FetchFn = fetch as any, nowMs: number = Date.now()): Promise<LiveOverlay | null> {
  const ko = Date.parse(fd?.utcDate); if (!Number.isFinite(ko)) return null;
  const days = new Set([dayKey(new Date(ko - 20 * 60_000)), dayKey(new Date(ko)), dayKey(new Date(ko + 20 * 60_000))]);
  let games: any[] = [], reachable = false;
  const ttl = nowMs - ko > 6 * 3_600_000 ? DAY_TTL : OVERLAY_TTL;      // a day that is over is not re-read every 25 s
  for (const d of days) { const g = await gamesForDay(d, f, nowMs, ttl); if (g) { reachable = true; games = games.concat(g); } }
  if (!reachable) return null;
  const e = matchOne(fd, games); if (!e) return null;
  const game = games.find((g) => g?.id === e.s365_id); if (!game) return null;
  const state = liveStatus(game);
  const gt = Number(game?.gameTime);
  const minute = state === 'half time' ? 45 : state === 'live' && Number.isFinite(gt) && gt > 0 ? Math.round(gt) : null;
  return { state, minute, score: gameScore(game, e.fd_home_s365_id as number) };
}

export const _resetResolverCache = () => { dayCache.clear(); dayInflight.clear(); mapCache.clear(); mapInflight.clear(); };
