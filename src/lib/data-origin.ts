/**
 * ONE variable says where the football data + images come from:
 *
 *   VITE_GOAL4U_DATA_URL=https://gowra-api.onrender.com/goal4u-data     (production)
 *   VITE_GOAL4U_DATA_URL=http://localhost:8080/goal4u-data              (local testing)
 *
 * It is the root of a mirror of the data repo (gowra-api's /goal4u-data route), so
 *   <origin>/data/2025-2026/PL/matches.json   and   <origin>/public/headshot/10000.png
 * Vite inlines VITE_* into the browser code at build time; the Node server and the Netlify functions read the same
 * variable (`GOAL4U_DATA_URL` is accepted there too).
 *
 * This file is shared by the browser and the server, so it contains NO hosting address of its own: if the variable is
 * missing the browser gets relative URLs that visibly fail (instead of silently loading from somewhere else).
 * The server-only fallback lives in src/server/data-source.ts.
 */
// NOTE: keep this exact `import.meta.env` spelling: Vite only injects / replaces VITE_* when it sees it.
const fromVite: string | undefined = import.meta.env?.VITE_GOAL4U_DATA_URL;
const fromNode: string | undefined =
  typeof process !== 'undefined' && process.env ? process.env.GOAL4U_DATA_URL || process.env.VITE_GOAL4U_DATA_URL : undefined;

/** The configured mirror root without a trailing slash, or '' when the variable is not set. */
export const CONFIGURED_DATA_ORIGIN: string = String(fromVite || fromNode || '').trim().replace(/\/+$/, '');

/** <origin>/public — headshots, trophies, fallback images (used by the browser). */
export const PUBLIC_BASE: string = `${CONFIGURED_DATA_ORIGIN}/public`;
