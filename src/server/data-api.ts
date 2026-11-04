import express from "express";
import { getGitHubPathStrict, getAnyGitHubPath, getMediaJSON, getCachedCompetitions, getCachedAnalytics, getCachedMatches, analytics, forecaster } from "./data-cache";
import { resolveTournamentFolder, resolveTournamentYear, getAutoLeagueSeason } from "./season-resolver";
import { buildMatchIntel, previousSeason, seasonOfMatch, type SeasonFile } from "./match-intel";
import { normaliseValues, mergeValues, INR_PER_EUR } from "./market-value";
import { pickLongForm } from "./video-kind";
import { resolveMatchStats, liveWindow } from "./match-stats";
import { isStats365Record, validateStats365Record } from "./legacy-stats-validation";
import { s365ToRepoIdsAll } from "./match-details-record";
import { loadLive, loadKooraSnapshot } from "./koora-live";
import { resolveMatchDetails } from "./match-details";
import { resolveMapEntry } from "./match-resolver";
import { applyLiveOverlay, markOpenUnverified } from "./live-overlay";
import { newestFirst, uploadTime, keepRealThumbs, titleSaysShort } from "./video-kind";
import { withBudget } from "./budget";
import { appearanceFrom, analyseFormation, type Appearance } from "./team-formation";
import { buildRelated, rosterOf, pickNationalFile, normName } from "./related-players";
import { loadCompetitions } from "./competitions-source";
import { safeCode, safeId, safeSeason, safeSquadFile, safeDate, safeCodeList, safeImagePath, encodePath, qs, capMap } from "./safe-input";
import { DATA_BASE, STREAM_BASE, SHORTS_BASE, PUBLIC_BASE, listDir, dataFetch, dataAuthGuard, withTokenQuery } from "./data-source";

const router = express.Router();
// A refused token (401 from the data service) during a request becomes a clear 503 "Data service unavailable" instead of an empty page.
router.use(dataAuthGuard);
// Express 4 does not catch errors thrown inside async handlers: the request would hang or the process would see an unhandled rejection.
// Every GET handler is wrapped: "data could not be fetched" → 503 (the page offers a retry), anything else → 500, never a hang.
{
  const get = router.get.bind(router) as any;
  (router as any).get = (path: any, ...handlers: any[]) => get(path, ...handlers.map((h) => typeof h !== 'function' ? h : (req: any, res: any, next: any) => {
    try {
      const r = h(req, res, next);
      if (r && typeof r.catch === 'function') r.catch((e: any) => {
        if (res.headersSent) return;
        if (e instanceof DataUnavailable) res.status(503).json({ error: 'Data temporarily unavailable. Please try again in a moment.' });
        else { console.error('[data-api]', req.path, e); res.status(500).json({ error: 'Internal error' }); }
      });
    } catch (e) { next(e); }
  }));
}

const LEAGUE_CODES = ["GB1", "ES1", "IT1", "L1", "FR1", "PL", "PD", "BL1", "FL1", "SA", "ELC"];
const CUP_CODES = ["CL", "EURO", "WC", "EC"];

// ── Third-party picture hosts never reach the browser ────────────────────────────────────────────────────────────────────────
// Crest / heat-map addresses inside any JSON answer are rewritten to our own /api/data/ext/<key>/… and served by the proxy route below.
const EXT_HOSTS: Record<string, string> = { c: "https://crests.football-data.org", s: "https://imagecache.365scores.com" };
const EXT_RE = /https:\/\/(crests\.football-data\.org|imagecache\.365scores\.com)\//g;
const maskExternal = (text: string) => text.replace(EXT_RE, (_m, host) => `/api/data/ext/${host.startsWith("crests") ? "c" : "s"}/`);
router.use((_req, res, next) => {
  const original = res.json.bind(res);
  res.json = ((body: any) => {
    let text: string; try { text = JSON.stringify(body); } catch { return original(body); }
    if (text === undefined || !EXT_RE.test(text)) { EXT_RE.lastIndex = 0; return original(body); }
    EXT_RE.lastIndex = 0;
    return res.type("application/json").send(maskExternal(text));
  }) as any;
  next();
});

// Middleware to prevent browser caching for dynamic data
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// ── Input rules, enforced for EVERY route in one place ──────────────────────────────────────────────────────────────────────────
// Path parameters: a route that has one of these names gets it checked before its handler runs (a new route cannot forget).
const bad = (res: any, what: string) => res.status(400).json({ error: `Invalid ${what}` });
router.param("league", (_req, res, next, v) => (safeCode(v) ? next() : bad(res, "league")));
router.param("code", (_req, res, next, v) => (safeCode(v) ? next() : bad(res, "code")));
router.param("type", (_req, res, next, v) => (safeCode(v) ? next() : bad(res, "type")));
router.param("id", (_req, res, next, v) => (safeId(v) ? next() : bad(res, "ID")));
router.param("teamA", (_req, res, next, v) => (safeId(v) ? next() : bad(res, "ID")));
router.param("teamB", (_req, res, next, v) => (safeId(v) ? next() : bad(res, "ID")));
router.param("file", (_req, res, next, v) => (safeSquadFile(v) ? next() : bad(res, "file")));
// Query strings: every value must be ONE plain string (no ?a=1&a=2, no ?a[b]=1), there are at most 12 of them, and the ones that end up in a
// data URL must match their allow-list. An empty value counts as absent.
const QUERY_RULES: Record<string, (v: string) => boolean> = {
  season: (v) => !!safeSeason(v), c: (v) => !!safeCode(v), code: (v) => !!safeCode(v), club: (v) => !!safeId(v),
  file: (v) => !!safeSquadFile(v), from: (v) => !!safeDate(v), to: (v) => !!safeDate(v),
  type: (v) => v === "teams" || v === "players", name: (v) => v.length <= 120, limit: (v) => /^\d{1,4}$/.test(v),
  kind: (v) => /^[a-z]{1,12}$/.test(v), refresh: (v) => v === "0" || v === "1",
  codes: (v) => v.length <= 200,
};
router.use((req, res, next) => {
  const keys = Object.keys(req.query);
  if (keys.length > 12) return bad(res, "query");
  for (const k of keys) {
    const v = req.query[k];
    if (typeof v !== "string") return bad(res, k);
    if (v !== "" && QUERY_RULES[k] && !QUERY_RULES[k](v)) return bad(res, k);
  }
  next();
});

// Data source: GitHub, or the /goal4u-data mirror when GOAL4U_DATA_BASE is set (see data-source.ts).
const GITHUB_BASE = DATA_BASE;

// Helper to determine path based on competition code
const getCompPathRoot = (rawCode: string, rawSeason?: string, compsOverride?: any[]) => {
  const code = safeCode(rawCode);
  if (!code) throw new Error("invalid competition code");        // callers validate first; this is the last line of defence
  const season = rawSeason ? safeSeason(rawSeason) : undefined;   // an unrecognised season is "no season" (the current one), never part of a path
  const codeUpper = code.toUpperCase();
  const isCup = CUP_CODES.includes(codeUpper);

  if (season) {
    const s = season.toLowerCase();
    
    // 1. Detect tournament season slugs (e.g. world-cup-2026, euro-2024)
    if (isCup) {
      if (s.includes('world-cup') || codeUpper === 'WC') {
        const yearMatch = s.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : resolveTournamentYear('WC');
        return `${GITHUB_BASE}/world-cup/world-cup-${year}`;
      }
      if (s.includes('euro') || codeUpper === 'EC' || codeUpper === 'EURO') {
        const yearMatch = s.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : resolveTournamentYear('EC');
        return `${GITHUB_BASE}/euros/euro-${year}`;
      }
    }

    // 2. Check if it's a league season (YYYY-YYYY)
    const isLeagueSeason = /^\d{4}-\d{4}$/.test(season);
    
    if (isLeagueSeason) {
      // Path: data/{2025-2026}/{PL}/
      return `${GITHUB_BASE}/${season}/${code}`;
    } else {
      // Fallback for other season strings - be more restrictive
      if (isValidSeason(season)) {
        return `${GITHUB_BASE}/${season}/${code}`;
      }
      return `${GITHUB_BASE}/${getAutoLeagueSeason().seasonStr}/${code}`;
    }
  }

  const comps = compsOverride || getCachedCompetitions();
  const comp = comps.find(c => c.code === codeUpper || c.code === code);
  
  // 1. Handle Special Tournaments First (WC, EC)
  if (codeUpper === 'WC' || codeUpper === 'world-cup') {
    // Path: data/world-cup/world-cup-2026/ (Based on resolveTournamentFolder)
    return `${GITHUB_BASE}/${resolveTournamentFolder('WC', comp?.currentSeason?.startDate)}`;
  }
  
  if (codeUpper === 'EC' || codeUpper === 'EURO' || codeUpper === 'euro') {
    return `${GITHUB_BASE}/${resolveTournamentFolder('EC', comp?.currentSeason?.startDate)}`;
  }

  // 2. Handle League/Club Competitions with Seasons
  const auto = getAutoLeagueSeason();
  // Never trust cached competition info that lags behind the calendar-derived season.
  const cachedStart = parseInt(comp?.currentSeason?.startDate?.split('-')[0] || '0', 10);
  const useCached = cachedStart >= auto.startYear;
  const seasonYear = useCached ? String(cachedStart) : auto.startYear.toString();
  const endYear = useCached ? (comp?.currentSeason?.endDate?.split('-')[0] || String(cachedStart + 1)) : auto.endYear.toString();
  const seasonStr = `${seasonYear}-${endYear}`;

  // Construct the seasonal path: data/{2025-2026}/{PL}
  return `${GITHUB_BASE}/${seasonStr}/${code}`;
};

// Validation helpers — strict allow-lists (safe-input.ts). A value that is not recognised is rejected, never "cleaned".
const isValidCode = (code: unknown) => !!safeCode(code);
const isValidId = (id: unknown) => !!safeId(id);
const isValidSeason = (s: unknown) => !!safeSeason(s);

router.get("/competitions", async (req, res) => {
  let comps = getCachedCompetitions();
  if (!comps || comps.length === 0) {
    comps = (await loadCompetitions()).comps;
  }

  // Merge with KNOWN_LEAGUES and KNOWN_TOURNAMENTS to ensure slugs and codes are present
  const mergedComps = [...(comps || [])];
  
  [...KNOWN_LEAGUES, ...getKnownTournaments()].forEach(known => {
    const existingIdx = mergedComps.findIndex(c => c.code === known.code);
    if (existingIdx >= 0) {
      mergedComps[existingIdx] = { ...mergedComps[existingIdx], ...known };
    } else {
      mergedComps.push({
        id: known.code,
        ...known,
        emblem: `https://crests.football-data.org/${known.code === 'PD' ? 'laliga' : known.code}.png`,
        currentSeason: { startDate: `${getAutoLeagueSeason().startYear}-01-01` }
      });
    }
  });

  if (mergedComps.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ competitions: mergedComps });
});

// GET /api/data/seasons — every season folder in the data repo (leagues, World Cups, Euros) in one call, so the browser never needs GitHub.
let seasonsCache: { t: number; v: any } | null = null;
router.get("/seasons", async (_req, res) => {
  if (seasonsCache && Date.now() - seasonsCache.t < 10 * 60_000) return res.json(seasonsCache.v);
  const [root, wc, euro1, euro2] = await Promise.all([listDir("data"), listDir("data/world-cup"), listDir("data/euro"), listDir("data/euros")]);
  if (!root) return res.status(503).json({ error: "Season list temporarily unavailable" });
  const dirs = (l: Awaited<ReturnType<typeof listDir>>, pre = "") => (l || []).filter((i) => i.type === "dir" && i.name.startsWith(pre)).map((i) => i.name);
  const v = {
    leagues: dirs(root).filter((n) => /^\d{4}-\d{4}$/.test(n)),
    worldCups: dirs(wc, "world-cup"),
    euros: [...new Set([...dirs(euro1, "euro"), ...dirs(euro2, "euro")])],
  };
  seasonsCache = { t: Date.now(), v };
  res.json(v);
});

// Endpoint to discover competition seasons
router.get("/league-info/:code/seasons", async (req, res) => {
  const { code } = req.params;
  const codeUpper = code.toUpperCase();
  const isCup = CUP_CODES.includes(codeUpper);

  // Discover season folders (via the /goal4u-data mirror's _ls route, or GitHub's contents API when no mirror is set)
  const auto = getAutoLeagueSeason();
  const fallbackSeasons = isCup
    ? (codeUpper === 'CL' ? [auto.seasonStr, `${auto.startYear - 1}-${auto.startYear}`] : [resolveTournamentYear(codeUpper as any).toString()])
    : [auto.seasonStr, `${auto.startYear - 1}-${auto.startYear}`];
  const entries = await listDir(isCup ? `data/league_info/${codeUpper}` : "data");
  if (!entries) return res.json({ seasons: fallbackSeasons, fallback: true });
  const seasons = isCup
    ? entries.filter((i) => i.type === 'dir').map((i) => i.name)
    : entries.filter((i) => i.type === 'dir' && /^\d{4}-\d{4}$/.test(i.name)).map((i) => i.name);
  res.json({ seasons: seasons.sort((a, b) => b.localeCompare(a)) });
});

// New endpoints for Transfermarkt (TM) data integration
router.get("/league-info/:code/:type", async (req, res) => {
  const { code, type } = req.params;
  const season = req.query.season as string;
  const codeUpper = code.toUpperCase();
  const isCup = CUP_CODES.includes(codeUpper);

  const validTypes = [
    'metadata', 'market-values', 'top-scorers', 'successful-players', 
    'top-scorers-all-time', 'all-champions', 'championship-managers', 'players-of-year'
  ];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Invalid type" });
  
  let fileName = type.replace(/-/g, '_') + ".json";
  if (type === 'metadata') fileName = "league_metadata.json";
  
  let url: string;
  if (isCup && type === 'top-scorers-all-time') {
    url = `${GITHUB_BASE}/league_info/${codeUpper}/top_scorers_all_time.json`;
  } else if (isCup && season) {
    // Normalize season slug (e.g. world-cup-2026 -> 2026)
    const yearMatch = season.match(/\d{4}/);
    const normalizedSeason = yearMatch ? yearMatch[0] : season;
    url = `${GITHUB_BASE}/league_info/${codeUpper}/${normalizedSeason}/${fileName}`;
  } else {
    url = `${GITHUB_BASE}/league_info/${codeUpper}/${fileName}`;
  }
  
  const data = await getAnyGitHubPath(url);
  if (!data) return res.status(404).json({ error: "Data not found" });
  res.json(data);
});

router.get("/team-info/:id/competitions", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });

  // Discover squad files in team_informations/{id}/
  const contents = await listDir(`data/team_informations/${id}`);
  if (!contents) return res.status(404).json({ error: "Team directory not found" });

  const squadRegex = /^(?:(?<season>\d{4}-\d{4})-squad|(?<comp>cl|euro|world-cup|national-team)-(?<label>[\w-]+))\.json$/;
  const competitions = contents
    .filter((item) => item.type === 'file' && squadRegex.test(item.name))
    .map((item) => {
      const match = item.name.match(squadRegex);
      if (match?.groups?.season) return { type: 'league', season: match.groups.season, file: item.name };
      return { type: match?.groups?.comp, season: match?.groups?.label, file: item.name };
    });
  res.json(competitions);
});

router.get("/team-info/:id/squad", async (req, res) => {
  const { id } = req.params;
  const file = req.query.file as string; // Optional: specific squad file
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  
  const fileName = file || `${getAutoLeagueSeason().seasonStr}-squad.json`;
  const url = `${GITHUB_BASE}/team_informations/${id}/${fileName}`;
  
  const data = await getAnyGitHubPath(url);
  if (!data) return res.status(404).json({ error: "Squad not found" });
  res.json(data);
});

router.get("/id-lookup", async (req, res) => {
  const name = req.query.name as string;
  const type = req.query.type === 'players' ? 'players' : 'teams'; // only the two registries; anything else is "teams"
  if (!name) return res.status(400).json({ error: "Name required" });

  const url = `${GITHUB_BASE}/id_registry.json`;
  const registry = await getAnyGitHubPath(url);
  
  if (!registry) return res.status(404).json({ error: "Registry not found" });

  const normalized = name.trim().toLowerCase();
  const table = registry[type];
  const id = table && Object.prototype.hasOwnProperty.call(table, normalized) ? table[normalized] : undefined;   // own keys only: "constructor", "__proto__" are not names

  if (id) {
    res.json({ id, name: normalized, type });
  } else {
    res.status(404).json({ error: "Not found in registry" });
  }
});

router.get("/team-info/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  
  const url = `${GITHUB_BASE}/team_informations/${id}/team_metadata.json`;
  const data = await getAnyGitHubPath(url);
  if (!data) return res.status(404).json({ error: "Team info not found" });
  res.json(data);
});

// GET /api/data/player-matches/:id — this season's appearances of one player, read from the stats.json files (same ids as the headshots):
// per match the rating, minutes, goals, assists and cards, plus totals, the club he last played for and his position.
router.get("/player-matches/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const auto = getAutoLeagueSeason().seasonStr;
  const rows: any[] = []; let role: string | null = null; let roleAt = 0;
  await Promise.all(FEATURED_CODES.map(async (code) => {
    const root = getCompPathRoot(code, auto);
    const [st, mm] = await Promise.all([readFileCached(`${root}/stats.json`, false), readFileCached(`${root}/matches.json`, false)]);
    const recs = st ? (st?.data || st) : null; if (!recs || typeof recs !== "object") return;
    const byId = new Map<string, any>(matchList(mm).map((m: any) => [String(m.id), m]));
    for (const [key, rec] of Object.entries<any>(recs)) {
      const m = byId.get(String(key)); if (!m || !rec?.lineups) continue;
      for (const side of ["home", "away"] as const) {
        const l = rec.lineups[side]; if (!l) continue;
        const starter = (l.starting || []).find((q: any) => String(q?.id) === id);
        const sub = starter ? null : (l.subs || []).find((q: any) => String(q?.id) === id);
        const q = starter || sub; if (!q) continue;
        const played = !!starter || q.sub_on != null || (Number(q.minutes) > 0);
        if (!played) continue;
        const ev = Array.isArray(rec.events) ? rec.events : [];
        const pid = Number(id);
        const goals = ev.filter((e: any) => e.type === "goal" && e.goal_type !== "own_goal" && Number(e.player_id) === pid).length;
        const assists = ev.filter((e: any) => e.type === "goal" && Number(e.assistant_id) === pid).length;
        const yellow = ev.filter((e: any) => e.type === "yellow_card" && Number(e.player_id) === pid).length;
        const red = ev.filter((e: any) => e.type === "red_card" && Number(e.player_id) === pid).length;
        const rating = Number(q.rating); const minutes = Number(q.minutes);
        const own = side === "home" ? m.homeTeam : m.awayTeam, opp = side === "home" ? m.awayTeam : m.homeTeam;
        const ft = m.score?.fullTime ?? {};
        rows.push({
          matchId: m.id, code, date: m.utcDate, venue: side === "home" ? "H" : "A", started: !!starter,
          team: { id: own?.id, name: own?.shortName || own?.name, crest: own?.crest ?? null }, opp: { id: opp?.id, name: opp?.shortName || opp?.name, crest: opp?.crest ?? null },
          gf: side === "home" ? ft.home : ft.away, ga: side === "home" ? ft.away : ft.home, status: m.status,
          rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null, minutes: Number.isFinite(minutes) ? minutes : null, goals, assists, yellow, red,
          xg: Number(q.stats?.xg) || 0, shots: Number(q.stats?.shots) || 0,
        });
        const t = Date.parse(m.utcDate) || 0;
        if (t >= roleAt && typeof q.position_detail === "string" && !/[\u0600-\u06FF]/.test(q.position_detail)) { role = q.position_detail; roleAt = t; }
      }
    }
  }));
  rows.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const rated = rows.filter((r) => r.rating != null);
  const sum = (k: string) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const totals = {
    apps: rows.length, starts: rows.filter((r) => r.started).length, minutes: sum("minutes"), goals: sum("goals"), assists: sum("assists"), yellow: sum("yellow"), red: sum("red"),
    xg: Math.round(sum("xg") * 100) / 100, shots: sum("shots"), avgRating: rated.length ? Math.round((rated.reduce((n, r) => n + r.rating, 0) / rated.length) * 10) / 10 : null,
  };
  const last = rows[0];
  res.json({ id: Number(id), season: auto, role, club: last ? { ...last.team, code: last.code } : null, totals, matches: rows.slice(0, 30) });
});

router.get("/player-info/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  
  const url = `${GITHUB_BASE}/player_information/${id}.json`;
  const data = await getAnyGitHubPath(url);
  if (!data) return res.status(404).json({ error: "Player info not found" });
  res.json(data);
});

// These are exactly what your Python pipeline writes — derived from config.py LEAGUE_COMPETITIONS
const KNOWN_LEAGUES = [
  { code: 'PL',  name: 'Premier League',          area: 'England',  slug: 'premier-league' },
  { code: 'PD',  name: 'La Liga',                 area: 'Spain',    slug: 'la-liga' },
  { code: 'BL1', name: 'Bundesliga',              area: 'Germany',  slug: 'bundesliga' },
  { code: 'FL1', name: 'Ligue 1',                 area: 'France',   slug: 'ligue-1' },
  { code: 'SA',  name: 'Serie A',                 area: 'Italy',    slug: 'serie-a' },
  { code: 'CL',  name: 'UEFA Champions League',   area: 'Europe',   slug: 'champions-league' },
  { code: 'ELC', name: 'Championship',            area: 'England',  slug: 'championship' },
];

const KNOWN_TOURNAMENTS_RAW = [
  { code: 'WC', area: 'World', slug: 'fifa-world-cup' },
  { code: 'EC', area: 'Europe', slug: 'european-championship' },
];

const getKnownTournaments = () => [
  { 
    code: 'WC', 
    name: `FIFA World Cup ${resolveTournamentYear('WC')}`, 
    area: 'World', 
    slug: 'fifa-world-cup',
    root: `${GITHUB_BASE}/${resolveTournamentFolder('WC')}` 
  },
  { 
    code: 'EC', 
    name: `UEFA Euro ${resolveTournamentYear('EC')}`, 
    area: 'Europe', 
    slug: 'european-championship',
    root: `${GITHUB_BASE}/${resolveTournamentFolder('EC')}` 
  },
];

let searchIndexCache: any = null;
let lastIndexUpdate = 0;

// Robust aggregate search index endpoint
router.get("/search-index", async (req, res) => {
  const now = Date.now();
  const forceRefresh = req.query.refresh === '1';

  if (!forceRefresh && searchIndexCache && (now - lastIndexUpdate < 300000)) {
    return res.json(searchIndexCache);
  }

  // Get current season from cached competitions or fallback
  let cachedComps = getCachedCompetitions();
  const seasonYear = (() => {
    const comp = cachedComps.find(c => c.currentSeason?.startDate);
    if (comp) return comp.currentSeason.startDate.split('-')[0];
    return getAutoLeagueSeason().startYear.toString();
  })();
  const seasonStr = `${seasonYear}-${parseInt(seasonYear) + 1}`;

  const teamMap = new Map<string, any>();
  const playerMap = new Map<string, any>();

  // Competition items — built directly from KNOWN_LEAGUES + KNOWN_TOURNAMENTS
  const competitionItems = [
    ...KNOWN_LEAGUES.map(c => ({
      id:       `comp-${c.code}`,
      name:     c.name,
      type:     'competition',
      subtitle: c.area,
      slug:     `/competition/${c.slug}`,
      logo:     `https://crests.football-data.org/${c.code === 'PD' ? 'laliga' : c.code}.png`,
    })),
    ...getKnownTournaments().map(c => ({
      id:       `comp-${c.code}`,
      name:     c.name,
      type:     'competition',
      subtitle: c.area,
      slug:     `/competition/${c.slug}`,
      logo:     `https://crests.football-data.org/${c.code === 'WC' ? 'wm26' : 'ec'}.png`,
    })),
  ];

  // Build league roots from the actual GitHub path structure your Python writes
  const allSources = [
    ...KNOWN_LEAGUES.map(c => ({
      code: c.code,
      name: c.name,
      slug: c.slug,
      root: `${GITHUB_BASE}/${seasonStr}/${c.code}`,
    })),
    ...getKnownTournaments().map(c => ({
      code: c.code,
      name: c.name,
      slug: c.slug,
      root: c.root,
    })),
  ];

  // Fetch teams.json and topScorer.json / scorers.json in parallel for all competitions
  await Promise.all(allSources.map(async ({ code, name, slug: compSlug, root }) => {
    const [teamsData, scorersData] = await Promise.all([
      getAnyGitHubPath(`${root}/teams.json`).catch(() => null),
      getAnyGitHubPath(`${root}/topScorer.json`)
        .catch(() => null)
        .then(async d => d || await getAnyGitHubPath(`${root}/scorers.json`).catch(() => null)),
    ]);

    // --- Teams & Squads ---
    if (teamsData) {
      const teams: any[] = Array.isArray(teamsData)
        ? teamsData
        : (teamsData.teams || teamsData.data?.teams || teamsData.data || []);

      for (const t of teams) {
        if (!t?.name) continue;
        const teamId   = t.id?.toString() ?? '';
        const mapKey   = `team-${teamId}`;

        // The TeamPage expects /team/:competitionSlug?teamId=:id
        const slug = `/team/${compSlug}?teamId=${teamId}`;

        if (!teamMap.has(mapKey)) {
          teamMap.set(mapKey, {
            id:           mapKey,
            name:         t.name,
            type:         'team',
            subtitle:     name,
            competitions: [name],
            slug,
            logo:         t.crest || t.logo || null,
          });
        } else {
          const existing = teamMap.get(mapKey)!;
          if (!existing.competitions.includes(name)) {
            existing.competitions.push(name);
            existing.subtitle = existing.competitions.join(' · ');
          }
        }

        // Index players from squad
        if (t.squad && Array.isArray(t.squad)) {
          for (const p of t.squad) {
            if (!p?.name) continue;
            const pId = p.id?.toString() || p.tm_player_id?.toString();
            const pKey = `player-${pId || p.name}`;
            if (!playerMap.has(pKey)) {
              const playerSlug = pId ? `/player/${pId}` : `/player/${encodeURIComponent(p.name.toLowerCase().replace(/\s+/g, '-'))}`;
              playerMap.set(pKey, {
                id:       pKey,
                name:     p.name,
                type:     'player',
                subtitle: `${t.name} · ${name}`,
                slug:     playerSlug,
                logo:     t.crest || t.logo || null,
              });
            }
          }
        }
      }
    }

    // --- Index Players from TM Data (More comprehensive) ---
    const tmTypes = ['market_values', 'top_scorers', 'successful_players'];
    for (const type of tmTypes) {
      const tmUrl = `${GITHUB_BASE}/league_info/${code.toUpperCase()}/${type}.json`;
      const tmData = await getAnyGitHubPath(tmUrl).catch(() => null);
      if (tmData && (Array.isArray(tmData) || Array.isArray(tmData.data))) {
        const players = Array.isArray(tmData) ? tmData : tmData.data;
        for (const p of players) {
          const pName = p.player_name || p.name;
          if (!pName) continue;
          const pId = p.player_id?.toString() || p.tm_player_id?.toString();
          const pKey = `player-${pId || pName}`;
          if (!playerMap.has(pKey)) {
            const playerSlug = pId ? `/player/${pId}` : `/player/${encodeURIComponent(pName.toLowerCase().replace(/\s+/g, '-'))}`;
            playerMap.set(pKey, {
              id:       pKey,
              name:     pName,
              type:     'player',
              subtitle: `${p.club_name || name}`,
              slug:     playerSlug,
              logo:     null,
            });
          }
        }
      }
    }

    // --- Players (Legacy Scorers fallback) ---
    if (scorersData) {
      const scorers: any[] = scorersData.scorers
        || scorersData.data?.scorers
        || (Array.isArray(scorersData) ? scorersData : []);

      for (const s of scorers) {
        const player = s.player || s;
        if (!player?.name) continue;

        const pId = player.id?.toString() || player.tm_player_id?.toString();
        const mapKey = `player-${pId || player.name}`;
        if (playerMap.has(mapKey)) continue;

        const playerSlug = pId ? `/player/${pId}` : `/player/${encodeURIComponent(player.name.toLowerCase().replace(/\s+/g, '-'))}`;
        playerMap.set(mapKey, {
          id:       mapKey,
          name:     player.name,
          type:     'player',
          subtitle: `${s.team?.name || ''} · ${name}`,
          slug:     playerSlug,
          logo:     s.team?.crest || s.team?.logo || null,
        });
      }
    }
  }));

  const finalItems = [
    ...competitionItems,
    ...Array.from(teamMap.values()).map(({ competitions, ...rest }) => rest),
    ...Array.from(playerMap.values()),
  ];

  console.log(
    `[SearchIndex] Built: ${competitionItems.length} competitions, ` +
    `${teamMap.size} teams, ${playerMap.size} players = ${finalItems.length} total`
  );

  searchIndexCache = { items: finalItems };
  lastIndexUpdate  = now;
  res.json(searchIndexCache);
});

router.get("/search-index/debug", async (req, res) => {
  res.json({
    cached:    !!searchIndexCache,
    itemCount: searchIndexCache?.items?.length ?? 0,
    breakdown: searchIndexCache?.items
      ? {
          competitions: searchIndexCache.items.filter((i: any) => i.type === 'competition').length,
          teams:        searchIndexCache.items.filter((i: any) => i.type === 'team').length,
          players:      searchIndexCache.items.filter((i: any) => i.type === 'player').length,
        }
      : null,
    ageSeconds: lastIndexUpdate
      ? Math.round((Date.now() - lastIndexUpdate) / 1000)
      : null,
  });
});

router.get("/streams/:file", async (req, res) => {
  const data = await getAnyGitHubPath(`${STREAM_BASE}/${req.params.file}`);          // :file is checked by router.param("file")
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/matches/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  const data = await getAnyGitHubPath(`${root}/matches.json`);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/standings/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  
  let data = await getAnyGitHubPath(`${root}/standing.json`);
  if (!data) {
    data = await getAnyGitHubPath(`${root}/standings.json`);
  }
  
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/scorers/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  
  // Try both possible filenames for scorers
  let data = await getAnyGitHubPath(`${root}/topScorer.json`);
  if (!data) {
    data = await getAnyGitHubPath(`${root}/scorers.json`);
  }
  
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/teams/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid parameters" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  const data = await getAnyGitHubPath(`${root}/teams.json`);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/stats/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid parameters" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  const data = await getAnyGitHubPath(`${root}/stats.json`);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/match-stats-links/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  const data = await getAnyGitHubPath(`${root}/match_stats_links.json`);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/competition-meta/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid competition" });
  const season = req.query.season as string;
  const root = getCompPathRoot(req.params.league, season);
  
  let data = await getAnyGitHubPath(`${root}/competitionInfo.json`);
  if (!data) {
    data = await getAnyGitHubPath(`${root}/competition.json`);
  }
  
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

router.get("/analytics/teams/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  let data = getCachedAnalytics(`analytics_teams_${req.params.league}_${season || 'current'}`);
  
  if (!data || data.length === 0) {
     const root = getCompPathRoot(req.params.league, season);
     const matches = await getAnyGitHubPath(`${root}/matches.json`);
     if (matches && (matches.data || Array.isArray(matches))) {
        analytics.processLeagueMatches(req.params.league, matches.data || matches, season);
        data = getCachedAnalytics(`analytics_teams_${req.params.league}_${season || 'current'}`);
     }
  }

  if (!data) return res.status(404).json({ error: "Not found", data: [] });
  res.json({ data });
});

router.get("/analytics/players/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  let data = getCachedAnalytics(`analytics_players_${req.params.league}_${season || 'current'}`);

  if (!data || data.length === 0) {
     const root = getCompPathRoot(req.params.league, season);
     const matches = await getAnyGitHubPath(`${root}/matches.json`);
     if (matches && (matches.data || Array.isArray(matches))) {
        analytics.processLeagueMatches(req.params.league, matches.data || matches, season);
        data = getCachedAnalytics(`analytics_players_${req.params.league}_${season || 'current'}`);
     }
  }

  if (!data) return res.status(404).json({ error: "Not found", data: [] });
  res.json({ data });
});

router.get("/analytics/forecast/:league", async (req, res) => {
  if (!isValidCode(req.params.league)) return res.status(400).json({ error: "Invalid league" });
  const season = req.query.season as string;
  
  const root = getCompPathRoot(req.params.league, season);
  const matchesData = await getAnyGitHubPath(`${root}/matches.json`);
  const matches = matchesData?.data || matchesData || [];
  
  let teamStats = getCachedAnalytics(`analytics_teams_${req.params.league}_${season || 'current'}`);
  if (!teamStats || teamStats.length === 0) {
    if (matches.length > 0) {
      analytics.processLeagueMatches(req.params.league, matches, season);
      teamStats = getCachedAnalytics(`analytics_teams_${req.params.league}_${season || 'current'}`);
    }
  }

  if (!teamStats || teamStats.length === 0) {
    return res.status(404).json({ error: "Standings not available for forecast" });
  }

  const forecast = await forecaster.getForecast(req.params.league, matches, teamStats, season);
  res.json({ data: forecast });
});

// Newest-first slice with heavy fields (comments, long descriptions) stripped.
// Usage: /shorts?limit=40 — the full 13 MB file is only sent when no limit is given.
const sliceMedia = (data: any, limitRaw: any) => {
  const limit = parseInt(String(limitRaw), 10);
  if (!(limit > 0) || !Array.isArray(data)) return data;
  return newestFirst(data)
    .slice(0, Math.min(limit, 300))
    .map(({ comments, description, tags, ...rest }: any) => ({ ...rest, tags: (tags || []).slice(0, 6) }));
};

// The finished list (after the thumbnail checks) is kept for 2 minutes per request shape: the checks cost up to 120 requests, the answer rarely changes.
const mediaAnswers = new Map<string, { at: number; body: any }>();
const answerMemo = (key: string) => { const h = mediaAnswers.get(key); return h && Date.now() - h.at < 120_000 ? h.body : undefined; };
const rememberAnswer = (key: string, body: any) => { if (Array.isArray(body) && body.length) { if (mediaAnswers.size > 40) mediaAnswers.clear(); mediaAnswers.set(key, { at: Date.now(), body }); } return body; };

router.get("/shorts", async (req, res) => {
  const src = await getMediaJSON(`${SHORTS_BASE}/shorts_data/shorts.json`);
  if (src.ok === false) return src.status === 404 ? res.status(404).json({ error: "Not found" }) : res.status(502).json({ error: "Shorts temporarily unavailable" });   // 502 = the browser asks again; 404 would be final
  const data = src.data;
  const limit = parseInt(String(req.query.limit), 10);
  const memoKey = `shorts:${limit}`;
  const memo = answerMemo(memoKey); if (memo && !src.stale) return res.json(memo);
  if (limit > 0 && Array.isArray(data)) {
    // A short without a real thumbnail would be a grey card in the row: look at twice as many as asked for, keep the ones that have one.
    const probe = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(3500) }); return r.ok ? (await r.arrayBuffer()).byteLength : 0; };
    const cand = newestFirst(data).slice(0, Math.min(limit * 2, 120));
    const real = (await withBudget(keepRealThumbs(cand, probe), 1800, () => cand)).slice(0, Math.min(limit, 300));   // unchecked ones are kept; the card hides itself if its picture is the grey placeholder
    return res.json(rememberAnswer(memoKey, real.map(({ comments, description, tags, ...rest }: any) => ({ ...rest, tags: (tags || []).slice(0, 6) }))));
  }
  res.json(sliceMedia(data, req.query.limit));
});

router.get("/videos", async (req, res) => {
  const src = await getMediaJSON(`${SHORTS_BASE}/videos_data/videos.json`);
  if (src.ok === false) return src.status === 404 ? res.status(404).json({ error: "Not found" }) : res.status(502).json({ error: "Videos temporarily unavailable" });
  const data = src.data;
  const limit = parseInt(String(req.query.limit), 10);
  // ?kind=video → long-form only: YouTube Shorts that leaked into videos.json are filtered out (see video-kind.ts).
  if (req.query.kind === "video" && limit > 0 && Array.isArray(data)) {
    const memoKey = `videos:${limit}`;
    const memo = answerMemo(memoKey); if (memo && !src.stale) return res.json(memo);
    const newest = newestFirst(data);
    // Diagnostics: if these two dates are old, the SOURCE (shortsdata/videos_data/videos.json) has nothing newer — the scraper is what needs a run.
    res.set("X-Videos-Source-Newest", new Date(uploadTime(newest[0])).toISOString());
    const shortsData = await getMediaJSON(`${SHORTS_BASE}/shorts_data/shorts.json`).then((r) => (r.ok ? r.data : null)).catch(() => null);
    const exclude = new Set<string>((Array.isArray(shortsData) ? shortsData : []).map((x: any) => String(x.videoId)));
    const thumbProbe = async (url: string) => {
      const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
      return r.ok ? (await r.arrayBuffer()).byteLength : 0;     // a 404 thumbnail also counts as "no real thumbnail"
    };
    const quick = () => newest.filter((v: any) => !titleSaysShort(v.title) && !exclude.has(String(v.videoId))).slice(0, Math.min(limit, 100));   // no network: titles only
    const picked = await withBudget(pickLongForm(newest, Math.min(limit, 100), { fetcher: fetch as any, thumbProbe, exclude }), 2500, quick);
    return res.json(rememberAnswer(memoKey, picked.map(({ comments, description, tags, ...rest }: any) => ({ ...rest, tags: (tags || []).slice(0, 6) }))));
  }
  res.json(sliceMedia(data, req.query.limit));
});


// GET /api/data/ext/<c|s>/<path>  — a picture from one of two allow-listed hosts, fetched by the server; the browser never learns the host.
const extPics = new Map<string, { type: string; buf: Buffer }>();
const EXT_SEG = /^[\w.,:~%+@=-]{1,200}$/;
router.get("/ext/:k/*", async (req, res) => {
  const base = EXT_HOSTS[String(req.params.k)];
  const rel = String((req.params as any)[0] || "");
  const parts = rel.split("/");
  if (!base || !rel || parts.length > 10 || parts.some((x) => !EXT_SEG.test(x) || x === "." || x === "..")) return res.status(400).type("text/plain").send("Invalid image path");
  const q = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  if (q.length > 200 || /[\r\n\s]/.test(q)) return res.status(400).type("text/plain").send("Invalid image path");
  res.removeHeader("Pragma"); res.removeHeader("Expires"); res.removeHeader("Surrogate-Control");
  const fail = (status: number, cache = "no-store") => { res.set("Cache-Control", cache); return res.status(status).type("text/plain").send(status === 404 ? "Not found" : "Image unavailable"); };
  const target = `${base}/${parts.map(encodeURIComponent).map((x) => x.replace(/%2C/gi, ",").replace(/%3A/gi, ":")).join("/")}${q}`;
  const sendPic = (type: string, buf: Buffer) => {
    res.set({ "Content-Type": type, "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800", "X-Content-Type-Options": "nosniff" });
    if (type === "image/svg+xml") res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    return res.send(buf);
  };
  const kept = extPics.get(target); if (kept) return sendPic(kept.type, kept.buf);      // crests are tiny and hardly ever change: kept in memory
  let up: globalThis.Response | undefined;
  for (let i = 0; i < 2 && !up; i++) {                                                  // one more try: a first request to a cold host often fails
    try { const r = await fetch(target, { signal: AbortSignal.timeout(6000), headers: { Accept: "image/*", "User-Agent": "Mozilla/5.0" } }); if (r.status < 500) up = r; } catch { /* try again */ }
  }
  if (!up) { res.set("X-Upstream-Status", "unreachable"); return fail(502); }       // open the picture's address in the browser: this header says what the source answered
  res.set("X-Upstream-Status", String(up.status));
  if (up.status === 404) return fail(404, "public, max-age=300");
  if (!up.ok) return fail(502);
  const type = (up.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/.test(type)) return fail(502);
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.byteLength > 3 * 1024 * 1024) return fail(502);
  if (extPics.size > 400) extPics.clear();
  extPics.set(target, { type, buf });
  return sendPic(type, buf);
});

// GET /api/data/img/<path under public/>   e.g. /api/data/img/headshot/10000.png
// The browser's ONLY way to a picture that lives on the data service. The path is checked against an allow-list (safe-input.ts → safeImagePath),
// the access token is added HERE (never in the page), the answer must really be a small image, and it is cached hard: the CDN and the browser keep it a day.
const IMG_MAX_BYTES = 3 * 1024 * 1024;
const IMG_TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml|avif)$/;
router.get("/img/*", async (req, res) => {
  const rel = safeImagePath((req.params as any)[0]);
  if (!rel) return res.status(400).type("text/plain").send("Invalid image path");
  res.removeHeader("Pragma"); res.removeHeader("Expires"); res.removeHeader("Surrogate-Control");          // the router-wide "never cache" does not apply to pictures
  const fail = (status: number, text: string, cache = "no-store") => { res.set("Cache-Control", cache); return res.status(status).type("text/plain").send(text); };
  let up: globalThis.Response;
  try { up = await dataFetch(withTokenQuery(`${PUBLIC_BASE}/${encodePath(rel)}`), { timeoutMs: 8000, headers: { Accept: "image/*" } }); }
  catch { return fail(502, "Image unavailable"); }
  if (up.status === 404) return fail(404, "Not found", "public, max-age=300");                        // missing pictures are common (the page falls back to initials): remember that briefly
  if (!up.ok) return fail(up.status === 401 ? 503 : 502, "Image unavailable");
  const type = (up.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!IMG_TYPES.test(type)) return fail(502, "Not an image");
  if (Number(up.headers.get("content-length") || 0) > IMG_MAX_BYTES) return fail(502, "Image too large");
  const buf = Buffer.from(await up.arrayBuffer());
  if (buf.length > IMG_MAX_BYTES) return fail(502, "Image too large");
  res.set({
    "Content-Type": type,
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",                   // an SVG can never run script from here
    "Cross-Origin-Resource-Policy": "same-site",
  });
  res.status(200).send(buf);
});

router.get("/backdrop/:code", async (req, res) => {
  if (!isValidCode(req.params.code)) return res.status(400).send("Invalid code");
  
  const url = `${PUBLIC_BASE}/League_backdrops/${req.params.code}.png`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const fetchRes = await dataFetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!fetchRes.ok) return res.status(404).send("Not found");
    
    // Set caching headers
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.setHeader('Content-Type', 'image/png');
    
    const buffer = await fetchRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.get("/analytics/h2h/:teamA/:teamB", async (req, res) => {
  const { teamA, teamB } = req.params;
  
  // We cannot afford to iterate EVERY competition and fetch them all if caches are empty - that would take 10+ github API calls
  // However, we can use the competitions from github to know what exists
  let comps = getCachedCompetitions();
  if (comps.length === 0) {
     comps = (await loadCompetitions()).comps;
  }
  
  let h2hMatches = [];
  
  for (const c of comps) {
    let matches = getCachedMatches(c.code);
    if (!matches || matches.length === 0) {
       const root = getCompPathRoot(c.code);
       const mData = await getAnyGitHubPath(`${root}/matches.json`);
       if (mData && (mData.data || Array.isArray(mData))) matches = mData.data || mData;
    }
    
    if (!matches) continue;

    for (const m of matches) {
      if (m.status !== 'FINISHED' && m.status !== 'AWARDED') continue;
      
      const homeId = m.homeTeam?.id?.toString();
      const awayId = m.awayTeam?.id?.toString();
      
      if ((homeId === teamA && awayId === teamB) || (homeId === teamB && awayId === teamA)) {
         h2hMatches.push(m);
      }
    }
  }
  
  // Aggregate H2H stats
  let aWins = 0, bWins = 0, draws = 0;
  let aGoals = 0, bGoals = 0;
  
  for (const m of h2hMatches) {
     const homeId = m.homeTeam?.id?.toString();
     const hG = m.score?.fullTime?.home ?? 0;
     const aG = m.score?.fullTime?.away ?? 0;
     
     if (homeId === teamA) {
        aGoals += hG;
        bGoals += aG;
        if (hG > aG) aWins++;
        else if (hG < aG) bWins++;
        else draws++;
     } else {
        aGoals += aG;
        bGoals += hG;
        if (aG > hG) aWins++;
        else if (aG < hG) bWins++;
        else draws++;
     }
  }

  res.json({
    data: {
      teamA: { id: teamA, wins: aWins, goals: aGoals },
      teamB: { id: teamB, wins: bWins, goals: bGoals },
      draws,
      totalMatches: h2hMatches.length,
      matches: h2hMatches.slice(0, 10).reverse() // specific match data for recent context
    }
  });
});

router.get("/standings/all", async (req, res) => {
  let comps = getCachedCompetitions();
  if (!comps || comps.length === 0) {
    comps = (await loadCompetitions()).comps;
  }

  const allStandings: Record<string, any> = {};
  
  if (Array.isArray(comps)) {
    const standingsPromises = comps.map(async (c) => {
      if (!c.code) return null;
      const root = getCompPathRoot(c.code);
      const standing = await getAnyGitHubPath(`${root}/standing.json`) || 
                       await getAnyGitHubPath(`${root}/standings.json`);
      if (standing) {
        return {
          code: c.code,
          competitionName: c.name,
          table: standing.data?.standings?.[0]?.table || standing.standings?.[0]?.table || standing.data?.[0]?.table || standing[0]?.table || []
        };
      }
      return null;
    });

    const results = await Promise.all(standingsPromises);
    results.forEach(res => {
      if (res) {
        allStandings[res.code] = {
          competitionName: res.competitionName,
          table: res.table
        };
      }
    });
  }
  res.json(allStandings);
});

// Added a dedicated teams endpoint for search indexing
router.get("/teams/all", async (req, res) => {
  let comps = getCachedCompetitions();
  const allTeams: any[] = [];

  if (Array.isArray(comps)) {
    const teamsPromises = comps.map(async (c) => {
      const root = getCompPathRoot(c.code);
      const data = await getAnyGitHubPath(`${root}/teams.json`);
      if (data) {
        const teams = data.teams || data.data || (Array.isArray(data) ? data : []);
        return teams.map((t: any) => ({ ...t, competitionName: c.name }));
      }
      return [];
    });

    const results = await Promise.all(teamsPromises);
    results.forEach(teams => allTeams.push(...teams));
  }
  res.json(allTeams);
});

// ─────────────────────────────────────────────────────────────────────────────
// Goal4U v4 additions (additive — no existing route changed)
// ─────────────────────────────────────────────────────────────────────────────
const FEATURED_CODES = ["PL", "PD", "SA", "BL1", "FL1", "CL", "ELC"];

const slimTeam = (t: any) => t && ({ id: t.id, name: t.name, shortName: t.shortName, tla: t.tla, crest: t.crest });
const slimMatch = (m: any, code: string) => ({
  id: m.id,
  seasonSlug: seasonOfMatch(m),
  code: m.competition?.code || m.competition_code || code,
  competition: { name: m.competition?.name, emblem: m.competition?.emblem, type: m.competition?.type },
  utcDate: m.utcDate,
  status: m.status,
  minute: m.minute ?? null,
  matchday: m.matchday,
  stage: m.stage,
  group: m.group,
  homeTeam: slimTeam(m.homeTeam),
  awayTeam: slimTeam(m.awayTeam),
  score: m.score && {
    winner: m.score.winner,
    duration: m.score.duration,
    fullTime: m.score.fullTime,
    halfTime: m.score.halfTime,
    penalties: m.score.penalties,
  },
});

const matchList = (raw: any): any[] => raw?.matches || raw?.data || (Array.isArray(raw) ? raw : []);

/** Trimmed, date-windowed matches across competitions. Shared by GET /feed and the news route. */
export async function loadFeed(codes: string[], from = "", to = "", season?: string): Promise<any[]> {
  const out: any[] = [];
  await Promise.all(codes.filter(isValidCode).slice(0, 14).map(async (code) => {
    const raw = await getAnyGitHubPath(`${getCompPathRoot(code, season)}/matches.json`).catch(() => null);
    for (const m of matchList(raw)) {
      const d = String(m.utcDate || "").slice(0, 10);
      if ((from && d < from) || (to && d > to)) continue;
      out.push(slimMatch(m, code));
    }
  }));
  out.sort((a, b) => String(a.utcDate).localeCompare(String(b.utcDate)));
  return out;
}
export const FEED_CODES = FEATURED_CODES;

// GET /api/data/feed?from=YYYY-MM-DD&to=YYYY-MM-DD&codes=PL,PD&season=2026-2027
// One trimmed, date-windowed, cross-competition match list (instead of N × ~1 MB files).
router.get("/feed", async (req, res) => {
  const asked = safeCodeList(req.query.codes);
  const codes = asked.length ? asked : FEATURED_CODES;
  const from = req.query.from ? String(req.query.from) : "";
  const to = req.query.to ? String(req.query.to) : "";
  const season = req.query.season ? String(req.query.season) : undefined;
  // The repo snapshot can lag behind the match: bring fixtures that are under way (or just over) forward from the live source.
  const feed = await loadFeed(codes, from, to, season);
  res.json({ matches: await withBudget(applyLiveOverlay(feed), 1500, () => markOpenUnverified(feed)) });      // the live source may take its time: the page does not wait for it
});

// ── Match lookup helpers (season-aware, cached, no repeated reads of the same file) ──
const fileCache = new Map<string, { t: number; v: any }>();
const FILE_TTL_CURRENT = 30_000, FILE_TTL_HISTORICAL = 10 * 60_000, FILE_TTL_MISSING = 2 * 60_000;
async function readFileCached(path: string, historical: boolean): Promise<any | null> {
  const hit = fileCache.get(path);
  if (hit && Date.now() - hit.t < (hit.v == null ? FILE_TTL_MISSING : historical ? FILE_TTL_HISTORICAL : FILE_TTL_CURRENT)) return hit.v;
  const v = await getAnyGitHubPath(path).catch(() => null);
  fileCache.set(path, { t: Date.now(), v });
  if (fileCache.size > 60) { const oldest = [...fileCache.entries()].sort((a, b) => a[1].t - b[1].t)[0]; if (oldest) fileCache.delete(oldest[0]); }
  return v;
}
/** A data file could not be fetched (network, timeout, rate limit) — NOT the same as the file or match not existing. Answered with 503, never 404. */
export class DataUnavailable extends Error { constructor(path = '') { super(`Data temporarily unavailable: ${path}`); } }
/**
 * For locating a match: a genuinely missing file (404) is remembered for 2 minutes, but a FAILED fetch is retried once at once and is
 * never remembered as "missing" — otherwise one network hiccup made every match of that league answer "Match not found" for two minutes.
 */
async function readFileStrict(path: string, historical: boolean): Promise<any | null> {
  const hit = fileCache.get(path);
  if (hit && Date.now() - hit.t < (hit.v == null ? FILE_TTL_MISSING : historical ? FILE_TTL_HISTORICAL : FILE_TTL_CURRENT)) return hit.v;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await getGitHubPathStrict(path);
    if (r.ok) { fileCache.set(path, { t: Date.now(), v: r.data }); return r.data; }
    if ((r as { status: number }).status === 404) { fileCache.set(path, { t: Date.now(), v: null }); return null; }
    if (attempt === 0) await new Promise((res) => setTimeout(res, 400));
  }
  throw new DataUnavailable(path);
}
const LEAGUE_SEASON = /^\d{4}-\d{4}$/;
const TOURNAMENT_CODES = new Set(["WC", "EC"]);

// Finds a match by its football-data id. Explicit season → only that season is searched.
// Seasonless link with a competition hint → current season, then the two previous seasons for THAT competition.
// Seasonless link without a hint → current season only (unchanged behaviour). A hit is accepted only if the
// season recorded inside the match agrees with the folder it was found in, so an id can never resolve ambiguously.
export async function locateMatch(id: string, hint: string, season?: string) {
  const auto = getAutoLeagueSeason().seasonStr;
  const plan: Array<[string, string]> = [];
  if (season) {
    for (const c of hint ? [hint, ...FEATURED_CODES.filter((x) => x !== hint)] : FEATURED_CODES) plan.push([c, season]);
  } else {
    if (hint && TOURNAMENT_CODES.has(hint)) plan.push([hint, auto]);          // tournaments live in their own edition folder, not a league season
    else if (hint) { const p1 = previousSeason(auto), p2 = p1 && previousSeason(p1); for (const s of [auto, p1, p2]) if (s) plan.push([hint, s]); }
    for (const c of FEATURED_CODES) if (c !== hint) plan.push([c, auto]);
  }
  let unavailable: DataUnavailable | null = null;
  for (const [code, s] of plan) {
    const tournament = TOURNAMENT_CODES.has(code);
    const root = tournament ? getCompPathRoot(code, season) : getCompPathRoot(code, s);
    let raw: any;
    try { raw = await readFileStrict(`${root}/matches.json`, !tournament && s !== auto); }
    catch (e) { if (e instanceof DataUnavailable) { unavailable = e; continue; } throw e; }
    const list = matchList(raw);
    const match = list.find((m: any) => String(m.id) === id);
    if (!match) continue;
    const inner = seasonOfMatch(match);
    if (!tournament && LEAGUE_SEASON.test(s) && inner && inner !== s) continue; // folder/season disagreement → not this match
    return { code, season: s, root, match, list, historical: !tournament && s !== auto };
  }
  if (unavailable) throw unavailable;   // we could not look everywhere: say "try again", not "no such match"
  return null;
}

// Statistics for one located match. Priority (see match-stats.ts): live koora-l.live → stats.json written by
// workers/stats365.py → the existing validated legacy path. match_map.json (football-data id → 365scores id) is the join.
async function statsFor(loc: NonNullable<Awaited<ReturnType<typeof locateMatch>>>, id: string) {
  const [st, mm] = await Promise.all([readFileCached(`${loc.root}/stats.json`, loc.historical), readFileCached(`${loc.root}/match_map.json`, loc.historical)]);
  const record = st ? (st?.data || st)[id] ?? null : null;
  const mapEntry = (mm?.matches ?? mm?.data?.matches ?? null)?.[id] ?? null;
  return resolveMatchStats({ match: loc.match, code: loc.code, key: id, record, mapEntry, fetchLive: (m) => loadLive(loc.match, loc.code, m), resolveMap: loc.historical ? undefined : () => resolveMapEntry(loc.match) });
}

// GET /api/data/match/:id?c=PL&season=2026-2027
// One match + its statistics, events and line-ups with `statsSource` ("live" | "stats365" | "legacy" | "none").
// A record that cannot be tied to this fixture is withheld (stats: null) and `statsStatus` says why.
router.get("/match/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const hint = req.query.c ? String(req.query.c) : "";
  const season = req.query.season ? String(req.query.season) : undefined;
  const loc = await locateMatch(id, hint && isValidCode(hint) ? hint : "", season);
  if (!loc) return res.status(404).json({ error: "Match not found" });
  const part = await statsFor(loc, id);
  res.json({ code: loc.code, season: loc.season, match: loc.match, ...part });
});

// GET /api/data/match/:id/details — line-ups with positions/photos, substitutions, shot map, top performers, match info, fan vote.
// English only (translated server-side). Cached like the statistics: 15 s while in play, 10 min once ended.
router.get("/match/:id/details", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const hint = req.query.c ? String(req.query.c) : "";
  const season = req.query.season ? String(req.query.season) : undefined;
  const loc = await locateMatch(id, hint && isValidCode(hint) ? hint : "", season);
  if (!loc) return res.status(404).json({ error: "Match not found" });
  const mm = await readFileCached(`${loc.root}/match_map.json`, loc.historical);
  const mapEntry = (mm?.matches ?? mm?.data?.matches ?? null)?.[id] ?? null;
  // The stats.json record is the primary source for these details; it is used only when it verifies against this fixture.
  const st = await readFileCached(`${loc.root}/stats.json`, loc.historical);
  const rec = st ? (st?.data || st)[id] ?? null : null;
  const recorded = isStats365Record(rec) && (rec.status === "full time" || rec.recorded === true);
  const inPlay = liveWindow(loc.match, recorded) === "live";
  const record = isStats365Record(rec) && validateStats365Record(rec, loc.match, id, loc.code, mapEntry, { live: inPlay }).state === "verified" ? rec : null;
  res.setHeader("Cache-Control", "no-store");
  res.json(await resolveMatchDetails({ match: loc.match, mapEntry, record, inPlay, idMap: s365ToRepoIdsAll(st), loadVideos: () => getAnyGitHubPath(`${SHORTS_BASE}/videos_data/videos.json`), resolveMap: loc.historical ? undefined : () => resolveMapEntry(loc.match), loadSnapshot: (sid) => loadKooraSnapshot(sid) }));
});

// GET /api/data/match/:id/live  — the statistics part only, for the match page to poll every ~20 s while a match is in play.
router.get("/match/:id/live", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const hint = req.query.c ? String(req.query.c) : "";
  const season = req.query.season ? String(req.query.season) : undefined;
  const loc = await locateMatch(id, hint && isValidCode(hint) ? hint : "", season);
  if (!loc) return res.status(404).json({ error: "Match not found" });
  res.setHeader("Cache-Control", "no-store");
  res.json(await statsFor(loc, id));
});

// GET /api/data/match/:id/intel?c=PL&season=2026-2027
// Pre-match context computed ONLY from matches.json files (no stats.json), so it works for every season.
const intelCache = new Map<string, { t: number; v: any }>();
router.get("/match/:id/intel", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const hint = req.query.c ? String(req.query.c) : "";
  const season = req.query.season ? String(req.query.season) : undefined;
  const loc = await locateMatch(id, hint && isValidCode(hint) ? hint : "", season);
  if (!loc) return res.status(404).json({ error: "Match not found" });
  const key = `${id}|${loc.code}|${loc.season}`;
  const hit = intelCache.get(key);
  if (hit && Date.now() - hit.t < 60_000) return res.json(hit.v);

  // Files that feed the calculations: this competition (current + up to 3 previous seasons), plus the
  // Champions League for the same seasons so head-to-head can include European meetings.
  const seasons: string[] = [];
  if (LEAGUE_SEASON.test(loc.season)) { let s: string | null = loc.season; for (let i = 0; s && i < 4; i++, s = previousSeason(s)) seasons.push(s); }
  const codes = loc.code === "CL" ? ["CL"] : [loc.code, "CL"];
  const wanted = seasons.flatMap((s) => codes.map((c) => ({ s, c })));
  const files: SeasonFile[] = [];
  await Promise.all(wanted.map(async ({ s, c }) => {
    if (c === loc.code && s === loc.season) { files.push({ season: s, code: c, matches: loc.list }); return; }
    const raw = await readFileCached(`${getCompPathRoot(c, s)}/matches.json`, s !== getAutoLeagueSeason().seasonStr);
    const list = raw ? matchList(raw) : [];
    if (list.length) files.push({ season: s, code: c, matches: list });
  }));
  if (!files.some((f) => f.code === loc.code && f.season === loc.season)) files.push({ season: loc.season, code: loc.code, matches: loc.list });
  const intel = buildMatchIntel({ match: loc.match, code: loc.code, season: loc.season, files });
  intelCache.set(key, { t: Date.now(), v: intel });
  if (intelCache.size > 200) intelCache.delete(intelCache.keys().next().value as string);
  res.json(intel);
});

// GET /api/data/market-values?code=PL|PD|SA|BL1|FL1|all&limit=10
// Transfermarkt top-25-per-league values, normalised to euros (source is ₹ Crore). Unreadable values are dropped, never zeroed.
const VALUE_CODES = ["PL", "PD", "SA", "BL1", "FL1"];
router.get("/market-values", async (req, res) => {
  const code = String(req.query.code || "all").toUpperCase();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || "25"), 10) || 25, 1), 100);
  const codes = code === "ALL" ? VALUE_CODES : VALUE_CODES.includes(code) ? [code] : [];
  const lists = await Promise.all(codes.map(async (c) => {
    const raw = await getAnyGitHubPath(`${GITHUB_BASE}/league_info/${c}/market_values.json`).catch(() => null);
    return normaliseValues(Array.isArray(raw) ? raw : raw?.data || [], c);
  }));
  const players = code === "ALL" ? mergeValues(lists) : lists[0] || [];
  res.json({
    players: players.slice(0, limit),
    coverage: codes.filter((_, i) => lists[i].length),
    note: "Values in euros; approximate.",
  });
});

// GET /api/data/player-related/:id?club=<teamId>
// Club teammates + national-team players for a player page (rules and ranking: related-players.ts). Everything is read from the
// data repo / mirror; a missing squad file just means that group is left out. Cached 10 min.
const relatedCache = new Map<string, { t: number; v: any }>();
router.get("/player-related/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const hint = /^\d{1,9}$/.test(String(req.query.club ?? "")) ? Number(req.query.club) : null;
  const key = `${id}|${hint ?? ""}`;
  capMap(relatedCache, 500);
  const hit = relatedCache.get(key);
  if (hit && Date.now() - hit.t < 10 * 60_000) return res.json(hit.v);

  const info = await getAnyGitHubPath(`${GITHUB_BASE}/player_information/${id}.json`);
  if (!info) return res.status(404).json({ error: "Player info not found" });
  const d = info.details || {};
  const selfId = Number(id);

  const lists = await Promise.all(VALUE_CODES.map(async (c) => {
    const raw = await getAnyGitHubPath(`${GITHUB_BASE}/league_info/${c}/market_values.json`).catch(() => null);
    return normaliseValues(Array.isArray(raw) ? raw : raw?.data || [], c);
  }));
  const valuedPlayers = mergeValues(lists);
  const values = new Map(valuedPlayers.filter((p) => p.id).map((p) => [p.id as number, p]));

  const clubName: string | null = d.current_club_name || values.get(selfId)?.club || null;
  let registry: any = null; let registryLoaded = false;
  const teamIdByName = async (name: string | null): Promise<number | null> => {
    if (!name) return null;
    if (!registryLoaded) { registry = await getAnyGitHubPath(`${GITHUB_BASE}/id_registry.json`).catch(() => null); registryLoaded = true; }
    const t = registry?.teams; if (!t || typeof t !== "object") return null;
    const direct = Number(t[name.trim().toLowerCase()]);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const want = normName(name);
    for (const [k, v] of Object.entries<any>(t)) if (normName(k) === want && Number(v) > 0) return Number(v);
    return null;
  };

  const cn = normName(clubName);
  const clubId: number | null = hint
    ?? values.get(selfId)?.teamId
    ?? valuedPlayers.find((p) => p.teamId && cn && normName(p.club) === cn)?.teamId
    ?? await teamIdByName(clubName);

  let clubRoster: ReturnType<typeof rosterOf> = [];
  if (clubId) {
    const auto = getAutoLeagueSeason().seasonStr;
    for (const s of [auto, previousSeason(auto)]) {
      if (!s) continue;
      clubRoster = rosterOf(await getAnyGitHubPath(`${GITHUB_BASE}/team_informations/${clubId}/${s}-squad.json`).catch(() => null));
      if (clubRoster.length) break;
    }
  }

  const natName: string | null = d.national_team_name || null;
  const natId = await teamIdByName(natName);
  let nationalRoster: ReturnType<typeof rosterOf> = [];
  if (natId) {
    const file = pickNationalFile(await listDir(`data/team_informations/${natId}`));
    if (file) nationalRoster = rosterOf(await getAnyGitHubPath(`${GITHUB_BASE}/team_informations/${natId}/${file}`).catch(() => null));
  }

  const groups = buildRelated({
    selfId, club: { id: clubId, name: clubName }, clubRoster, national: { id: natId, name: natName }, nationalRoster,
    nationality: Array.isArray(d.citizenship) && d.citizenship[0] ? String(d.citizenship[0]) : null, values, valuedPlayers,
  });
  const v = { groups };
  relatedCache.set(key, { t: Date.now(), v });
  if (relatedCache.size > 300) relatedCache.delete(relatedCache.keys().next().value as string);
  res.json(v);
});

// GET /api/data/team-formation/:id — the team's favourite shape from its previous line-ups (starting XIs AND benches in stats.json):
// formation usage, favourite back/midfield/front numbers and a player pool the squad page turns into an XI (src/lib/formation.ts).
// Current season first; the previous season fills in while the new one has fewer than 8 line-ups. Cached 10 min.
const formationCache = new Map<string, { t: number; v: any }>();
router.get("/team-formation/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ error: "Invalid ID" });
  const teamId = Number(id);
  capMap(formationCache, 500);
  const hit = formationCache.get(id);
  if (hit && Date.now() - hit.t < 10 * 60_000) return res.json(hit.v);

  const auto = getAutoLeagueSeason().seasonStr;
  const collect = async (season: string): Promise<Appearance[]> => {
    const per = await Promise.all(FEATURED_CODES.map(async (code) => {
      const root = getCompPathRoot(code, season);
      const mm = await readFileCached(`${root}/matches.json`, season !== auto);
      const mine = matchList(mm).filter((m: any) => m?.homeTeam?.id === teamId || m?.awayTeam?.id === teamId);
      if (!mine.length) return [] as Appearance[];                       // the (big) stats.json is only read for competitions this team plays in
      const st = await readFileCached(`${root}/stats.json`, season !== auto);
      const recs = st ? (st?.data || st) : null; if (!recs || typeof recs !== "object") return [] as Appearance[];
      const out: Appearance[] = [];
      for (const m of mine) {
        const rec = recs[String(m.id)]; if (!rec?.lineups) continue;
        const a = appearanceFrom(rec.lineups[m.homeTeam?.id === teamId ? "home" : "away"], Date.parse(m.utcDate) || 0);
        if (a) out.push(a);
      }
      return out;
    }));
    return per.flat();
  };

  let apps = await collect(auto);
  if (apps.length < 8) { const prev = previousSeason(auto); if (prev) apps = apps.concat(await collect(prev)); }

  const analysis = analyseFormation(apps);
  // only players still at the club: the current squad list decides when it is there
  const roster = rosterOf(await getAnyGitHubPath(`${GITHUB_BASE}/team_informations/${teamId}/${auto}-squad.json`).catch(() => null));
  if (roster.length >= 15) { const ids = new Set(roster.map((p) => p.id)); analysis.pool = analysis.pool.filter((p) => ids.has(p.id)); }

  formationCache.set(id, { t: Date.now(), v: analysis });
  if (formationCache.size > 200) formationCache.delete(formationCache.keys().next().value as string);
  res.json(analysis);
});

/** The player's own record for the SEO head (data/player_information/<id>.json); null when there is none. */
export const lookupPlayerInfo = (id: string): Promise<any | null> => getAnyGitHubPath(`${GITHUB_BASE}/player_information/${id}.json`);

export default router;
