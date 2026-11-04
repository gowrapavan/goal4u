/**
 * Validation of legacy stats.json records (legacy_yallashoot_v1 shape).
 *
 * READ-ONLY: the source JSON is never modified, repaired or re-keyed, and a record is
 * never attached to a different match than the one its key names.
 *
 * Three independent questions are answered separately:
 *   1. ASSOCIATION  – is this record really about this fixture?        (hard gate)
 *   2. STATISTICS   – which individual team statistics are usable?      (per statistic)
 *   3. EVENTS       – is the event list complete enough to display?     (separate gate)
 * A failed events check never hides otherwise valid statistics, and a missing/contradictory
 * single statistic never hides the rest. Only a failed association hides everything.
 *
 * Unknown stays unknown: an absent statistic is simply absent (shown as "—"), never 0.
 */
import { regularGoals, type RawMatch } from './match-intel';

export const LEGACY_SOURCE = 'legacy_yallashoot_v1';
/** Written by workers/stats365.py (365scores via koora-l) into data/<season>/<CODE>/stats.json. */
export const STATS365_SOURCE = 'stats365_v1';
/** Fetched on request from koora-l.live while a match is in play (see koora-live.ts). */
export const LIVE_SOURCE = 'koora_live_v1';

export type AssociationState = 'verified' | 'invalid' | 'unavailable' | 'missing';
export type EventsState = 'consistent' | 'excluded' | 'absent';

export interface StatPair { home: string; away: string; hn: number; an: number }
export interface MoreStat extends StatPair { key: string; name: string }
export interface ValidatedStats {
  state: AssociationState;
  reasons: string[];
  source: string;
  stats: Record<string, StatPair> | null;
  /** Extra rows (tackles, big chances ...) from the record's `all_stats`; only for 365scores records. */
  moreStats?: MoreStat[];
  droppedStats: string[];
  events: any[] | null;
  eventsState: EventsState;
  eventsReason: string | null;
  eventsNote: string | null;
  lineups: { home: any | null; away: any | null } | null;
}

const EVENT_TYPES = new Set(['goal', 'yellow_card', 'red_card', 'substitution', 'penalty_missed']);

/* ───────────── name matching (supporting evidence only; the join itself is by id) ───────────── */
const ALIASES: Record<string, string> = { wolves: 'wolverhampton', spurs: 'tottenham', 'man city': 'manchester city', 'man united': 'manchester united', 'man utd': 'manchester united', 'nott m forest': 'nottingham forest', leeds: 'leeds united', newcastle: 'newcastle united' };
const norm = (s: any) => {
  let t = String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/\b(fc|afc|cf|sc|ac|as|hove albion|and hove albion)\b/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return ALIASES[t] ?? t;
};
export function sameTeam(recordName: any, t: any): boolean {
  const r = norm(recordName); if (!r) return false;
  return [t?.name, t?.shortName, t?.tla].some((c) => {
    const n = norm(c); if (!n) return false;
    return n === r || n.includes(r) || r.includes(n);
  });
}

/* ───────────── number helpers ───────────── */
const parseNum = (v: any): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const t = v.replace('%', '').trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; }
  return null;
};
const dayOf = (iso: string) => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');

/* ───────────── 1. association ───────────── */
function checkAssociation(rec: any, match: RawMatch, key: string, code: string): { state: AssociationState; reasons: string[] } {
  const bad: string[] = []; let corroborated = 0;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { state: 'invalid', reasons: ['Record has an unexpected shape.'] };
  if (String(match?.id) !== String(key)) bad.push('Record key does not match the fixture id.');
  if (rec.match_id != null && String(rec.match_id) !== String(match?.id)) bad.push(`Record's own match_id (${rec.match_id}) differs from the fixture id.`);
  if (rec.fd_competition_code != null && String(rec.fd_competition_code).toUpperCase() !== code.toUpperCase()) bad.push('Record belongs to a different competition.');
  if (match?.status !== 'FINISHED') bad.push('The fixture is not a finished match.');

  // final score (authoritative side: matches.json regular-time score)
  const g = regularGoals(match);
  const sh = parseNum(rec.score?.home), sa = parseNum(rec.score?.away);
  if (g && sh !== null && sa !== null) { if (g.home === sh && g.away === sa) corroborated++; else bad.push(`Record score ${sh}–${sa} differs from the fixture score ${g.home}–${g.away}.`); }
  // half-time score, when both exist
  const hh = parseNum(rec.score?.ht_home), ha = parseNum(rec.score?.ht_away);
  const mh = parseNum(match?.score?.halfTime?.home), ma = parseNum(match?.score?.halfTime?.away);
  if (hh !== null && ha !== null && mh !== null && ma !== null && (hh !== mh || ha !== ma)) bad.push(`Record half-time score ${hh}–${ha} differs from the fixture (${mh}–${ma}).`);
  // date embedded in source_url (±1 day for time zones)
  const dm = /(\d{4}-\d{2}-\d{2})\/?$/.exec(String(rec.source_url ?? ''));
  if (dm) { const diff = Math.abs(dayOf(dm[1]) - dayOf(match?.utcDate)) / 86400000; if (diff <= 1) corroborated++; else bad.push(`Record date ${dm[1]} differs from the fixture date.`); }
  // team identity, including swapped orientation
  if (rec.home_team && rec.away_team) {
    const hOk = sameTeam(rec.home_team, match?.homeTeam), aOk = sameTeam(rec.away_team, match?.awayTeam);
    const swapped = sameTeam(rec.home_team, match?.awayTeam) && sameTeam(rec.away_team, match?.homeTeam);
    if (hOk && aOk) corroborated++;
    else if (swapped) bad.push('Record has home and away teams reversed.');
    else if (!hOk && !aOk) bad.push('Record team names do not match the fixture teams.');
    // exactly one side unmatched = possible naming gap only; neither confirms nor refutes.
  }
  if (bad.length) return { state: 'invalid', reasons: bad };
  if (corroborated < 2) return { state: 'unavailable', reasons: ['Not enough independent details (score, date, teams) to confirm this record belongs to the fixture.'] };
  return { state: 'verified', reasons: [] };
}

/* ───────────── 2. statistics ───────────── */
function cleanStats(raw: any): { stats: Record<string, StatPair> | null; dropped: string[]; counts: { yellow: StatPair | null; red: StatPair | null } } {
  const out: Record<string, StatPair> = {}; const dropped: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { stats: null, dropped, counts: { yellow: null, red: null } };
  for (const [k, v] of Object.entries<any>(raw)) {
    const hn = parseNum(v?.home), an = parseNum(v?.away);
    if (hn === null || an === null || hn < 0 || an < 0) { dropped.push(k); continue; } // incomplete (one side / null) → unknown, not 0
    out[k] = { home: String(v.home), away: String(v.away), hn, an };
  }
  const drop = (k: string) => { if (out[k]) { delete out[k]; dropped.push(k); } };
  const p = out.possession;
  if (p && (p.hn > 100 || p.an > 100 || Math.abs(p.hn + p.an - 100) > 2)) drop('possession');
  if (out.shots && out.shots_on_target && (out.shots_on_target.hn > out.shots.hn || out.shots_on_target.an > out.shots.an)) { drop('shots_on_target'); drop('shots'); }
  if (out.total_passes && out.passes_accurate && (out.passes_accurate.hn > out.total_passes.hn || out.passes_accurate.an > out.total_passes.an)) { drop('passes_accurate'); drop('total_passes'); }
  return { stats: Object.keys(out).length ? out : null, dropped, counts: { yellow: out.yellow_cards ?? null, red: out.red_cards ?? null } };
}

/* ───────────── 3. events ───────────── */
function cleanEvents(raw: any, match: RawMatch, counts: { yellow: StatPair | null; red: StatPair | null }, live = false): { events: any[] | null; state: EventsState; reason: string | null; note: string | null } {
  if (!Array.isArray(raw) || raw.length === 0) return { events: null, state: 'absent', reason: null, note: null };
  const g = regularGoals(match);
  if (!g) return { events: null, state: 'excluded', reason: 'The regular-time score is unknown, so the events cannot be checked.', note: null };
  const ev: any[] = []; let malformedGoal = false;
  for (const e of raw) {
    const ok = e && EVENT_TYPES.has(e.type) && (e.team === 'home' || e.team === 'away') && typeof e.minute === 'number' && Number.isFinite(e.minute) && e.minute >= 0 && e.minute <= 130 && typeof e.player === 'string' && e.player.trim() !== '';
    if (ok) ev.push(e); else if (e?.type === 'goal') malformedGoal = true;
  }
  const goals = (side: 'home' | 'away') => ev.filter((e) => e.type === 'goal' && e.team === side).length;
  // LIVE: the score moves before the feed's event list catches up, so a goal-count gap is normal for a minute or two and must not
  // hide every event (that left only the score line updating). Finished matches keep the strict all-or-nothing check.
  if (!live && (malformedGoal || goals('home') !== g.home || goals('away') !== g.away)) {
    return { events: null, state: 'excluded', reason: 'The goal events are incomplete or do not add up to the final score, so no events are shown.', note: null };
  }
  let note: string | null = null; let list = ev;
  const cnt = (t: string, s: 'home' | 'away') => ev.filter((e) => e.type === t && e.team === s).length;
  const mismatch = (t: string, c: StatPair | null) => !!c && (cnt(t, 'home') !== c.hn || cnt(t, 'away') !== c.an);
  const hide: string[] = [];
  if (mismatch('yellow_card', counts.yellow)) hide.push('yellow_card');
  if (mismatch('red_card', counts.red)) hide.push('red_card');
  if (live) { if (goals('home') !== g.home || goals('away') !== g.away) note = 'Live: the event list can trail the score by a minute or two.'; }
  else if (hide.length) { list = ev.filter((e) => !hide.includes(e.type)); note = 'Card events are hidden because they disagree with the recorded card totals.'; }
  return { events: list.length ? list : null, state: list.length ? 'consistent' : 'absent', reason: null, note };
}

/* ───────────── lineups ───────────── */
function cleanSide(side: any): any | null {
  if (!side || !Array.isArray(side.starting) || side.starting.length !== 11) return null;
  if (!side.starting.every((p: any) => p && typeof p.name === 'string' && p.name.trim())) return null;
  const fix = (p: any) => { const r = parseNum(p.rating); const { rating, ...rest } = p; return r !== null && r >= 0 && r <= 10 ? { ...rest, rating: String(p.rating) } : rest; };
  return {
    formation: typeof side.formation === 'string' && side.formation.trim() ? side.formation : null,
    coach: typeof side.coach === 'string' && side.coach.trim() ? side.coach : null,
    starting: side.starting.map(fix),
    subs: Array.isArray(side.subs) ? side.subs.filter((p: any) => p && typeof p.name === 'string' && p.name.trim()) : [],
  };
}

/** Validate one legacy record against the fixture it is filed under. `record` may be undefined. */
export function validateLegacyRecord(record: any, match: RawMatch, key: string, code: string): ValidatedStats {
  const base: ValidatedStats = { state: 'missing', reasons: [], source: LEGACY_SOURCE, stats: null, droppedStats: [], events: null, eventsState: 'absent', eventsReason: null, eventsNote: null, lineups: null };
  if (record == null) return base;
  const a = checkAssociation(record, match, key, code);
  if (a.state !== 'verified') return { ...base, state: a.state, reasons: a.reasons };
  const s = cleanStats(record.stats);
  const e = cleanEvents(record.events, match, s.counts);
  const lh = cleanSide(record.lineups?.home), la = cleanSide(record.lineups?.away);
  return {
    ...base, state: 'verified', stats: s.stats, droppedStats: s.dropped,
    events: e.events, eventsState: e.state, eventsReason: e.reason, eventsNote: e.note,
    lineups: lh || la ? { home: lh, away: la } : null,
  };
}

/* ───────────────────────── 365scores records (workers/stats365.py) ─────────────────────────
 * Same schema as the legacy file (so the statistics / events / line-up cleaning below is SHARED and unchanged), plus
 * `s365_id`, `recorded` and `all_stats`. What differs is how a record is tied to its fixture:
 *   • the match id, competition code and 365scores id must agree with the fixture and with match_map.json;
 *   • a FINISHED fixture must carry a "full time" record — a snapshot taken while the match was in play is never
 *     shown as the final numbers;
 *   • extra-time matches are compared on the full-time score.
 */

/** True for records written by workers/stats365.py (as opposed to the old yallashoot file). */
export const isStats365Record = (r: any): boolean =>
  !!r && typeof r === 'object' && !Array.isArray(r) && (r.s365_id != null || /koora-l\.live|365scores/i.test(String(r.source_url ?? '')));

export interface MapEntry {
  s365_id: number; fd_home_s365_id?: number | null; fd_away_s365_id?: number | null; how?: string;
  fd_home_id?: number | null; fd_away_id?: number | null;
}

/** Keys already shown as the main rows (the old stats.json keys); everything else in `all_stats` is a "more stats" row. */
const MAIN_ALL_STATS = new Set(['yellow_cards', 'red_cards', 'corner_kicks', 'fouls', 'offsides', 'possession', 'shots', 'shots_on_goal',
  'shots_off_goal', 'blocked_shots', 'shots_inside_box', 'shots_outside_box', 'saves', 'total_passes', 'accurate_passes', 'xg']);

export function cleanMoreStats(all: any): MoreStat[] {
  if (!all || typeof all !== 'object' || Array.isArray(all)) return [];
  const out: MoreStat[] = [];
  for (const [key, v] of Object.entries<any>(all)) {
    if (MAIN_ALL_STATS.has(key)) continue;
    const hn = parseNum(v?.home), an = parseNum(v?.away);
    if (hn === null || an === null || hn < 0 || an < 0 || (hn === 0 && an === 0)) continue;
    const name = typeof v?.name === 'string' && v.name.trim() ? v.name.trim() : key.replace(/_/g, ' ');
    if (/[\u0600-\u06FF]/.test(name)) continue;            // an Arabic-only label means "not translated yet": do not show it
    out.push({ key, name, home: String(v.home), away: String(v.away), hn, an });
  }
  return out;
}

/** Shared cleaning of statistics, events and line-ups against ONE score (the fixture's, or the live score). */
export function cleanRecordParts(record: any, scoreMatch: RawMatch, live = false) {
  const s = cleanStats(record?.stats);
  const e = cleanEvents(record?.events, scoreMatch, s.counts, live);
  const lh = cleanSide(record?.lineups?.home), la = cleanSide(record?.lineups?.away);
  return {
    stats: s.stats, droppedStats: s.dropped, moreStats: cleanMoreStats(record?.all_stats),
    events: e.events, eventsState: e.state, eventsReason: e.reason, eventsNote: e.note,
    lineups: lh || la ? { home: lh, away: la } : null,
  };
}

/** A FINISHED fixture that went to extra time: events are checked against the full-time score instead. */
function eventsScoreMatch(match: RawMatch): RawMatch {
  if (regularGoals(match)) return match;
  const ft = match?.score?.fullTime; const h = parseNum(ft?.home), a = parseNum(ft?.away);
  if (match?.status === 'FINISHED' && match?.score?.duration === 'EXTRA_TIME' && h !== null && a !== null) {
    return { status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: h, away: a } } };
  }
  return match;
}

function checkAssociation365(rec: any, match: RawMatch, key: string, code: string, map: MapEntry | null | undefined, live: boolean): { state: AssociationState; reasons: string[] } {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return { state: 'invalid', reasons: ['Record has an unexpected shape.'] };
  const bad: string[] = []; let ok = 0;
  if (String(match?.id) !== String(key)) bad.push('Record key does not match the fixture id.');
  if (rec.match_id != null && String(rec.match_id) !== String(match?.id)) bad.push(`Record's own match_id (${rec.match_id}) differs from the fixture id.`);
  if (rec.fd_competition_code != null && String(rec.fd_competition_code).toUpperCase() !== code.toUpperCase()) bad.push('Record belongs to a different competition.');

  // the 365scores id written with the record must be the one match_map.json holds for this fixture
  if (map?.s365_id != null && rec.s365_id != null) { if (Number(map.s365_id) === Number(rec.s365_id)) ok++; else bad.push('Record 365scores id differs from match_map.json.'); }

  if (!live) {
    if (match?.status !== 'FINISHED') bad.push('The fixture is not a finished match.');
    else if (rec.status !== 'full time') return { state: 'unavailable', reasons: ['Captured while the match was in play; the final statistics have not been recorded yet.'] };
    const rh = parseNum(rec.score?.home), ra = parseNum(rec.score?.away);
    const ft = match?.score?.fullTime; const fh = parseNum(ft?.home), fa = parseNum(ft?.away);
    const reg = regularGoals(match);
    if (rh !== null && ra !== null) {
      const same = (h: number | null | undefined, a: number | null | undefined) => h === rh && a === ra;
      if (same(fh, fa) || same(reg?.home, reg?.away)) ok++; else bad.push(`Record score ${rh}–${ra} differs from the fixture score.`);
    }
    const hh = parseNum(rec.score?.ht_home), ha = parseNum(rec.score?.ht_away), mh = parseNum(match?.score?.halfTime?.home), ma = parseNum(match?.score?.halfTime?.away);
    if (hh !== null && ha !== null && mh !== null && ma !== null && (hh !== mh || ha !== ma)) bad.push(`Record half-time score ${hh}–${ha} differs from the fixture (${mh}–${ma}).`);
  }

  let teamsBoth = false;
  if (rec.home_team && rec.away_team) {
    const hOk = sameTeam(rec.home_team, match?.homeTeam), aOk = sameTeam(rec.away_team, match?.awayTeam);
    const swapped = sameTeam(rec.home_team, match?.awayTeam) && sameTeam(rec.away_team, match?.homeTeam);
    if (hOk && aOk) { ok++; teamsBoth = true; } else if (swapped) bad.push('Record has home and away teams reversed.'); else if (!hOk && !aOk) bad.push('Record team names do not match the fixture teams.');
  }
  if (bad.length) return { state: 'invalid', reasons: bad };
  if (map?.how === 'weak' && !teamsBoth) return { state: 'unavailable', reasons: ['The 365scores match was paired weakly and the team names do not confirm it.'] };
  if (ok < 2) return { state: 'unavailable', reasons: ['Not enough independent details (365scores id, score, teams) to confirm this record belongs to the fixture.'] };
  return { state: 'verified', reasons: [] };
}

/** Validate one workers/stats365.py record against the fixture it is filed under. `live` = the fixture is in play. */
export function validateStats365Record(record: any, match: RawMatch, key: string, code: string, map?: MapEntry | null, opts: { live?: boolean } = {}): ValidatedStats {
  const base: ValidatedStats = { state: 'missing', reasons: [], source: STATS365_SOURCE, stats: null, moreStats: [], droppedStats: [], events: null, eventsState: 'absent', eventsReason: null, eventsNote: null, lineups: null };
  if (record == null) return base;
  const live = !!opts.live;
  const a = checkAssociation365(record, match, key, code, map, live);
  if (a.state !== 'verified') return { ...base, state: a.state, reasons: a.reasons };
  const scoreMatch = live
    ? { status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: parseNum(record.score?.home), away: parseNum(record.score?.away) } } }   // in play: events are judged against the record's own score
    : eventsScoreMatch(match);
  const p = cleanRecordParts(record, scoreMatch, live);
  return { ...base, state: 'verified', ...p };
}
