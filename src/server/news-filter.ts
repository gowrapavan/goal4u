/**
 * News relevance — pure functions (no I/O), unit-tested.
 *
 * NewsAPI's keyword search can't tell football (soccer) from American football / rugby, so:
 *   1. queries are built around clubs, leagues, players and the CURRENT fixtures, restricted to football outlets;
 *   2. every article is re-checked here with a STRICT rule:
 *        - any non-soccer sport marker (NFL, rugby, cricket, AFL…) → rejected;
 *        - it must name a real club / league / competition / famous player (generic words like
 *          "transfer" or "manager" are NOT enough) — club names come from our own data;
 *   3. survivors are de-duplicated and ranked: stories about a recent/upcoming match first, then hot topics.
 */
export interface RawArticle { title?: string | null; description?: string | null; url?: string | null; publishedAt?: string | null; urlToImage?: string | null; source?: { name?: string | null } }

export const HOT_TOPICS: { label: string; terms: string[] }[] = [
  { label: 'Real Madrid', terms: ['real madrid', 'bellingham', 'vinícius', 'vinicius', 'mbappé', 'mbappe', 'bernabéu', 'bernabeu', 'ancelotti', 'xabi alonso'] },
  { label: 'Barcelona', terms: ['barcelona', 'barça', 'barca', 'yamal', 'lewandowski', 'raphinha', 'camp nou', 'hansi flick'] },
  { label: 'Man City', terms: ['manchester city', 'man city', 'haaland', 'guardiola', 'etihad'] },
  { label: 'Liverpool', terms: ['liverpool', 'salah', 'anfield', 'wirtz', 'arne slot', 'szoboszlai'] },
  { label: 'Man United', terms: ['manchester united', 'man united', 'man utd', 'old trafford'] },
  { label: 'Arsenal', terms: ['arsenal', 'arteta', 'saka', 'emirates stadium'] },
  { label: 'Premier League', terms: ['premier league', 'chelsea', 'tottenham', 'newcastle united', 'aston villa'] },
  { label: 'La Liga', terms: ['la liga', 'laliga', 'atlético', 'atletico madrid'] },
  { label: 'Ronaldo & Portugal', terms: ['cristiano', 'ronaldo', 'portugal', 'al nassr', 'bruno fernandes'] },
  { label: 'Champions League', terms: ['champions league', 'bayern', 'psg', 'paris saint-germain', 'dortmund', 'juventus', 'inter milan', 'ac milan', 'napoli'] },
];
const hotTerms = HOT_TOPICS.flatMap((t) => t.terms);

/** Strong, unambiguous soccer signals. (Deliberately NO generic words such as transfer / manager / penalty / derby.) */
const STRONG = [
  ...hotTerms, 'serie a', 'bundesliga', 'ligue 1', 'europa league', 'conference league', 'fa cup', 'carabao cup', 'copa del rey', 'efl championship',
  'uefa', 'fifa', 'nations league', 'world cup qualif', 'euro 2028', 'soccer', 'messi', 'neymar', 'lamine yamal', 'kane', 'rodri', 'pedri', 'gavi', 'musiala', 'olise',
  'celtic fc', 'celtic vs', 'vs celtic', 'benfica', 'porto', 'sporting cp', 'ajax', 'psv eindhoven', 'feyenoord', 'inter miami', 'brighton', 'west ham', 'everton',
  'fulham', 'brentford', 'crystal palace', 'nottingham forest', 'southampton', 'sevilla', 'valencia', 'villarreal', 'real sociedad', 'athletic club', 'as roma', 'lazio', 'atalanta',
  'fiorentina', 'galatasaray', 'fenerbahçe', 'olympique', 'marseille', 'monaco', 'lyon', 'leverkusen', 'leipzig', 'wolverhampton', 'sunderland', 'burnley', 'ipswich',
];

/** Non-soccer sports: any hit rejects the article, even if a club name also appears. */
const BLOCK = /\b(nfl|ncaa|ncaaf|college football|cfb|quarterback|touchdown|super bowl|gridiron|running back|wide receiver|linebacker|tight end|end zone|pro bowl|fantasy football|canadian football|cfl|afl|aussie rules|australian rules|gaelic|hurling|nba|wnba|mlb|nhl|nascar|march madness|rugby|six nations|all blacks|springboks|wallabies|scrum|fly-half|try line|premiership rugby|super rugby|nrl|cricket|ipl|test match|wimbledon|formula 1|grand prix|boxing|ufc|wwe)\b/i;

/** Club names that are also ordinary words — never used as auto-derived markers. */
const AMBIGUOUS = new Set(['nice', 'lens', 'metz', 'brest', 'bologna', 'union', 'real', 'sporting', 'athletic', 'inter', 'sevilla fc', 'rangers', 'hearts', 'derby', 'city', 'united', 'town', 'palace', 'forest', 'villa', 'wanderers', 'rovers', 'albion', 'wednesday', 'orient', 'argyle', 'county', 'athletico']);

/** lower-case + strip accents, so "Atlético" = "Atletico", "Mbappé" = "Mbappe". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const hay = (a: RawArticle) => fold(`${a.title || ''} ${a.description || ''}`);
const rxCache = new Map<string, RegExp>();
/** Word-boundary match: short terms must match whole words ("roma" ≠ "romance", "celtic" ≠ "celtics"); longer terms may take suffixes ("transfers"). */
const termRx = (t: string) => {
  let r = rxCache.get(t);
  if (!r) { const e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); r = new RegExp(`(^|[^\\p{L}\\p{N}])${e}${t.length <= 7 ? '($|[^\\p{L}\\p{N}])' : ''}`, 'iu'); rxCache.set(t, r); }
  return r;
};
const has = (text: string, terms: string[]) => terms.some((t) => termRx(fold(t)).test(text));

/** Turn a football-data team into search / marker terms: "Club Atlético de Madrid" → ["atlético de madrid"], shortName kept when distinctive. */
/** How headlines name clubs vs the official names in our data (keys are cleaned, lower-case, accents kept as in data). */
const ALIASES: Record<string, string[]> = {
  'atlético de madrid': ['atletico madrid', 'atleti'], 'paris saint-germain': ['psg', 'paris saint-germain'], 'manchester united': ['man united', 'man utd'],
  'manchester city': ['man city'], 'bayern münchen': ['bayern munich', 'bayern'], 'fc bayern münchen': ['bayern munich', 'bayern'], 'internazionale milano': ['inter milan', 'inter'],
  'milan': ['ac milan'], 'tottenham': ['spurs', 'tottenham'], 'wolverhampton wanderers': ['wolves'], 'borussia dortmund': ['dortmund'], 'bayer 04 leverkusen': ['leverkusen'],
  'newcastle united': ['newcastle'], 'nottingham forest': ['forest', 'nottingham forest'], 'real sociedad de fútbol': ['real sociedad'], 'athletic club': ['athletic bilbao'],
};
export function teamTerms(t: { name?: string | null; shortName?: string | null }): string[] {
  const clean = (n: string) => n.replace(/\b(FC|CF|AFC|SC|AC|AS|RC|SSC|SV|VfB|VfL|TSG|1\.|Club|Calcio|Football|Hotspur|Wanderers)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  for (const n of [t.name, t.shortName]) {
    if (!n) continue; const c = clean(n).toLowerCase();
    if (c.length >= 4 && !AMBIGUOUS.has(c)) out.add(c);
    for (const al of ALIASES[c] || []) if (!AMBIGUOUS.has(al)) out.add(al);
  }
  return [...out];
}

export function isSoccerArticle(a: RawArticle, extraMarkers: string[] = []): boolean {
  if (!a.title || !a.url) return false;
  const text = hay(a);
  if (BLOCK.test(text)) return false;
  return has(text, STRONG) || (extraMarkers.length > 0 && has(text, extraMarkers));
}

export const topicOf = (a: RawArticle): string | null => {
  const title = fold(a.title || ''), text = hay(a);
  const hit = HOT_TOPICS.find((t) => has(title, t.terms)) || HOT_TOPICS.find((t) => has(text, t.terms));
  return hit?.label ?? null;
};

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function dedupeArticles<T extends RawArticle>(list: T[]): T[] {
  const seenUrl = new Set<string>(), seenTitle = new Set<string>(); const out: T[] = [];
  for (const a of list) {
    const u = (a.url || '').split('?')[0], t = normTitle(a.title || '');
    if (!t || seenUrl.has(u) || seenTitle.has(t)) continue;
    seenUrl.add(u); seenTitle.add(t); out.push(a);
  }
  return out;
}

/* ───────────── match awareness ───────────── */
export interface FocusMatch { id: number; code: string; utcDate: string; home: string; away: string; homeTla?: string; awayTla?: string; homeTerms: string[]; awayTerms: string[] }
type FeedMatch = { id: number; code: string; utcDate: string; status?: string; homeTeam: { id: number; name?: string; shortName?: string | null; tla?: string | null }; awayTeam: { id: number; name?: string; shortName?: string | null; tla?: string | null } };

const PRIORITY_IDS = [86, 81, 66, 5, 524, 57, 65, 78, 64, 61];   // RM, FCB, MUN, FCB(Bayern), PSG, ARS, MCI, ATM, LIV, CHE
/**
 * Fixtures the news should be about: played in the last 2 days or kicking off in the next 3,
 * most important first (priority clubs, Champions League), capped at `max`.
 */
export function buildFocus(matches: FeedMatch[], now = Date.now(), max = 8): FocusMatch[] {
  const lo = now - 2 * 86400_000, hi = now + 3 * 86400_000;
  const weight = (m: FeedMatch) => [m.homeTeam.id, m.awayTeam.id].filter((i) => PRIORITY_IDS.includes(i)).length * 10 + (m.code === 'CL' ? 3 : 0);
  return matches
    .filter((m) => { const t = Date.parse(m.utcDate); return t >= lo && t <= hi && m.homeTeam?.name && m.awayTeam?.name; })
    .sort((a, b) => weight(b) - weight(a) || a.utcDate.localeCompare(b.utcDate))
    .slice(0, max)
    .map((m) => ({ id: m.id, code: m.code, utcDate: m.utcDate, home: m.homeTeam.shortName || m.homeTeam.name!, away: m.awayTeam.shortName || m.awayTeam.name!, homeTla: m.homeTeam.tla || undefined, awayTla: m.awayTeam.tla || undefined, homeTerms: teamTerms(m.homeTeam), awayTerms: teamTerms(m.awayTeam) }));
}

/** Which focus match (if any) an article is about: both clubs named = a match story, one club = team news. */
export function relatedMatch(a: RawArticle, focus: FocusMatch[]): { match: FocusMatch; both: boolean } | null {
  const title = fold(a.title || ''), text = hay(a); let best: { match: FocusMatch; both: boolean; s: number } | null = null;
  for (const m of focus) {
    const h = has(text, m.homeTerms), w = has(text, m.awayTerms); if (!h && !w) continue;
    const inTitle = has(title, m.homeTerms) || has(title, m.awayTerms);
    const s = (h && w ? 10 : 3) + (inTitle ? 2 : 0);
    if (!best || s > best.s) best = { match: m, both: h && w, s };
  }
  return best && { match: best.match, both: best.both };
}

/* ───────────── ranking ───────────── */
export function hotScore(a: RawArticle, now = Date.now(), focus: FocusMatch[] = []): number {
  const title = fold(a.title || ''), desc = fold(a.description || '');
  let s = 0;
  for (const t of HOT_TOPICS) { if (has(title, t.terms)) s += 3; else if (has(desc, t.terms)) s += 1; }
  const rel = relatedMatch(a, focus); if (rel) s += rel.both ? 10 : 4;          // recent / upcoming match stories come first
  const ageH = a.publishedAt ? (now - Date.parse(a.publishedAt)) / 3600_000 : 999;
  if (ageH < 12) s += 2; else if (ageH < 36) s += 1;
  if (a.urlToImage) s += 0.5;
  return s;
}
/** Stories are grouped into 8-hour bands, newest band first; inside a band the ones about recent / upcoming matches (and hot topics) come first, then the newest. */
export const BAND_HOURS = 8;
export const ageBand = (a: RawArticle, now = Date.now()): number => {
  const t = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
  if (!Number.isFinite(t)) return 9999;
  return Math.max(0, Math.floor((now - t) / 3600_000 / BAND_HOURS));
};
export function rankArticles<T extends RawArticle>(list: T[], now = Date.now(), focus: FocusMatch[] = []): T[] {
  return [...list].sort((a, b) => ageBand(a, now) - ageBand(b, now)
    || hotScore(b, now, focus) - hotScore(a, now, focus)
    || String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

/* ───────────── NewsAPI queries ───────────── */
/** Football outlets only — the single biggest precision win, since general outlets mix in NFL / rugby. */
export const FOOTBALL_DOMAINS = [
  'bbc.co.uk', 'bbc.com', 'skysports.com', 'goal.com', 'theguardian.com', 'marca.com', 'as.com', 'mundodeportivo.com', 'sport.es', '90min.com',
  'fourfourtwo.com', 'football365.com', 'talksport.com', 'mirror.co.uk', 'dailymail.co.uk', 'independent.co.uk', 'standard.co.uk', 'telegraph.co.uk',
  'givemesport.com', 'onefootball.com', 'uefa.com', 'premierleague.com', 'espn.co.uk', 'eurosport.com', 'teamtalk.com', 'caughtoffside.com', 'footballtransfers.com',
  'planetfootball.com', 'thesun.co.uk', 'metro.co.uk', 'footballlondon.com', 'sportsmole.co.uk', 'thetimes.co.uk', 'itv.com', 'tntsports.co.uk',
].join(',');

const NOT_OTHER = 'NOT ("NFL" OR "college football" OR NCAA OR quarterback OR touchdown OR rugby OR cricket OR NBA OR MLB)';
export function buildQueries(): string[] {
  return [
    `("Real Madrid" OR Barcelona OR "Atlético Madrid" OR "La Liga" OR Mbappé OR Bellingham OR Yamal OR Vinícius) ${NOT_OTHER}`,
    `("Manchester City" OR "Manchester United" OR Liverpool OR Arsenal OR Chelsea OR "Premier League" OR Haaland OR Salah) ${NOT_OTHER}`,
    `("Bayern Munich" OR PSG OR Juventus OR "Champions League" OR Cristiano OR Ronaldo OR Portugal OR Messi OR "Serie A" OR Bundesliga) ${NOT_OTHER}`,
  ];
}
/** Up to two queries naming the clubs in the focus fixtures (≤ 500 chars each). */
export function focusQueries(focus: FocusMatch[]): string[] {
  const names = [...new Set(focus.flatMap((m) => [m.homeTerms[0], m.awayTerms[0]]).filter(Boolean))] as string[];
  const out: string[] = []; let cur: string[] = [];
  const mk = (list: string[]) => `(${list.map((n) => `"${n}"`).join(' OR ')}) ${NOT_OTHER}`;
  for (const n of names) { if (mk([...cur, n]).length > 480) { out.push(mk(cur)); cur = []; } cur.push(n); }
  if (cur.length) out.push(mk(cur));
  return out.slice(0, 2);
}
