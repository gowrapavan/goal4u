import { useState } from 'react';
import { CircleDot } from 'lucide-react';
import { Crest, cx } from '../ui';
import { useTeamColors } from '../../lib/team-colors';
import { allRows, groupRows, keySummary, homeShare, leader, scorers, type StatRow } from '../../lib/match-stats-view';

/** Each side uses the main colour of its own crest (see lib/team-colors.tsx), everywhere in the statistics UI. */
type Team = { name: string; crest?: string };
type Pair = { home: string; away: string; hn: number; an: number };
type More = { key: string; name: string; home: string; away: string; hn: number; an: number };

export function LiveBadge({ label = 'LIVE' }: { label?: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-live text-white text-[10px] font-bold px-2 h-5"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{label}</span>;
}

/** One statistic: label on top, the two numbers at the ends, ONE bar between them split by share. The leader's number is highlighted. */
export function StatLine({ row, tall }: { row: StatRow; tall?: boolean }) {
  const lead = leader(row.hn, row.an); const share = homeShare(row.hn, row.an);
  const { home: HOME, away: AWAY, homeInk, awayInk } = useTeamColors();
  const pill = (side: 'home' | 'away', v: string) => (
    <span className={cx('num font-bold text-[13px] sm:text-base min-w-[2.5rem] h-6 sm:h-7 px-1.5 sm:px-2 rounded-lg inline-flex items-center justify-center', lead !== side && 'text-muted')}
      style={lead === side ? { background: side === 'home' ? HOME : AWAY, color: side === 'home' ? homeInk : awayInk } : undefined}>{v}</span>
  );
  return (
    <div>
      <p className="text-center text-xs sm:text-[13px] font-semibold text-muted mb-1">{row.label}</p>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-[2.75rem] sm:w-[3.25rem] flex justify-start">{pill('home', row.home)}</div>
        <div className={cx('flex-1 flex gap-[3px]', tall ? 'h-3' : 'h-2')} role="img" aria-label={`${row.label}: ${row.home} to ${row.away}`}>
          <span className="rounded-l-full" style={{ width: `${share}%`, background: HOME, opacity: lead === 'away' ? 0.45 : 1 }} />
          <span className="rounded-r-full flex-1" style={{ background: AWAY, opacity: lead === 'home' ? 0.45 : 1 }} />
        </div>
        <div className="w-[2.75rem] sm:w-[3.25rem] flex justify-end">{pill('away', row.away)}</div>
      </div>
    </div>
  );
}

function Possession({ p, home, away }: { p: StatRow; home: Team; away: Team }) {
  const { home: HOME, away: AWAY } = useTeamColors();
  return (
    <div className="rounded-[var(--radius-card)] bg-surface-2/60 px-3 py-3 sm:py-4 sm:px-5">
      <p className="text-center text-xs font-semibold text-muted mb-2">Possession</p>
      <div className="flex items-center gap-3">
        <span className="hidden sm:block"><Crest src={home.crest} name={home.name} size={28} /></span>
        <span className="display num text-xl sm:text-3xl" style={{ color: HOME }}>{p.home}</span>
        <div className="flex-1 flex gap-[3px] h-3.5" role="img" aria-label={`Possession: ${p.home} to ${p.away}`}>
          <span className="rounded-l-full" style={{ width: `${homeShare(p.hn, p.an)}%`, background: HOME }} />
          <span className="rounded-r-full flex-1" style={{ background: AWAY }} />
        </div>
        <span className="display num text-xl sm:text-3xl" style={{ color: AWAY }}>{p.away}</span>
        <span className="hidden sm:block"><Crest src={away.crest} name={away.name} size={28} /></span>
      </div>
    </div>
  );
}

/** The Stats tab: possession hero, then the statistics in collapsible groups (Attack, Passing, Discipline, Defending, Set pieces). */
export function StatsPanel({ stats, more, home, away, note, live, dropped, homeName, awayName }: { stats: Record<string, Pair>; more?: More[]; home: Team; away: Team; note: string; live: boolean; dropped: string[]; homeName: string; awayName: string }) {
  const { home: HOME, away: AWAY } = useTeamColors();
  const groups = groupRows(allRows(stats, more)); const p = stats.possession ? { key: 'possession', label: 'Possession', ...stats.possession } : null;
  if (!groups.length && !p) return null;
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-bold text-sm min-w-0"><i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HOME }} /><span className="truncate">{homeName}</span></span>
        {live && <LiveBadge />}
        <span className="inline-flex items-center gap-2 font-bold text-sm min-w-0 justify-end"><span className="truncate">{awayName}</span><i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: AWAY }} /></span>
      </div>
      {p && <Possession p={p} home={home} away={away} />}
      {groups.map((g) => (
        <details key={g.id} open={g.open} className="group rounded-[var(--radius-card)] border border-line overflow-hidden">
          <summary className="flex items-center justify-between cursor-pointer select-none px-4 h-12 list-none hover:bg-surface-2/50 transition-colors [&::-webkit-details-marker]:hidden">
            <span className="display-wide text-sm">{g.title}</span>
            <span className="text-xs text-muted inline-flex items-center gap-2">{g.rows.length}<span className="inline-block transition-transform group-open:rotate-180" aria-hidden>▾</span></span>
          </summary>
          <div className="px-3 sm:px-4 pb-3 pt-1 space-y-3 sm:space-y-5">{g.rows.map((r) => <StatLine key={r.key} row={r} />)}</div>
        </details>
      ))}
      <p className="text-xs text-muted leading-relaxed">{note}{stats.expected_goals ? ' Expected goals (xG) is the provider’s own estimate.' : ''}{dropped.length ? ' Some figures were withheld because they were incomplete or inconsistent.' : ''}</p>
    </div>
  );
}

/** The Summary tab's snapshot: possession and the headline numbers, with a way into the full Stats tab. */
export function KeyStats({ stats, more, home, away, live, onAll }: { stats: Record<string, Pair> | null; more?: More[]; home: Team; away: Team; live: boolean; onAll: () => void }) {
  const k = keySummary(stats, more); if (!k.possession && !k.rows.length) return null;
  return (
    <section className="card p-4 sm:p-5" aria-label="Match statistics">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="display-wide text-base inline-flex items-center gap-2">Match stats {live && <LiveBadge />}</h3>
        <button onClick={onAll} className="text-sm font-semibold text-brand hover:underline">All stats →</button>
      </div>
      <div className="space-y-2.5 sm:space-y-4">
        {k.possession && <Possession p={k.possession} home={home} away={away} />}
        {k.rows.map((r) => <StatLine key={r.key} row={r} />)}
      </div>
    </section>
  );
}

/** The ball between the two scorer lists: /logo/ball_icon_logo.png (drop your icon in public/logo/); the built-in dot is shown until that file exists. */
export function BallMark({ small, px }: { small?: boolean; px?: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <CircleDot size={px ?? (small ? 12 : 18)} />;
  if (px) return <img src="/logo/ball_icon_logo.png" alt="" width={px} height={px} loading="lazy" decoding="async" onError={() => setMissing(true)} style={{ width: px, height: px }} className="object-contain shrink-0" />;
  return <img src="/logo/ball_icon_logo.png" alt="" width={small ? 14 : 22} height={small ? 14 : 22} loading="lazy" decoding="async" onError={() => setMissing(true)} className={small ? 'w-3 h-3 sm:w-3.5 sm:h-3.5 object-contain' : 'w-[18px] h-[18px] sm:w-[22px] sm:h-[22px] object-contain drop-shadow'} />;
}

/** One side's goal scorers, centred under that team's name in the match header (the ball marks the list). */
export function ScorerList({ events, side }: { events: any[] | null | undefined; side: 'home' | 'away' }) {
  const items = scorers(events)[side]; if (!items.length) return null;
  return (
    <ul className="mt-2 sm:mt-3 space-y-0.5 sm:space-y-1 w-full max-w-[16rem] text-center" aria-label={`${side === 'home' ? 'Home' : 'Away'} goal scorers`}>
      {items.map((x) => (
        <li key={x.name} className="text-[11px] sm:text-[13px] text-white leading-snug text-shadow [overflow-wrap:anywhere]">
          <span className="inline-flex align-[-2px] mr-1 opacity-80"><BallMark small /></span>
          <span className="font-semibold"><span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.name}</span></span>{' '}
          <span className="num text-white/70 whitespace-nowrap">{x.minutes.map((m, i) => `${m}'${x.tags[i] ? ` (${x.tags[i]})` : ''}`).join(', ')}</span>
        </li>
      ))}
    </ul>
  );
}

/** Goal scorers under the score in the match header: each side centred under its own team, well clear of the score board. */
export function Scorers({ events }: { events: any[] | null | undefined }) {
  const s = scorers(events); if (!s.home.length && !s.away.length) return null;
  const list = (items: typeof s.home, side: 'home' | 'away') => (
    <ul className={cx('space-y-1 min-w-0 px-0.5 sm:px-4', side === 'home' ? 'text-right' : 'text-left')}>
      {items.map((x) => (
        <li key={x.name} className="text-[11px] sm:text-sm text-white leading-snug text-shadow [overflow-wrap:anywhere]">
          <span className="font-semibold"><span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.name}</span></span>{' '}
          <span className="num text-white/75 whitespace-nowrap">{x.minutes.map((m, i) => `${m}'${x.tags[i] ? ` (${x.tags[i]})` : ''}`).join(', ')}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-3 sm:mt-7 pt-3 sm:pt-5 border-t border-white/20 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 sm:gap-6" aria-label="Goal scorers">
      {list(s.home, 'home')}
      <span className="min-w-[22px] sm:min-w-[190px] flex justify-center pt-0.5 text-white/80"><BallMark /></span>
      {list(s.away, 'away')}
    </div>
  );
}
