/**
 * Where the football data comes from — ONE place, so every reader (Express API, Netlify build, Netlify page function) agrees.
 *
 *   VITE_GOAL4U_DATA_URL  unset  → GitHub straight:   https://raw.githubusercontent.com/gowrapavan/goal4u-data/main
 *   VITE_GOAL4U_DATA_URL  set    → the /goal4u-data mirror in gowra-api (Render), e.g.  https://data.example.test/goal4u-data
 *
 * The mirror maps 1:1 onto the repo (`<base>/data/2026-2027/PL/matches` → data/2026-2027/PL/matches.json), caches for 20 s on
 * match days, and answers folder listings at `<base>/_ls/<dir>`, so nothing here talks to api.github.com when it is set.
 */
// Honour VITE_GOAL4U_DATA_URL from a local .env too (build scripts import this before they read .env). Values already in the environment win.
try { (process as any).loadEnvFile?.('.env'); } catch { /* no .env file: fine */ }

import { AsyncLocalStorage } from 'node:async_hooks';
import { DATA_TOKEN, TOKEN_MALFORMED, TOKEN_FROM_LEGACY_NAME } from './data-token';

const GITHUB_RAW = 'https://raw.githubusercontent.com/gowrapavan/goal4u-data/main';
const GITHUB_REPO = 'gowrapavan/goal4u-data';

export function dataOrigin(env: Record<string, string | undefined> = process.env): string {
  // GOAL4U_DATA_URL is THE setting (server-side only: the browser never learns the address). VITE_GOAL4U_DATA_URL, GOAL4U_DATA_BASE and VITE_DATA_BASE are older names, still accepted.
  const v = String(env.GOAL4U_DATA_URL || env.VITE_GOAL4U_DATA_URL || env.GOAL4U_DATA_BASE || env.VITE_DATA_BASE || '').trim().replace(/\/+$/, '');
  if (!v) return GITHUB_RAW;
  if (!/^https?:\/\/[^\s]+$/.test(v)) { console.warn(`[data-source] GOAL4U_DATA_URL "${v}" is not an http(s) URL — using GitHub`); return GITHUB_RAW; }
  return v;
}
export const isMirror = (env: Record<string, string | undefined> = process.env) => dataOrigin(env) !== GITHUB_RAW;

export const DATA_ORIGIN = dataOrigin();
/** …/data  — competitions, teams, players, league_info. */
export const DATA_BASE = `${DATA_ORIGIN}/data`;
/** …/stream-data — stream links. */
export const STREAM_BASE = `${DATA_ORIGIN}/stream-data`;
/** …/public — images (headshots, trophies, backdrops). */
export const PUBLIC_BASE = `${DATA_ORIGIN}/public`;
/** Videos and shorts live in a different repo that the mirror does not carry. */
export const SHORTS_BASE = 'https://raw.githubusercontent.com/gowrapavan/shortsdata/main';

export type DirEntry = { name: string; type: 'dir' | 'file' };

/** Folder listing of the data repo ("data", "data/team_informations/86", …). null when the folder is missing or the source failed. */
export async function listDir(dir: string, f: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<DirEntry[] | null> {
  const clean = String(dir).replace(/^\/+|\/+$/g, '');
  if (clean.split('/').includes('..') || !/^[\w\-./]*$/.test(clean)) return null;
  const githubList = () => f(`https://api.github.com/repos/${GITHUB_REPO}/contents/${clean}?ref=main`, { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'goal4u' }, signal: AbortSignal.timeout(10000) });
  try {
    const mirror = isMirror(env);
    let r: Response;
    if (mirror) {
      // The mirror first (Authorization header via the one central helper). Not answering within 10 s, or a 5xx → the GitHub listing instead.
      try {
        r = await dataFetch(`${dataOrigin(env)}/_ls/${clean}`, { timeoutMs: MIRROR_TIMEOUT_MS, retry: false, fallback: false }, f);
        if (RETRY_STATUS.has(r.status)) { markMirrorDown(); r = await githubList(); }
      } catch { markMirrorDown(); r = await githubList(); }
    } else r = await githubList();
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j.map((i: any) => ({ name: String(i.name), type: i.type === 'dir' ? 'dir' : 'file' })) : null;
  } catch { return null; }
}

/** True when the data is read from GitHub itself (no mirror configured). */
export const USING_GITHUB_DIRECT = !isMirror();

/**
 * Replace the GitHub address of the data repository by the mirror's, everywhere inside a string / array / object, so a URL taken from a
 * data file can be shown or sent to a browser without exposing GitHub. With no mirror configured there is nothing to point to: the value is returned unchanged.
 * Never mutates its input.
 */
export function maskGithubUrls<T>(value: T, env: Record<string, string | undefined> = process.env): T {
  if (!isMirror(env)) return value;
  const to = dataOrigin(env);
  const re = /https:\/\/raw\.githubusercontent\.com\/gowrapavan\/goal4u-data\/main/g;
  const walk = (v: any): any => {
    if (typeof v === 'string') return v.replace(re, to);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

/* ───────────────────────── access token: ONE place ─────────────────────────
 * gowra-api answers 401 to any request without the token. Every server-side request to the data service goes through dataFetch():
 *   • Authorization: Bearer <GOAL4U_TOKEN> is added ONLY when the URL is on the data service (never to GitHub, YouTube, NewsAPI, koora …);
 *   • 401  → no retry; logged once a minute as "check GOAL4U_TOKEN" (never the token itself); the request is marked so /api/data answers 503;
 *   • 404  → returned as it is (the caller handles "not found" as before);
 *   • 502 / 503 / 504 or a network error → ONE retry after a short pause (a sleeping Render service), then the failure is returned / thrown.
 *     A timeout is not retried: it already waited the full time, and a serverless function has no time for a second wait.
 */
const MIRROR_ACTIVE = DATA_ORIGIN !== GITHUB_RAW;
export const isDataServiceUrl = (url: string): boolean => MIRROR_ACTIVE && (url === DATA_ORIGIN || url.startsWith(`${DATA_ORIGIN}/`));
/** The Authorization header for a URL, or undefined (not the data service, or no token configured). */
export const authHeaderFor = (url: string): string | undefined => (DATA_TOKEN && isDataServiceUrl(url) ? `Bearer ${DATA_TOKEN}` : undefined);

const als = new AsyncLocalStorage<{ authFailed: boolean }>();
let authFailures = 0, lastAuthLog = 0, warnedConfig = false;
/** How many 401s this process has seen (the build script uses it to explain an empty result). */
export const dataAuthFailures = () => authFailures;
export const dataAuthFailedHere = () => als.getStore()?.authFailed === true;
export function noteDataAuthFailure(now: number = Date.now()): void {
  authFailures++;
  const st = als.getStore(); if (st) st.authFailed = true;
  if (now - lastAuthLog > 60_000) { lastAuthLog = now; console.error('[data-source] the data service answered 401: check GOAL4U_TOKEN'); }
}
function warnConfigOnce(url: string) {
  // The "already said it" flag lives on globalThis, not in this module: if a dev runner loads this file more than once, the message still appears ONCE per process.
  const g = globalThis as any;
  if (g.__goal4uConfigWarned || !isDataServiceUrl(url)) return;
  if (TOKEN_MALFORMED) { g.__goal4uConfigWarned = true; console.warn('[data-source] GOAL4U_TOKEN has an unexpected format (spaces, wrong length?): it is ignored'); }
  else if (!DATA_TOKEN) { g.__goal4uConfigWarned = true; console.warn('[data-source] GOAL4U_TOKEN is not set: the data service will answer 401'); }
  else if (TOKEN_FROM_LEGACY_NAME) { g.__goal4uConfigWarned = true; console.warn('[data-source] the token is read from VITE_GOAL4U_TOKEN: rename that variable to GOAL4U_TOKEN (a VITE_ name is meant for the browser)'); }
}


/* ───────────────────────── URL guard: a request can never leave the data folder ─────────────────────────
 * Values from a request end up inside data URLs (league code, season, squad file …). The route handlers validate them (safe-input.ts); this is
 * the second, independent line of defence that sits in the ONE function every data read goes through. A URL that contains a "." / ".." path
 * segment (also when percent-encoded, once or twice, or written with a backslash), user-info ("https://a@b"), or a scheme other than
 * http(s) is refused before anything is sent — so the access token can never be carried to another path or another host.
 */
export class UnsafeDataUrl extends Error { constructor(why: string) { super(`unsafe data URL: ${why}`); this.name = 'UnsafeDataUrl'; } }
export function assertSafeDataUrl(url: string): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new UnsafeDataUrl('not a URL'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeDataUrl('scheme');
  if (u.username || u.password) throw new UnsafeDataUrl('credentials in URL');
  const raw = String(url).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').split(/[?#]/)[0];       // the path exactly as written, before the URL parser tidies it
  let seen = raw;
  for (let i = 0; i < 3; i++) {                                                                 // decode up to 3 times: %2e%2e, %252e%252e …
    if (/[\\\u0000-\u001f]/.test(seen)) throw new UnsafeDataUrl('control character or backslash');
    if (seen.split('/').some((seg) => seg === '.' || seg === '..')) throw new UnsafeDataUrl('dot segment');
    let next: string; try { next = decodeURIComponent(seen); } catch { throw new UnsafeDataUrl('bad percent-encoding'); }
    if (next === seen) break; seen = next;
  }
}
/** The URL with the access token as a query parameter — for the image proxy only (gowra-api wants it there for pictures). Not the data service → unchanged. */
export function withTokenQuery(url: string): string {
  if (!DATA_TOKEN || !isDataServiceUrl(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(DATA_TOKEN)}`;
}

/* ───────────────────────── backup source: GitHub, when the data service does not answer in time ─────────────────────────
 * The data service (gowra-api on a free Render plan) sleeps after ~15 minutes without a visitor and needs 25-50 s to wake. A visitor must not wait for that:
 *   • a request to a repo file (data/…, stream-data/…, public/…) that gets no answer within MIRROR_TIMEOUT_MS (10 s), a network error or a 502/503/504
 *     is repeated at once against the same path of the GitHub data repo (the mirror is a 1:1 copy of it) — WITHOUT the access token, which never leaves the data service (neither the header nor the ?token= the image route uses: the query string is dropped);
 *   • the failure is remembered for MIRROR_COOLDOWN_MS (60 s): requests in that minute go straight to GitHub instead of each waiting 10 s again, and
 *     one quiet request is sent to the sleeping service so it is awake when the minute is over;
 *   • 401 (a wrong token) and 404 (no such file) are real answers: no fallback, so a configuration mistake still shows up as before;
 *   • an answer that came from GitHub carries the header X-Goal4U-Data-Source: github-backup (the secret stream page shows it).
 */
export const MIRROR_TIMEOUT_MS = 10_000;
export const MIRROR_COOLDOWN_MS = 60_000;
export const BACKUP_HEADER = 'x-goal4u-data-source';
let mirrorDownUntil = 0;
export const mirrorIsCoolingDown = (now: number = Date.now()) => now < mirrorDownUntil;
export const _resetMirrorState = () => { mirrorDownUntil = 0; };
function markMirrorDown(now: number = Date.now()): void {
  const first = !mirrorIsCoolingDown(now);
  mirrorDownUntil = now + MIRROR_COOLDOWN_MS;
  if (first) { console.warn('[data-source] the data service did not answer in time: using GitHub for the next minute'); wakeMirror(); }
}
/** One quiet request so a sleeping service starts waking. Fire and forget; never the token; switched off in tests (GOAL4U_NO_WAKE_PING=1). */
function wakeMirror(): void {
  if (!MIRROR_ACTIVE || process.env.GOAL4U_NO_WAKE_PING === '1') return;
  try { void fetch(`${new URL(DATA_ORIGIN).origin}/`, { signal: AbortSignal.timeout(60_000) }).then((r) => r.body?.cancel(), () => {}); } catch { /* nothing to wake */ }
}
/** The GitHub address of a data-service URL, or null when it has no counterpart (not the data service, or a path the repo does not hold such as /_ls). */
export function backupUrlFor(url: string): string | null {
  if (!isDataServiceUrl(url)) return null;
  // Path only: the image route puts the token in the query (?token=…); GitHub must never see a query string, let alone the token.
  const rest = url.slice(DATA_ORIGIN.length).replace(/^\/+/, '').split(/[?#]/)[0];
  return /^(data|stream-data|public)\//.test(rest) ? `${GITHUB_RAW}/${rest}` : null;
}

export interface DataFetchInit extends RequestInit { timeoutMs?: number; retry?: boolean; retryDelayMs?: number; /** false = never use the GitHub backup for this call. */ fallback?: boolean }
const RETRY_STATUS = new Set([502, 503, 504]);
const isAbort = (e: any) => e?.name === 'AbortError' || e?.name === 'TimeoutError';
const tagBackup = (r: Response): Response => {
  const h = new Headers(r.headers); h.set(BACKUP_HEADER, 'github-backup');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
};

export async function dataFetch(url: string, init: DataFetchInit = {}, f: typeof fetch = fetch): Promise<Response> {
  const { timeoutMs = 10_000, retry = true, retryDelayMs = 800, fallback = true, headers, signal, ...rest } = init;
  assertSafeDataUrl(url);                                // before the token is attached or anything is sent
  const h = new Headers(headers);
  const auth = authHeaderFor(url);
  if (auth && !h.has('authorization')) h.set('Authorization', auth);
  warnConfigOnce(url);

  const backup = fallback ? backupUrlFor(url) : null;
  if (backup) {
    assertSafeDataUrl(backup);
    const gh = new Headers(h); gh.delete('authorization');                       // the token belongs to the data service only
    const fromBackup = async (): Promise<Response> => tagBackup(await f(backup, { ...rest, headers: gh, signal: signal ?? AbortSignal.timeout(timeoutMs) }));
    if (mirrorIsCoolingDown()) return fromBackup();
    try {
      const sig = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(Math.min(timeoutMs, MIRROR_TIMEOUT_MS))]);
      const r = await f(url, { ...rest, headers: h, signal: sig });
      if (!RETRY_STATUS.has(r.status)) { if (r.status === 401) noteDataAuthFailure(); return r; }
      markMirrorDown();
    } catch (e) {
      if (signal?.aborted) throw e;                                              // the caller's own deadline passed: nothing left to try
      markMirrorDown();
    }
    return fromBackup();
  }

  const attempt = async (): Promise<Response> => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await f(url, { ...rest, headers: h, signal: signal ?? ctl.signal }); } finally { clearTimeout(t); }
  };
  let res: Response | undefined, err: unknown;
  try { res = await attempt(); } catch (e) { err = e; }
  if (retry && (err ? !isAbort(err) : RETRY_STATUS.has(res!.status))) {
    if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
    err = undefined;
    try { res = await attempt(); } catch (e) { err = e; }
  }
  if (err) throw err;
  if (res!.status === 401 && isDataServiceUrl(url)) noteDataAuthFailure();
  return res!;
}

/** Express middleware for /api/data: when the data service refused the token during a request, the answer is 503 "Data service unavailable" (code data_auth, never cached), not an empty page or a false "not found". */
export function dataAuthGuard(_req: any, res: any, next: () => void): void {
  als.run({ authFailed: false }, () => {
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      if (dataAuthFailedHere()) { res.status(503); res.set('Cache-Control', 'no-store'); return json({ error: 'Data service unavailable', code: 'data_auth' }); }
      return json(body);
    };
    next();
  });
}
