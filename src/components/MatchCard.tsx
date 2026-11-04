import { LeagueLogo } from './LeagueLogo';
import { holdLabel } from '../lib/match-state';
import { roundShort } from '../lib/match-round';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Crest, cx } from './ui';
import { FMatch, phase, scoreOf, hasScore, matchHref, tn, kickoff, dayLabel, compByCode, VS_IMAGE } from '../lib/api';

/** Status chip derived from the match data — LIVE only when the feed says the match is in play. */
export function StatusChip({ m, tone = 'surface' }: { m: FMatch; tone?: 'surface' | 'dark' }) {
  const p = phase(m);
  const base = 'inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-2.5 h-5 sm:h-6 text-[10px] sm:text-[11px] font-bold whitespace-nowrap';
  const held = holdLabel(m);
  if (p === 'live') return <span className={cx(base, 'bg-live text-white')}><span className="live-dot !bg-white" />{held ?? 'LIVE'}{!held && m.minute ? ` · ${m.minute}'` : ''}</span>;
  const quiet = tone === 'dark' ? 'bg-white/15 text-white' : 'bg-surface-2 text-muted';
  if (p === 'ft') return <span className={cx(base, quiet)}>{held === 'Awarded' ? 'Awarded' : 'Full time'}</span>;
  if (p === 'started') return <span className={cx(base, quiet)} title="Kick-off time has passed but the live feed says play has not started">Delayed</span>;
  if (p === 'pending') return <span className={cx(base, quiet)}>Awaiting result</span>;
  if (p === 'postponed') return <span className={cx(base, quiet)}>{held ?? 'Postponed'}</span>;
  return null; // upcoming: no chip — never show LIVE (or anything status-like) for a future match
}

/** The centre piece: VS artwork for matches yet to be decided, the score once there is one. */
export function VsCenter({ m, size = 'md', onDark }: { m: FMatch; size?: 'xs' | 'sm' | 'md' | 'lg'; onDark?: boolean }) {
  const [bad, setBad] = useState(false);
  const p = phase(m); const s = scoreOf(m);
  const showScore = (p === 'live' || p === 'ft') && hasScore(m);
  const h = { sm: 'clamp(34px, 9vw, 44px)', md: 'clamp(44px, 12vw, 64px)', lg: 'clamp(52px, 13vw, 96px)' }[size];
  if (showScore) {
    return <span className={cx('display num leading-none', size === 'lg' ? 'text-5xl sm:text-7xl' : size === 'md' ? 'text-4xl sm:text-5xl' : size === 'sm' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-2xl')}>{s.h}<span className="opacity-50 mx-1">–</span>{s.a}</span>;
  }
  // preserves the artwork's aspect ratio: fixed height, auto width
  return bad
    ? <span className={cx('display-wide italic', onDark ? 'text-white' : 'text-brand', size === 'lg' ? 'text-5xl' : 'text-3xl')}>VS</span>
    : <img src={VS_IMAGE} alt="versus" onError={() => setBad(true)} style={{ height: size === 'lg' ? `clamp(64px, 18vw, ${h}px)` : h, width: 'auto', maxWidth: '100%' }} className="object-contain select-none" draggable={false} />;
}

/** Versus-style match card: symmetrical crests + names, VS graphic centre, competition + kick-off details. */
export function VsMatchCard({ m, className, compact }: { m: FMatch & { seasonSlug?: string }; className?: string; compact?: boolean }) {
  const comp = compByCode(m.code); const p = phase(m);
  const Side = ({ t }: { t: FMatch['homeTeam'] }) => (
    <div className={cx('flex min-w-0 flex-col items-center text-center', compact ? 'gap-1' : 'gap-2')}>
      <Crest src={t.crest} name={t.name} size={compact ? 42 : 64} minSize={compact ? 28 : 40} />
      <span className={cx('w-full font-bold leading-tight line-clamp-2 [overflow-wrap:normal] [word-break:normal] hyphens-none', compact ? 'text-[12px] max-md:text-[10px]' : 'text-[11.5px] sm:text-sm')}>{tn(t)}</span>
    </div>
  );
  return (
    <Link to={matchHref(m)} className={cx('card card-lift group flex flex-col overflow-hidden transition-[border-color,box-shadow] hover:border-ink/60 hover:shadow-md', className)} aria-label={`${tn(m.homeTeam)} versus ${tn(m.awayTeam)}`}>
      <div className={cx('flex items-center justify-between gap-2', compact ? 'px-3 pt-2.5 max-md:px-2 max-md:pt-1.5' : 'px-3 pt-3 sm:px-4 sm:pt-3.5')}>
        <span className="flex items-center gap-2 min-w-0 text-xs max-sm:gap-1.5 font-semibold text-muted">
          <LeagueLogo comp={comp} size={16} />
          <span className="truncate max-sm:text-[10.5px]">{comp?.short || m.code}{!compact && roundShort(m, m.code) ? ` · ${roundShort(m, m.code)}` : ''}</span>
        </span>
        <StatusChip m={m} />
      </div>
      <div className={cx('flex-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-2 bg-gradient-to-b from-transparent via-brand-soft/40 to-transparent', compact ? 'py-2.5 max-md:py-1' : 'py-3 sm:py-4')}>
        <Side t={m.homeTeam} />
        <div className={cx('grid place-items-center', compact ? 'min-w-[44px] sm:min-w-[52px] max-md:min-w-[34px] max-md:[&_img]:h-[26px]!' : 'min-w-[48px] sm:min-w-[72px]')}><VsCenter m={m} size={compact ? 'xs' : 'sm'} /></div>
        <Side t={m.awayTeam} />
      </div>
      <div className={cx('flex items-center justify-between gap-2 border-t border-line text-muted', compact ? 'px-3 py-1.5 text-[11px] mt-auto max-md:px-2 max-md:py-1 max-md:text-[10px]' : 'px-3 py-2 text-[11px] sm:px-4 sm:py-2.5 sm:text-xs mt-auto')}>
        <span className="num font-semibold text-ink">{dayLabel(m.utcDate)}{p === 'ft' || p === 'live' ? '' : ` · ${kickoff(m.utcDate)}`}</span>
        <span className="inline-flex items-center gap-0.5 font-semibold group-hover:text-brand"><span className={compact ? 'max-md:hidden' : ''}>Match centre</span> <ChevronRight size={14} /></span>
      </div>
    </Link>
  );
}
