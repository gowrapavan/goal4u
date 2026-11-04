/**
 * Which URLs are worth telling Bing / Yandex about (IndexNow) after a build: only what changed.
 * Re-sending every URL every few hours is what IndexNow asks people not to do, so this picks
 *   • matches updated in the last `hours` hours (the data's own lastUpdated) or kicking off / played within that window,
 *   • optionally the static pages and competition pages (`includeStatic`).
 * Pure: the script reads dist/_seo/index.json and passes it in.
 */
export interface IndexLike {
  origin?: string;
  matches: { path: string; utcDate: string; lastmod?: string }[];
  competitions?: { path: string }[];
}
export const IMPORTANT_STATIC = ['/', '/matches', '/news', '/watch'];
export const INDEXNOW_MAX = 10000;

export function selectIndexNowUrls(idx: IndexLike, origin: string, now: number, opts: { hours?: number; includeStatic?: boolean; max?: number } = {}): string[] {
  const o = origin.replace(/\/+$/, '');
  const span = (opts.hours ?? 48) * 3600_000;
  const urls = new Set<string>();
  if (opts.includeStatic) { for (const p of IMPORTANT_STATIC) urls.add(o + p); for (const c of idx.competitions ?? []) urls.add(o + c.path); }
  for (const m of idx.matches) {
    const mod = m.lastmod ? Date.parse(m.lastmod) : NaN;
    const ko = Date.parse(m.utcDate);
    const changed = Number.isFinite(mod) && now - mod <= span && mod <= now + 3600_000;
    const live = Number.isFinite(ko) && Math.abs(now - ko) <= span;
    if (changed || live) urls.add(o + m.path);
  }
  return [...urls].slice(0, Math.min(opts.max ?? INDEXNOW_MAX, INDEXNOW_MAX));
}
