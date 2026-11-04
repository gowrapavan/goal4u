import { useTeamColors } from '../../lib/team-colors';
import { YouTubePlayer } from '../YouTubePlayer';
import { useState } from 'react';
import { ExternalLink, MapPin, Play, Star, Tv, UserRound, Users } from 'lucide-react';
import { cx } from '../ui';
import { PlayerPhoto, RatingPill } from './LineupsUI';
import type { MatchDetails, Performer } from '../../lib/match-details-types';


const CAT_TAB: Record<string, string> = { Attack: 'Attacker', Midfield: 'Midfielder', Defence: 'Defender' };
const numOf = (v: string) => { const n = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : null; };

function Player({ p, team, color }: { p: Performer['home']; team?: string; color: string }) {
  if (!p) return <div className="flex flex-col items-center gap-1.5 text-center"><span className="w-14 h-14 sm:w-[76px] sm:h-[76px] rounded-full bg-surface-2 grid place-items-center text-muted text-xl">–</span><span className="text-xs text-muted">No data</span></div>;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center min-w-0">
      <span className="rounded-full p-[3px]" style={{ background: color }}><PlayerPhoto athleteId={p.athleteId} name={p.name} size={72} ring={false} tint={color} /></span>
      <span className="text-[13px] sm:text-sm font-bold leading-tight max-w-full [overflow-wrap:anywhere]">{p.name}</span>
      {team && <span className="text-[11px] text-muted leading-none max-w-full truncate">{team}</span>}
    </div>
  );
}

/** Top performers: pick Attacker / Midfielder / Defender; the two players stand either side of their numbers, one row per statistic. */
export function TopPerformers({ performers, potm, homeName, awayName }: { performers: Performer[]; potm?: MatchDetails['potm']; homeName?: string; awayName?: string }) {
  const [i, setI] = useState(0);
  const { home: HOME, away: AWAY, homeInk, awayInk } = useTeamColors();
  if (!performers.length && !potm) return null;
  const cur = performers[Math.min(i, performers.length - 1)];
  const labels: string[] = []; for (const p of [cur?.home, cur?.away]) for (const s of p?.stats ?? []) if (!labels.includes(s.label)) labels.push(s.label);
  const val = (p: Performer['home'], l: string) => p?.stats.find((s) => s.label === l)?.value ?? null;
  const pill = (v: string | null, win: boolean, side: 'home' | 'away') => <span className={cx('inline-flex items-center justify-center min-w-[2.75rem] h-7 px-2 rounded-md num text-sm font-bold', !win && 'bg-surface-2 text-ink border border-line')} style={win ? { background: side === 'home' ? HOME : AWAY, color: side === 'home' ? homeInk : awayInk } : undefined}>{v ?? '–'}</span>;
  return (
    <section className="card p-4 sm:p-5" aria-label="Top performers">
      <h3 className="display-wide text-base mb-4">Top performers</h3>
      {potm && (
        <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 mb-4 border" style={{ background: 'linear-gradient(90deg,rgba(250,204,21,.16),rgba(250,204,21,.04))', borderColor: 'rgba(250,204,21,.45)' }}>
          <PlayerPhoto athleteId={potm.athleteId} name={potm.name} size={46} tint={potm.team === 'home' ? HOME : AWAY} />
          <div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-wide text-[#a16207] inline-flex items-center gap-1"><Star size={11} fill="currentColor" /> Player of the match</p><p className="font-bold truncate">{potm.name}</p><p className="text-xs text-muted truncate">{potm.team === 'home' ? homeName : awayName}</p></div>
          {potm.rating != null && <RatingPill r={potm.rating} />}
        </div>
      )}
      {cur && (
        <>
          <div role="tablist" aria-label="Position" className="grid rounded-lg border border-line overflow-hidden text-sm font-semibold" style={{ gridTemplateColumns: `repeat(${performers.length}, minmax(0, 1fr))` }}>
            {performers.map((p, k) => <button key={p.category} role="tab" aria-selected={k === i} onClick={() => setI(k)} className={cx('h-10 px-2 truncate', k > 0 && 'border-l border-line', k === i ? 'bg-brand text-white' : 'text-muted hover:text-ink hover:bg-surface-2/70')}>{CAT_TAB[p.category] ?? p.category}</button>)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,8rem)] items-center gap-x-3 gap-y-5 sm:gap-4 mt-5">
            <div className="order-1"><Player p={cur.home} team={homeName} color={HOME} /></div>
            <div className="space-y-2.5 order-3 col-span-2 sm:order-2 sm:col-span-1">
              {labels.length === 0 && <p className="text-center text-xs text-muted">No figures for this position.</p>}
              {labels.map((l) => {
                const h = val(cur.home, l), a = val(cur.away, l), hn = h ? numOf(h) : null, an = a ? numOf(a) : null; const cmp = l !== 'Minutes' && hn !== null && an !== null && hn !== an;
                return (
                  <div key={l} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                    {pill(h, cmp && hn! > an!, 'home')}<span className="text-center text-[11px] sm:text-xs text-muted leading-tight">{l === 'Minutes' ? 'Min' : l}</span>{pill(a, cmp && an! > hn!, 'away')}
                  </div>
                );
              })}
            </div>
            <div className="order-2 sm:order-3"><Player p={cur.away} team={awayName} color={AWAY} /></div>
          </div>
        </>
      )}
    </section>
  );
}

function FanBar({ home, draw, away, homeName, awayName }: { home: number; draw: number; away: number; homeName: string; awayName: string }) {
  const { home: HOME, away: AWAY } = useTeamColors();
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={`Fan vote: ${homeName} ${home}%, draw ${draw}%, ${awayName} ${away}%`}>
        <span style={{ width: `${home}%`, background: HOME }} /><span className="bg-muted/50" style={{ width: `${draw}%` }} /><span style={{ width: `${away}%`, background: AWAY }} />
      </div>
      <div className="flex justify-between text-xs mt-1.5 num"><span className="font-bold" style={{ color: HOME }}>{home}%</span><span className="text-muted">Draw {draw}%</span><span className="font-bold" style={{ color: AWAY }}>{away}%</span></div>
    </div>
  );
}

/** The highlights video: a picture with a play button; one tap and it plays right here. If it cannot be embedded, the button becomes a link to YouTube. */
function HighlightsPlayer({ id, url }: { id: string; url: string }) {
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  if (playing && !blocked) return (
    <div className="relative rounded-xl overflow-hidden bg-black aspect-video w-full max-w-2xl">
      <YouTubePlayer videoId={id} title="Match highlights" autoplay onUnavailable={() => setBlocked(true)} />
    </div>
  );
  const body = (
    <>
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
      <span className="absolute inset-0 flex items-center justify-center"><span className="w-14 h-14 rounded-full bg-white/90 text-[#0d1220] inline-flex items-center justify-center"><Play size={26} fill="currentColor" /></span></span>
      <span className="absolute left-3 bottom-3 text-white text-sm font-semibold inline-flex items-center gap-1.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,.8)' }}>{blocked ? 'Watch on YouTube' : 'Match highlights'} {blocked && <ExternalLink size={13} />}</span>
    </>
  );
  const cls = 'group relative block w-full max-w-2xl rounded-xl overflow-hidden bg-black aspect-video text-left';
  return blocked
    ? <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
    : <button type="button" onClick={() => setPlaying(true)} className={cls} aria-label="Play match highlights">{body}</button>;
}

/** Venue, attendance, referee, broadcaster, the highlights video and the fan vote. */
export function MatchInfoCard({ d, homeName, awayName }: { d: MatchDetails; homeName: string; awayName: string }) {
  const { info, highlights, fans } = d;
  const rows = [
    info.venue && { icon: <MapPin size={15} />, label: 'Venue', value: info.venue },
    info.attendance && { icon: <Users size={15} />, label: 'Attendance', value: `${info.attendance.toLocaleString('en-US')}${info.capacity ? ` of ${info.capacity.toLocaleString('en-US')} (${Math.round((info.attendance / info.capacity) * 100)}%)` : ''}` },
    info.referee && { icon: <UserRound size={15} />, label: 'Referee', value: info.referee },
    info.tv && { icon: <Tv size={15} />, label: 'Broadcast', value: info.tv },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string }[];
  if (!rows.length && !highlights && !fans.win && !fans.goals) return null;
  return (
    <section className="card p-4 sm:p-5 space-y-5" aria-label="Match information">
      <h3 className="display-wide text-base">Match info</h3>
      {rows.length > 0 && <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">{rows.map((r) => <div key={r.label} className="flex items-start gap-2.5"><dt className="text-muted mt-0.5" aria-label={r.label}>{r.icon}</dt><dd><span className="block text-[11px] text-muted leading-none mb-0.5">{r.label}</span><span className="font-semibold">{r.value}</span></dd></div>)}</dl>}
      {highlights && (
        <HighlightsPlayer id={highlights.id} url={highlights.url} />
      )}
      {fans.win && <div><p className="text-xs font-semibold text-muted mb-2">Fans’ prediction · {fans.win.votes.toLocaleString('en-US')} votes</p><FanBar {...fans.win} homeName={homeName} awayName={awayName} /></div>}
      {fans.goals && (
        <div><p className="text-xs font-semibold text-muted mb-2">Over / under {fans.goals.line} goals · {fans.goals.votes.toLocaleString('en-US')} votes</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px]"><span className="bg-muted/50" style={{ width: `${fans.goals.under}%` }} /><span className="bg-brand" style={{ width: `${fans.goals.over}%` }} /></div>
          <div className="flex justify-between text-xs mt-1.5 num"><span className="text-muted">Under {fans.goals.under}%</span><span className="font-bold text-brand">Over {fans.goals.over}%</span></div></div>
      )}
    </section>
  );
}

/** "Ball in play 60:38 of 98:09" for the Stats tab. */
export function PlayTime({ t }: { t: MatchDetails['playTime'] }) {
  if (!t) return null;
  return (
    <div className="rounded-2xl bg-surface-2/60 px-4 py-3">
      <div className="flex justify-between items-baseline text-sm"><span className="font-semibold">Ball in play</span><span className="num text-muted"><b className="text-ink">{t.played}</b> of {t.total} · {Math.round(t.share * 100)}%</span></div>
      <div className="h-2 rounded-full bg-surface-2 mt-2 overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(t.share * 100)}%` }} /></div>
    </div>
  );
}
