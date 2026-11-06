# Goal4U v45

## What changed in v60 — API only for the site's own pages

- `/api/*` now answers only the site's own pages. An address pasted in the browser (or opened from a link), curl and plain scripts get **403**; the site's own fetches and pictures pass (`directVerdict` in `src/server/api-guard.ts`, used by `server.ts` and `netlify/functions/api.ts`). `API_ALLOW_DIRECT=1` switches it off while debugging by hand. Limit: browser headers can be forged by a determined person — this stops casual copying and hot-linking; it cannot make data that the pages display secret.
- Node hosting: `server.cjs` and source maps in `dist/` are no longer served publicly.
- Match hero: desktop scorers sit a little further in from the edge.

## What changed in v59 — colours without the wait, phone hero, events text, pending results

- **Team colours** are remembered on the device (localStorage) after the first read, so the second visit has them at once; on a first visit the hero panels fade in when the colours are ready and the bars stay neutral grey meanwhile (no more blue→green flash).
- **Phone hero:** the footer is only the date; referee, venue and attendance show from tablet size up. Penalty tags are "(p)" on phones.
- **Match events** on phones: smaller names, sub-lines, photos and minute pills.
- **"Result not available yet"** (match should be over but the feed has no result): the page asks again every 30 s and rebuilds only when status or score changed; the events message no longer claims the score is confirmed in that state.

## What changed in v56 — match hero redesign

New `components/match/MatchHero.tsx` (replaces the inline banner in MatchDetail; data, status, score and scorer logic are unchanged): competition logo + "Country, League • Matchday" and a date pill on top; angled panels behind the team names in each team's crest colour (same as the stats); a dark glass scoreboard with a cyan-to-purple edge and the status chip on its top edge; each team's own scorers under that team (home left-aligned, away mirrored to the right; minute order, ball icon); one glass footer with venue, referee and attendance. Stadium background and its fallback are the same as before. CSS: `.hero-panel-home/-away` in index.css.

## What changed in v55 — photo retries, one colour per team, playable highlights, hero, head to head

- **Player photos** (`PlayerImg`): a photo that is really missing (404) moves to the next source; one that failed because of the connection is asked for again quietly (0.8 s, 1.6 s, 3.2 s). Meanwhile `default.jpg` shows, and the real photo is asked for again every 15 s and the moment the device is back online. Initials appear only if even `default.jpg` cannot load.
- **One colour per team** in Top performers too (photo rings, winning figures, player of the match) — the same crest colour as the stats bars, fan vote, head to head and line-ups.
- **Match highlights play inside the page** (tap the picture; if YouTube refuses the embed it becomes a "Watch on YouTube" link).
- **Match hero:** each team's goal scorers now sit centred under that team's name instead of in a separate row.
- **Head to head:** crest-and-number layout in team colours; with no earlier meetings it shows both crests at 0 and a short "First meeting on record" note instead of an empty card.

## What changed in v54 — phone sizes, news lead card, league logos

- **Phones:** match cards in the "live now" / "next up" rail are smaller (crest, names, score, chip, footer), section headings and links are smaller, and the page header row of the rail too.
- **News:** the lead story is now an image card with the title, tag and source **under** the picture on phones (Home and News page); from tablet size up it keeps the overlay.
- **League logos:** `npm run logos` saves `pl, pd, sa, bl1, fl1, cl, elc, wc, ec` into `public/assets/` (existing files are kept) so every league logo is served from your own site. The picture proxy now also answers with an `X-Upstream-Status` header so a failing source can be diagnosed.

## What changed in v53 — "Something went wrong" on the match page

v51 called `useCrestColors` after the match page's loading `return`, so React saw a different number of hooks once the data arrived and the page crashed. The hook now runs before any early return (test: `src/lib/hooks-order.test.ts`).

## What changed in v52 — league logos that fell back to initials

The crest proxy added in v51 was counted in the 240-per-minute *data* budget and cached for only 2 minutes, so a page with many crests ran out of budget and the leagues without a file in `public/assets` (La Liga, Serie A, Bundesliga, Championship, World Cup, Euro) showed initials. `/api/data/ext/…` now uses the picture budget (900/min) and the 1-day CDN cache, and the proxy keeps pictures in memory and tries twice. To not depend on any fallback, add `<code>.png` (and `<code>-dark.png`) for `pd`, `sa`, `bl1`, `elc`, `wc`, `ec` to `public/assets/`.

## What changed in v51 — data sources hidden, mobile layout, team colours

- **Source names removed** from every page text (footer, About/Info, data notes, market-value notes, fan vote, match data notes). The sources list on Info no longer names providers.
- **Provider addresses no longer reach the browser:** crest and heat-map pictures are served through `/api/data/ext/<c|s>/…` (allow-listed hosts, path checks, image-only answers, 1-day cache), and any such address inside an API answer is rewritten to that path.
- **Phones:** the whole UI is one step smaller (root size 92 % under 640 px; text and padding follow). Match hero is tighter (crests, names, score box, info chips), scorers sit either side of the ball (home right-aligned, away left-aligned), stats rows have smaller gaps, the line-up pitch is taller with smaller players and readable name labels.
- **Team colours** in the stat bars, possession, fan vote and line-ups come from each team's crest (`lib/team-colors.tsx`); if the two are too alike, or a crest can't be read, the old blue / amber is used.

## What changed in v50 — videos and shorts that did not load

- **Cause.** `/api/data/videos` and `/shorts` answered **404 "Not found"** whenever the 16 MB / 6 MB source file could not be read at that moment (a cold start, a slow download). The browser treats 404 as final and never retried, so you had to reload by hand. Each cache read/write also deep-copied the 16 MB list, and every request after a cold start downloaded the file again.
- **Fix.** New `getMediaJSON` (data-cache.ts): one shared download for all waiting requests, 2 tries, last good copy kept up to 24 h and served while it refreshes, plain Map (no deep copy). A real failure with nothing to fall back on is now **502**, which the browser retries automatically (4 quick tries, then 6 more with growing pauses, then quietly every 20 s). Only a real "file is not there" stays 404. The finished lists are also kept 2 minutes, so the thumbnail checks are not repeated on every request.
- Test: `src/server/media-cache.test.ts`.

## What changed in v49 — reliability and speed fixes

- **Why parts of pages went missing.** `fetchWithRetry` (services/api.ts) gave up after about 3.5 s and returned `null`; the app showed that as "no data" and `cached()` remembered it for 10 minutes to 1 hour (market values, trophy room, league facts, standings). It now retries 5 times (about 10 s) and **throws** on a real failure, so nothing false is cached. `getJSON` (lib/http.ts) retries 429/500/502/503/504 and network errors 4 times with growing pauses and honours Retry-After.
- **Automatic retry.** `useAsync` keeps the loading skeleton while it repeats a failed request (6 more tries, about 50 s — enough for a data service that is waking up), and only then shows the error card, which keeps asking quietly every 20 s (6 times) and has Try again.
- **Sections no longer vanish.** "Most valuable players", the league MVP card and the trophy room show their skeleton or a retry instead of disappearing; one failing league no longer hides the others.
- **Match page skeleton** now mirrors the real layout (navy header, tabs, summary card, side column).
- **Sidebar live scores.** The open match uses the page's own live data; when the live source is slow the fixtures are flagged unverified (shorter LIVE guess), and the server serves the live day-list from memory while refreshing it behind the response (4 min grace).
- **Speed.** The search index (thousands of players) is downloaded when search is first opened, not on every page load; the global `text-wrap: pretty` was removed.

## What changed in v48 — UX states (loading, error, offline, empty, slow network)

**Shared pieces.** `components/states.tsx` (new): `ErrorState` (plain message + Try again), `OfflineBanner` (in the sticky header; "back online" confirmation), `SlowNetworkIndicator` (after 8 s, no invented progress), `StaleNotice` (a refresh failed, earlier content kept), `SearchEmptyState`, `Announce` (screen-reader updates) and sized skeletons (`TableSkel`, `MatchHeaderSkel`, `NewsCardSkel`, `VideoCardSkel`, `StatsSkel`, `ProfileSkel`, `LineupSkel`, `SearchSkel`, `ListSkel`). `<Empty>` in `ui.tsx` now takes an icon and an optional action.

**Requests.** `useAsync` now returns `retry()`, keeps already-loaded content when the *same* request fails again, and asks again once when the browser comes back online. `useSearchData` reports `failed` so a failed index is not shown as "no results". Pages that used to show a blank area or a misleading "empty" message on a failed request (Scores, Home, Competition, Team, Player, Watch, News, Match page, line-ups, insights, match sidebar) now show an error with Try again. News messages no longer mention keys or configuration.

**Football states.** From the feed's own status only: Half time, Extra time, Penalties, Suspended, Postponed, Cancelled, Awarded; a match the live feed says has not started shows "Delayed" (was "Kicked off"); a failed live refresh on the match page shows a notice. `holdLabel()` in `match-state.ts` (tested).

Not applicable here and therefore not built: permission prompts (the app requests none), session expiry (there is no sign-in), and form validation (the only inputs are the search box and a season picker).

Not yet checked in a browser or with `npm run build` for this version: run `npm ci && npm run lint && npm test && npm run build:netlify`, then try the offline and failed-request cases (browser dev tools: Offline, and block `/api/data/*`).

## What changed in v47 — UI refinement (rounds 1 + 2) and a live-status fix

**Live status when the live source is down.** If koora/365scores cannot be reached (or cannot pair a fixture), the server now flags still-open fixtures `liveCheck: 'unverified'`. The client keeps its "LIVE after kick-off" guess for the first 125 minutes only (was 150), then shows the match as awaiting its result. Verified fixtures keep the 150-minute window. Tests added in `match-state.test.ts` and `live-overlay.test.ts`.

**Styling only (no data, API, routing or logic changes).** Shared tokens in `index.css` (14px card radius, softer shadow, 32px chips / 36px on touch, bolder active tab, balanced headings, image fade-in); one heading scale (`SectionHead` 1.6/1.9rem, card headings text-xl/2xl, page titles 3xl/4xl); header, league nav and bottom-nav active/hover states; standings header and rows; competition and player headings; match stat cards; news and video cards; mobile rows for previous meetings, coming up and the match-event timeline.

Not yet checked in a browser or with `npm run build` for this version: run `npm ci && npm run lint && npm test && npm run build:netlify` and look at it on desktop, tablet and phone in both themes.

## What changed in v45 — data calls hardened
**Before deploying, in Netlify rename `VITE_GOAL4U_TOKEN` → `GOAL4U_TOKEN` and `VITE_GOAL4U_DATA_URL` → `GOAL4U_DATA_URL`** (the old names still work, with a warning in the log,
but a `VITE_` name is meant for the browser). Then redeploy.
- **The token and the data-service address are never in the browser any more.** Pictures (headshots, trophies) now load from this site: `imageUrl('/headshot/1.png')` →
  `/api/data/img/headshot/1.png`; the server checks the path, adds the token, and streams the picture back (small images only, cached a day by the CDN and the browser).
  `scripts/build-netlify.ts` scans the finished bundle and **fails the build** if the token or the data-service address is inside it.
- **Fixed: a path-traversal hole.** A value like `..` in a league code, season or `?file=` could make the server request another path on the data host *with the token attached*. Now:
  every path parameter and query value is checked against an allow-list in one place (`src/server/safe-input.ts`, enforced by `router.param` + one query middleware in `data-api.ts`),
  and `dataFetch()` itself refuses any URL with a `.`/`..` segment (plain or percent-encoded), a backslash, user-info or a non-http(s) scheme — before the token is attached.
- **API guard** (`src/server/api-guard.ts`, used by `netlify/functions/api.ts` and `server.ts`): GET/HEAD only, URL length cap, other websites refused (cross-origin and hot-linked requests),
  a per-address rate limit (data 240/min, pictures 900/min, news 40/min; per function instance), **no CORS** unless `ALLOWED_ORIGINS` lists the origin (the open `cors()` is gone),
  security headers on every answer (`nosniff`, no referrer, `noindex`, same-site resource policy). Pages and static files get `X-Frame-Options`, a safe CSP subset (`frame-ancestors`, `base-uri`, `object-src`, `form-action`), HSTS and a permissions policy.
- **IndexNow admin route:** no default token any more (in production `ADMIN_TOKEN` must be set), constant-time comparison, at most 100 paths, each a path on this site.
- **Memory:** per-id caches are bounded; `id-lookup` only reads its own registry keys.
- Removed: `render.yaml` (it described a second Render service you do not want), `cors`, two outdated `@types` packages, unused `match-stadium-bg.png` (1.9 MB) and a duplicate icon.
- Tests: 359 pass (new: validators, URL guard, rate limit / origin / CORS rules, bundle scan, and an HTTP test that drives the real router with a stub data service).
- What this does NOT do: it is not a login. The football data is public; the guard keeps other websites and careless scripts off and caps one address. Netlify CDN hits skip the function, so the origin check applies to cache misses.

## What changed in v44
- **League logos from your own files.** Put `public/assets/<code>.png` (light mode) and `public/assets/<code>-dark.png` (dark mode) in the project, where `<code>` is
  the competition code in lower case: `pl`, `pd`, `sa`, `bl1`, `fl1`, `cl`, `elc`, `wc`, `ec`. `LeagueLogo` (`src/components/LeagueLogo.tsx`) is used everywhere a league is shown.
  No `-dark` file: the light one is used. No file at all: the competition's own emblem, then its initials. The Home badge (white circle) always uses the light logo,
  the match banner (always dark) the dark one. The build lists the files that exist and puts a content hash in the URL, so a replaced logo shows up straight after a deploy.
- **Faster loading:** fonts no longer block the first paint; the Home news row no longer waits (up to 4 s) for every picture; the live-score overlay, the thumbnail checks and the
  video checks have a time budget (the page never waits for them longer than 1.5–2.5 s); the CDN serves the last good answer at once while it refreshes (longer
  stale-while-revalidate); the hero picture is a WebP (about a tenth of the size); pictures that do not exist are no longer requested; images and logos are cached by the browser.

# Goal4U v43

## What changed in v43 — the data service now needs an access token
- **New setting `VITE_GOAL4U_TOKEN`** (renamed `GOAL4U_TOKEN` in v45) (in `.env`, Netlify → Environment variables; `.env.example` has it empty). Never commit the real value.
- **One central helper for data requests:** `dataFetch()` in `src/server/data-source.ts`. It adds `Authorization: Bearer <token>` — only to the data service, never to GitHub, YouTube, NewsAPI or the live-score source.
  Every server-side read goes through it (data cache, competitions, SEO build and page lookups, folder listings `/_ls`, the backdrop proxy).
  (The browser never reads data files itself: it calls `/api/data/*`, which the Netlify function answers.)
- **One helper for images:** `imageUrl(path)` in `src/utils/data-origin.ts` builds `${BASE}/public/<path>?token=<token>`; headshots, player photos and trophy pictures all use it.
  The browser bundle no longer contains a GitHub address.
- **Errors:** 401 → no retry, logged once a minute as "check VITE_GOAL4U_TOKEN" (never the token), `/api/data` answers 503 and the site shows a short "Data service unavailable" notice.
  404 → as before. 502/503/504 or a network error → one retry (server and browser), then the notice. Pages never crash.
- The token is never logged or shown. It is visible in the browser's DevTools (images carry it): it blocks casual use and bots, not a determined person.

# Goal4U v42

## What changed in v42
- The build now prints which data address it reads (`[seo] football data is read from: …`) and, when it gets no match data at all, says exactly what to check
  (open the data URL, check `VITE_GOAL4U_DATA_URL`, wake the Render service) before the safety net stops the build.

# Goal4U v41

## What changed in v41 (SEO audit fixes)
- **Verification tags:** `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` (Netlify env) are written as `google-site-verification` / `msvalidate.01` meta tags on every page
  (`verificationFromEnv`, `src/server/seo-meta.ts`). Only values that look like real tokens are used. A verification file in `public/` works too.
- **Player pages** now have their own first-response title, description, structured data (`Person`) and crawlable text, built from the player's record
  (`src/server/player-seo.ts`). When the record cannot be read, the generic text is served `noindex` instead of being indexed for every player alike.
- **Share image:** `og:image:width/height/alt` and `twitter:image:alt`; the theme colour in `index.html` is the logo blue.
- **`/llms.txt`** (optional AI-tool guide) is written at build time for production, or served per request when no domain is configured. It never mentions the data service.
- **IndexNow on demand:** `APP_URL=https://… npm run indexnow:submit` sends only what changed (matches updated or played in the last 48 h; `-- --static` adds the main pages;
  `-- --dry-run` only prints). It checks the key file is online first. Nothing is sent automatically.
- `src/server/data-source.ts` exports `USING_GITHUB_DIRECT` and `maskGithubUrls` (and has its own test), so `npm run lint` passes.

# Goal4U v40

## What changed in v40
- **The Netlify build survives a sleeping gowra-api:** data files are retried (15 s, 30 s, 45 s) on timeouts and 5xx answers while Render wakes up, instead of the build seeing "no data".

# Goal4U v39

## What changed in v39
- **News:** newest stories first (8-hour bands; inside a band, stories about recent and upcoming matches first). Home shows only stories whose picture loads.
- **No league codes in the UI** (PD, PL, SA …): rows show the competition emblem, cards the competition name. The codes remain the API's business.
- **Match page:** slim themed scrollbar on the "more matches" sidebar; on mobile the hero runs edge to edge with larger type; "Recent form" is centred.

# Goal4U v38

## What changed in v38
- **Logo colours as the theme:** the site's blue and green are now the logo's (`--brand` #0035be, `--lime` #aee600 in `src/index.css`); the hero button
  ("Match centre"), the filter/tab chips on club, league, player and news pages and the other brand buttons follow. New `.btn-logo` button style.
- **Home hero card:** no more "00 HRS 00 MIN" — under a minute it says "Kick-off in under a minute" and at kick-off the card flips to LIVE by itself;
  the dark info panel is centred on mobile; the competition label has no background pill.
- **Shorts row:** a short without a real thumbnail (YouTube's grey placeholder) is left out, on the server and, as a safety net, in the card itself.
- **Match page:** the "more matches today" sidebar is now on the left, the match on the right (mobile order unchanged).
- **"HT -1–-1" fixed:** an unknown half-time score from the live source is shown as nothing.
- **Ball icon** between the scorer lists is `public/logo/ball_icon_logo.png` — add your file there; until it exists the old dot is shown.

# Goal4U v37

## What changed in v37
- **Team → Squad tab:** player photos in the squad lists, and a **Favourite XI** on a pitch (green striped pitch, round photos, club badge, shirt number).
  The shape is learned from the team's previous line-ups (starting XIs and benches in stats.json, this season plus last while the new one is young):
  `GET /api/data/team-formation/:id` (`src/server/team-formation.ts`) → most-used formation (recent matches count more, default 4-3-3), favourite back /
  midfield / front numbers, and a pool of players. The page (`src/lib/formation.ts`) fills each place with the player who starts there most
  (position, side of the pitch, form) and lets the visitor switch formation. Without line-up data it falls back to 4-3-3 built from the squad list.
- **Shot map redesigned:** one half-pitch per team (goal at the top), stars for goals, filled dots on target, faint dots off target, × blocked, sized by xG;
  filters All / Goals / On target / Missed; per-team shots, on target, goals and xG tiles (`src/components/match/ShotMap.tsx`).
- **Match header:** scorers now sit centred under their own team with a divider, clear of the score board.
- **About / Contact / Privacy / Terms** rebuilt at the site width: hero with at-a-glance facts, sticky contents, editorial section cards, data-source cards.

# Goal4U v36

## What changed in v36
- **Built for gowra-api 2.0 as it is** (it only serves files at `/goal4u-data`; apps run their own logic). The backend this app needs
  (`/api/data/*`, `/api/news/*`) now runs on Netlify as **`netlify/functions/api.ts`** (the same Express routers as `server.ts`), reading the
  data from your Render mirror. Nothing else is hosted: no second Render service (`render.yaml` removed), no `API_ORIGIN`.
- **One data setting, `VITE_GOAL4U_DATA_URL`** (the name gowra-api's README documents) for the build, the function and the browser bundle.
  `GOAL4U_DATA_BASE` / `VITE_DATA_BASE` still work as old names.
- The CDN keeps successful API responses for a few seconds (news: 30 min) and serves a stale copy while refreshing, so a sleeping Render
  service or a cold function is hidden from visitors.

# Goal4U v35

## What changed in v35
- Removed an unused dependency (and the 35 packages only it needed) from `package.json` + `package-lock.json`, the leftover `metadata.json`, and unrelated
  comments / switches in `vite.config.ts`. `vite` is listed once (it is needed at runtime by `server.ts`).

# Goal4U v34

## What changed in v34
- **Home → Latest results** can show every result of the last 3 days ("Show all N results" button). It used to cut off at the newest 10, which on a busy
  Saturday left out earlier kick-offs (that is why RB Leipzig – Elversberg was missing).
- `.env.example` rewritten for local testing vs production.

# Goal4U v33

## What changed in v33
- **Results that never synced are fixed from the live source.** The repo copy of a match can stay `TIMED` — or a mid-match `IN_PLAY` snapshot — for days.
  The feed (`live-overlay.ts`) now asks koora/365scores about every unfinished fixture up to **72 h** old and, when it says full time, sends `FINISHED`
  with the final score, so Home, Scores and the side list agree with the match page. A stale `IN_PLAY` the live source cannot confirm is no longer shown as LIVE
  after 3 h (`phase()` → "pending"). The match page asks the live source for the final numbers from 4 h after kick-off up to 72 h (before: only the first 4 h).
- **Highlights / Latest videos** are sorted by a real timestamp (`uploadTime()` in `video-kind.ts`) instead of comparing date strings, which mis-ordered mixed
  formats (`20261020`, ISO, "Oct 20, 2026"). The `/api/data/videos?kind=video` response carries `X-Videos-Source-Newest`: the newest upload date found in
  `gowrapavan/shortsdata`. If that header is old, the scraper has not added newer videos — nothing in this app can show them.

# Goal4U v32 — deployment-ready

## What changed in v32
- **Live status that is right even when GitHub is late.** The repo snapshot can trail a match by minutes, so the feed now asks the live source
  (koora-l.live / 365scores, `src/server/live-overlay.ts`) about every fixture that kicked off in the last 4 h and is not final in the repo:
  live → `IN_PLAY` with the real score and minute, half time → `PAUSED`, ended → `FINISHED`. One upstream call per UTC day serves the whole feed.
  When the live source cannot be reached, `phase()` (`src/lib/match-state.ts`) keeps a match **LIVE for 2½ h after kick-off** instead of "Kicked off";
  only when the live source explicitly says "not started" does a late match stay at "Kicked off". After 150 min with no result it is "pending".
- **Player pop-up (line-ups):** header and footer stay fixed, only the middle scrolls (slim themed scrollbar instead of the OS one), cleaner stat tiles,
  and a **binoculars "More player info"** button at the bottom that opens the player's page.
- **Related players** on the player page (below the match list): club teammates and national-team players, stars first
  (`GET /api/data/player-related/:id`, rules in `src/server/related-players.ts`). Club squad from `team_informations/<club>/<season>-squad.json`;
  national team from `team_informations/<id>/national-team-*.json` when the team is found in `id_registry.json`, otherwise players of the same
  nationality from the league market-value lists. A club-mate who is also international is listed once and tagged "Intl".
- **Data through your server, not GitHub:** every read of `goal4u-data` goes through `src/server/data-source.ts`. Set `GOAL4U_DATA_BASE` to the
  `/goal4u-data` route of gowra-api and the site gets the same files from the mirror (folder listings use its `/_ls/` route; the browser never calls
  `api.github.com` any more — new `GET /api/data/seasons`). Unset = GitHub directly. Videos/shorts (`gowrapavan/shortsdata`) stay on GitHub: the mirror does not carry that repo.
- **Deployment fixes:** `PORT` is read from the environment (Render), `/healthz`, no default admin token in production (`ADMIN_TOKEN` required for
  `POST /api/indexnow/submit`), the IndexNow key file is now written into the Netlify build, `render.yaml` blueprint, new `.env.example`, package renamed.

## Deploying (Netlify + gowra-api on Render)
1. **gowra-api on Render:** deploy it as it is (its own README). It only has to be reachable at `https://<name>.onrender.com/goal4u-data/...`.
2. **Netlify:** import this repo (build `npm run build:netlify`, publish `dist` — already in `netlify.toml`). Environment variables:
   `VITE_GOAL4U_DATA_URL=https://<name>.onrender.com/goal4u-data`, `NEWSAPI_KEY`, `BUILD_HOOK_URL`, and optionally `APP_URL`, `VITE_CONTACT_EMAIL`.
   Set them BEFORE the first build: the data address is baked into the browser bundle. Then `npm run seo:verify -- https://your-site.netlify.app`.
3. Copy your `public/logo/` folder into the project (favicons, `logo.png`, `dark-bg-logo.png`, `android-chrome-512x512.png`, `site.webmanifest`).
4. **Render free plan sleeps** when idle and the first request can take 30–50 s. Netlify functions give up after ~10 s by default, so keep gowra-api awake
   with an uptime ping to `/health` (every 5–10 min, e.g. UptimeRobot) — the CDN's stale-while-revalidate hides short waits but not a cold start on a quiet site.

---

# (history) Goal4U v4 — redesigned front end

Run: `npm install && npm run dev` (`NEWSAPI_KEY` is needed for the News page).

## What changed
- **New front end** (`src/pages`, `src/components`, `src/lib`, `src/index.css`): new design system, shell, 8 pages.
- **Backend & services kept**: `src/server/*`, `src/services/api.ts`, `src/utils`, `src/types.ts`, search hooks, SEO, sitemap/IndexNow, all URLs.
- **Old UI archived** in `_legacy_v3/` (excluded from tsconfig; delete when ready).

## Additive backend endpoints (`src/server/data-api.ts`)
| Endpoint | Why |
|---|---|
| `GET /api/data/feed?from&to&codes&season` | trimmed, date-windowed matches across competitions (≈14 KB vs ≈7 MB) |
| `GET /api/data/match/:id?c=PL&season=` | one match + its events/stats/lineups (instead of 1 MB matches + 4 MB stats) |
| `GET /api/data/videos|shorts?limit=N` | newest-first slice, comments stripped (shorts file is 13 MB) |

## Bug fixed
`getCompPathRoot` trusted stale competition info and served last season's data. It now never falls behind the calendar-derived season. Competitions are read live from each league's `data/<season>/<code>/competitionInfo.json` in the data repo (refreshed daily); there is no local `competitions.json` any more.

## Design system
Tokens in `src/index.css` — light + dark. Archivo (condensed display, wdth axis) + Hanken Grotesk. Brand ultramarine; red = live only; lime = highlights only.

## Routes (unchanged URLs)
`/` · `/matches` · `/match/:id?c=PL` · `/competition/:slug[/:season]` · `/team/:slug?teamId=` · `/player/:id` · `/watch` · `/news`
Legacy `/live`, `/media`, `/top-scorers/*`, `/archive/*`, `/standings|fixtures|results|stats/*` redirect or map to the new pages.

## v4.1 fixes
- Squad page crash (players with `position: null`) — null-safe grouping; unknown positions go under "Squad".
- Added an error boundary: one bad data field can no longer white-screen a page.
- YouTube "Error 153": Helmet's default `Referrer-Policy: no-referrer` blocked embeds. Now `strict-origin-when-cross-origin` (server.ts) + iframe `referrerPolicy`. Player also links "Open on YouTube" for videos whose owners disable embedding.
- Trophy images now shown on Player and Team (`GITHUB_DATA_BASE_URL + local_path`).
- Responsiveness: zero horizontal overflow verified on 8 pages × 6 sizes (360px → 2560px); fluid crests/scoreline; UI scales up on ≥1700px monitors.

## v6 — artwork, market values, Champions League, visual match centre

### Artwork you need to drop in (`public/images/`)
Nothing is hard-wired: a missing file falls back to the next layer, then to a brand gradient, so the site works before you add them.

| File | Used for | Fallback |
|---|---|---|
| `{league}-header.png` | Team page header background | brand gradient |
| `match-stadium-{league}-bg.png` | Match page + Home hero background | `match-stadium-bg.png` |
| `vs.png` | VS graphic on match cards, Home hero, match header (height-scaled, aspect ratio preserved) | typographic “VS” |

`{league}` = competition slug: `premier-league`, `la-liga`, `serie-a`, `bundesliga`, `ligue-1`, `champions-league`, `championship`.
The short league code (`pl`, `pd`, `sa`, `bl1`, `fl1`, `cl`, `elc`) also works, e.g. `pl-header.png`. Naming lives in `leagueHeaderBg()` / `stadiumBg()` in `src/lib/api.ts`.

### Market values
- New endpoint `GET /api/data/market-values?code=PL|PD|SA|BL1|FL1|all&limit=N` from `league_info/{CODE}/market_values.json`.
- Source values are in **₹ Crore** (Transfermarkt India) and are converted at one fixed rate (90 ₹/€, `INR_PER_EUR` in `src/server/market-value.ts`) → shown as “≈”. Unreadable values are dropped, never shown as €0. The unreliable `age` field is not exposed.
- Only the top 25 per league exist in the data; CL and Championship have no file, so those pages show no value section.

### Status rules (issue 28)
`LIVE` is shown only when the feed status is `IN_PLAY`, `PAUSED`, `LIVE`, `EXTRA_TIME` or `PENALTY_SHOOTOUT`. Past kick-off but unconfirmed → “Kicked off” (never LIVE). Upcoming matches show no status chip. Logic: `src/lib/match-state.ts`.

### Tests
`npm test` (match intel, market values, match-state/de-duplication). `npm run lint`, `npm run build`.

## v7 changes
- League page: one consistent structure per tab; desktop Recent-matches rail is locked to the table's height (scrolls inside); league facts + Most Valuable Player card in the header (from `league_metadata.json`); Stats tab has Most valuable players (`market_values.json`) and Most decorated players (`successful_players.json`).
- Data now flows through the existing `GET /api/data/league-info/:code/:type` service via `fetchTMLeagueInfo` (values converted ₹→€ in `src/server/market-value.ts`). The extra `/api/data/market-values` endpoint from v6 is no longer used by the UI.
- Club page: Next match is full column width; the club's 3 most-won trophies (by count) are shown in the hero.
- Removed the pitch-line overlay from all heroes; Home hero content is vertically centred.

## v8 changes
- **News**: `server.ts` now does `import "dotenv/config"`, so `.env` (NEWSAPI_KEY) is actually loaded — it never was before. The News page explains the real failure (missing key / rejected key / rate limit).
- **Watch**: the main player is an embedded YouTube player; clicking any video (Up next or More videos) loads it there and scrolls to it. "Up next" is pinned to the player's height.
- **Home rail**: compact match cards sized to the rail (5.5 visible ≥1280px, 4.5 laptops, 3.5 tablets); identical height/footers.
- **League insights**: equal-height cards, form pills inline. **Headshots**: framed with a mat (circle in lists, portrait in MVP cards).

## v9 changes
- **News**: football-only. Four club/league/player queries with US-sport exclusions → each article re-checked (`src/server/news-filter.ts`: NFL/college football/NBA… rejected, a real soccer signal required) → de-duplicated → ranked by hot topic (Real Madrid, Barcelona, Man City, Liverpool, Man United, Arsenal, Premier League, La Liga, Ronaldo & Portugal, Champions League) and freshness. 15-minute server cache protects NewsAPI's free quota. New layout: lead story, Trending, topic chips, uniform cards.
- **Latest videos / Watch**: YouTube Shorts are removed from the long-form video lists (`GET /api/data/videos?kind=video`). Classification uses YouTube oEmbed (portrait = Short) with a permanent in-memory cache, plus `#shorts` titles and IDs already in `shorts.json`. Panel is responsive (rows → 3 cards → sidebar).
- **Hero**: nearest match in the next 7 days involving a priority club (Real Madrid, Barcelona, Man United, Bayern, PSG, Arsenal, Man City, Atlético) — `src/lib/hero.ts`. Matches within 3 h of the earliest are compared on importance. Falls back to the previous logic when none.
- `npm test` now runs every test file (68 tests).

## v10 changes
- **News (football only)**: strict filter — rugby / American football / cricket / AFL etc. are rejected, and an article must name a real club, league or famous player (club names come from your own fixtures data; generic words like "transfer"/"manager" no longer count). Queries are restricted to football outlets and built from fixtures played in the last 2 / next 3 days, so match stories rank first and carry a match tag. Cache default 120 min (`NEWS_CACHE_MINUTES`) to protect NewsAPI's free quota.
- **Home**: new hero (glowing crests, info bar with segmented countdown), new "Most valuable players" cards with league switcher, new "Football news" section.
- **News page**: "Match news" filter chip.

## SEO & sitemaps

The football data lives in the GitHub repo and is already held in the server's in-memory cache (`data-cache.ts`), so
the SEO layer reads that cache — no extra network calls, no rebuild when a match is added.

| Piece | File |
|---|---|
| Which URLs exist, their canonical form, redirects, breadcrumbs (shared by React **and** server; a test reads `App.tsx` and fails if a route is added but not understood) | `src/lib/routes.ts`, `src/lib/competitions.ts` |
| Titles & descriptions (shared, so server HTML and React agree) | `src/lib/seo-text.ts` |
| Validation / de-duplication / eligibility rules | `src/server/seo-data.ts` |
| XML serialisation, chunking, limits, validation | `src/server/sitemap-builder.ts` |
| `/sitemap.xml` + `/sitemap-<group>-<n>.xml` | `src/server/sitemap-api.ts` |
| Per-page `<head>`, JSON-LD, HTTP 200/301/404 | `src/server/seo-meta.ts`, `seo-page.ts` |
| `robots.txt`, the site address: `APP_URL` → `VITE_APP_URL` → Netlify `URL` → **the address of the request itself** (no domain is hard-coded; works on any domain) | `src/server/site-url.ts` |

**Indexed:** `/`, `/matches`, `/news`, `/watch`; each competition (`/competition/<slug>`); each club (`/team/<slug>?teamId=<id>`,
domestic league preferred over the Champions League); each match with a valid id, two decided teams and a valid date
(`/match/<id>?c=<code>`), finished or upcoming. **Not indexed / not listed:** redirects (`/live`, `/media`, `/h2h/*`,
`/top-scorers/*`, `/archive/*`), tab aliases (`/standings/*`, `/results/*` … canonicalise to the competition page),
cancelled/postponed matches, placeholder teams ("TBD"), and player pages (they depend on live Transfermarkt look-ups that
cannot be verified from the cache; set `includePlayers` in `DEFAULT_SEO_CONFIG` only if you add a verified source).

If the data cache has not finished loading, sitemap endpoints answer `503 + Retry-After` rather than serving a partial file.
After deploying: open `/robots.txt`, `/sitemap.xml` and each child, submit `/sitemap.xml` in Search Console, then check
URL Inspection on one competition and one match page.

### Search keywords (match pages)

Titles/descriptions target how people search: `Real Madrid vs Barcelona (El Clásico) – live score, stats & head to head`
(finished games: `… 3-2 … – result, stats & head to head`). Club names use `COMMON_NAME` in `src/lib/seo-text.ts` (the data's
short name for Barcelona is "Barça", which nobody types), and famous fixtures get their own label (`DERBIES`, matched by
club id). Only promise what the page delivers — **do not add "highlights" to titles until the match page has a highlights
section** (then add it in `matchSeo`; a test currently fails if the word appears anywhere).
Each page also ships real text + internal links in the first HTML response (`src/server/seo-body.ts`), which React replaces on load.

## Netlify

**Why a different setup from `server.ts`:** `server.ts` is a long-running Node process (an in-memory cache refreshed by a timer, ~35 `/api/*`
routes, the SEO middleware). Netlify serves static files and short-lived functions — it cannot run that process, so none of
the Express routes (sitemaps, robots, per-page tags, 404s) exist there. For Netlify the same SEO rules run in two places that
*do* exist on Netlify:

| When | What | File |
|---|---|---|
| **Build** (`npm run build:netlify`) | Vite build → fetch matches/teams/competitions from the GitHub data repo (one file per competition) → write `robots.txt`, `sitemap.xml` + child sitemaps, `_seo/index.json`, `_redirects`. **Fails the deploy if the data is incomplete** (the previous good deploy keeps serving). | `scripts/build-netlify.ts`, `src/server/seo-build.ts`, `src/server/remote-source.ts` |
| **Request** | `netlify/functions/page.ts` serves every page that is not a real file: per-page `<head>`, crawlable text, canonical, JSON-LD, and 200 / 301 / 404. Reads the compact index the build wrote. Older-season matches the build did not index are looked up in GitHub on demand. | `netlify/functions/page.ts` |
| **Every 6 h** | `netlify/functions/rebuild.ts` triggers a rebuild so new matches reach the sitemaps. | `netlify/functions/rebuild.ts` |

Shared with the Express host (same rules, no duplication): `src/lib/routes.ts`, `src/lib/seo-text.ts`, `src/server/seo-data.ts`,
`seo-meta.ts`, `seo-body.ts`, `sitemap-builder.ts`.

### Set up
1. Netlify reads `netlify.toml` (build command, publish dir, functions, headers). Nothing to click.
2. Site settings → Environment variables: `APP_URL` (optional: your production domain, https; leave it out and every domain just works), `VITE_GOAL4U_DATA_URL` (your gowra-api `/goal4u-data` address), `NEWSAPI_KEY`, `BUILD_HOOK_URL` (Build hooks → create one).
3. **`/api/*` backend.** The React app calls `/api/data/*` and `/api/news`. That backend is `netlify/functions/api.ts` (the same routers as `server.ts`), so nothing else has to be hosted.
4. Deploy previews and branch deploys are automatically `noindex` (robots.txt blocks them, responses carry `X-Robots-Tag`).

### Verify (run this against the deployed site — it is the test that matters)
```
npm run seo:verify -- https://your-site.netlify.app
```
Checks robots.txt, sitemap index + every child (200, XML content-type, valid XML, ≤ 50,000 URLs, no duplicates), ~25 representative
pages (canonical == sitemap URL, one title/description, indexable, Open Graph, h1 + internal links in the *first* HTML, JSON-LD parses),
status codes (301s, 404s, trailing slash, unknown match, unknown sitemap) and duplicate-URL canonicalisation. Exit code 1 on any failure.
Local rehearsal: `npx netlify functions:serve --offline --port 9999`, `npm run build:netlify`, `npx tsx scripts/local-netlify.ts`, then verify `http://localhost:8888`.

## v18 — match statistics pipeline, tournaments, "Available soon"

### Where a match page's numbers come from
`GET /api/data/match/:id` decides once, server-side (`src/server/match-stats.ts`), and says which source it used in `statsSource`. **GitHub JSON first, API as the fallback:**

| Match | 1st | 2nd | 3rd | `statsSource` |
|---|---|---|---|---|
| **Finished** | `stats.json` written by `workers/stats365.py` (`"full time"`), validated against the fixture and `match_map.json` | `stats.json` in the legacy (yallashoot) format, via the existing validator | **API**: `koora-l.live/game/{id}` + `/stats/{id}` (cached 10 min once ended) | `stats365` / `legacy` / `live` |
| **In play** (or kicked off, repo not caught up) | **API** (cached 15 s) — a stored snapshot is stale | the `stats.json` snapshot, only if the API gave nothing | — | `live` / `stats365` |

A record only counts as "recorded" if it also validates, so a corrupt record can never block the API fallback. The API is used only when the fixture can be paired with a 365scores game.

* **Pairing works without the worker.** `match_map.json` (written by `workers/stats365.py`) is read first; when it has no entry — or the worker has never run — the server pairs the fixture itself (`src/server/match-resolver.ts`, the worker's strict pass: both teams recognised + kick-off within ±15 min, one request per UTC day, cached). A one-team guess is never made. So live and final statistics work from day one, and the worker's `stats.json` simply takes over for finished matches once it has recorded them.
* The join is `data/<season>/<CODE>/match_map.json` (`{matches: {<football-data id>: {s365_id, fd_home_s365_id, fd_away_s365_id, how}}}`). A stale mapping (ids not in the game) is refused.
* A snapshot captured mid-match (`status: "live"` / `"half time"`) is **never** shown as the final numbers of a finished match.
* `GET /api/data/match/:id/live` returns just the statistics part; the match page polls it every 20 s while `liveEligible` is true and pauses when the tab is hidden. While in play, the header's minute and score come from the live feed, but a fixture already FINISHED is never overridden.
* If `/stats/{id}` is unavailable, team totals are the exact sums of the per-player numbers in `/game` (flagged `statsDerived`); possession and corners are then simply absent.
* `all_stats` from the worker becomes a "More statistics" block (English names only; untranslated ids are hidden).
* koora-l.live is undocumented and may block datacenter IPs (the worker uses `curl_cffi` + a proxy for this reason). If the server log shows `[koora-live] … HTTP 403`, point `KOORA_API` at a relay you control; the page then falls back to `stats.json` automatically.

### Tournaments
`/competition/fifa-world-cup` and `/competition/european-championship` (the search overlay already linked there) now render: table/groups, matches, stats, analytics, clubs. They are labelled by the **edition in the data** (the repo still holds Euro 2024, so Euro shows 2024 with an "Euro 2028 is available soon" notice). A tournament with no fixtures or groups at all gets a full "Available soon" page. Tournament pages are `noindex` and not in the sitemap (`TOURNAMENTS` is separate from `COMPS`).

### Analytics and Predictions tabs
`/analytics/:slug` and `/predictions/:slug` used to open the wrong tab. Analytics (points/goals per game, clean sheets, home/away points) and Predictions (season simulation) are real tabs now; without data they show an inline "Available soon".

### Tests
`npm test` now includes `koora-live.test.ts` (conversion verified on a real game), `match-stats.test.ts` (every tier of the chain) and `tournaments.test.ts`.

### If a match page says "Live statistics are on their way" / "couldn’t be reached"
The empty state names the reason (`liveReason` in the API response): `upstream_unavailable` = this server can't reach koora-l.live / 365scores (look for `[koora-live] … HTTP 403` in the server log, then set `KOORA_API` and `S365_ALLSCORES_URL` to a relay), `no_mapping` = no 365scores game matched both teams at that kick-off, `mismatch` = the mapped game isn't this match (nothing is shown rather than wrong numbers), `not_started` = the feed has no data yet.

### Match page layout (v19)
* **Header:** goal scorers under the score, each side under its own team (`H. Kamara 29'`, `(pen)` / `(og)` tags, a brace is one line).
* **Summary tab:** a "Match stats" card first (possession, xG, shots, shots on target, chances created, corners; "All stats →" opens the Stats tab), then the match events, then form / head-to-head.
* **Stats tab:** possession hero, then collapsible groups — Attack, Passing, Discipline, Defending & duels, Set pieces. Home is always blue, away amber; each row is one bar split by share with the leader's number highlighted. Unrecognised stats land in "More". Logic lives in `src/lib/match-stats-view.ts` (unit-tested), markup in `src/components/match/MatchStatsUI.tsx`.
* Scorer names come from the events in `stats.json` (the repo's `matches.json` has empty `goals` / `bookings` for every finished match), else from the API.

### Match details from the 365scores game endpoint (v21)
`GET /api/data/match/:id/details` builds, from ONE `/game/{id}` response (same 15 s / 10 min cache as the statistics, paired through `match_map.json` or on demand), everything the match page can show — **in English only**: names come from the URL slugs; labels are translated by fixed tables keyed on the provider's numeric ids (`src/server/match-details.ts`); anything untranslatable is dropped, never shown raw (a test fails if any Arabic reaches the output).

| Where | What |
|---|---|
| **Line-ups tab** | Pitch graphic per team (toggle Home / Away): player photos from `imagecache.365scores.com/.../Athletes/{athleteId}`, shirt number, rating pill (blue ≥ 8, green ≥ 7, amber ≥ 6, red), badges for goals, assists, cards and "subbed off"; tap a player for his match statistics; substitutions with minute (who came on for whom); coach; bench (who came on, rating); unavailable players (injury / suspension, expected return). |
| **Summary tab** | Shot map sized by xG (filter Both / Home / Away), top performers (attack / midfield / defence), match info (venue, attendance of capacity, referee, broadcaster), highlights video link, fans' prediction and over/under vote. |
| **Stats tab** | "Ball in play" time. |

Without the live feed the Line-ups tab still draws the `stats.json` line-up on the same pitch (rows rebuilt from the formation string; initials instead of photos) and says why. Positions come from the provider's `yardFormation` (`line` 1 = goalkeeper … , `fieldSide` 0 = left … 100 = right). The worker's `stats.json` line-ups carry no athlete ids, positions or substitution minutes — extending `build_lineup` in `workers/stats365.py` to also write `athlete_id`, `line`, `side` and the substitution minute would let the repo JSON alone drive the full pitch.


## Data service sleeping (Render free plan): GitHub backup after 10 s

The data service sleeps after ~15 minutes without visitors and needs 25-50 s to wake. A request for a repo file (`data/…`, `stream-data/…`, `public/…`)
that gets no answer within **10 s**, a network error or a 502/503/504 is repeated at once against the same path of the GitHub data repo (a 1:1 copy),
**without the token**. For the next 60 s requests go straight to GitHub (nobody waits 10 s again) and one quiet request wakes the service.
401 (wrong token) and 404 are real answers and are not replaced. Code: `dataFetch` in `src/server/data-source.ts`; tests: `src/server/mirror-fallback.test.ts`.
GitHub's copy can be a few minutes older than the data service's.

## Secret stream page (optional)

Self-contained in `src/streams/` (server: `config`, `normalize`, `service`, `router`, `seo`; page: `StreamsPage.tsx`, `streams.css`, `client.ts`, `view.ts`).
It has its own API (`/api/streams`), its own styles (`sx-` classes) and no link anywhere; it is `noindex`, outside the sitemap, and outside the app layout.
Every `.json` in `stream-data/` is shown automatically (the folder is listed through the data service / GitHub and remembered 5 minutes; `STREAMS_FILES` limits it, `STREAMS_EXCLUDE` hides some).
Switch it on with `STREAMS_PAGE=1` (+ optional `STREAMS_PATH`, `STREAMS_KEY`, see `.env.example`) and redeploy; off → not in the build, 404.
It reads `stream-data/<file>.json` through the central `dataFetch` (token, 10 s limit, GitHub backup) and shows each source separately: one failing file never hides the others.
