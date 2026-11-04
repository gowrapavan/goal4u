import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getTheme, subscribeTheme } from '../lib/theme';
import { leagueLogoSources, type LogoTone } from '../lib/league-logo';
import { cx } from './ui';

/**
 * THE league logo, used everywhere a competition is shown. Light mode shows public/assets/<code>.png, dark mode public/assets/<code>-dark.png
 * (<code> = competition code in lower case: pl, pd, sa, bl1, fl1, cl, elc, wc, ec). A missing file steps down to the next one, then to the
 * competition's own emblem, then to its initials, so nothing ever shows a broken image.
 * tone: 'auto' follows the theme; 'light' / 'dark' force the logo made for a light / dark background (e.g. a white badge, or the dark match banner).
 */
export function LeagueLogo({ comp, size = 20, tone = 'auto', className }: { comp?: { code: string; short?: string; name?: string; emblem?: string } | null; size?: number; minSize?: number; tone?: 'auto' | LogoTone; className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'light' as const);
  const t: LogoTone = tone === 'auto' ? theme : tone;
  const srcs = useMemo(() => leagueLogoSources(comp?.code, t, comp?.emblem), [comp?.code, comp?.emblem, t]);
  const [failed, setFailed] = useState(0);
  useEffect(() => setFailed(0), [srcs.join('|')]);
  const src = srcs[failed];
  const label = comp?.short || comp?.name || comp?.code || '';
  if (!src) return <span aria-hidden className={cx('inline-grid place-items-center shrink-0 rounded-full bg-surface-2 text-muted font-bold', className)} style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}>{label.slice(0, 2).toUpperCase()}</span>;
  return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed((n) => n + 1)} className={cx('object-contain shrink-0', className)} style={{ width: size, height: size }} />;
}
