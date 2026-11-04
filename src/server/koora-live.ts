/**
 * Live match data from koora-l.live (365scores).
 *
 *   GET {KOORA_API}/game/{s365 id}    events, line-ups (with ratings), stages, score, status, minute
 *   GET {KOORA_API}/stats/{s365 id}   team statistics  ({ statistics: [{ competitorId, id, name, value }] })
 *
 * The 365scores id is NOT guessed here: it comes from data/<season>/<CODE>/match_map.json, written by
 * workers/stats365.py (football-data match id → 365scores id + which side is home). This file converts the live
 * response with EXACTLY the same rules as that worker (slug → English names, card folding, own goals, "old" stat keys),
 * so a live payload and the stats.json entry written later have the same shape and the UI cannot tell them apart.
 *
 * Where each source is used (see match-stats.ts):
 *   in play / just finished, not yet recorded  →  this module (cached 15 s per match)
 *   finished and recorded                      →  stats.json ("full time"), validated
 *   neither available                          →  the legacy validated stats path
 */
import { sameTeam, cleanRecordParts, LIVE_SOURCE, type MapEntry, type StatPair, type MoreStat, type EventsState } from './legacy-stats-validation';

export type FetchFn = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export const kooraBase = () => (process.env.KOORA_API || 'https://www.koora-l.live').replace(/\/+$/, '');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.365scores.com', Referer: 'https://www.365scores.com/',
};

/* ───────────────────────── koora stat ids → keys (same table as workers/stats365.py) ───────────────────────── */
const STATS: Record<number, [string, string]> = {
  1: ['yellow_cards', 'Yellow Cards'], 2: ['red_cards', 'Red Cards'], 3: ['shots', 'Total Shots'], 4: ['shots_on_goal', 'Shots on Target'],
  5: ['shots_off_goal', 'Shots off Target'], 6: ['blocked_shots', 'Blocked Shots'], 8: ['corner_kicks', 'Corners'], 9: ['offsides', 'Offsides'],
  10: ['possession', 'Possession'], 12: ['fouls', 'Fouls'], 13: ['free_kicks', 'Free Kicks'], 14: ['goal_kicks', 'Goal Kicks'], 15: ['throw_ins', 'Throw-ins'],
  19: ['accurate_passes', 'Accurate Passes'], 21: ['total_passes', 'Total Passes'], 23: ['saves', 'Goalkeeper Saves'], 24: ['dangerous_chances', 'Dangerous Chances'],
  25: ['hit_woodwork', 'Hit Woodwork'], 29: ['substitutions', 'Substitutions'], 36: ['big_chances_missed', 'Big Chances Missed'], 37: ['fouls_won', 'Fouls Won'],
  40: ['clearances', 'Clearances'], 41: ['interceptions', 'Interceptions'], 46: ['chances_created', 'Chances Created'], 51: ['tackles_won', 'Successful Tackles'],
  52: ['crosses_completed', 'Completed Crosses'], 53: ['long_passes_completed', 'Completed Long Passes'], 54: ['dribbles_completed', 'Completed Dribbles'],
  55: ['ground_duels_won', 'Ground Duels Won'], 56: ['aerial_duels_won', 'Aerial Duels Won'], 60: ['dribbled_past', 'Dribbled Past'],
  66: ['errors_leading_to_goal', 'Errors Leading to Goal'], 73: ['possession_lost', 'Possession Lost'], 76: ['xg', 'Expected Goals (xG)'],
  77: ['xg_conceded', 'Expected Goals Conceded'], 78: ['xg_created', 'Expected Goals Created'], 79: ['xg_on_target', 'Expected Goals on Target (xGOT)'],
  80: ['passes_final_third', 'Passes into Final Third'], 81: ['back_passes', 'Back Passes'], 84: ['final_third_possession', 'Possession in Final Third'],
  146: ['shots_inside_box', 'Shots Inside Box'], 147: ['shots_outside_box', 'Shots Outside Box'], 148: ['passes_own_half', 'Passes in Own Half'],
  149: ['passes_opposition_half', 'Passes in Opposition Half'], 150: ['duels_won', 'Duels Won'],
};
/** stats.json key → koora stat id (null = derived from the score / the events). Order = the old file's key order. */
const OLD_STAT_IDS: [string, number | null][] = [
  ['yellow_cards', 1], ['yellow2rcards', null], ['red_cards', 2], ['corners', 8], ['fouls', 12], ['offsides', 9], ['possession', 10], ['shots', 3],
  ['shots_on_target', 4], ['goals', null], ['shots_off_goal', 5], ['blocked_shots', 6], ['shots_insidebox', 146], ['shots_outsidebox', 147],
  ['goalkeeper_saves', 23], ['total_passes', 21], ['passes_accurate', 19], ['expected_goals', 76],
];

/* ───────────────────────── small helpers ───────────────────────── */
const NUM = /-?\d+(?:\.\d+)?/;
/** '26%' → 26, '0.19' → 0.19, '12 (50%)' → 12, otherwise null. */
export const looseNum = (v: any): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = NUM.exec(String(v ?? '')); return m ? parseFloat(m[0]) : null;
};
const toInt = (v: any): number | null => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : Math.round(n); };
const fmtStat = (key: string, v: number) => key === 'possession' ? `${Math.round(v)}%` : key === 'expected_goals' ? Math.round(v * 100) / 100 : Math.round(v);
const empty = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);

/* ───────────────────────── names (English from the URL slug, like the worker) ───────────────────────── */
const TEAM_UPPER = new Set(['ac', 'as', 'fc', 'ssc', 'us', 'afc', 'cf', 'psv', 'psg', 'rb', 'fk', 'sk', 'rc', 'ud', 'cd', 'vfb', 'vfl', 'tsg', 'fsv', 'rcd', 'ca', 'sc']);
const NAME_LOWER = new Set(['da', 'de', 'di', 'del', 'della', 'van', 'von', 'dos', 'das', 'do', 'la', 'le', 'el', 'al', 'bin', 'ibn', 'ter', 'ten', 'der', 'den', 'y']);
export const SLUG_OK = /^[a-z0-9.'\-]+$/;
export function slugName(slug: string, team = false): string {
  return slug.split('-').filter(Boolean).map((p, i) => team && TEAM_UPPER.has(p) ? p.toUpperCase() : i > 0 && NAME_LOWER.has(p) ? p : p.slice(0, 1).toUpperCase() + p.slice(1)).join(' ');
}
export function playerName(m: any): string | null {
  if (!m) return null;
  const slug = String(m.nameForURL ?? '');
  if (slug && SLUG_OK.test(slug)) return slugName(slug);
  return String(m.name ?? m.shortName ?? '').trim() || null;
}
export const isCoach = (m: any): boolean => {
  if (m?.status === 4) return true;
  const txt = [m?.position?.name, m?.position?.shortName, m?.formation?.name, m?.formation?.shortName].filter(Boolean).map((x: any) => String(x).toLowerCase()).join(' ');
  return ['coach', 'manager', 'مدرب', 'الإدارة'].some((w) => txt.includes(w));
};
const POS_TABLE: Record<string, string> = { goalkeeper: 'g', defender: 'd', midfielder: 'm', attacker: 'f', forward: 'f', g: 'g', gk: 'g', d: 'd', df: 'd', def: 'd', m: 'm', mf: 'm', mid: 'm', f: 'f', fw: 'f', fwd: 'f', a: 'f', att: 'f' };
export function posLetter(m: any): string | null {
  const short = String(m?.position?.shortName ?? m?.formation?.shortName ?? '').toLowerCase();
  if (POS_TABLE[short]) return POS_TABLE[short];
  const txt = [m?.position?.name, m?.formation?.name].filter(Boolean).map((x: any) => String(x).toLowerCase()).join(' ');
  for (const [pat, l] of [[/goalkeep|حارس/, 'g'], [/midfield|وسط/, 'm'], [/forward|striker|attack|wing|هجوم|مهاجم|جناح/, 'f'], [/defen|back|دفاع|مدافع/, 'd']] as [RegExp, string][]) if (pat.test(txt)) return l;
  return null;
}

/* ───────────────────────── events ───────────────────────── */
function baseMinute(e: any): number {
  const m = /^\s*(\d+)/.exec(String(e?.gameTimeDisplay ?? ''));
  if (m) return parseInt(m[1], 10);                                       // "45+2'" → 45, like the old file
  const n = Math.trunc(Number(e?.gameTime)); return Number.isFinite(n) ? n : 0;
}

export function convertEvents(game: any, homeId: number, awayId: number): { events: any[]; yellow2: { home: number; away: number } } {
  const members = new Map<number, any>((game?.members ?? []).filter(Boolean).map((m: any) => [m.id, m]));
  const out: any[] = [];
  for (const e of game?.events ?? []) {
    const et = e?.eventType ?? {}; const etype = et.id;
    const text = `${et.subTypeName ?? ''} ${et.name ?? ''} ${e?.eventSubType?.name ?? ''}`.toLowerCase();
    if (/ملغ|cancel|disallow/.test(text)) continue;
    const disp = String(e?.gameTimeDisplay ?? '').trim();
    const gt = Number.isFinite(Number(e?.gameTime)) && e?.gameTime !== null && e?.gameTime !== undefined ? Number(e.gameTime) : null;
    if (e?.stageId === 11 || (gt !== null && gt > 120 && /^\d{1,2}$/.test(disp))) continue;    // penalty-shoot-out kicks
    const team = e?.competitorId === homeId ? 'home' : e?.competitorId === awayId ? 'away' : null;
    if (!team) continue;
    const minute = baseMinute(e);
    const player = playerName(members.get(e?.playerId));
    const extras = (e?.extraPlayers ?? []).filter((x: any) => x !== null && x !== undefined);
    const pen = /pen|جزاء/.test(text);
    if (pen && /miss|ضائع|أضاع|اهدر|أهدر|مهدر|saved|تصدي/.test(text)) out.push({ minute, type: 'penalty_missed', team, player });
    else if (etype === 1) {
      const own = /\bown\b|ذاتي|عكسي|مرماه/.test(text);
      const ev: any = { minute, type: 'goal', team, player, goal_type: own ? 'own_goal' : pen ? 'penalty' : 'normal' };
      if (extras.length && !own) { const a = playerName(members.get(extras[0])); if (a) ev.assistant = a; }
      out.push(ev);
    } else if (etype === 2) out.push({ minute, type: 'yellow_card', team, player });
    else if (etype === 3) { const ev: any = { minute, type: 'red_card', team, player }; if (/second|2nd|yellow|ثاني|ثانية|صفراء/.test(text)) ev._second = true; out.push(ev); }
    else if (etype === 1000 || etype === 4) out.push({ minute, type: 'substitution', team, player, player_out: extras.length ? playerName(members.get(extras[0])) : null });
  }
  out.sort((a, b) => a.minute - b.minute);                                // stable: source order is kept within a minute
  const extra = { yellow2: { home: 0, away: 0 } };
  return { events: normaliseCards(out, extra), yellow2: extra.yellow2 };
}

/** A second yellow appears ONLY as a red_card (the first yellow stays); the "yellow2rcards" stat counts it. Same rule as the worker. */
function normaliseCards(events: any[], extra: { yellow2: { home: number; away: number } }): any[] {
  const yellows = new Map<string, number>(); const counted = new Set<string>(); const result: any[] = [];
  for (const ev of events) {
    const k = `${ev.team}|${ev.player ?? ''}`;
    if (ev.type === 'yellow_card' && ev.player) {
      yellows.set(k, (yellows.get(k) ?? 0) + 1);
      if ((yellows.get(k) ?? 0) >= 2) {
        if (!counted.has(k)) { counted.add(k); extra.yellow2[ev.team as 'home' | 'away']++; }
        result.push({ minute: ev.minute, type: 'red_card', team: ev.team, player: ev.player }); continue;
      }
    } else if (ev.type === 'red_card') {
      const second = !!ev._second;
      if (ev.player && !counted.has(k)) {
        const dup = result.some((r) => r.type === 'red_card' && `${r.team}|${r.player ?? ''}` === k && Math.abs(r.minute - ev.minute) <= 1);
        if (dup) continue;
        if (second) { counted.add(k); extra.yellow2[ev.team as 'home' | 'away']++; }
      }
    }
    delete ev._second; result.push(ev);
  }
  return result;
}

const goalCounts = (events: any[]) => { const g = events.filter((e) => e.type === 'goal'); return { home: g.filter((e) => e.team === 'home').length, away: g.filter((e) => e.team === 'away').length }; };
/** Own goals credit the side that benefits; if the counts disagree with the score, try the other convention. */
function fixOwnGoals(events: any[], score: { home: number | null; away: number | null }) {
  if (score.home === null || score.away === null) return;
  const same = () => { const c = goalCounts(events); return c.home === score.home && c.away === score.away; };
  if (same()) return;
  const own = events.filter((e) => e.type === 'goal' && e.goal_type === 'own_goal'); if (!own.length) return;
  const flip = () => own.forEach((e) => { e.team = e.team === 'home' ? 'away' : 'home'; });
  flip(); if (!same()) flip();
}

/* ───────────────────────── line-ups ───────────────────────── */
export function buildLineup(comp: any, game: any) {
  const members = new Map<number, any>((game?.members ?? []).filter(Boolean).map((m: any) => [m.id, m]));
  const lu = comp?.lineups ?? {};
  const starters: { key: [number, number, number]; p: any }[] = []; const bench: any[] = []; let coach: string | null = null;
  for (const m of lu.members ?? []) {
    const info = members.get(m?.id) ?? {};
    const merged = { ...info, ...Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => !empty(v))) };   // empty values must not hide real ones
    if (isCoach(merged) || isCoach(m)) { coach = coach ?? playerName(info) ?? playerName(m); continue; }
    if (m?.status !== 1 && m?.status !== 2) continue;                      // 3 = injured / suspended
    const r = Number(m?.ranking ?? info?.ranking); const rating = Number.isFinite(r) && r > 0 ? r : 0;     // -1 = "no rating"
    const jersey = info?.jerseyNumber ?? m?.jerseyNumber;
    const player = { name: playerName(info) ?? playerName(m), number: jersey === null || jersey === undefined || jersey < 0 ? '' : String(jersey), position: posLetter(merged), rating: rating ? String(Math.round(rating * 10) / 10) : null };
    const yard = m?.yardFormation ?? {};
    const key: [number, number, number] = [player.position === 'g' ? 0 : 1, yard.line ?? 99, yard.fieldSide ?? 50];
    if (m.status === 1) starters.push({ key, p: player }); else bench.push(player);
  }
  if (coach === null) for (const m of members.values()) if (m.competitorId === comp?.id && isCoach(m)) { coach = playerName(m); break; }
  starters.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return { formation: typeof lu.formation === 'string' && lu.formation ? lu.formation : null, starting: starters.map((s) => s.p), subs: bench, coach };
}

/* ───────────────────────── score / status ───────────────────────── */
export interface Score { home: number | null; away: number | null; ht_home: number | null; ht_away: number | null }
const derivedScore = (events: any[]): Score => {
  const g = events.filter((e) => e.type === 'goal'); const c = (t: string, ht = false) => g.filter((e) => e.team === t && (!ht || e.minute <= 45)).length;
  return { home: c('home'), away: c('away'), ht_home: c('home', true), ht_away: c('away', true) };
};
/** Full-time score from the competitors, half-time from stage id 7; oriented to the FOOTBALL-DATA home side. */
export function gameScore(game: any, fdHome365: number): Score {
  const hc = game?.homeCompetitor ?? {}, ac = game?.awayCompetitor ?? {}; const swapped = hc.id !== fdHome365;
  let ftH = toInt(hc.score), ftA = toInt(ac.score), htH: number | null = null, htA: number | null = null;
  for (const st of game?.stages ?? []) if (st?.id === 7) { htH = toInt(st.homeCompetitorScore); htA = toInt(st.awayCompetitorScore); }
  if (ftH !== null && ftH < 0) ftH = null; if (ftA !== null && ftA < 0) ftA = null;
  if (htH !== null && htH < 0) htH = null; if (htA !== null && htA < 0) htA = null;       // -1 = not known (half time not reached): never show "HT -1–-1"
  if (htH === null || htA === null) { htH = null; htA = null; }
  return swapped ? { home: ftA, away: ftH, ht_home: htA, ht_away: htH } : { home: ftH, away: ftA, ht_home: htH, ht_away: htA };
}

export type LiveStatus = 'scheduled' | 'live' | 'half time' | 'full time';
const HALF_TIME = /استراحة|half\s*-?\s*time/i;
/** 365scores statusGroup: 2 = not started, 3 = in play, 4 = ended (4 is what the finished sample game carries). */
export function liveStatus(game: any): LiveStatus {
  const g = game?.statusGroup; const txt = `${game?.statusText ?? ''} ${game?.shortStatusText ?? ''}`;
  const hs = toInt(game?.homeCompetitor?.score);
  if (g === 4 && hs !== null && hs >= 0) return 'full time';           // "ended" needs a real score, so a postponed game is not "final"
  if (g === 3 || (g !== 2 && g !== 4 && Number(game?.gameTime) > 0)) return HALF_TIME.test(txt) ? 'half time' : 'live';
  return 'scheduled';
}

/* ───────────────────────── team statistics ───────────────────────── */
export function indexStats(raw: any, h365: number, a365: number): Map<number, { name_ar: string; home: number | null; away: number | null }> {
  const idx = new Map<number, { name_ar: string; home: number | null; away: number | null }>();
  for (const s of raw?.statistics ?? []) {
    if (s?.competitorId !== h365 && s?.competitorId !== a365) continue;
    const row = idx.get(s.id) ?? { name_ar: s.name, home: null, away: null }; idx.set(s.id, row);
    if (s.competitorId === h365) row.home = looseNum(s.value); else row.away = looseNum(s.value);
  }
  return idx;
}

/** Old-format stats dict. Like the old file: a stat is omitted when both teams have 0 / none. */
export function oldStats(idx: Map<number, any>, score: Score, yellow2: { home: number; away: number }) {
  const out: Record<string, { home: string | number; away: string | number }> = {};
  for (const [key, sid] of OLD_STAT_IDS) {
    let h: number | null, a: number | null;
    if (key === 'goals') { h = score.home; a = score.away; }
    else if (key === 'yellow2rcards') { h = yellow2.home; a = yellow2.away; }
    else { const row = sid === null ? null : idx.get(sid); h = row ? row.home : null; a = row ? row.away : null; }
    if (h === null && a === null) continue;
    h = h ?? 0; a = a ?? 0; if (h === 0 && a === 0) continue;
    out[key] = { home: fmtStat(key, h), away: fmtStat(key, a) };
  }
  return out;
}

/** The same "all stats" block the worker stores as `all_stats` (English names only reach the UI). */
export function allStats(idx: Map<number, any>) {
  const rows: Record<string, any> = {};
  for (const [sid, r] of [...idx.entries()].sort((a, b) => a[0] - b[0])) {
    const [key, en] = STATS[sid] ?? [`stat_${sid}`, null];
    rows[key] = { id: sid, name: en ?? r.name_ar, name_ar: r.name_ar, home: r.home, away: r.away };
  }
  return rows;
}

/**
 * Fallback when /stats/{id} is unavailable: add up the per-player numbers that are in the /game response.
 * Only figures that are exact sums are produced (no possession / corners — those are not per-player).
 */
export function statsFromPlayers(game: any, h365: number, a365: number): Map<number, { name_ar: string; home: number | null; away: number | null }> {
  const idx = new Map<number, { name_ar: string; home: number | null; away: number | null }>();
  // [player stat type, team stat id, Arabic label]  — player "fouls committed" (42) is the team's fouls (12)
  const SUM: [number, number, string][] = [[3, 3, 'إجمالي التسديدات'], [4, 4, 'تسديدات على المرمى'], [5, 5, 'تسديدات خارج المرمى'], [6, 6, 'تسديدات تم اعتراضها'], [9, 9, 'حالات التسلل'], [42, 12, 'أخطاء ارتُكبت'], [76, 76, 'أهداف متوقعة'], [23, 23, 'تصديات حارس المرمى']];
  const row = (id: number, ar: string) => { const r = idx.get(id) ?? { name_ar: ar, home: null, away: null }; idx.set(id, r); return r; };
  for (const comp of [game?.homeCompetitor, game?.awayCompetitor]) {
    const cid = comp?.id; if (cid !== h365 && cid !== a365) continue;
    const field = cid === h365 ? 'home' : 'away';
    const totals = new Map<number, number>(); let any = false; let acc = 0, tot = 0, passes = false;
    for (const m of comp?.lineups?.members ?? []) {
      if (!m?.hasStats) continue;
      for (const st of m.stats ?? []) {
        const hit = SUM.find(([src]) => src === st?.type); const v = looseNum(st?.value);
        if (hit && v !== null) { totals.set(hit[1], (totals.get(hit[1]) ?? 0) + v); any = true; }
        if (st?.type === 19) { const mm = /(\d+)\s*\/\s*(\d+)/.exec(String(st.value ?? '')); if (mm) { acc += +mm[1]; tot += +mm[2]; passes = true; } }   // "accurate/total (pct)"
      }
    }
    if (any) for (const [, dst, ar] of SUM) row(dst, ar)[field] = totals.get(dst) ?? 0;
    if (passes) { row(19, 'تمريرات صحيحة')[field] = acc; row(21, 'إجمالي التمريرات')[field] = tot; }
  }
  return idx;
}

/* ───────────────────────── one live payload ───────────────────────── */
export interface LivePayload {
  available: true; source: typeof LIVE_SOURCE; s365Id: number; fetchedAt: string;
  status: LiveStatus; minute: number | null; score: Score;
  stats: Record<string, StatPair> | null; moreStats: MoreStat[]; droppedStats: string[]; statsDerived: boolean;
  events: any[] | null; eventsState: EventsState; eventsReason: string | null; eventsNote: string | null;
  lineups: { home: any | null; away: any | null } | null;
}
export type LiveResult = LivePayload | { available: false; reason: 'no_mapping' | 'upstream_unavailable' | 'mismatch' | 'not_started' };

/** Which koora side is football-data's home side — verified against the game itself, never assumed blindly. */
export function orient(fd: any, map: MapEntry, game: any): { h: number; a: number } | null {
  const hc = game?.homeCompetitor ?? {}, ac = game?.awayCompetitor ?? {};
  const h = map.fd_home_s365_id ?? null, a = map.fd_away_s365_id ?? null;
  if (h && a) return (h === hc.id && a === ac.id) || (h === ac.id && a === hc.id) ? { h, a } : null;     // stale mapping → refuse
  const nm = (c: any) => c?.nameForURL && SLUG_OK.test(String(c.nameForURL)) ? slugName(String(c.nameForURL), true) : '';
  const straight = sameTeam(nm(hc), fd?.homeTeam) && sameTeam(nm(ac), fd?.awayTeam);
  const swapped = sameTeam(nm(hc), fd?.awayTeam) && sameTeam(nm(ac), fd?.homeTeam);
  if (straight) return { h: hc.id, a: ac.id };
  if (swapped) return { h: ac.id, a: hc.id };
  return String(map.how ?? '').startsWith('manual') ? { h: hc.id, a: ac.id } : null;
}

/** Convert one /game (+ optional /stats) response into the payload the UI shows. Pure — unit-tested with a real game. */
export function buildLivePayload(fd: any, code: string, map: MapEntry, game: any, rawStats: any, now: Date = new Date()): LiveResult {
  const o = orient(fd, map, game); if (!o) return { available: false, reason: 'mismatch' };
  const status = liveStatus(game);
  if (status === 'scheduled') return { available: false, reason: 'not_started' };
  const { events, yellow2 } = convertEvents(game, o.h, o.a);
  const gs = gameScore(game, o.h); const dv = derivedScore(events);
  const score: Score = { home: gs.home ?? dv.home, away: gs.away ?? dv.away, ht_home: gs.ht_home ?? dv.ht_home, ht_away: gs.ht_away ?? dv.ht_away };
  fixOwnGoals(events, score);

  let idx = indexStats(rawStats, o.h, o.a); let derived = false;
  if (!idx.size) { idx = statsFromPlayers(game, o.h, o.a); derived = idx.size > 0; }
  const comps = new Map<number, any>([game?.homeCompetitor, game?.awayCompetitor].filter(Boolean).map((c: any) => [c.id, c]));
  const record = {
    stats: oldStats(idx, score, yellow2), all_stats: allStats(idx), events,
    lineups: { home: buildLineup(comps.get(o.h), game), away: buildLineup(comps.get(o.a), game) },
  };
  // events are judged against the live score itself (the data repo's copy of the fixture may lag by minutes)
  const parts = cleanRecordParts(record, { status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: score.home, away: score.away } } }, status === 'live' || status === 'half time');
  const minute = status === 'half time' ? 45 : status === 'live' ? (Number.isFinite(Number(game?.gameTime)) ? Math.max(0, Math.round(Number(game.gameTime))) : null) : null;
  void code;
  return {
    available: true, source: LIVE_SOURCE, s365Id: map.s365_id, fetchedAt: now.toISOString(), status, minute, score,
    stats: parts.stats, moreStats: parts.moreStats, droppedStats: parts.droppedStats, statsDerived: derived && !!parts.stats,
    events: parts.events, eventsState: parts.eventsState, eventsReason: parts.eventsReason, eventsNote: parts.eventsNote, lineups: parts.lineups,
  };
}

/* ───────────────────────── fetching (cached, de-duplicated, never throws) ───────────────────────── */
const TTL_LIVE = 15_000, TTL_FINAL = 10 * 60_000, TTL_FAIL = 30_000;
const cache = new Map<number, { t: number; ttl: number; v: { game: any; stats: any } | null }>();
const inflight = new Map<number, Promise<{ game: any; stats: any } | null>>();
const warned = new Set<string>();

/** GET json with the browser-like headers the 365scores family expects. Never throws; logs each distinct failure once. */
export async function httpJson(url: string, f: FetchFn): Promise<any | null> {
  try {
    const r = await f(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) { const k = `${new URL(url).host}:${r.status}`; if (!warned.has(k)) { warned.add(k); console.warn(`[koora-live] ${url} → HTTP ${r.status}${r.status === 403 || r.status === 429 ? ' (blocked from this server: set KOORA_API / S365_ALLSCORES_URL to a relay you control)' : ''}`); } return null; }
    return await r.json();
  } catch (e: any) { const k = `${new URL(url).host}:err:${e?.name}`; if (!warned.has(k)) { warned.add(k); console.warn(`[koora-live] ${url} failed: ${e?.message || e}`); } return null; }
}
const kooraJson = (path: string, f: FetchFn) => httpJson(`${kooraBase()}${path}`, f);

/** /game + /stats for one 365scores id. Cached 15 s while in play, 10 min once ended, 30 s after a failure; concurrent callers share one request. */
export async function loadKooraSnapshot(s365Id: number, f: FetchFn = fetch as any, nowMs: number = Date.now()): Promise<{ game: any; stats: any } | null> {
  const hit = cache.get(s365Id);
  if (hit && nowMs - hit.t < hit.ttl) return hit.v;
  const running = inflight.get(s365Id); if (running) return running;
  const p = (async () => {
    const [game, stats] = await Promise.all([kooraJson(`/game/${s365Id}`, f), kooraJson(`/stats/${s365Id}`, f)]);
    const g = game?.game ?? null;
    const v = g ? { game: g, stats } : null;
    cache.set(s365Id, { t: nowMs, ttl: !v ? TTL_FAIL : liveStatus(g) === 'full time' ? TTL_FINAL : TTL_LIVE, v: v ?? hit?.v ?? null });
    if (cache.size > 300) cache.delete(cache.keys().next().value as number);
    return v ?? (hit && nowMs - hit.t < 2 * 60_000 ? hit.v : null);          // brief stale-on-error
  })().finally(() => inflight.delete(s365Id));
  inflight.set(s365Id, p); return p;
}

export async function loadLive(fd: any, code: string, map: MapEntry | null | undefined, f: FetchFn = fetch as any): Promise<LiveResult> {
  if (!map?.s365_id) return { available: false, reason: 'no_mapping' };
  const snap = await loadKooraSnapshot(map.s365_id, f);
  if (!snap) return { available: false, reason: 'upstream_unavailable' };
  return buildLivePayload(fd, code, map, snap.game, snap.stats);
}

/** Test hook. */
export const _resetKooraCache = () => { cache.clear(); inflight.clear(); warned.clear(); };
