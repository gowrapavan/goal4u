import type { SeoSource } from './seo-data';

export const team = (id: number, name: string, tla = name.slice(0, 3).toUpperCase()) => ({ id, name, shortName: name, tla, crest: `https://crests.football-data.org/${id}.png` });
export const match = (id: number, home: any, away: any, over: any = {}) => ({
  id, utcDate: '2026-10-10T14:00:00Z', status: 'FINISHED', matchday: 6, stage: 'REGULAR_SEASON', lastUpdated: '2026-10-10T16:05:00Z',
  homeTeam: home, awayTeam: away, score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 }, halfTime: { home: 0, away: 0 } }, ...over,
});
export const ARS = team(57, 'Arsenal FC', 'ARS'), LEE = team(341, 'Leeds United FC', 'LEE'), CHE = team(61, 'Chelsea FC', 'CHE'),
  RMA = team(86, 'Real Madrid CF', 'RMA'), BAR = team(81, 'FC Barcelona', 'BAR'), JUV = team(109, 'Juventus FC', 'JUV'), MIL = team(98, 'AC Milan', 'MIL'),
  BAY = team(5, 'FC Bayern München', 'BAY'), BVB = team(4, 'Borussia Dortmund', 'BVB'), ODD = team(999, 'A&B <Rovers> "FC"', 'AB');

/** A small but realistic cache snapshot, including the kinds of bad records real data contains. */
export function fixtureSource(): SeoSource {
  return {
    competitions: [{ code: 'PL' }, { code: 'PD' }, { code: 'SA' }, { code: 'BL1' }, { code: 'CL' }],
    matches: {
      PL: [
        match(1001, ARS, LEE),
        match(1002, CHE, ODD, { status: 'SCHEDULED', utcDate: '2026-11-01T15:00:00Z', score: { fullTime: { home: null, away: null } } }),
        match(1001, ARS, LEE, { lastUpdated: '2026-10-11T00:00:00Z' }),                       // duplicate id (newer copy)
        match(1003, { id: null, name: null }, ARS, { status: 'TIMED' }),                       // opponent not decided
        match(1004, CHE, ARS, { utcDate: 'not-a-date' }),                                      // invalid date
        match(1005, CHE, LEE, { status: 'CANCELLED' }),                                        // not indexable
        match(1006, CHE, CHE),                                                                 // same team twice
        { id: 'abc', homeTeam: CHE, awayTeam: ARS },                                           // malformed
        match(1007, { id: 77, name: 'TBD' }, ARS, { status: 'TIMED' }),                        // placeholder
        match(1008, CHE, LEE, { status: 'POSTPONED' }),
      ],
      PD: [match(2000, BAR, RMA, { matchday: 3, utcDate: '2026-09-01T19:00:00Z', score: { fullTime: { home: 0, away: 3 } } }), match(2001, RMA, BAR, { matchday: 9 })],
      SA: [match(3001, JUV, MIL)],
      BL1: [match(4001, BAY, BVB)],
      CL: [match(5001, ARS, RMA, { stage: 'LEAGUE_STAGE', matchday: 2 }), match(1001, ARS, LEE)],     // CL list repeating id 1001 → still one URL
    },
    teams: { PL: [ARS, LEE, CHE, ODD, { id: 0, name: '' } as any], PD: [RMA, BAR], SA: [JUV, MIL], BL1: [BAY, BVB], CL: [ARS, RMA, team(498, 'Sporting CP', 'SCP')] },
  };
}
export const deepFreeze = <T,>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o as any)) deepFreeze(v); } return o; };
