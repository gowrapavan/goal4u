import { Link } from 'react-router-dom';
import { CalendarDays, UserRound, Users } from 'lucide-react';
import { useTeamColors } from '../../lib/team-colors';
import { Banner } from '../Banner';
import { LeagueLogo } from '../LeagueLogo';
import { Crest, cx } from '../ui';
import { StatusChip, VsCenter } from '../MatchCard';
import { BallMark } from './MatchStatsUI';
import { scorers } from '../../lib/match-stats-view';
import { competitionLine } from '../../lib/match-round';
import { FMatch, phase, scoreOf, hasScore, tn, teamHref, compByCode, kickoff, dayLabel, stadiumBg } from '../../lib/api';

/** A small stadium bowl (the courthouse-style icon in the icon set is not a stadium). */
const StadiumIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <ellipse cx="12" cy="8.5" rx="9.5" ry="4.5" /><ellipse cx="12" cy="8.5" rx="4.8" ry="2" /><path d="M2.5 8.5v6.5c0 2.5 4.2 4.5 9.5 4.5s9.5-2 9.5-4.5V8.5" /><path d="M7 15.5v3.6M12 16.6v3.2M17 15.5v3.6" />
  </svg>
);

type Props = {
  m: FMatch; raw: any; code: string; season?: string | null; events?: any[] | null;
  venue?: string | null; referee?: string | null; attendance?: number | null;
  ht: { home: number; away: number } | null; hasRes: boolean; dur: string | null; pen: { home: number; away: number } | null;
};

/** One team's goals, in minute order, under THAT team (home: left aligned, away: mirrored to the right). Attribution comes from each event's own team. */
function SideScorers({ events, side }: { events: any[] | null | undefined; side: 'home' | 'away' }) {
  const rows = scorers(events)[side];
  if (!rows.length) return null;
  const away = side === 'away';
  return (
    <ul className={cx('mt-3 sm:mt-4 space-y-1.5 sm:space-y-2 w-full min-w-0', away ? 'px-2 sm:pl-4 sm:pr-[5.5rem]' : 'px-2 sm:pr-4 sm:pl-[5.5rem]')} aria-label={`${away ? 'Away' : 'Home'} goal scorers`}>
      {rows.map((x) => (
        <li key={x.name} className={cx('flex items-center gap-1.5 sm:gap-3 min-w-0 text-[11px] sm:text-sm font-semibold text-white leading-tight text-shadow', away && 'justify-end')}>
          <span className="shrink-0 inline-flex sm:hidden"><BallMark px={13} /></span><span className="shrink-0 hidden sm:inline-flex"><BallMark px={18} /></span>
          <span className="min-w-0 truncate"><span className="sm:hidden">{x.short}</span><span className="hidden sm:inline">{x.name}</span></span>
          <span className="num text-white/80 whitespace-nowrap">{x.minutes.map((mm, i) => `${mm}′${x.tags[i] ? ` (${x.tags[i] === 'pen' ? 'p' : x.tags[i]})` : ''}`).join(', ')}</span>
        </li>
      ))}
    </ul>
  );
}

export function MatchHero({ m, raw, code, season, events, venue, referee, attendance, ht, hasRes, dur, pen }: Props) {
  const { home: HOME, away: AWAY, ready } = useTeamColors();   // each side's crest colour, the same as the stats below
  const p = phase(m); const comp = compByCode(code); const s = scoreOf(m);
  const showScore = (p === 'live' || p === 'ft') && hasScore(m);
  const dateLong = new Date(m.utcDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const line = competitionLine({ stage: raw.stage, matchday: m.matchday, group: raw.group }, code, comp?.name).replace(/,([^,]*)$/, ' •$1');
  const sub = p === 'upcoming' || p === 'started'
    ? <><p className="font-extrabold num text-xl sm:text-2xl mt-1.5">{kickoff(m.utcDate)}</p><p className="text-[11px] sm:text-xs font-semibold text-white/80">{dayLabel(m.utcDate)}</p></>
    : (() => {
        const t = p === 'live' ? (ht && hasRes ? `HT ${ht.home} - ${ht.away}` : 'Live score')
          : p === 'ft' ? [dur, ht && hasRes ? `HT ${ht.home} - ${ht.away}` : null, pen ? `Pens ${pen.home} - ${pen.away}` : null].filter(Boolean).join(' · ')
          : dayLabel(m.utcDate);
        return t ? <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-[13px] font-medium text-white/85 num">{t}</p> : null;
      })();
  const foot = [
    { key: 'date', icon: <CalendarDays size={16} />, text: `${dateLong} · ${kickoff(m.utcDate)}`, mobileOnly: true },
    venue && { key: 'venue', desktopOnly: true, icon: <StadiumIcon size={16} />, text: venue },
    referee && { key: 'ref', desktopOnly: true, icon: <UserRound size={16} />, text: `Referee: ${referee}` },
    attendance ? { key: 'att', desktopOnly: true, icon: <Users size={16} />, text: `Attendance: ${attendance.toLocaleString('en-US')}` } : null,
  ].filter(Boolean) as { key: string; icon: React.ReactNode; text: string; mobileOnly?: boolean; desktopOnly?: boolean }[];

  return (
    <Banner bg={stadiumBg(code)} scrim="normal" rounded={false} className="max-sm:-mx-4 max-sm:rounded-b-3xl sm:rounded-3xl px-3 pt-3.5 pb-4 sm:px-8 sm:pt-6 sm:pb-6">
      {/* extra navy depth over the stadium picture, so text always reads */}
      <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(10,30,90,.10),rgba(2,6,22,.62)_85%)]" />

      {/* top row */}
      <div className="flex items-center justify-between gap-3">
        <Link to={`/competition/${comp?.slug}${season ? `/${season}` : ''}`} className="inline-flex items-center gap-2.5 sm:gap-4 min-w-0 text-white hover:text-white">
          <span className="shrink-0"><LeagueLogo tone="dark" comp={comp} size={30} /></span>
          <span aria-hidden className="h-6 sm:h-8 w-px bg-white/30 shrink-0" />
          <span className="text-[12px] sm:text-[15px] font-medium leading-tight min-w-0 max-sm:line-clamp-2 sm:truncate">{line}</span>
        </Link>
        <span className="hidden sm:inline-flex items-center gap-2 shrink-0 glass rounded-full h-8 px-3.5 text-[13px] font-medium num"><CalendarDays size={16} className="opacity-90" />{dateLong}</span>
      </div>

      {/* teams + scoreboard */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-1.5 sm:gap-x-5 mt-5 sm:mt-6">
        {[m.homeTeam, m.awayTeam].map((t, i) => (
          <div key={t.id} className={cx('flex flex-col min-w-0', i === 1 && 'order-3')}>
            <div className="relative flex flex-col items-center min-w-0">
              <span aria-hidden className={cx('absolute inset-x-0 bottom-0 top-[44%] sm:top-[46%] transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0', i === 0 ? 'hero-panel-home' : 'hero-panel-away')} style={{ background: `linear-gradient(${i === 0 ? 90 : 270}deg, ${i === 0 ? HOME : AWAY}00 0%, ${i === 0 ? HOME : AWAY}59 42%, ${i === 0 ? HOME : AWAY}c7 100%)` }} />
              <Link to={teamHref(code, t.id)} className="relative flex flex-col items-center min-w-0 text-center w-full">
                <span className="crest-shadow"><Crest src={t.crest} name={t.name} size={96} minSize={50} /></span>
                <span className="mt-1.5 sm:mt-2 pb-2 sm:pb-3.5 font-extrabold tracking-tight leading-[1.05] text-[clamp(.9rem,4.2vw,1.2rem)] sm:text-[1.5rem] lg:text-[1.85rem] max-w-full px-1 [overflow-wrap:anywhere] text-shadow">{tn(t)}</span>
              </Link>
            </div>
            <SideScorers events={events} side={i === 0 ? 'home' : 'away'} />
          </div>
        ))}
        <div className="order-2 relative mt-3 sm:mt-5 rounded-2xl sm:rounded-3xl p-px shadow-[0_0_22px_-10px_rgba(255,255,255,.35)]" style={{ background: `linear-gradient(135deg, ${HOME}, rgba(255,255,255,.10) 45%, ${AWAY})` }}>
          <div className="rounded-[inherit] bg-[#050b24]/85 backdrop-blur-md text-center text-white px-3 pt-4 pb-2.5 sm:px-8 sm:pt-6 sm:pb-4 min-w-[88px] sm:min-w-[210px]">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10"><StatusChip m={m} tone="dark" /></div>
            {showScore ? (
              <span className="font-extrabold num leading-none tracking-tight text-[clamp(2rem,10vw,2.8rem)] sm:text-[3.9rem] inline-flex items-center justify-center" aria-label={`${s.h} to ${s.a}`}>
                {s.h}<span aria-hidden className="inline-block mx-[.16em] w-[.3em] h-[.085em] rounded-full bg-white/90" />{s.a}
              </span>
            ) : <VsCenter m={m} size="lg" onDark />}
            {sub}
          </div>
        </div>
      </div>

      {/* match information */}
      {foot.length > (foot[0]?.mobileOnly ? 1 : 0) || foot.length > 0 ? (
        <div className="mt-3 sm:mt-6 glass rounded-full px-3 py-2 sm:px-4 sm:py-3 flex flex-row items-center justify-center gap-y-0 sm:divide-x divide-white/20 text-[11.5px] sm:text-[13.5px] text-white/95">
          {foot.map((f) => (
            <span key={f.key} className={cx('flex items-center sm:justify-center gap-2.5 min-w-0 sm:px-7', f.mobileOnly && 'sm:hidden', f.desktopOnly && 'max-sm:hidden')}>
              <span className="shrink-0 opacity-90">{f.icon}</span><span className="truncate">{f.text}</span>
            </span>
          ))}
        </div>
      ) : null}
    </Banner>
  );
}
