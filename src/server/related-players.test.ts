import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterOf, pickNationalFile, buildRelated, rank, normName } from './related-players.ts';

const v = (id: number, name: string, valueEur: number, club: string, nationality: string, position = 'Centre-Forward'): any => ({ rank: 0, name, id, tmId: null, position, nationality, club, teamId: null, code: 'PD', valueEur, valueLabel: `€${valueEur / 1e6}M` });
const VALUED = [v(1, 'Kylian Mbappé', 160e6, 'Real Madrid', 'France'), v(2, 'Vinícius Júnior', 150e6, 'Real Madrid', 'Brazil', 'Left Winger'), v(3, 'Jude Bellingham', 160e6, 'Real Madrid', 'England', 'Attacking Midfield'),
  v(4, 'Aurélien Tchouaméni', 80e6, 'Real Madrid', 'France', 'Defensive Midfield'), v(5, 'Ousmane Dembélé', 90e6, 'Paris Saint-Germain', 'France', 'Right Winger'), v(6, 'Lamine Yamal', 180e6, 'FC Barcelona', 'Spain', 'Right Winger')];
const values = new Map(VALUED.map((p) => [p.id, p]));

test('rosterOf accepts both squad formats, skips bad rows and duplicates', () => {
  assert.deepEqual(rosterOf({ squad_roster: [{ player_id: '7', name: 'A', position: 'Goalkeeper' }, { player_id: 7, name: 'A again' }, { name: 'no id' }] }).map((p) => p.id), [7]);
  assert.deepEqual(rosterOf({ data: { squad: [{ id: 9, name: 'B', position: 'Defence', nationality: 'France' }] } }).map((p) => [p.id, p.nationality]), [[9, 'France']]);
  assert.deepEqual(rosterOf(null), []);
});
test('pickNationalFile takes the newest national-team squad file', () => {
  const f = (name: string) => ({ name, type: 'file' });
  assert.equal(pickNationalFile([f('2026-2027-squad.json'), f('national-team-2024.json'), f('national-team-2026.json')]), 'national-team-2026.json');
  assert.equal(pickNationalFile([f('2026-2027-squad.json')]), null);
  assert.equal(pickNationalFile(null), null);
});
test('stars first, then attackers before defenders, then name; the player himself is never listed', () => {
  const clubRoster = [{ id: 1, name: 'Kylian Mbappé', position: 'Centre-Forward' }, { id: 2, name: 'Vinícius Júnior', position: 'Left Winger' }, { id: 3, name: 'Jude Bellingham', position: 'Attacking Midfield' },
    { id: 20, name: 'Some Keeper', position: 'Goalkeeper' }, { id: 21, name: 'Some Winger', position: 'Right Winger' }, { id: 22, name: 'Some Back', position: 'Centre-Back' }];
  const g = buildRelated({ selfId: 1, club: { id: 86, name: 'Real Madrid' }, clubRoster, national: { id: null, name: null }, nationalRoster: [], nationality: 'France', values, valuedPlayers: VALUED });
  const club = g.find((x) => x.key === 'club')!;
  assert.deepEqual(club.players.map((p) => p.name), ['Jude Bellingham', 'Vinícius Júnior', 'Some Winger', 'Some Back', 'Some Keeper']);
  assert.equal(club.title, 'Real Madrid teammates'); assert.ok(!club.players.some((p) => p.id === 1));
});
test('no national squad file: same-nationality players from the value lists; club-mates are not repeated and are tagged', () => {
  const clubRoster = [{ id: 2, name: 'Vinícius Júnior', position: 'Left Winger' }, { id: 4, name: 'Aurélien Tchouaméni', position: 'Defensive Midfield' }];
  const g = buildRelated({ selfId: 1, club: { id: 86, name: 'Real Madrid' }, clubRoster, national: { id: null, name: 'France' }, nationalRoster: [], nationality: 'France', values, valuedPlayers: VALUED });
  const nat = g.find((x) => x.key === 'national')!;
  assert.deepEqual(nat.players.map((p) => p.name), ['Ousmane Dembélé']);          // Tchouaméni is France too but already shown with the club-mates
  assert.equal(g[0].players.find((p) => p.id === 4)!.alsoNational, true);
  assert.equal(nat.title, 'France national team');
});
test('with a national squad file it is used (and ranked by value)', () => {
  const nationalRoster = [{ id: 5, name: 'Ousmane Dembélé', position: 'Right Winger' }, { id: 30, name: 'Squad Man', position: 'Centre-Back' }, { id: 31, name: 'Other Man', position: 'Goalkeeper' }, { id: 1, name: 'Kylian Mbappé', position: 'Centre-Forward' }];
  const g = buildRelated({ selfId: 1, club: { id: null, name: null }, clubRoster: [], national: { id: 773, name: 'France' }, nationalRoster, nationality: 'France', values, valuedPlayers: VALUED });
  assert.deepEqual(g.map((x) => x.key), ['national']);
  assert.deepEqual(g[0].players.map((p) => p.name), ['Ousmane Dembélé', 'Squad Man', 'Other Man']);
});
test('no squad file for the club: valued players of the same club stand in; nothing found → no groups', () => {
  const g = buildRelated({ selfId: 1, club: { id: null, name: 'Real Madrid' }, clubRoster: [], national: { id: null, name: null }, nationalRoster: [], nationality: null, values, valuedPlayers: VALUED });
  assert.deepEqual(g[0].players.map((p) => p.name), ['Jude Bellingham', 'Vinícius Júnior', 'Aurélien Tchouaméni']);
  assert.deepEqual(buildRelated({ selfId: 99, club: { id: null, name: null }, clubRoster: [], national: { id: null, name: null }, nationalRoster: [], nationality: null, values, valuedPlayers: [] }), []);
});
test('name normalisation ignores accents and punctuation', () => { assert.equal(normName('Atlético de Madrid'), 'atletico de madrid'); assert.equal(rank([]).length, 0); });
