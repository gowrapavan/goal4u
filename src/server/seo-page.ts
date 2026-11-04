import type { Request, Response } from "express";
import { resolveSeo, injectHead, verificationFromEnv, SeoEnv } from "./seo-meta";
import type { SeoStore } from "./seo-store";
import { preflight } from "./seo-preflight";

export interface PageDeps { store: SeoStore; origin: (req?: any) => string; lookupMatch?: SeoEnv["lookupMatch"]; lookupPlayer?: SeoEnv["lookupPlayer"]; now?: () => number }

/** Serves the HTML app shell with the page-specific <head> and the correct HTTP status (200 / 301 / 404). */
export function createPageHandler(deps: PageDeps) {
  return async (req: Request, res: Response, template: string) => {
    const u = new URL(req.originalUrl.replace(/^\/{2,}/, "/"), "http://localhost");     // "//host" must not be read as a protocol-relative URL
    const pf = preflight(req.originalUrl.split("?")[0], u.search);
    if (pf && "redirect" in pf) return res.redirect(301, pf.redirect);
    if (pf && "plain404" in pf) return res.status(404).type("text/plain").send("Not found");
    const d = await resolveSeo({ path: u.pathname, search: u.search }, { origin: deps.origin(req), snapshot: deps.store.get(), lookupMatch: deps.lookupMatch, lookupPlayer: deps.lookupPlayer, now: deps.now });
    if (d.status === 301 && d.redirectTo) return res.redirect(301, d.redirectTo);
    res.status(d.status).set({ "Content-Type": "text/html; charset=utf-8" }).end(injectHead(template, d, verificationFromEnv(process.env)));
  };
}
