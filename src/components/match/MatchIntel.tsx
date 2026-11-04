import { Link } from 'react-router-dom';
import { ErrorState, SkelGroup } from '../states';
import { Crest, Empty, Skel, cx } from '../ui';
import { teamHref, type MatchIntel, compByCode } from '../../lib/api';

type Team = MatchIntel['teams']['home'];
const tname = (t?: Team | null) => t?.shortName || t?.name || '—';
const seasonLabel = (s: string) => s.replace(/^(\d{4})-(\d{4})$/, (_, a, b) => `${a}/${b.slice(2)}`);
const monthYear = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const note = 'text-xs text-muted leading-relaxed';

export function IntelLoading() { return <SkelGroup label="Loading match insights" className="space-y-4"><Skel className="h-24" /><Skel className="h-48" /></SkelGroup>; }
export function IntelError({ onRetry }: { onRetry?: () => void }) { return <ErrorState title="Match insights couldn’t be loaded" hint="The rest of this page is unaffected." onRetry={onRetry} />; }

/* ───────── Summary: deterministic fact sentences ───────── */
export function FactList({ intel }: { intel: MatchIntel }) {
  if (!intel.facts.length && !intel.notes.length) return null;
  return (
    <div className="mb-6">
      {intel.facts.length > 0 && (
        <ul className="space-y-2 text-[15px] leading-relaxed">
          {intel.facts.map((f, i) => <li key={i} className="pl-3 border-l-[3px] border-brand/70">{f}</li>)}
        </ul>
      )}
      {intel.notes.map((n, i) => <p key={i} className={cx(note, 'mt-2')}>{n}</p>)}
    </div>
  );
}

/* ───────── Form ───────── */
const PILL: Record<string, string> = { W: 'bg-pitch text-white', D: 'bg-surface-2 text-ink', L: 'bg-live text-white' };
function FormRow({ title, f, season }: { title: string; f: MatchIntel['form']['home']['overall']; season: string }) {
  if (!f.count) return <p className={note}>{title}: no earlier matches on record.</p>;
  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {f.items.map((x) => (
          <span key={x.matchId} title={`${x.venue === 'H' ? 'vs' : 'at'} ${tname(x.opp)} ${x.gf}–${x.ga} · ${monthYear(x.date)}`} className={cx('num grid place-items-center w-7 h-7 rounded-md text-xs font-bold', PILL[x.result])}>{x.result}</span>
        ))}
        <span className="text-sm text-muted ml-1 num">{f.won}W {f.draw}D {f.lost}L · {f.goalsFor}–{f.goalsAgainst}{f.pointsPerMatch != null ? ` · ${f.pointsPerMatch.toFixed(2)} pts/match` : ''}</span>
      </div>
      <p className={cx(note, 'mt-1')}>{title}{f.count < f.requested ? ` — only ${f.count} on record` : ''}{f.crossSeason ? ` · includes ${seasonLabel([...new Set(f.items.map((i) => i.season))].filter((s) => s !== season).sort().join(', '))}` : ''}</p>
    </div>
  );
}
export function FormPanel({ intel }: { intel: MatchIntel }) {
  const side = (t: Team, k: 'home' | 'away') => (
    <div className="space-y-3 min-w-0">
      <Link to={teamHref(intel.code, t.id)} className="inline-flex items-center gap-2 font-bold hover:text-brand"><Crest src={t.crest} name={t.name} size={22} />{tname(t)}</Link>
      <FormRow title="Last 5, all matches" f={intel.form[k].overall} season={intel.season} />
      <FormRow title={k === 'home' ? 'Last 5 at home' : 'Last 5 away'} f={intel.form[k].venue} season={intel.season} />
    </div>
  );
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-6">{side(intel.teams.home, 'home')}{side(intel.teams.away, 'away')}</div>
      <p className={cx(note, 'mt-3')}>Oldest to newest, before this match. Scope: {intel.form.scope}. Hover a result for the score.</p>
    </div>
  );
}

/* ───────── League table as of kickoff ───────── */
export function TablePanel({ intel }: { intel: MatchIntel }) {
  const t = intel.table;
  if (!t) return intel.tableNote ? <p className={note}>{intel.tableNote}</p> : null;
  const ids = [intel.teams.home.id, intel.teams.away.id];
  const th = 'font-semibold text-muted text-[11px] py-2 px-1.5 text-center';
  const uncertain = t.rows.some((r) => ids.includes(r.team.id) && r.positionUncertain);
  return (
    <div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm num">
          <thead><tr className="border-b border-line">
            <th className={cx(th, 'w-8')}>#</th><th className={cx(th, 'text-left')}>Club</th><th className={th}>P</th>
            <th className={cx(th, 'hidden sm:table-cell')}>W</th><th className={cx(th, 'hidden sm:table-cell')}>D</th><th className={cx(th, 'hidden sm:table-cell')}>L</th>
            <th className={th}>GD</th><th className={cx(th, 'pr-2')}>Pts</th>
          </tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.team.id} className={cx('border-b border-line/70 last:border-0', ids.includes(r.team.id) && 'bg-brand-soft')}>
                <td className="text-center font-bold text-[13px] py-2">{r.position}</td>
                <td className="px-1.5"><Link to={teamHref(intel.code, r.team.id)} className="flex items-center gap-2 min-w-0 font-semibold hover:text-brand"><Crest src={r.team.crest} name={r.team.name} size={20} /><span className="truncate max-w-[150px] sm:max-w-none">{tname(r.team)}</span></Link></td>
                <td className="text-center text-muted">{r.playedGames}</td>
                <td className="text-center hidden sm:table-cell">{r.won}</td><td className="text-center hidden sm:table-cell">{r.draw}</td><td className="text-center hidden sm:table-cell">{r.lost}</td>
                <td className="text-center text-muted">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                <td className="text-center pr-2 font-bold display-wide">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={cx(note, 'mt-3')}>
        Calculated by Goal4U from {t.completedMatches} completed {t.completedMatches === 1 ? 'result' : 'results'} before kickoff — not an official table. Clubs have played {t.played.min === t.played.max ? t.played.min : `${t.played.min}–${t.played.max}`} matches. Ranked by {t.rankingBasis}.
        {uncertain ? ' A club level on points with another may be ordered differently by the official tie-break rules.' : ''}
        {!t.tiebreakRulesVerified ? ' Tie-break rules are unverified for this competition.' : ''}
        {t.excludedMatches ? ` ${t.excludedMatches} finished ${t.excludedMatches === 1 ? 'match' : 'matches'} without a verifiable regular-time score ${t.excludedMatches === 1 ? 'is' : 'are'} left out.` : ''}
      </p>
      {intel.lastSeason && (
        <p className={cx(note, 'mt-1')}>
          Final position {seasonLabel(intel.lastSeason.season)}: {tname(intel.teams.home)} {intel.lastSeason.home ? `${intel.lastSeason.home.position}${intel.lastSeason.home.uncertain ? '*' : ''} (${intel.lastSeason.home.points} pts)` : 'not in this competition'} · {tname(intel.teams.away)} {intel.lastSeason.away ? `${intel.lastSeason.away.position}${intel.lastSeason.away.uncertain ? '*' : ''} (${intel.lastSeason.away.points} pts)` : 'not in this competition'}.
        </p>
      )}
    </div>
  );
}

/* ───────── Season record comparison ───────── */
export function SeasonPanel({ intel }: { intel: MatchIntel }) {
  const s = intel.seasonRecords;
  if (!s || (!s.home?.played && !s.away?.played)) return <p className={note}>Season figures appear once either side has completed a match this season.</p>;
  const h = s.home!, a = s.away!;
  const rec = (x: { played: number; won: number; draw: number; lost: number }) => (x.played ? `${x.won}-${x.draw}-${x.lost}` : '—');
  const half = (x: { goalsFor: number; goalsAgainst: number; matches: number }) => (x.matches ? `${x.goalsFor}–${x.goalsAgainst}` : '—');
  const rows: [string, string, string][] = [
    ['Played', String(h.played), String(a.played)],
    ['W-D-L', rec(h), rec(a)],
    ['Points per match', h.pointsPerMatch?.toFixed(2) ?? '—', a.pointsPerMatch?.toFixed(2) ?? '—'],
    ['Goals scored', h.played ? String(h.goalsFor) : '—', a.played ? String(a.goalsFor) : '—'],
    ['Goals conceded', h.played ? String(h.goalsAgainst) : '—', a.played ? String(a.goalsAgainst) : '—'],
    ['Clean sheets', h.played ? String(h.cleanSheets) : '—', a.played ? String(a.cleanSheets) : '—'],
    ['Failed to score', h.played ? String(h.failedToScore) : '—', a.played ? String(a.failedToScore) : '—'],
    ['Home W-D-L', rec(h.home), rec(a.home)],
    ['Away W-D-L', rec(h.away), rec(a.away)],
    ['1st-half goals (for–against)', half(h.firstHalf), half(a.firstHalf)],
    ['2nd-half goals (for–against)', half(h.secondHalf), half(a.secondHalf)],
  ];
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 pb-2 border-b border-line text-sm font-bold">
        <span className="truncate">{tname(intel.teams.home)}</span><span /><span className="truncate text-right">{tname(intel.teams.away)}</span>
      </div>
      <div className="divide-y divide-line/70">
        {rows.map(([l, x, y]) => (
          <div key={l} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 py-2 text-sm num">
            <span className="display-wide text-base">{x}</span><span className="text-muted text-xs font-semibold text-center">{l}</span><span className="display-wide text-base text-right">{y}</span>
          </div>
        ))}
      </div>
      <p className={cx(note, 'mt-3')}>Season {seasonLabel(intel.season)}, before this match. A dash means nothing was recorded, not zero.</p>
    </div>
  );
}

/* ───────── Head to head ───────── */
export function H2HPanel({ intel }: { intel: MatchIntel }) {
  const d = intel.h2h; const home = intel.teams.home, away = intel.teams.away;
  if (!d.meetings) {
    return <Empty title="No previous meetings on record" hint={`Searched ${intel.h2hScope}.${d.excludedMeetings ? ` ${d.excludedMeetings} earlier meeting${d.excludedMeetings === 1 ? '' : 's'} could not be used (no verifiable regular-time score).` : ''}`} />;
  }
  const t = d.meetings;
  return (
    <div>
      <div className="grid grid-cols-3 text-center mb-3">
        <div className="flex flex-col items-center gap-1"><Crest src={home.crest} name={home.name} size={44} /><p className="display text-5xl text-brand">{d.teamAWins}</p><p className="text-xs text-muted">{tname(home)} wins</p></div>
        <div className="flex flex-col items-center justify-end gap-1"><p className="display text-5xl">{d.draws}</p><p className="text-xs text-muted">Draws</p></div>
        <div className="flex flex-col items-center gap-1"><Crest src={away.crest} name={away.name} size={44} /><p className="display text-5xl text-brand">{d.teamBWins}</p><p className="text-xs text-muted">{tname(away)} wins</p></div>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden mb-3"><span className="bg-brand" style={{ width: `${(d.teamAWins / t) * 100}%` }} /><span className="bg-surface-2" style={{ width: `${(d.draws / t) * 100}%` }} /><span className="bg-ink" style={{ width: `${(d.teamBWins / t) * 100}%` }} /></div>
      <p className="text-sm text-muted num mb-5">Goals: {tname(home)} {d.teamAGoals} – {d.teamBGoals} {tname(away)} · {tname(home)} at home in this fixture: {d.teamAAtHome.wins}W {d.teamAAtHome.draws}D {d.teamAAtHome.losses}L from {d.teamAAtHome.meetings}</p>
      <div className="divide-y divide-line/70">
        {d.last.map((x) => (
          <div key={x.matchId} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="text-muted text-xs w-16 shrink-0">{monthYear(x.date)}<span className="block">{compByCode(x.code)?.short ?? ''}</span></span>
            <span className="flex-1 flex items-center justify-end gap-2 min-w-0"><span className="truncate">{tname(x.home)}</span><Crest src={x.home.crest} name={x.home.name} size={22} /></span>
            <span className="display-wide num px-2">{x.homeGoals}–{x.awayGoals}</span>
            <span className="flex-1 flex items-center gap-2 min-w-0"><Crest src={x.away.crest} name={x.away.name} size={22} /><span className="truncate">{tname(x.away)}</span></span>
          </div>
        ))}
      </div>
      <p className={cx(note, 'mt-3')}>
        {t} {t === 1 ? 'meeting' : 'meetings'} counted from {intel.h2hScope}; the most recent {d.last.length} are listed. Regular-time scores only.
        {d.excludedMeetings ? ` ${d.excludedMeetings} earlier meeting${d.excludedMeetings === 1 ? ' was' : 's were'} left out because no verifiable regular-time score is available.` : ''}
      </p>
    </div>
  );
}
