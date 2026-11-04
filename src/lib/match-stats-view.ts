/** Pure view logic for the match page's statistics: grouping, the summary snapshot, and goal scorers. No React, unit-tested. */
export interface StatRow { key: string; label: string; home: string; away: string; hn: number; an: number }
type Pair = { home: string; away: string; hn: number; an: number };

export const LABELS: Record<string, string> = {
  possession: 'Possession', expected_goals: 'Expected goals (xG)', shots: 'Shots', shots_on_target: 'Shots on target', shots_off_goal: 'Shots off target', blocked_shots: 'Blocked shots',
  shots_insidebox: 'Shots inside the box', shots_outsidebox: 'Shots outside the box', corners: 'Corners', offsides: 'Offsides', fouls: 'Fouls', yellow_cards: 'Yellow cards',
  yellow2rcards: 'Second yellows', red_cards: 'Red cards', goalkeeper_saves: 'Saves', total_passes: 'Total passes', passes_accurate: 'Accurate passes',
};

export const GROUPS: { id: string; title: string; open: boolean; keys: string[] }[] = [
  { id: 'attack', title: 'Attack', open: true, keys: ['expected_goals', 'shots', 'shots_on_target', 'shots_off_goal', 'blocked_shots', 'shots_insidebox', 'shots_outsidebox', 'chances_created', 'dangerous_chances', 'big_chances_missed', 'xg_on_target', 'xg_created', 'hit_woodwork', 'dribbles_completed'] },
  { id: 'passing', title: 'Passing', open: true, keys: ['total_passes', 'passes_accurate', 'long_passes_completed', 'crosses_completed', 'passes_final_third', 'passes_own_half', 'passes_opposition_half', 'back_passes', 'possession_lost', 'final_third_possession'] },
  { id: 'discipline', title: 'Discipline', open: true, keys: ['fouls', 'fouls_won', 'yellow_cards', 'yellow2rcards', 'red_cards', 'offsides'] },
  { id: 'defending', title: 'Defending & duels', open: false, keys: ['goalkeeper_saves', 'clearances', 'interceptions', 'tackles_won', 'duels_won', 'ground_duels_won', 'aerial_duels_won', 'dribbled_past', 'xg_conceded', 'errors_leading_to_goal'] },
  { id: 'setpieces', title: 'Set pieces & restarts', open: false, keys: ['corners', 'free_kicks', 'goal_kicks', 'throw_ins', 'substitutions'] },
];
const HIDDEN = new Set(['goals', 'possession']);       // the score is the header's job; possession has its own hero bar

/** Main rows (the old stats.json keys) and the extra `all_stats` rows as one flat list; both-sides-zero rows are dropped. */
export function allRows(stats: Record<string, Pair> | null | undefined, more: { key: string; name: string; home: string; away: string; hn: number; an: number }[] | undefined): StatRow[] {
  const rows: StatRow[] = [];
  for (const [key, v] of Object.entries(stats || {})) if (!HIDDEN.has(key) && !(v.hn === 0 && v.an === 0)) rows.push({ key, label: LABELS[key] || key.replace(/_/g, ' '), ...v });
  for (const m of more || []) if (!rows.some((r) => r.key === m.key) && !HIDDEN.has(m.key)) rows.push({ key: m.key, label: m.name, home: m.home, away: m.away, hn: m.hn, an: m.an });
  return rows;
}

/** Rows arranged into the display groups, in a fixed order; anything unrecognised lands in "More". Empty groups are omitted. */
export function groupRows(rows: StatRow[]) {
  const used = new Set<string>();
  const out = GROUPS.map((g) => {
    const list = g.keys.map((k) => rows.find((r) => r.key === k)).filter((r): r is StatRow => !!r && !used.has(r.key));
    list.forEach((r) => used.add(r.key)); return { id: g.id, title: g.title, open: g.open, rows: list };
  });
  const rest = rows.filter((r) => !used.has(r.key));
  if (rest.length) out.push({ id: 'more', title: 'More', open: false, rows: rest });
  return out.filter((g) => g.rows.length);
}

/** The few numbers the Summary tab shows: possession, xG, shots, shots on target, chances created, corners. */
export function keySummary(stats: Record<string, Pair> | null | undefined, more: { key: string; name: string; home: string; away: string; hn: number; an: number }[] | undefined): { possession: StatRow | null; rows: StatRow[] } {
  const all = allRows(stats, more); const get = (k: string) => all.find((r) => r.key === k);
  const p = stats?.possession ? { key: 'possession', label: LABELS.possession, ...stats.possession } : null;
  const chances = get('chances_created') ?? get('dangerous_chances');
  const rows = [get('expected_goals'), get('shots'), get('shots_on_target'), chances && { ...chances, label: chances.key === 'chances_created' ? 'Chances created' : 'Dangerous chances' }, get('corners')].filter((r): r is StatRow => !!r);
  return { possession: p, rows };
}

/** Share of the bar that belongs to the home side (50/50 when both are 0). */
export const homeShare = (hn: number, an: number) => (hn + an > 0 ? (hn / (hn + an)) * 100 : 50);
export const leader = (hn: number, an: number): 'home' | 'away' | null => (hn > an ? 'home' : an > hn ? 'away' : null);

export interface Scorer { name: string; short: string; minutes: number[]; tags: string[] }
/** "Hassane Kamara" → "H. Kamara". */
export const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p.length < 2 ? n.trim() : `${p[0][0]}. ${p.slice(1).join(' ')}`; };

/** Goal scorers per side, one line per player (a brace is one line with two minutes), in the order they first scored. */
export function scorers(events: any[] | null | undefined): { home: Scorer[]; away: Scorer[] } {
  const out = { home: [] as Scorer[], away: [] as Scorer[] };
  for (const e of [...(events || [])].filter((x) => x?.type === 'goal' && (x.team === 'home' || x.team === 'away') && typeof x.player === 'string' && x.player.trim()).sort((a, b) => a.minute - b.minute)) {
    const side = out[e.team as 'home' | 'away']; const tag = e.goal_type === 'penalty' ? 'pen' : e.goal_type === 'own_goal' ? 'og' : '';
    let s = side.find((x) => x.name === e.player);
    if (!s) { s = { name: e.player, short: shortName(e.player), minutes: [], tags: [] }; side.push(s); }
    s.minutes.push(e.minute); s.tags.push(tag);
  }
  return out;
}
