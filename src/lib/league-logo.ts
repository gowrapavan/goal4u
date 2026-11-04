import { PUBLIC_FILES, publicUrl, type PublicFiles } from './public-files';

/** 'light' = the logo for light backgrounds (public/assets/pl.png); 'dark' = the logo for dark backgrounds (public/assets/pl-dark.png). */
export type LogoTone = 'light' | 'dark';

/**
 * The picture files to try for a league, best first:
 *   dark background : <code>-dark.png, then <code>.png      light background : <code>.png
 * then the competition's own emblem (the data's crest URL). Only files that exist in public/assets are listed.
 * <code> is the competition code in lower case: pl, pd, sa, bl1, fl1, cl, elc, wc, ec …
 */
export function leagueLogoSources(code: string | undefined, tone: LogoTone, emblem?: string | null, files: PublicFiles = PUBLIC_FILES): string[] {
  const c = (code || '').trim().toLowerCase();
  const out: string[] = [];
  if (/^[a-z0-9]+$/.test(c)) {
    if (tone === 'dark') { const d = publicUrl(`assets/${c}-dark.png`, files); if (d) out.push(d); }
    const l = publicUrl(`assets/${c}.png`, files); if (l) out.push(l);
  }
  if (emblem) out.push(emblem);
  return [...new Set(out)];
}
