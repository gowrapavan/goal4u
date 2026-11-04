/**
 * The access token for the data service (gowra-api) — SERVER ONLY.
 *
 *   GOAL4U_TOKEN          the token (Netlify → Environment variables, or .env). NOT prefixed VITE_, so a build can never put it in the browser bundle.
 *   VITE_GOAL4U_TOKEN     the old name, still read here so an existing deployment keeps working — but rename it: a VITE_ name is meant for the browser.
 *
 * The browser never sees it: images are fetched through /api/img (same origin) and the server adds the token (see data-api.ts).
 * This file must never be imported by code that runs in the browser (nothing under src/components, src/pages, src/lib, src/utils does).
 */
const env = (typeof process !== 'undefined' && process.env ? process.env : {}) as Record<string, string | undefined>;

/** The token as it may be used: printable ASCII, no spaces, a sensible length. Anything else is treated as "no token" (and never shown). */
export const readToken = (raw: unknown): string => {
  const t = String(raw ?? '').trim();
  return /^[\x21-\x7E]{8,512}$/.test(t) ? t : '';
};

const rawToken = String(env.GOAL4U_TOKEN ?? '').trim() || String(env.VITE_GOAL4U_TOKEN ?? '').trim();
export const DATA_TOKEN: string = readToken(rawToken);
/** True when a token was provided but is unusable (wrong characters / length): the server logs it once, without the value. */
export const TOKEN_MALFORMED: boolean = !!rawToken && !DATA_TOKEN;
/** True when the old VITE_ name is what supplied the token (the server logs a one-time reminder to rename it). */
export const TOKEN_FROM_LEGACY_NAME: boolean = !String(env.GOAL4U_TOKEN ?? '').trim() && !!String(env.VITE_GOAL4U_TOKEN ?? '').trim();
