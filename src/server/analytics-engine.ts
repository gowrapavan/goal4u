// Analytics Engine
import NodeCache from "node-cache";

// We use the same cache instance, passed from data-cache, or a separate one
export class AnalyticsEngine {
  private cache: NodeCache;

  constructor(cache: NodeCache) {
    this.cache = cache;
  }

  public processLeagueMatches(leagueCode: string, matches: any[], season?: string) {
    // Team Aggregation
    const teamStats = new Map<number, any>();
    // Player Aggregation
    const playerStats = new Map<number, any>();

    for (const m of matches) {
      if (m.status !== "FINISHED" && m.status !== "AWARDED") continue;

      const homeId = m.homeTeam?.id;
      const awayId = m.awayTeam?.id;
      if (!homeId || !awayId) continue;

      if (!teamStats.has(homeId)) teamStats.set(homeId, this.createEmptyTeamStat(homeId, m.homeTeam?.name));
      if (!teamStats.has(awayId)) teamStats.set(awayId, this.createEmptyTeamStat(awayId, m.awayTeam?.name));

      const home = teamStats.get(homeId);
      const away = teamStats.get(awayId);

      home.matchesPlayed++;
      away.matchesPlayed++;

      const homeGoals = m.score?.fullTime?.home ?? 0;
      const awayGoals = m.score?.fullTime?.away ?? 0;

      home.goalsScored += homeGoals;
      home.goalsConceded += awayGoals;
      away.goalsScored += awayGoals;
      away.goalsConceded += homeGoals;

      if (homeGoals > awayGoals) {
        home.wins++;
        home.points += 3;
        home.homeWins++;
        away.losses++;
        away.awayLosses++;
      } else if (homeGoals < awayGoals) {
        away.wins++;
        away.points += 3;
        away.awayWins++;
        home.losses++;
        home.homeLosses++;
      } else {
        home.draws++;
        away.draws++;
        home.points += 1;
        away.points += 1;
        home.homeDraws++;
        away.awayDraws++;
      }

      if (awayGoals === 0) home.cleanSheets++;
      if (homeGoals === 0) away.cleanSheets++;

      // Stats
      if (m.statistics?.home) {
        home.shots += m.statistics.home.shots ?? 0;
        home.shotsOnTarget += m.statistics.home.shots_on_goal ?? 0;
        home.possessionTotal += m.statistics.home.possession ?? 0;
        home.corners += m.statistics.home.corner_kicks ?? 0;
        home.yellowCards += m.statistics.home.yellow_cards ?? 0;
        home.redCards += m.statistics.home.red_cards ?? 0;
        home.fouls += m.statistics.home.fouls ?? 0;
      }
      if (m.statistics?.away) {
        away.shots += m.statistics.away.shots ?? 0;
        away.shotsOnTarget += m.statistics.away.shots_on_goal ?? 0;
        away.possessionTotal += m.statistics.away.possession ?? 0;
        away.corners += m.statistics.away.corner_kicks ?? 0;
        away.yellowCards += m.statistics.away.yellow_cards ?? 0;
        away.redCards += m.statistics.away.red_cards ?? 0;
        away.fouls += m.statistics.away.fouls ?? 0;
      }

      // xG processing could go here if available

      // Formation Intelligence
      if (m.homeTeam?.formation) {
        home.formations[m.homeTeam.formation] = (home.formations[m.homeTeam.formation] || 0) + 1;
      }
      if (m.awayTeam?.formation) {
        away.formations[m.awayTeam.formation] = (away.formations[m.awayTeam.formation] || 0) + 1;
      }

      // Process Lineups & Players for Player Aggregation
      this.processPlayerStats(playerStats, m.homeTeam?.lineup, homeId, true, homeGoals, awayGoals);
      this.processPlayerStats(playerStats, m.homeTeam?.bench, homeId, false, homeGoals, awayGoals);
      this.processPlayerStats(playerStats, m.awayTeam?.lineup, awayId, true, awayGoals, homeGoals);
      this.processPlayerStats(playerStats, m.awayTeam?.bench, awayId, false, awayGoals, homeGoals);

      // Process Goals for exact Player Stats if available
      if (Array.isArray(m.goals)) {
        for (const g of m.goals) {
          if (g.scorer?.id) {
            if (!playerStats.has(g.scorer.id)) playerStats.set(g.scorer.id, this.createEmptyPlayerStat(g.scorer.id, g.scorer.name));
            playerStats.get(g.scorer.id).goals++;
          }
          if (g.assist?.id) {
            if (!playerStats.has(g.assist.id)) playerStats.set(g.assist.id, this.createEmptyPlayerStat(g.assist.id, g.assist.name));
            playerStats.get(g.assist.id).assists++;
          }
        }
      }
      // Process Bookings
      if (Array.isArray(m.bookings)) {
         for (const b of m.bookings) {
            if (b.player?.id) {
               if (!playerStats.has(b.player.id)) playerStats.set(b.player.id, this.createEmptyPlayerStat(b.player.id, b.player.name));
               if (b.card === 'YELLOW') playerStats.get(b.player.id).yellowCards++;
               if (b.card === 'RED' || b.card === 'YELLOW_RED') playerStats.get(b.player.id).redCards++;
            }
         }
      }
    }

    // Averages and Derived Metrics
    const sortedTeams = Array.from(teamStats.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const aGD = a.goalsScored - a.goalsConceded;
      const bGD = b.goalsScored - b.goalsConceded;
      if (bGD !== aGD) return bGD - aGD;
      return b.goalsScored - a.goalsScored;
    });

    sortedTeams.forEach((team, index) => {
      team.position = index + 1;
      if (team.matchesPlayed > 0) {
        team.avgPossession = team.possessionTotal / team.matchesPlayed;
      }
    });

    const suffix = season || 'current';
    this.cache.set(`analytics_teams_${leagueCode}_${suffix}`, sortedTeams);
    this.cache.set(`analytics_players_${leagueCode}_${suffix}`, Array.from(playerStats.values()));
  }

  private processPlayerStats(playerStats: Map<number, any>, players: any[], teamId: number, isStarter: boolean, gf: number, ga: number) {
     if (!Array.isArray(players)) return;
     for (const p of players) {
        if (!p.id) continue;
        if (!playerStats.has(p.id)) playerStats.set(p.id, this.createEmptyPlayerStat(p.id, p.name, teamId));
        
        const st = playerStats.get(p.id);
        st.appearances++;
        if (isStarter) st.starts++;
        else st.subAppearances++;
     }
  }

  private createEmptyTeamStat(id: number, name: string) {
    return {
      id,
      name,
      matchesPlayed: 0,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      homeWins: 0,
      homeDraws: 0,
      homeLosses: 0,
      awayWins: 0,
      awayDraws: 0,
      awayLosses: 0,
      goalsScored: 0,
      goalsConceded: 0,
      cleanSheets: 0,
      shots: 0,
      shotsOnTarget: 0,
      corners: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      possessionTotal: 0,
      avgPossession: 0,
      xG: 0,
      xGA: 0,
      formations: {}
    };
  }

  private createEmptyPlayerStat(id: number, name: string, teamId?: number) {
    return {
      id,
      name,
      teamId,
      appearances: 0,
      starts: 0,
      subAppearances: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      minutesEstimation: 0 // advanced calculation possible later
    };
  }
}
