import { Match, Team, Short, LiveStream } from '../types';
import { getCurrentSeasonLabel, getCurrentTournamentYear } from '../utils/formatting';

const fixPenaltyScore = (score: any) => {
  if (score && score.duration === 'PENALTY_SHOOTOUT') {
    // If fullTime is missing, we can't derive anything, so keep original
    if (score.fullTime?.home === null || score.fullTime?.home === undefined) return score;

    const hReg = Number(score.regularTime?.home ?? 0);
    const aReg = Number(score.regularTime?.away ?? 0);
    const hExt = Number(score.extraTime?.home ?? 0);
    const aExt = Number(score.extraTime?.away ?? 0);
    const hFull = Number(score.fullTime?.home ?? 0);
    const aFull = Number(score.fullTime?.away ?? 0);

    // Derived Penalties = FullTime - (RegularTime + ExtraTime)
    // Note: Some APIs include ET in FullTime, some don't. 
    // If fullTime is greater than regular + extra, then penalties exist.
    if (hFull > hReg + hExt || aFull > aReg + aExt) {
      score.penalties = {
        home: Math.max(0, hFull - (hReg + hExt)),
        away: Math.max(0, aFull - (aReg + aExt))
      };
    } else {
      // If fullTime equals regular+extra, penalties might be 0-0 or missing
      // Only set if not already present
      if (!score.penalties) {
        score.penalties = { home: 0, away: 0 };
      }
    }
  }
  return score;
};

let cachedCompetitions: any[] = [];

async function fetchWithTimeout(url: string, timeoutMs: number = 25000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      if (res.status === 404) {
        console.warn(`Data not found (404): ${url}`);
      } else {
        console.error(`Request failed! URL: ${url} | Status: ${res.status}`);
      }
    }
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`Fetch error for ${url}:`, error);
    throw error;
  }
}

/**
 * Tries up to 5 times (about 10 s of waiting in between, enough for a data service that is waking up).
 * 404 / 400 mean "there is nothing here" and give null. Every other failure THROWS: it used to return null, and null was shown as
 * "no data" and then remembered by the cache for 10 minutes to an hour, which is why parts of a page went missing until a reload.
 */
async function fetchWithRetry(url: string, retries: number = 5, backoff: number = 600): Promise<any> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    let wait = Math.min(backoff * Math.pow(2, i), 6000);
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const json = await res.json();
        // Standardize returning the 'data' part if it exists
        return json.data || json.competitions || json.matches || json.standings || json.scorers || json;
      }
      if (res.status === 404 || res.status === 400) return null;
      lastError = new Error(`${res.status} ${url}`);
      const ra = Number(res.headers.get('retry-after')); if (ra > 0) wait = Math.min(ra * 1000, 8000);
    } catch (error) {
      lastError = error;
    }
    if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, wait));
  }
  console.error(`Final fetch failure for ${url}:`, lastError);
  throw lastError instanceof Error ? lastError : new Error(`request failed ${url}`);
}

export async function getCompetitions(): Promise<any[]> {
  if (cachedCompetitions.length > 0) return cachedCompetitions;
  
  const data = await fetchWithRetry(`/api/data/competitions`);
  if (data) {
    const list = Array.isArray(data) ? data : (data.competitions || []);
    cachedCompetitions = list.map((c: any) => ({
      code: c.code,
      slug: c.slug || (c.code === 'PD' ? 'la-liga' : (c.name || 'competition').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')),
      name: c.name || 'Unknown Competition',
      country: c.area?.name || 'Unknown',
      emblem: c.emblem
    }));
    return cachedCompetitions;
  }

  // Fallback
  cachedCompetitions = [
    { code: 'PL',  slug: 'premier-league',          name: 'Premier League',          country: 'England',     emblem: '/api/data/ext/c/PL.png' },
    { code: 'CL',  slug: 'uefa-champions-league',   name: 'UEFA Champions League',   country: 'Europe',      emblem: '/api/data/ext/c/CL.png' },
    { code: 'PD',  slug: 'la-liga',                 name: 'Primera Division',        country: 'Spain',       emblem: '/api/data/ext/c/laliga.png' },
    { code: 'BL1', slug: 'bundesliga',              name: 'Bundesliga',              country: 'Germany',     emblem: '/api/data/ext/c/BL1.png' },
    { code: 'SA',  slug: 'serie-a',                 name: 'Serie A',                 country: 'Italy',       emblem: '/api/data/ext/c/c111.png' },
    { code: 'FL1', slug: 'ligue-1',                 name: 'Ligue 1',                 country: 'France',      emblem: '/api/data/ext/c/FL1.png' },
    { code: 'EC',  slug: 'european-championship',   name: 'European Championship',   country: 'Europe',      emblem: '/api/data/ext/c/ec.png' },
    { code: 'WC',  slug: 'fifa-world-cup',          name: 'FIFA World Cup',          country: 'World',       emblem: '/api/data/ext/c/wm26.png' }
  ];
  return cachedCompetitions;
}

export async function fetchMatches(leagueCode: string, season?: string): Promise<Match[]> {
  const url = season ? `/api/data/matches/${leagueCode}?season=${season}` : `/api/data/matches/${leagueCode}`;
  const data = await fetchWithRetry(url);
  if (!data) return [];
  
  const matchesData = Array.isArray(data) ? data : (data.matches || []);
  
  // Determine the season slug to attach to each match
  const isTournament = leagueCode === 'WC' || leagueCode === 'EC' || leagueCode === 'EURO' || leagueCode === 'world-cup';
  
  // Default fallback
  const defaultSeason = isTournament ? `world-cup-${getCurrentTournamentYear('WC')}` : getCurrentSeasonLabel(); 
  const derivedSeason = season || defaultSeason;

  return (Array.isArray(matchesData) ? matchesData : []).map((m: any) => {
      let matchSeasonSlug = season;
      
      if (!matchSeasonSlug) {
        if (isTournament) {
          // For WC/EC, the year is usually clear from the season object or the date
          const year = m.season?.startDate ? new Date(m.season.startDate).getFullYear() : (m.utcDate ? new Date(m.utcDate).getFullYear() : (leagueCode === 'EC' ? Number(getCurrentTournamentYear('EC')) : Number(getCurrentTournamentYear('WC'))));
          matchSeasonSlug = (leagueCode === 'WC' || leagueCode === 'world-cup') ? `world-cup-${year}` : `euro-${year}`;
        } else {
          matchSeasonSlug = m.season?.startDate ? `${new Date(m.season.startDate).getFullYear()}-${new Date(m.season.startDate).getFullYear() + 1}` : derivedSeason;
        }
      }

      const fixedScore = fixPenaltyScore(m.score);
      
      let homeScore = fixedScore?.fullTime?.home ?? fixedScore?.regularTime?.home ?? null;
      let awayScore = fixedScore?.fullTime?.away ?? fixedScore?.regularTime?.away ?? null;
      
      if (fixedScore?.duration === 'PENALTY_SHOOTOUT') {
        homeScore = Number(fixedScore.regularTime?.home ?? 0) + Number(fixedScore.extraTime?.home ?? 0);
        awayScore = Number(fixedScore.regularTime?.away ?? 0) + Number(fixedScore.extraTime?.away ?? 0);
      }

      return {
        GameId: m.id,
        CompetitionCode: m.competition?.code || leagueCode,
        SeasonSlug: matchSeasonSlug,
        RoundId: m.matchday,
        RoundName: m.competition?.name || m.competition?.code || '',
      Date: m.utcDate ? m.utcDate.substring(0, 10) : '',
      DateTime: m.utcDate || '',
      Status: m.status === 'FINISHED' ? 'Final' : 
              (m.status === 'TIMED' || m.status === 'SCHEDULED' ? 'Scheduled' : m.status),
      HomeTeamId: m.homeTeam?.id,
      AwayTeamId: m.awayTeam?.id,
      HomeTeamKey: m.homeTeam?.tla || m.homeTeam?.shortName?.substring(0,3)?.toUpperCase() || '',
      AwayTeamKey: m.awayTeam?.tla || m.awayTeam?.shortName?.substring(0,3)?.toUpperCase() || '',
      HomeTeamName: m.homeTeam?.name || '',
      AwayTeamName: m.awayTeam?.name || '',
      HomeTeamLogo: m.homeTeam?.crest || null,
      AwayTeamLogo: m.awayTeam?.crest || null,
      HomeTeamScore: homeScore,
      AwayTeamScore: awayScore,
      Score: fixedScore,
      Goals: m.goals || [],
      Lineups: {
        home: { lineup: m.homeTeam?.lineup, bench: m.homeTeam?.bench, formation: m.homeTeam?.formation },
        away: { lineup: m.awayTeam?.lineup, bench: m.awayTeam?.bench, formation: m.awayTeam?.formation }
      }
    };
    });
}

export async function fetchTeamAnalytics(leagueCode: string, season?: string): Promise<any[]> {
  const url = season ? `/api/data/analytics/teams/${leagueCode}?season=${season}` : `/api/data/analytics/teams/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return Array.isArray(data) ? data : (data?.data || []);
}

export async function fetchPlayerAnalytics(leagueCode: string, season?: string): Promise<any[]> {
  const url = season ? `/api/data/analytics/players/${leagueCode}?season=${season}` : `/api/data/analytics/players/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return Array.isArray(data) ? data : (data?.data || []);
}

export async function fetchForecast(leagueCode: string, season?: string): Promise<any[]> {
  const url = season ? `/api/data/analytics/forecast/${leagueCode}?season=${season}` : `/api/data/analytics/forecast/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return Array.isArray(data) ? data : (data?.data || []);
}

export async function fetchH2HAnalytics(teamA: number | string, teamB: number | string): Promise<any> {
  const data = await fetchWithRetry(`/api/data/analytics/h2h/${teamA}/${teamB}`);
  return data;
}

export async function fetchStandings(leagueCode: string, season?: string): Promise<any> {
  const url = season ? `/api/data/standings/${leagueCode}?season=${season}` : `/api/data/standings/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return data;
}

export async function fetchScorers(leagueCode: string, season?: string): Promise<any> {
  const url = season ? `/api/data/scorers/${leagueCode}?season=${season}` : `/api/data/scorers/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return data;
}

export async function fetchTeamData(leagueCode: string, teamId: number, season?: string): Promise<Team | null> {
  const url = season ? `/api/data/teams/${leagueCode}?season=${season}` : `/api/data/teams/${leagueCode}`;
  const data = await fetchWithRetry(url);
  
  if (Array.isArray(data)) {
    return data.find((t: any) => String(t.id) === String(teamId)) || null;
  }
  return null;
}

export async function fetchTeams(leagueCode: string, season?: string): Promise<any[]> {
  const url = season ? `/api/data/teams/${leagueCode}?season=${season}` : `/api/data/teams/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return Array.isArray(data) ? data : (data?.teams || []);
}

let cachedAllMatches: Match[] = [];
let lastAllMatchesFetch = 0;

export async function fetchAllMatches(): Promise<Match[]> {
  const now = Date.now();
  if (cachedAllMatches.length > 0 && now - lastAllMatchesFetch < 60000) {
    return cachedAllMatches;
  }

  try {
    const comps = await getCompetitions();
    const promises = comps.slice(0, 8).map((c: any) => 
      fetchMatches(c.code)
        .then(result => result || [])
        .catch(() => [])
    );
    
    const results = await Promise.all(promises);
    
    let allMatches: Match[] = [];
    results.forEach(result => {
      allMatches = allMatches.concat(result);
    });

    const finalMatches = allMatches.filter(m => m.GameId).sort((a, b) => a.DateTime.localeCompare(b.DateTime));
    cachedAllMatches = finalMatches;
    lastAllMatchesFetch = now;
    return finalMatches;
  } catch (error) {
    console.error("Failed to fetch all matches", error);
    return cachedAllMatches.length > 0 ? cachedAllMatches : [];
  }
}

function processVideos(data: Short[]) {
  // Sort by published date descending
  const sorted = [...data].sort((a, b) => {
    const da = new Date(a.publishedAt || a.published_at || 0).getTime();
    const db = new Date(b.publishedAt || b.published_at || 0).getTime();
    return db - da; // most recent first
  });

  // Keywords for recent matches vs trending
  const matchKeywords = ['match', 'highlights', 'vs', 'goals', 'result', 'fixture', 'full time'];
  const trendingKeywords = ['transfer', 'news', 'rumour', 'signing', 'here we go', 'interview', 'podcast', 'reaction'];

  const matchVideos: Short[] = [];
  const trendingVideos: Short[] = [];
  const otherVideos: Short[] = [];

  sorted.forEach(v => {
    const text = ((v.title || '') + ' ' + (v.description || '') + ' ' + (v.tags?.join(' ') || '')).toLowerCase();
    
    if (matchKeywords.some(kw => text.includes(kw))) {
      matchVideos.push(v);
    } else if (trendingKeywords.some(kw => text.includes(kw))) {
      trendingVideos.push(v);
    } else {
      otherVideos.push(v);
    }
  });

  // Interleave matchVideos and trendingVideos (50/50 mix)
  const mixed: Short[] = [];
  const len = Math.max(matchVideos.length, trendingVideos.length);
  for (let i = 0; i < len; i++) {
    if (matchVideos[i]) mixed.push(matchVideos[i]);
    if (trendingVideos[i]) mixed.push(trendingVideos[i]);
  }

  mixed.push(...otherVideos);
  return mixed;
}

export async function fetchShorts(): Promise<Short[]> {
  const data = await fetchWithRetry(`/api/data/shorts`);
  return processVideos(Array.isArray(data) ? data : []);
}

export async function fetchVideos(): Promise<Short[]> {
  const data = await fetchWithRetry(`/api/data/videos`);
  return processVideos(Array.isArray(data) ? data : []);
}

export async function fetchStreams(): Promise<LiveStream[]> {
  try {
    const sources = [
      'hd_streams.json',
      'yallasport.json',
      'freekora.json',
      'live_soccer.json',
      'yallashots.json'
    ];

    const promises = sources.map(source => 
      fetchWithTimeout(`/api/data/streams/${source}`)
        .then(res => res.ok ? res.json() : [])
        .then((json: any) => json.data || json)
        .then((data: any[]) => {
             if (!Array.isArray(data)) return [];
             const flattened: any[] = [];
             data.forEach(item => {
                 if (item.servers && Array.isArray(item.servers) && item.servers.length > 0) {
                     item.servers.forEach((server: any) => {
                         flattened.push({ ...item, url: server.url, server_label: server.label, type: server.type });
                     });
                 } else {
                     flattened.push(item);
                 }
             });
             return flattened;
        })
        .then((data: any[]) => data.map(item => {
           let sourceName = source.replace('.json', '');
           if (item.source) sourceName = item.source;

           // Handle various formats
           const homeTeam = item.home_team || item.team1 || '';
           const awayTeam = item.away_team || item.team2 || '';
           const homeLogo = item.home_logo || item.logo1 || '';
           const awayLogo = item.away_logo || item.logo2 || '';
           const league = item.league || item.competition || '';
           const time = item.time || item.match_time || '';
           const embedUrl = item.url || item.frame_url || item.m3u8 || '';
           let label = item.label || `${homeTeam}-${awayTeam}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
           let serverLabel = '';
           
           if (item.server_label) {
             serverLabel = item.server_label;
           } else if (sourceName === 'sportsonline' && item.url) {
             const parts = item.url.split('/');
             const lastPart = parts[parts.length - 1]?.replace('.php', '') || '';
             if (lastPart) {
                serverLabel = lastPart;
             }
           }

           return {
             match: `${homeTeam} vs ${awayTeam}`,
             homeTeam,
             awayTeam,
             homeTeamLogo: homeLogo,
             awayTeamLogo: awayLogo,
             kickoffIST: time,
             league,
             embedUrl,
             source: sourceName,
             label,
             serverLabel
           } as LiveStream;
        }))
        .catch(() => [])
    );

    const results = await Promise.all(promises);
    let allStreams: LiveStream[] = [];
    results.forEach(res => {
       allStreams = allStreams.concat(res);
    });

    return allStreams;
  } catch (error) {
    console.error("Failed to fetch streams", error);
    return [];
  }
}

export async function fetchMatchStats(competitionCode: string, matchId: number, season?: string): Promise<any | null> {
  const url = season ? `/api/data/stats/${competitionCode}?season=${season}` : `/api/data/stats/${competitionCode}`;
  const data = await fetchWithRetry(url);
  if (!data) return null;
  
  // V2 architecture: data is a dictionary keyed by stringified match_id
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    let matchStats = data[matchId.toString()] || data[matchId];
    if (matchStats) {
      if (matchStats.score) {
        matchStats.score = fixPenaltyScore(matchStats.score);
      }
      return matchStats;
    }
  }

  // Legacy O(n) fallback
  if (Array.isArray(data)) {
    let matchStats = data.find((s: any) => (s.id || s.GameId || s.matchId) === matchId);
    if (matchStats) {
      if (matchStats.score) {
        matchStats.score = fixPenaltyScore(matchStats.score);
      }
      return matchStats;
    }
  }
  
  return null;
}

export async function fetchCompetitionMeta(leagueCode: string, season?: string): Promise<any | null> {
  const url = season ? `/api/data/competition-meta/${leagueCode}?season=${season}` : `/api/data/competition-meta/${leagueCode}`;
  const data = await fetchWithRetry(url);
  return data;
}

export async function fetchTMLeagueInfo(leagueCode: string, type: 'metadata' | 'market-values' | 'top-scorers' | 'successful-players' | 'top-scorers-all-time' | 'all-champions' | 'championship-managers' | 'players-of-year', season?: string): Promise<any> {
  const url = season 
    ? `/api/data/league-info/${leagueCode}/${type}?season=${season}`
    : `/api/data/league-info/${leagueCode}/${type}`;
  const data = await fetchWithRetry(url);
  return data;
}

export async function discoverCompetitionSeasons(leagueCode: string): Promise<any[]> {
  const data = await fetchWithRetry(`/api/data/league-info/${leagueCode}/seasons`);
  const seasons: string[] = Array.isArray(data) ? data : (data?.seasons || []);
  return seasons.map(s => ({
    value: s,
    label: s.includes('-') ? `${s.replace('-', '/')} Season` : `${s} Edition`
  }));
}

export async function fetchTMTeamCompetitions(teamId: string | number): Promise<any[]> {
  const data = await fetchWithRetry(`/api/data/team-info/${teamId}/competitions`);
  return Array.isArray(data) ? data : [];
}

export async function fetchTMTeamSquad(teamId: string | number, file?: string): Promise<any> {
  const url = file ? `/api/data/team-info/${teamId}/squad?file=${file}` : `/api/data/team-info/${teamId}/squad`;
  const data = await fetchWithRetry(url);
  return data;
}

export async function fetchTMTeamInfo(teamId: string | number): Promise<any> {
  const data = await fetchWithRetry(`/api/data/team-info/${teamId}`);
  return data;
}

export async function fetchTMPlayerInfo(playerId: string | number): Promise<any> {
  const data = await fetchWithRetry(`/api/data/player-info/${playerId}`);
  return data;
}

export async function fetchMatchStatsLinks(leagueCode: string): Promise<any | null> {
  const data = await fetchWithRetry(`/api/data/match-stats-links/${leagueCode}`);
  return data;
}

