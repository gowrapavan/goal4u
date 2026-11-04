/**
 * The data repo is a periodic snapshot, so a match can be under way (or over) for several minutes before matches.json says so.
 * This brings the fixtures that are in that window forward using the live source (koora-l.live / 365scores), so the lists
 * (Home, Matches, league pages) say LIVE with the real score and minute — or FINISHED — instead of a stale "Kicked off".
 *
 * Rules (never overrides what the repo already knows is final):
 *   • only fixtures that kicked off 0–72 h ago and whose repo status is not final / postponed are looked at
 *     (the repo snapshot may say TIMED, or a stale IN_PLAY, long after the whistle — the live source knows the real result);
 *   • live → IN_PLAY, half time → PAUSED (score and minute from the live source);
 *   • ended → FINISHED with the final score;
 *   • "not started" → the fixture is flagged `liveCheck: 'not_started'` so the client does not guess LIVE;
 *   • source unreachable / fixture not pairable → flagged `liveCheck: 'unverified'`, and the client falls back to its own estimate (LIVE for the first 125 min after kick-off, then "awaiting result").
 */
import { liveOverlay as fetchOverlay, type LiveOverlay } from './match-resolver';
import type { FetchFn } from './koora-live';

const OPEN = new Set(['TIMED', 'SCHEDULED', 'IN_PLAY', 'PAUSED', 'LIVE']);
/** How far back the live source is asked about a fixture the repo has not finished: a match whose result never synced is still fixed 3 days later. */
export const OVERLAY_WINDOW_MIN = 72 * 60;

export const inOverlayWindow = (m: any, nowMs: number = Date.now()): boolean => {
  const ko = Date.parse(m?.utcDate); if (!Number.isFinite(ko)) return false;
  const mins = (nowMs - ko) / 60_000;
  return OPEN.has(m?.status) && mins >= 0 && mins < OVERLAY_WINDOW_MIN;
};

/** Pure: one fixture + the live source's answer → the fixture to show. */
export function mergeOverlay<T extends Record<string, any>>(m: T, o: LiveOverlay | null): T {
  if (!o) return m;
  const { home, away } = o.score;
  const scored = home != null && away != null;
  const withScore = (extra: Record<string, any>) => scored
    ? { ...m, ...extra, score: { ...(m.score || {}), fullTime: { home, away }, halfTime: o.score.ht_home != null && o.score.ht_away != null ? { home: o.score.ht_home, away: o.score.ht_away } : (m.score || {}).halfTime } }
    : { ...m, ...extra };
  switch (o.state) {
    case 'live': return withScore({ status: 'IN_PLAY', minute: o.minute ?? m.minute ?? null, liveCheck: 'koora' });
    case 'half time': return withScore({ status: 'PAUSED', minute: 45, liveCheck: 'koora' });
    case 'full time': return scored ? withScore({ status: 'FINISHED', minute: null, liveCheck: 'koora' }) : m;
    default: return ['TIMED', 'SCHEDULED'].includes(m.status) ? { ...m, liveCheck: 'not_started' } : m;
  }
}

/** The live source could not be asked (or could not pair the fixture): say so, so the client shows its estimate with a shorter window instead of trusting it for 2½ h. */
const markUnverified = <T extends Record<string, any>>(m: T): T => (['TIMED', 'SCHEDULED'].includes(m.status) ? ({ ...m, liveCheck: 'unverified' } as T) : m);

/** Marks fixtures that are open and inside the overlay window as unverified (used when the live source did not answer in time). */
export const markOpenUnverified = <T extends Record<string, any>>(matches: T[], nowMs: number = Date.now()): T[] => matches.map((m) => (inOverlayWindow(m, nowMs) ? markUnverified(m) : m));

export async function applyLiveOverlay<T extends Record<string, any>>(matches: T[], f?: FetchFn, nowMs: number = Date.now()): Promise<T[]> {
  const idx = matches.map((m, i) => (inOverlayWindow(m, nowMs) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return matches;
  const out = matches.slice();
  // sequential per day inside liveOverlay is cached, so this is one upstream call per UTC day, not per match
  await Promise.all(idx.map(async (i) => {
    try { const merged = mergeOverlay(matches[i], await fetchOverlay(matches[i], f, nowMs)); out[i] = merged === matches[i] ? markUnverified(matches[i]) : merged; } catch { out[i] = markUnverified(matches[i]); }
  }));
  return out;
}
