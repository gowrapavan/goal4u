/**
 * The rich match details (line-ups with positions and photos, substitutions, shot map, top performers, match info, fan vote)
 * that the match page builds from the 365scores game endpoint. ENGLISH ONLY: anything the provider sends in another
 * language is translated by the server (server/match-details.ts) or dropped — never shown raw.
 * This file is shared by the server (which builds it) and the client (which draws it).
 */
import { imageUrl } from '../utils/data-origin';
export type Pos = 'g' | 'd' | 'm' | 'f' | null;
export interface StatItem { label: string; value: string }

export interface PlayerDetail {
  id: number;
  /** The id the repo headshot file is named after (public/headshot/{id}.png) — the same id stats.json and the player pages use. */
  athleteId: number | null;
  /** The 365scores id, kept only to match the same player between stats.json and the live feed. */
  s365Id?: number | null;
  name: string; number: string; pos: Pos;
  /** "Left Back", "Centre Forward" ... as the provider names the role. */
  role: string | null;
  /** Pitch position from the line-up: line 1 = goalkeeper, higher = further forward; side 0 = left ... 100 = right. */
  line: number | null; side: number | null;
  rating: number | null; minutes: number | null;
  goals: number; ownGoals: number; assists: number; yellow: number; red: number;
  /** Minute this player was replaced / came on. */
  subbedOffAt: number | null; subbedOnAt: number | null;
  stats: StatItem[];
  /** The 365scores heat-map picture for this player's match (from stats.json), when there is one. */
  heatmap?: string | null;
}
export interface SubDetail { minute: number; playerIn: PlayerDetail; playerOut: PlayerDetail }
export interface MissingDetail { athleteId: number | null; s365Id?: number | null; name: string; pos: Pos; kind: 'injury' | 'suspension' | 'unavailable'; reason: string | null; expectedReturn: string | null; season?: { appearances: number | null; matches: number | null; goals: number | null } | null }
export interface TeamDetail {
  formation: string | null; starters: PlayerDetail[]; bench: PlayerDetail[]; subs: SubDetail[]; missing: MissingDetail[];
  coach: { name: string; athleteId: number | null; s365Id?: number | null } | null;
}
export type ShotOutcome = 'goal' | 'saved' | 'off' | 'blocked' | 'post';
export interface ShotDetail {
  team: 'home' | 'away'; minute: number; player: string | null; xg: number; xgot: number | null; outcome: ShotOutcome;
  body: 'Left foot' | 'Right foot' | 'Header' | null; situation: string | null;
  /** 0–100, both measured toward the goal the team is attacking: x = distance from own goal, y = left–right. */
  x: number; y: number;
}
export interface PerformerSide { athleteId: number | null; s365Id?: number | null; name: string; role: string | null; stats: StatItem[] }
export interface Performer { category: string; home: PerformerSide | null; away: PerformerSide | null }
export interface MatchDetails {
  s365Id: number; fetchedAt: string;
  /** Where it came from: the repo's stats.json, the live feed, or stats.json with gaps filled from the live feed. */
  source?: 'stats.json' | 'live' | 'mixed';
  status: 'scheduled' | 'live' | 'half time' | 'full time';
  home: TeamDetail; away: TeamDetail; shots: ShotDetail[]; performers: Performer[];
  info: { venue: string | null; attendance: number | null; capacity: number | null; referee: string | null; tv: string | null };
  /** The player of the match (stats.json), when it names one. */
  potm?: { athleteId: number | null; name: string; team: 'home' | 'away'; rating: number | null } | null;
  highlights: { id: string; url: string } | null;
  fans: { win: { home: number; draw: number; away: number; votes: number } | null; goals: { line: number; under: number; over: number; votes: number } | null };
  /** Ball-in-play time, e.g. 60:38 of 98:09. */
  playTime: { played: string; total: string; share: number } | null;
}
export type DetailsResponse = { available: true; details: MatchDetails } | { available: false; reason: 'not_yet' | 'no_mapping' | 'upstream_unavailable' | 'mismatch' };

/** The player photo: the file the data repo keeps under public/headshot/, named by the player's id. (The github.com/.../blob/... page URL is HTML, not an image; this is the raw file.) */
/** The player's photo in the data service (public/headshot/<repo id>.png), with the token the service wants on image requests. */
export const playerPhoto = (id: number, _px = 96) => imageUrl(`/headshot/${id}.png`);

export type RatingTone = 'blue' | 'green' | 'amber' | 'red' | 'none';
export const ratingTone = (r: number | null | undefined): RatingTone => r == null || !(r > 0) ? 'none' : r >= 8 ? 'blue' : r >= 7 ? 'green' : r >= 6 ? 'amber' : 'red';

export interface Placed { player: PlayerDetail; x: number; y: number }

/**
 * Where each starter stands on the pitch graphic (percent of its width / height; goalkeeper at the bottom, attack at the top).
 * With line / side from the provider the layout is exact; without them (the stats.json line-ups carry only the order and the
 * formation) rows are rebuilt from the formation string, e.g. "4-2-3-1" → 1 + 4 + 2 + 3 + 1.
 */
export function pitchLayout(starters: PlayerDetail[], formation: string | null): Placed[] {
  if (!starters.length) return [];
  const yOf = (i: number, n: number) => (n <= 1 ? 50 : 87 - (i * 74) / (n - 1));
  if (starters.every((p) => p.line != null && p.side != null)) {
    const lines = [...new Set(starters.map((p) => p.line as number))].sort((a, b) => a - b);
    return lines.flatMap((ln, i) => {
      const row = starters.filter((p) => p.line === ln).sort((a, b) => (a.side as number) - (b.side as number));
      let prev = -100;
      return row.map((p) => {
        let x = 9 + (p.side as number) * 0.82;
        if (x - prev < 14) x = Math.min(91, prev + 14);                      // two players on the same spot: nudge apart
        prev = x; return { player: p, x, y: yOf(i, lines.length) };
      });
    });
  }
  const nums = (formation || '').split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  let rows: number[] | null = nums.length && nums.reduce((a, b) => a + b, 0) === starters.length - 1 ? [1, ...nums] : null;
  let ordered = starters;
  if (!rows) {                                                               // no usable formation: group by position letter
    const by = (k: Pos) => starters.filter((p) => p.pos === k);
    const g = by('g'), d = by('d'), m = by('m'), f = by('f'), rest = starters.filter((p) => !p.pos);
    ordered = [...g, ...d, ...m, ...f, ...rest]; rows = [g.length, d.length, m.length, f.length + rest.length].filter(Boolean);
  }
  const out: Placed[] = []; let k = 0;
  rows.forEach((cnt, i) => { for (let j = 0; j < cnt; j++) out.push({ player: ordered[k++], x: Math.min(90, Math.max(10, ((j + 1) / (cnt + 1)) * 100)), y: yOf(i, rows!.length) }); });
  return out.filter((p) => p.player);
}

/** A stats.json / legacy line-up side → the same shape the pitch uses (no photos, positions or substitution minutes there). */
export function fromLegacyLineup(side: any): TeamDetail | null {
  if (!side?.starting?.length) return null;
  const conv = (p: any, i: number, base: number): PlayerDetail => ({
    id: Number.isFinite(Number(p.id)) ? Number(p.id) : base + i, athleteId: Number.isFinite(Number(p.id)) && Number(p.id) > 0 ? Number(p.id) : null, name: String(p.name ?? ''), number: String(p.number ?? ''), pos: (['g', 'd', 'm', 'f'].includes(p.position) ? p.position : null) as Pos, role: typeof p.position_detail === 'string' ? p.position_detail : null, line: typeof p.pitch?.line === 'number' ? p.pitch.line : null, side: typeof p.pitch?.side === 'number' ? p.pitch.side : null,
    rating: Number.isFinite(parseFloat(p.rating)) ? parseFloat(p.rating) : null, minutes: Number.isFinite(Number(p.minutes)) ? Number(p.minutes) : null, goals: 0, ownGoals: 0, assists: 0, yellow: 0, red: 0, subbedOffAt: Number.isFinite(Number(p.sub_off)) ? Number(p.sub_off) : null, subbedOnAt: Number.isFinite(Number(p.sub_on)) ? Number(p.sub_on) : null, stats: [],
  });
  return { formation: side.formation ?? null, starters: side.starting.map((p: any, i: number) => conv(p, i, 1000)), bench: (side.subs ?? []).map((p: any, i: number) => conv(p, i, 2000)), subs: [], missing: [], coach: side.coach ? { name: String(side.coach), athleteId: Number(side.coach_id) > 0 ? Number(side.coach_id) : null } : null };
}

/**
 * The pitch rows of one team, goalkeeper first: the FORMATION decides the rows ("4-2-3-1" → 1, 4, 2, 3, 1); the provider's pitch
 * position (line, side) only decides who stands where inside them. Without a usable formation the pitch lines (or, failing that,
 * the position letters) group the rows. `side` 0 = the team's left ... 100 = its right.
 */
export function lineupRows(starters: PlayerDetail[], formation: string | null): PlayerDetail[][] {
  if (!starters.length) return [];
  const hasPitch = starters.every((p) => p.line != null && p.side != null);
  const gk = starters.find((p) => p.pos === 'g') ?? (hasPitch ? [...starters].sort((a, b) => (a.line as number) - (b.line as number))[0] : starters[0]);
  const rest = starters.filter((p) => p !== gk);
  const ord = hasPitch ? [...rest].sort((a, b) => (a.line as number) - (b.line as number) || (a.side as number) - (b.side as number)) : rest;
  const nums = (formation || '').split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  let counts: number[] | null = nums.length && nums.reduce((a, b) => a + b, 0) === rest.length ? nums : null;
  let pool = ord;
  if (!counts) {
    if (hasPitch) { const lines = [...new Set(rest.map((p) => p.line as number))].sort((a, b) => a - b); counts = lines.map((l) => rest.filter((p) => p.line === l).length); }
    else { const by = (k: Pos) => rest.filter((p) => p.pos === k); const other = rest.filter((p) => !p.pos); pool = [...by('d'), ...by('m'), ...by('f'), ...other]; counts = [by('d').length, by('m').length, by('f').length + other.length].filter(Boolean); }
  }
  const rows: PlayerDetail[][] = [[gk]]; let k = 0;
  for (const c of counts) { const row = pool.slice(k, k + c); k += c; rows.push(hasPitch ? row.sort((a, b) => (a.side as number) - (b.side as number)) : row); }
  if (k < pool.length) rows[rows.length - 1].push(...pool.slice(k));
  return rows;
}

export interface PlacedBoth { player: PlayerDetail; team: 'home' | 'away'; x: number; y: number }
/**
 * Both teams on ONE pitch. Landscape (wide screens): home on the left attacking right, away mirrored. Portrait (phones): home at the
 * top attacking down, away at the bottom. Percent of the pitch width / height.
 */
export function bothTeamsLayout(home: TeamDetail | null, away: TeamDetail | null, vertical: boolean): PlacedBoth[] {
  const out: PlacedBoth[] = [];
  const put = (t: TeamDetail | null, team: 'home' | 'away') => {
    if (!t) return; const rows = lineupRows(t.starters, t.formation); const R = rows.length;
    rows.forEach((row, i) => {
      const reach = vertical ? 36 : 40;                                      // phones: a wider gap at the halfway line
      const depth = R <= 1 ? 6 : 6 + (i * reach) / (R - 1);                // 6 % (own goal line) ... just short of the halfway line
      row.forEach((player, j) => {
        const n = row.length; const step = n <= 2 ? 36 : Math.min(30, 72 / (n - 1)); const lat = 50 + (j - (n - 1) / 2) * step;   // across the pitch, team's left → right; small rows stay central
        let x: number, y: number;
        if (!vertical) { x = team === 'home' ? depth : 100 - depth; y = team === 'home' ? lat : 100 - lat; }
        else { y = team === 'home' ? depth : 100 - depth; x = team === 'home' ? 100 - lat : lat; }
        out.push({ player, team, x, y });
      });
    });
  };
  put(home, 'home'); put(away, 'away'); return out;
}
