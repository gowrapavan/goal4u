/**
 * Match Detail intelligence — pure calculations. No I/O, no framework imports.
 *
 * Everything here is derived ONLY from football-data style `matches.json`
 * records (score.fullTime / halfTime / regularTime, status, utcDate, team ids).
 * It never reads stats.json, so it works for seasons that have none.
 *
 * Correctness rules (see the approved design):
 *  - Only FINISHED matches strictly before the current kickoff, excluding the
 *    current match itself, feed pre-match calculations.
 *  - Goals are REGULAR-time goals. For duration === 'REGULAR' that is
 *    score.fullTime. For any other duration only an explicit, non-null
 *    score.regularTime is trusted; otherwise the match is EXCLUDED from goal
 *    based figures and counted as `excluded` (never guessed, never zero).
 *    Penalty-shoot-out goals are never added.
 *  - Team identity is the numeric team id. Names are display-only.
 *  - Unknown is `null`/absent, never 0.
 */

export type RawMatch = any;

export interface TeamRef { id: number; name: string; shortName: string | null; crest: string | null }
export interface GoalPair { home: number; away: number }

const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pair = (s: any): GoalPair | null => {
  const h = num(s?.home), a = num(s?.away);
  return h !== null && a !== null ? { home: h, away: a } : null;
};
const teamRef = (t: any): TeamRef => ({ id: t?.id, name: t?.name ?? '', shortName: t?.shortName ?? null, crest: t?.crest ?? null });
const label = (t: TeamRef) => t.shortName || t.name || 'Team';

/* ───────────── season helpers ───────────── */
/** "2025-2026" for a league-style season spanning two calendar years; undefined otherwise (e.g. tournaments). */
export function seasonOfMatch(m: RawMatch): string | undefined {
  const a = parseInt(String(m?.season?.startDate ?? '').slice(0, 4), 10);
  const b = parseInt(String(m?.season?.endDate ?? '').slice(0, 4), 10);
  return Number.isFinite(a) && Number.isFinite(b) && b === a + 1 ? `${a}-${b}` : undefined;
}
export function previousSeason(season: string): string | null {
  const m = /^(\d{4})-(\d{4})$/.exec(season);
  return m ? `${+m[1] - 1}-${+m[2] - 1}` : null;
}

/* ───────────── score semantics ───────────── */
/** Regular-time goals of a FINISHED match, or null when they cannot be established. */
export function regularGoals(m: RawMatch): GoalPair | null {
  if (!m || m.status !== 'FINISHED' || !m.score) return null;
  if (m.score.duration === 'REGULAR') return pair(m.score.fullTime);
  // EXTRA_TIME / PENALTY_SHOOTOUT / unknown: only an explicit regular-time score is trusted.
  return pair(m.score.regularTime);
}
/** Half-time goals, only if consistent with the regular-time score. */
export function halfGoals(m: RawMatch, ft: GoalPair | null = regularGoals(m)): GoalPair | null {
  const ht = pair(m?.score?.halfTime);
  if (!ht || !ft) return null;
  return ht.home <= ft.home && ht.away <= ft.away ? ht : null;
}

/* ───────────── team rows ───────────── */
export interface TeamRow {
  matchId: number; ts: number; date: string; season: string; code: string; stage: string | null;
  teamId: number; oppId: number; venue: 'H' | 'A'; gf: number; ga: number;
  htGf: number | null; htGa: number | null;
  result: 'W' | 'D' | 'L'; points: 0 | 1 | 3;
  home: TeamRef; away: TeamRef; hg: number; ag: number; opp: TeamRef;
}
export interface ExcludedMatch { matchId: number; ts: number; homeId: number; awayId: number }
export interface SeasonFile { season: string; code: string; matches: RawMatch[] }

export function rowsFromMatches(matches: RawMatch[], season: string, code: string): { rows: TeamRow[]; excluded: ExcludedMatch[] } {
  const rows: TeamRow[] = []; const excluded: ExcludedMatch[] = []; const seen = new Set<number>();
  for (const m of matches || []) {
    if (!m || m.status !== 'FINISHED' || seen.has(m.id)) continue;
    const hId = m.homeTeam?.id, aId = m.awayTeam?.id;
    if (typeof hId !== 'number' || typeof aId !== 'number' || hId === aId) continue;
    const ts = Date.parse(m.utcDate);
    if (!Number.isFinite(ts)) continue;
    seen.add(m.id);
    const g = regularGoals(m);
    if (!g) { excluded.push({ matchId: m.id, ts, homeId: hId, awayId: aId }); continue; }
    const ht = halfGoals(m, g);
    const home = teamRef(m.homeTeam), away = teamRef(m.awayTeam);
    const mk = (venue: 'H' | 'A'): TeamRow => {
      const gf = venue === 'H' ? g.home : g.away, ga = venue === 'H' ? g.away : g.home;
      return {
        matchId: m.id, ts, date: m.utcDate, season, code, stage: m.stage ?? null,
        teamId: venue === 'H' ? hId : aId, oppId: venue === 'H' ? aId : hId, venue, gf, ga,
        htGf: ht ? (venue === 'H' ? ht.home : ht.away) : null, htGa: ht ? (venue === 'H' ? ht.away : ht.home) : null,
        result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', points: gf > ga ? 3 : gf === ga ? 1 : 0,
        home, away, hg: g.home, ag: g.away, opp: venue === 'H' ? away : home,
      };
    };
    rows.push(mk('H'), mk('A'));
  }
  return { rows, excluded };
}

/** Pre-match eligibility: strictly earlier kickoff and not the current match. */
const prior = (r: { ts: number; matchId: number }, ts: number, matchId: number) => r.ts < ts && r.matchId !== matchId;

/* ───────────── league table (as of kickoff) ───────────── */
export interface TableRow {
  position: number; team: TeamRef; playedGames: number; won: number; draw: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number; positionUncertain: boolean;
}
export interface TableIntel {
  rows: TableRow[]; completedMatches: number; played: { min: number; max: number };
  excludedMatches: number; rankingBasis: string; tiebreakRulesVerified: boolean;
}

export function computeTable(matches: RawMatch[], seasonRows: TeamRow[], excludedCount: number, code: string, ts: number, matchId: number): TableIntel | null {
  const acc = new Map<number, TableRow>();
  const ensure = (t: any) => {
    if (typeof t?.id !== 'number' || acc.has(t.id)) return;
    acc.set(t.id, { position: 0, team: teamRef(t), playedGames: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, positionUncertain: false });
  };
  for (const m of matches || []) { ensure(m?.homeTeam); ensure(m?.awayTeam); }
  const done = new Set<number>();
  for (const r of seasonRows) {
    if (!prior(r, ts, matchId)) continue;
    const t = acc.get(r.teamId); if (!t) continue;
    done.add(r.matchId);
    t.playedGames++; t.goalsFor += r.gf; t.goalsAgainst += r.ga; t.points += r.points;
    if (r.result === 'W') t.won++; else if (r.result === 'D') t.draw++; else t.lost++;
  }
  if (!done.size) return null;
  const rows = [...acc.values()];
  rows.forEach((t) => { t.goalDifference = t.goalsFor - t.goalsAgainst; });
  rows.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name));
  const isPL = code === 'PL';
  rows.forEach((t, i) => {
    t.position = i + 1;
    // Only the PL rule (points, GD, GF) was cross-checked against a published table. For any other
    // competition equal points already mean the order may differ under that competition's own rules.
    t.positionUncertain = rows.some((o) => o !== t && o.points === t.points && (!isPL || (o.goalDifference === t.goalDifference && o.goalsFor === t.goalsFor)));
  });
  const played = rows.map((r) => r.playedGames);
  return {
    rows, completedMatches: done.size, played: { min: Math.min(...played), max: Math.max(...played) },
    excludedMatches: excludedCount, rankingBasis: 'points, then goal difference, then goals scored', tiebreakRulesVerified: isPL,
  };
}

/* ───────────── form ───────────── */
export interface FormItem { matchId: number; date: string; season: string; venue: 'H' | 'A'; opp: TeamRef; gf: number; ga: number; result: 'W' | 'D' | 'L' }
export interface FormIntel { items: FormItem[]; count: number; requested: number; won: number; draw: number; lost: number; goalsFor: number; goalsAgainst: number; pointsPerMatch: number | null; crossSeason: boolean }

export function teamForm(rows: TeamRow[], teamId: number, ts: number, matchId: number, n = 5, venue?: 'H' | 'A'): FormIntel {
  const list = rows.filter((r) => r.teamId === teamId && prior(r, ts, matchId) && (!venue || r.venue === venue))
    .sort((a, b) => b.ts - a.ts || b.matchId - a.matchId).slice(0, n).reverse(); // oldest → newest
  const f: FormIntel = { items: [], count: list.length, requested: n, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, pointsPerMatch: null, crossSeason: new Set(list.map((r) => r.season)).size > 1 };
  let pts = 0;
  for (const r of list) {
    f.items.push({ matchId: r.matchId, date: r.date, season: r.season, venue: r.venue, opp: r.opp, gf: r.gf, ga: r.ga, result: r.result });
    f.goalsFor += r.gf; f.goalsAgainst += r.ga; pts += r.points;
    if (r.result === 'W') f.won++; else if (r.result === 'D') f.draw++; else f.lost++;
  }
  if (list.length) f.pointsPerMatch = Math.round((pts / list.length) * 100) / 100;
  return f;
}

/* ───────────── season record ───────────── */
export interface Split { played: number; won: number; draw: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }
export interface HalfSplit { goalsFor: number; goalsAgainst: number; matches: number }
export interface SeasonRecord {
  played: number; won: number; draw: number; lost: number; goalsFor: number; goalsAgainst: number; goalDifference: number;
  points: number; pointsPerMatch: number | null; cleanSheets: number; failedToScore: number;
  home: Split; away: Split; firstHalf: HalfSplit; secondHalf: HalfSplit;
}
const blank = (): Split => ({ played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
export function seasonRecord(seasonRows: TeamRow[], teamId: number, ts: number, matchId: number): SeasonRecord {
  const s: SeasonRecord = { played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, pointsPerMatch: null, cleanSheets: 0, failedToScore: 0, home: blank(), away: blank(), firstHalf: { goalsFor: 0, goalsAgainst: 0, matches: 0 }, secondHalf: { goalsFor: 0, goalsAgainst: 0, matches: 0 } };
  for (const r of seasonRows) {
    if (r.teamId !== teamId || !prior(r, ts, matchId)) continue;
    const sp = r.venue === 'H' ? s.home : s.away;
    for (const t of [s, sp] as (SeasonRecord | Split)[]) {
      t.played++; t.goalsFor += r.gf; t.goalsAgainst += r.ga; t.points += r.points;
      if (r.result === 'W') t.won++; else if (r.result === 'D') t.draw++; else t.lost++;
    }
    if (r.ga === 0) s.cleanSheets++;
    if (r.gf === 0) s.failedToScore++;
    if (r.htGf !== null && r.htGa !== null) {
      s.firstHalf.goalsFor += r.htGf; s.firstHalf.goalsAgainst += r.htGa; s.firstHalf.matches++;
      s.secondHalf.goalsFor += r.gf - r.htGf; s.secondHalf.goalsAgainst += r.ga - r.htGa; s.secondHalf.matches++;
    }
  }
  s.goalDifference = s.goalsFor - s.goalsAgainst;
  if (s.played) s.pointsPerMatch = Math.round((s.points / s.played) * 100) / 100;
  return s;
}

/* ───────────── head to head ───────────── */
export interface MeetingItem { matchId: number; date: string; season: string; code: string; stage: string | null; home: TeamRef; away: TeamRef; homeGoals: number; awayGoals: number }
export interface H2HIntel {
  meetings: number; excludedMeetings: number; teamAWins: number; draws: number; teamBWins: number;
  teamAGoals: number; teamBGoals: number;
  teamAAtHome: { meetings: number; wins: number; draws: number; losses: number };
  last: MeetingItem[]; seasons: string[]; competitions: string[];
}
/** Team A = the current match's home team. W/D/L are by team id, not by venue. */
export function headToHead(rows: TeamRow[], excluded: ExcludedMatch[], aId: number, bId: number, ts: number, matchId: number, limit = 10): H2HIntel {
  const seen = new Set<number>();
  const ms = rows.filter((r) => r.teamId === aId && r.oppId === bId && prior(r, ts, matchId) && !seen.has(r.matchId) && seen.add(r.matchId))
    .sort((x, y) => y.ts - x.ts || y.matchId - x.matchId);
  const exSeen = new Set<number>();
  const ex = excluded.filter((e) => ((e.homeId === aId && e.awayId === bId) || (e.homeId === bId && e.awayId === aId)) && e.ts < ts && e.matchId !== matchId && !exSeen.has(e.matchId) && exSeen.add(e.matchId)).length;
  const h: H2HIntel = { meetings: ms.length, excludedMeetings: ex, teamAWins: 0, draws: 0, teamBWins: 0, teamAGoals: 0, teamBGoals: 0, teamAAtHome: { meetings: 0, wins: 0, draws: 0, losses: 0 }, last: [], seasons: [], competitions: [] };
  for (const r of ms) {
    h.teamAGoals += r.gf; h.teamBGoals += r.ga;
    if (r.result === 'W') h.teamAWins++; else if (r.result === 'D') h.draws++; else h.teamBWins++;
    if (r.venue === 'H') { h.teamAAtHome.meetings++; if (r.result === 'W') h.teamAAtHome.wins++; else if (r.result === 'D') h.teamAAtHome.draws++; else h.teamAAtHome.losses++; }
  }
  h.last = ms.slice(0, limit).map((r) => ({ matchId: r.matchId, date: r.date, season: r.season, code: r.code, stage: r.stage, home: r.home, away: r.away, homeGoals: r.hg, awayGoals: r.ag }));
  h.seasons = [...new Set(ms.map((r) => r.season))].sort();
  h.competitions = [...new Set(ms.map((r) => r.code))].sort();
  return h;
}

/* ───────────── text helpers ───────────── */
const ordinal = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const wdl = (f: FormIntel) => `${f.won}W ${f.draw}D ${f.lost}L`;
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w === 'match' ? 'matches' : w + 's'}`;

/* ───────────── main builder ───────────── */
export interface LastSeasonIntel { season: string; home: { position: number; points: number; uncertain: boolean } | null; away: { position: number; points: number; uncertain: boolean } | null }
export interface MatchIntel {
  version: 1; matchId: number; code: string; season: string; kickoff: string;
  teams: { home: TeamRef; away: TeamRef };
  result: { regularTime: GoalPair; halfTime: GoalPair | null; duration: string | null } | null;
  table: TableIntel | null; tableNote: string | null;
  form: { scope: string; home: { overall: FormIntel; venue: FormIntel }; away: { overall: FormIntel; venue: FormIntel } };
  seasonRecords: { home: SeasonRecord | null; away: SeasonRecord | null } | null;
  lastSeason: LastSeasonIntel | null;
  h2h: H2HIntel; h2hScope: string;
  facts: string[]; notes: string[];
  coverage: { seasons: string[]; competitions: string[] };
}

export interface IntelInput { match: RawMatch; code: string; season: string; files: SeasonFile[] }

export function buildMatchIntel({ match, code, season, files }: IntelInput): MatchIntel {
  const ts = Date.parse(match.utcDate), mid = match.id;
  const home = teamRef(match.homeTeam), away = teamRef(match.awayTeam);
  const notes: string[] = [];

  // Rows for every loaded file (deduplicated by match id across files).
  const built = files.map((f) => ({ f, ...rowsFromMatches(f.matches, f.season, f.code) }));
  const seenRow = new Set<string>();
  const allRows: TeamRow[] = []; const allExcluded: ExcludedMatch[] = [];
  for (const b of built) {
    for (const r of b.rows) { const k = `${r.matchId}:${r.teamId}`; if (!seenRow.has(k)) { seenRow.add(k); allRows.push(r); } }
    allExcluded.push(...b.excluded);
  }
  const cur = built.find((b) => b.f.code === code && b.f.season === season);
  const sameCompRows = allRows.filter((r) => r.code === code);
  const curRows = cur ? cur.rows : [];

  const isLeague = match.competition?.type === 'LEAGUE' && (match.stage == null || match.stage === 'REGULAR_SEASON');
  let table: TableIntel | null = null; let tableNote: string | null = null;
  if (!isLeague) tableNote = 'A league table is not shown for this competition or stage.';
  else if (cur) { table = computeTable(cur.f.matches, curRows, cur.excluded.length, code, ts, mid); if (!table) tableNote = 'No completed matches before this fixture yet, so there is no table to calculate.'; }
  else tableNote = 'Season results were not available, so no table could be calculated.';

  const form = {
    scope: `${match.competition?.name || code} matches in Goal4U data`,
    home: { overall: teamForm(sameCompRows, home.id, ts, mid, 5), venue: teamForm(sameCompRows, home.id, ts, mid, 5, 'H') },
    away: { overall: teamForm(sameCompRows, away.id, ts, mid, 5), venue: teamForm(sameCompRows, away.id, ts, mid, 5, 'A') },
  };

  const seasonBlock = isLeague && cur ? { home: seasonRecord(curRows, home.id, ts, mid), away: seasonRecord(curRows, away.id, ts, mid) } : null;

  // Last season's final league position — only from a COMPLETE, fully verifiable previous season file.
  let lastSeason: LastSeasonIntel | null = null;
  const ps = previousSeason(season);
  const prev = isLeague && ps ? built.find((b) => b.f.code === code && b.f.season === ps) : undefined;
  if (prev && prev.f.matches.length && prev.f.matches.every((m: RawMatch) => m.status === 'FINISHED') && !prev.excluded.length) {
    const t = computeTable(prev.f.matches, prev.rows, 0, code, Number.POSITIVE_INFINITY, -1);
    const pick = (id: number) => { const r = t?.rows.find((x) => x.team.id === id); return r ? { position: r.position, points: r.points, uncertain: r.positionUncertain } : null; };
    if (t) lastSeason = { season: ps!, home: pick(home.id), away: pick(away.id) };
  }

  const h2h = headToHead(allRows, allExcluded, home.id, away.id, ts, mid, 10);
  const h2hComps = [...new Set(files.map((f) => f.code))].sort();
  const h2hScope = `${h2hComps.join(' and ')} results from ${[...new Set(files.map((f) => f.season))].sort().join(', ')} held in Goal4U data`;

  const reg = regularGoals(match);
  const ht = reg ? halfGoals(match, reg) : null;
  const duration: string | null = match.score?.duration ?? null;
  const result = match.status === 'FINISHED' && reg ? { regularTime: reg, halfTime: ht, duration } : null;

  if (match.status === 'FINISHED' && !reg) notes.push('The regular-time score for this match could not be established from the data, so no result-based sentences are shown.');
  if (match.competition?.type && match.competition.type !== 'LEAGUE') notes.push(`Extra-time and penalty-shoot-out score handling is unverified for ${match.competition?.name || code}. Matches that went beyond regular time are left out of goal-based figures unless a regular-time score is supplied.`);
  if (table && !table.tiebreakRulesVerified) notes.push(`Tie-break rules are unverified for ${match.competition?.name || code}; clubs level on points may be ordered differently in the official table.`);
  const exCount = built.reduce((n, b) => n + b.excluded.length, 0);
  if (exCount) notes.push(`${plural(exCount, 'finished match')} in the loaded data could not be used because no regular-time score is available.`);

  /* fact sentences — each is only emitted when every input exists */
  const facts: string[] = [];
  const H = label(home), A = label(away);
  const md = match.matchday && isLeague ? ` in matchday ${match.matchday}` : '';
  if (result) {
    const { home: hg, away: ag } = result.regularTime;
    const rt = duration && duration !== 'REGULAR' ? ' after regular time' : '';
    facts.push(hg > ag ? `${H} beat ${A} ${hg}–${ag}${rt}${md}.` : hg < ag ? `${A} won ${ag}–${hg} away at ${H}${rt}${md}.` : `${H} and ${A} drew ${hg}–${ag}${rt}${md}.`);
    if (duration === 'EXTRA_TIME') facts.push('The match went to extra time.');
    if (duration === 'PENALTY_SHOOTOUT') facts.push('The match was decided on penalties.');
    if (ht) {
      if (ht.home > ht.away && ag > hg) facts.push(`${A} came from behind to win after trailing ${ht.home}–${ht.away} at half-time.`);
      else if (ht.away > ht.home && hg > ag) facts.push(`${H} came from behind to win after trailing ${ht.away}–${ht.home} at half-time.`);
      else if (ht.home > ht.away && hg === ag) facts.push(`${H} led ${ht.home}–${ht.away} at half-time but the match finished level.`);
      else if (ht.away > ht.home && hg === ag) facts.push(`${A} led ${ht.away}–${ht.home} at half-time but the match finished level.`);
    }
    if (hg === 0 && ag === 0) facts.push('Neither side scored.');
    else if (ag === 0) facts.push(`${H} kept a clean sheet.`);
    else if (hg === 0) facts.push(`${A} kept a clean sheet.`);
  }
  const tense = match.status === 'FINISHED' ? ['were', 'before kickoff'] : ['are', 'now'];
  if (table) {
    const th = table.rows.find((r) => r.team.id === home.id), ta = table.rows.find((r) => r.team.id === away.id);
    if (th && ta && th.playedGames > 0 && ta.playedGames > 0) facts.push(`In the table calculated from results ${tense[1]}, ${H} ${tense[0]} ${ordinal(th.position)} on ${th.points} pts and ${A} ${ordinal(ta.position)} on ${ta.points} pts.`);
  }
  if (form.home.overall.count && form.away.overall.count) {
    facts.push(`Recent form (last ${plural(form.home.overall.count, 'match')} for ${H}, ${form.away.overall.count} for ${A}): ${H} ${wdl(form.home.overall)}, ${A} ${wdl(form.away.overall)}.`);
  }
  if (h2h.meetings) {
    const w = (n: number) => (n === 1 ? 'win' : 'wins');
    facts.push(`${H} and ${A} have met ${plural(h2h.meetings, 'time')} in Goal4U's records: ${h2h.teamAWins} ${H} ${w(h2h.teamAWins)}, ${plural(h2h.draws, 'draw')}, ${h2h.teamBWins} ${A} ${w(h2h.teamBWins)}.`);
    const l = h2h.last[0];
    if (l) facts.push(`The most recent meeting was ${label(l.home)} ${l.homeGoals}–${l.awayGoals} ${label(l.away)} (${new Date(l.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}).`);
  }

  return {
    version: 1, matchId: mid, code, season, kickoff: match.utcDate, teams: { home, away }, result,
    table, tableNote, form, seasonRecords: seasonBlock, lastSeason, h2h, h2hScope, facts, notes,
    coverage: { seasons: [...new Set(files.map((f) => f.season))].sort(), competitions: h2hComps },
  };
}
