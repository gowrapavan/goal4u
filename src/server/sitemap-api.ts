import { llmsTxt } from "./llms";
import express from "express";
import { buildSitemaps, groupsFromIndex, validateSitemapSet, SitemapSet } from "./sitemap-builder";
import { DEFAULT_SEO_CONFIG, SeoConfig } from "./seo-data";
import { createSeoStore, SeoStore } from "./seo-store";
import { siteOrigin } from "./site-url";

/**
 * Sitemaps are generated from the SAME in-memory GitHub data the app serves (refreshed by data-cache), so a match or
 * competition that appears in the JSON shows up in /sitemap.xml without a rebuild or a redeploy.
 *   /sitemap.xml                    sitemap index
 *   /sitemap-<group>-<n>.xml        pages | competitions | teams | matches (chunked, never empty)
 * If the data cache has not loaded yet the endpoints answer 503 + Retry-After instead of serving a partial sitemap.
 */
export interface SitemapDeps { store?: SeoStore; cfg?: SeoConfig; origin?: (req?: any) => string; maxUrls?: number; ttlMs?: number; now?: () => number }

const LEGACY_MOVED: Record<string, string> = { "sitemap-pages.xml": "sitemap-pages-1.xml", "sitemap-competitions.xml": "sitemap-competitions-1.xml", "sitemap-matches.xml": "sitemap-matches-1.xml", "sitemap-teams.xml": "sitemap-teams-1.xml" };
const LEGACY_GONE = new Set(["sitemap-h2h.xml", "sitemap-players.xml"]);       // those pages redirect / are not verifiable → removed

export function createSitemapRouter(deps: SitemapDeps = {}) {
  const cfg = deps.cfg ?? DEFAULT_SEO_CONFIG;
  const store = deps.store ?? createSeoStore(undefined, cfg, deps.ttlMs, deps.now);
  const origin = deps.origin ?? ((req?: any) => siteOrigin(process.env, req));
  const now = deps.now ?? Date.now;
  const router = express.Router();
  let memo: { at: number; key: string; set: SitemapSet } | null = null;

  const build = (req?: any): { set?: SitemapSet; retry?: boolean; error?: string } => {
    const snap = store.get();
    if (!snap.ready) return { retry: true };
    const o = origin(req); if (!o) return { error: "cannot tell this site's address (no Host header)" }; const key = `${o}|${snap.index.matches.length}|${snap.index.teams.length}|${snap.index.competitions.length}|${snap.index.matches[snap.index.matches.length - 1]?.lastmod ?? ""}`;
    if (memo && memo.key === key && now() - memo.at < (deps.ttlMs ?? 5 * 60_000)) return { set: memo.set };
    try {
      const opts = { origin: o, maxUrls: deps.maxUrls };
      const set = buildSitemaps(groupsFromIndex(snap.index, cfg.staticPaths), opts);
      validateSitemapSet(set, opts);                                     // never serve a set that breaks the limits
      memo = { at: now(), key, set };
      return { set };
    } catch (e: any) { return { error: e?.message || "sitemap build failed" }; }
  };

  const send = (res: express.Response, xml: string) => { res.status(200).set({ "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" }).send(xml); };
  const fail = (res: express.Response, r: { retry?: boolean; error?: string }) => {
    if (r.retry) return res.status(503).set({ "Retry-After": "300", "Content-Type": "text/plain; charset=utf-8" }).send("Sitemap data is still loading. Try again shortly.");
    console.error("[sitemap]", r.error);
    return res.status(500).type("text/plain").send("Sitemap could not be generated.");
  };

  // /llms.txt — the optional AI-tool guide, built from the same competition list and the same origin helper as the sitemap
  router.get("/llms.txt", (req, res) => {
    const snap = store.get();
    if (!snap.ready) return res.status(503).set({ "Retry-After": "300", "Content-Type": "text/plain; charset=utf-8" }).send("Still loading. Try again shortly.");
    const o = origin(req); if (!o) return res.status(500).type("text/plain").send("cannot tell this site's address (no Host header)");
    res.status(200).set({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=900" }).send(llmsTxt(o, snap.index.competitions));
  });

  router.get("/sitemap.xml", (req, res) => { const r = build(req); r.set ? send(res, r.set.indexXml) : fail(res, r); });

  router.get(/^\/(sitemap-[a-z0-9]+(?:-\d+)?\.xml)$/, (req, res) => {
    const name = req.params[0];
    if (LEGACY_MOVED[name]) return res.redirect(301, "/" + LEGACY_MOVED[name]);
    if (LEGACY_GONE.has(name)) return res.status(410).type("text/plain").send("This sitemap was removed.");
    const r = build(req); if (!r.set) return fail(res, r);
    const f = r.set.files.find((x) => x.name === name);
    if (!f) return res.status(404).type("text/plain").send("Sitemap not found");   // never fall through to the HTML app shell
    send(res, f.xml);
  });
  // Anything else that looks like a sitemap is a plain 404 — a crawler must never be handed the HTML app shell.
  router.get(/^\/sitemap[^/]*\.xml$/i, (_req, res) => res.status(404).type("text/plain").send("Sitemap not found"));
  return router;
}

export default createSitemapRouter();
