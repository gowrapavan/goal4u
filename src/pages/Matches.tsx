import { LeagueLogo } from '../components/LeagueLogo';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SEO } from '../components/SEO';
import { STATIC_SEO } from '../lib/seo-text';
import { Crest, Skel, MatchRow, Empty, cx } from '../components/ui';
import { Announce, ErrorState, SkelGroup, SlowNetworkIndicator, StaleNotice } from '../components/states';
import { CalendarDays } from 'lucide-react';
import { COMPS, addDays, ymd, getFeed, useAsync, groupByComp, phase, compByCode } from '../lib/api';
import { Link } from 'react-router-dom';
import { useCenterActive } from '../hooks/useCenterActive';

export function Matches() {
  const [sp, setSp] = useSearchParams();
  const todayKey = ymd(new Date());
  const day = sp.get('d') || todayKey;
  const dayRow = useCenterActive(day);     // mobile: selected day (today at first) is centred in the strip
  const comp = sp.get('c') || '';
  const liveOnly = sp.get('filter') === 'live';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  const base = useMemo(() => new Date(day + 'T12:00:00'), [day]);
  const strip = useMemo(() => Array.from({ length: 15 }, (_, i) => addDays(new Date(todayKey + 'T12:00:00'), i - 7)), [todayKey]);

  const feed = useAsync(() => getFeed({ from: ymd(addDays(base, -1)), to: ymd(addDays(base, 1)), codes: comp ? [comp] : undefined }), [day, comp]);
  const next = useAsync(() => getFeed({ from: todayKey, to: ymd(addDays(new Date(), 45)) }), []);

  const dayMatches = (feed.data || []).filter((m) => ymd(new Date(m.utcDate)) === day);
  const visible = liveOnly ? dayMatches.filter((m) => phase(m) === 'live') : dayMatches;
  const groups = groupByComp(visible);
  const nextDay = next.data?.find((m) => ymd(new Date(m.utcDate)) > day || (day < todayKey && ymd(new Date(m.utcDate)) >= todayKey));

  const shift = (n: number) => set('d', ymd(addDays(base, n)));
  const title = day === todayKey ? 'Today’s matches' : base.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="max-w-[88rem] mx-auto px-4 pt-6">
      <SEO {...STATIC_SEO.matches} />
      <div className="flex items-end justify-between gap-4 mb-4">
        <h1 className="display text-3xl sm:text-4xl">{title}</h1>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} aria-label="Previous day" className="w-10 h-10 grid place-items-center rounded-full border border-line bg-surface hover:border-ink transition-colors"><ChevronLeft size={18} /></button>
          <button onClick={() => shift(1)} aria-label="Next day" className="w-10 h-10 grid place-items-center rounded-full border border-line bg-surface hover:border-ink transition-colors"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div ref={dayRow} className="scroll-x snap-none gap-2 -mx-4 px-4 lg:mx-0 lg:px-0 mb-4" role="tablist" aria-label="Choose day">
        {strip.map((d) => {
          const k = ymd(d); const on = k === day;
          return (
            <button key={k} role="tab" aria-selected={on} onClick={() => set('d', k === todayKey ? '' : k)}
              className={cx('w-[56px] py-2 rounded-xl border text-center transition-colors', on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line hover:border-ink')}>
              <span className={cx('block text-[11px] font-semibold', on ? 'opacity-70' : 'text-muted')}>{k === todayKey ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="block display-wide text-lg num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="scroll-x gap-2 -mx-4 px-4 lg:mx-0 lg:px-0 mb-6">
        <button className="chip" aria-pressed={!comp && !liveOnly} onClick={() => { const n = new URLSearchParams(sp); n.delete('c'); n.delete('filter'); setSp(n, { replace: true }); }}>All</button>
        <button className="chip" aria-pressed={liveOnly} onClick={() => set('filter', liveOnly ? '' : 'live')}><span className="live-dot" />Live</button>
        {COMPS.map((c) => <button key={c.code} className="chip" aria-pressed={comp === c.code} onClick={() => set('c', comp === c.code ? '' : c.code)}><LeagueLogo comp={c} size={16} />{c.short}</button>)}
      </div>

      <Announce message={feed.loading ? '' : `${visible.length} match${visible.length === 1 ? '' : 'es'} shown`} />
      {feed.error && feed.data && <StaleNotice what="the scores" onRetry={feed.retry} />}
      {feed.loading && !feed.data ? (
        <SkelGroup label="Loading matches"><div className="grid lg:grid-cols-2 gap-4 items-start">{Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-40 rounded-[var(--radius-card)]" />)}</div><SlowNetworkIndicator loading={feed.loading} /></SkelGroup>
      ) : feed.error && !feed.data ? (
        <div className="max-w-md mx-auto py-6"><ErrorState title="Scores couldn’t be loaded" hint="This isn’t an empty day: the match list didn’t arrive." onRetry={feed.retry} /></div>
      ) : groups.length ? (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          {groups.map(([code, ms]) => {
            const c = compByCode(code);
            return (
              <section key={code} className="card overflow-hidden">
                <Link to={`/competition/${c?.slug}`} className="flex items-center gap-2.5 px-4 py-3 border-b border-line font-bold hover:text-brand">
                  <LeagueLogo comp={c} size={22} />{c?.name || code}<span className="ml-auto text-xs font-semibold text-muted">{c?.country}</span>
                </Link>
                <div className="divide-y divide-line/70">{ms.map((m) => <MatchRow key={m.id} m={m} />)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="max-w-md mx-auto text-center py-10">
          <Empty icon={CalendarDays} title={liveOnly ? 'No live matches right now' : 'No matches scheduled on this day'} hint={comp ? 'Try All competitions or another day.' : 'Pick another day from the strip above.'}
            action={nextDay ? { label: 'Jump to next match day', onClick: () => { const n = new URLSearchParams(sp); n.set('d', ymd(new Date(nextDay.utcDate))); n.delete('filter'); setSp(n, { replace: true }); } } : undefined} />
        </div>
      )}
    </div>
  );
}
