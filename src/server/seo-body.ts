/**
 * Crawlable page content for the FIRST html response (before any JavaScript runs): a heading, a factual summary, key
 * facts and internal links, all built from real records. React replaces it as soon as the app loads (createRoot).
 * Nothing here is invented: every line comes from the match / team / competition data or the shared SEO copy.
 */
import { breadcrumbTrail, competitionPath } from '../lib/routes';
import { COMPS, compByCode } from '../lib/competitions';
import { commonName, competitionSeo, matchHeading, matchSeo, seasonLabel, STATIC_SEO } from '../lib/seo-text';
import { currentSeasonSlug, teamPath } from '../lib/routes';
import type { SeoIndex, SeoMatch, SeoTeam } from './seo-data';
import { escAttr, escText } from './html-escape';
import { INFO_PAGES, type InfoSlug } from '../lib/site-pages';
import { playerDescription, playerRows, type PlayerFacts } from './player-seo';

const a = (path: string, text: string) => `<a href="${escAttr(path)}">${escText(text)}</a>`;
const wrap = (inner: string) => `<main data-seo-fallback="true" style="max-width:68rem;margin:0 auto;padding:1.25rem 1rem;font:16px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0b1020">${inner}</main>`;
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const nm = (t: { id: number; name: string }) => commonName(t.id, t.name);
const label = (m: SeoMatch) => (m.status === 'FINISHED' && m.score ? `${nm(m.home)} ${m.score.home}-${m.score.away} ${nm(m.away)}` : `${nm(m.home)} vs ${nm(m.away)}`);
const line = (m: SeoMatch) => `<li>${a(m.path, label(m))} – ${escText(compByCode(m.code)?.short || m.code)}, ${escText(dateOnly(m.utcDate))}</li>`;
const list = (ms: SeoMatch[]) => `<ul>${ms.map(line).join('')}</ul>`;
const nav = (pathname: string, search: string, leaf?: string) => {
  const t = breadcrumbTrail(pathname, search, leaf); if (t.length < 2) return '';
  return `<nav aria-label="Breadcrumb">${t.map((c, i) => (i === t.length - 1 ? escText(c.name) : a(c.path, c.name))).join(' › ')}</nav>`;
};
const upcoming = (idx: SeoIndex, now: number, filter: (m: SeoMatch) => boolean, n: number) =>
  idx.matches.filter((m) => m.status !== 'FINISHED' && +new Date(m.utcDate) >= now - 3 * 3600_000 && filter(m)).sort((x, y) => +new Date(x.utcDate) - +new Date(y.utcDate)).slice(0, n);
const finished = (idx: SeoIndex, filter: (m: SeoMatch) => boolean, n: number) =>
  idx.matches.filter((m) => m.status === 'FINISHED' && filter(m)).sort((x, y) => +new Date(y.utcDate) - +new Date(x.utcDate)).slice(0, n);

export function matchBody(m: SeoMatch, idx: SeoIndex, pathname: string, search: string): string {
  const comp = compByCode(m.code)!;
  const input = { homeId: m.home.id, awayId: m.away.id, home: m.home.name, away: m.away.name, compName: comp.name, compShort: comp.short, status: m.status, scoreHome: m.score?.home, scoreAway: m.score?.away, utcDate: m.utcDate, matchday: m.matchday };
  const meetings = finished(idx, (x) => x.id !== m.id && ((x.home.id === m.home.id && x.away.id === m.away.id) || (x.home.id === m.away.id && x.away.id === m.home.id)), 5);
  const state = m.status === 'FINISHED' ? (m.score ? `Full time: ${nm(m.home)} ${m.score.home}-${m.score.away} ${nm(m.away)}` : 'Full time') : (m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'LIVE') ? 'In play' : 'Scheduled';
  const hp = idx.teamById.get(m.home.id)?.path || teamPath(m.code, m.home.id), ap = idx.teamById.get(m.away.id)?.path || teamPath(m.code, m.away.id);
  return wrap(`${nav(pathname, search, `${nm(m.home)} vs ${nm(m.away)}`)}
<h1>${escText(matchHeading(input))}</h1>
<p>${escText(matchSeo(input).description)}</p>
<ul>
<li>Competition: ${a(competitionPath(m.code)!, comp.name)}</li>
<li>Kick-off: ${escText(dateTime(m.utcDate))}</li>
<li>Status: ${escText(state)}</li>
${m.matchday ? `<li>Matchday: ${m.matchday}</li>` : ''}${m.stage && m.stage !== 'REGULAR_SEASON' ? `<li>Stage: ${escText(m.stage.replace(/_/g, ' ').toLowerCase())}</li>` : ''}
</ul>
${meetings.length ? `<h2>Head to head: ${escText(nm(m.home))} v ${escText(nm(m.away))}</h2><p>Previous meetings in Goal4U’s records:</p>${list(meetings)}` : ''}
<p>${a(hp, `${nm(m.home)} fixtures, results & squad`)} · ${a(ap, `${nm(m.away)} fixtures, results & squad`)} · ${a(competitionPath(m.code)!, `${comp.name} table & fixtures`)}</p>`);
}

export function competitionBody(code: string, season: string | undefined, idx: SeoIndex, pathname: string, search: string, now: number): string {
  const comp = compByCode(code)!; const s = seasonLabel(season || currentSeasonSlug());
  const t = competitionSeo(comp.name, s);
  const clubs = idx.teams.filter((x) => x.code === code);
  const next = upcoming(idx, now, (m) => m.code === code, 10);
  return wrap(`${nav(pathname, search)}
<h1>${escText(`${comp.name} ${s} table, fixtures & results`)}</h1>
<p>${escText(t.description)}</p>
${next.length ? `<h2>Upcoming ${escText(comp.short)} fixtures</h2>${list(next)}` : ''}
${clubs.length ? `<h2>${escText(comp.short)} clubs</h2><ul>${clubs.map((c) => `<li>${a(c.path, commonName(c.id, c.name))}</li>`).join('')}</ul>` : ''}`);
}

export function teamBody(team: { id: number; name: string; code: string }, idx: SeoIndex, pathname: string, search: string, now: number, compName: string): string {
  const mine = (m: SeoMatch) => m.home.id === team.id || m.away.id === team.id;
  const next = upcoming(idx, now, mine, 5), last = finished(idx, mine, 5); const n = commonName(team.id, team.name);
  return wrap(`${nav(pathname, search, n)}
<h1>${escText(`${n} fixtures, results & squad`)}</h1>
<p>${escText(`${n} latest results, upcoming fixtures, squad and league position in the ${compName}.`)}</p>
${next.length ? `<h2>Next matches</h2>${list(next)}` : ''}${last.length ? `<h2>Recent results</h2>${list(last)}` : ''}`);
}

const LISTING_H1 = { home: 'Live football scores, fixtures & league tables', matches: 'Football scores, fixtures & results', news: 'Football news & transfers', watch: 'Football videos, highlights & shorts' } as const;
export function listingBody(kind: 'home' | 'matches' | 'news' | 'watch', idx: SeoIndex, now: number): string {
  const s = STATIC_SEO[kind]; const next = upcoming(idx, now, () => true, kind === 'home' ? 12 : kind === 'matches' ? 30 : 8);
  return wrap(`<h1>${escText(LISTING_H1[kind])}</h1>
<p>${escText(s.description)}</p>
${next.length ? `<h2>Upcoming matches</h2>${list(next)}` : ''}
<h2>Competitions</h2><ul>${COMPS.filter((c) => idx.competitions.some((x) => x.code === c.code)).map((c) => `<li>${a(competitionPath(c.code)!, c.name)}</li>`).join('')}</ul>`);
}
export type { SeoTeam };

/** Server-rendered copy of an information page (the text crawlers read before any JavaScript runs). */
export function infoBody(slug: InfoSlug): string {
  const pg = INFO_PAGES[slug];
  return `<article><h1>${escText(pg.heading)}</h1><p>${escText(pg.intro)}</p>${pg.sections.map((s) => `<section><h2>${escText(s.h)}</h2>${s.p.map((t) => `<p>${escText(t)}</p>`).join('')}</section>`).join('')}</article>`;
}

/** A player page's first response: his name as the heading, one factual sentence and the facts from his record. */
export function playerBody(f: PlayerFacts, pathname: string, search: string): string {
  const rows = playerRows(f).map(([k, v]) => `<li>${escText(k)}: ${escText(v)}</li>`).join('');
  return wrap(`${nav(pathname, search, f.name)}<article><h1>${escText(f.name)}</h1><p>${escText(playerDescription(f))}</p>${rows ? `<ul>${rows}</ul>` : ''}</article>`);
}
