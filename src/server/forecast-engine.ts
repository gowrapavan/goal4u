import NodeCache from "node-cache";

export class ForecastEngine {
  private cache: NodeCache;

  constructor(cache: NodeCache) {
    this.cache = cache;
  }

  public async getForecast(leagueCode: string, matches: any[], teamStats: any[], season?: string) {
    const cacheKey = `analytics_forecast_${leagueCode}_${season || 'current'}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Filter finished and scheduled matches
    const finishedMatches = matches.filter(m => {
      const s = (m.status || m.Status || '').toUpperCase();
      return s === 'FINISHED' || s === 'FINAL' || s === 'AWARDED';
    });
    
    const scheduledMatches = matches.filter(m => {
      const s = (m.status || m.Status || '').toUpperCase();
      return ['SCHEDULED', 'TIMED', 'LIVE', 'IN_PLAY', 'IN-PLAY'].includes(s);
    });

    // Pre-calculate current form for each team from finished matches
    const teamForm = new Map<number, string[]>();
    finishedMatches.sort((a, b) => {
      const dateA = new Date(a.utcDate || a.DateTime || 0).getTime();
      const dateB = new Date(b.utcDate || b.DateTime || 0).getTime();
      return dateB - dateA;
    });
    
    teamStats.forEach(t => {
      const results: string[] = [];
      for (const m of finishedMatches) {
        if (results.length >= 5) break;
        const hId = m.homeTeam?.id ?? m.HomeTeamId;
        const aId = m.awayTeam?.id ?? m.AwayTeamId;
        const hScore = m.score?.fullTime?.home ?? m.HomeTeamScore;
        const aScore = m.score?.fullTime?.away ?? m.AwayTeamScore;

        if (hId === t.id) {
          if (hScore > aScore) results.push('W');
          else if (hScore < aScore) results.push('L');
          else results.push('D');
        } else if (aId === t.id) {
          if (aScore > hScore) results.push('W');
          else if (aScore < hScore) results.push('L');
          else results.push('D');
        }
      }
      teamForm.set(t.id, results.reverse());
    });

    if (scheduledMatches.length === 0 && finishedMatches.length > 0) {
      // Season finished, forecast is just the final standings
      return this.generateFinalForecast(teamStats, teamForm);
    }

    // Run Monte Carlo simulation
    const iterations = 500; // Lower iterations for speed in this environment
    const teamResults = new Map<number, { 
      positions: number[], 
      points: number[], 
      gd: number[],
      titles: number,
      ucl: number,
      relegation: number
    }>();

    // Initialize team results
    teamStats.forEach(t => {
      teamResults.set(t.id, {
        positions: [],
        points: [],
        gd: [],
        titles: 0,
        ucl: 0,
        relegation: 0
      });
    });

    for (let i = 0; i < iterations; i++) {
      const simStandings = new Map<number, { points: number, gd: number }>();
      teamStats.forEach(t => {
        simStandings.set(t.id, { points: t.points, gd: t.goalsScored - t.goalsConceded });
      });

      // Simulate remaining matches
      for (const m of scheduledMatches) {
        const homeId = m.homeTeam?.id;
        const awayId = m.awayTeam?.id;
        if (!homeId || !awayId) continue;

        const homeStat = teamStats.find(t => t.id === homeId);
        const awayStat = teamStats.find(t => t.id === awayId);

        // Simple probability based on current PPG and Home/Away advantage
        // In a real app, we'd use Poisson distribution or ELO
        const homeProb = this.calculateWinProb(homeStat, awayStat, true);
        const awayProb = this.calculateWinProb(awayStat, homeStat, false);
        const drawProb = 1 - homeProb - awayProb;

        const rand = Math.random();
        const homeSim = simStandings.get(homeId)!;
        const awaySim = simStandings.get(awayId)!;

        if (rand < homeProb) {
          homeSim.points += 3;
          homeSim.gd += 1; // Simplified GD simulation
          awaySim.gd -= 1;
        } else if (rand < homeProb + drawProb) {
          homeSim.points += 1;
          awaySim.points += 1;
        } else {
          awaySim.points += 3;
          awaySim.gd += 1;
          homeSim.gd -= 1;
        }
      }

      // Sort final standings for this iteration
      const finalIterationStandings = Array.from(simStandings.entries())
        .sort((a, b) => {
          if (b[1].points !== a[1].points) return b[1].points - a[1].points;
          return b[1].gd - a[1].gd;
        });

      // Update aggregates
      finalIterationStandings.forEach(([id, stats], index) => {
        const res = teamResults.get(id)!;
        const pos = index + 1;
        res.positions.push(pos);
        res.points.push(stats.points);
        res.gd.push(stats.gd);

        if (pos === 1) res.titles++;
        if (pos <= 4) res.ucl++; // Assuming top 4 for UCL
        if (pos >= finalIterationStandings.length - 2) res.relegation++; // Assuming bottom 3 for relegation
      });
    }

    // Final calculations
    const forecast = teamStats.map(t => {
      const res = teamResults.get(t.id)!;
      const avgPoints = res.points.reduce((a, b) => a + b, 0) / iterations;
      const avgGd = res.gd.reduce((a, b) => a + b, 0) / iterations;
      
      // Position range (10th and 90th percentile to avoid outliers)
      const sortedPos = [...res.positions].sort((a, b) => a - b);
      const minPos = sortedPos[Math.floor(iterations * 0.1)];
      const maxPos = sortedPos[Math.floor(iterations * 0.9)];
      const medianPos = sortedPos[Math.floor(iterations * 0.5)];

      // Strength rating (0-100)
      const maxPossiblePoints = teamStats.length * 2 * 3; // Very loose upper bound
      const strength = Math.min(99.9, (avgPoints / maxPossiblePoints) * 200 + 40);

      return {
        id: t.id,
        name: t.name,
        crest: t.crest || `https://crests.football-data.org/${t.id}.png`,
        strength: parseFloat(strength.toFixed(1)),
        avgPoints: Math.round(avgPoints),
        avgGd: Math.round(avgGd),
        minPos,
        maxPos,
        medianPos,
        form: teamForm.get(t.id) || [],
        titleProb: Math.round((res.titles / iterations) * 100),
        uclProb: Math.round((res.ucl / iterations) * 100),
        relegationProb: Math.round((res.relegation / iterations) * 100),
        currentPoints: t.points,
        currentGd: t.goalsScored - t.goalsConceded,
        matchesPlayed: t.matchesPlayed
      };
    }).sort((a, b) => a.medianPos - b.medianPos);

    this.cache.set(cacheKey, forecast, 3600); // Cache for 1 hour
    return forecast;
  }

  private calculateWinProb(team: any, opponent: any, isHome: boolean): number {
    if (!team || !opponent) return 0.33;
    
    const teamPpg = team.matchesPlayed > 0 ? team.points / team.matchesPlayed : 1.0;
    const oppPpg = opponent.matchesPlayed > 0 ? opponent.points / opponent.matchesPlayed : 1.0;
    
    const homeAdvantage = isHome ? 0.1 : -0.1;
    const diff = (teamPpg - oppPpg) * 0.2 + homeAdvantage;
    
    // Base probability 0.38 for home win, adjusted by PPG diff
    let prob = (isHome ? 0.38 : 0.28) + diff;
    return Math.max(0.1, Math.min(0.8, prob));
  }

  private generateFinalForecast(teamStats: any[], teamForm: Map<number, string[]>) {
    return teamStats.map((t, index) => ({
      id: t.id,
      name: t.name,
      crest: t.crest || `https://crests.football-data.org/${t.id}.png`,
      strength: parseFloat(((t.points / (t.matchesPlayed * 3 || 1)) * 100).toFixed(1)),
      avgPoints: t.points,
      avgGd: t.goalsScored - t.goalsConceded,
      minPos: index + 1,
      maxPos: index + 1,
      medianPos: index + 1,
      form: teamForm.get(t.id) || [],
      titleProb: index === 0 ? 100 : 0,
      uclProb: index < 4 ? 100 : 0,
      relegationProb: index >= teamStats.length - 3 ? 100 : 0,
      currentPoints: t.points,
      currentGd: t.goalsScored - t.goalsConceded,
      matchesPlayed: t.matchesPlayed
    })).sort((a, b) => a.medianPos - b.medianPos);
  }
}
