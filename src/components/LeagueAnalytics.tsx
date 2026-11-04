import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crest, Skel, cx } from './ui';
import { ComingSoon } from './ComingSoon';
import { fetchForecast, useAsync, teamHref } from '../lib/api';
import { fetchTeamAnalytics } from '../services/api';

const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '–');

/** Team analytics, calculated from the season's finished matches (same data as the table — nothing is estimated). */
export function AnalyticsPanel({ code, season, crests, soon }: { code: string; season?: string; crests: Record<number, string>; soon: { to: string; label: string }[] }) {
  const res = useAsync(() => fetchTeamAnalytics(code, season), [code, season]);
  const [sort, setSort] = useState<'ppg' | 'gf' | 'ga' | 'cs'>('ppg');
  const rows = useMemo(() => (res.data || []).filter((t: any) => t.matchesPlayed > 0).map((t: any) => ({
    ...t, ppg: t.points / t.matchesPlayed, gf: t.goalsScored / t.matchesPlayed, ga: t.goalsConceded / t.matchesPlayed, cs: (100 * t.cleanSheets) / t.matchesPlayed,
    homePts: 3 * (t.homeWins || 0) + (t.homeDraws || 0), awayPts: 3 * (t.awayWins || 0) + (t.awayDraws || 0),
  })), [res.data]);
  if (res.loading) return <Skel className="h-96" />;
  if (!rows.length) return <ComingSoon title="Analytics available soon" message="Team analytics are calculated from finished matches, so they appear after the first round of results." actions={soon.map((a, i) => ({ ...a, primary: !i }))} />;
  const sorted = [...rows].sort((a, b) => sort === 'ga' ? a.ga - b.ga : b[sort] - a[sort]);
  const best = (k: 'gf' | 'ga' | 'cs', asc = false) => [...rows].sort((a, b) => (asc ? a[k] - b[k] : b[k] - a[k]))[0];
  const cards = [['Best attack', best('gf'), `${f1(best('gf').gf)} goals a game`], ['Best defence', best('ga', true), `${f1(best('ga', true).ga)} conceded a game`], ['Most clean sheets', best('cs'), `${Math.round(best('cs').cs)}% of matches`]] as const;
  const Th = ({ k, children }: { k?: typeof sort; children: React.ReactNode }) => (
    <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{k ? <button onClick={() => setSort(k)} className={cx('hover:text-ink', sort === k && 'text-brand')}>{children}{sort === k ? ' ↓' : ''}</button> : children}</th>
  );
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        {cards.map(([label, t, sub]) => (
          <div key={label} className="card p-4 flex items-center gap-3 min-w-0"><Crest src={crests[t.id]} name={t.name} size={40} />
            <div className="min-w-0"><p className="text-[11px] font-semibold text-muted">{label}</p><Link to={teamHref(code, t.id)} className="font-bold truncate block hover:text-brand">{t.name}</Link><p className="text-xs text-muted">{sub}</p></div></div>
        ))}
      </div>
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm num">
          <thead className="text-[11px] text-muted bg-surface-2/50"><tr><th className="px-3 py-2.5 text-left font-semibold">Team</th><Th>P</Th><Th k="ppg">Pts/game</Th><Th k="gf">Goals for/g</Th><Th k="ga">Against/g</Th><Th k="cs">Clean sheets</Th><Th>Home pts</Th><Th>Away pts</Th></tr></thead>
          <tbody className="divide-y divide-line/70">
            {sorted.map((t) => (
              <tr key={t.id}><td className="px-3 py-2"><Link to={teamHref(code, t.id)} className="flex items-center gap-2 font-semibold hover:text-brand min-w-[9rem]"><Crest src={crests[t.id]} name={t.name} size={20} /><span className="truncate">{t.name}</span></Link></td>
                <td className="px-3 text-right">{t.matchesPlayed}</td><td className="px-3 text-right font-bold">{f1(t.ppg)}</td><td className="px-3 text-right">{f1(t.gf)}</td><td className="px-3 text-right">{f1(t.ga)}</td>
                <td className="px-3 text-right">{t.cleanSheets} <span className="text-muted text-xs">({Math.round(t.cs)}%)</span></td><td className="px-3 text-right">{t.homePts}</td><td className="px-3 text-right">{t.awayPts}</td></tr>
            ))}
          </tbody>
        </table></div></div>
      <p className="text-xs text-muted">Calculated from this season’s finished matches. Click a heading to sort.</p>
    </div>
  );
}

/** Season forecast. The server simulates the remaining fixtures 500 times from each side’s points per game and home advantage. */
export function PredictionsPanel({ code, season, crests, soon }: { code: string; season?: string; crests: Record<number, string>; soon: { to: string; label: string }[] }) {
  const res = useAsync(() => fetchForecast(code, season), [code, season]);
  if (res.loading) return <Skel className="h-96" />;
  const rows = (res.data || []).filter((t: any) => t && t.name);
  if (!rows.length) return <ComingSoon title="Predictions available soon" message="The season forecast needs a few rounds of results before it can say anything useful. Check back after the next matchday." actions={soon.map((a, i) => ({ ...a, primary: !i }))} />;
  const done = rows.every((t: any) => t.titleProb === undefined) ;
  const pct = (n: number) => <span className={cx('font-semibold', n >= 50 ? 'text-brand' : n === 0 ? 'text-muted' : '')}>{n}%</span>;
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden"><div className="overflow-x-auto">
        <table className="w-full text-sm num">
          <thead className="text-[11px] text-muted bg-surface-2/50"><tr><th className="px-3 py-2.5 text-left font-semibold">Projected</th><th className="px-3 text-right font-semibold">Now</th><th className="px-3 text-right font-semibold">Final pts</th><th className="px-3 text-right font-semibold">Likely place</th>{!done && <><th className="px-3 text-right font-semibold">Title</th><th className="px-3 text-right font-semibold">Top 4</th><th className="px-3 text-right font-semibold">Bottom 3</th></>}</tr></thead>
          <tbody className="divide-y divide-line/70">
            {rows.map((t: any, i: number) => (
              <tr key={t.id}><td className="px-3 py-2"><Link to={teamHref(code, t.id)} className="flex items-center gap-2 font-semibold hover:text-brand min-w-[10rem]"><span className="w-5 text-muted">{i + 1}</span><Crest src={crests[t.id] || t.crest} name={t.name} size={20} /><span className="truncate">{t.name}</span></Link></td>
                <td className="px-3 text-right">{t.currentPoints}</td><td className="px-3 text-right font-bold">{t.avgPoints}</td><td className="px-3 text-right text-muted">{t.minPos === t.maxPos ? t.minPos : `${t.minPos}–${t.maxPos}`}</td>
                {!done && <><td className="px-3 text-right">{pct(t.titleProb)}</td><td className="px-3 text-right">{pct(t.uclProb)}</td><td className="px-3 text-right">{pct(t.relegationProb)}</td></>}</tr>
            ))}
          </tbody>
        </table></div></div>
      <p className="text-xs text-muted leading-relaxed">A simulation, not a promise: the remaining fixtures are played out 500 times using each team’s points per game and a home advantage. “Likely place” is the range covering the middle 80% of outcomes. Top 4 and Bottom 3 are fixed positions, so read them as the Champions League and relegation places only in leagues where that is true.</p>
    </div>
  );
}
