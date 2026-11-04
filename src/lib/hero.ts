/**
 * Home hero selection — pure, no React/fetch, unit-tested.
 *
 * Rule: feature the NEAREST upcoming match (next 7 days) involving one of the priority clubs.
 * A later, bigger fixture (e.g. a Clásico on the 22nd) never jumps ahead of an earlier match
 * of a priority club. Only matches kicking off within TIE_WINDOW of the earliest one are
 * compared on importance (both clubs priority > one; then club rank).
 */
import { phase, StateMatch } from './match-state';

/** In priority order. IDs are football-data.org team ids (verified against the data repo). */
export const PRIORITY_CLUBS: { id: number; name: string }[] = [
  { id: 86, name: 'Real Madrid' }, { id: 81, name: 'Barcelona' }, { id: 66, name: 'Manchester United' },
  { id: 5, name: 'Bayern Munich' }, { id: 524, name: 'Paris Saint-Germain' }, { id: 57, name: 'Arsenal' },
  { id: 65, name: 'Manchester City' }, { id: 78, name: 'Atlético Madrid' },
];
const RANK = new Map(PRIORITY_CLUBS.map((c, i) => [c.id, i]));
/** Competition order used only by the non-priority fallback. */
const COMP_ORDER = ['CL', 'PL', 'PD', 'SA', 'BL1', 'FL1', 'ELC'];

export const HERO_HORIZON_DAYS = 7;
export const TIE_WINDOW_MS = 3 * 3600_000;

export type HeroMatch = StateMatch & { code: string };

/** How many priority clubs play, and the best (lowest) club rank. */
export function clubWeight(m: HeroMatch) {
  const ranks = [m.homeTeam.id, m.awayTeam.id].map((id) => RANK.get(id)).filter((r): r is number => r !== undefined);
  return { count: ranks.length, best: ranks.length ? Math.min(...ranks) : Infinity };
}
const byImportance = (a: HeroMatch, b: HeroMatch) => {
  const wa = clubWeight(a), wb = clubWeight(b);
  return wb.count - wa.count || wa.best - wb.best || a.utcDate.localeCompare(b.utcDate);
};

export function pickHero<T extends HeroMatch>(ms: T[], now: number = Date.now()): T | undefined {
  if (!ms.length) return undefined;
  const ph = (m: T) => phase(m, now);
  const horizon = now + HERO_HORIZON_DAYS * 86400_000;
  const prio = (m: T) => clubWeight(m).count > 0;

  // 1) A priority club is playing right now (feed says in play): show it.
  const live = ms.filter((m) => ph(m) === 'live' && prio(m)).sort(byImportance);
  if (live.length) return live[0];

  // 2) Nearest priority-club match: kicked off recently ("started") or upcoming within the horizon.
  const open = ms.filter((m) => (ph(m) === 'started' || ph(m) === 'upcoming') && prio(m) && Date.parse(m.utcDate) <= horizon)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  if (open.length) {
    const t0 = Date.parse(open[0].utcDate);
    return open.filter((m) => Date.parse(m.utcDate) - t0 <= TIE_WINDOW_MS).sort(byImportance)[0];
  }

  // 3) No priority club in the next week: previous behaviour (live → started → soon → next → latest result).
  const compRank = (m: T) => { const i = COMP_ORDER.indexOf(m.code); return i < 0 ? 99 : i; };
  const best = (arr: T[]) => [...arr].sort((a, b) => compRank(a) - compRank(b) || a.utcDate.localeCompare(b.utcDate))[0];
  const anyLive = ms.filter((m) => ph(m) === 'live'), started = ms.filter((m) => ph(m) === 'started'), upcoming = ms.filter((m) => ph(m) === 'upcoming')
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const soon = upcoming.filter((m) => Date.parse(m.utcDate) - now < 3 * 86400_000);
  if (anyLive.length) return best(anyLive);
  if (started.length) return best(started);
  if (soon.length) return best(soon);
  if (upcoming.length) return upcoming[0];
  return ms.filter((m) => ph(m) === 'ft').sort((a, b) => b.utcDate.localeCompare(a.utcDate))[0] ?? ms[0];
}
