/**
 * A team's favourite shape, from its previous matches (the starting XIs AND the benches in stats.json).
 * Pure functions: data-api.ts reads the files and hands the line-ups here.
 *
 *   formation   the shape the team used most (recent matches weigh more); null when no line-up carried one → the page uses 4-3-3
 *   sectors     the favourite number of defenders / midfielders / forwards, and how often it was used
 *   pool        every player with starts, bench appearances, minutes, usual sector, usual side and rating → the page picks the XI for any formation
 */
import { parseFormation, type PoolPlayer, type Sector } from '../lib/formation';

export interface LineupPlayer { id: number; name: string; number: string | null; pos: Sector | null; role: string | null; side: number | null; minutes: number | null; rating: number | null; subOn: number | null }
export interface Appearance { ts: number; formation: string | null; starters: LineupPlayer[]; bench: LineupPlayer[] }
export interface FormationUse { formation: string; count: number; share: number; last: number }
export interface SectorUse { value: number; count: number; share: number }
export interface TeamFormation {
  matches: number;
  formation: string | null;
  usage: FormationUse[];
  sectors: { defence: SectorUse | null; midfield: SectorUse | null; attack: SectorUse | null };
  pool: PoolPlayer[];
}

const SECTORS = ['g', 'd', 'm', 'f'];
const num = (v: any): number | null => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const posId = (v: any): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };
const ARABIC = /[\u0600-\u06FF]/;
const latin = (s: any): string | null => (typeof s === 'string' && s.trim() && !ARABIC.test(s) ? s.trim() : null);

/** One side of a stats.json record's lineups → the parts this analysis needs. null when it has no starters. */
export function appearanceFrom(lineup: any, ts: number): Appearance | null {
  const one = (p: any): LineupPlayer | null => {
    const id = posId(p?.id); const name = latin(p?.name); if (id === null || !name) return null;
    const side = num(p?.pitch?.side);
    return {
      id, name, number: p?.number == null ? null : String(p.number), pos: SECTORS.includes(p?.position) ? (p.position as Sector) : null,
      role: latin(p?.position_detail), side: side !== null && side >= 0 && side <= 100 ? side : null,
      minutes: num(p?.minutes), rating: (() => { const r = num(p?.rating); return r !== null && r > 0 ? r : null; })(), subOn: num(p?.sub_on),
    };
  };
  const starters = (lineup?.starting ?? []).map(one).filter((x: LineupPlayer | null): x is LineupPlayer => !!x);
  if (starters.length < 9) return null;                                           // a half-filled line-up says nothing reliable
  const bench = (lineup?.subs ?? []).map(one).filter((x: LineupPlayer | null): x is LineupPlayer => !!x);
  const formation = typeof lineup?.formation === 'string' && parseFormation(lineup.formation) ? lineup.formation.trim() : null;
  return { ts, formation, starters, bench };
}

const DECAY = 0.92;   // each older match counts 8 % less than the one after it
const mode = <T,>(xs: T[]): T | null => {
  const c = new Map<T, number>(); let best: T | null = null, bn = 0;
  for (const x of xs) { const n = (c.get(x) ?? 0) + 1; c.set(x, n); if (n > bn) { bn = n; best = x; } }
  return best;
};

export function analyseFormation(apps: Appearance[]): TeamFormation {
  const list = [...apps].sort((a, b) => b.ts - a.ts);                             // newest first
  const matches = list.length;

  // favourite formation: weighted by recency, ties go to the more recent use
  const use = new Map<string, { w: number; count: number; last: number }>();
  list.forEach((a, i) => {
    if (!a.formation) return;
    const u = use.get(a.formation) ?? { w: 0, count: 0, last: 0 };
    u.w += Math.pow(DECAY, i); u.count++; u.last = Math.max(u.last, a.ts); use.set(a.formation, u);
  });
  const withShape = list.filter((a) => a.formation).length;
  const ranked = [...use.entries()].sort((a, b) => b[1].w - a[1].w || b[1].last - a[1].last);
  const usage: FormationUse[] = ranked.map(([formation, u]) => ({ formation, count: u.count, share: withShape ? u.count / withShape : 0, last: u.last }));

  // favourite back / midfield / front numbers
  const sector = (pick: (rows: number[]) => number): SectorUse | null => {
    const vals = list.map((a) => (a.formation ? pick(parseFormation(a.formation) as number[]) : null)).filter((x): x is number => x !== null);
    if (!vals.length) return null;
    const value = mode(vals) as number; const count = vals.filter((v) => v === value).length;
    return { value, count, share: count / vals.length };
  };
  const sectors = {
    defence: sector((r) => r[0]),
    midfield: sector((r) => r.slice(1, -1).reduce((a, b) => a + b, 0)),
    attack: sector((r) => r[r.length - 1]),
  };

  // the pool: starters AND bench, every match
  interface Acc { id: number; name: string; number: string | null; sectors: Sector[]; roles: string[]; sides: number[]; starts: number; subs: number; minutes: number; recent: number; ratings: number[]; seen: number }
  const acc = new Map<number, Acc>();
  const get = (p: LineupPlayer, ts: number): Acc => {
    let a = acc.get(p.id);
    if (!a) { a = { id: p.id, name: p.name, number: p.number, sectors: [], roles: [], sides: [], starts: 0, subs: 0, minutes: 0, recent: 0, ratings: [], seen: ts }; acc.set(p.id, a); }
    if (ts >= a.seen) { a.seen = ts; a.name = p.name; if (p.number) a.number = p.number; }
    return a;
  };
  list.forEach((app, i) => {
    const w = Math.pow(DECAY, i);
    for (const p of app.starters) {
      const a = get(p, app.ts); a.starts++; a.recent += w; a.minutes += p.minutes ?? 0;
      if (p.pos) a.sectors.push(p.pos); if (p.role) a.roles.push(p.role); if (p.side !== null) a.sides.push(p.side); if (p.rating !== null) a.ratings.push(p.rating);
    }
    for (const p of app.bench) {
      const used = p.subOn !== null || (p.minutes ?? 0) > 0;
      const a = get(p, app.ts); if (!used) continue;
      a.subs++; a.minutes += p.minutes ?? 0; if (p.pos) a.sectors.push(p.pos); if (p.rating !== null) a.ratings.push(p.rating);
    }
  });
  const pool: PoolPlayer[] = [...acc.values()].filter((a) => a.starts + a.subs > 0).map((a) => ({
    id: a.id, name: a.name, number: a.number, sector: mode(a.sectors) ?? 'm', role: mode(a.roles),
    side: a.sides.length ? Math.round(a.sides.reduce((x, y) => x + y, 0) / a.sides.length) : null,
    starts: a.starts, subs: a.subs, minutes: Math.round(a.minutes), recent: Math.round(a.recent * 100) / 100,
    rating: a.ratings.length ? Math.round((a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length) * 10) / 10 : null,
  })).sort((x, y) => (y.recent + 0.3 * y.subs) - (x.recent + 0.3 * x.subs) || y.minutes - x.minutes);

  return { matches, formation: usage[0]?.formation ?? null, usage: usage.slice(0, 6), sectors, pool: pool.slice(0, 40) };
}
