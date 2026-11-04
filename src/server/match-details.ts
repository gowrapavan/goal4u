/**
 * Everything the match page can show from ONE 365scores /game/{id} response, in English only.
 *
 * The provider answers in Arabic. Player and team names come from the URL slugs (already English); every label is either
 * translated here by a fixed table keyed on the provider's numeric ids / constants, or dropped. Nothing Arabic reaches the UI —
 * an unknown statistic or reason is omitted rather than shown untranslated.
 */
import { slugName, playerName, posLetter, isCoach, orient, liveStatus, looseNum, SLUG_OK } from './koora-live';
import type { MapEntry } from './legacy-stats-validation';
import type { MatchDetails, PlayerDetail, TeamDetail, SubDetail, MissingDetail, ShotDetail, ShotOutcome, Performer, PerformerSide, StatItem, Pos } from '../lib/match-details-types';

const ARABIC = /[\u0600-\u06FF]/;
/** The string if it is Latin text, otherwise null. */
const latin = (s: any): string | null => (typeof s === 'string' && s.trim() && !ARABIC.test(s) ? s.trim() : null);

/** Player statistic ids → English labels (read from real games; ids that are not here are not shown). */
export const PLAYER_STAT_LABELS: Record<number, string> = {
  27: 'Goals', 26: 'Assists', 3: 'Shots', 4: 'Shots on target', 5: 'Shots off target', 6: 'Blocked shots', 9: 'Offsides', 76: 'Expected goals (xG)', 78: 'Expected assists (xA)', 79: 'xG on target',
  46: 'Chances created', 24: 'Dangerous chances', 36: 'Big chances missed', 87: 'Big chances scored', 80: 'Passes into final third', 81: 'Back passes', 19: 'Accurate passes', 53: 'Accurate long passes',
  52: 'Completed crosses', 54: 'Completed dribbles', 45: 'Touches', 37: 'Fouls won', 42: 'Fouls committed', 73: 'Possession lost', 60: 'Dribbled past', 40: 'Clearances', 41: 'Interceptions',
  86: 'Ball recoveries', 39: 'Tackles won', 56: 'Aerial duels won', 55: 'Ground duels won', 59: 'Blocks', 47: 'Penalties won', 48: 'Penalties conceded', 65: 'Errors leading to a shot',
  66: 'Errors leading to a goal', 23: 'Saves', 35: 'Goals conceded', 44: 'Penalties saved', 82: 'xG on target faced', 83: 'Goals prevented', 43: 'Punches', 84: 'Final-third possession won', 85: 'Defensive actions',
};
const SKIP_STAT = new Set([30]);       // minutes are shown on their own

/** "2(1ر.ج.)" (2 goals, 1 penalty) → "2 (1 pen)"; anything else that still contains Arabic → null. */
function cleanStatValue(type: number, v: any): string | null {
  const s = String(v ?? '').trim(); if (!s) return null;
  if (type === 27) { const m = /^(\d+)\s*\(\s*(\d+)/.exec(s); if (m) return `${m[1]} (${m[2]} pen)`; }
  return ARABIC.test(s) ? null : s;
}
const isZero = (v: string) => /^0(\.0+)?(\s*\/\s*\d+)?(\s*\(.*\))?$/.test(v) || v === '0/0';

function statList(m: any): StatItem[] {
  if (!m?.hasStats) return [];
  const seen = new Set<number>();
  return [...(m.stats ?? [])].filter((s: any) => s && !SKIP_STAT.has(s.type) && PLAYER_STAT_LABELS[s.type]).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap((s: any) => {
      if (seen.has(s.type)) return []; seen.add(s.type);
      const v = cleanStatValue(s.type, s.value); return v && !isZero(v) ? [{ label: PLAYER_STAT_LABELS[s.type], value: v }] : [];
    });
}

const INJURY_RETURN: Record<string, string> = { 'عاد إلى تدريبات': 'Back in training', 'شكوك حول مشاركة': 'Doubtful' };
const SUSPENSION: Record<string, string> = { 'بطاقة حمراء': 'Suspended (red card)', 'بطاقة صفراء': 'Suspended (yellow cards)' };
const humanize = (c: string) => { const t = c.replace(/_/g, ' ').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };   // "LEG_INJURY" → "Leg injury"

function missingOf(m: any, members: Map<number, any>): MissingDetail {
  const info = members.get(m.id) ?? {};
  const injury = m.injury; const susp = m.suspension;
  return {
    athleteId: info.athleteId > 0 ? info.athleteId : null, name: playerName(info) ?? 'Unknown player', pos: (posLetter(m) as Pos) ?? null,
    kind: susp ? 'suspension' : injury ? 'injury' : 'unavailable',
    reason: susp ? SUSPENSION[susp.name] ?? 'Suspended' : injury?.imageId && /^[A-Z_]+$/.test(String(injury.imageId)) ? humanize(String(injury.imageId)) : injury ? 'Injured' : null,
    expectedReturn: injury ? (INJURY_RETURN[injury.expectedReturn] ?? latin(injury.expectedReturn)) : null,
  };
}

/** Goals, assists and cards per player (by member id), from the event list. */
function eventCounts(game: any) {
  const c = new Map<number, { goals: number; own: number; assists: number; yellow: number; red: number }>();
  const get = (id: number) => { let r = c.get(id); if (!r) { r = { goals: 0, own: 0, assists: 0, yellow: 0, red: 0 }; c.set(id, r); } return r; };
  for (const e of game?.events ?? []) {
    const et = e?.eventType ?? {};
    const text = `${et.subTypeName ?? ''} ${et.name ?? ''} ${e?.eventSubType?.name ?? ''}`.toLowerCase();
    if (/ملغ|cancel|disallow/.test(text) || e?.stageId === 11 || e?.playerId == null) continue;
    if (et.id === 1) {
      if (/\bown\b|ذاتي|عكسي|مرماه/.test(text)) get(e.playerId).own++;
      else { get(e.playerId).goals++; const a = (e.extraPlayers ?? []).find((x: any) => x != null); if (a != null) get(a).assists++; }
    } else if (et.id === 2) get(e.playerId).yellow++;
    else if (et.id === 3) get(e.playerId).red++;
  }
  return c;
}

function teamOf(comp: any, game: any, members: Map<number, any>, counts: ReturnType<typeof eventCounts>): TeamDetail {
  const lu = comp?.lineups ?? {};
  const player = (m: any): PlayerDetail => {
    const info = members.get(m.id) ?? {}; const merged = { ...info, ...m };
    const r = Number(m.ranking); const mins = /^\s*(\d+)/.exec(String((m.stats ?? []).find((s: any) => s?.type === 30)?.value ?? ''));
    const ev = counts.get(m.id); const yard = m.yardFormation ?? {};
    const jersey = info.jerseyNumber ?? m.jerseyNumber;
    return {
      id: m.id, athleteId: info.athleteId > 0 ? info.athleteId : null, name: playerName(info) ?? playerName(m) ?? 'Unknown player', number: jersey == null || jersey < 0 ? '' : String(jersey),
      pos: (posLetter(merged) as Pos) ?? null, role: latin(m.formation?.shortName) ?? latin(m.position?.shortName),
      line: typeof yard.line === 'number' ? yard.line : null, side: typeof yard.fieldSide === 'number' ? yard.fieldSide : null,
      rating: Number.isFinite(r) && r > 0 ? Math.round(r * 10) / 10 : null, minutes: mins ? parseInt(mins[1], 10) : null,
      goals: ev?.goals ?? 0, ownGoals: ev?.own ?? 0, assists: ev?.assists ?? 0, yellow: ev?.yellow ?? 0, red: ev?.red ?? 0,
      subbedOffAt: null, subbedOnAt: null, stats: statList(m),
    };
  };
  const all = (lu.members ?? []).filter(Boolean);
  const starters = all.filter((m: any) => m.status === 1 && !isCoach(m)).map(player);
  const bench = all.filter((m: any) => m.status === 2 && !isCoach(m)).map(player);
  const byId = new Map<number, PlayerDetail>([...starters, ...bench].map((p) => [p.id, p]));
  const subs: SubDetail[] = [];
  for (const m of all.filter((x: any) => x.status === 2 && x.substitution?.playerId != null)) {
    const pin = byId.get(m.id), pout = byId.get(m.substitution.playerId); const minute = Math.round(Number(m.substitution.time));
    if (!pin || !pout || !Number.isFinite(minute)) continue;
    pin.subbedOnAt = minute; pout.subbedOffAt = minute; subs.push({ minute, playerIn: pin, playerOut: pout });
  }
  subs.sort((a, b) => a.minute - b.minute);
  const order: Record<string, number> = { g: 0, d: 1, m: 2, f: 3 };
  bench.sort((a, b) => (a.subbedOnAt == null ? 1 : 0) - (b.subbedOnAt == null ? 1 : 0) || (a.subbedOnAt ?? 0) - (b.subbedOnAt ?? 0) || (order[a.pos ?? ''] ?? 9) - (order[b.pos ?? ''] ?? 9));
  const coachM = all.find((m: any) => isCoach(m) || m.status === 4);
  const coachInfo = coachM ? members.get(coachM.id) : null;
  return {
    formation: typeof lu.formation === 'string' && lu.formation ? lu.formation : null, starters, bench, subs,
    missing: all.filter((m: any) => m.status === 3).map((m: any) => missingOf(m, members)),
    coach: coachInfo ? { name: playerName(coachInfo) ?? 'Coach', athleteId: coachInfo.athleteId > 0 ? coachInfo.athleteId : null } : null,
  };
}

const OUTCOME: Record<number, ShotOutcome> = { 0: 'goal', 1: 'off', 2: 'saved', 3: 'post', 4: 'blocked' };
const BODY: Record<string, ShotDetail['body']> = { 'القدم اليسرى': 'Left foot', 'القدم اليمنى': 'Right foot', 'رأسية': 'Header' };
const SITUATION: Record<number, string> = { 0: 'Counter-attack', 2: 'From a corner', 3: 'Free kick', 4: 'Open play', 7: 'Assisted', 9: 'Penalty' };

function shotsOf(game: any, members: Map<number, any>, koraHomeIsFdHome: boolean): ShotDetail[] {
  const out: ShotDetail[] = [];
  for (const s of game?.chartEvents?.events ?? []) {
    const outcome = OUTCOME[s?.outcome?.id]; const xg = looseNum(s?.xg); const x = Number(s?.side), y = Number(s?.line);
    const t = /^\s*(\d+)/.exec(String(s?.time ?? ''));
    if (!outcome || xg === null || !Number.isFinite(x) || !Number.isFinite(y) || !t || (s.competitorNum !== 1 && s.competitorNum !== 2)) continue;
    const team = (s.competitorNum === 1) === koraHomeIsFdHome ? 'home' : 'away';
    out.push({ team, minute: parseInt(t[1], 10), player: playerName(members.get(s.playerId)), xg, xgot: looseNum(s?.xgot), outcome, body: BODY[s?.bodyPart] ?? null, situation: s.subType != null ? SITUATION[s.subType] ?? null : null, x, y });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

const CATEGORY = ['Attack', 'Midfield', 'Defence'];
const CATEGORY_AR: Record<string, string> = { 'الهجوم': 'Attack', 'الوسط': 'Midfield', 'الدفاع': 'Defence' };
function performersOf(game: any, koraHomeIsFdHome: boolean): Performer[] {
  const side = (p: any): PerformerSide | null => {
    if (!p) return null;
    const stats: StatItem[] = (p.stats ?? []).filter((s: any) => s && PLAYER_STAT_LABELS[s.type]).flatMap((s: any) => { const v = cleanStatValue(s.type, s.value); return v ? [{ label: s.type === 30 ? 'Minutes' : PLAYER_STAT_LABELS[s.type], value: v }] : []; });
    const mins = (p.stats ?? []).find((s: any) => s?.type === 30);
    if (mins && !stats.some((x) => x.label === 'Minutes')) stats.push({ label: 'Minutes', value: String(mins.value) });
    return { athleteId: p.athleteId > 0 ? p.athleteId : null, name: playerName(p) ?? 'Unknown player', role: latin(p.positionShortName), stats };
  };
  return (game?.topPerformers?.categories ?? []).map((c: any, i: number): Performer => {
    const a = side(c.homePlayer), b = side(c.awayPlayer);
    return { category: CATEGORY_AR[c.name] ?? latin(c.name) ?? CATEGORY[i] ?? 'Key players', home: koraHomeIsFdHome ? a : b, away: koraHomeIsFdHome ? b : a };
  }).filter((p: Performer) => p.home || p.away);
}

function fansOf(game: any, koraHomeIsFdHome: boolean): MatchDetails['fans'] {
  const preds = game?.promotedPredictions?.predictions ?? [];
  const pct = (p: any, n: number) => Number(p?.options?.find((o: any) => o.num === n)?.vote?.percentage);
  const win = preds.find((p: any) => p.type === 1); const goals = preds.find((p: any) => p.type === 3);
  const w = win && [1, 2, 3].every((n) => Number.isFinite(pct(win, n))) ? { home: pct(win, koraHomeIsFdHome ? 1 : 3), draw: pct(win, 2), away: pct(win, koraHomeIsFdHome ? 3 : 1), votes: Number(win.totalVotes) || 0 } : null;
  const line = goals ? looseNum(/\d+(?:\.\d+)?/.exec(String(goals.title ?? ''))?.[0]) : null;
  const g = goals && line !== null && Number.isFinite(pct(goals, 1)) && Number.isFinite(pct(goals, 2)) ? { line, under: pct(goals, 1), over: pct(goals, 2), votes: Number(goals.totalVotes) || 0 } : null;
  return { win: w, goals: g };
}

function playTimeOf(game: any): MatchDetails['playTime'] {
  const a = /(\d+):(\d+)/.exec(String(game?.actualPlayTime?.actualTime?.name ?? '')), t = /(\d+):(\d+)/.exec(String(game?.actualPlayTime?.totalTime?.name ?? ''));
  if (!a || !t) return null;
  const sec = (m: RegExpExecArray) => +m[1] * 60 + +m[2]; const tot = sec(t);
  return tot > 0 ? { played: a[0], total: t[0], share: Math.min(1, sec(a) / tot) } : null;
}

/** Build the details for one fixture, or null when the 365scores game is not this fixture (stale pairing). */
export function buildMatchDetails(fd: any, map: MapEntry, game: any, now: Date = new Date()): MatchDetails | null {
  const o = orient(fd, map, game); if (!o) return null;
  const members = new Map<number, any>((game?.members ?? []).filter(Boolean).map((m: any) => [m.id, m]));
  const comps = new Map<number, any>([game?.homeCompetitor, game?.awayCompetitor].filter(Boolean).map((c: any) => [c.id, c]));
  const counts = eventCounts(game); const koraHomeIsFdHome = game?.homeCompetitor?.id === o.h;
  const venueSlug = String(game?.venue?.shortName ?? '');
  const video = game?.video?.url && /youtu/.test(String(game.video.url)) && game.video.id ? { id: String(game.video.id), url: String(game.video.url) } : null;
  return {
    s365Id: map.s365_id, fetchedAt: now.toISOString(), status: liveStatus(game),
    home: teamOf(comps.get(o.h), game, members, counts), away: teamOf(comps.get(o.a), game, members, counts),
    shots: shotsOf(game, members, koraHomeIsFdHome), performers: performersOf(game, koraHomeIsFdHome),
    info: {
      venue: venueSlug && SLUG_OK.test(venueSlug) ? slugName(venueSlug) : null, attendance: game?.venue?.attendance > 0 ? game.venue.attendance : null, capacity: game?.venue?.capacity > 0 ? game.venue.capacity : null,
      referee: latin((game?.officials ?? [])[0]?.name), tv: latin((game?.tvNetworks ?? [])[0]?.name),
    },
    highlights: video, fans: fansOf(game, koraHomeIsFdHome), playTime: playTimeOf(game),
  };
}

import type { DetailsResponse } from '../lib/match-details-types';
import { detailsFromRecord, s365ToRepoIds, remapToRepoIds, mergeDetails, hasGaps, highlightFromVideos } from './match-details-record';

/** Line-ups are published about an hour before kick-off; nothing is asked of the provider earlier than 3 hours before. */
const EARLY_MS = 3 * 3_600_000;

/**
 * The details route as a function. SOURCE ORDER:
 *   FINISHED match with a verified stats.json record — the record first; the live feed is asked only when the record leaves
 *     something out (hasGaps), and then fills only those fields (mergeDetails).
 *   MATCH IN PLAY (`inPlay`) — the live feed first (a stored snapshot is stale); the record fills what the feed lacks.
 *   NO usable record — the live feed alone, as before.
 * Photos use the repo's own player ids (public/headshot/{id}.png): live-feed people are mapped to them through the record's
 * s365_id; a person the record does not know gets initials.
 */
export async function resolveMatchDetails(i: {
  match: any; mapEntry: MapEntry | null; resolveMap?: () => Promise<MapEntry | null>;
  loadSnapshot: (s365Id: number) => Promise<{ game: any } | null>; nowMs?: number;
  /** The stats.json record for this fixture, only when it has been verified against the fixture. */
  record?: any | null; inPlay?: boolean;
  /** The site's videos.json: last resort for a highlights video when stats.json and the live feed have none. */
  loadVideos?: () => Promise<any>;
  /** s365 → repo ids from the whole stats.json, for people who are not in this match's own record (a match in play has none). */
  idMap?: Map<number, number>;
}): Promise<DetailsResponse> {
  const r = await resolveCore(i);
  if (r.available && !r.details.highlights && i.loadVideos && (i.match?.status === 'FINISHED' || r.details.status === 'full time')) {
    const hl = highlightFromVideos(await i.loadVideos().catch(() => null), i.match);
    if (hl) r.details.highlights = hl;
  }
  return r;
}

async function resolveCore(i: Parameters<typeof resolveMatchDetails>[0]): Promise<DetailsResponse> {
  const now = i.nowMs ?? Date.now(); const rec = i.record ?? null; const ids = new Map<number, number>([...(i.idMap ?? []), ...(rec ? s365ToRepoIds(rec) : [])]);
  const fromRec = rec ? detailsFromRecord(rec, new Date(now)) : null;
  const ko = Date.parse(i.match?.utcDate);

  const live = async (): Promise<{ d: MatchDetails | null; reason: Exclude<DetailsResponse, { available: true }>['reason'] }> => {
    if (!fromRec && Number.isFinite(ko) && now < ko - EARLY_MS) return { d: null, reason: 'not_yet' };
    let map = i.mapEntry?.s365_id ? i.mapEntry : null;
    if (!map && i.resolveMap) map = await i.resolveMap();
    if (!map) return { d: null, reason: 'no_mapping' };
    const snap = await i.loadSnapshot(map.s365_id);
    if (!snap) return { d: null, reason: 'upstream_unavailable' };
    const d = buildMatchDetails(i.match, map, snap.game, new Date(now));
    if (!d) return { d: null, reason: 'mismatch' };
    const hasPeople = d.home.starters.length || d.away.starters.length;
    if (!(hasPeople || d.shots.length)) return { d: null, reason: 'not_yet' };
    d.source = 'live'; return { d: remapToRepoIds(d, ids), reason: 'not_yet' };
  };

  if (fromRec && !i.inPlay) {                                    // finished: stats.json first, the feed only for gaps
    if (!hasGaps(fromRec)) return { available: true, details: fromRec };
    const l = await live().catch(() => ({ d: null as MatchDetails | null, reason: 'upstream_unavailable' as const }));
    if (!l.d) return { available: true, details: fromRec };
    const before = JSON.stringify(fromRec); const merged = mergeDetails(fromRec, l.d);
    if (JSON.stringify({ ...merged, source: 'stats.json' }) === before) merged.source = 'stats.json';
    return { available: true, details: merged };
  }
  const l = await live();                                         // in play, or no record: the feed first
  if (!l.d) return fromRec ? { available: true, details: fromRec } : { available: false, reason: l.reason };
  return { available: true, details: fromRec ? mergeDetails(l.d, fromRec) : l.d };
}
