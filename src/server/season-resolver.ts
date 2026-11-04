/** European football season convention: Jul–Dec belongs to the season
 *  starting that year; Jan–Jun belongs to the one that started last year.
 *  Computed fresh every call — never goes stale, no yearly edits needed. */
export function getAutoLeagueSeason(now: Date = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const startYear = month >= 7 ? year : year - 1;
  return {
    startYear,
    endYear: startYear + 1,
    seasonStr: `${startYear}-${startYear + 1}`,
  };
}

/** Cyclical tournaments (WC, EC) recur every `period` years. `anchor` is
 *  ANY one real edition year — the formula extrapolates forwards AND
 *  backwards from it forever. You never add a new branch when a new
 *  edition happens. */
interface TournamentCycle {
  anchor: number;
  period: number;
  folder: (year: number) => string;
}

const TOURNAMENT_CYCLES: Record<'WC' | 'EC', TournamentCycle> = {
  WC: { anchor: 2026, period: 4, folder: (y) => `world-cup/world-cup-${y}` },
  EC: { anchor: 2028, period: 4, folder: (y) => `euros/euro-${y}` },
};

export function resolveTournamentYear(code: 'WC' | 'EC', now: Date = new Date()): number {
  const { anchor, period } = TOURNAMENT_CYCLES[code];
  const offset = now.getFullYear() - anchor;
  const cyclesFromAnchor = Math.round(offset / period);
  return anchor + cyclesFromAnchor * period;
}

export function resolveTournamentFolder(
  code: 'WC' | 'EC',
  overrideStartDate?: string,   // real data always wins if present & sane
  now: Date = new Date()
): string {
  if (overrideStartDate) {
    const y = parseInt(overrideStartDate.split('-')[0], 10);
    if (!isNaN(y) && y > 2000) return TOURNAMENT_CYCLES[code].folder(y);
  }
  const year = resolveTournamentYear(code, now);
  return TOURNAMENT_CYCLES[code].folder(year);
}
