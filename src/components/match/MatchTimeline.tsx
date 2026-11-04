import { Empty, cx } from '../ui';
import { PlayerPhoto } from './LineupsUI';
import type { MatchDetails } from '../../lib/match-details-types';
import { BootIcon, CardIcon, GoalBadge, SubBadge } from './EventIcons';

const minuteOf = (v: any) => parseFloat(String(v ?? 0).replace('%', '')) || 0;
const KINDS = ['goal', 'yellow_card', 'red_card', 'substitution', 'penalty_missed'];
const idOf = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const norm = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
type Lookup = { full: Map<string, number>; last: Map<string, number | null> };
/** Live events carry no player id: find the headshot id from the line-ups by name (full name, else a surname that is unique in that squad). */
function lookupOf(d: MatchDetails | null | undefined, side: 'home' | 'away'): Lookup {
  const full = new Map<string, number>(), last = new Map<string, number | null>();
  const t = d?.[side]; if (!t) return { full, last };
  for (const p of [...t.starters, ...t.bench]) {
    if (p.athleteId == null) continue; const n = norm(p.name); full.set(n, p.athleteId);
    const l = n.split(' ').pop() ?? n; last.set(l, last.has(l) ? null : p.athleteId);
  }
  return { full, last };
}
const find = (lk: Lookup, name: unknown): number | null => { const n = norm(String(name ?? '')); if (!n) return null; return lk.full.get(n) ?? lk.last.get(n.split(' ').pop() ?? n) ?? null; };

function EventBody({ e, home, lk }: { e: any; home: boolean; lk: Lookup }) {
  const tint = home ? '#2a5fd6' : '#c47d0e';
  const goal = e.type === 'goal'; const own = goal && e.goal_type === 'own_goal'; const sub = e.type === 'substitution';
  const tag = goal ? (own ? 'Own goal' : e.goal_type === 'penalty' ? 'Penalty' : null) : e.type === 'penalty_missed' ? 'Penalty missed' : e.type === 'red_card' ? 'Red card' : e.type === 'yellow_card' ? 'Yellow card' : null;
  const icon = goal || e.type === 'penalty_missed' ? <GoalBadge own={own} missed={e.type === 'penalty_missed'} /> : sub ? <SubBadge /> : <CardIcon red={e.type === 'red_card'} className="!w-[12px] !h-[16px]" />;
  const text = (
    <div className={cx('min-w-0 leading-tight', home ? 'text-right' : 'text-left')}>
      <p className={cx('flex items-start gap-1.5 text-[12px] sm:text-sm leading-tight', home && 'justify-end flex-row-reverse text-right', goal ? 'font-bold' : 'font-semibold')}><span className="shrink-0 mt-px">{icon}</span><span className="line-clamp-2 [overflow-wrap:break-word] [hyphens:none]">{e.player}</span></p>
      {goal && e.assistant && <p className={cx('text-[10px] sm:text-xs text-muted flex items-start gap-1 mt-0.5', home && 'justify-end')}><BootIcon size={12} className="shrink-0 text-muted mt-px" /><span className="line-clamp-2 [overflow-wrap:break-word] [hyphens:none]">{e.assistant}</span></p>}
      {sub && e.player_out && <p className={cx('text-[10px] sm:text-xs text-muted flex items-start gap-1 mt-0.5', home && 'justify-end')}><span className="inline-block w-0 h-0 border-x-[4px] border-x-transparent border-t-[6px] border-t-[#ef4444] shrink-0 mt-[5px]" /><span className="line-clamp-2 [overflow-wrap:break-word] [hyphens:none]">{e.player_out}</span></p>}
      {tag && <p className={cx('text-[10px] sm:text-[11px] font-semibold truncate', own || e.type === 'penalty_missed' || e.type === 'red_card' ? 'text-red-500' : 'text-muted')}>{tag}</p>}
    </div>
  );
  const photo = <span className="shrink-0"><PlayerPhoto athleteId={idOf(e.player_id) ?? find(lk, e.player)} name={String(e.player ?? '')} size={26} ring={false} tint={tint} /></span>;
  return <div className={cx('flex items-center gap-1.5 sm:gap-2.5 min-w-0', home ? 'justify-end' : 'justify-start')}>{home ? <>{text}{photo}</> : <>{photo}{text}</>}</div>;
}

/** The match timeline: minute in the middle, the home side on the left, each event with the player's photo and a purpose-drawn icon. */
export function Timeline({ events, details }: { events: any[]; details?: MatchDetails | null }) {
  const lks = { home: lookupOf(details, 'home'), away: lookupOf(details, 'away') };
  const list = [...events].filter((e) => KINDS.includes(e.type)).sort((a, b) => minuteOf(a.minute) - minuteOf(b.minute));
  if (!list.length) return <Empty title="No events recorded" />;
  return (
    <ol className="relative">
      <span className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
      {list.map((e, i) => {
        const home = e.team === 'home';
        return (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center gap-1 sm:gap-2 py-2 sm:py-3.5 relative">
            <div>{home && <EventBody e={e} home lk={lks.home} />}</div>
            <span className="relative z-10 mx-auto bg-surface num text-[10px] sm:text-xs font-bold px-1 sm:px-1.5 py-0.5 rounded-full border border-line">{e.minute}'</span>
            <div>{!home && <EventBody e={e} home={false} lk={lks.away} />}</div>
          </li>
        );
      })}
    </ol>
  );
}
