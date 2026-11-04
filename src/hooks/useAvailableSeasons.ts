import { useState, useEffect } from 'react';

export interface SeasonOption {
  value: string;
  label: string;
}

export function useAvailableSeasons() {
  const [leagueSeasons, setLeagueSeasons] = useState<SeasonOption[]>([]);
  const [tournamentSeasons, setTournamentSeasons] = useState<Record<string, SeasonOption[]>>({ WC: [], EC: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSeasons() {
      try {
        // One server call (the server lists the data folders via the /goal4u-data mirror or GitHub) — the browser never talks to GitHub.
        const res = await fetch('/api/data/seasons');
        if (!res.ok) throw new Error('Failed to fetch seasons');
        const j = await res.json();
        const byValueDesc = (a: SeasonOption, b: SeasonOption) => b.value.localeCompare(a.value);
        const leagues: SeasonOption[] = (j.leagues || []).map((n: string) => ({ value: n, label: `${n.replace('-', '/')} Season` })).sort(byValueDesc);
        const tourney = (names: string[]): SeasonOption[] => (names || []).map((n) => ({ value: n, label: n.replace(/-/g, ' ').toUpperCase() })).sort(byValueDesc);
        const worldCups = tourney(j.worldCups), euros = tourney(j.euros);
        setLeagueSeasons(leagues);
        setTournamentSeasons({ WC: worldCups, EC: euros, EURO: euros });
      } catch (error) {
        console.error("Failed to fetch available seasons:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSeasons();
  }, []);

  return { leagueSeasons, tournamentSeasons, isLoading };
}

export async function discoverCompetitionSeasons(code: string): Promise<SeasonOption[]> {
  try {
    const res = await fetch(`/api/data/league-info/${code}/seasons`);
    if (!res.ok) return [];
    const json = await res.json();
    const seasons: string[] = json.seasons || [];
    
    return seasons.map(s => ({
      value: s,
      label: s.includes('-') ? `${s.replace('-', '/')} Season` : `${s} Edition`
    }));
  } catch (err) {
    console.error(`Failed to discover seasons for ${code}`, err);
    return [];
  }
}
