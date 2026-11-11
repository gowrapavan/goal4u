import { LeagueLogo } from '../components/LeagueLogo';
import { roundLabel } from '../lib/match-round';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { SEO } from '../components/SEO';
import { STATIC_SEO } from '../lib/seo-text';
import { Crest, Skel, SectionHead, MatchRow, VideoCard, VideoThumb, ShortCard, useVideoPlayer, Empty, cx } from '../components/ui';
import { Banner } from '../components/Banner';
import { ErrorState, SlowNetworkIndicator } from '../components/states';
import { pickHero, hasOpenMatch, LOOK_AHEAD_DAYS } from '../lib/hero';
import { VsMatchCard, VsCenter, StatusChip } from '../components/MatchCard';
import { ValueLeaders } from '../components/Values';
import { NewsThumb, NewsMeta, NewsTag, Article, ext } from '../components/NewsParts';
import { StandingsTable, ScorerList } from '../components/Table';
import {
  COMPS, FMatch, addDays, ymd, getFeed, getVideos, getShorts, getTables, getScorers, getNews, timeAgo, useAsync,
  phase, matchHref, tn, kickoff, dayLabel, groupByDay, compByCode, teamHref, stadiumBg, uniqueMatches,
} from '../lib/api';

// Rail cards are sized relative to the rail: 3.5 visible on tablets, 4.5 on laptops, 5.5 on wide screens.
const RAIL_W = 'w-[148px] md:w-[calc((100%-2.25rem)/3.5)] lg:w-[calc((100%-3rem)/4.5)] xl:w-[calc((100%-3.75rem)/5.5)]';

/** Segmented countdown (days / hrs / min). Under a minute it says so instead of showing 00 : 00. */
function CountdownTiles({ to, now }: { to: string; now: number }) {
  const ms = Date.parse(to) - now;
  if (ms <= 0) return <span className="text-sm font-semibold">Kick-off</span>;
  if (ms < 60_000) return <span className="inline-flex items-center gap-2 text-sm font-bold"><span className="live-dot" />Kick-off in under a minute</span>;
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  const tiles: [number, string][] = [...(d > 0 ? [[d, 'days'] as [number, string]] : []), [h, 'hrs'], [m, 'min']];
  return (
    <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2" role="timer" aria-label={`Kick-off in ${d} days ${h} hours ${m} minutes`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/75 sm:mr-1">Kick-off in</span>
      <span className="flex items-center gap-2">
        {tiles.map(([v, l]) => (
          <span key={l} className="rounded-xl bg-white/12 border border-white/15 px-2.5 py-1 text-center min-w-[50px]">
            <span className="block display num text-2xl leading-none">{String(v).padStart(2, '0')}</span>
            <span className="block text-[9px] uppercase tracking-wider text-white/70 mt-0.5">{l}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function Hero({ m }: { m: FMatch & { seasonSlug?: string } }) {
  // One clock for the whole card: it ticks every 20 s (every second in the last two minutes before kick-off) so the card flips from the countdown to LIVE by itself.
  const [now, setNow] = useState(Date.now());
  const untilKick = Date.parse(m.utcDate) - now;
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), untilKick > -5_000 && untilKick < 120_000 ? 1_000 : 20_000); return () => clearInterval(t); }, [untilKick > -5_000 && untilKick < 120_000]);
  const p = phase(m, now); const comp = compByCode(m.code);
  const played = p === 'live' || p === 'ft';
  const Side = ({ t, tag }: { t: FMatch['homeTeam']; tag: string }) => (
    <Link to={teamHref(m.code, t.id)} className="group flex min-w-0 flex-col items-center gap-3 text-center">
      <span className="relative">
        <span aria-hidden className="absolute -inset-5 rounded-full bg-white/25 blur-2xl" />
        <span className="relative block crest-shadow"><Crest src={t.crest} name={t.name} size={132} minSize={60} /></span>
      </span>
      <span className="display text-[clamp(1.1rem,4.6vw,1.5rem)] sm:text-3xl lg:text-[2.6rem] leading-[1.02] max-w-full [overflow-wrap:anywhere] text-shadow group-hover:underline decoration-lime decoration-4 underline-offset-4">{tn(t)}</span>
      <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/70">{tag}</span>
    </Link>
  );
  return (
    <Banner bg={stadiumBg(m.code)} scrim="normal" className="h-full flex flex-col">
      <div className="flex-1 flex flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2.5 h-9 text-xs sm:text-sm font-bold text-white min-w-0 text-shadow">
            <span className="grid place-items-center w-6 h-6 rounded-full bg-white shrink-0"><LeagueLogo tone="light" comp={comp} size={18} /></span>
            <span className="truncate">{comp?.name}{roundLabel({ stage: (m as any).stage, matchday: m.matchday, group: (m as any).group }, m.code) ? ` · ${roundLabel({ stage: (m as any).stage, matchday: m.matchday, group: (m as any).group }, m.code)}` : ''}</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center h-7 px-3 rounded-full bg-lime text-lime-ink text-[11px] font-bold">Featured match</span>
            <StatusChip m={m} tone="dark" />
          </span>
        </div>

        <div className="flex-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-8 py-1 text-white">
          <Side t={m.homeTeam} tag="Home" />
          <div className="flex flex-col items-center justify-center text-center">
            <VsCenter m={m} size="lg" onDark />
            {played && <p className="mt-1.5 text-xs font-semibold text-white/85">{p === 'live' ? 'Live score' : 'Full time'}</p>}
          </div>
          <Side t={m.awayTeam} tag="Away" />
        </div>

        <div className="glass rounded-2xl px-4 py-3.5 flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between sm:text-left gap-3 text-white">
          <span className="flex items-center justify-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-lime shrink-0" />{new Date(m.utcDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {kickoff(m.utcDate)}</span>
          {p === 'upcoming' ? <CountdownTiles to={m.utcDate} now={now} /> : <span className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-white/90">{p === 'live' && <span className="live-dot" />}{p === 'ft' ? 'Final score' : p === 'live' ? 'In play now' : 'Kick-off time has passed'}</span>}
          <Link to={matchHref(m)} className="btn-logo w-full sm:w-auto shrink-0">
            Match centre <span className="btn-logo-dot"><ArrowRight size={15} /></span>
          </Link>
        </div>
      </div>
    </Banner>
  );
}

function ValueSection() {
  return (
    <section>
      <SectionHead title="Most valuable players" sub="Highest market value — switch between leagues" href="/competition/premier-league?tab=stats" label="Full rankings" />
      <ValueLeaders />
    </section>
  );
}

function NewsSection() {
  const n = useAsync(getNews, []);
  // Home shows only stories with a picture that loads, newest first (the server already ranks newest band first).
  // Cards show at once (pictures load lazily); a picture that fails to load drops its story and the next illustrated one steps in.
  const candidates = ((n.data?.articles || []) as Article[]).filter((a) => a.title && a.url && a.urlToImage).slice(0, 14);
  const [bad, setBad] = useState<Set<string>>(() => new Set());
  const reportBad = useCallback((u: string) => setBad((cur) => (cur.has(u) ? cur : new Set(cur).add(u))), []);
  const items = candidates.filter((a) => !bad.has(a.urlToImage as string)).slice(0, 5);
  if (n.error && !n.data) return <section><SectionHead title="Football news" sub="Stories on the matches played and coming up" href="/news" label="All news" /><ErrorState compact title="News couldn’t be loaded" onRetry={n.retry} /></section>;
  if (!n.loading && items.length < 3) return null;            // hide quietly if there are not enough illustrated stories
  const [lead, ...rest] = items;
  return (
    <section>
      <SectionHead title="Football news" sub="Stories on the matches played and coming up" href="/news" label="All news" />
      {n.loading || !lead ? (
        <>
          <div className="sm:hidden grid gap-2.5 -mx-1.5"><Skel className="h-[230px] rounded-xl" />{Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="h-[92px] rounded-xl" />)}</div>
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">{Array.from({ length: 5 }).map((_, i) => <div key={i} className={i === 4 ? 'hidden xl:block' : ''}><Skel className="aspect-[16/10] rounded-xl" /><Skel className="h-4 mt-3 w-11/12" /><Skel className="h-4 mt-2 w-2/3" /></div>)}</div>
        </>
      ) : (
        <>
          {/* phones: lead story + compact rows */}
          <div className="sm:hidden grid gap-2.5 -mx-1.5">
            <a href={lead.url} {...ext} className="group card block overflow-hidden rounded-xl">
              <span className="relative block aspect-[16/10] bg-surface-2"><span className="absolute inset-0"><NewsThumb onBad={reportBad} a={lead} plain /></span></span>
              <span className="block p-3">
                <NewsTag a={lead} />
                <span className="block display text-[1.2rem] mt-2 leading-[1.1] line-clamp-4">{lead.title}</span>
                <span className="block mt-1.5 text-xs text-muted">{lead.source?.name}{lead.publishedAt ? ` · ${timeAgo(lead.publishedAt)}` : ''}</span>
              </span>
            </a>
            {rest.map((a) => (
              <a key={a.url} href={a.url} {...ext} className="group card overflow-hidden flex flex-row items-stretch rounded-xl">
                <span className="relative block w-[92px] shrink-0 bg-surface-2 overflow-hidden"><NewsThumb onBad={reportBad} a={a} className="text-2xl" /></span>
                <span className="flex flex-col flex-1 min-w-0 p-2.5 gap-1.5">
                  <span className="text-[13.5px] font-semibold leading-snug line-clamp-2">{a.title}</span>
                  <span className="mt-auto"><NewsMeta a={a} /></span>
                </span>
              </a>
            ))}
          </div>
          {/* tablet + desktop: equal editorial cards — image on top, headline below, no overlay text */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6">
            {items.map((a, i) => (
              <a key={a.url} href={a.url} {...ext} className={cx('group flex-col', i === 4 ? 'hidden xl:flex' : 'flex')}>
                <span className="relative block aspect-[16/10] overflow-hidden rounded-xl bg-surface-2">
                  <NewsThumb onBad={reportBad} a={a} className="group-hover:scale-[1.04] transition-transform duration-500 text-3xl" />
                </span>
                <span className="mt-3 text-[15px] font-bold leading-snug line-clamp-3 group-hover:text-brand">{a.title}</span>
                <span className="mt-2"><NewsMeta a={a} /></span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LeagueSnapshot() {
  const [code, setCode] = useState('PL'); const comp = compByCode(code)!;
  const t = useAsync(() => getTables(code), [code]);
  const sc = useAsync(() => getScorers(code), [code]);
  const rows = t.data?.[0]?.table;
  return (
    <section>
      <SectionHead title="League snapshot" href={`/competition/${comp.slug}`} label={`${comp.short} hub`} />
      <div className="scroll-x gap-2 mb-3 -mx-4 px-4 lg:mx-0 lg:px-0">
        {COMPS.filter((c) => !c.cup).map((c) => <button key={c.code} className="chip" aria-pressed={c.code === code} onClick={() => setCode(c.code)}><LeagueLogo comp={c} size={16} />{c.short}</button>)}
      </div>
      <div className="grid lg:grid-cols-5 gap-4">
        <div className="card lg:col-span-3 overflow-hidden">
          {t.loading ? <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skel key={i} className="h-9" />)}</div>
            : t.error && !t.data ? <div className="p-4"><ErrorState compact title="Table couldn’t be loaded" onRetry={t.retry} /></div>
            : rows ? <><StandingsTable rows={rows.slice(0, 8)} code={code} compact /><Link to={`/competition/${comp.slug}`} className="block text-center text-sm font-semibold text-brand py-3 border-t border-line">View all {rows.length} teams</Link></>
            : <div className="p-6"><Empty title="Table unavailable" hint="This competition has no standings yet." /></div>}
        </div>
        <div className="card lg:col-span-2 overflow-hidden">
          <p className="px-4 pt-4 pb-1 font-bold">Golden Boot race</p>
          {sc.loading ? <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="h-9" />)}</div>
            : sc.error && !sc.data ? <div className="p-4"><ErrorState compact title="Scorers couldn’t be loaded" onRetry={sc.retry} /></div>
            : sc.data?.length ? <ScorerList rows={sc.data} code={code} limit={6} /> : <p className="p-4 text-sm text-muted">No scorer data yet.</p>}
        </div>
      </div>
    </section>
  );
}

export function Home() {
  const today = useMemo(() => new Date(), []);
  // Last 8 days + next 8. When NOTHING is live, under way or still to come in that window (international break, winter break, off-season) the home page would
  // show only finished games under "Next up": then the next 8-60 days are fetched too, so the real next fixtures lead.
  const feed = useAsync(async () => {
    const base = await getFeed({ from: ymd(addDays(today, -8)), to: ymd(addDays(today, 8)) });
    if (hasOpenMatch(base)) return base;
    const later = await getFeed({ from: ymd(addDays(today, 8)), to: ymd(addDays(today, LOOK_AHEAD_DAYS)) }).catch(() => [] as FMatch[]);
    return [...base, ...later];
  }, []);
  const vids = useAsync(() => getVideos(12), []);
  const shorts = useAsync(() => getShorts(24), []);
  const { play, modal } = useVideoPlayer();

  const { hero, rail, results: collapsed, allResults } = useMemo(() => {
    const ms = feed.data || [];
    const live = ms.filter((m) => phase(m) === 'live');
    const started = ms.filter((m) => phase(m) === 'started');
    const upcoming = ms.filter((m) => phase(m) === 'upcoming');
    const done = ms.filter((m) => phase(m) === 'ft').sort((a, b) => b.utcDate.localeCompare(a.utcDate));
    // Nearest match of a priority club (Real Madrid, Barcelona, Man United, Bayern, PSG, Arsenal, Man City, Atlético) — see lib/hero.ts
    const hero = pickHero(uniqueMatches(ms));
    const rail = uniqueMatches([...live, ...started, ...upcoming.slice(0, 14)]).slice(0, 16);
    // Saturday alone can have 40+ finished matches, so the newest 10 were all Sunday/late-Saturday games and earlier ones (e.g. a 15:30 kick-off)
    // never appeared. Collapsed = the newest 10; expanded = every result of the last 3 days.
    const since = Date.now() - 3 * 86400_000;
    const recent = done.filter((m) => Date.parse(m.utcDate) >= since);
    return { hero, rail: rail.length ? rail : done.slice(0, 12), results: done.slice(0, 10), allResults: recent.length > 10 ? recent : done.slice(0, 10) };
  }, [feed.data]);
  const [showAll, setShowAll] = useState(false);
  const results = showAll ? allResults : collapsed;

  const liveCount = (feed.data || []).filter((m) => phase(m) === 'live').length;

  return (
    <div className="max-w-[88rem] mx-auto px-4 pt-4 sm:pt-5 space-y-8 sm:space-y-10">
      <SEO {...STATIC_SEO.home} />

      {/* Scoreboard rail */}
      <section aria-label="Matches">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-[13px] sm:text-[15px] flex items-center gap-1.5">{liveCount > 0 ? <><span className="live-dot" /> {liveCount} live now</> : 'Next up'}</p>
          <Link to="/matches" className="text-[13px] sm:text-sm font-semibold text-brand">All scores</Link>
        </div>
        <div className="scroll-x gap-3 -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
          {feed.loading ? Array.from({ length: 4 }).map((_, i) => <Skel key={i} className={`${RAIL_W} h-[148px] max-md:h-[112px] rounded-[var(--radius-card)]`} />) : feed.error && !feed.data ? <ErrorState compact className="w-full" title="Scores couldn’t be loaded" hint="The match list didn’t arrive. This isn’t an empty matchday." onRetry={feed.retry} /> : rail.map((m) => <VsMatchCard key={m.id} m={m} compact className={RAIL_W} />)}
        </div>
        <SlowNetworkIndicator loading={feed.loading} />
      </section>

      {/* Hero + video feed */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        {feed.loading ? <Skel className="h-[360px] rounded-2xl" /> : feed.error && !feed.data ? null : hero ? <Hero m={hero} /> : <Empty icon={CalendarDays} title="No matches in the next few days" hint="Check back on matchday." action={{ label: 'See all scores', to: '/matches' }} />}
        <aside className="card p-4" aria-label="Latest videos">
          <div className="flex items-center justify-between mb-3"><p className="font-bold">Latest videos</p><Link to="/watch" className="text-sm font-semibold text-brand lg:hidden">More on Watch</Link></div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {vids.loading ? Array.from({ length: 3 }).map((_, i) => <Skel key={i} className="h-20 sm:h-44 lg:h-20" />)
              : vids.error && !vids.data ? <div className="sm:col-span-3 lg:col-span-1"><ErrorState compact title="Videos couldn’t be loaded" onRetry={vids.retry} /></div>
              : !vids.data?.length ? <p className="text-sm text-muted sm:col-span-3 lg:col-span-1">No videos available right now.</p>
              : vids.data.slice(0, 3).map((v) => (
                <Link key={v.videoId} to={`/watch?v=${v.videoId}`} className="group flex items-start gap-3 text-left w-full min-w-0 sm:flex-col lg:flex-row">
                  <VideoThumb v={v} className="w-[132px] sm:w-full lg:w-[124px] aspect-video rounded-lg object-cover bg-surface-2 shrink-0" />
                  <span className="min-w-0"><span className="block text-sm font-semibold leading-snug line-clamp-3 group-hover:text-brand">{v.title}</span><span className="block text-xs text-muted mt-1 truncate">{v.channelName}</span></span>
                </Link>
              ))}
          </div>
          <Link to="/watch" className="hidden lg:block text-center text-sm font-semibold text-brand mt-4">More on Watch</Link>
        </aside>
      </div>

      <NewsSection />

      <ValueSection />

      <LeagueSnapshot />

      {/* Shorts */}
      <section>
        <SectionHead title="Shorts" href="/watch" label="Watch more" sub="Goals, skills and moments in under a minute" />
        <div className="scroll-x gap-3 -mx-4 px-4 lg:mx-0 lg:px-0">
          {shorts.loading ? Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="w-[160px] aspect-[9/16] rounded-2xl" />) : shorts.error && !shorts.data ? <ErrorState compact className="w-full" title="Shorts couldn’t be loaded" onRetry={shorts.retry} /> : !shorts.data?.length ? <p className="text-sm text-muted">No shorts available right now.</p> : shorts.data.map((v) => <ShortCard key={v.videoId} v={v} onPlay={play} />)}
        </div>
      </section>

      {/* Results */}
      <section>
        <SectionHead title="Latest results" href="/matches" />
        {/* One day per card, two cards side by side on wide screens: a score row never has to stretch across the whole page */}
        {feed.loading || (feed.error && !feed.data) || !results.length ? (
          <div className="card overflow-hidden">
            {feed.loading ? <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-12" />)}</div>
              : feed.error && !feed.data ? <div className="p-4"><ErrorState compact title="Results couldn’t be loaded" onRetry={feed.retry} /></div>
              : <div className="p-6 text-center text-muted text-sm">No recent results in the last 8 days.</div>}
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-3 items-start">
            {groupByDay(results).reverse().map(([day, ms]) => (
              <div key={day} className="card overflow-hidden">
                <p className="px-4 py-2 text-xs font-bold text-muted bg-surface-2/50">{dayLabel(ms[0].utcDate)}</p>
                <div className="divide-y divide-line/70">{ms.map((m) => <MatchRow key={m.id} m={m} showComp />)}</div>
              </div>
            ))}
          </div>
        )}
        {!feed.loading && allResults.length > collapsed.length && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="card w-full mt-3 py-3 text-sm font-semibold text-brand hover:bg-surface-2/60 transition-colors" aria-expanded={showAll}>
            {showAll ? 'Show fewer results' : `Show all ${allResults.length} results from the last 3 days`}
          </button>
        )}
      </section>

      {/* Highlights */}
      <section>
        <SectionHead title="Highlights & features" href="/watch" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6">
          {vids.loading ? Array.from({ length: 4 }).map((_, i) => <Skel key={i} className="aspect-video" />) : vids.error && !vids.data ? <p className="col-span-full text-sm text-muted">Highlights are unavailable while videos can’t be loaded.</p> : !vids.data?.length ? <p className="col-span-full text-sm text-muted">No highlights available right now.</p> : vids.data.slice(3, 11).map((v) => <VideoCard key={v.videoId} v={v} onPlay={play} />)}
        </div>
      </section>
      {modal}
    </div>
  );
}
