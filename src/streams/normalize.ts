/**
 * Turns the rows of a stream file into matches with their servers. The scraper files differ in shape (sportsonline, yallashots, …), so every
 * known spelling of a field is accepted and unknown fields are kept in `extra`. Rows that describe the same match (one row per server) are merged.
 * Only http(s) links survive: nothing else is ever turned into a link on the page.
 */
import type { StreamMatch, StreamServer } from './types';

const pick = (o: any, keys: string[]): string => { for (const k of keys) { const v = o?.[k]; if (typeof v === 'string' && v.trim()) return v.trim(); if (typeof v === 'number') return String(v); } return ''; };
export const safeLink = (u: unknown): string => { const s = typeof u === 'string' ? u.trim() : ''; try { const p = new URL(s); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : ''; } catch { return ''; } };

const KNOWN = new Set(['home_team', 'team1', 'home', 'away_team', 'team2', 'away', 'home_logo', 'logo1', 'away_logo', 'logo2', 'league', 'competition', 'time', 'match_time', 'kickoff',
  'url', 'frame_url', 'm3u8', 'embed', 'link', 'servers', 'links', 'streams', 'label', 'server_label', 'type', 'title', 'match', 'name']);

/** { _meta, data: [...] } | { data: { matches: [...] } } | [...] | { matches|streams|events: [...] } → rows */
export function rowsOf(json: any): any[] {
  const d = json?.data ?? json;
  if (Array.isArray(d)) return d;
  for (const k of ['matches', 'streams', 'events', 'items', 'fixtures']) { if (Array.isArray(d?.[k])) return d[k]; if (Array.isArray(json?.[k])) return json[k]; }
  return [];
}

function serversOf(row: any): StreamServer[] {
  const out: StreamServer[] = [];
  const add = (url: unknown, label: unknown, type: unknown) => { const u = safeLink(url); if (u) out.push({ url: u, label: String(label ?? '').trim().slice(0, 40), ...(typeof type === 'string' && type ? { type: type.slice(0, 20) } : {}) }); };
  for (const key of ['servers', 'links', 'streams']) {
    const list = row?.[key];
    if (Array.isArray(list)) for (const s of list) { if (typeof s === 'string') add(s, '', ''); else add(s?.url ?? s?.link ?? s?.src ?? s?.m3u8, s?.label ?? s?.name ?? s?.server, s?.type); }
  }
  add(pick(row, ['url', 'frame_url', 'm3u8', 'embed', 'link']), pick(row, ['server_label', 'label']), row?.type);
  return out;
}

const teamsFromTitle = (t: string): [string, string] => { const m = t.split(/\s+(?:vs\.?|v|x|-|–|—)\s+/i); return m.length === 2 ? [m[0].trim(), m[1].trim()] : [t, '']; };

export function normalizeRows(rows: any[], file: string): StreamMatch[] {
  const merged = new Map<string, StreamMatch>();
  rows.forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    let home = pick(row, ['home_team', 'team1', 'home']), away = pick(row, ['away_team', 'team2', 'away']);
    if (!home && !away) { const t = pick(row, ['match', 'title', 'name']); if (t) [home, away] = teamsFromTitle(t); }
    const league = pick(row, ['league', 'competition']), time = pick(row, ['time', 'match_time', 'kickoff']);
    const servers = serversOf(row);
    const key = `${home}|${away}|${time}|${league}`.toLowerCase();
    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) if (!KNOWN.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) extra[k.slice(0, 40)] = String(v).slice(0, 200);
    const have = merged.get(key);
    if (have) { for (const s of servers) if (!have.servers.some((x) => x.url === s.url)) have.servers.push(s); Object.assign(have.extra, { ...extra, ...have.extra }); return; }
    merged.set(key, { id: `${file}-${i}`, home, away, homeLogo: safeLink(pick(row, ['home_logo', 'logo1'])), awayLogo: safeLink(pick(row, ['away_logo', 'logo2'])), league, time, servers, extra });
  });
  return [...merged.values()].filter((m) => m.home || m.away || m.servers.length);
}
