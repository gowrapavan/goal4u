/**
 * Pure match-state helpers — no React, no fetch — so they can be unit-tested.
 * Re-exported from lib/api.ts.
 */
export interface StateMatch { id: number; status: string; utcDate: string; homeTeam: { id: number }; awayTeam: { id: number }; /** Set by the server when it asked the live source: 'koora' = confirmed there, 'not_started' = the live source says it has not kicked off, 'unverified' = it was asked but could not answer (unreachable / fixture not found), so any LIVE shown is only an estimate. */ liveCheck?: 'koora' | 'not_started' | string | null }

export type Phase = 'live' | 'started' | 'ft' | 'upcoming' | 'pending' | 'postponed';
const LIVE_STATUSES = ['IN_PLAY', 'PAUSED', 'LIVE', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'];
/** How long after kick-off a match is still treated as being on when nothing better is known: 90 min + half time + stoppage + a little extra time. */
export const LIVE_WINDOW_MIN = 150;
/** A repo snapshot taken mid-match keeps saying IN_PLAY forever. Three hours after kick-off that is no longer believed unless the live source confirmed it. */
export const STALE_LIVE_MIN = 180;
/** When the live source could not be asked, a guessed LIVE stops sooner: a normal match (90 min + half time + stoppage) is over after about two hours, so the other 25 minutes of the window would show finished matches as live. */
export const UNVERIFIED_LIVE_MIN = 125;
/**
 * Match phase. The data repo is a periodic snapshot, so it can be minutes behind the real match; the app must still be right.
 *  - 'live'     the feed says in play, OR the match kicked off less than 2½ h ago and has no final result yet. The server
 *               asks the live source (koora-l.live / 365scores) first and sends its real status/minute/score; when that source
 *               is unreachable this time-based estimate is what keeps the match LIVE instead of a stale "Kicked off".
 *  - 'started'  kick-off has passed but the live source explicitly says the match has not begun (delay / late start).
 *  - 'pending'  kicked off more than 2½ h ago and no result has synced yet (also: the repo still says IN_PLAY 3 h after kick-off and the live
 *               source could not confirm it). The server tries the live source for these and, when it knows the final score, sends FINISHED.
 */
/** Short label for the states the feed names itself (never guessed from missing data): half time, extra time, penalties, postponed, suspended, cancelled, awarded. */
export function holdLabel(m: Pick<StateMatch, 'status'>): string | null {
  switch (m.status) {
    case 'PAUSED': return 'Half time';
    case 'EXTRA_TIME': return 'Extra time';
    case 'PENALTY_SHOOTOUT': return 'Penalties';
    case 'POSTPONED': return 'Postponed';
    case 'SUSPENDED': return 'Suspended';
    case 'CANCELLED': return 'Cancelled';
    case 'AWARDED': return 'Awarded';
    default: return null;
  }
}

export function phase(m: StateMatch, now: number = Date.now()): Phase {
  const s = m.status;
  const mins = (now - Date.parse(m.utcDate)) / 60000;
  if (LIVE_STATUSES.includes(s)) return mins >= STALE_LIVE_MIN && m.liveCheck !== 'koora' ? 'pending' : 'live';
  if (['FINISHED', 'AWARDED'].includes(s)) return 'ft';
  if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(s)) return 'postponed';
  if (mins >= 0 && mins < LIVE_WINDOW_MIN) {
    if (m.liveCheck === 'not_started') return 'started';
    if (m.liveCheck === 'unverified' && mins >= UNVERIFIED_LIVE_MIN) return 'pending';
    return 'live';
  }
  if (mins >= LIVE_WINDOW_MIN) return 'pending';
  return 'upcoming';
}
export const isLive = (m: StateMatch, now: number = Date.now()) => phase(m, now) === 'live';
/** Not yet finished and not live: still to be played or awaiting confirmation. */
export const isOpen = (m: StateMatch, now: number = Date.now()) => !['ft', 'postponed'].includes(phase(m));

/** Remove duplicate fixtures (same id, or same teams on the same day) when merging competitions; keep the most complete record. */
export function uniqueMatches<T extends StateMatch>(ms: T[]): T[] {
  const rank = (m: StateMatch, now: number = Date.now()) => (m.status === 'FINISHED' ? 3 : LIVE_STATUSES.includes(m.status) ? 2 : 1);
  const byKey = new Map<string, T>();
  for (const m of ms) {
    const keys = [`id:${m.id}`, `t:${m.homeTeam?.id}-${m.awayTeam?.id}-${String(m.utcDate).slice(0, 10)}`];
    const hit = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!hit) { keys.forEach((k) => byKey.set(k, m)); continue; }
    if (rank(m) > rank(hit)) { keys.forEach((k) => byKey.set(k, m)); byKey.forEach((v, k) => { if (v === hit) byKey.set(k, m); }); }
  }
  return [...new Set(byKey.values())];
}
