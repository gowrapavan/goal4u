// Pure, dependency-free competition catalogue shared by the React app AND the server (SEO, sitemaps).
export type Comp = { code: string; slug: string; name: string; short: string; country: string; emblem: string; cup?: boolean; tournament?: boolean; aliases?: string[] };
export const COMPS: Comp[] = [
  { code: 'PL',  slug: 'premier-league',   name: 'Premier League',        short: 'Premier League', country: 'England', emblem: '/api/data/ext/c/PL.png' },
  { code: 'PD',  slug: 'la-liga',          name: 'La Liga',               short: 'La Liga',        country: 'Spain',   emblem: '/api/data/ext/c/laliga.png' },
  { code: 'SA',  slug: 'serie-a',          name: 'Serie A',               short: 'Serie A',        country: 'Italy',   emblem: '/api/data/ext/c/c111.png' },
  { code: 'BL1', slug: 'bundesliga',       name: 'Bundesliga',            short: 'Bundesliga',     country: 'Germany', emblem: '/api/data/ext/c/BL1.png' },
  { code: 'FL1', slug: 'ligue-1',          name: 'Ligue 1',               short: 'Ligue 1',        country: 'France',  emblem: '/api/data/ext/c/FL1.png' },
  { code: 'CL',  slug: 'champions-league', name: 'UEFA Champions League', short: 'Champions League', country: 'Europe', emblem: '/api/data/ext/c/CL.png', cup: true, aliases: ['uefa-champions-league'] },
  { code: 'ELC', slug: 'championship',     name: 'Championship',          short: 'Championship',   country: 'England', emblem: '/api/data/ext/c/ELC.png' },
];
/**
 * Tournaments live in their own edition folders in the data repo (world-cup/world-cup-2026, euros/euro-2028), not in a
 * league season. They are deliberately NOT in COMPS: COMPS drives the league lists, the sitemap and the SEO snapshot,
 * while tournaments are pages that open from the pill bar / search and are not indexed (see seo-meta.ts).
 */
export const TOURNAMENTS: Comp[] = [
  { code: 'WC', slug: 'fifa-world-cup',         name: 'FIFA World Cup',         short: 'World Cup', country: 'World',  emblem: '/api/data/ext/c/wm26.png', cup: true, tournament: true },
  { code: 'EC', slug: 'european-championship',  name: 'UEFA European Championship', short: 'Euro',  country: 'Europe', emblem: '/api/data/ext/c/ec.png',   cup: true, tournament: true, aliases: ['euro', 'euros'] },
];
export const ALL_COMPS: Comp[] = [...COMPS, ...TOURNAMENTS];
export const compByCode = (c?: string) => ALL_COMPS.find((x) => x.code === c);
export const compBySlug = (s?: string) => ALL_COMPS.find((x) => x.slug === s || x.aliases?.includes(s || '') || x.code.toLowerCase() === (s || '').toLowerCase());
