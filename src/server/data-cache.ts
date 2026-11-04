import NodeCache from "node-cache";
import { submitToIndexNow } from "./indexnow";
import { AnalyticsEngine } from "./analytics-engine";
import { ForecastEngine } from "./forecast-engine";
import { resolveTournamentFolder, getAutoLeagueSeason } from "./season-resolver";
import { loadCompetitions } from "./competitions-source";

// 10 minutes TTL standard cache (was 1 hour)
const cache = new NodeCache({ stdTTL: 600 });
export const analytics = new AnalyticsEngine(cache);
export const forecaster = new ForecastEngine(cache);
import { DATA_BASE as GITHUB_BASE, SHORTS_BASE, dataFetch } from "./data-source";

// Every read of the data service goes through dataFetch: token header, 401 handling, one retry on 502/503/504 (see data-source.ts).
// (SHORTS_BASE is a different host: dataFetch adds the token only to the data service.)
async function fetchWithTimeout(url: string, timeoutMs: number = 10000) {
  return dataFetch(url, { timeoutMs });
}

// Ensure at least competitions are cached initially, we can do full priming later
export async function prefetchData() {
  console.log("Starting scheduled GitHub data cache refresh...");
  try {
    const auto = getAutoLeagueSeason();
    // Competitions come from each league's competitionInfo.json (see competitions-source.ts); never throws.
    const { comps, source } = await loadCompetitions(cache.get<any[]>(`comps`) || []);
    console.log(`Competitions loaded from ${source}: ${comps.map((c: any) => c.code).join(", ")}`);
    cache.set(`comps`, comps);
    
    let matchCount = 0;
    
    let urlsToSubmit = new Set<string>();

    // For sitemaps, we need matches, teams, and top scorers per competition
    const compPromises = comps.map(async (c: any) => {
      if (!c.code) return;
      
      let compRoot = `${GITHUB_BASE}/${getAutoLeagueSeason().seasonStr}/${c.code}`;
      if (c.code === 'WC' || c.code === 'world-cup') {
        compRoot = `${GITHUB_BASE}/${resolveTournamentFolder('WC', c.currentSeason?.startDate)}`;
      } else if (c.code === 'EC' || c.code === 'EURO' || c.code === 'euro') {
        compRoot = `${GITHUB_BASE}/${resolveTournamentFolder('EC', c.currentSeason?.startDate)}`;
      }

      const tasks = [
        // Competition Meta
        (async () => {
          let compMetaUrl = `${compRoot}/competitionInfo.json`;
          let compMetaRes = await fetchWithTimeout(compMetaUrl).catch(()=>null);
          if (!compMetaRes || !compMetaRes.ok) {
            compMetaUrl = `${compRoot}/competition.json`;
            compMetaRes = await fetchWithTimeout(compMetaUrl).catch(()=>null);
          }
          if (compMetaRes && compMetaRes.ok) {
            const compMetaData = await compMetaRes.json();
            cache.set(`comp_meta_${c.code}`, compMetaData);
          }
        })(),

        // Matches
        (async () => {
          const matchUrl = `${compRoot}/matches.json`;
          const matchRes = await fetchWithTimeout(matchUrl).catch(()=>null);
          if (matchRes && matchRes.ok) {
            const matchData = await matchRes.json();
            const matches = matchData.data || matchData.matches || matchData;
            const oldMatches = cache.get<any[]>(`matches_${c.code}`) || [];
            
            // Change detection
            if (oldMatches.length > 0 && Array.isArray(matches)) {
              const oldMap = new Map(oldMatches.map(m => [m.id || m.GameId, m]));
              for (const m of matches) {
                const old = oldMap.get(m.id || m.GameId);
                if (!old || old.status !== m.status || 
                    (m.score?.fullTime?.home !== old.score?.fullTime?.home) || 
                    (m.score?.fullTime?.away !== old.score?.fullTime?.away)) {
                  urlsToSubmit.add(`/match/${m.id || m.GameId}`);
                  if (m.homeTeam && m.awayTeam) {
                    const hSlug = m.homeTeam.name.replace(/\s+/g, '-').toLowerCase();
                    const aSlug = m.awayTeam.name.replace(/\s+/g, '-').toLowerCase();
                    urlsToSubmit.add(`/h2h/${hSlug}-vs-${aSlug}`);
                  }
                  urlsToSubmit.add(`/results/${c.slug}`);
                }
              }
            }
            cache.set(`matches_${c.code}`, matches);
            if (Array.isArray(matches)) {
              analytics.processLeagueMatches(c.code, matches);
              matchCount += matches.length;
            }
          }
        })(),

        // Teams
        (async () => {
          const teamUrl = `${compRoot}/teams.json`;
          const teamRes = await fetchWithTimeout(teamUrl).catch(()=>null);
          if (teamRes && teamRes.ok) {
            const teamData = await teamRes.json();
            const teams = teamData.data || teamData.teams || teamData;
            cache.set(`teams_${c.code}`, teams);
          }
        })(),

        // Scorers
        (async () => {
          let scorersUrl = `${compRoot}/topScorer.json`;
          let scorersRes = await fetchWithTimeout(scorersUrl).catch(()=>null);
          if (!scorersRes || !scorersRes.ok) {
            scorersUrl = `${compRoot}/scorers.json`;
            scorersRes = await fetchWithTimeout(scorersUrl).catch(()=>null);
          }
          if (scorersRes && scorersRes.ok) {
            const scorersData = await scorersRes.json();
            const scorers = scorersData.data?.scorers || scorersData.scorers || scorersData.data || scorersData;
            cache.set(`scorers_${c.code}`, scorers);
          }
        })(),

        // Standings
        (async () => {
          let standingsUrl = `${compRoot}/standing.json`;
          let standingsRes = await fetchWithTimeout(standingsUrl).catch(()=>null);
          if (!standingsRes || !standingsRes.ok) {
            standingsUrl = `${compRoot}/standings.json`;
            standingsRes = await fetchWithTimeout(standingsUrl).catch(()=>null);
          }
          if (standingsRes && standingsRes.ok) {
            const standingsData = await standingsRes.json();
            const standings = standingsData.data?.standings || standingsData.standings || standingsData.data || standingsData;
            cache.set(`standings_${c.code}`, standings);
          }
        })(),

        // Stats (Consolidated)
        (async () => {
          const statsUrl = `${compRoot}/stats.json`;
          const statsRes = await fetchWithTimeout(statsUrl).catch(()=>null);
          if (statsRes && statsRes.ok) {
            const statsData = await statsRes.json();
            // Cache the whole thing or the .data dictionary
            cache.set(`stats_${c.code}`, statsData.data || statsData);
          }
        })(),

        // Stats Links
        (async () => {
          const linksUrl = `${compRoot}/match_stats_links.json`;
          const linksRes = await fetchWithTimeout(linksUrl).catch(()=>null);
          if (linksRes && linksRes.ok) {
            const linksData = await linksRes.json();
            cache.set(`links_${c.code}`, linksData.data || linksData);
          }
        })()
      ];

      await Promise.allSettled(tasks);
    });

    await Promise.allSettled(compPromises);
    
    console.log(`Cache refresh complete. Cached ${comps.length} competitions and ${matchCount} matches.`);
    
    if (urlsToSubmit.size > 0) {
       console.log(`[IndexNow Trigger] Detected data changes, submitting ${urlsToSubmit.size} URLs to IndexNow...`);
       submitToIndexNow(Array.from(urlsToSubmit)).catch(console.error);
    }
  } catch (err) {
    console.error("Cache refresh error:", err);
  }
}

// Initial fetch synchronously (blocking)
// We call this on start, but we shouldn't block the whole server startup.
// So we use it on first request or just await it before listen.

export function getCachedCompetitions() {
  return cache.get<any[]>(`comps`) || [];
}

export function getCachedMatches(leagueCode: string) {
  return cache.get<any[]>(`matches_${leagueCode}`) || [];
}

export function getCachedTeams(leagueCode: string) {
  return cache.get<any[]>(`teams_${leagueCode}`) || [];
}

export function getCachedScorers(leagueCode: string) {
  return cache.get<any>(`scorers_${leagueCode}`) || [];
}

export function getCachedAnalytics(key: string) {
  return cache.get<any>(key) || [];
}

// For client proxy
export async function getAnyGitHubPath(fullPath: string) {
  const cached = cache.get(fullPath);
  if (cached) return cached;
  try {
    const res = await fetchWithTimeout(fullPath);
    if (!res.ok) return null;
    let raw; 
    try { raw = await res.json(); } catch(e) { return null; }
    const data = raw.data || raw;
    // Only cache if successful. Use short TTL for dynamic files.
    let ttl = 300; // 5 mins default
    if (fullPath.includes('matches.json') || fullPath.includes('stats.json') || fullPath.includes('standing')) {
      ttl = 30; // 30 seconds for live/dynamic data
    }
    cache.set(fullPath, data, ttl);
    return data;
  } catch (err) {
    // console.error("Failed to fetch proxy path:", fullPath);
    return null;
  }
}


/* ───────────── big media files (shorts.json ≈ 16 MB, videos.json ≈ 6 MB) ─────────────
 * NodeCache deep-clones on every set AND get, which for a 16 MB list blocks the server for a long moment on each request. These files are kept
 * in a plain Map (read-only use: callers copy what they change), one download at a time is shared by all waiting requests, and the last good copy is
 * served when a refresh fails (up to 24 h) — so a hiccup upstream is invisible. A failure with nothing to fall back on is reported as "transient"
 * (the route answers 502, which the browser retries), never as a 404 "not found".
 */
const media = new Map<string, { data: any; at: number }>();
const mediaInflight = new Map<string, Promise<{ ok: true; data: any; stale: boolean } | { ok: false; status: number }>>();
const MEDIA_FRESH_MS = 5 * 60_000, MEDIA_STALE_MAX_MS = 24 * 3600_000;

export async function getMediaJSON(fullPath: string): Promise<{ ok: true; data: any; stale: boolean } | { ok: false; status: number }> {
  const hit = media.get(fullPath);
  const now = Date.now();
  if (hit && now - hit.at < MEDIA_FRESH_MS) return { ok: true, data: hit.data, stale: false };
  const usable = hit && now - hit.at < MEDIA_STALE_MAX_MS ? hit : undefined;
  let job = mediaInflight.get(fullPath);
  if (!job) {
    job = (async () => {
      let status = 0;
      for (let i = 0; i < 2; i++) {                                         // two tries: a raw.githubusercontent hiccup is usually gone a moment later
        try {
          const res = await fetchWithTimeout(fullPath, 20000);
          if (res.status === 404) return { ok: false as const, status: 404 };
          if (!res.ok) { status = res.status; continue; }
          const raw: any = await res.json();
          const data = raw && !Array.isArray(raw) && raw.data ? raw.data : raw;
          media.set(fullPath, { data, at: Date.now() });
          return { ok: true as const, data, stale: false };
        } catch { status = 0; }
      }
      return { ok: false as const, status };
    })().finally(() => { mediaInflight.delete(fullPath); });
    mediaInflight.set(fullPath, job);
  }
  // A stale copy answers at once while the refresh runs behind it; with no copy the request waits for the download.
  if (usable) { job.catch(() => undefined); return { ok: true, data: usable.data, stale: true }; }
  return job;
}
export const _resetMediaCache = () => { media.clear(); mediaInflight.clear(); };

/** Like getAnyGitHubPath, but says WHY it failed: status 404 = the file really is not there; anything else (0 = network/timeout/bad JSON, 429, 5xx) = a transient failure. */
export async function getGitHubPathStrict(fullPath: string): Promise<{ ok: true; data: any } | { ok: false; status: number }> {
  const cached = cache.get(fullPath);
  if (cached) return { ok: true, data: cached };
  try {
    const res = await fetchWithTimeout(fullPath, 15000);
    if (!res.ok) return { ok: false, status: res.status };
    let raw: any;
    try { raw = await res.json(); } catch { return { ok: false, status: 0 }; }
    const data = raw.data || raw;
    const dynamic = fullPath.includes('matches.json') || fullPath.includes('stats.json') || fullPath.includes('standing');
    cache.set(fullPath, data, dynamic ? 30 : 300);
    return { ok: true, data };
  } catch { return { ok: false, status: 0 }; }
}

// Trigger interval
let initialized = false;
export async function initCache() {
  if (initialized) return;
  initialized = true;
  await prefetchData();
  // refresh every 2 minutes for more responsive data
  setInterval(prefetchData, 2 * 60 * 1000);
}
