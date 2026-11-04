import { useTeamColors } from '../../lib/team-colors';
import { ReactNode } from 'react';
import { holdLabel } from '../../lib/match-state';
import { Link } from 'react-router-dom';
import { Radio, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Crest, Skel, cx } from '../ui';
import { FMatch, MatchIntel, phase, matchHref, teamHref, tn, kickoff, shortDate, compByCode } from '../../lib/api';

type Team = MatchIntel['teams']['home'];
const tname = (t?: Team | null) => t?.shortName || t?.name || '—';
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th'}`;
const PILL: Record<string, string> = { W: 'bg-pitch text-white', D: 'bg-surface-2 text-ink', L: 'bg-live text-white' };

/* ───────── match-state strip: upcoming / started / live / finished ───────── */
export function StateStrip({ m }: { m: FMatch }) {
  const p = phase(m);
  const cfg: Record<string, { icon: ReactNode; tone: string; title: string; text: string }> = {
    upcoming: { icon: <Clock size={18} />, tone: 'border-brand text-brand', title: 'Match preview', text: 'Built from results played before kick-off. Events, line-ups and statistics appear once the match has been played.' },
    started: { icon: <Clock size={18} />, tone: 'border-muted text-muted', title: 'Kick-off delayed', text: 'Kick-off time has passed, but the live feed says play hasn’t started, so no score is shown. This page refreshes with the next data sync.' },
    live: { icon: <Radio size={18} />, tone: 'border-live text-live', title: 'Live', text: 'Score and status come from the live feed and update with each sync. Detailed events aren’t available during play.' },
    ft: { icon: <CheckCircle2 size={18} />, tone: 'border-pitch text-pitch', title: 'Full time', text: 'The result is confirmed. Pre-match context below was calculated from results before this fixture.' },
    pending: { icon: <AlertCircle size={18} />, tone: 'border-muted text-muted', title: 'Result not available yet', text: 'This match should have finished, but its result hasn’t reached the data feed.' },
    postponed: { icon: <AlertCircle size={18} />, tone: 'border-muted text-muted', title: holdLabel(m) ?? 'Postponed', text: m.status === 'SUSPENDED' ? 'Play was stopped, and the data feed has not reported a restart.' : m.status === 'CANCELLED' ? 'This match will not be played, according to the data feed.' : 'No new date is confirmed in the data feed.' },
  };
  const c = { ...cfg[p] };
  if (p === 'live' && m.status === 'PAUSED') { c.title = 'Half time'; c.text = 'The feed reports the interval. The score updates again when play resumes.'; }
  if (p === 'live' && (m.status === 'EXTRA_TIME' || m.status === 'PENALTY_SHOOTOUT')) c.title = holdLabel(m)!;
  if (p === 'ft' && m.status === 'AWARDED') { c.title = 'Result awarded'; c.text = 'The data feed lists this result as awarded rather than played on the pitch.'; }
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border-l-4 bg-surface-2/50 px-4 py-3', c.tone.split(' ')[0])}>
      <span className={cx('mt-0.5', c.tone.split(' ')[1])}>{c.icon}</span>
      <p className="text-sm leading-snug"><strong className="text-ink">{c.title}.</strong> <span className="text-muted">{c.text}</span></p>
    </div>
  );
}

/* ───────── comparison bars ───────── */
function CompareRow({ label, h, a, fmt = (n: number) => String(n), lowerBetter }: { label: string; h: number; a: number; fmt?: (n: number) => string; lowerBetter?: boolean }) {
  const t = h + a || 1;
  const lead = h === a ? '' : (h > a) !== !!lowerBetter ? 'h' : 'a';
  return (
    <div>
      <div className="flex items-baseline justify-between num">
        <span className={cx('display-wide text-lg', lead === 'h' && 'text-brand')}>{fmt(h)}</span>
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className={cx('display-wide text-lg', lead === 'a' && 'text-brand')}>{fmt(a)}</span>
      </div>
      <div className="flex gap-1 h-1.5 mt-1">
        <div className="flex-1 flex justify-end bg-surface-2 rounded-l-full overflow-hidden"><span className={cx('h-full rounded-l-full', lead === 'h' ? 'bg-brand' : 'bg-muted/40')} style={{ width: `${(h / t) * 100}%` }} /></div>
        <div className="flex-1 bg-surface-2 rounded-r-full overflow-hidden"><span className={cx('block h-full rounded-r-full', lead === 'a' ? 'bg-brand' : 'bg-muted/40')} style={{ width: `${(a / t) * 100}%` }} /></div>
      </div>
    </div>
  );
}

function TeamHead({ code, t, align }: { code: string; t: Team; align: 'left' | 'right' }) {
  return (
    <Link to={teamHref(code, t.id)} className={cx('flex items-center gap-2 min-w-0 font-bold hover:text-brand', align === 'right' && 'flex-row-reverse text-right')}>
      <Crest src={t.crest} name={t.name} size={28} /><span className="truncate">{tname(t)}</span>
    </Link>
  );
}

export function ComparePanel({ intel }: { intel: MatchIntel }) {
  const { home, away } = intel.teams;
  const hr = intel.table?.rows.find((r) => r.team.id === home.id), ar = intel.table?.rows.find((r) => r.team.id === away.id);
  const hs = intel.seasonRecords?.home, as = intel.seasonRecords?.away;
  const hf = intel.form.home.overall, af = intel.form.away.overall;
  const rows: ReactNode[] = [];
  if (hr && ar && (hr.playedGames > 0 || ar.playedGames > 0)) {
    const uh = hr.positionUncertain, ua = ar.positionUncertain;
    rows.push(
      <div key="pos" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center text-center">
        <div><p className={cx('display text-3xl sm:text-5xl num', hr.position < ar.position && 'text-brand')}>{uh ? '~' : ''}{ordinal(hr.position)}</p></div>
        <p className="text-[11px] sm:text-xs font-semibold text-muted px-1 sm:px-3 max-w-[72px] sm:max-w-none leading-tight">League position</p>
        <div><p className={cx('display text-3xl sm:text-5xl num', ar.position < hr.position && 'text-brand')}>{ua ? '~' : ''}{ordinal(ar.position)}</p></div>
      </div>,
      <CompareRow key="pts" label="Points" h={hr.points} a={ar.points} />,
    );
  }
  if (hs && as && hs.played > 0 && as.played > 0) {
    rows.push(
      <CompareRow key="gf" label="Goals scored / game" h={hs.goalsFor / hs.played} a={as.goalsFor / as.played} fmt={(n) => n.toFixed(1)} />,
      <CompareRow key="ga" label="Goals conceded / game" h={hs.goalsAgainst / hs.played} a={as.goalsAgainst / as.played} fmt={(n) => n.toFixed(1)} lowerBetter />,
    );
  }
  if (hf.count > 0 && af.count > 0) rows.push(<CompareRow key="form" label={`Form points (last ${Math.min(hf.count, af.count) < 5 ? `${hf.count}/${af.count}` : 5})`} h={hf.won * 3 + hf.draw} a={af.won * 3 + af.draw} />);
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4"><TeamHead code={intel.code} t={home} align="left" /><span className="text-xs font-bold text-muted">VS</span><TeamHead code={intel.code} t={away} align="right" /></div>
      {rows.length ? <div className="space-y-4">{rows}</div> : <p className="text-sm text-muted text-center py-4">Not enough completed matches yet to compare these teams.</p>}
      {intel.table && <p className="text-[11px] text-muted mt-4">Position and points are calculated by Goal4U from results before kick-off, not an official table.{intel.table.rows.some((r) => (r.team.id === home.id || r.team.id === away.id) && r.positionUncertain) ? ' “~” marks a club level on points with another, so its exact order is approximate.' : ''}</p>}
    </section>
  );
}

/* ───────── form with crests ───────── */
export function FormStrip({ intel }: { intel: MatchIntel }) {
  const side = (t: Team, f: MatchIntel['form']['home']['overall']) => (
    <div className="min-w-0 flex flex-col items-center text-center">
      <div className="flex items-center justify-center gap-2 mb-3 font-bold text-sm"><Crest src={t.crest} name={t.name} size={22} /><span className="truncate">{tname(t)}</span></div>
      {f.count ? (
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-2.5">
          {f.items.map((x) => (
            <span key={x.matchId} title={`${x.venue === 'H' ? 'vs' : 'at'} ${tname(x.opp)} ${x.gf}–${x.ga}`} className="flex flex-col items-center gap-1">
              <span className={cx('num grid place-items-center w-8 h-8 rounded-lg text-xs font-bold', PILL[x.result])}>{x.result}</span>
              <Crest src={x.opp.crest} name={x.opp.name} size={16} />
            </span>
          ))}
        </div>
      ) : <p className="text-xs text-muted">No earlier matches on record.</p>}
    </div>
  );
  return (
    <section className="card p-4 sm:p-5 h-full flex flex-col">
      <h3 className="display-wide text-base mb-4 text-center">Recent form</h3>
      <div className="flex-1 flex flex-col justify-around gap-5">{side(intel.teams.home, intel.form.home.overall)}<div className="h-px bg-line/70" />{side(intel.teams.away, intel.form.away.overall)}</div>
      <p className="text-[11px] text-muted mt-4 text-center">Oldest to newest, with each opponent’s crest. Hover a result for the score.</p>
    </section>
  );
}

/* ───────── head-to-head (with crests) ───────── */
export function H2HVisual({ intel }: { intel: MatchIntel }) {
  const d = intel.h2h; const { home, away } = intel.teams;
  const { home: HOME, away: AWAY } = useTeamColors();
  const t = d.meetings;
  // three columns built from the SAME rows (crest / number / label), so the draw column lines up with the two teams
  const col = (top: React.ReactNode, n: number | string, label: React.ReactNode, color?: string) => (
    <div className="flex flex-col items-center min-w-0">
      <div className="h-11 flex items-center justify-center">{top}</div>
      <p className={cx('display text-4xl sm:text-5xl num leading-none mt-2', !color && 'text-ink')} style={color ? { color } : undefined}>{n}</p>
      <p className="text-xs text-muted mt-2 truncate max-w-full">{label}</p>
    </div>
  );
  const dash = <span className="display text-xl text-muted/70">–</span>;
  return (
    <section className="card p-4 sm:p-5 h-full flex flex-col" aria-label="Head to head">
      <h3 className="display-wide text-base mb-4">Head to head</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_minmax(0,1fr)] items-start gap-2 text-center">
        {col(<Crest src={home.crest} name={home.name} size={44} />, t ? d.teamAWins : 0, tname(home), t ? HOME : undefined)}
        {col(<span className="text-[11px] font-bold tracking-widest text-muted">DRAWS</span>, t ? d.draws : 0, 'level')}
        {col(<Crest src={away.crest} name={away.name} size={44} />, t ? d.teamBWins : 0, tname(away), t ? AWAY : undefined)}
      </div>
      <div className="mt-auto pt-5">
        {t ? (
          <>
            <div className="flex h-2 rounded-full overflow-hidden gap-[2px]"><span style={{ width: `${(d.teamAWins / t) * 100}%`, background: HOME }} /><span className="bg-muted/40" style={{ width: `${(d.draws / t) * 100}%` }} /><span style={{ width: `${(d.teamBWins / t) * 100}%`, background: AWAY }} /></div>
            <p className="text-xs text-muted mt-2 num">{t} meeting{t === 1 ? '' : 's'} · goals {d.teamAGoals}–{d.teamBGoals} · regular-time scores only</p>
          </>
        ) : (
          <div className="rounded-xl bg-surface-2/60 px-3 py-2.5 text-center">
            <p className="text-sm font-semibold">First meeting on record</p>
            <p className="text-xs text-muted mt-0.5">No earlier games between these two in {intel.h2hScope.replace(/\s*held in Goal4U data\.?$/i, '')}.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────── related previous meetings ───────── */
export function RelatedMeetings({ intel, current }: { intel: MatchIntel; current: string }) {
  const list = intel.h2h.last.slice(0, 3);
  if (!list.length) return null;
  return (
    <section className="card overflow-hidden">
      <h3 className="display-wide text-base px-4 pt-4 pb-2">Previous meetings</h3>
      <div className="divide-y divide-line/70">
        {list.map((x) => (
          <Link key={x.matchId} to={matchHref({ id: x.matchId, code: x.code, seasonSlug: x.season })} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 px-4 py-3 text-sm hover:bg-surface-2/60 transition-colors">
            <span className="col-span-3 sm:col-span-1 flex sm:block items-center gap-1.5 text-[11px] text-muted leading-tight">{new Date(x.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}<span className="sm:block max-sm:before:content-['·'] max-sm:before:mr-1.5">{compByCode(x.code)?.short || x.code}</span></span>
            <span className="flex max-sm:flex-col-reverse max-sm:text-center items-center sm:justify-end gap-1.5 sm:gap-2 min-w-0"><span className="sm:truncate max-sm:line-clamp-2 max-sm:text-[13px] max-sm:leading-tight font-medium">{tname(x.home)}</span><Crest src={x.home.crest} name={x.home.name} size={22} /></span>
            <span className="display-wide num px-1 text-base sm:text-[1.05rem] whitespace-nowrap">{x.homeGoals}–{x.awayGoals}</span>
            <span className="flex max-sm:flex-col max-sm:text-center items-center gap-1.5 sm:gap-2 min-w-0"><Crest src={x.away.crest} name={x.away.name} size={22} /><span className="sm:truncate max-sm:line-clamp-2 max-sm:text-[13px] max-sm:leading-tight font-medium">{tname(x.away)}</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ───────── next fixtures for each team ───────── */
export function NextFixtures({ m, next, loading }: { m: FMatch; next: { home: FMatch[]; away: FMatch[] } | null; loading: boolean }) {
  const col = (t: FMatch['homeTeam'], list: FMatch[]) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2 font-bold text-sm"><Crest src={t.crest} name={t.name} size={22} /><span className="truncate">{tn(t)}</span></div>
      {loading ? <Skel className="h-24" /> : list.length ? (
        <ul className="divide-y divide-line/70 rounded-xl border border-line overflow-hidden">
          {list.map((x) => {
            const opp = x.homeTeam.id === t.id ? x.awayTeam : x.homeTeam; const home = x.homeTeam.id === t.id;
            return (
              <li key={x.id}><Link to={matchHref(x)} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-2/60 text-sm">
                <span className="w-14 shrink-0 text-[11px] leading-tight text-muted"><span className="block font-semibold text-ink num">{shortDate(x.utcDate)}</span>{kickoff(x.utcDate)}</span>
                <Crest src={opp.crest} name={opp.name} size={22} /><span className="flex-1 min-w-0"><span className="block truncate font-medium">{home ? 'vs' : 'at'} {tn(opp)}</span><span className="block sm:hidden text-[11px] font-semibold text-muted truncate">{compByCode(x.code)?.short ?? ''}</span></span>
                <span className="hidden sm:block text-[11px] font-semibold text-muted shrink-0">{compByCode(x.code)?.short ?? ''}</span>
              </Link></li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-muted">No further fixtures scheduled in the data yet.</p>}
    </div>
  );
  return (
    <section className="card p-4 sm:p-5">
      <h3 className="display-wide text-base mb-3">Coming up</h3>
      <div className="grid md:grid-cols-2 gap-5">{col(m.homeTeam, next?.home || [])}{col(m.awayTeam, next?.away || [])}</div>
    </section>
  );
}
