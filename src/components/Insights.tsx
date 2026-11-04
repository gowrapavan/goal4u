import { Link } from 'react-router-dom';
import { Crest, Form, cx } from './ui';
import { teamHref } from '../lib/api';

const formPoints = (f?: string | null) => (f || '').split(',').filter(Boolean).slice(-5).reduce((a, r) => a + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);

export interface Insight { key: string; label: string; team?: any; player?: any; value: string; sub?: string; form?: string | null }

/** League insights computed ONLY from the standings rows + scorers already loaded; returns [] when nothing has been played. */
export function buildInsights(rows: any[], scorers: any[]): Insight[] {
  const played = rows.filter((r) => r.playedGames > 0);
  if (!played.length) return [];
  const out: Insight[] = [];
  const att = [...played].sort((a, b) => b.goalsFor / b.playedGames - a.goalsFor / a.playedGames || b.goalsFor - a.goalsFor)[0];
  const def = [...played].sort((a, b) => a.goalsAgainst / a.playedGames - b.goalsAgainst / b.playedGames || a.goalsAgainst - b.goalsAgainst)[0];
  out.push({ key: 'attack', label: 'Best attack', team: att.team, value: `${att.goalsFor} goals`, sub: `${(att.goalsFor / att.playedGames).toFixed(1)} per game` });
  out.push({ key: 'defence', label: 'Best defence', team: def.team, value: `${def.goalsAgainst} conceded`, sub: `${(def.goalsAgainst / def.playedGames).toFixed(1)} per game` });
  const withForm = played.filter((r) => r.form);
  if (withForm.length) {
    const best = [...withForm].sort((a, b) => formPoints(b.form) - formPoints(a.form) || b.points - a.points)[0];
    out.push({ key: 'form', label: 'Form side', team: best.team, value: `${formPoints(best.form)} pts from last 5`, form: best.form });
  }
  const top = [...scorers].sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0];
  if (top?.goals) out.push({ key: 'scorer', label: 'Top scorer', player: top.player, team: top.team, value: `${top.goals} goals`, sub: top.team?.shortName || top.team?.name });
  return out;
}

export function InsightList({ items, code, layout = 'list' }: { items: Insight[]; code: string; layout?: 'list' | 'grid' }) {
  if (!items.length) return <p className="p-4 text-sm text-muted">Insights appear once matches have been played.</p>;
  return (
    <ul className={cx(layout === 'grid' ? 'grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch' : 'divide-y divide-line/70')}>
      {items.map((i) => {
        const pills = i.form ? <Form value={i.form} /> : null;
        const body = (
          <>
            <Crest src={i.team?.crest} name={i.team?.name} size={layout === 'grid' ? 40 : 30} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-muted">{i.label}</span>
              <span className="block font-bold truncate">{i.player?.name || i.team?.shortName || i.team?.name}</span>
              <span className="block text-xs text-muted truncate num">{i.value}{i.sub ? ` · ${i.sub}` : ''}</span>
              {layout === 'list' && pills && <span className="block mt-1">{pills}</span>}
            </span>
            {layout === 'grid' && pills && <span className="shrink-0 hidden sm:block">{pills}</span>}
          </>
        );
        const cls = cx('flex items-center gap-3', layout === 'grid' ? 'card p-4 h-full min-h-[92px] hover:border-ink transition-colors' : 'px-4 py-3 hover:bg-surface-2/60');
        return <li key={i.key} className="h-full">{i.player?.id ? <Link to={`/player/${i.player.id}`} className={cls}>{body}</Link> : i.team?.id ? <Link to={teamHref(code, i.team.id)} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
      })}
    </ul>
  );
}
