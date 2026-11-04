import { Router } from "express";
import { loadFeed, FEED_CODES } from "./data-api";
import {
  buildQueries, focusQueries, buildFocus, teamTerms, isSoccerArticle, dedupeArticles, rankArticles, relatedMatch,
  FOOTBALL_DOMAINS, FocusMatch,
} from "./news-filter";

/**
 * NewsAPI's free plan allows ~100 requests/day and one refresh costs up to 5 queries, so results are cached
 * for NEWS_CACHE_MINUTES (default 120). The free plan also delays articles by ~24 h, so a longer cache loses little.
 */
const TTL_MS = (Number(process.env.NEWS_CACHE_MINUTES) || 120) * 60_000;
const MIN_ARTICLES = 10;

export interface FocusInfo { focus: FocusMatch[]; clubTerms: string[] }
export type FocusProvider = () => Promise<FocusInfo>;

let clubCache: { t: number; terms: string[] } | null = null;
/** Default: fixtures from last 2 / next 3 days + every club name in our leagues (used as soccer markers). */
const defaultFocus: FocusProvider = async () => {
  try {
    const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const feed = await loadFeed(FEED_CODES, ymd(Date.now() - 3 * 86400_000), ymd(Date.now() + 4 * 86400_000));
    if (!clubCache || Date.now() - clubCache.t > 6 * 3600_000) {
      const season = await loadFeed(FEED_CODES);
      clubCache = { t: Date.now(), terms: [...new Set(season.flatMap((m: any) => [...teamTerms(m.homeTeam), ...teamTerms(m.awayTeam)]))] };
    }
    return { focus: buildFocus(feed), clubTerms: clubCache.terms };
  } catch { return { focus: [], clubTerms: clubCache?.terms || [] }; }
};

async function queryNewsApi(q: string, page: number, apiKey: string, from: string, domains?: string) {
  const params = new URLSearchParams({ q, searchIn: "title,description", language: "en", sortBy: "publishedAt", from, pageSize: "30", page: String(page), apiKey });
  if (domains) params.set("domains", domains);
  const r = await fetch(`https://newsapi.org/v2/everything?${params}`, { signal: AbortSignal.timeout(10_000) });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j || j.status === "error") throw new Error(j?.message || `NewsAPI responded with HTTP ${r.status}`);
  return (j.articles || []) as any[];
}

export function createNewsRouter(getFocus: FocusProvider = defaultFocus) {
  const router = Router();
  const cache = new Map<number, { t: number; body: any }>();

  router.get("/", async (req, res) => {
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey) return res.status(500).json({ error: "NEWSAPI_KEY is not configured" });

    const page = Math.min(Math.max(parseInt(String(req.query.page), 10) || 1, 1), 5);
    const hit = cache.get(page);
    if (hit && Date.now() - hit.t < TTL_MS) return res.json({ ...hit.body, cached: true });

    const { focus, clubTerms } = await getFocus();
    const queries = [...buildQueries(), ...focusQueries(focus)];
    const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const failures: string[] = []; let anyOk = false;

    const run = async (domains?: string) => {
      const results = await Promise.allSettled(queries.map((q) => queryNewsApi(q, page, apiKey, from, domains)));
      const lists: any[][] = [];
      for (const r of results) { if (r.status === "fulfilled") { anyOk = true; lists.push(r.value); } else failures.push(String(r.reason?.message || r.reason)); }
      const merged: any[] = [];
      for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) merged.push(l[i]);
      return merged.filter((a) => isSoccerArticle(a, clubTerms));
    };

    // Pass 1: football outlets only. Pass 2 (only if that was thin): any outlet, same strict filter.
    let kept = dedupeArticles(await run(FOOTBALL_DOMAINS));
    if (kept.length < MIN_ARTICLES) kept = dedupeArticles([...kept, ...(await run())]);

    if (!anyOk) {
      if (hit) return res.json({ ...hit.body, cached: true, stale: true });   // serve stale rather than nothing
      return res.status(502).json({ error: failures[0] || "NewsAPI is unreachable" });
    }

    const articles = rankArticles(kept, Date.now(), focus).slice(0, 60).map((a) => {
      const rel = relatedMatch(a, focus);
      return rel ? { ...a, related: { matchId: rel.match.id, code: rel.match.code, label: `${rel.match.home} v ${rel.match.away}`, short: rel.match.homeTla && rel.match.awayTla ? `${rel.match.homeTla} v ${rel.match.awayTla}` : undefined, kickoff: rel.match.utcDate, both: rel.both } } : a;
    });
    const body = { status: "ok", totalResults: articles.length, articles, partial: failures.length > 0 };
    cache.set(page, { t: Date.now(), body });
    res.json(body);
  });
  return router;
}

export default createNewsRouter();
