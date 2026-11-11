import { LeagueLogo } from '../LeagueLogo';
import { ErrorState } from '../states';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Crest, Skel, cx } from '../ui';
import { addDays, dayLabel, getFeed, getTables, groupByComp, hasScore, kickoff, matchHref, phase, scoreOf, tn, uniqueMatches, ymd, useAsync, type FMatch } from '../../lib/api';
import { ALL_COMPS, COMPS, TOURNAMENTS, compByCode } from '../../lib/competitions';
import { roundShort } from '../../lib/match-round';
import { dayChip } from '../../lib/day-chip';

const CODES = ALL_COMPS.map((c) => c.code);
const MAX_ROWS = 10;

function Status({ m, showDay }: { m: FMatch; showDay: boolean }) {
  const p = phase(m);
  if (p === 'live') return <span className="inline-flex flex-col items-center leading-tight text-live font-bold"><span className="live-dot" /><span className="num text-[11px] mt-0.5">{m.minute ? `${m.minute}'` : 'LIVE'}</span></span>;
  if (p === 'ft') return <span className="text-[11px] font-semibold text-muted">FT</span>;
  if (p === 'postponed') return <span className="text-[11px] font-semibold text-muted">PP</span>;
  if (p === 'started' || p === 'pending') return <span className="text-[11px] font-semibold text-muted">{p === 'started' ? 'KO' : '—'}</span>;
  return <span className="inline-flex flex-col items-center leading-tight">{showDay && <span className="text-[10px] text-muted font-semibold whitespace-nowrap">{dayChip(m.utcDate)}</span>}<span className="num text-xs font-bold">{kickoff(m.utcDate)}</span></span>;
}

function Row({ m, active, showDay }: { m: FMatch; active: boolean; showDay: boolean }) {
  const p = phase(m); const sc = scoreOf(m); const show = hasScore(m) && p !== 'upcoming'; const live = p === 'live';
  const side = (t: FMatch['homeTeam'], v: number | null, win: boolean) => (
    <div className="flex items-center gap-2 min-w-0 h-[22px]"><Crest src={t.crest} name={t.name} size={18} /><span className={cx('truncate text-[13px]', win ? 'font-bold' : 'font-medium')}>{tn(t)}</span>{show && <span className={cx('ml-auto num text-[13px] font-bold pl-2', live && 'text-live')}>{v}</span>}</div>
  );
  return (
    <Link to={matchHref(m)} aria-current={active ? 'page' : undefined} className={cx('grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-1 px-3 py-2 border-l-[3px] transition-colors', active ? 'bg-brand-soft/60 border-brand' : 'border-transparent hover:bg-surface-2/70')}>
      <span className="text-center"><Status m={m} showDay={showDay} /></span>
      <span className="min-w-0 block">{side(m.homeTeam, sc.h, show && (sc.h ?? 0) > (sc.a ?? 0))}{side(m.awayTeam, sc.a, show && (sc.a ?? 0) > (sc.h ?? 0))}</span>
    </Link>
  );
}

function Group({ code, items, current, showDay }: { code: string; items: FMatch[]; current: number; showDay: boolean }) {
  const c = compByCode(code);
  return (
    <div>
      <Link to={`/competition/${c?.slug ?? code.toLowerCase()}`} className="flex items-center gap-2 px-3 py-2 bg-surface-2/60 text-[11px] font-bold uppercase tracking-wide text-muted hover:text-ink">
        <LeagueLogo comp={c} size={16} /><span className="truncate">{c?.country ? `${c.country} · ` : ''}{c?.short ?? code}</span>
      </Link>
      {items.map((m) => <Row key={m.id} m={m} active={m.id === current} showDay={showDay} />)}
    </div>
  );
}

/**
 * The side panel of the match page: other matches live right now, today's matches, and what comes next. Refreshes every 45 s.
 * On phones it sits under the match and shows the first rows with a "Show more" button.
 */
export function MatchSidebar({ current, currentId, currentCode, homeId, awayId, season }: { current?: FMatch; currentId: number; currentCode: string; homeId: number; awayId: number; season?: string }) {
  const [tick, setTick] = useState(0); const [all, setAll] = useState(false);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setTick((x) => x + 1); }, 45_000); return () => clearInterval(t); }, []);
  const feed = useAsync(() => getFeed({ codes: CODES, from: ymd(addDays(new Date(), -1)), to: ymd(addDays(new Date(), 14)) }), [tick]);
  // a failed background refresh keeps the list that was already on screen
  const lastFeed = useRef<FMatch[] | null>(null); if (feed.data) lastFeed.current = feed.data;
  const feedData = feed.data ?? lastFeed.current;

  const sections = useMemo(() => {
    const ms = uniqueMatches(feedData ?? []).map((x) => (current && x.id === current.id ? { ...x, ...current } : x))      /* the open match shows what the page itself knows (live score from its own live request) */; const today = new Date().toDateString();
    const order = (a: FMatch, b: FMatch) => (a.code === currentCode ? -1 : 0) - (b.code === currentCode ? -1 : 0) || a.utcDate.localeCompare(b.utcDate);
    const live = ms.filter((m) => phase(m) === 'live');
    const todays = ms.filter((m) => phase(m) !== 'live' && new Date(m.utcDate).toDateString() === today).sort(order);
    const next = ms.filter((m) => ['upcoming', 'started'].includes(phase(m)) && new Date(m.utcDate).toDateString() !== today && Date.parse(m.utcDate) > Date.now()).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    const out: { title: string; items: FMatch[]; day: boolean; dot?: boolean }[] = [];
    if (live.length) out.push({ title: 'Live now', items: live, day: false, dot: true });
    if (todays.length) out.push({ title: 'Today', items: todays, day: false });
    if (next.length && live.length + todays.length < 8) out.push({ title: 'Coming up', items: next.slice(0, 10), day: true });
    // keep the page's own match visible: if it is not in any list (e.g. an older match), it is simply not highlighted
    let left = MAX_ROWS;
    return out.map((s) => { const items = s.items.slice(0, Math.max(0, left)); left -= items.length; return { ...s, items }; }).filter((s) => s.items.length);
  }, [feedData, currentCode, current]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const matchesCard = feed.loading && !feedData ? <Skel className="h-72 rounded-[var(--radius-card)]" /> : feed.error && !feedData ? <ErrorState compact title="Today’s matches couldn’t be loaded" onRetry={feed.retry} /> : !sections.length ? null : (
      <div className="card overflow-hidden">
        {sections.map((s, si) => {
          // phones: only the first rows until "Show more"
          const before = sections.slice(0, si).reduce((n, x) => n + x.items.length, 0);
          const items = all ? s.items : s.items.slice(0, Math.max(0, 6 - before));
          const hidden = !all && items.length === 0;
          return (
            <section key={s.title} className={cx(hidden && 'max-lg:hidden', si > 0 && 'border-t border-line')}>
              <h3 className="flex items-center gap-2 px-3 pt-3 pb-1.5 display-wide text-sm">{s.dot && <span className="live-dot" />}{s.title}<span className="ml-auto text-[11px] font-semibold text-muted num">{s.items.length}</span></h3>
              {groupByComp(s.items).map(([code, list]) => {
                const shown = all ? list : list.filter((m) => items.includes(m));
                return <div key={code}>
                  <div className="hidden lg:block"><Group code={code} items={list} current={currentId} showDay={s.day} /></div>
                  <div className="lg:hidden">{shown.length > 0 && <Group code={code} items={shown} current={currentId} showDay={s.day} />}</div>
                </div>;
              })}
            </section>
          );
        })}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-line text-xs font-semibold">
          {total > 6 && !all ? <button onClick={() => setAll(true)} className="lg:hidden text-brand">Show more</button> : <span className="lg:hidden" />}
          <Link to="/matches" className="ml-auto inline-flex items-center gap-0.5 text-muted hover:text-ink">All matches <ChevronRight size={14} /></Link>
        </div>
      </div>
  );
  return (
    // Sticky while the match column is longer than the viewport; if the panel itself is taller than the screen it scrolls inside, and it
    // lets go when the match column ends.
    <aside aria-label="More matches, table and leagues" className="min-w-0 space-y-4 lg:order-first lg:sticky lg:top-[6.75rem] lg:max-h-[calc(100vh-7.75rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1 thin-scroll">
      {matchesCard}
      <MiniTable code={currentCode} season={season} homeId={homeId} awayId={awayId} />
      <LeagueList currentCode={currentCode} />
    </aside>
  );
}

/** A compact league table: the top of the table plus the rows around both clubs of this match, which are highlighted. */
function MiniTable({ code, season, homeId, awayId }: { code: string; season?: string; homeId: number; awayId: number }) {
  const t = useAsync(() => getTables(code, season).catch(() => []), [code, season]);
  const c = compByCode(code);
  const set = (t.data ?? []).find((g: any) => g.table?.some((r: any) => r.team?.id === homeId || r.team?.id === awayId)) ?? (t.data ?? [])[0];
  const rows: any[] = set?.table ?? [];
  if (t.loading && !t.data) return <Skel className="h-64 rounded-2xl" />;
  if (!rows.length) return null;
  const mineAt = (i: number) => rows[i] && (rows[i].team?.id === homeId || rows[i].team?.id === awayId);
  const keep = rows.map((r, i) => ({ r, i })).filter(({ i }) => i < 6 || mineAt(i - 1) || mineAt(i) || mineAt(i + 1));
  return (
    <section className="card overflow-hidden" aria-label="League table">
      <h3 className="flex items-center gap-2 px-3 pt-3 pb-2 display-wide text-sm"><LeagueLogo comp={c} size={18} /><span className="truncate">{c?.short ?? code} table</span>{set?.group && <span className="ml-auto text-[11px] font-semibold text-muted">{String(set.group).replace(/_/g, ' ')}</span>}</h3>
      <div className="grid grid-cols-[1.6rem_minmax(0,1fr)_1.7rem_2rem_2rem] gap-x-1 px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted"><span>#</span><span>Team</span><span className="text-right">P</span><span className="text-right">GD</span><span className="text-right">Pts</span></div>
      <ol>
        {keep.map(({ r, i }, k) => {
          const mine = r.team?.id === homeId || r.team?.id === awayId; const gap = k > 0 && i - keep[k - 1].i > 1;
          return (
            <li key={r.team?.id ?? i}>
              {gap && <div className="px-3 text-center text-muted text-xs leading-none py-0.5" aria-hidden>⋯</div>}
              <Link to={`/team/${c?.slug ?? code.toLowerCase()}?teamId=${r.team?.id}`} className={cx('grid grid-cols-[1.6rem_minmax(0,1fr)_1.7rem_2rem_2rem] items-center gap-x-1 px-3 py-1.5 border-l-[3px] text-[13px]', mine ? 'bg-brand-soft/60 border-brand font-bold' : 'border-transparent hover:bg-surface-2/70')}>
                <span className="num text-xs text-muted">{r.position ?? i + 1}</span>
                <span className="flex items-center gap-2 min-w-0"><Crest src={r.team?.crest} name={r.team?.name} size={16} /><span className="truncate">{r.team?.shortName || r.team?.name}</span></span>
                <span className="num text-right text-muted">{r.playedGames}</span><span className="num text-right text-muted">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span><span className="num text-right font-bold">{r.points}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Link to={`/competition/${c?.slug ?? code.toLowerCase()}${season ? `/${season}` : ''}`} className="flex items-center justify-end gap-0.5 px-3 py-2.5 border-t border-line text-xs font-semibold text-muted hover:text-ink">Full table <ChevronRight size={14} /></Link>
    </section>
  );
}

/** The competitions available on the site, so the column keeps its length next to a long match page. */
function LeagueList({ currentCode }: { currentCode: string }) {
  const item = (c: (typeof COMPS)[number]) => (
    <Link key={c.code} to={`/competition/${c.slug}`} className={cx('flex items-center gap-2.5 px-3 py-2 border-l-[3px] hover:bg-surface-2/70 min-w-0', c.code === currentCode ? 'bg-brand-soft/60 border-brand' : 'border-transparent')}>
      <LeagueLogo comp={c} size={22} /><span className="min-w-0 leading-tight"><span className="block text-[13px] font-semibold truncate">{c.short}</span><span className="block text-[11px] text-muted truncate">{c.country}</span></span>
    </Link>
  );
  return (
    <section className="card overflow-hidden" aria-label="Leagues">
      <h3 className="px-3 pt-3 pb-1.5 display-wide text-sm">Leagues &amp; cups</h3>
      <div className="grid grid-cols-2 lg:grid-cols-1 pb-1">{[...COMPS, ...TOURNAMENTS].map(item)}</div>
    </section>
  );
}
