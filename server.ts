import "dotenv/config"; // load .env (NEWSAPI_KEY etc.) before anything reads process.env
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import newsRouter from "./src/server/news-api";
import sitemapRouter from "./src/server/sitemap-api";
import dataRouter from "./src/server/data-api";
import { initCache } from "./src/server/data-cache";
import { expressIndexNowRouter } from "./src/server/indexnow";
import { locateMatch, lookupPlayerInfo } from "./src/server/data-api";
import { createSeoStore } from "./src/server/seo-store";
import { createPageHandler } from "./src/server/seo-page";
import { siteOrigin, robotsTxt } from "./src/server/site-url";
import { createStreamsRouter } from "./src/streams/router";
import { allowedHosts, originVerdict, directVerdict, corsHeaders, API_SECURITY_HEADERS, MAX_URL_LENGTH } from "./src/server/api-guard";

async function startServer() {
  initCache().catch(console.error);

  const app = express();
  app.set("query parser", "simple");          // plain key=value only: no nested ?a[b]=1 objects, and the qs library never parses request input
  // Render / Railway / Cloud Run hand the port in through PORT; 3000 is only the local default.
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.disable("x-powered-by");

  if (process.env.NODE_ENV !== "production") {
    app.use(helmet({
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, // YouTube embeds need a referrer (Error 153)
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    }));
  } else {
    app.use(helmet({
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // A safe subset of CSP: no framing, no plugins, no foreign <base> / form targets. (A full script-src policy would have to allow the inline theme script and YouTube.)
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc, frameAncestors: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], formAction: ["'self'"] } },
    }));
  }

  // Light health check for Render (does not touch the data cache)
  app.get("/healthz", (_req, res) => { res.json({ ok: true }); });

  // /api: other websites are refused (no cross-site fetches, no hot-linked pictures), nothing is cross-origin readable unless ALLOWED_ORIGINS lists it,
  // every answer carries the security headers. (Same rules as the Netlify function: src/server/api-guard.ts.)
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.length > MAX_URL_LENGTH) return res.status(414).json({ error: "URL too long" });
    const v = originVerdict({ origin: req.get("origin"), referer: req.get("referer"), secFetchSite: req.get("sec-fetch-site"), secFetchDest: req.get("sec-fetch-dest") }, allowedHosts(process.env, req.get("host")));
    if (!v.ok) return res.status(403).json({ error: "Forbidden" });
    const d = directVerdict({ origin: req.get("origin"), referer: req.get("referer"), secFetchSite: req.get("sec-fetch-site"), secFetchDest: req.get("sec-fetch-dest"), secFetchMode: req.get("sec-fetch-mode") }, allowedHosts(process.env, req.get("host")), process.env.API_ALLOW_DIRECT === "1");
    if (!d.ok) return res.status(403).json({ error: "Forbidden" });
    res.set({ ...API_SECURITY_HEADERS, ...corsHeaders(req.get("origin"), process.env) });
    next();
  });

  // Rate limiting for API and Sitemap
  const newsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 200, // Slightly increased
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests to news API, please try again after 15 minutes" },
  });

  const proxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000, // Very high limit because 1 page load makes 10+ calls to this proxy. Only intended to prevent aggressive DDoS.
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests to github proxy, please try again" },
  });

  const sitemapLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000, // Increased
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests to sitemap routes, please try again later",
  });

  // Initialize IndexNow routes (key verification and submission API)
  app.use(express.json({ limit: "10kb" })); // needed for POST (the IndexNow trigger); anything bigger is refused
  expressIndexNowRouter(app);

  // Mount Proxy & Sitemap Routes with correct scope
  app.use("/api/news", newsLimiter, newsRouter);
  
  // Secret stream page API (404 unless STREAMS_PAGE is on; src/streams)
  app.use("/api/streams", createStreamsRouter());

  // Data API
  app.use("/api/data", proxyLimiter, dataRouter);

  // Specific sitemap routes
  app.use("/sitemap*", sitemapLimiter);
  app.use(sitemapRouter);

  // SEO: robots.txt — same origin helper as the sitemaps and canonicals, so they can never disagree
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain; charset=utf-8");
    res.send(robotsTxt(siteOrigin(process.env, req)));
  });

  // Unknown API paths must be a JSON 404, never the HTML app shell.
  app.use("/api", (req, res) => { res.status(404).json({ error: "Not found" }); });

  // Every page response gets its own <head> (title, description, canonical, robots, JSON-LD) and the right HTTP status:
  // 404 for pages that do not exist, 301 for the app's own redirects, 200 otherwise.
  const sendApp = createPageHandler({ store: createSeoStore(), origin: (req) => siteOrigin(process.env, req), lookupMatch: (id, code, season) => locateMatch(id, code || "", season), lookupPlayer: (id) => lookupPlayerInfo(id) });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for SPA in dev mode - ensures nested routes work reliably
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const fs = await import('fs');
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        await sendApp(req, res, template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use((req, res, next) => (/\.(map|cjs)$/i.test(req.path) ? res.status(404).type("text/plain").send("Not found") : next()));   // server.cjs / source maps are never public
    app.use(express.static(distPath, { index: false }));
    const fs = await import("fs");
    const shell = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
    app.get("*", async (req, res, next) => { try { await sendApp(req, res, shell); } catch (e) { next(e); } });
  }

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message || "Internal Server Error"
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
