/**
 * "Related players" for a player page: his club teammates and the players of his national team.
 * Pure functions only (no fetching) so the rules are unit-tested; data-api.ts reads the files and calls buildRelated().
 *
 *   club group      the club's current-season squad (team_informations/<club>/<season>-squad.json), minus the player himself
 *   national group  the national team's squad file when the team can be found (team_informations/<id>/national-team-*.json),
 *                   otherwise players with the same nationality among the league market-value lists
 *   ranking         market value first (stars first), then attackers → midfielders → defenders → goalkeepers, then name
 *   no repeats      a club-mate who is also in the national group is listed once (club group) and tagged with the national team
 */
import type { ValuedPlayer } from './market-value';

export interface RosterPlayer { id: number; name: string; position: string | null; nationality?: string | null }
export interface RelatedPlayer extends RosterPlayer { valueEur: number | null; valueLabel: string | null; alsoNational?: boolean }
export interface RelatedGroup { key: 'club' | 'national'; title: string; teamId: number | null; teamName: string | null; players: RelatedPlayer[] }

const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const cleanStr = (v: any): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** lower-case, no accents/punctuation: "Atlético de Madrid" ≈ "atletico de madrid" (used to compare club / nation names). */
export const normName = (s: any) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Squad files come as { squad_roster: [{player_id,name,position}] } (Transfermarkt) or { squad: [{id,name,position,nationality}] } (football-data); accept both. */
export function rosterOf(raw: any): RosterPlayer[] {
  const d = raw?.data && !Array.isArray(raw) && !raw?.squad_roster && !raw?.squad ? raw.data : raw;
  const list: any[] = Array.isArray(d) ? d : Array.isArray(d?.squad_roster) ? d.squad_roster : Array.isArray(d?.squad) ? d.squad : Array.isArray(d?.players) ? d.players : [];
  const seen = new Set<number>(); const out: RosterPlayer[] = [];
  for (const p of list) {
    const id = num(p?.player_id ?? p?.id); const name = cleanStr(p?.name ?? p?.player_name);
    if (!id || !name || seen.has(id)) continue; seen.add(id);
    out.push({ id, name, position: cleanStr(p?.position), nationality: cleanStr(p?.nationality ?? p?.citizenship) });
  }
  return out;
}

/** Newest national-team squad file name in a team folder ("national-team-2026.json" beats "…-2024.json"), or null. */
export function pickNationalFile(files: { name: string; type: string }[] | null | undefined): string | null {
  const names = (files ?? []).filter((f) => f.type === 'file' && /^national-team-[\w-]+\.json$/.test(f.name)).map((f) => f.name);
  return names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0] ?? null;
}

const posBucket = (p: string | null): number => {
  const s = (p || '').toLowerCase();
  if (/forward|striker|winger|attack|wing/.test(s)) return 0;
  if (/mid/.test(s)) return 1;
  if (/back|defen|centre-back|center-back/.test(s)) return 2;
  if (/keeper|goal/.test(s)) return 3;
  return 4;
};

export function rank(players: RelatedPlayer[]): RelatedPlayer[] {
  return [...players].sort((a, b) => (b.valueEur ?? -1) - (a.valueEur ?? -1) || posBucket(a.position) - posBucket(b.position) || a.name.localeCompare(b.name));
}

export interface RelatedInput {
  selfId: number;
  club: { id: number | null; name: string | null };
  clubRoster: RosterPlayer[];
  national: { id: number | null; name: string | null };
  nationalRoster: RosterPlayer[];
  /** the player's own nationality (first citizenship) — used only when there is no national squad file */
  nationality: string | null;
  /** id → market value, from the league lists */
  values: Map<number, ValuedPlayer>;
  /** every valued player (for the nationality fallback) */
  valuedPlayers: ValuedPlayer[];
  clubLimit?: number; nationalLimit?: number;
}

export function buildRelated(i: RelatedInput): RelatedGroup[] {
  const withValue = (p: RosterPlayer): RelatedPlayer => { const v = i.values.get(p.id); return { ...p, valueEur: v?.valueEur ?? null, valueLabel: v?.valueLabel ?? null }; };
  const groups: RelatedGroup[] = [];

  // club teammates
  let clubRoster = i.clubRoster.filter((p) => p.id !== i.selfId);
  if (!clubRoster.length && i.club.name) {   // no squad file: the valued players of the same club are still real teammates
    const cn = normName(i.club.name);
    clubRoster = i.valuedPlayers.filter((v) => v.id && v.id !== i.selfId && normName(v.club) === cn).map((v) => ({ id: v.id!, name: v.name, position: v.position, nationality: v.nationality }));
  }
  const club = rank(clubRoster.map(withValue)).slice(0, i.clubLimit ?? 8);

  // national team
  let natRoster = i.nationalRoster.filter((p) => p.id !== i.selfId);
  if (natRoster.length < 3 && i.nationality) {
    const nn = normName(i.nationality);
    natRoster = i.valuedPlayers.filter((v) => v.id && v.id !== i.selfId && normName(v.nationality) === nn).map((v) => ({ id: v.id!, name: v.name, position: v.position, nationality: v.nationality }));
  }
  const natIds = new Set(natRoster.map((p) => p.id));
  const clubIds = new Set(club.map((p) => p.id));
  const national = rank(natRoster.filter((p) => !clubIds.has(p.id)).map(withValue)).slice(0, i.nationalLimit ?? 8);
  for (const p of club) if (natIds.has(p.id)) p.alsoNational = true;

  if (club.length) groups.push({ key: 'club', title: i.club.name ? `${i.club.name} teammates` : 'Teammates', teamId: i.club.id, teamName: i.club.name, players: club });
  const natName = i.national.name || i.nationality;
  if (national.length) groups.push({ key: 'national', title: natName ? `${natName} national team` : 'National team', teamId: i.national.id, teamName: natName, players: national });
  return groups;
}
