import { getAutoLeagueSeason, resolveTournamentFolder } from "./season-resolver";

import { DATA_BASE as GITHUB_BASE, dataFetch } from "./data-source";

/** Leagues whose per-season folder holds a competitionInfo.json (data/<season>/<code>/competitionInfo.json). */
const LEAGUE_CODES = ["PL", "PD", "SA", "BL1", "FL1", "CL", "ELC"] as const;
/** Tournaments live in their own folder (data/world-cup/world-cup-2026, data/euros/euro-2028 ...). */
const TOURNAMENT_CODES = ["WC", "EC"] as const;

/** Last-resort list so the app still starts when GitHub AND the local file are both unavailable. */
const BUILT_IN: any[] = [
  { name: "Premier League", code: "PL", type: "LEAGUE", area: { name: "England" } },
  { name: "Primera Division", code: "PD", type: "LEAGUE", area: { name: "Spain" } },
  { name: "Serie A", code: "SA", type: "LEAGUE", area: { name: "Italy" } },
  { name: "Bundesliga", code: "BL1", type: "LEAGUE", area: { name: "Germany" } },
  { name: "Ligue 1", code: "FL1", type: "LEAGUE", area: { name: "France" } },
  { name: "UEFA Champions League", code: "CL", type: "CUP", area: { name: "Europe" } },
  { name: "Championship", code: "ELC", type: "LEAGUE", area: { name: "England" } },
].map((c) => ({ ...c, emblem: `https://crests.football-data.org/${c.code}.png` }));

async function getJson(url: string, timeoutMs = 10000): Promise<any | null> {
  try {
    const res = await dataFetch(url, { timeoutMs });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Builds the competitions list. There is NO local file: the data repo is updated daily, so a copy shipped
 * with the app would always be out of date (old season, old matchday).
 *  1. data/<current season>/<code>/competitionInfo.json for every league, plus the tournament folders
 *     (WC / EC) — each file is { _meta, data: {...competition} }. This is the only source of fresh data.
 *  2. a code whose request failed this time keeps the last LIVE copy (`previous`, i.e. the in-memory cache)
 *  3. only if there is nothing at all: a built-in stub with name/code/emblem but NO season info, so paths
 *     fall back to the calendar-derived season instead of a stale one.
 */
export async function loadCompetitions(previous: any[] = []): Promise<{ comps: any[]; source: string; live: number }> {
  const season = getAutoLeagueSeason().seasonStr;
  const urls: string[] = [
    ...LEAGUE_CODES.map((c) => `${GITHUB_BASE}/${season}/${c}/competitionInfo.json`),
    ...TOURNAMENT_CODES.map((c) => `${GITHUB_BASE}/${resolveTournamentFolder(c)}/competitionInfo.json`),
  ];
  const loaded = (await Promise.all(urls.map((u) => getJson(u))))
    .map((j) => j?.data ?? null)
    .filter((d): d is any => !!d && typeof d.code === "string");

  const byCode = new Map<string, any>(loaded.map((d) => [d.code, d]));
  const live = byCode.size;

  let reused = 0;
  for (const c of previous) if (c?.code && !byCode.has(c.code) && c.currentSeason) { byCode.set(c.code, c); reused++; }
  let stubs = 0;
  for (const c of BUILT_IN) if (!byCode.has(c.code)) { byCode.set(c.code, c); stubs++; }

  const source = `github competitionInfo.json (${live} live${reused ? `, ${reused} reused from last refresh` : ""}${stubs ? `, ${stubs} built-in stubs` : ""})`;
  return { comps: [...byCode.values()], source, live };
}
