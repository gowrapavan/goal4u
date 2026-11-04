/**
 * What a player page says about itself in its FIRST html response (before any JavaScript), built only from the player's own record
 * (data/player_information/<id>.json). Pure functions: the page function / Express host fetches the record and calls these.
 * Nothing is invented: a field that is not in the record is simply left out.
 */
import { SITE_NAME } from '../lib/seo-text';

export interface PlayerFacts { name: string; position: string | null; club: string | null; nationality: string | null; nationalTeam: string | null; marketValue: string | null }

const ARABIC = /[\u0600-\u06FF]/;
const clean = (v: unknown, max = 80): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t && t.length <= max && !ARABIC.test(t) ? t : null;
};

/** The record as the repo stores it ({ name, details: {...} }, possibly wrapped in { data }). null when there is no usable name. */
export function playerFactsFrom(raw: any): PlayerFacts | null {
  const r = raw && !raw.details && raw.data ? raw.data : raw;
  const name = clean(r?.name, 80); if (!name) return null;
  const d = r?.details ?? {};
  const nat = Array.isArray(d.citizenship) ? clean(d.citizenship[0], 40) : null;
  return { name, position: clean(d.position, 40), club: clean(d.current_club_name, 60), nationality: nat, nationalTeam: clean(d.national_team_name, 40), marketValue: clean(d.market_value, 24) };
}

export function playerTitle(f: PlayerFacts): string {
  return `${f.name} Profile, ${f.marketValue ? 'Market Value' : 'Stats'} & Career | ${SITE_NAME}`;
}

/** "Kylian Mbappé · Centre-Forward · Real Madrid · France. Market value €160.00m. Season stats, recent form and honours on Goal4U." */
export function playerDescription(f: PlayerFacts): string {
  const bits = [f.position, f.club, f.nationality].filter(Boolean).join(' · ');
  return `${f.name}${bits ? ` · ${bits}` : ''}.${f.marketValue ? ` Market value ${f.marketValue}.` : ''} Season stats, recent form and honours on ${SITE_NAME}.`;
}

export function playerJsonLd(f: PlayerFacts, url: string): object {
  return {
    '@context': 'https://schema.org', '@type': 'Person', name: f.name, jobTitle: 'Footballer', url,
    ...(f.nationality ? { nationality: f.nationality } : {}),
    ...(f.club ? { memberOf: { '@type': 'SportsTeam', name: f.club, sport: 'Soccer' } } : {}),
  };
}

/** [label, value] rows for the crawlable body. */
export function playerRows(f: PlayerFacts): [string, string][] {
  return ([['Position', f.position], ['Club', f.club], ['Nationality', f.nationality], ['National team', f.nationalTeam], ['Market value', f.marketValue]] as [string, string | null][])
    .filter((x): x is [string, string] => !!x[1]);
}
