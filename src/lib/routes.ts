/**
 * Route knowledge shared by the React app and the server.
 * Single source of truth for: which paths exist, which ones are indexable, and what their CANONICAL url is.
 * The server uses it for sitemaps, HTTP status codes, redirects and <head> tags; the client SEO component uses it
 * so the canonical in the HTML the crawler first receives equals the one after hydration and the one in the sitemap.
 * A test (seo-routes.test.ts) reads App.tsx and fails if a <Route> is added there but not understood here.
 */
import { COMPS, compByCode, compBySlug } from './competitions';
import { INFO_SLUGS } from './site-pages';

export const TAB_ALIASES = ['standings', 'results', 'fixtures', 'stats', 'analytics', 'predictions'] as const;
export type RouteKind = 'home' | 'matches' | 'news' | 'watch' | 'competition' | 'competition-alias' | 'match' | 'team' | 'player' | 'info' | 'redirect' | 'notfound';
export interface Classified { kind: RouteKind; params: Record<string, string>; redirectTo?: string }

const SEASON = /^\d{4}-\d{4}$/;
const DIGITS = /^\d+$/;

/** Map a URL pathname to the route the React router would render for it (mirrors App.tsx). */
export function classifyPath(pathname: string): Classified {
  const seg = pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const n = seg.length, [a, b, c] = seg;
  const hit = (kind: RouteKind, params: Record<string, string> = {}, redirectTo?: string): Classified => ({ kind, params, redirectTo });
  if (n === 0) return hit('home');
  if (n === 1 && a === 'matches') return hit('matches');
  if (n === 1 && a === 'news') return hit('news');
  if (n === 1 && a === 'watch') return hit('watch');
  if (n === 1 && (INFO_SLUGS as readonly string[]).includes(a)) return hit('info', { page: a });
  if (n === 1 && a === 'live') return hit('redirect', {}, '/matches?filter=live');
  if (n === 1 && a === 'media') return hit('redirect', {}, '/watch');
  if (n === 2 && a === 'h2h') return hit('redirect', {}, '/matches');
  if (n === 2 && a === 'match') return hit('match', { id: b });
  if (n === 3 && b === 'match') return hit('match', { season: a, id: c });
  if (a === 'competition' && (n === 2 || n === 3)) return hit('competition', n === 3 ? { slug: b, season: c } : { slug: b });
  if ((TAB_ALIASES as readonly string[]).includes(a) && (n === 2 || n === 3)) return hit('competition-alias', n === 3 ? { slug: b, season: c } : { slug: b });
  if (a === 'top-scorers' && n === 2) return hit('redirect', { slug: b }, `/competition/${b}?tab=stats`);
  if (b === 'top-scorers' && n === 3) return hit('redirect', { season: a, slug: c }, `/competition/${c}/${a}?tab=stats`);
  if (a === 'archive' && (n === 2 || n === 3)) return hit('redirect', {}, n === 3 ? `/competition/${b}/${c}` : `/competition/${b}`);
  if (a === 'team' && (n === 2 || n === 3)) return hit('team', n === 3 ? { slug: b, season: c } : { slug: b });
  if (a === 'player' && n === 2) return hit('player', { name: b });
  return hit('notfound');
}

/* ───────── canonical path builders (the ONLY place that formats these URLs) ───────── */
export const currentSeasonSlug = (now: Date = new Date()) => { const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; return `${y}-${y + 1}`; };
export const competitionPath = (code: string, season?: string) => { const c = compByCode(code); return c ? `/competition/${c.slug}${season ? `/${season}` : ''}` : null; };
export const matchPath = (m: { id: number | string; code: string; seasonSlug?: string }, now: Date = new Date()) =>
  m.seasonSlug && m.seasonSlug !== currentSeasonSlug(now) ? `/${m.seasonSlug}/match/${m.id}?c=${m.code}` : `/match/${m.id}?c=${m.code}`;
export const teamPath = (code: string, id: number | string) => `/team/${compByCode(code)?.slug || code.toLowerCase()}?teamId=${id}`;
export const playerPath = (id: number | string) => `/player/${id}`;

/** Canonical path(+query) for a request, or null when the URL must not be indexed (redirect / unknown). */
export function canonicalPath(pathname: string, search = ''): string | null {
  const r = classifyPath(pathname);
  const q = new URLSearchParams(search);
  switch (r.kind) {
    case 'home': return '/';
    case 'matches': return '/matches';
    case 'news': return '/news';
    case 'watch': return '/watch';
    case 'info': return `/${r.params.page}`;
    case 'competition': case 'competition-alias': {
      const c = compBySlug(r.params.slug); if (!c) return null;
      const season = r.params.season && SEASON.test(r.params.season) ? r.params.season : undefined;
      return competitionPath(c.code, season);
    }
    case 'match': {
      if (!DIGITS.test(r.params.id)) return null;
      const code = (q.get('c') || '').toUpperCase(); const season = r.params.season;
      const qc = compByCode(code) ? `?c=${code}` : '';
      return season && SEASON.test(season) && season !== currentSeasonSlug() ? `/${season}/match/${r.params.id}${qc}` : `/match/${r.params.id}${qc}`;
    }
    case 'team': {
      const c = compBySlug(r.params.slug); const id = q.get('teamId') || '';
      if (!c || !DIGITS.test(id)) return null;
      const season = r.params.season && SEASON.test(r.params.season) ? `/${r.params.season}` : '';
      return `/team/${c.slug}${season}?teamId=${id}`;
    }
    case 'player': return DIGITS.test(r.params.name) ? playerPath(r.params.name) : null;
    default: return null;
  }
}

/** Breadcrumb trail (names + paths) for indexable page kinds. `leaf` is the page's own name. */
export function breadcrumbTrail(pathname: string, search = '', leaf?: string): { name: string; path: string }[] {
  const r = classifyPath(pathname); const q = new URLSearchParams(search);
  const home = { name: 'Goal4U', path: '/' };
  const label: Partial<Record<RouteKind, string>> = { matches: 'Scores & fixtures', news: 'Football news', watch: 'Videos & highlights' };
  const cp = canonicalPath(pathname, search); if (!cp) return [];
  const me = (name: string) => ({ name, path: cp });
  switch (r.kind) {
    case 'home': return [home];
    case 'info': return [home, me({ about: 'About', contact: 'Contact', privacy: 'Privacy Policy', terms: 'Terms of Use' }[r.params.page] || 'Info')];
    case 'matches': case 'news': case 'watch': return [home, me(label[r.kind]!)];
    case 'competition': case 'competition-alias': { const c = compBySlug(r.params.slug)!; return [home, me(c.name)]; }
    case 'match': { const c = compByCode((q.get('c') || '').toUpperCase()); return [home, { name: label.matches!, path: '/matches' }, ...(c ? [{ name: c.name, path: competitionPath(c.code)! }] : []), me(leaf || 'Match')]; }
    case 'team': { const c = compBySlug(r.params.slug)!; return [home, { name: c.name, path: competitionPath(c.code)! }, me(leaf || 'Club')]; }
    case 'player': return [home, me(leaf || 'Player')];
    default: return [];
  }
}

export { COMPS };
