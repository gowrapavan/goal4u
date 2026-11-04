/**
 * Server-side <head> for every page: decides the HTTP status (404 for things that do not exist, 301 for the app's own
 * redirects), the canonical URL, robots directive, title/description and JSON-LD — from the same data and rules as the sitemap.
 */
import { classifyPath, canonicalPath, breadcrumbTrail, competitionPath, currentSeasonSlug } from '../lib/routes';
import { compByCode, compBySlug } from '../lib/competitions';
import { competitionSeo, matchSeo, teamSeo, playerSeo, STATIC_SEO, DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_SIZE, DEFAULT_OG_IMAGE_ALT, SITE_NAME, SITE_ALTERNATE_NAMES, seasonLabel } from '../lib/seo-text';
import { normalizeMatch, SeoMatch } from './seo-data';
import type { SeoSnapshot } from './seo-store';
import { escAttr, escText, jsonForScript } from './html-escape';
import { commonName } from '../lib/seo-text';
import { matchBody, competitionBody, teamBody, listingBody, infoBody, playerBody } from './seo-body';
import { playerFactsFrom, playerTitle, playerDescription, playerJsonLd } from './player-seo';
import type { InfoSlug } from '../lib/site-pages';

export interface SeoDecision {
  status: 200 | 301 | 404; redirectTo?: string;
  title: string; description: string; canonical?: string; robots: 'index,follow' | 'noindex,follow';
  ogType: string; image: string; jsonLd: object[];
  /** Crawlable page content for the first response (see seo-body.ts). */
  body?: string;
}
export interface SeoEnv {
  origin: string; snapshot: SeoSnapshot;
  /** Authoritative (possibly historical-season) match lookup — see locateMatch in data-api. Optional. */
  lookupMatch?: (id: string, code: string | undefined, season?: string) => Promise<any | null>;
  /** The player's own record (data/player_information/<id>.json): null = the source says there is none, a thrown error = it could not be reached. Optional. */
  lookupPlayer?: (id: string) => Promise<any | null>;
  now?: () => number;
}

const abs = (origin: string, path: string) => origin + path;
const crumbs = (origin: string, pathname: string, search: string, leaf?: string) => {
  const t = breadcrumbTrail(pathname, search, leaf); if (t.length < 2) return [];
  return [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: t.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(origin, c.path) })) }];
};
const notFound = (): SeoDecision => ({ status: 404, ...STATIC_SEO.notFound, robots: 'noindex,follow', ogType: 'website', image: DEFAULT_OG_IMAGE, jsonLd: [] });

function matchDecision(m: SeoMatch, snap: SeoSnapshot, origin: string, canonical: string, pathname: string, search: string): SeoDecision {
  const comp = compByCode(m.code)!;
  const t = matchSeo({ homeId: m.home.id, awayId: m.away.id, home: m.home.name, away: m.away.name, compName: comp.name, compShort: comp.short, status: m.status, scoreHome: m.score?.home, scoreAway: m.score?.away, utcDate: m.utcDate, matchday: m.matchday });
  const event = {
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${commonName(m.home.id, m.home.name)} vs ${commonName(m.away.id, m.away.name)}`, startDate: m.utcDate, sport: 'Soccer',
    url: abs(origin, canonical), description: t.description,
    homeTeam: { '@type': 'SportsTeam', name: commonName(m.home.id, m.home.name) },
    awayTeam: { '@type': 'SportsTeam', name: commonName(m.away.id, m.away.name) },
    superEvent: { '@type': 'SportsEvent', name: comp.name },
  };   // no venue/score fields: they are not in the data, so they are not claimed
  return { status: 200, ...t, canonical: abs(origin, canonical), robots: 'index,follow', ogType: 'website', image: DEFAULT_OG_IMAGE, jsonLd: [event, ...crumbs(origin, pathname, search, `${commonName(m.home.id, m.home.name)} vs ${commonName(m.away.id, m.away.name)}`)], body: matchBody(m, snap.index, pathname, search) };
}

export async function resolveSeo(req: { path: string; search: string }, env: SeoEnv): Promise<SeoDecision> {
  const { origin, snapshot } = env; const { index, ready } = snapshot; const now = (env.now || Date.now)();
  const r = classifyPath(req.path);
  const base = (t: { title: string; description: string }, canonical: string | null, extra: Partial<SeoDecision> = {}): SeoDecision => ({
    status: 200, ...t, canonical: canonical ? abs(origin, canonical) : undefined, robots: 'index,follow', ogType: 'website', image: DEFAULT_OG_IMAGE,
    jsonLd: canonical ? crumbs(origin, req.path, req.search) : [], ...extra,
  });

  switch (r.kind) {
    case 'redirect': return { ...notFound(), status: 301, redirectTo: r.redirectTo };
    case 'home': return base(STATIC_SEO.home, '/', { jsonLd: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES, url: origin + '/', inLanguage: 'en' },
      { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, alternateName: SITE_ALTERNATE_NAMES, url: origin + '/', logo: origin + DEFAULT_OG_IMAGE }], body: ready ? listingBody('home', index, now) : undefined });
    case 'matches': return base(STATIC_SEO.matches, '/matches', { body: ready ? listingBody('matches', index, now) : undefined });
    case 'news': return base(STATIC_SEO.news, '/news', { body: ready ? listingBody('news', index, now) : undefined });
    case 'info': { const pg = r.params.page as InfoSlug; return base(STATIC_SEO[pg], `/${pg}`, { body: infoBody(pg) }); }
    case 'watch': return base(STATIC_SEO.watch, '/watch', { body: ready ? listingBody('watch', index, now) : undefined });

    case 'competition': case 'competition-alias': {
      const comp = compBySlug(r.params.slug); if (!comp) return notFound();
      const season = r.params.season || currentSeasonSlug();
      return base(competitionSeo(comp.name, seasonLabel(season)), canonicalPath(req.path, req.search), { ...(comp.tournament ? { robots: 'noindex,follow' } : {}), body: ready && !r.params.season ? competitionBody(comp.code, undefined, index, req.path, req.search, now) : undefined });
    }

    case 'team': {
      const comp = compBySlug(r.params.slug); const id = Number(new URLSearchParams(req.search).get('teamId'));
      if (!comp || !Number.isInteger(id) || id <= 0) return notFound();
      const team = index.teamById.get(id)
        ?? (() => { const m = index.matches.find((x) => x.home.id === id || x.away.id === id); const s = m && (m.home.id === id ? m.home : m.away); return s ? { id: s.id, name: s.name, crest: s.crest, code: m!.code } : undefined; })();
      if (!team) return ready ? notFound() : base({ title: STATIC_SEO.home.title, description: STATIC_SEO.home.description }, null, { robots: 'noindex,follow' });
      const canonical = canonicalPath(req.path, req.search)!;
      return base(teamSeo(commonName(team.id, team.name), comp.name), canonical, { jsonLd: [
        { '@context': 'https://schema.org', '@type': 'SportsTeam', name: commonName(team.id, team.name), sport: 'Soccer', url: abs(origin, canonical) },
        ...crumbs(origin, req.path, req.search, commonName(team.id, team.name))], body: ready ? teamBody({ id: team.id, name: team.name, code: (team as any).code || comp.code }, index, req.path, req.search, now, comp.name) : undefined });
    }

    case 'match': {
      const id = r.params.id; if (!/^\d+$/.test(id)) return notFound();
      const canonical = canonicalPath(req.path, req.search)!;
      const hit = !r.params.season ? index.matchById.get(Number(id)) : undefined;
      if (hit) return matchDecision(hit, snapshot, origin, canonical, req.path, req.search);
      // not in the current-season index: ask the authoritative resolver (also covers archived seasons)
      const code = (new URLSearchParams(req.search).get('c') || '').toUpperCase() || undefined;
      let found: any = null; let looked = false;
      if (env.lookupMatch) { try { found = await env.lookupMatch(id, code, r.params.season); looked = true; } catch { looked = false; } }
      if (found?.match) { const n = normalizeMatch(found.match, found.code); if (n.match) return matchDecision(n.match, snapshot, origin, canonical, req.path, req.search); }
      if (looked && ready) return notFound();                                  // data is loaded and the match really is not there
      return base({ title: STATIC_SEO.matches.title, description: STATIC_SEO.matches.description }, null, { robots: 'noindex,follow' });   // cannot verify → serve, but do not index
    }

    case 'player': {
      const id = r.params.name; if (!/^\d+$/.test(id)) return notFound();
      const canonical = canonicalPath(req.path, req.search)!;
      let facts = null as ReturnType<typeof playerFactsFrom>;
      if (env.lookupPlayer) { try { facts = playerFactsFrom(await env.lookupPlayer(id)); } catch { facts = null; } }
      if (facts) {
        return base({ title: playerTitle(facts), description: playerDescription(facts) }, canonical, {
          jsonLd: [playerJsonLd(facts, abs(origin, canonical)), ...crumbs(origin, req.path, req.search, facts.name)], body: playerBody(facts, req.path, req.search),
        });
      }
      // no verified facts (record missing, or the source could not be reached): the generic text is served but must not be indexed
      // for thousands of players alike. The page itself still works; Google can index it later, when the record is there.
      return base(playerSeo(), canonical, { robots: 'noindex,follow' });
    }
    default: return notFound();
  }
}

/* ─────────────── HTML <head> injection ─────────────── */
export { escAttr, escText, jsonForScript };

/**
 * Put the decision into the HTML template. Every tag we add carries data-rh="true" — the attribute react-helmet-async
 * uses — so once the app hydrates, Helmet replaces them instead of leaving duplicates behind.
 */
/**
 * Site-verification tags for Google Search Console / Bing Webmaster Tools, from GOOGLE_SITE_VERIFICATION and BING_SITE_VERIFICATION.
 * Only a value that looks like a real token is used (anything else is ignored, never written into the page).
 * (Instead of a tag, a verification FILE also works: put google<token>.html or BingSiteAuth.xml in public/.)
 */
export interface HeadOptions { googleVerification?: string; bingVerification?: string }
export function verificationFromEnv(env: Record<string, string | undefined> = process.env): HeadOptions {
  const g = String(env.GOOGLE_SITE_VERIFICATION ?? '').trim(); const b = String(env.BING_SITE_VERIFICATION ?? '').trim();
  return { googleVerification: /^[A-Za-z0-9_-]{20,100}$/.test(g) ? g : undefined, bingVerification: /^[A-Za-z0-9]{16,64}$/.test(b) ? b : undefined };
}

export function injectHead(html: string, d: SeoDecision, opts: HeadOptions = {}): string {
  const m = (attr: string, val: string, content: string) => `<meta ${attr}="${val}" content="${escAttr(content)}" data-rh="true" />`;
  // verification tags are NOT data-rh: the app's own head management must not remove them after the page loads
  const verify = (name: string, v?: string) => (v ? `<meta name="${name}" content="${escAttr(v)}" />` : '');
  // the default image is a path: make it absolute from the page's own canonical origin (none for a 404, which carries no image tag)
  const img = /^https?:/.test(d.image) ? d.image : d.canonical ? new URL(d.canonical).origin + d.image : '';
  const defaultImg = d.image === DEFAULT_OG_IMAGE;
  const imgAlt = defaultImg ? DEFAULT_OG_IMAGE_ALT : d.title;
  const tags = [
    verify('google-site-verification', opts.googleVerification), verify('msvalidate.01', opts.bingVerification),
    m('name', 'description', d.description), m('name', 'robots', d.robots),
    d.canonical ? `<link rel="canonical" href="${escAttr(d.canonical)}" data-rh="true" />` : '',
    m('property', 'og:title', d.title), m('property', 'og:description', d.description), m('property', 'og:type', d.ogType),
    d.canonical ? m('property', 'og:url', d.canonical) : '', img ? m('property', 'og:image', img) : '', img && defaultImg ? m('property', 'og:image:width', String(DEFAULT_OG_IMAGE_SIZE.width)) : '', img && defaultImg ? m('property', 'og:image:height', String(DEFAULT_OG_IMAGE_SIZE.height)) : '', img ? m('property', 'og:image:alt', imgAlt) : '', m('property', 'og:site_name', SITE_NAME), m('property', 'og:locale', 'en_US'),
    m('name', 'twitter:card', d.image === DEFAULT_OG_IMAGE ? 'summary' : 'summary_large_image'), m('name', 'twitter:title', d.title), m('name', 'twitter:description', d.description), img ? m('name', 'twitter:image', img) : '', img ? m('name', 'twitter:image:alt', imgAlt) : '',
    ...d.jsonLd.map((j) => `<script type="application/ld+json" data-rh="true">${jsonForScript(j)}</script>`),
  ].filter(Boolean).join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escText(d.title)}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/i, '')
    .replace('</head>', `    ${tags}\n  </head>`)
    .replace('<div id="root"></div>', () => `<div id="root">${d.body || ''}</div>`);
}
