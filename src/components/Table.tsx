import { Link } from 'react-router-dom';
import { Crest, Form, PlayerImg, cx } from './ui';
import { teamHref } from '../lib/api';

export function StandingsTable({ rows, code, compact, highlight, qualify = 4, relegate = 3 }: {
  rows: any[]; code: string; compact?: boolean; highlight?: number; qualify?: number; relegate?: number;
}) {
  const n = rows.length;
  const th = 'font-semibold text-muted text-[10.5px] uppercase tracking-wide py-2.5 px-1.5 text-center whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm num">
        <thead>
          <tr className="border-b border-line bg-surface-2/40">
            <th className={cx(th, 'w-9 pl-3')}>#</th>
            <th className={cx(th, 'text-left')}>Club</th>
            <th className={th}>P</th>
            {!compact && <><th className={cx(th, 'hidden sm:table-cell')}>W</th><th className={cx(th, 'hidden sm:table-cell')}>D</th><th className={cx(th, 'hidden sm:table-cell')}>L</th><th className={cx(th, 'hidden md:table-cell')}>GF</th><th className={cx(th, 'hidden md:table-cell')}>GA</th></>}
            <th className={th}>GD</th>
            <th className={cx(th, 'pr-3')}>Pts</th>
            {!compact && <th className={cx(th, 'hidden lg:table-cell')}>Form</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pos = r.position as number;
            const bar = pos <= qualify ? 'bg-brand' : pos > n - relegate && n > 12 ? 'bg-live' : 'bg-transparent';
            return (
              <tr key={r.team.id} className={cx('border-b border-line/70 last:border-0 hover:bg-surface-2/60 transition-colors', highlight === r.team.id && 'bg-brand-soft')}>
                <td className="relative pl-3 text-center font-bold text-[13px]"><span className={cx('absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r', bar)} />{pos}</td>
                <td className="py-2.5 px-1.5">
                  <Link to={teamHref(code, r.team.id)} className="flex items-center gap-2.5 min-w-0 font-semibold hover:text-brand">
                    <Crest src={r.team.crest} name={r.team.name} size={22} />
                    <span className="truncate max-w-[150px] sm:max-w-none">{r.team.shortName || r.team.name}</span>
                  </Link>
                </td>
                <td className="text-center px-1.5 text-muted">{r.playedGames}</td>
                {!compact && <><td className="text-center hidden sm:table-cell">{r.won}</td><td className="text-center hidden sm:table-cell">{r.draw}</td><td className="text-center hidden sm:table-cell">{r.lost}</td><td className="text-center hidden md:table-cell">{r.goalsFor}</td><td className="text-center hidden md:table-cell">{r.goalsAgainst}</td></>}
                <td className="text-center px-1.5 text-muted">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                <td className="text-center pr-3 font-bold display-wide text-[15px]">{r.points}</td>
                {!compact && <td className="hidden lg:table-cell px-2"><Form value={r.form} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScorerList({ rows, code, limit = 10, metric = 'goals' }: { rows: any[]; code: string; limit?: number; metric?: 'goals' | 'assists' }) {
  const list = [...rows].sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0)).slice(0, limit);
  const top = list[0]?.[metric] || 1;
  return (
    <ol>
      {list.map((s, i) => (
        <li key={s.player.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-line/70 last:border-0">
          <span className="w-5 text-center text-sm font-bold text-muted num">{i + 1}</span>
          <span className="relative shrink-0">
            <PlayerImg id={s.player.id} alt="" size={36} className="w-9 h-9 rounded-full object-cover object-top bg-surface-2" fallback={<Crest src={s.team?.crest} name={s.team?.name} size={30} />} />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-surface p-px shadow-sm"><Crest src={s.team?.crest} name={s.team?.name} size={15} /></span>
          </span>
          <Link to={`/player/${s.player.id}`} className="flex-1 min-w-0 hover:text-brand">
            <span className="block font-semibold truncate text-[14px]">{s.player.name}</span>
            <span className="block text-[11.5px] text-muted truncate">{s.team?.shortName || s.team?.name} · {s.playedMatches ?? 0} apps</span>
          </Link>
          <span className="hidden sm:block w-24 h-1.5 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full bg-brand rounded-full" style={{ width: `${((s[metric] ?? 0) / top) * 100}%` }} /></span>
          <span className="display-wide text-lg w-8 text-right num">{s[metric] ?? 0}</span>
        </li>
      ))}
    </ol>
  );
}
