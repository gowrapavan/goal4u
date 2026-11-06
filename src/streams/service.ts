/**
 * Reads the stream files — the ONLY place the stream page's data is fetched. It uses the central dataFetch (token header, 10 s limit, GitHub
 * backup when the data service sleeps) but none of the app's match / team / feed code, so it cannot affect their data.
 */
import { STREAM_BASE, dataFetch, listDir, BACKUP_HEADER } from '../server/data-source';
import { DEFAULT_STREAM_FILES, excludedStreamFiles, explicitStreamFiles, jsonNamesOf } from './config';
import { normalizeRows, rowsOf } from './normalize';
import type { StreamSourceResult, StreamsPayload } from './types';

export const STREAMS_CACHE_MS = 30_000;
type Fetcher = (url: string, init?: any) => Promise<Response>;
const defaultFetcher: Fetcher = (url, init) => dataFetch(url, init);

export async function loadStreamFile(file: string, f: Fetcher = defaultFetcher, now: () => number = Date.now): Promise<StreamSourceResult> {
  const base = { file, fetchedAt: new Date(now()).toISOString() };
  try {
    const r = await f(`${STREAM_BASE}/${file}.json`, { timeoutMs: 10_000 });
    const via = r.headers.get(BACKUP_HEADER) === 'github-backup' ? 'backup' as const : 'mirror' as const;
    if (!r.ok) return { ...base, ok: false, via, status: r.status, rows: 0, matches: [], error: r.status === 404 ? 'File not found' : r.status === 401 ? 'Data service refused the token' : `HTTP ${r.status}` };
    const rows = rowsOf(await r.json());
    return { ...base, ok: true, via, status: r.status, rows: rows.length, matches: normalizeRows(rows, file) };
  } catch (e: any) {
    return { ...base, ok: false, via: null, status: 0, rows: 0, matches: [], error: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'Timed out' : 'Could not be read' };
  }
}

export const FILE_LIST_CACHE_MS = 300_000;
type Lister = () => Promise<{ name: string; type: string }[] | null>;

/**
 * Which files to show: STREAMS_FILES when it is set; otherwise every .json in stream-data/ (minus STREAMS_EXCLUDE), looked up through the same
 * data service / GitHub route as everything else and remembered for 5 minutes. If the folder cannot be listed, the last known list is kept
 * (or, on a first failure, the two default files), so the page never goes empty because of a failed listing.
 */
export function createFileDiscovery(opts: { lister?: Lister; env?: Record<string, string | undefined>; now?: () => number } = {}) {
  const now = opts.now ?? Date.now; // the data service's folder listing first; if it has none for this folder, the GitHub listing (an empty env = GitHub directly)
  const lister: Lister = opts.lister ?? (async () => (await listDir('stream-data')) ?? (await listDir('stream-data', fetch, {})));
  let known: { t: number; names: string[] } | null = null;
  return async (): Promise<string[]> => {
    const env = opts.env ?? process.env;
    const fixed = explicitStreamFiles(env); if (fixed) return fixed;
    const skip = excludedStreamFiles(env);
    if (!known || now() - known.t >= FILE_LIST_CACHE_MS) {
      let names: string[] = [];
      try { names = jsonNamesOf((await lister()) ?? []); } catch { /* keep what we know */ }
      if (names.length) known = { t: now(), names }; else if (!known) known = { t: now() - FILE_LIST_CACHE_MS + 30_000, names: DEFAULT_STREAM_FILES };   // retry in 30 s
    }
    return known!.names.filter((n) => !skip.has(n.toLowerCase())).slice(0, 40);
  };
}

export function createStreamsService(opts: { files?: () => string[] | Promise<string[]>; fetcher?: Fetcher; now?: () => number } = {}) {
  const now = opts.now ?? Date.now; const files = opts.files ?? createFileDiscovery({ now });
  const cache = new Map<string, { t: number; v: StreamSourceResult }>();
  return {
    async load(force = false): Promise<StreamsPayload> {
      const sources = await Promise.all((await files()).map(async (file) => {
        const hit = cache.get(file);
        if (!force && hit && now() - hit.t < STREAMS_CACHE_MS) return hit.v;
        const v = await loadStreamFile(file, opts.fetcher, now);
        if (v.ok) cache.set(file, { t: now(), v });                      // a failure is never remembered: the next request tries again
        else if (hit) return { ...hit.v, ok: true, error: 'Showing the last good copy' };
        return v;
      }));
      return { generatedAt: new Date(now()).toISOString(), sources };
    },
  };
}
