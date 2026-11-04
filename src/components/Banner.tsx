import { ReactNode } from 'react';
import { cx } from './ui';

/**
 * Photographic banner used by Home hero, Team header and Match header.
 * `bg` is a CSS background-image list (see leagueHeaderBg / stadiumBg in lib/api).
 * Missing image files simply fall through to the next layer, then to the brand gradient.
 * A fixed dark scrim keeps white text readable in BOTH light and dark themes.
 */
export function Banner({ bg, children, className, scrim = 'normal', rounded = true }: {
  bg: string; children: ReactNode; className?: string; scrim?: 'light' | 'normal' | 'strong'; rounded?: boolean;
}) {
  const scrims = {
    light: 'from-slate-950/35 via-slate-950/15 to-slate-950/45',
    normal: 'from-slate-950/55 via-slate-950/30 to-slate-950/65',
    strong: 'from-slate-950/70 via-slate-950/45 to-slate-950/80',
  };
  return (
    <section
      className={cx('relative isolate overflow-hidden text-white', rounded && 'rounded-3xl', className)}
      style={{ backgroundImage: `${bg ? bg + ', ' : ''}linear-gradient(135deg, var(--brand), #0a1266)`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
    >
      <div className={cx('absolute inset-0 -z-10 bg-gradient-to-b', scrims[scrim])} />
      {children}
    </section>
  );
}
