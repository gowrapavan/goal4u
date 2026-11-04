/**
 * /llms.txt — a short, factual guide for AI tools (an optional convention, not a ranking factor).
 * Built from the real competition list and the site's own pages; every link uses the site's own address.
 * It describes the website only: it never names the data service behind it.
 */
import { SITE_NAME } from '../lib/seo-text';

export function llmsTxt(origin: string, competitions: { name: string; path: string }[]): string {
  const o = origin.replace(/\/+$/, '');
  const comps = competitions.map((c) => `- [${c.name}](${o}${c.path})`);
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_NAME} is a free football website with live scores, fixtures and results, league tables, a page for every match with line-ups and statistics, team and player pages, football news and videos.`,
    '',
    'Scores, tables and statistics come from third-party data providers and can be delayed or corrected. The site is for information only; it is not betting or financial advice, and it needs no account.',
    '',
    '## Main pages',
    `- [Home](${o}/): today's matches, latest results, news and videos`,
    `- [Scores and fixtures](${o}/matches): matches by day`,
    `- [Football news](${o}/news): stories about recent and upcoming matches`,
    `- [Watch](${o}/watch): football videos and shorts`,
    '',
    ...(comps.length ? ['## Competitions', ...comps, '', 'Team pages are linked from each competition page, and match pages from the scores pages.', ''] : []),
    '## About the site',
    `- [About](${o}/about)`,
    `- [Contact](${o}/contact)`,
    `- [Privacy policy](${o}/privacy)`,
    `- [Terms of use](${o}/terms)`,
    '',
  ].join('\n');
}
