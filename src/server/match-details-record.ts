/**
 * stats.json (schema 2, written by workers/stats365.py) → the MatchDetails the match page draws. ENGLISH ONLY.
 *
 * stats.json is the PRIMARY source for the Line-ups and Summary details. The live feed (match-details.ts) is only asked
 * for what this record lacks, field by field (see mergeDetails). Player ids are the repo's own ids (the ones stats and
 * player pages already use), so `athleteId` here is the name of the headshot file: public/headshot/{id}.png.
 */
import { commonName } from '../lib/seo-text';
import type { MatchDetails, PlayerDetail, TeamDetail, SubDetail, MissingDetail, ShotDetail, ShotOutcome, Performer, PerformerSide, StatItem, Pos } from '../lib/match-details-types';

const ARABIC = /[\u0600-\u06FF]/;
const latin = (s: any): string | null => (typeof s === 'string' && s.trim() && !ARABIC.test(s) ? s.trim() : null);
const posOf = (p: any): Pos => (['g', 'd', 'm', 'f'].includes(p) ? (p as Pos) : null);
const num = (v: any): number | null => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const posId = (v: any): number | null => { const n = num(v); return n !== null && n > 0 ? n : null; };

/** stats.json player-stat keys → English labels, in display order. Keys that are not here (stat_57 ...) are not shown. */
const STAT_ORDER: [string, string][] = [
  ['goals', 'Goals'], ['assists', 'Assists'], ['xg', 'Expected goals (xG)'], ['xa', 'Expected assists (xA)'], ['xgot', 'xG on target'],
  ['shots', 'Shots'], ['shots_on_target', 'Shots on target'], ['shots_off_target', 'Shots off target'], ['shots_blocked', 'Blocked shots'], ['offsides', 'Offsides'],
  ['chances_created', 'Chances created'], ['dangerous_chances', 'Dangerous chances'], ['big_chances_scored', 'Big chances scored'], ['big_chances_missed', 'Big chances missed'],
  ['passes', 'Accurate passes'], ['long_passes', 'Accurate long passes'], ['passes_final_third', 'Passes into final third'], ['back_passes', 'Back passes'], ['crosses', 'Completed crosses'],
  ['dribbles', 'Completed dribbles'], ['touches', 'Touches'], ['fouls_won', 'Fouls won'], ['fouls_committed', 'Fouls committed'], ['possession_lost', 'Possession lost'], ['dribbled_past', 'Dribbled past'],
  ['clearances', 'Clearances'], ['interceptions', 'Interceptions'], ['recoveries', 'Ball recoveries'], ['tackles_won', 'Tackles won'], ['aerial_duels_won', 'Aerial duels won'], ['ground_duels_won', 'Ground duels won'],
  ['blocks', 'Blocks'], ['defensive_actions', 'Defensive actions'], ['final_third_possession', 'Final-third possession won'],
  ['penalties_won', 'Penalties won'], ['penalties_conceded', 'Penalties conceded'], ['errors_leading_to_shot', 'Errors leading to a shot'], ['errors_leading_to_goal', 'Errors leading to a goal'],
  ['saves', 'Saves'], ['goals_conceded', 'Goals conceded'], ['penalties_saved', 'Penalties saved'], ['xgot_faced', 'xG on target faced'], ['goals_prevented', 'Goals prevented'], ['punches', 'Punches'],
];
const fmt = (v: any): string | null => {
  if (v && typeof v === 'object') { const m = num(v.made), t = num(v.total); return m === null || t === null || t === 0 ? null : `${m}/${t}${num(v.pct) !== null ? ` (${Math.round(v.pct)}%)` : ''}`; }
  const n = num(v); if (n === null || n === 0) return null; return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};
function statList(st: any): StatItem[] {
  if (!st || typeof st !== 'object') return [];
  const out: StatItem[] = [];
  for (const [k, label] of STAT_ORDER) {
    let v = fmt(st[k]); if (!v) continue;
    if (k === 'goals' && num(st.penalty_goals)) v = `${v} (${num(st.penalty_goals)} pen)`;
    out.push({ label, value: v });
  }
  return out;
}

/** Goals, assists, cards per repo player id, from the record's events. */
function eventCounts(events: any[]) {
  const c = new Map<number, { goals: number; own: number; assists: number; yellow: number; red: number }>();
  const get = (id: number) => { let r = c.get(id); if (!r) { r = { goals: 0, own: 0, assists: 0, yellow: 0, red: 0 }; c.set(id, r); } return r; };
  for (const e of events) {
    const id = posId(e?.player_id); if (id === null) continue;
    if (e.type === 'goal') { if (e.goal_type === 'own_goal') get(id).own++; else { get(id).goals++; const a = posId(e.assistant_id); if (a !== null) get(a).assists++; } }
    else if (e.type === 'yellow_card') get(id).yellow++;
    else if (e.type === 'red_card') get(id).red++;
  }
  return c;
}

const INJURY_DETAIL: Record<string, string> = { Personalreasons: 'Personal reasons', 'بطاقة صفراء': 'Suspended (yellow cards)' };
const RETURN_AR: Record<string, string> = { 'شكوك حول مشاركة': 'Doubtful', 'غير معروف': 'Unknown', 'قريبا': 'Soon', 'عاد إلى تدريبات': 'Back in training' };
const WHEN_AR: Record<string, string> = { 'منتصف': 'Mid', 'أوائل': 'Early', 'أواخر': 'Late' };
const MONTH_AR: Record<string, string> = { يناير: 'January', فبراير: 'February', مارس: 'March', أبريل: 'April', مايو: 'May', يونيو: 'June', يوليو: 'July', أغسطس: 'August', سبتمبر: 'September', أكتوبر: 'October', نوفمبر: 'November', ديسمبر: 'December' };
/** "منتصف سبتمبر 2025" → "Mid September 2025"; known phrases from a fixed table; Latin text as is; anything else Arabic → null. */
export function expectedReturnEn(v: any): string | null {
  const s = String(v ?? '').trim(); if (!s) return null;
  if (RETURN_AR[s]) return RETURN_AR[s];
  if (!ARABIC.test(s)) return s;
  const m = /^(\S+)\s+(\S+)\s+(\d{4})$/.exec(s);
  return m && WHEN_AR[m[1]] && MONTH_AR[m[2]] ? `${WHEN_AR[m[1]]} ${MONTH_AR[m[2]]} ${m[3]}` : null;
}

function missingOf(m: any): MissingDetail {
  const susp = m?.reason === 'suspension'; const d = latin(m?.detail);
  return {
    athleteId: posId(m?.id), s365Id: posId(m?.s365_id), name: latin(m?.name) ?? 'Unknown player', pos: posOf(m?.position),
    kind: susp ? 'suspension' : m?.reason === 'injury' ? 'injury' : 'unavailable',
    reason: susp ? (/red/i.test(String(m?.detail)) ? 'Suspended (red card)' : (INJURY_DETAIL[String(m?.detail)] ?? 'Suspended')) : (d ? (INJURY_DETAIL[d] ?? d) : m?.reason === 'injury' ? 'Injured' : null),
    expectedReturn: expectedReturnEn(m?.expected_return),
    season: m?.season && typeof m.season === 'object' ? { appearances: num(m.season.appearances), matches: num(m.season.matches), goals: num(m.season.goals) } : null,
  };
}

function teamOf(side: any, events: any[], counts: ReturnType<typeof eventCounts>, which: 'home' | 'away'): TeamDetail {
  const player = (p: any, i: number): PlayerDetail => {
    const id = posId(p?.id); const ev = id !== null ? counts.get(id) : undefined; const pt = p?.pitch ?? {};
    return {
      id: id ?? -(i + 1), athleteId: id, s365Id: posId(p?.s365_id), name: latin(p?.name) ?? 'Unknown player', number: p?.number == null ? '' : String(p.number),
      pos: posOf(p?.position), role: latin(p?.position_detail), line: typeof pt.line === 'number' ? pt.line : null, side: typeof pt.side === 'number' ? pt.side : null,
      rating: (() => { const r = num(p?.rating); return r !== null && r > 0 ? Math.round(r * 10) / 10 : null; })(), minutes: num(p?.minutes),
      goals: ev?.goals ?? 0, ownGoals: ev?.own ?? 0, assists: ev?.assists ?? 0, yellow: ev?.yellow ?? 0, red: ev?.red ?? 0,
      subbedOffAt: num(p?.sub_off), subbedOnAt: num(p?.sub_on), stats: statList(p?.stats),
      heatmap: typeof p?.heatmap === 'string' && /^https:\/\/imagecache\.365scores\.com\//.test(p.heatmap) ? p.heatmap : null,
    };
  };
  const starters = (side?.starting ?? []).map(player); const bench: PlayerDetail[] = (side?.subs ?? []).map((p: any, i: number) => player(p, i + 100));
  const all = [...starters, ...bench];
  const byId = new Map<number, PlayerDetail>(all.filter((p: PlayerDetail) => p.athleteId !== null).map((p: PlayerDetail) => [p.athleteId as number, p]));
  const subs: SubDetail[] = [];
  for (const e of events) {
    if (e?.type !== 'substitution' || e.team !== which) continue;
    const pin = byId.get(posId(e.player_id) ?? -1), pout = byId.get(posId(e.player_out_id) ?? -1), minute = num(e.minute);
    if (!pin || !pout || minute === null) continue;
    pin.subbedOnAt = pin.subbedOnAt ?? minute; pout.subbedOffAt = pout.subbedOffAt ?? minute; subs.push({ minute, playerIn: pin, playerOut: pout });
  }
  subs.sort((a, b) => a.minute - b.minute);
  const order: Record<string, number> = { g: 0, d: 1, m: 2, f: 3 };
  bench.sort((a, b) => (a.subbedOnAt == null ? 1 : 0) - (b.subbedOnAt == null ? 1 : 0) || (a.subbedOnAt ?? 0) - (b.subbedOnAt ?? 0) || (order[a.pos ?? ''] ?? 9) - (order[b.pos ?? ''] ?? 9));
  const coachName = latin(side?.coach);
  return {
    formation: typeof side?.formation === 'string' && side.formation ? side.formation : null, starters, bench, subs,
    missing: (side?.missing ?? []).map(missingOf), coach: coachName ? { name: coachName, athleteId: posId(side?.coach_id), s365Id: posId(side?.coach_s365_id) } : null,
  };
}

const OUTCOME: Record<string, ShotOutcome> = { goal: 'goal', saved: 'saved', off_target: 'off', blocked: 'blocked', outcome_3: 'post', post: 'post' };
const BODY: Record<string, ShotDetail['body']> = { left_foot: 'Left foot', right_foot: 'Right foot', head: 'Header' };
const SITUATION: Record<string, string> = { assisted: 'Assisted', open_play: 'Open play', corner: 'From a corner', counter_attack: 'Counter-attack', penalty: 'Penalty', free_kick: 'Free kick' };

function shotsOf(rec: any): ShotDetail[] {
  const out: ShotDetail[] = [];
  for (const s of rec?.shots ?? []) {
    const outcome = OUTCOME[s?.outcome]; const xg = num(s?.xg), x = num(s?.x), y = num(s?.y), minute = num(s?.minute);
    if (!outcome || xg === null || x === null || y === null || minute === null || (s.team !== 'home' && s.team !== 'away')) continue;
    out.push({ team: s.team, minute, player: latin(s.player), xg, xgot: num(s.xgot), outcome, body: BODY[s.body_part] ?? null, situation: SITUATION[s.situation] ?? null, x, y });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

const PERF_LABEL: Record<string, string> = { xg: 'Expected goals (xG)', shots_on_target: 'Shots on target', minutes: 'Minutes', interceptions: 'Interceptions', tackles_won: 'Tackles won', clearances: 'Clearances', assists: 'Assists', goals: 'Goals' };
const PERF_ORDER = ['xg', 'shots_on_target', 'interceptions', 'tackles_won', 'clearances', 'assists', 'goals', 'minutes'];
const CATEGORY: [string, string][] = [['attack', 'Attack'], ['midfield', 'Midfield'], ['defence', 'Defence']];
function performersOf(rec: any): Performer[] {
  const side = (p: any): PerformerSide | null => {
    if (!p || !latin(p.name)) return null;
    const stats: StatItem[] = PERF_ORDER.filter((k) => p.stats?.[k] != null && PERF_LABEL[k]).flatMap((k) => { const v = fmt(p.stats[k]); return v ? [{ label: PERF_LABEL[k], value: v }] : []; });
    return { athleteId: posId(p.id), s365Id: posId(p.s365_id), name: latin(p.name)!, role: null, stats };
  };
  return CATEGORY.map(([k, label]): Performer => ({ category: label, home: side(rec?.top_performers?.[k]?.home), away: side(rec?.top_performers?.[k]?.away) })).filter((p) => p.home || p.away);
}

function highlightOf(url: any): MatchDetails['highlights'] {
  const u = String(url ?? ''); const m = /(?:youtube\.com\/watch\?(?:[^#]*&)?v=|youtu\.be\/)([\w-]{6,})/.exec(u);
  return m ? { id: m[1], url: u } : null;
}

/** Build the details from a stats.json record (already validated against the fixture by the caller). Null when it has no line-ups AND no shots. */
export function detailsFromRecord(rec: any, now: Date = new Date()): MatchDetails | null {
  if (!rec || typeof rec !== 'object') return null;
  const events: any[] = Array.isArray(rec.events) ? rec.events : []; const counts = eventCounts(events);
  const home = teamOf(rec.lineups?.home, events, counts, 'home'), away = teamOf(rec.lineups?.away, events, counts, 'away');
  const shots = shotsOf(rec);
  if (!home.starters.length && !away.starters.length && !shots.length) return null;
  const pr = rec.predictions?.result, pg = rec.predictions?.total_goals;
  const win = pr && [pr.home, pr.draw, pr.away].every((n) => num(n) !== null) ? { home: pr.home, draw: pr.draw, away: pr.away, votes: num(pr.votes) ?? 0 } : null;
  const goals = pg && num(pg.line) !== null && num(pg.under) !== null && num(pg.over) !== null ? { line: pg.line, under: pg.under, over: pg.over, votes: num(pg.votes) ?? 0 } : null;
  const pt = rec.play_time; const eff = /(\d+):(\d+)/.exec(String(pt?.effective ?? '')), tot = /(\d+):(\d+)/.exec(String(pt?.total ?? ''));
  const sec = (m: RegExpExecArray) => +m[1] * 60 + +m[2];
  const playTime = eff && tot && sec(tot) > 0 ? { played: eff[0], total: tot[0], share: Math.min(1, sec(eff) / sec(tot)) } : null;
  const st = String(rec.status ?? '');
  return {
    s365Id: Number(rec.s365_id) || 0, fetchedAt: now.toISOString(), source: 'stats.json',
    status: st === 'full time' || st === 'live' || st === 'half time' || st === 'scheduled' ? st : 'full time',
    home, away, shots, performers: performersOf(rec),
    info: { venue: latin(rec.venue?.name), attendance: num(rec.venue?.attendance) && rec.venue.attendance > 0 ? rec.venue.attendance : null, capacity: num(rec.venue?.capacity) && rec.venue.capacity > 0 ? rec.venue.capacity : null, referee: latin(rec.referee), tv: null },
    potm: rec.player_of_the_match && latin(rec.player_of_the_match.name) && (rec.player_of_the_match.team === 'home' || rec.player_of_the_match.team === 'away') ? { athleteId: posId(rec.player_of_the_match.id), name: latin(rec.player_of_the_match.name)!, team: rec.player_of_the_match.team, rating: num(rec.player_of_the_match.rating) } : null,
    highlights: highlightOf(rec.video_url), fans: { win, goals }, playTime,
  };
}

/** s365 id → repo id for every person in the record (players, coaches, missing). Used to give live-feed people the repo's headshot ids. */
export function s365ToRepoIds(rec: any): Map<number, number> {
  const m = new Map<number, number>(); const add = (o: any) => { const a = posId(o?.s365_id), b = posId(o?.id); if (a !== null && b !== null) m.set(a, b); };
  for (const sd of ['home', 'away']) {
    const l = rec?.lineups?.[sd]; (l?.starting ?? []).forEach(add); (l?.subs ?? []).forEach(add); (l?.missing ?? []).forEach(add);
    const c = posId(l?.coach_s365_id), cid = posId(l?.coach_id); if (c !== null && cid !== null) m.set(c, cid);
  }
  for (const e of rec?.events ?? []) { for (const [a, b] of [['player_s365_id', 'player_id'], ['assistant_s365_id', 'assistant_id'], ['player_out_s365_id', 'player_out_id']]) { const x = posId(e?.[a]), y = posId(e?.[b]); if (x !== null && y !== null) m.set(x, y); } }
  return m;
}

/** The live feed's athlete ids are 365scores ids: keep them as s365Id and swap athleteId for the repo id (null when unknown → initials). */
export function remapToRepoIds(d: MatchDetails, ids: Map<number, number>): MatchDetails {
  const fix = <T extends { athleteId: number | null; s365Id?: number | null }>(o: T): T => { const s = o.athleteId; o.s365Id = s; o.athleteId = s != null ? ids.get(s) ?? null : null; return o; };
  for (const t of [d.home, d.away]) {
    [...t.starters, ...t.bench].forEach(fix); t.missing.forEach(fix); if (t.coach) fix(t.coach);
  }
  d.performers.forEach((p) => { if (p.home) fix(p.home); if (p.away) fix(p.away); });
  return d;
}

const keyOf = (p: { s365Id?: number | null; name: string }) => (p.s365Id ? `s${p.s365Id}` : `n${p.name.toLowerCase()}`);

function mergeTeam(a: TeamDetail, b: TeamDetail): TeamDetail {
  if (!a.starters.length && b.starters.length) return b;
  const other = new Map<string, PlayerDetail>([...b.starters, ...b.bench].map((p) => [keyOf(p), p]));
  for (const p of [...a.starters, ...a.bench]) {
    const o = other.get(keyOf(p)); if (!o) continue;
    p.line = p.line ?? o.line; p.side = p.side ?? o.side; p.role = p.role ?? o.role; p.rating = p.rating ?? o.rating; p.minutes = p.minutes ?? o.minutes;
    p.subbedOnAt = p.subbedOnAt ?? o.subbedOnAt; p.subbedOffAt = p.subbedOffAt ?? o.subbedOffAt; if (!p.stats.length) p.stats = o.stats; p.athleteId = p.athleteId ?? o.athleteId;
  }
  // line / side are only usable all together: drop a half-filled pitch rather than draw a broken one
  if (a.starters.some((p) => p.line == null || p.side == null)) a.starters.forEach((p) => { p.line = null; p.side = null; });
  return { formation: a.formation ?? b.formation, starters: a.starters, bench: a.bench.length ? a.bench : b.bench, subs: a.subs.length ? a.subs : b.subs, missing: a.missing.length ? a.missing : b.missing, coach: a.coach ?? b.coach };
}

/** True when the record leaves out something the live feed could supply. */
export function hasGaps(d: MatchDetails): boolean {
  const pitch = (t: TeamDetail) => t.starters.length > 0 && t.starters.every((p) => p.line != null && p.side != null);
  return !pitch(d.home) || !pitch(d.away) || !d.shots.length || !d.performers.length || !d.playTime || !d.highlights || (!d.fans.win && !d.fans.goals) || !d.info.venue || !d.info.referee;
}

/** `primary` wins everywhere it has a value; `fallback` only fills what primary lacks. Returns primary (mutated) with source 'mixed'. */
export function mergeDetails(primary: MatchDetails, fallback: MatchDetails): MatchDetails {
  const p = primary;
  const out: MatchDetails = {
    ...p, source: 'mixed', home: mergeTeam(p.home, fallback.home), away: mergeTeam(p.away, fallback.away),
    shots: p.shots.length ? p.shots : fallback.shots, performers: p.performers.length ? p.performers : fallback.performers,
    info: { venue: p.info.venue ?? fallback.info.venue, attendance: p.info.attendance ?? fallback.info.attendance, capacity: p.info.capacity ?? fallback.info.capacity, referee: p.info.referee ?? fallback.info.referee, tv: p.info.tv ?? fallback.info.tv },
    potm: p.potm ?? fallback.potm ?? null, highlights: p.highlights ?? fallback.highlights, fans: { win: p.fans.win ?? fallback.fans.win, goals: p.fans.goals ?? fallback.fans.goals }, playTime: p.playTime ?? fallback.playTime,
  };
  return out;
}

/**
 * A highlights video for the match from the site's own videos.json, for when neither stats.json nor the live feed has one.
 * A video qualifies when its title says "highlights", names BOTH clubs, and it was uploaded between a day before kick-off and two weeks after.
 */
export function highlightFromVideos(videos: any, match: any): { id: string; url: string } | null {
  if (!Array.isArray(videos) || !match?.homeTeam || !match?.awayTeam) return null;
  const aliases = (t: any): string[] => [...new Set([commonName(Number(t.id), String(t.name ?? '')), t.shortName, String(t.name ?? '').replace(/\b(FC|AFC|CF|SC)\b/gi, '').trim()].filter((x): x is string => typeof x === 'string' && x.length >= 3).map((x) => x.toLowerCase()))];
  const h = aliases(match.homeTeam), a = aliases(match.awayTeam); const ko = Date.parse(match.utcDate);
  if (!Number.isFinite(ko)) return null;
  const best = videos
    .filter((v: any) => typeof v?.videoId === 'string' && /^[\w-]{6,}$/.test(v.videoId) && typeof v.title === 'string')
    .filter((v: any) => { const t = v.title.toLowerCase(), up = Date.parse(v.uploadDate); return /highlight/.test(t) && h.some((x) => t.includes(x)) && a.some((x) => t.includes(x)) && Number.isFinite(up) && up >= ko - 86_400_000 && up <= ko + 14 * 86_400_000; })
    .sort((x: any, y: any) => Date.parse(x.uploadDate) - Date.parse(y.uploadDate))[0];
  return best ? { id: best.videoId, url: `https://www.youtube.com/watch?v=${best.videoId}` } : null;
}

const idxCache = new WeakMap<object, Map<number, number>>();
/** s365 id → repo id for EVERY person in a whole stats.json (all matches so far), so a live match gets headshots for players seen in earlier matches. */
export function s365ToRepoIdsAll(statsJson: any): Map<number, number> {
  const root = statsJson?.data && typeof statsJson.data === 'object' ? statsJson.data : statsJson;
  if (!root || typeof root !== 'object') return new Map();
  const hit = idxCache.get(root); if (hit) return hit;
  const all = new Map<number, number>();
  for (const rec of Object.values<any>(root)) for (const [k, v] of s365ToRepoIds(rec)) all.set(k, v);
  idxCache.set(root, all); return all;
}
