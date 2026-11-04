import { LeagueLogo } from '../LeagueLogo';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, Home, CalendarDays, Trophy, PlayCircle, X, Newspaper } from 'lucide-react';
import { COMPS, TOURNAMENTS } from '../../lib/api';
import { Crest, cx } from '../ui';
import { Announce, ErrorState, OfflineBanner, SearchEmptyState, SearchSkel } from '../states';
import { ErrorBoundary } from '../ErrorBoundary';
import { useSearchData } from '../../hooks/useSearchData';
import { useFuzzySearch } from '../../hooks/useFuzzySearch';
import { useDebounce } from '../../hooks/useDebounce';
import { getDataProblem, subscribeDataProblem } from '../../lib/data-status';

/** A short, calm notice when the data service cannot be reached or refused its token. The page underneath keeps working (empty sections), it never crashes. */
function DataBanner() {
  const problem = useSyncExternalStore(subscribeDataProblem, getDataProblem, () => null);
  if (!problem) return null;
  return (
    <div role="status" className="bg-amber-100 text-amber-950 dark:bg-amber-500/15 dark:text-amber-100 border-b border-amber-300/60 dark:border-amber-400/20 text-center text-sm font-semibold px-4 py-2">
      Data service unavailable. {problem === 'auth' ? 'Please try again later.' : 'Please try again in a moment.'}
    </div>
  );
}

const NAV = [
  { to: '/matches', label: 'Scores' },
  { to: '/competition/premier-league', label: 'Tables' },
  { to: '/watch', label: 'Watch' },
  { to: '/news', label: 'News' },
];

function useTheme() {
  const [t, setT] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.theme as any) || 'light');
  const toggle = () => {
    const n = t === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = n; try { localStorage.setItem('g4u-theme', n); } catch {}
    setT(n);
  };
  return [t, toggle] as const;
}

/** The site logo: public/logo/logo.png in light mode, public/logo/dark-bg-logo.png in dark mode (switched by CSS, so there is no flash). Falls back to the old mark if a file is missing. */
function SiteLogo({ className }: { className?: string }) {
  const [bad, setBad] = useState(false); const [darkBad, setDarkBad] = useState(false);
  if (bad) return <span className="display text-[1.7rem] tracking-tight flex items-center gap-1.5"><span className="w-6 h-6 rounded-full bg-brand grid place-items-center"><span className="w-2 h-2 rounded-full bg-lime" /></span>Goal4U</span>;
  return (
    <>
      <img src="/logo/logo.png" alt="Goal4U" className={cx(className, !darkBad && 'logo-light')} onError={() => setBad(true)} />
      {!darkBad && <img src="/logo/dark-bg-logo.png" alt="" aria-hidden className={cx(className, 'logo-dark')} onError={() => setDarkBad(true)} />}
    </>
  );
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState(''); const dq = useDebounce(q, 120);
  const [wanted, setWanted] = useState(false);
  useEffect(() => { if (open) setWanted(true); }, [open]);
  const { items, loading, failed, retry } = useSearchData(wanted);
  const results = useFuzzySearch(items, dq);
  const nav = useNavigate(); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setTimeout(() => ref.current?.focus(), 30); } }, [open]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  if (!open) return null;
  const go = (slug: string) => { onClose(); nav(slug); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto mt-0 sm:mt-[10vh] max-w-xl bg-surface sm:rounded-2xl overflow-hidden shadow-2xl h-full sm:h-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search size={18} className="text-muted" />
          <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams, players, competitions" className="flex-1 bg-transparent outline-none text-base" />
          <button onClick={onClose} aria-label="Close search" className="text-muted"><X size={18} /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {!q && <div className="p-4"><p className="text-sm text-muted mb-3">Jump to a competition</p>
            <div className="flex flex-wrap gap-2">{COMPS.map((c) => <button key={c.code} className="chip" onClick={() => go(`/competition/${c.slug}`)}><LeagueLogo comp={c} size={16} />{c.short}</button>)}</div></div>}
          {q && loading && <SearchSkel />}
          {q && !loading && failed && <div className="p-3"><ErrorState compact title="Search isn’t available right now" hint="The list of teams, players and competitions couldn’t be loaded." onRetry={retry} /></div>}
          {q && !loading && !failed && !results.length && <SearchEmptyState query={q} onClear={() => { setQ(''); ref.current?.focus(); }} />}
          <Announce message={q && !loading && !failed ? (results.length ? `${results.length} result${results.length === 1 ? '' : 's'} for ${q}` : `No results for ${q}`) : ''} />
          {results.map(({ item }) => (
            <button key={item.id} onClick={() => go(item.slug)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
              <Crest src={item.logo} name={item.name} size={28} />
              <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{item.name}</span><span className="block text-xs text-muted truncate">{item.subtitle}</span></span>
              <span className="text-[11px] font-semibold text-muted capitalize">{item.type}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const [theme, toggleTheme] = useTheme();
  const [searchOpen, setSearch] = useState(false);
  const loc = useLocation();
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const tab = (to: string, Icon: any, label: string, match: (p: string) => boolean) => (
    <Link to={to} aria-current={match(loc.pathname) ? 'page' : undefined} className={cx('relative flex flex-col items-center justify-center gap-0.5 min-h-[3.25rem] pt-1.5 pb-1 text-[11px] font-semibold transition-colors', match(loc.pathname) ? 'text-brand before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-brand' : 'text-muted active:text-ink')}>
      <Icon size={21} strokeWidth={match(loc.pathname) ? 2.4 : 1.8} />{label}
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-[88rem] mx-auto px-4 h-14 flex items-center gap-6">
          <Link to="/" className="flex items-center shrink-0" aria-label="Goal4U home"><SiteLogo className="h-8 w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('px-3 h-9 grid place-items-center rounded-full text-sm font-semibold transition-colors', isActive ? 'bg-ink text-bg' : 'text-ink/80 hover:text-ink hover:bg-surface-2')}>{n.label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSearch(true)} className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-full bg-surface-2 text-muted text-sm w-40 lg:w-56">
              <Search size={15} /> Search <kbd className="ml-auto text-[10px] border border-line rounded px-1.5">⌘K</kbd>
            </button>
            <button onClick={() => setSearch(true)} aria-label="Search" className="sm:hidden w-9 h-9 grid place-items-center rounded-full bg-surface-2"><Search size={17} /></button>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="w-9 h-9 grid place-items-center rounded-full bg-surface-2">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="max-w-[88rem] mx-auto px-4 scroll-x gap-1 h-11 items-center" aria-label="Competitions">
            {[...COMPS, ...TOURNAMENTS].map((c) => (
              <NavLink key={c.code} to={`/competition/${c.slug}`} className={({ isActive }) => cx('flex items-center gap-2 px-3 h-8 rounded-full text-[13px] font-semibold whitespace-nowrap', isActive ? 'bg-brand-soft text-brand font-bold' : 'text-muted hover:text-ink hover:bg-surface-2/70 transition-colors')}>
                <LeagueLogo comp={c} size={16} />{c.short}
              </NavLink>
            ))}
          </div>
        </div>
        <OfflineBanner />
      </header>

      <DataBanner />
      <main className="flex-1 pb-24 md:pb-0"><ErrorBoundary key={loc.pathname + loc.search}><Outlet /></ErrorBoundary></main>

      <footer className="border-t border-line mt-12 md:mt-16 bg-surface pb-24 md:pb-0" aria-label="Site footer">
        <div className="max-w-[88rem] mx-auto px-4 pt-8 md:pt-10 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          <div className="max-w-xl">
            <Link to="/" aria-label="Goal4U home" className="inline-block"><SiteLogo className="h-9 w-auto" /></Link>
            <p className="text-sm text-muted mt-3 leading-relaxed">Goal4U brings live football scores, fixtures and results, league tables, line-ups, shot maps, top performers, highlights and news from the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, the Champions League, the Championship, the World Cup and the Euros.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7 text-sm">
            <nav aria-label="Leagues"><p className="font-bold mb-2.5">Leagues</p><ul className="space-y-2 text-muted">{COMPS.map((c) => <li key={c.code}><Link className="hover:text-ink" to={`/competition/${c.slug}`}>{c.name}</Link></li>)}</ul></nav>
            <nav aria-label="Tournaments"><p className="font-bold mb-2.5">Tournaments</p><ul className="space-y-2 text-muted">{TOURNAMENTS.map((c) => <li key={c.code}><Link className="hover:text-ink" to={`/competition/${c.slug}`}>{c.name}</Link></li>)}</ul></nav>
            <nav aria-label="Explore" className="max-sm:col-span-2"><p className="font-bold mb-2.5">Explore</p><ul className="space-y-2 text-muted"><li><Link className="hover:text-ink" to="/matches">Scores &amp; fixtures</Link></li><li><Link className="hover:text-ink" to="/matches?filter=live">Live now</Link></li><li><Link className="hover:text-ink" to="/watch">Watch highlights</Link></li><li><Link className="hover:text-ink" to="/news">Football news</Link></li></ul></nav>
          </div>
        </div>
        <div className="max-w-[88rem] mx-auto px-4 mt-8 py-4 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5"><p>© {new Date().getFullYear()} Goal4U. All rights reserved.</p><nav aria-label="About Goal4U" className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">{[['About', '/about'], ['Contact', '/contact'], ['Privacy Policy', '/privacy'], ['Terms of Use', '/terms']].map(([l, h]) => <Link key={h} to={h} className="hover:text-ink">{l}</Link>)}</nav></div>
          <p>Scores update every few minutes.</p>
        </div>
      </footer>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur border-t border-line grid grid-cols-5 safe-bottom" aria-label="Primary">
        {tab('/', Home, 'Home', (p) => p === '/')}
        {tab('/matches', CalendarDays, 'Scores', (p) => p.startsWith('/matches') || p.startsWith('/match/'))}
        {tab('/competition/premier-league', Trophy, 'Tables', (p) => p.startsWith('/competition') || p.startsWith('/team'))}
        {tab('/watch', PlayCircle, 'Watch', (p) => p.startsWith('/watch'))}
        {tab('/news', Newspaper, 'News', (p) => p.startsWith('/news'))}
      </nav>
      <SearchOverlay open={searchOpen} onClose={() => setSearch(false)} />
    </div>
  );
}
