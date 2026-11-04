/**
 * Which statistics does a match page show?  One decision, made here, so the rule is in one place and testable.
 *
 *   FINISHED matches — the GitHub JSON first, the API only as the fallback:
 *     1. stats.json written by workers/stats365.py ("full time"), validated against the fixture and match_map.json.
 *     2. stats.json in the legacy (yallashoot) format, validated by the existing legacy path.
 *     3. koora-l.live (koora-live.ts), when the fixture can be paired with a 365scores game — from match_map.json, else on
 *        demand (match-resolver.ts). Cached 10 min once ended.
 *   MATCHES IN PLAY (or kicked off, not yet confirmed by the repo) — the API first, because a stored snapshot is stale:
 *     1. koora-l.live, cached 15 s.
 *     2. the stats.json snapshot, only if the API gave nothing.
 *   A snapshot taken while the match was in play is never shown as the final numbers of a finished match.
 *   4. NONE: nothing trustworthy; the page says why.
 */
import { validateLegacyRecord, validateStats365Record, isStats365Record, LIVE_SOURCE, type MapEntry, type ValidatedStats } from './legacy-stats-validation';
import type { LiveResult, LivePayload } from './koora-live';

export type StatsSource = 'live' | 'stats365' | 'legacy' | 'none';
const IN_PLAY = new Set(['IN_PLAY', 'PAUSED']);
const OPEN = new Set(['TIMED', 'SCHEDULED']);
const ENDED = new Set(['FINISHED', 'AWARDED']);

/** When may koora-l.live be asked about this fixture? 'live' = in play / kicked off; 'recent' = finished (< 60 days), not recorded yet. */
export function liveWindow(m: any, recorded: boolean, nowMs: number = Date.now()): 'live' | 'recent' | null {
  const ko = Date.parse(m?.utcDate); if (!Number.isFinite(ko)) return null;
  const mins = (nowMs - ko) / 60_000;
  const LATE_MIN = 240, GIVE_UP_MIN = 72 * 60;
  if (IN_PLAY.has(m?.status)) return !(mins >= LATE_MIN) ? 'live' : mins < GIVE_UP_MIN ? 'recent' : null;   // stale IN_PLAY from a mid-match snapshot: only the final numbers
  if (OPEN.has(m?.status) && mins >= 0 && mins < LATE_MIN) return 'live';     // kicked off, the data repo has not caught up yet
  if (OPEN.has(m?.status) && mins >= LATE_MIN && mins < GIVE_UP_MIN) return 'recent';   // never updated after the match: the live source has the final score
  if (ENDED.has(m?.status) && !recorded && mins >= 0 && mins < 60 * 24 * 60) return 'recent';   // finished, nothing recorded: ask the live source for the final numbers
  return null;
}

export interface StatsPart {
  stats: { stats: ValidatedStats['stats']; moreStats: ValidatedStats['moreStats']; events: any[] | null; lineups: ValidatedStats['lineups']; source: string; asOf?: string | null } | null;
  statsStatus: { state: string; reasons: string[]; source: string; droppedStats: string[]; events: { state: string; reason: string | null; note: string | null } };
  statsSource: StatsSource;
  /** The live payload, when the live source is what is shown. */
  live: LivePayload | null;
  /** True while the client should keep polling /match/:id/live. */
  liveEligible: boolean;
  /** Why the live source gave nothing, when it was asked: no_mapping | upstream_unavailable | mismatch | not_started. */
  liveReason: string | null;
}

const statusOf = (v: ValidatedStats) => ({ state: v.state, reasons: v.reasons, source: v.source, droppedStats: v.droppedStats, events: { state: v.eventsState, reason: v.eventsReason, note: v.eventsNote } });
const useful = (v: ValidatedStats) => v.state === 'verified' && !!(v.stats || v.events || v.lineups);

export async function resolveMatchStats(i: {
  match: any; code: string; key: string; record: any; mapEntry: MapEntry | null;
  fetchLive: (map: MapEntry) => Promise<LiveResult>;
  /** Pairs the fixture with its 365scores game when match_map.json has no entry for it. */
  resolveMap?: () => Promise<MapEntry | null>; nowMs?: number;
}): Promise<StatsPart> {
  const { match, code, key } = i; const record = i.record; const nowMs = i.nowMs ?? Date.now();
  const new365 = isStats365Record(record);
  // "recorded" means a record that is final AND actually belongs to this fixture; a corrupt record must not block the API fallback
  const recorded = new365 && (record.status === 'full time' || record.recorded === true)
    && validateStats365Record(record, match, key, code, i.mapEntry?.s365_id ? i.mapEntry : null, { live: false }).state === 'verified';
  const win0 = liveWindow(match, recorded, nowMs);
  const keepPolling = win0 === 'live';
  let map: MapEntry | null = i.mapEntry?.s365_id ? i.mapEntry : null;
  let liveReason: string | null = null;

  /** The stored JSON, validated. `part` is set when it is usable; `fail` explains why not. */
  const fromRecord = (): { part: StatsPart | null; fail: StatsPart } => {
    const live = win0 === 'live';
    const v = new365 ? validateStats365Record(record, match, key, code, map, { live }) : validateLegacyRecord(record, match, key, code);
    const ok = useful(v);
    const source: StatsSource = ok ? (new365 ? 'stats365' : 'legacy') : 'none';
    const part: StatsPart = { stats: ok ? { stats: v.stats, moreStats: v.moreStats ?? [], events: v.events, lineups: v.lineups, source: v.source, asOf: record?.scraped_at ?? null } : null, statsStatus: statusOf(v), statsSource: source, live: null, liveEligible: keepPolling, liveReason };
    return { part: ok ? part : null, fail: part };
  };

  /** The API (koora-l.live), if the fixture can be paired with a 365scores game. */
  const fromLive = async (): Promise<StatsPart | null> => {
    if (!win0) return null;
    if (!map && i.resolveMap) map = await i.resolveMap();
    if (!map) { liveReason = 'no_mapping'; return null; }
    const r = await i.fetchLive(map);
    if (r.available && ((win0 === 'live' && r.status !== 'full time') || r.status === 'full time')) {
      const v: ValidatedStats = { state: 'verified', reasons: [], source: LIVE_SOURCE, stats: r.stats, moreStats: r.moreStats, droppedStats: r.droppedStats, events: r.events, eventsState: r.eventsState, eventsReason: r.eventsReason, eventsNote: r.eventsNote, lineups: r.lineups };
      if (useful(v)) return { stats: { stats: v.stats, moreStats: v.moreStats, events: v.events, lineups: v.lineups, source: LIVE_SOURCE, asOf: r.fetchedAt }, statsStatus: statusOf(v), statsSource: 'live', live: r, liveEligible: win0 === 'live' && r.status !== 'full time', liveReason: null };
    }
    liveReason = r.available ? 'not_started' : (r as { reason: string }).reason;
    return null;
  };

  if (win0 === 'live') {                                   // in play: the API first, the stored snapshot only as a fallback
    const live = await fromLive(); if (live) return live;
    const rec = fromRecord(); return rec.part ?? { ...rec.fail, liveReason };
  }
  const rec = fromRecord();                                // finished (or not started): the stored JSON first
  if (rec.part) return rec.part;
  const live = await fromLive(); if (live) return live;   // ... and the API when the JSON has nothing usable
  return { ...rec.fail, liveReason };
}
