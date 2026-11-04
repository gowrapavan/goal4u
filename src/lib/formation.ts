/**
 * Squad pitch logic, shared by the server (which analyses the matches) and the page (which draws the XI and lets the visitor switch formation).
 * Pure functions only, so the rules are unit-tested.
 *
 *   parseFormation  "4-2-3-1" → [4,2,3,1]  (invalid → null)
 *   slotsFor        the 11 places on the pitch for a formation: goalkeeper + one row per number, with x (0 = left … 100 = right) and y (0 = top/attack … 100 = bottom/own goal)
 *   buildXI         the best XI for a formation from the players' history (see PoolPlayer): who starts most, in which sector and on which side
 */
export type Sector = 'g' | 'd' | 'm' | 'f';

export const DEFAULT_FORMATION = '4-3-3';
export const STANDARD_FORMATIONS = ['4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1', '4-4-1-1'] as const;

/** What the match history says about one player (built by the server from the starting XIs and benches). */
export interface PoolPlayer {
  id: number; name: string; number: string | null;
  sector: Sector; role: string | null;
  /** Average pitch side when he starts: 0 = left … 100 = right; null when the line-ups carried no pitch positions. */
  side: number | null;
  /** Matches started / matches used off the bench / minutes. */
  starts: number; subs: number; minutes: number;
  /** Starts weighted so that recent matches count more (newest = 1). */
  recent: number;
  rating: number | null;
}

export interface Slot { key: string; row: number; sector: Sector; x: number; y: number; midIndex: number; midCount: number }
export interface FilledSlot extends Slot { player: PoolPlayer | null }
export interface XI { formation: string; slots: FilledSlot[]; bench: PoolPlayer[] }

export function parseFormation(f: unknown): number[] | null {
  if (typeof f !== 'string') return null;
  const t = f.trim();
  if (!/^\d(-\d){1,4}$/.test(t)) return null;
  const rows = t.split('-').map(Number);
  if (rows.some((n) => n < 1) || rows.reduce((a, b) => a + b, 0) !== 10) return null;
  return rows;
}

/** Horizontal spread of a row of n players, in pitch % (a front two sit closer together than a back five). */
const SPREAD: Record<number, number> = { 1: 0, 2: 32, 3: 60, 4: 72, 5: 80, 6: 84 };
const rowXs = (n: number): number[] => {
  if (n === 1) return [50];
  const s = SPREAD[n] ?? 84;
  return Array.from({ length: n }, (_, i) => Math.round((50 - s / 2 + (s * i) / (n - 1)) * 10) / 10);
};

export function slotsFor(formation: string): Slot[] {
  const rows = parseFormation(formation) ?? (parseFormation(DEFAULT_FORMATION) as number[]);
  const R = rows.length;
  const slots: Slot[] = [{ key: 'gk', row: -1, sector: 'g', x: 50, y: 90, midIndex: 0, midCount: 0 }];
  const midCount = Math.max(0, R - 2);
  rows.forEach((n, r) => {
    const sector: Sector = r === 0 ? 'd' : r === R - 1 ? 'f' : 'm';
    const y = Math.round((72 - (58 * r) / Math.max(1, R - 1)) * 10) / 10;       // defence 72 … forwards 14
    rowXs(n).forEach((x, i) => slots.push({ key: `r${r}c${i}`, row: r, sector, x, y, midIndex: sector === 'm' ? r - 1 : 0, midCount: sector === 'm' ? midCount : 0 }));
  });
  return slots;
}

const SECTOR_FIT: Record<Sector, Record<Sector, number>> = {
  g: { g: 1, d: -9, m: -9, f: -9 },
  d: { g: -9, d: 1, m: 0.3, f: -0.8 },
  m: { g: -9, d: 0.35, m: 1, f: 0.45 },
  f: { g: -9, d: -0.8, m: 0.45, f: 1 },
};

function fit(p: PoolPlayer, s: Slot, strength: number): number {
  const sector = SECTOR_FIT[s.sector][p.sector];
  const side = p.side == null ? 0.5 : 1 - Math.min(1, Math.abs(p.side - s.x) / 60);
  let role = 0;
  if (s.sector === 'm' && s.midCount > 1 && p.role) {                           // a double pivot / holding player sits in the deepest midfield row, a number 10 or winger in the highest
    if (/defensive|holding|anchor/i.test(p.role)) role = s.midIndex === 0 ? 0.3 : -0.1;
    else if (/attacking|winger|wing|second striker|playmaker/i.test(p.role)) role = s.midIndex === s.midCount - 1 ? 0.3 : -0.05;
  }
  const rating = p.rating != null ? Math.max(-0.3, Math.min(0.4, (p.rating - 6.6) / 5)) : 0;
  return 2.2 * sector + 1.0 * side + 2.6 * strength + role + rating * 0.6;
}

/** Minimum-cost assignment (Hungarian algorithm), rows ≤ columns. Returns, for each row, its chosen column. */
function assign(cost: number[][]): number[] {
  const n = cost.length, m = cost[0]?.length ?? 0;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1;
  return res;
}

export const strengthOf = (p: PoolPlayer) => p.recent + 0.3 * p.subs;

/** The best XI for `formation` from the pool, plus the next players for the bench. Always 11 slots; a slot is empty only when the pool has too few players. */
export function buildXI(pool: PoolPlayer[], formation: string, benchSize = 9): XI {
  const f = parseFormation(formation) ? formation : DEFAULT_FORMATION;
  const slots = slotsFor(f);
  const ranked = [...pool].sort((a, b) => strengthOf(b) - strengthOf(a) || b.minutes - a.minutes).slice(0, 30);
  const maxS = Math.max(0.0001, ...ranked.map(strengthOf));
  const cands: (PoolPlayer | null)[] = [...ranked];
  while (cands.length < slots.length) cands.push(null);                         // empty places cost less than any real player, so real players always get a slot first
  const cost = slots.map((s) => cands.map((c) => (c ? -fit(c, s, strengthOf(c) / maxS) : 5)));
  const pick = assign(cost);
  const filled: FilledSlot[] = slots.map((s, i) => ({ ...s, player: cands[pick[i]] ?? null }));
  const usedIds = new Set(filled.map((x) => x.player?.id).filter((x): x is number => x != null));
  const bench = ranked.filter((p) => !usedIds.has(p.id)).slice(0, benchSize);
  return { formation: f, slots: filled, bench };
}

/** Sector of a squad-list position text ("Centre-Back", "Goalkeeper", "Left Winger" …). */
export function sectorOfPosition(position: string | null | undefined): Sector | null {
  const p = (position || '').toLowerCase();
  if (!p) return null;
  if (p.includes('keep')) return 'g';
  if (p.includes('mid')) return 'm';                                   // before defence: "Defensive Midfield" is a midfielder
  if (p.includes('def') || p.includes('back')) return 'd';
  if (/(forward|offence|attack|wing|striker)/.test(p)) return 'f';
  return null;
}

/** No match history yet (start of a season, a cup side): a pool from the squad list alone, so the pitch is still filled. Order in the list breaks ties. */
export function poolFromSquad(players: { id: number; name: string; position?: string | null }[]): PoolPlayer[] {
  const n = players.length;
  return players.map((p, i) => ({
    id: p.id, name: p.name, number: null, sector: sectorOfPosition(p.position) ?? 'm', role: p.position ?? null, side: null,
    starts: 0, subs: 0, minutes: 0, recent: 0.5 * (1 - i / Math.max(1, n)), rating: null,
  }));
}
