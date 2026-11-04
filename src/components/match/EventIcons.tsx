/** Match-event icons drawn for this site (replacing the generic circle / footprints icons): ball, boot, substitution, cards. */
import { useState } from 'react';
import { cx } from '../ui';

/** Your own icon files (public/assests/goal.png, assist.png). The drawn versions below are used only if a file fails to load. */
export const GOAL_ICON = '/assests/goal.png', ASSIST_ICON = '/assests/assist.png';

/** Fallback football: white ball, dark centre patch and seams. */
function BallSvg({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#0d1220" strokeWidth="1.4" />
      <path d="M12 7.2l4 2.9-1.5 4.7h-5L8 10.1z" fill="#0d1220" />
      <path d="M12 7.2V2M16 10.1l5-1.6M14.5 14.8l3 4.3M9.5 14.8l-3 4.3M8 10.1L3 8.5" stroke="#0d1220" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Fallback boot, for assists. */
function BootSvg({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 17.5V8.2c0-.7.5-1.2 1.2-1.2h2.3c.5 0 .9.3 1.1.7.7 1.5 2 2.5 3.7 2.8l3.4.6c2.2.4 4 2.1 4.5 4.2l.2.9c.1.5-.3 1-.8 1H4.5C3.7 17.5 3 17.5 3 17.5z" />
      <path d="M6 20.5v-2M10 20.5v-2M14 20.5v-2M18 20.5v-2" />
    </svg>
  );
}

/** Substitution: a green arrow in, a red arrow out. */
export function SubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 20V5M3.5 9.5L8 5l4.5 4.5" stroke="#16a34a" /><path d="M16 4v15M11.5 14.5L16 19l4.5-4.5" stroke="#ef4444" />
    </svg>
  );
}

export function CardIcon({ red, className }: { red?: boolean; className?: string }) {
  return <span aria-hidden className={cx('inline-block w-[11px] h-[15px] rounded-[2.5px] ring-1 ring-black/25 shadow-sm', className)} style={{ background: red ? '#ef4444' : '#facc15' }} />;
}

/** Goal / own goal / missed penalty marker for a timeline: no background, just the symbol. */
export function GoalBadge({ own, missed }: { own?: boolean; missed?: boolean }) {
  return missed
    ? <svg width="18" height="18" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
    : <span className={cx('inline-flex', own && 'rounded-full ring-2 ring-red-500')}><BallIcon size={18} /></span>;
}

/** The substitution marker: the only timeline icon with a background, with room around the arrows. */
export function SubBadge() {
  return <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full bg-surface-2 ring-1 ring-line"><SubIcon size={16} /></span>;
}

export function BallIcon({ size = 14, className }: { size?: number; className?: string }) {
  const [bad, setBad] = useState(false);
  return bad ? <BallSvg size={size} className={className} /> : <img src={GOAL_ICON} alt="Goal" width={size} height={size} draggable={false} onError={() => setBad(true)} className={cx('object-contain', className)} style={{ width: size, height: size }} />;
}
export function BootIcon({ size = 14, className }: { size?: number; className?: string }) {
  const [bad, setBad] = useState(false);
  return bad ? <BootSvg size={size} className={className} /> : <img src={ASSIST_ICON} alt="Assist" width={size} height={size} draggable={false} onError={() => setBad(true)} className={cx('object-contain', className)} style={{ width: size, height: size }} />;
}
