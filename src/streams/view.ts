/** Pure helpers for the stream page (filtering and grouping). No React, no network. */
import type { StreamMatch, StreamSourceResult } from './types';

export interface Row extends StreamMatch { source: string; via: StreamSourceResult['via'] }
export const flatten = (sources: StreamSourceResult[], only: string | 'all' = 'all'): Row[] =>
  sources.filter((s) => only === 'all' || s.file === only).flatMap((s) => s.matches.map((m) => ({ ...m, source: s.file, via: s.via })));

export const filterRows = (rows: Row[], q: string, league: string): Row[] => {
  const n = q.trim().toLowerCase();
  return rows.filter((r) => (!league || r.league === league) && (!n || `${r.home} ${r.away} ${r.league} ${r.source}`.toLowerCase().includes(n)));
};
export const leaguesOf = (rows: Row[]): string[] => [...new Set(rows.map((r) => r.league).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export function groupByLeague(rows: Row[]): { league: string; rows: Row[] }[] {
  const map = new Map<string, Row[]>();
  for (const r of rows) { const k = r.league || 'Other'; (map.get(k) ?? map.set(k, []).get(k)!).push(r); }
  return [...map].map(([league, rs]) => ({ league, rows: [...rs].sort((a, b) => a.time.localeCompare(b.time)) })).sort((a, b) => a.league.localeCompare(b.league));
}
export const hostOf = (u: string): string => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };
