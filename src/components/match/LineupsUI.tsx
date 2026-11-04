import { useEffect, useMemo, useState } from 'react';
import { ErrorState, LineupSkel } from '../states';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Binoculars, ChevronRight, Star, Users, X } from 'lucide-react';
import { Crest, Empty, PlayerImg, Skel, cx } from '../ui';
import { useTeamColors } from '../../lib/team-colors';
import { BallIcon, BootIcon, CardIcon } from './EventIcons';
import { bothTeamsLayout, fromLegacyLineup, playerPhoto, ratingTone, type DetailsResponse, type MatchDetails, type MissingDetail, type PlayerDetail, type RatingTone, type ShotDetail, type TeamDetail } from '../../lib/match-details-types';

type Team = { name: string; crest?: string | null };
const TONE: Record<RatingTone, { bg: string; fg: string }> = {
  blue: { bg: '#0035be', fg: '#fff' }, green: { bg: '#16a34a', fg: '#fff' }, amber: { bg: '#f59e0b', fg: '#1b1300' }, red: { bg: '#ef4444', fg: '#fff' }, none: { bg: '#64748b', fg: '#fff' },
};
const lastName = (n: string) => { const p = n.trim().split(/\s+/); return p.length < 2 ? n : p[p.length - 1]; };
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** True while the viewport matches the media query (phones: the pitch turns upright). */
function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setOn(m.matches); f(); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, [q]);
  return on;
}

export function RatingPill({ r, small }: { r: number | null; small?: boolean }) {
  if (r == null) return null; const t = TONE[ratingTone(r)];
  return <span className={cx('num font-bold rounded-full leading-none inline-flex items-center justify-center', small ? 'text-[10px] h-[15px] px-1.5' : 'text-[11px] h-[18px] px-2')} style={{ background: t.bg, color: t.fg }}>{r.toFixed(1)}</span>;
}

/** The player headshot from the data repo (public/headshot/{id}.png); the initials on a coloured disc when there is no id or no file. */
export function PlayerPhoto({ athleteId, name, size = 48, ring = true, tint = '#0035be' }: { athleteId: number | null; name: string; size?: number; ring?: boolean; tint?: string }) {
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-white', ring && 'ring-2 ring-white shadow')} style={{ width: size, height: size }}>
      <PlayerImg id={athleteId} alt={name} size={size} className="w-full h-full object-cover"
        fallback={<span className="w-full h-full inline-flex items-center justify-center font-bold text-white" style={{ background: tint, fontSize: Math.max(10, size * 0.34) }}>{initials(name)}</span>} />
    </span>
  );
}

const Dot = ({ children, title, className }: { children: React.ReactNode; title: string; className?: string }) => <span title={title} className={cx('inline-flex items-center justify-center w-[18px] h-[18px] relative drop-shadow-[0_1px_1px_rgba(0,0,0,.55)]', className)}>{children}</span>;

function Badges({ p, potm }: { p: PlayerDetail; potm: boolean }) {
  return (
    <>
      {p.subbedOffAt != null && <span title={`Substituted off, ${p.subbedOffAt}'`} className="absolute -top-1 -left-1.5 inline-flex items-center justify-center rounded-full w-[15px] h-[15px] bg-[#ef4444] text-white ring-1 ring-black/30"><ArrowDown size={10} strokeWidth={3} /></span>}
      <span className="absolute -top-1 -right-2 flex flex-col gap-[2px] items-center">
        {p.goals > 0 && <Dot title={`${p.goals} goal${p.goals > 1 ? 's' : ''}`}><BallIcon size={18} />{p.goals > 1 && <span className="absolute -right-1.5 -top-1.5 min-w-[11px] h-[11px] rounded-full bg-[#0d1220] text-white text-[8px] leading-[11px] text-center font-bold">{p.goals}</span>}</Dot>}
        {p.ownGoals > 0 && <Dot title="Own goal" className="rounded-full ring-2 ring-red-500"><BallIcon size={16} /></Dot>}
        {p.assists > 0 && <Dot title={`${p.assists} assist${p.assists > 1 ? 's' : ''}`}><BootIcon size={18} /></Dot>}
        {p.yellow > 0 && <CardIcon className="!w-[9px] !h-[13px]" />}
        {p.red > 0 && <CardIcon red className="!w-[9px] !h-[13px]" />}
        {potm && <Dot title="Player of the match"><Star size={16} fill="#facc15" stroke="#0d1220" strokeWidth={1.2} /></Dot>}
      </span>
    </>
  );
}

function PitchLines({ vertical }: { vertical: boolean }) {
  const sw = { fill: 'none', stroke: '#fff', strokeOpacity: 0.6, strokeWidth: 0.35 } as const;
  return vertical ? (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 68 178" preserveAspectRatio="none" aria-hidden>
      <g {...sw}><rect x="2" y="2" width="64" height="174" /><line x1="2" y1="89" x2="66" y2="89" /><circle cx="34" cy="89" r="9" />
        <rect x="14" y="2" width="40" height="16.5" /><rect x="24" y="2" width="20" height="5.5" /><path d="M27.5 18.5a9 9 0 0 0 13 0" />
        <rect x="14" y="159.5" width="40" height="16.5" /><rect x="24" y="170.5" width="20" height="5.5" /><path d="M27.5 159.5a9 9 0 0 1 13 0" /></g>
    </svg>
  ) : (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden>
      <g {...sw}><rect x="2" y="2" width="101" height="64" /><line x1="52.5" y1="2" x2="52.5" y2="66" /><circle cx="52.5" cy="34" r="9" />
        <rect x="2" y="14" width="16.5" height="40" /><rect x="2" y="24" width="5.5" height="20" /><path d="M18.5 27.5a9 9 0 0 1 0 13" />
        <rect x="86.5" y="14" width="16.5" height="40" /><rect x="97.5" y="24" width="5.5" height="20" /><path d="M86.5 27.5a9 9 0 0 0 0 13" /></g>
    </svg>
  );
}

function Chip({ p, team, x, y, size, potm, onPick }: { p: PlayerDetail; team: 'home' | 'away'; x: number; y: number; size: number; potm: boolean; onPick: () => void }) {
  const { home: HOME_C, away: AWAY_C } = useTeamColors();
  return (
    <button onClick={onPick} aria-label={`${p.name}${p.rating ? `, rating ${p.rating}` : ''}. Open statistics`} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group focus:outline-none" style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="relative inline-block transition-transform group-hover:scale-110 group-focus-visible:scale-110">
        <span className="block rounded-full p-[2px]" style={{ background: team === 'home' ? HOME_C : AWAY_C }}><PlayerPhoto athleteId={p.athleteId} name={p.name} size={size} ring={false} tint={team === 'home' ? '#2a5fd6' : '#c47d0e'} /></span>
        {p.rating != null && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2"><RatingPill r={p.rating} small /></span>}
        <Badges p={p} potm={potm} />
      </span>
      <span className="mt-2.5 max-w-[56px] sm:max-w-[84px] truncate text-[9.5px] sm:text-xs font-semibold text-white leading-none rounded-full bg-black/35 px-1.5 py-[3px] sm:bg-transparent sm:px-0 sm:py-0 sm:leading-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,.85)' }}>{lastName(p.name)}</span>
    </button>
  );
}

/** Both teams on one pitch: landscape on wide screens, upright on phones. Drawn in the site's own style (light page, the shot-map green). */
function BothPitch({ home, away, homeName, awayName, potm, onPick }: { home: TeamDetail | null; away: TeamDetail | null; homeName: Team; awayName: Team; potm: MatchDetails['potm']; onPick: (p: PlayerDetail, team: 'home' | 'away') => void }) {
  const { home: HOME_C, away: AWAY_C } = useTeamColors();
  const vertical = useMedia('(max-width: 639px)');
  const placed = useMemo(() => bothTeamsLayout(home, away, vertical), [home, away, vertical]);
  const size = vertical ? 30 : 48;
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1.5 mb-3">
        <span className="flex items-center gap-1.5 min-w-0"><Crest src={homeName.crest} name={homeName.name} size={22} /><span className="font-bold text-[13px] sm:text-base truncate">{homeName.name}</span></span>
        <span className="text-center leading-tight col-span-2 order-last sm:col-span-1 sm:order-none"><span className="block text-[10px] tracking-[.18em] text-muted font-semibold uppercase">Formations</span><span className="num text-sm font-bold"><span style={{ color: HOME_C }}>{home?.formation ?? '–'}</span><span className="text-muted mx-2">·</span><span style={{ color: AWAY_C }}>{away?.formation ?? '–'}</span></span></span>
        <span className="flex items-center gap-1.5 min-w-0 justify-end"><span className="font-bold text-[13px] sm:text-base truncate text-right">{awayName.name}</span><Crest src={awayName.crest} name={awayName.name} size={22} /></span>
      </div>
      <div className="relative w-full rounded-xl overflow-hidden select-none" style={{ aspectRatio: vertical ? '68 / 178' : '105 / 68', background: vertical ? 'repeating-linear-gradient(180deg,#23925a 0 10%,#1d8450 10% 20%)' : 'repeating-linear-gradient(90deg,#23925a 0 10%,#1d8450 10% 20%)' }}>
        <PitchLines vertical={vertical} />
        {placed.map(({ player, team, x, y }) => <Chip key={`${team}-${player.id}`} p={player} team={team} x={x} y={y} size={size} potm={!!potm && potm.team === team && potm.athleteId != null && potm.athleteId === player.athleteId} onPick={() => onPick(player, team)} />)}
      </div>
      <p className="text-center text-[11px] text-muted mt-2">Tap a player for their match statistics and heatmap.</p>
    </div>
  );
}

/* ───────── the pop-up with one player's match ───────── */
const OUTCOME_L: Record<ShotDetail['outcome'], string> = { goal: 'Goal', saved: 'Saved', off: 'Off target', blocked: 'Blocked', post: 'Hit the post' };

function Heatmap({ url }: { url: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return (
    <section>
      <h4 className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Heatmap</h4>
      <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: '3 / 2', background: 'repeating-linear-gradient(90deg,#1f6f47 0 10%,#1a6340 10% 20%)' }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden><g fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth=".35"><rect x="2" y="2" width="101" height="64" /><line x1="52.5" y1="2" x2="52.5" y2="66" /><circle cx="52.5" cy="34" r="9" /><rect x="2" y="14" width="16.5" height="40" /><rect x="86.5" y="14" width="16.5" height="40" /></g></svg>
        <img src={url} alt="Heatmap of where this player was on the pitch" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 w-full h-full object-contain" />
      </div>
      <p className="text-[11px] text-muted mt-1.5">Where the player was most active during the match.</p>
    </section>
  );
}

function PlayerSheet({ p, team, teamName, shots, potm, onClose }: { p: PlayerDetail; team: 'home' | 'away'; teamName: string; shots: ShotDetail[]; potm: boolean; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [onClose]);
  const mine = shots.filter((s) => s.team === team && s.player === p.name);
  const chips = [
    p.minutes != null && { l: 'Minutes', v: String(p.minutes) }, p.goals > 0 && { l: 'Goals', v: String(p.goals) }, p.assists > 0 && { l: 'Assists', v: String(p.assists) },
    p.yellow > 0 && { l: 'Yellow', v: String(p.yellow) }, p.red > 0 && { l: 'Red', v: String(p.red) }, p.ownGoals > 0 && { l: 'Own goals', v: String(p.ownGoals) },
  ].filter(Boolean) as { l: string; v: string }[];
  const { home: HOME_C, away: AWAY_C } = useTeamColors();
  const tint = team === 'home' ? HOME_C : AWAY_C;
  const profile = p.athleteId ? `/player/${p.athleteId}` : null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`${p.name} match statistics`}>
      <button className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} aria-label="Close" tabIndex={-1} />
      {/* The sheet itself never scrolls: header and footer stay put, only the middle scrolls (thin themed scrollbar). */}
      <div className="relative w-full sm:max-w-xl max-h-[90vh] sm:max-h-[86vh] flex flex-col overflow-hidden bg-surface text-ink rounded-t-2xl sm:rounded-2xl shadow-2xl border border-line">
        <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 flex items-center gap-3.5 border-b border-line" style={{ background: `linear-gradient(135deg, ${tint}1f 0%, transparent 70%)` }}>
          <span className="block rounded-full p-[3px] shrink-0" style={{ background: tint }}><PlayerPhoto athleteId={p.athleteId} name={p.name} size={64} ring={false} tint={team === 'home' ? '#2a5fd6' : '#c47d0e'} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-lg sm:text-xl leading-tight truncate">{p.name}</p>
            <p className="text-xs text-muted truncate mt-0.5">{[p.number && `#${p.number}`, p.role, teamName].filter(Boolean).join(' · ')}</p>
            {potm && <p className="text-[11px] font-semibold mt-1 inline-flex items-center gap-1 text-[#a16207]"><Star size={11} fill="currentColor" /> Player of the match</p>}
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0"><RatingPill r={p.rating} /><span className="text-[10px] uppercase tracking-wide text-muted">Rating</span></div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full hover:bg-surface-2 inline-flex items-center justify-center" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="thin-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-6">
          {(chips.length > 0 || p.subbedOnAt != null || p.subbedOffAt != null) && (
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => <span key={c.l} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs"><span className="text-muted">{c.l} </span><b className="num">{c.v}</b></span>)}
              {p.subbedOnAt != null && <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"><ArrowUp size={12} />On {p.subbedOnAt}'</span>}
              {p.subbedOffAt != null && <span className="rounded-full bg-red-500/10 text-red-500 px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"><ArrowDown size={12} />Off {p.subbedOffAt}'</span>}
            </div>
          )}
          {p.heatmap && <Heatmap url={p.heatmap} />}
          <section>
            <h4 className="text-[11px] font-bold uppercase tracking-[.14em] text-muted mb-2.5">Match statistics</h4>
            {p.stats.length > 0
              ? <dl className="grid grid-cols-1 min-[460px]:grid-cols-2 gap-2">{p.stats.map((s) => <div key={s.label} className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/60 px-3 py-2"><dt className="text-[13px] text-muted leading-tight">{s.label}</dt><dd className="font-bold num text-sm text-right shrink-0">{s.value}</dd></div>)}</dl>
              : <p className="text-sm text-muted">No match statistics were recorded for this player.</p>}
          </section>
          {mine.length > 0 && (
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-[.14em] text-muted mb-2.5">Shots ({mine.length})</h4>
              <ul className="space-y-2">{mine.map((s, i) => <li key={i} className="flex items-center gap-3 text-sm rounded-xl bg-surface-2/60 px-3 py-2"><span className="num font-bold w-9 shrink-0">{s.minute}'</span><span className={cx('font-semibold shrink-0', s.outcome === 'goal' && 'text-emerald-600')}>{OUTCOME_L[s.outcome]}</span><span className="text-muted text-xs truncate">{[s.body, s.situation].filter(Boolean).join(' · ')}</span><span className="ml-auto num text-xs shrink-0">xG <b>{s.xg.toFixed(2)}</b></span></li>)}</ul>
            </section>
          )}
        </div>

        {profile && (
          <div className="shrink-0 border-t border-line bg-surface px-4 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link to={profile} onClick={onClose} className="group flex items-center justify-center gap-2 w-full h-11 rounded-full bg-brand text-brand-ink font-semibold text-sm hover:brightness-110 transition-opacity">
              <Binoculars size={18} aria-hidden /> More player info <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── sections under the pitch, one column per team ───────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h4 className="text-[11px] font-bold uppercase tracking-[.14em] text-muted mb-2">{title}</h4>{children}</section>; }

function Subs({ team, tint, open }: { team: TeamDetail; tint: string; open: (p: PlayerDetail) => void }) {
  if (!team.subs.length) return null;
  return (
    <Section title="Substitutions">
      <div className="space-y-1.5">{team.subs.map((s, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2">
          <span className="num text-xs font-bold text-muted w-8 shrink-0">{s.minute}'</span>
          <button onClick={() => open(s.playerIn)} className="shrink-0"><PlayerPhoto athleteId={s.playerIn.athleteId} name={s.playerIn.name} size={34} ring={false} tint={tint} /></button>
          <div className="min-w-0 text-sm leading-tight flex-1">
            <p className="font-semibold truncate flex items-center gap-1 text-[#16a34a]"><ArrowUp size={12} className="shrink-0" /><span className="truncate">{s.playerIn.name}</span></p>
            <p className="text-muted truncate flex items-center gap-1"><ArrowDown size={12} className="text-[#ef4444] shrink-0" /><span className="truncate">{s.playerOut.name}</span></p>
          </div>
          <RatingPill r={s.playerIn.rating} small />
        </div>))}
      </div>
    </Section>
  );
}

function Bench({ team, tint, open }: { team: TeamDetail; tint: string; open: (p: PlayerDetail) => void }) {
  if (!team.bench.length) return null;
  return (
    <Section title="Bench">
      <div className="grid grid-cols-2 gap-1.5">{team.bench.map((p) => (
        <button key={p.id} onClick={() => open(p)} className={cx('flex items-center gap-2 rounded-xl border border-line px-2 py-1.5 text-left hover:bg-surface-2/60 transition-colors min-w-0', p.subbedOnAt == null && 'opacity-70')}>
          <PlayerPhoto athleteId={p.athleteId} name={p.name} size={28} ring={false} tint={tint} />
          <span className="min-w-0 text-[11px] leading-tight flex-1"><span className="block font-semibold truncate">{p.name}</span><span className="block text-muted truncate">{p.subbedOnAt != null ? <span className="text-[#16a34a] font-semibold">On {p.subbedOnAt}'</span> : p.role ?? '—'}</span></span>
          {p.rating != null && <RatingPill r={p.rating} small />}
        </button>))}
      </div>
    </Section>
  );
}

function Missing({ list, tint }: { list: MissingDetail[]; tint: string }) {
  if (!list.length) return null;
  return (
    <Section title="Unavailable">
      <div className="space-y-1.5">{list.map((m, i) => {
        const se = m.season; const seasonTxt = se ? [se.appearances != null && `${se.appearances} app${se.appearances === 1 ? '' : 's'}`, se.goals ? `${se.goals} goal${se.goals === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') : '';
        return (
          <div key={i} className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2">
            <PlayerPhoto athleteId={m.athleteId} name={m.name} size={32} ring={false} tint={tint} />
            <div className="min-w-0 text-sm leading-tight flex-1"><p className="font-semibold truncate">{m.name}</p>
              <p className="text-xs text-muted truncate"><span className={cx('font-semibold', m.kind === 'suspension' ? 'text-[#b45309]' : 'text-[#dc2626]')}>{m.reason ?? 'Unavailable'}</span>{m.expectedReturn ? ` · ${m.expectedReturn}` : ''}</p></div>
            {seasonTxt && <span className="text-[10px] text-muted text-right shrink-0 leading-tight">This season<br /><b className="text-ink">{seasonTxt}</b></span>}
          </div>);
      })}</div>
    </Section>
  );
}

function TeamColumn({ t, team, info, tint, open }: { t: TeamDetail; team: Team; info: boolean; tint: string; open: (p: PlayerDetail) => void }) {
  return (
    <div className="space-y-5 min-w-0">
      <h3 className="flex items-center gap-2 font-bold text-base"><Crest src={team.crest} name={team.name} size={22} /><span className="truncate">{team.name}</span>{t.formation && <span className="num text-xs text-muted font-semibold">{t.formation}</span>}</h3>
      {t.coach && <Section title="Coach"><div className="flex items-center gap-3 rounded-xl border border-line px-2.5 py-2"><PlayerPhoto athleteId={t.coach.athleteId} name={t.coach.name} size={34} ring={false} tint={tint} /><p className="text-sm font-semibold truncate">{t.coach.name}</p></div></Section>}
      {info && <Subs team={t} tint={tint} open={open} />}
      <Bench team={t} tint={tint} open={open} />
      <Missing list={t.missing} tint={tint} />
    </div>
  );
}

const WHY: Record<string, string> = {
  not_yet: 'Line-ups are published about an hour before kick-off.', no_mapping: 'This match couldn’t be paired with the line-up feed yet.',
  upstream_unavailable: 'The line-up feed couldn’t be reached just now. Please try again in a minute.', mismatch: 'The feed returned a different match, so nothing is shown rather than the wrong players.',
};

/**
 * The Line-ups tab. Built from stats.json first (live feed only fills gaps); with neither, the legacy line-up is drawn from its formation.
 * Both teams share one pitch; tapping a player opens a pop-up with their statistics, heatmap and shots.
 */
export function LineupsTab({ details, loading, legacy, home, away, failed, onRetry }: { details: DetailsResponse | null | undefined; loading: boolean; failed?: boolean; onRetry?: () => void; legacy: { home: any; away: any } | null | undefined; home: Team; away: Team }) {  const { home: HOME_C, away: AWAY_C } = useTeamColors();

  const [pick, setPick] = useState<{ p: PlayerDetail; team: 'home' | 'away' } | null>(null);
  const rich = details?.available ? details.details : null;
  const h = rich?.home?.starters.length ? rich.home : fromLegacyLineup(legacy?.home);
  const a = rich?.away?.starters.length ? rich.away : fromLegacyLineup(legacy?.away);
  if (loading && !h && !a) return <LineupSkel />;
  if (!h && !a && failed) return <ErrorState title="Line-ups couldn’t be loaded" hint="The line-up request didn’t go through. This is different from a line-up not being announced." onRetry={onRetry} />;
  if (!h && !a) return <Empty icon={Users} title="Line-ups aren’t available" hint={details && details.available === false ? WHY[details.reason] : 'No line-up has been published for this match.'} />;
  const potm = rich?.potm ?? null;
  const potmHere = (p: PlayerDetail, team: 'home' | 'away') => !!potm && potm.team === team && potm.athleteId != null && potm.athleteId === p.athleteId;
  return (
    <div className="space-y-6">
      <BothPitch home={h} away={a} homeName={home} awayName={away} potm={potm} onPick={(p, team) => setPick({ p, team })} />
      {!rich && <p className="text-center text-xs text-muted -mt-3">Positions, photos and substitution minutes aren’t available for this match, so the line-up is drawn from its formation.</p>}
      {rich?.source === 'mixed' && <p className="text-center text-[11px] text-muted -mt-3">Some details were filled in from the live feed.</p>}
      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-8">
        {h && <TeamColumn t={h} team={home} info={!!rich} tint={HOME_C} open={(p) => setPick({ p, team: 'home' })} />}
        {a && <TeamColumn t={a} team={away} info={!!rich} tint={AWAY_C} open={(p) => setPick({ p, team: 'away' })} />}
      </div>
      {pick && <PlayerSheet p={pick.p} team={pick.team} teamName={pick.team === 'home' ? home.name : away.name} shots={rich?.shots ?? []} potm={potmHere(pick.p, pick.team)} onClose={() => setPick(null)} />}
    </div>
  );
}
