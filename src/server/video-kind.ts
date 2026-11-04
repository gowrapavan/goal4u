/**
 * Separate YouTube Shorts from normal videos.
 * The data repo's videos.json has no duration / short flag, and its shorts.json lags behind, so each
 * video is classified through YouTube's public oEmbed endpoint: Shorts report a PORTRAIT player
 * (height > width), normal videos landscape. Definite answers are cached for the life of the process.
 * If YouTube can't be reached the video is treated as "unknown" and kept (never silently dropped).
 */
export type Kind = 'short' | 'video' | 'gone' | 'unknown';   // 'gone' = deleted / private / embedding disabled
export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const known = new Map<string, 'short' | 'video' | 'gone'>();
const thumbKnown = new Map<string, boolean>();           // videoId → has a real (non-placeholder) thumbnail
const unknownUntil = new Map<string, number>();
const UNKNOWN_TTL_MS = 10 * 60_000;

/**
 * Upload time as a number. videos.json dates are not always ISO ("2026-10-20T…", "20261020", "Oct 20, 2026" all occur in scraped data),
 * and comparing them as strings puts the wrong ones first. Unreadable → 0 (sorted last); more than a day in the future → 0 (a wrong date
 * must not sit on top of the page forever).
 */
export function uploadTime(v: { uploadDate?: any } | null | undefined, now: number = Date.now()): number {
  const raw = String(v?.uploadDate ?? '').trim(); if (!raw) return 0;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  const t = compact ? Date.UTC(+compact[1], +compact[2] - 1, +compact[3]) : Date.parse(raw);
  return Number.isFinite(t) && t <= now + 86_400_000 ? t : 0;
}
/** Newest first, by real timestamp (ties keep the file's order). */
export const newestFirst = <T extends { uploadDate?: any }>(list: T[], now: number = Date.now()): T[] =>
  list.map((v, i) => ({ v, i, t: uploadTime(v, now) })).sort((a, b) => b.t - a.t || a.i - b.i).map((x) => x.v);

export const _resetVideoKindCache = () => { known.clear(); unknownUntil.clear(); thumbKnown.clear(); };

/** Title hints — only used as a cheap pre-filter, never to approve a video as long-form. */
export const titleSaysShort = (title?: string) => /(^|\s)#shorts?\b/i.test(title || '');

export function kindFromOEmbed(o: any): Kind {
  const w = Number(o?.width), h = Number(o?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'unknown';
  return h > w ? 'short' : 'video';
}

export async function classify(id: string, fetcher: Fetcher, timeoutMs = 3500, now = Date.now()): Promise<Kind> {
  const hit = known.get(id); if (hit) return hit;
  if ((unknownUntil.get(id) ?? 0) > now) return 'unknown';
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    const r = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (r.ok) {
      const k = kindFromOEmbed(await r.json());
      if (k !== 'unknown') { known.set(id, k); return k; }
    } else if (r.status === 401 || r.status === 403 || r.status === 404) {
      // oEmbed refuses private, deleted and embedding-disabled videos: they can never play in the page.
      known.set(id, 'gone'); return 'gone';
    }
  } catch { /* network error / timeout → unknown */ }
  unknownUntil.set(id, now + UNKNOWN_TTL_MS);
  return 'unknown';
}

/**
 * YouTube serves a small grey "…" placeholder image (instead of a 404) for videos that have no real thumbnail.
 * Real 320×180 thumbnails are many KB; the placeholder is tiny, so a byte-size check separates them.
 * Tune MIN_THUMB_BYTES if a legitimate (very dark / flat) thumbnail is ever dropped.
 */
export const MIN_THUMB_BYTES = 2500;
export type ThumbFetcher = (url: string) => Promise<number | null>;   // → byte length, or null when it can't be checked
export const thumbIsReal = (bytes: number | null) => bytes === null ? true : bytes >= MIN_THUMB_BYTES;   // unknown ⇒ keep

export async function hasRealThumbnail(id: string, probe: ThumbFetcher): Promise<boolean> {
  const hit = thumbKnown.get(id); if (hit !== undefined) return hit;
  let bytes: number | null = null;
  try { bytes = await probe(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`); } catch { bytes = null; }
  const ok = thumbIsReal(bytes);
  if (bytes !== null) thumbKnown.set(id, ok);       // only cache definite answers
  return ok;
}

/** Keep only items whose thumbnail is real (YouTube serves a tiny grey "…" image for videos without one). Unknown (probe failed) ⇒ kept. Checked in small concurrent batches. */
export async function keepRealThumbs<T extends { videoId: string }>(items: T[], probe: ThumbFetcher, batch = 8): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += batch) {
    const slice = items.slice(i, i + batch);
    const ok = await Promise.all(slice.map((x) => hasRealThumbnail(String(x.videoId), probe)));
    slice.forEach((x, j) => { if (ok[j]) out.push(x); });
  }
  return out;
}

/** Walk newest-first candidates in small concurrent batches until `limit` long-form videos are found. */
export async function pickLongForm<T extends { videoId: string; title?: string }>(
  candidates: T[], limit: number, opts: { fetcher: Fetcher; thumbProbe?: ThumbFetcher; batch?: number; maxScan?: number; timeoutMs?: number; exclude?: Set<string> },
): Promise<T[]> {
  const batch = opts.batch ?? 12, maxScan = opts.maxScan ?? 150;
  const pool = candidates.filter((c) => !titleSaysShort(c.title) && !opts.exclude?.has(c.videoId)).slice(0, maxScan);
  const out: T[] = [];
  for (let i = 0; i < pool.length && out.length < limit; i += batch) {
    const slice = pool.slice(i, i + batch);
    const kinds = await Promise.all(slice.map((c) => classify(c.videoId, opts.fetcher, opts.timeoutMs)));
    // Only videos that survived the kind check are probed for a real thumbnail (saves requests).
    const thumbs = await Promise.all(slice.map((c, j) => (kinds[j] === 'short' || kinds[j] === 'gone' || !opts.thumbProbe) ? true : hasRealThumbnail(c.videoId, opts.thumbProbe)));
    slice.forEach((c, j) => { if (kinds[j] !== 'short' && kinds[j] !== 'gone' && thumbs[j] && out.length < limit) out.push(c); });
  }
  return out;
}
