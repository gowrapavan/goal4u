/** A trimmed copy of a real koora-l.live /game response (Udinese 1–1 Como, 2026-08-22) used by the live-stats tests. */
const P = (id: number, slug: string, comp: number, jersey: number) => ({ competitorId: comp, id, name: 'ar-' + slug, shortName: 'ar', jerseyNumber: jersey, nameForURL: slug });
const S = (id: number, pos: string, line: number, side: number | undefined, ranking: number, stats: [number, string][] = []) => ({
  status: 1, statusText: 'Starting', position: { id: 1, name: 'ar', shortName: pos }, yardFormation: { line, fieldSide: side }, ranking, hasStats: true,
  stats: stats.map(([type, value]) => ({ type, value })), id,
});
const B = (id: number, pos: string) => ({ status: 2, statusText: 'Substitute', position: { id: 2, name: 'ar', shortName: pos }, hasStats: false, id });
const COACH = (id: number) => ({ status: 4, statusText: 'Management', position: { id: 0, name: 'الإدارة', shortName: 'Management' }, formation: { id: 16, name: 'المدرب', shortName: 'Coach' }, hasStats: false, id });

export const HOME_IDS = [47484495, 3679392, 72688033, 66220481, 489221, 1407048, 375123, 3052014, 4882805, 3209608, 76901950];
export const AWAY_IDS = [550367, 66186532, 3064953, 70914728, 40742145, 671186, 64935156, 75251250, 56471954, 65895085, 49579899];

export function sampleGame(over: any = {}): any {
  const homeStarters = [
    S(47484495, 'Goalkeeper', 1, 50, 6.8, [[23, '5']]), S(3679392, 'Defender', 2, 25, 6.9), S(72688033, 'Defender', 2, 50, 6.6), S(66220481, 'Defender', 2, 75, 6.3),
    S(489221, 'Defender', 3, 0, 7.9, [[3, '3'], [4, '2'], [5, '1'], [19, '25/36 (69%)'], [42, '1']]), S(1407048, 'Midfielder', 3, 33, 6.5, [[3, '1'], [5, '1'], [19, '29/30 (97%)'], [42, '1']]),
    S(375123, 'Midfielder', 3, 66, 6.7, [[19, '29/34 (85%)']]), S(3052014, 'Defender', 3, 100, 7.2, [[3, '2'], [5, '2']]), S(4882805, 'Midfielder', 4, 20, 7.6, [[3, '2'], [5, '2']]),
    S(3209608, 'Attacker', 4, 80, 7.2, [[3, '3'], [5, '1']]), S(76901950, 'Attacker', 5, 50, 6.6, [[3, '3'], [5, '3']]),
  ];
  const awayStarters = [
    S(550367, 'Goalkeeper', 1, 50, 7.0, [[23, '2']]), S(66186532, 'Defender', 2, 0, 6.8, [[3, '2'], [6, '2']]), S(3064953, 'Defender', 2, 33, 7.6, [[3, '1'], [4, '1']]),
    S(70914728, 'Defender', 2, 66, 6.3, [[3, '1'], [5, '1']]), S(40742145, 'Defender', 2, 100, 6.8), S(671186, 'Midfielder', 3, 20, 8.1), S(64935156, 'Midfielder', 3, 80, 6.6),
    S(75251250, 'Attacker', 4, 0, 6.1, [[3, '2'], [5, '1']]), S(56471954, 'Midfielder', 4, 50, 6.5), S(65895085, 'Midfielder', 4, 100, 6.7, [[3, '4'], [4, '1'], [5, '1']]), S(49579899, 'Attacker', 5, 50, 7.4, [[3, '4'], [4, '3']]),
  ];
  const home = { id: 229, name: 'ar-home', score: 1.0, nameForURL: 'udinese', lineups: { formation: '3-4-2-1', members: [...homeStarters, B(50409481, 'Defender'), COACH(3206048)] } };
  const away = { id: 6117, name: 'ar-away', score: 1.0, nameForURL: 'como', lineups: { formation: '4-2-3-1', members: [...awayStarters, B(70914141, 'Attacker'), COACH(26959)] } };
  const members = [
    ...HOME_IDS.map((id) => P(id, ({ 47484495: 'maduka-okoye', 3679392: 'oumar-solet', 72688033: 'matteo-palma', 66220481: 'james-abankwah', 489221: 'hassane-kamara', 1407048: 'bartosz-piotrowski', 375123: 'jesper-karlstrom', 3052014: 'mergim-vojvoda', 4882805: 'jurgen-ekkelenkamp', 3209608: 'nicolo-zaniolo', 76901950: 'idrissa-gueye' } as any)[id], 229, id === 47484495 ? 40 : 1)),
    P(50409481, 'enzo-ebosse', 229, 77), P(66261238, 'unai-gomez', 229, 46), P(3206048, 'kosta-runjaic', 229, -1),
    ...AWAY_IDS.map((id) => P(id, ({ 550367: 'jean-butez', 66186532: 'alex-valle', 3064953: 't.-chalobah', 70914728: 'jacobo-ramon', 40742145: 'yan-couto', 671186: 'luis-milla', 64935156: 'maximo-perrone', 75251250: 'jesus-rodriguez', 56471954: 'martin-baturina', 65895085: 'nicolas-paz', 49579899: 'anastasios-douvikas' } as any)[id], 6117, 1)),
    P(70914141, 'assane-diao', 6117, 11), P(26959, 'cesc-fabregas', 6117, -1),
  ];
  const ev = (competitorId: number, gameTime: number, eventType: any, playerId: number, extraPlayers?: number[], stageId = 9, extra: any = {}) =>
    ({ competitorId, stageId, gameTime, addedTime: 0, gameTimeDisplay: `${gameTime}'`, playerId, extraPlayers, eventType, ...extra });
  const events = [
    ev(229, 28, { id: 2, name: 'بطاقة صفراء', subTypeId: -1 }, 1407048, undefined, 7),
    ev(229, 29, { id: 1, name: 'هدف', subTypeId: 1, subTypeName: 'هدف ميداني' }, 489221, [4882805], 7),
    ev(229, 41, { id: 2, name: 'بطاقة صفراء', subTypeId: -1 }, 66220481, undefined, 7),
    ev(229, 46, { id: 1000, name: 'Substitution', subTypeId: -1 }, 50409481, [72688033]),
    ev(6117, 54, { id: 1, name: 'هدف', subTypeId: 1, subTypeName: 'هدف ميداني' }, 49579899),
    ev(229, 90, { id: 2, name: 'بطاقة صفراء', subTypeId: -1 }, 66261238, undefined, 9, { addedTime: 3 }),
    ev(6117, 90, { id: 12, name: 'Woodwork', subTypeId: -1 }, 70914728, undefined, 9, { addedTime: 4 }),   // ignored by the converter
  ];
  return {
    id: 4732358, competitionId: 17, statusId: 3, statusGroup: 4, statusText: 'انتهت', shortStatusText: 'انتهت', startTime: '2026-08-22T16:30:00+00:00', gameTime: 90.0, gameTimeDisplay: '',
    homeCompetitor: home, awayCompetitor: away,
    stages: [{ id: 7, homeCompetitorScore: 1.0, awayCompetitorScore: 0.0 }, { id: 9 }, { id: 1, isCurrent: true }],
    events, members, ...over,
  };
}

/** What /stats/{id} returns (shape taken from workers/stats365.py): possession, shots, corners … per competitor. */
export const sampleStats = (h = 229, a = 6117) => ({
  statistics: [
    { competitorId: h, id: 10, name: 'ar', value: '38%' }, { competitorId: a, id: 10, name: 'ar', value: '62%' },
    { competitorId: h, id: 3, name: 'ar', value: '13' }, { competitorId: a, id: 3, name: 'ar', value: '11' },
    { competitorId: h, id: 4, name: 'ar', value: '4' }, { competitorId: a, id: 4, name: 'ar', value: '3' },
    { competitorId: h, id: 8, name: 'ar', value: '5' }, { competitorId: a, id: 8, name: 'ar', value: '3' },
    { competitorId: h, id: 76, name: 'ar', value: '1.2' }, { competitorId: a, id: 76, name: 'ar', value: '1.05' },
    { competitorId: h, id: 51, name: 'ar', value: '9' }, { competitorId: a, id: 51, name: 'ar', value: '7' },
    { competitorId: h, id: 999, name: 'إحصائية جديدة', value: '3' }, { competitorId: a, id: 999, name: 'إحصائية جديدة', value: '2' },
  ],
});

/** The fixture as football-data has it in matches.json. */
export const sampleFd = (over: any = {}) => ({
  id: 558629, competition_code: 'SA', utcDate: '2026-08-22T16:30:00Z', status: 'FINISHED',
  homeTeam: { id: 115, name: 'Udinese Calcio', shortName: 'Udinese', tla: 'UDI' }, awayTeam: { id: 7397, name: 'Como 1907', shortName: 'Como 1907', tla: 'COM' },
  score: { duration: 'REGULAR', fullTime: { home: 1, away: 1 }, halfTime: { home: 1, away: 0 }, regularTime: { home: null, away: null } }, ...over,
});
export const sampleMap = { s365_id: 4732358, fd_home_s365_id: 229, fd_away_s365_id: 6117, how: 'teams', fd_home_id: 115, fd_away_id: 7397 };
