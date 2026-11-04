/** Real Madrid 4–1 Sevilla (La Liga, 2026-10-18), built from a real 365scores /game payload: real ids, athlete ids, positions, substitutions, events. */
type R = [id: number, athlete: number, slug: string, jersey: number];
const HOME = 131, AWAY = 135;
const star = (id: number, pos: string, role: string | undefined, line: number, side: number, ranking: number, stats: [number, string][] = [], sub?: { out: number; time: number }) => ({
  status: 1, statusText: 'Starting', position: { id: 1, name: 'ar', shortName: pos }, ...(role ? { formation: { id: 1, name: 'ar', shortName: role } } : {}),
  yardFormation: { line, fieldPosition: 1, fieldSide: side }, ranking, hasStats: true, stats: stats.map(([type, value], i) => ({ type, value, order: 20000 + i })), id, ...(sub ? {} : {}),
});
const bench = (id: number, pos: string, role: string, sub?: { out: number; time: number }, ranking = -1, stats: [number, string][] = []) => ({
  status: 2, statusText: 'Substitute', position: { id: 2, name: 'ar', shortName: pos }, formation: { id: 5, name: 'ar', shortName: role }, yardFormation: { line: 5, fieldPosition: 20 },
  ...(sub ? { substitution: { playerId: sub.out, time: sub.time, type: 1, status: 8 } } : {}), ranking, hasStats: !!sub, stats: stats.map(([type, value], i) => ({ type, value, order: 20000 + i })), id,
});
const miss = (id: number, pos: string, extra: any) => ({ status: 3, statusText: 'Missing', position: { id: 2, name: 'ar', shortName: pos }, hasStats: false, id, ...extra });
const coach = (id: number) => ({ status: 4, statusText: 'Management', position: { id: 0, name: 'الإدارة', shortName: 'Management' }, formation: { id: 16, name: 'المدرب', shortName: 'Coach' }, hasStats: false, id });

const HOME_R: R[] = [[211012, 826, 'thibaut-courtois', 1], [3568284, 50191, 'marc-cucurella', 17], [67547634, 124224, 'dean-huijsen', 4], [3216883, 48863, 'ibrahima-konate', 16], [480721, 41053, 'federico-valverde', 8], [5052341, 56328, 'aurelien-tchouameni', 14],
  [61736514, 101365, 'arda-guler', 15], [77099314, 201651, 'yan-diomande', 25], [46440257, 73000, 'jude-bellingham', 5], [58949561, 106075, 'endrick', 9], [1589889, 39820, 'kylian-mbappe', 10], [3353264, 48583, 'eder-militao', 3], [16842003, 66764, 'eduardo-camavinga', 6],
  [384169, 4461, 'bernardo-silva', 20], [1759210, 53800, 'brahim-diaz', 21], [71410331, 152810, 'carlos-espi', 19], [3171745, 48804, 'andriy-lunin', 13], [3235657, 48298, 'vinicius-junior', 7], [64224521, 104648, 'raul-asencio', 2], [5485503, 53912, 'rodrygo', 11], [631606, 49410, 'ferland-mendy', 23], [3194276, 46116, 'jose-mourinho', -1]];
const AWAY_R: R[] = [[357316, 5541, 'odisseas-vlachodimos', 1], [893355, 39185, 'gabriel-suazo', 17], [63090553, 109663, 'kike-salas', 4], [64404146, 105559, 'andres-castrin', 5], [54191092, 86780, 'juan-iglesias', 2], [1765601, 60602, 'youssouf-fofana', 24], [28726208, 69598, 'lucien-agoume', 6],
  [54826476, 87306, 'felix-correia', 20], [66308855, 117402, 'peque-fernandez', 10], [3520611, 49938, 'ruben-vargas', 11], [66608690, 117107, 'robbie-ure', 9], [61095913, 99263, 'jose-angel-carmona', 22], [66680411, 124555, 'manu-bueno', 14], [15499512, 68682, 'chidera-ejuke', 21],
  [7072649, 56846, 'alfon-gonzalez', 7], [66029772, 121037, 'lucas-stassin', 19], [67615192, 135200, 'isaac-romero', 16], [77391342, 219244, 'miguel-sierra', 30], [3255139, 48022, 'jon-guridi', 18], [49581346, 78369, 'giorgi-kochorashvili', 8], [3078136, 42396, 'marcao', 23], [329944, 62086, 'luis-garcia-plaza', -1]];
const members = [...HOME_R.map(([id, a, s, j]) => ({ competitorId: HOME, id, athleteId: a, name: 'ar-' + s, jerseyNumber: j, nameForURL: s })), ...AWAY_R.map(([id, a, s, j]) => ({ competitorId: AWAY, id, athleteId: a, name: 'ar-' + s, jerseyNumber: j, nameForURL: s }))];

const homeLineup = { status: 'مؤكد', formation: '4-2-3-1', members: [
  star(211012, 'Goalkeeper', 'Goalkeeper', 1, 50, 6.8, [[30, "90'"], [23, '4']]), star(3568284, 'Defender', 'Left Back', 2, 0, 6.2), star(67547634, 'Defender', 'Centre Back', 2, 33, 7.1), star(3216883, 'Defender', 'Centre Back', 2, 66, 6.5),
  star(480721, 'Midfielder', 'Central Midfield', 2, 100, 6.8, [[30, "84'"]]), star(5052341, 'Midfielder', undefined, 3, 20, 7.4), star(61736514, 'Midfielder', 'Attacking Midfield', 3, 80, 8.2, [[30, "77'"], [27, '1']]),
  star(77099314, 'Attacker', 'Right Forward', 4, 0, 8.2, [[30, "90'"], [27, '1'], [76, '0.23'], [3, '4'], [4, '1'], [19, '58/65 (89%)']]), star(46440257, 'Midfielder', 'Attacking Midfield', 4, 50, 7.7, [[30, "69'"], [26, '1']]),
  star(58949561, 'Attacker', 'Centre Forward', 4, 100, 6.9, [[30, "68'"]]),
  star(1589889, 'Attacker', 'Centre Forward', 5, 50, 8.3, [[30, "84'"], [27, '2(1ر.ج.)'], [47, '1'], [76, '1.8'], [3, '5'], [4, '3'], [19, '25/32 (78%)'], [87, '2'], [999, 'قيمة'], [42, '0'], [45, '54']]),
  bench(3353264, 'Defender', 'Centre Back', { out: 480721, time: 85 }), bench(16842003, 'Midfielder', 'Central Midfield', { out: 61736514, time: 78 }, 6.5), bench(384169, 'Midfielder', 'Attacking Midfield', { out: 46440257, time: 70 }, 6.1),
  bench(1759210, 'Attacker', 'Right Forward', { out: 58949561, time: 69 }, 6.2), bench(71410331, 'Attacker', 'Centre Forward', { out: 1589889, time: 85 }), bench(3171745, 'Goalkeeper', 'Goalkeeper'),
  miss(3235657, 'Attacker', { suspension: { id: 1, name: 'بطاقة حمراء' } }), miss(64224521, 'Defender', { injury: { reason: 'إصابة الساق', expectedReturn: 'Early January 2027', imageId: 'LEG_INJURY' } }),
  miss(5485503, 'Attacker', { injury: { reason: 'x', expectedReturn: 'Late December 2026', imageId: 'CRUCIATE_LIGAMENT_INJURY' } }), miss(631606, 'Defender', { injury: { reason: 'x', expectedReturn: 'عاد إلى تدريبات', imageId: 'LIGAMENT_INJURY' } }), coach(3194276)] };
const awayLineup = { status: 'مؤكد', formation: '4-2-3-1', members: [
  star(357316, 'Goalkeeper', 'Goalkeeper', 1, 50, 5.4, [[30, "90'"], [23, '3']]), star(893355, 'Defender', 'Left Back', 2, 0, 6.1), star(63090553, 'Defender', 'Centre Back', 2, 33, 5.9), star(64404146, 'Defender', 'Centre Back', 2, 66, 5.1),
  star(54191092, 'Defender', 'Right Back', 2, 100, 5.9, [[30, "71'"]]), star(1765601, 'Midfielder', undefined, 3, 20, 7.2), star(28726208, 'Midfielder', undefined, 3, 80, 6.9), star(54826476, 'Attacker', 'Left Forward', 4, 0, 6.4, [[30, "72'"]]),
  star(66308855, 'Attacker', 'Secondary striker', 4, 50, 6.3, [[30, "55'"]]), star(3520611, 'Attacker', 'Left Forward', 4, 100, 6.7, [[30, "45'"]]), star(66608690, 'Attacker', 'Centre Forward', 5, 50, 6.1, [[30, "55'"]]),
  bench(61095913, 'Defender', 'Right Back', { out: 54191092, time: 72 }, 6.2), bench(66680411, 'Midfielder', 'Central Midfield', { out: 66308855, time: 56 }, 6.6, [[30, "35'"], [27, '1']]), bench(15499512, 'Attacker', 'Left Forward', { out: 3520611, time: 46 }, 6.1),
  bench(7072649, 'Attacker', 'Left Forward', { out: 54826476, time: 73 }, 6.1), bench(66029772, 'Attacker', 'Centre Forward', { out: 66608690, time: 56 }, 6.5, [[30, "35'"], [26, '1']]),
  miss(67615192, 'Attacker', { suspension: { id: 1, name: 'بطاقة حمراء' } }), miss(77391342, 'Attacker', { injury: { reason: 'x', expectedReturn: 'Early December 2026', imageId: 'COLLARBONE_INJURY' } }),
  miss(3255139, 'Midfielder', { injury: { reason: 'x', expectedReturn: 'عاد إلى تدريبات', imageId: 'MUSCLE_INJURY' } }), miss(3078136, 'Defender', { injury: { reason: 'x', expectedReturn: 'Late October 2026', imageId: 'MUSCLE_INJURY' } }), coach(329944)] };

const ev = (competitorId: number, gameTime: number, eventType: any, playerId: number, extraPlayers?: number[], disp?: string) => ({ competitorId, stageId: 9, gameTime, addedTime: 0, gameTimeDisplay: disp ?? `${gameTime}'`, playerId, extraPlayers, eventType });
const GOAL = { id: 1, name: 'هدف', subTypeId: 1, subTypeName: 'هدف ميداني' }, PEN = { id: 1, name: 'هدف', subTypeId: 3, subTypeName: 'ركلة جزاء' }, YEL = { id: 2, name: 'بطاقة صفراء', subTypeId: -1 }, SUB = { id: 1000, name: 'Substitution', subTypeId: -1 };
const shot = (key: number, num: 1 | 2, time: string, playerId: number, side: number, line: number, xg: string, xgot: string, outId: number, body: string, subType?: number) =>
  ({ xg, xgot, bodyPart: body, key: String(key), competitorNum: num, time, playerId, line, side, type: 0, ...(subType != null ? { subType } : {}), outcome: { id: outId, name: 'ar' } });
const perf = (id: number, a: number, slug: string, pos: string, stats: [number, string][]) => ({ id, athleteId: a, name: 'ar', nameForURL: slug, positionShortName: pos, stats: stats.map(([type, value]) => ({ type, value, name: 'ar' })) });

export const realGame = (over: any = {}) => ({
  id: 4750823, competitionId: 11, statusId: 3, statusGroup: 4, statusText: 'انتهت', shortStatusText: 'انتهت', startTime: '2026-10-18T19:00:00+00:00', gameTime: 90, gameTimeDisplay: '', isHomeAwayInverted: false,
  homeCompetitor: { id: HOME, name: 'ar', score: 4, nameForURL: 'real-madrid', lineups: homeLineup }, awayCompetitor: { id: AWAY, name: 'ar', score: 1, nameForURL: 'sevilla', lineups: awayLineup },
  stages: [{ id: 7, homeCompetitorScore: 2, awayCompetitorScore: 0 }, { id: 9, homeCompetitorScore: 4, awayCompetitorScore: 1 }], members,
  events: [ev(HOME, 23, YEL, 67547634), ev(AWAY, 23, YEL, 54826476), ev(HOME, 30, GOAL, 61736514, [77099314]), ev(HOME, 37, GOAL, 1589889, [46440257]), ev(AWAY, 46, SUB, 15499512, [3520611], "45+1'"), ev(AWAY, 56, SUB, 66029772, [66608690]), ev(AWAY, 56, SUB, 66680411, [66308855]),
    ev(HOME, 63, PEN, 1589889), ev(HOME, 69, SUB, 1759210, [58949561]), ev(AWAY, 69, YEL, 54191092), ev(HOME, 70, SUB, 384169, [46440257]), ev(AWAY, 72, SUB, 61095913, [54191092]), ev(AWAY, 73, SUB, 7072649, [54826476]), ev(HOME, 73, YEL, 3568284),
    ev(HOME, 78, SUB, 16842003, [61736514]), ev(AWAY, 80, GOAL, 66680411, [66029772]), ev(HOME, 82, GOAL, 77099314, [5052341]), ev(HOME, 85, SUB, 3353264, [480721]), ev(HOME, 85, SUB, 71410331, [1589889])],
  venue: { id: 3370, name: 'ar', shortName: 'santiago-bernabeu', capacity: 81044, attendance: 73907 }, officials: [{ id: 1, athleteId: -1, name: 'Mateo Busquets Ferrer' }], tvNetworks: [{ id: 4902, name: 'beIN SPORTS HD 1' }],
  video: { id: 'yu_va7r7kko', type: 1, url: 'https://www.youtube.com/watch?v=yu_va7r7kko', source: 1 },
  promotedPredictions: { predictions: [
    { type: 1, title: 'ar', totalVotes: 113993, options: [{ num: 1, vote: { count: 90558, percentage: 79 } }, { num: 2, vote: { count: 9507, percentage: 8 } }, { num: 3, vote: { count: 13928, percentage: 13 } }] },
    { type: 3, title: 'عدد الاهداف (2.5)', totalVotes: 1863, options: [{ num: 1, vote: { count: 465, percentage: 25 } }, { num: 2, vote: { count: 1398, percentage: 75 } }] }] },
  topPerformers: { categories: [
    { name: 'الهجوم', homePlayer: perf(1589889, 39820, 'kylian-mbappe', 'Centre Forward', [[76, '1.8'], [4, '3'], [30, '84']]), awayPlayer: perf(66029772, 121037, 'lucas-stassin', 'Centre Forward', [[76, '0'], [4, '0'], [30, '35']]) },
    { name: 'الوسط', homePlayer: perf(77099314, 201651, 'yan-diomande', 'Right Forward', [[76, '0.23'], [4, '1'], [30, '90']]), awayPlayer: perf(1765601, 60602, 'youssouf-fofana', 'Midfielder', [[76, '0.19'], [4, '2'], [30, '90']]) },
    { name: 'الدفاع', homePlayer: perf(67547634, 124224, 'dean-huijsen', 'Centre Back', [[41, '2'], [20, '0'], [30, '90']]), awayPlayer: perf(61095913, 99263, 'jose-angel-carmona', 'Right Back', [[41, '0'], [30, '19']]) }] },
  chartEvents: { events: [
    shot(1, 2, "3'", 66608690, 89.9, 45.6, '0.01', '0.01', 2, '-', 7), shot(9, 1, "30'", 61736514, 83.9, 67.5, '0.06', '0.46', 0, 'القدم اليسرى', 4), shot(11, 1, "37'", 1589889, 94.5, 55.8, '0.76', '0.94', 0, 'القدم اليسرى', 4),
    shot(20, 1, "63'", 1589889, 88.5, 50, '0.79', '0.93', 0, 'القدم اليمنى', 9), shot(23, 2, "80'", 66680411, 87.4, 34.2, '0.05', '0.23', 0, 'القدم اليسرى', 4), shot(24, 1, "82'", 77099314, 81.1, 64.8, '0.05', '0.30', 0, 'القدم اليمنى', 4),
    shot(5, 2, "16'", 3520611, 87.5, 66.2, '0.04', '0.00', 1, 'القدم اليمنى', 4), shot(7, 1, "4'", 1589889, 80.8, 63, '0.06', '0.00', 1, 'القدم اليمنى'), shot(26, 1, '90 + 4\'', 5052341, 75.4, 57.3, '0.04', '0.03', 2, 'القدم اليمنى')] },
  actualPlayTime: { title: 'x', actualTime: { name: 'لُعِبَ بالفعل 60:38', progress: 0.67 }, totalTime: { name: 'الوقت الاجمالي 98:09', progress: 1.09 } },
  ...over,
});
export const realFd = (over: any = {}) => ({ id: 564709, utcDate: '2026-10-18T19:00:00Z', status: 'FINISHED', homeTeam: { id: 86, name: 'Real Madrid CF', shortName: 'Real Madrid', tla: 'RMA' }, awayTeam: { id: 559, name: 'Sevilla FC', shortName: 'Sevilla', tla: 'SEV' },
  score: { duration: 'REGULAR', fullTime: { home: 4, away: 1 }, halfTime: { home: 2, away: 0 } }, ...over });
export const realMap = { s365_id: 4750823, fd_home_s365_id: HOME, fd_away_s365_id: AWAY, how: 'auto', fd_home_id: 86, fd_away_id: 559 };
