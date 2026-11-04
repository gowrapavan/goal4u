/**
 * Scheduled function: asks Netlify to rebuild the site so new matches, teams and competitions in the GitHub data reach the
 * sitemaps and the page index. Needs a Build hook (Site settings → Build & deploy → Build hooks) stored as BUILD_HOOK_URL.
 * Runs on the published deploy only. Every 6 hours ≈ 4 builds/day; change the cron below to taste.
 */
export default async (): Promise<void> => {
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) { console.warn('[rebuild] BUILD_HOOK_URL is not set — skipping. Without it the sitemap only updates when you deploy.'); return; }
  if (!/^https:\/\/api\.netlify\.com\/build_hooks\/[\w-]+$/.test(hook)) { console.error('[rebuild] BUILD_HOOK_URL does not look like a Netlify build hook — refusing to call it.'); return; }
  const r = await fetch(hook, { method: 'POST' });
  console.log(`[rebuild] build hook responded ${r.status}`);
};
export const config = { schedule: '0 */6 * * *' };
