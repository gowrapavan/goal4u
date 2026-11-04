import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Search, WifiOff } from 'lucide-react';
import { Skel, cx } from './ui';

/**
 * Shared presentation for the "something is not normal" states of the app: failed request, offline, slow network,
 * loading skeletons and an empty search. Empty content itself uses <Empty> from ./ui.
 * Nothing here fetches anything or invents data; it only explains what the app already knows.
 */

/* ───────────── connectivity ───────────── */
const subscribeOnline = (fn: () => void) => {
  window.addEventListener('online', fn); window.addEventListener('offline', fn);
  return () => { window.removeEventListener('online', fn); window.removeEventListener('offline', fn); };
};
/** The browser's own online/offline flag. It says "offline" reliably; "online" only means a network exists. */
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

/**
 * Thin bar for connectivity changes, shown inside the sticky header.
 * Offline: says what is on screen was loaded earlier and that live scores cannot update. Back online: a short confirmation (the pages
 * that failed while offline ask again by themselves, see useAsync).
 */
export function OfflineBanner() {
  const online = useOnline();
  const was = useRef(online);
  const [back, setBack] = useState(false);
  useEffect(() => {
    if (online && !was.current) {
      was.current = true; setBack(true);
      const t = setTimeout(() => setBack(false), 4000);
      return () => clearTimeout(t);
    }
    was.current = online;
    return undefined;
  }, [online]);
  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="flex items-center justify-center gap-2 bg-ink text-bg text-[13px] font-semibold px-4 py-2 text-center">
          <WifiOff size={15} className="shrink-0" aria-hidden />
          <span>You’re offline. What’s on screen was loaded earlier, and live scores can’t update until you reconnect.</span>
        </p>
      )}
      {online && back && (
        <p className="flex items-center justify-center gap-2 bg-pitch text-white text-[13px] font-semibold px-4 py-2 text-center">
          <CheckCircle2 size={15} className="shrink-0" aria-hidden />
          <span>You’re back online. Refreshing what failed to load.</span>
        </p>
      )}
    </div>
  );
}

/* ───────────── failed request ───────────── */
/**
 * A request failed. Plain words, no raw error text, a Retry only when the caller can retry.
 * Use `compact` inside a section, the default for a whole page area.
 */
export function ErrorState({ title = 'This couldn’t be loaded', hint, onRetry, compact, className }: { title?: string; hint?: string; onRetry?: () => void; compact?: boolean; className?: string }) {
  const online = useOnline();
  const text = hint ?? (online ? 'The data service didn’t answer. Please try again in a moment.' : 'You appear to be offline. It will load again when you reconnect.');
  return (
    <div role="alert" className={cx('card text-center min-w-0', compact ? 'p-5' : 'p-6 sm:p-8', className)}>
      <span aria-hidden className="mx-auto mb-3 grid place-items-center w-11 h-11 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
        {online ? <AlertTriangle size={20} /> : <WifiOff size={20} />}
      </span>
      <p className="display-wide text-base sm:text-lg [overflow-wrap:anywhere]">{title}</p>
      <p className="text-muted mt-1 text-sm max-w-md mx-auto [overflow-wrap:anywhere]">{text}</p>
      {onRetry && <button type="button" onClick={onRetry} className="chip on mt-4"><RefreshCw size={14} aria-hidden />Try again</button>}
    </div>
  );
}

/** A background refresh failed but earlier content is still shown: say so, once, with a way to retry. */
export function StaleNotice({ onRetry, what = 'the latest information', auto }: { onRetry?: () => void; what?: string; auto?: boolean }) {
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-300/60 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-100 text-[13px] px-3 py-2 mb-4">
      <AlertTriangle size={15} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">Couldn’t refresh {what}. Showing what loaded earlier.{auto ? ' It will try again shortly.' : ''}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2 hover:no-underline">Try again</button>}
    </p>
  );
}

/* ───────────── slow network ───────────── */
/** After `after` ms of waiting, says so. No percentage and no progress bar: the app has no real progress to show. */
export function SlowNetworkIndicator({ loading, after = 8000, className }: { loading: boolean; after?: number; className?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), after);
    return () => clearTimeout(t);
  }, [loading, after]);
  return (
    <div role="status" aria-live="polite" className={className}>
      {loading && slow && (
        <p className="flex items-center gap-2 text-xs sm:text-[13px] text-muted py-2">
          <span aria-hidden className="w-2 h-2 rounded-full bg-brand animate-pulse shrink-0" />
          Still loading. The connection or data service is slow, so Goal4U keeps trying automatically.
        </p>
      )}
    </div>
  );
}

/* ───────────── empty search ───────────── */
/** The search found nothing. Shows what was searched for, keeps the input, offers a way out. No invented suggestions. */
export function SearchEmptyState({ query, onClear }: { query: string; onClear?: () => void }) {
  return (
    <div className="p-6 text-center min-w-0">
      <span aria-hidden className="mx-auto mb-3 grid place-items-center w-11 h-11 rounded-full bg-surface-2 text-muted"><Search size={20} /></span>
      <p className="display-wide text-base [overflow-wrap:anywhere]">No results for “{query}”</p>
      <p className="text-sm text-muted mt-1 max-w-sm mx-auto">Nothing matches that name. Check the spelling, or try a shorter name such as just a surname.</p>
      {onClear && <button type="button" onClick={onClear} className="chip mt-4">Clear search</button>}
    </div>
  );
}

/* ───────────── screen-reader announcements ───────────── */
/** Speaks `message` to screen readers when it changes (e.g. "12 matches shown"). Always mounted so the change is announced. */
export function Announce({ message }: { message: string }) {
  return <p className="sr-only" role="status" aria-live="polite">{message}</p>;
}

/* ───────────── loading skeletons (sized like the real thing) ───────────── */
/** Wraps skeletons: one polite "Loading" for assistive tech, and marks the region busy. */
export function SkelGroup({ label = 'Loading', className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <div role="status" aria-busy="true" className={className}><span className="sr-only">{label}…</span>{children}</div>;
}

const line = (w: string) => <Skel className={cx('h-3', w)} />;

/** Same box as VsMatchCard (compact = the rail on the home page). */
export const MatchCardSkel = ({ compact, className }: { compact?: boolean; className?: string }) =>
  <Skel className={cx(compact ? 'h-[148px] max-md:h-[124px]' : 'h-[190px]', 'rounded-[var(--radius-card)]', className)} />;

/** Standings table: header row + rows of the real row height. */
export const TableSkel = ({ rows = 10 }: { rows?: number }) => (
  <SkelGroup label="Loading table" className="card overflow-hidden">
    <div className="h-9 bg-surface-2/40 border-b border-line" />
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-3 px-4 h-[46px] border-b border-line/70 last:border-0"><Skel className="w-5 h-4" /><Skel className="w-6 h-6 !rounded-full" /><Skel className="h-3.5 flex-1 max-w-[12rem]" /><Skel className="h-3.5 w-24 ml-auto" /></div>)}
  </SkelGroup>
);

/**
 * The whole match page while it loads, laid out like the real one: navy header with two crests and a scoreboard, the tab row, a summary
 * card, and (large screens) the side column on the left. The header is navy, as the real one is, so nothing jumps when the page arrives.
 */
export const MatchPageSkel = ({ loading = true }: { loading?: boolean }) => (
  <div className="max-w-[88rem] mx-auto px-4 pt-4 sm:pt-6">
    <SkelGroup label="Loading match">
      <div className="grid lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)] gap-5 lg:gap-6 items-start">
        <div className="min-w-0 space-y-4">
          <div className="rounded-3xl max-sm:-mx-4 max-sm:rounded-t-none max-sm:rounded-b-3xl bg-[#0b1437] px-4 py-5 sm:px-8 sm:py-6">
            <div className="flex items-center justify-between"><Skel className="h-4 w-44 !bg-white/10" /><Skel className="h-4 w-20 !bg-white/10 max-sm:hidden" /></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6 mt-5 sm:mt-6">
              <div className="flex flex-col items-center gap-3"><Skel className="w-[60px] h-[60px] sm:w-[88px] sm:h-[88px] !rounded-full !bg-white/10" /><Skel className="h-5 w-24 sm:w-32 !bg-white/10" /></div>
              <Skel className="w-[104px] h-[92px] sm:w-[180px] sm:h-[120px] !rounded-2xl !bg-white/10" />
              <div className="flex flex-col items-center gap-3"><Skel className="w-[60px] h-[60px] sm:w-[88px] sm:h-[88px] !rounded-full !bg-white/10" /><Skel className="h-5 w-24 sm:w-32 !bg-white/10" /></div>
            </div>
            <div className="flex justify-center gap-2 mt-5"><Skel className="h-7 w-32 !rounded-full !bg-white/10" /><Skel className="h-7 w-32 !rounded-full !bg-white/10 max-sm:hidden" /></div>
          </div>
          <div className="flex gap-6 px-1 overflow-hidden">{[60, 84, 36, 60, 96].map((w, i) => <Skel key={i} className="h-5 shrink-0" style={{ width: w }} />)}</div>
          <Skel className="h-12 rounded-xl" />
          <div className="card p-4 sm:p-5 space-y-4"><Skel className="h-5 w-32" /><div className="grid sm:grid-cols-2 gap-4"><Skel className="h-12" /><Skel className="h-12" /><Skel className="h-12" /><Skel className="h-12" /></div></div>
          <SlowNetworkIndicator loading={loading} />
        </div>
        <div className="space-y-4 lg:order-first max-lg:hidden"><Skel className="h-[30rem] rounded-[var(--radius-card)]" /></div>
      </div>
    </SkelGroup>
  </div>
);

/** Match header + scoreboard. */
export const MatchHeaderSkel = () => <SkelGroup label="Loading match"><Skel className="h-[22rem] max-sm:h-[19rem] rounded-2xl" /></SkelGroup>;

/** News story card (image 16:10 + three lines). */
export const NewsCardSkel = () => (
  <div className="card overflow-hidden"><Skel className="aspect-[16/10] max-sm:aspect-[2/1] !rounded-none" /><div className="p-4 max-sm:p-3 space-y-2">{line('w-full')}{line('w-5/6')}{line('w-1/3')}</div></div>
);

/** Video card (16:9 + two lines). */
export const VideoCardSkel = () => <div><Skel className="aspect-video !rounded-xl" /><div className="mt-2 space-y-2">{line('w-full')}{line('w-1/2')}</div></div>;

/** A card of stat rows (match statistics, season totals). */
export const StatsSkel = ({ rows = 6 }: { rows?: number }) => (
  <SkelGroup label="Loading statistics" className="card p-4 sm:p-5 space-y-5">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="space-y-2"><Skel className="h-3 w-24 mx-auto" /><Skel className="h-2.5 w-full" /></div>)}
  </SkelGroup>
);

/** Player or team profile: header card + a row of figures + a card. */
export const ProfileSkel = () => (
  <SkelGroup label="Loading profile" className="space-y-5">
    <Skel className="h-52 sm:h-72 rounded-2xl" />
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-16" />)}</div>
    <Skel className="h-64 rounded-[var(--radius-card)]" />
  </SkelGroup>
);

/** Line-ups: pitch (upright on phones, landscape on wide screens) + two columns. */
export const LineupSkel = () => (
  <SkelGroup label="Loading line-ups" className="space-y-4">
    <Skel className="w-full aspect-[68/110] sm:aspect-[105/68] rounded-xl" />
    <div className="grid sm:grid-cols-2 gap-4"><Skel className="h-40" /><Skel className="h-40" /></div>
  </SkelGroup>
);

/** Search results: avatar + two lines, repeated. */
export const SearchSkel = ({ rows = 4 }: { rows?: number }) => (
  <SkelGroup label="Searching" className="p-2">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-3 px-2 py-2.5"><Skel className="w-8 h-8 !rounded-full" /><div className="flex-1 space-y-2">{line('w-1/2')}{line('w-1/3')}</div></div>)}
  </SkelGroup>
);

/** Plain list rows (fixtures, results). */
export const ListSkel = ({ rows = 5 }: { rows?: number }) => (
  <SkelGroup label="Loading" className="card overflow-hidden">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-3 px-4 h-14 border-b border-line/70 last:border-0"><Skel className="w-10 h-3" /><Skel className="w-6 h-6 !rounded-full" /><Skel className="h-3.5 flex-1 max-w-[14rem]" /></div>)}
  </SkelGroup>
);
