/**
 * Every value that comes from a request (path parameter, query string) and ends up inside a data-service URL goes through ONE of these
 * validators first. They are deliberately strict ALLOW-lists: anything not recognised is "no value", never "cleaned up".
 *
 * Why: a value such as "..", "%2e%2e" or "a/../b" would let a caller walk out of the /goal4u-data folder on the data host — with the
 * access token attached. (dataFetch in data-source.ts refuses such URLs as a second line of defence; these are the first.)
 */

/** A query-string value as a plain string: arrays (`?a=1&a=2`), objects (`?a[b]=1`) and absent values are all `undefined`. */
export const qs = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);

/** Competition / league / file-stem code: PL, PD, CL, world-cup, euro-2024 … letters, digits, `_` and `-` only. No dots, no slashes, max 40. */
export const safeCode = (v: unknown): string | undefined => {
  const s = qs(v, 40);
  return s && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(s) ? s : undefined;
};

/** A numeric id (team, player, match). 1–12 digits. */
export const safeId = (v: unknown): string | undefined => {
  const s = qs(v, 12);
  return s && /^[0-9]{1,12}$/.test(s) ? s : undefined;
};

/** A season: 2026-2027, a tournament year 2026, or a tournament slug world-cup-2026 / euro-2024. */
export const safeSeason = (v: unknown): string | undefined => {
  const s = qs(v, 24);
  return s && /^(?:\d{4}-\d{4}|\d{4}|(?:world-cup|euro|euros|ec|wc)-\d{4})$/i.test(s) ? s : undefined;
};

/** A squad file name inside team_informations/<id>/ : 2026-2027-squad.json, national-team-2026.json, cl-2025-2026.json … */
export const safeSquadFile = (v: unknown): string | undefined => {
  const s = qs(v, 60);
  return s && /^[A-Za-z0-9][A-Za-z0-9_-]{0,50}\.json$/.test(s) ? s : undefined;
};

/** One YYYY-MM-DD date (and a real one). */
export const safeDate = (v: unknown): string | undefined => {
  const s = qs(v, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : undefined;
};

/** A comma list of codes (`PL,PD,CL`): at most `max` valid entries; invalid entries are dropped. */
export const safeCodeList = (v: unknown, max = 14): string[] =>
  (qs(v, 200) ?? '').split(',').map((x) => safeCode(x.trim())).filter((x): x is string => !!x).slice(0, max);

/**
 * A path below the data service's public/ folder, for the image proxy: segments of letters, digits, `_ - .` (a dot is fine INSIDE a
 * name such as "10000.png"; a segment that is only dots is not), an image extension, at most 6 segments / 160 characters.
 */
export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const IMAGE_SEGMENT = /^[\p{L}\p{N}][\p{L}\p{N} _.()-]{0,100}$/u;     // letters (accents too), digits, space, _ . ( ) -  — and it must START with a letter or digit, so "." and ".." are impossible
export const safeImagePath = (v: unknown): string | undefined => {
  const s = qs(v, 160);
  if (!s || s.startsWith('/') || !IMAGE_EXT.test(s)) return undefined;
  const parts = s.split('/');
  if (parts.length > 6) return undefined;
  for (const p of parts) if (!IMAGE_SEGMENT.test(p) || p.includes('..')) return undefined;
  return s;
};
/** A checked image path as a URL path: every segment percent-encoded. */
export const encodePath = (rel: string): string => rel.split('/').map(encodeURIComponent).join('/');

/** Keep a Map from growing without limit: once it holds more than `max` entries the oldest one goes. Call after every `set`. */
export function capMap<K, V>(m: Map<K, V>, max = 500): void {
  while (m.size > max) { const first = m.keys().next(); if (first.done) break; m.delete(first.value); }
}
