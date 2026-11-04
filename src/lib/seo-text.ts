/** Page titles & descriptions — used by BOTH the server (first HTML response) and the React pages, so they always agree. */
export const SITE_NAME = 'Goal4U';
/** Other ways people write the brand. Declared in WebSite structured data (Google's site-name feature) — not stuffed into page text. */
export const SITE_ALTERNATE_NAMES = ['Goal4U Live', 'Goal 4 U', 'Goal U'];
/** Default social-share image: the site's own logo (a path; made absolute where the origin is known). */
export const DEFAULT_OG_IMAGE = '/logo/android-chrome-512x512.png';
/** The default image is a 512 × 512 square (its file name says so): declared so Facebook / LinkedIn can lay the card out without fetching it first. */
export const DEFAULT_OG_IMAGE_SIZE = { width: 512, height: 512 };
export const DEFAULT_OG_IMAGE_ALT = `${SITE_NAME} logo`;

export const STATIC_SEO = {
  home: { title: 'Goal4U Live – Football Scores, Fixtures, Tables & Match Centre', description: 'Goal4U live football scores, fixtures, results, league tables, top scorers and match centre for the Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and the Champions League.' },
  matches: { title: 'Football Scores, Fixtures & Results | Goal4U', description: 'Live football scores, fixtures and results across the Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and Champions League.' },
  news: { title: 'Football News & Transfers | Goal4U', description: 'Latest football news on Real Madrid, Barcelona, Manchester City, Liverpool, the Premier League, La Liga, Cristiano Ronaldo and Portugal.' },
  watch: { title: 'Football Videos, Highlights & Shorts | Goal4U', description: 'Match highlights, club videos and football shorts from official channels.' },
  about: { title: 'About Goal4U | Live Football Scores, Tables & Match Centre', description: 'Goal4U is a football scores and stats site: live scores, fixtures, tables, line-ups, shot maps, player profiles, highlights and news from Europe’s top competitions.' },
  contact: { title: 'Contact Goal4U | Corrections, Feedback & Enquiries', description: 'Contact Goal4U to report a wrong score or statistic, send feedback, ask about data, or make a business or copyright enquiry.' },
  privacy: { title: 'Privacy Policy | Goal4U', description: 'How Goal4U handles your information: no accounts, what is stored in your browser, and which third-party services load on our pages.' },
  terms: { title: 'Terms of Use | Goal4U', description: 'The terms for using Goal4U: personal use, information only, no betting advice, third-party data and trademarks.' },
  notFound: { title: 'Page not found | Goal4U', description: 'This page doesn’t exist.' },
} as const;

export const seasonLabel = (slug: string) => slug.replace('-', '/');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const clip = (s: string, n = 300) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export const competitionSeo = (name: string, season: string) => ({
  title: `${name} ${season} Table, Fixtures, Results & Stats | ${SITE_NAME}`,
  description: `${name} standings, fixtures, results and top scorers for the ${season} season.`,
});

/* ───────── names people actually search for ───────── */
/** football-data ids → the name fans type into Google ("Barcelona", not the data's short name "Barça"). IDs verified against the repo data. */
export const COMMON_NAME: Record<number, string> = {
  86: 'Real Madrid', 81: 'Barcelona', 78: 'Atlético Madrid', 65: 'Manchester City', 66: 'Manchester United', 57: 'Arsenal', 73: 'Tottenham',
  64: 'Liverpool', 62: 'Everton', 61: 'Chelsea', 108: 'Inter', 98: 'AC Milan', 109: 'Juventus', 5: 'Bayern Munich', 4: 'Borussia Dortmund',
  524: 'PSG', 516: 'Marseille',
};
/** Curated name, otherwise the data name without legal prefixes/suffixes ("Leeds United FC" → "Leeds United"). */
export const commonName = (id: number, name: string) =>
  COMMON_NAME[id] || (name.replace(/^(FC|AFC|CF|SC|SV|RC)\s+/i, '').replace(/\s+(FC|AFC|CF|SC)$/i, '').trim() || name);

/** Famous fixtures that have their own search term. Only added when BOTH club ids match. */
const DERBIES: [number, number, string][] = [
  [86, 81, 'El Clásico'], [65, 66, 'Manchester derby'], [57, 73, 'North London derby'], [64, 62, 'Merseyside derby'],
  [108, 98, 'Derby della Madonnina'], [5, 4, 'Der Klassiker'], [86, 78, 'Madrid derby'], [524, 516, 'Le Classique'],
];
export const rivalry = (a: number, b: number) => DERBIES.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2];

export interface MatchSeoInput { homeId: number; awayId: number; home: string; away: string; compName: string; compShort: string; status: string; scoreHome?: number | null; scoreAway?: number | null; utcDate: string; matchday?: number | null }
const names = (i: MatchSeoInput) => ({ H: commonName(i.homeId, i.home), A: commonName(i.awayId, i.away), derby: rivalry(i.homeId, i.awayId) });

/** On-page heading (h1): the exact phrase people search, plus the derby name and the competition round. */
export function matchHeading(i: MatchSeoInput) {
  const { H, A, derby } = names(i);
  return `${H} vs ${A}${derby ? ` – ${derby}` : ''}${i.compShort ? `, ${i.compShort}${i.matchday ? ` matchday ${i.matchday}` : ''}` : ''}`;
}

/**
 * Built only from fields present in the match record, and only promises what the page delivers: live score / result,
 * Stats, Form & table, Line-ups and Head to head tabs. (No "highlights" until the page really has them.)
 */
export function matchSeo(i: MatchSeoInput) {
  const { H, A, derby } = names(i);
  const done = (i.status === 'FINISHED' || i.status === 'AWARDED') && i.scoreHome != null && i.scoreAway != null;
  const live = i.status === 'IN_PLAY' || i.status === 'PAUSED' || i.status === 'LIVE';
  const md = i.matchday ? `, matchday ${i.matchday}` : '';
  const date = fmtDate(i.utcDate);
  const tag = derby ? ` (${derby})` : '';
  if (done) return {
    title: `${H} ${i.scoreHome}-${i.scoreAway} ${A}${tag} – result, stats & head to head | ${SITE_NAME}`,
    description: clip(`${H} ${i.scoreHome}-${i.scoreAway} ${A}${tag} in the ${i.compName}${md}, played on ${date}. Full-time result, match stats, form, line-ups and head to head record.`),
  };
  return {
    title: `${H} vs ${A}${tag} – live score, stats & head to head | ${SITE_NAME}`,
    description: clip(live
      ? `Follow ${H} vs ${A}${tag} in the ${i.compName}${md} live: score, events and match stats (${date}). Plus form, line-ups and head to head record.`
      : `${H} vs ${A}${tag} in the ${i.compName}${md} on ${date}. Live score on the day, plus form, table position, line-ups and head to head record.`),
  };
}
export const teamSeo = (team: string, compName?: string) => ({
  title: `${team} Fixtures, Results, Squad & Stats | ${SITE_NAME}`,
  description: `${team} latest results, upcoming fixtures, squad and league position${compName ? ` in the ${compName}` : ''}.`,
});
export const playerSeo = (name?: string) => ({
  // (the server builds richer text from the player's own record: server/player-seo.ts; this is the client's and the no-record fallback)
  title: `${name || 'Player'} Profile, Market Value & Career | ${SITE_NAME}`,
  description: `${name || 'Player'}: position, age, club, market value and honours.`,
});
