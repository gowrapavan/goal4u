/**
 * Secret stream page — settings. SERVER side and build only; nothing here reads a token.
 *
 *   STREAMS_PAGE   1 / true  → the page and its API exist. Anything else (the default) → the route is not even in the build and /api/streams answers 404.
 *   STREAMS_PATH   the page's address, default "streams" (letters, digits, "-"; 3-40 characters). Pick something unguessable.
 *   STREAMS_KEY    optional access key (8+ characters). When set, the API answers 401 without it and the page asks for it.
 *   STREAMS_FILES  optional. Unset (the default) = EVERY .json file in stream-data/ is shown, new ones appear by themselves.
 *                  Set (comma list, no ".json") = only those files.
 *   STREAMS_EXCLUDE optional comma list of files to hide when everything is shown (an old scraper's file, say).
 */
type Env = Record<string, string | undefined>;

export const DEFAULT_STREAM_FILES = ['sportsonline', 'yallashots'];
const FILE = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

export const streamsEnabled = (env: Env = process.env): boolean => /^(1|true|yes|on)$/i.test(String(env.STREAMS_PAGE ?? '').trim());

export function streamsPath(env: Env = process.env): string {
  const p = String(env.STREAMS_PATH ?? '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  return /^[a-z0-9][a-z0-9-]{2,39}$/.test(p) ? p : 'streams';
}

export function streamsKey(env: Env = process.env): string {
  const k = String(env.STREAMS_KEY ?? '').trim();
  return /^[\x21-\x7E]{8,128}$/.test(k) ? k : '';
}

/** null = not set: show everything the folder holds. */
export function explicitStreamFiles(env: Env = process.env): string[] | null {
  const raw = String(env.STREAMS_FILES ?? '').trim();
  return raw ? streamFiles(env) : null;
}
export function excludedStreamFiles(env: Env = process.env): Set<string> {
  return new Set(String(env.STREAMS_EXCLUDE ?? '').split(',').map((s) => s.trim().replace(/\.json$/i, '').toLowerCase()).filter(Boolean));
}
/** File names (without .json) out of a folder listing: only valid, safe names. */
export function jsonNamesOf(entries: { name: string; type: string }[]): string[] {
  return entries.filter((e) => e.type === 'file' && /\.json$/i.test(e.name)).map((e) => e.name.replace(/\.json$/i, '')).filter((n) => FILE.test(n)).sort((a, b) => a.localeCompare(b));
}
export function streamFiles(env: Env = process.env): string[] {
  const raw = String(env.STREAMS_FILES ?? '').split(',').map((s) => s.trim().replace(/\.json$/i, '')).filter((s) => FILE.test(s));
  return [...new Set(raw.length ? raw : DEFAULT_STREAM_FILES)].slice(0, 12);
}
