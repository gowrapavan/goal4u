import { LeagueLogo } from '../components/LeagueLogo';
import { ErrorState, TableSkel } from '../components/states';
import { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { competitionSeo } from '../lib/seo-text';
import { Crest, Skel, MatchRow, Empty, cx } from '../components/ui';
import { StandingsTable, ScorerList } from '../components/Table';
import { InsightList, buildInsights } from '../components/Insights';
import { ValueList, DecoratedList, MvpCard, LeagueFacts, VALUE_NOTE } from '../components/Values';
import {
  compBySlug, getFeed, getTables, getScorers, getMarketValues, getLeagueMeta, getDecorated, VALUE_CODES,
  useAsync, phase, teamHref, FMatch, dayLabel, groupByDay,
} from '../lib/api';
import { discoverCompetitionSeasons } from '../services/api';
import { ComingSoon, PitchArt } from '../components/ComingSoon';
import { AnalyticsPanel, PredictionsPanel } from '../components/LeagueAnalytics';
import { useCenterActive } from '../hooks/useCenterActive';
import { getCurrentSeasonLabel, getCurrentTournamentYear } from '../utils/formatting';
import NotFound from './NotFound';

const BASE_TABS: [string, string][] = [['table', 'Table'], ['matches', 'Matches'], ['stats', 'Stats'], ['analytics', 'Analytics'], ['clubs', 'Clubs']];
const RULES: Record<string, [number, number]> = { PL: [4, 3], PD: [4, 3], SA: [4, 3], BL1: [4, 3], FL1: [3, 3], ELC: [2, 3], CL: [8, 0] };

/** Consistent block: heading above, content below. */
const Block = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <section><div className="mb-3"><h2 className="display text-3xl">{title}</h2>{sub && <p className="text-sm text-muted mt-1">{sub}</p>}</div>{children}</section>
);
const CardHead = ({ children }: { children: React.ReactNode }) => <p className="px-4 pt-4 pb-2 font-bold">{children}</p>;

export function Competition() {
  const { slug, season } = useParams();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const comp = compBySlug(slug);

  const pathTab = pathname.startsWith('/fixtures') || pathname.startsWith('/results') ? 'matches' : pathname.startsWith('/stats') ? 'stats' : pathname.startsWith('/analytics') ? 'analytics' : pathname.startsWith('/predictions') ? 'predictions' : 'table';
  const code = comp?.code || '';
  // Predictions simulate a league run-in, so they exist for domestic leagues only (not cups or tournaments).
  const TABS: [string, string][] = comp && !comp.cup ? [...BASE_TABS.slice(0, 4), ['predictions', 'Predictions'], BASE_TABS[4]] : BASE_TABS;
  const wanted = sp.get('tab') || pathTab;
  const tab = TABS.some(([k]) => k === wanted) ? wanted : 'table';
  const hasTM = VALUE_CODES.includes(code);

  const tables = useAsync(() => (code ? getTables(code, season) : Promise.resolve([])), [code, season]);
  const scorers = useAsync(() => (code ? getScorers(code, season) : Promise.resolve([])), [code, season]);
  const all = useAsync(() => (code ? getFeed({ codes: [code], season }) : Promise.resolve([] as FMatch[])), [code, season]);
  const seasons = useAsync(() => (code ? discoverCompetitionSeasons(code) : Promise.resolve([])), [code]);
  // Market-value intelligence is current-season only, except the all-time trophy room.
  const intel = useAsync(() => (hasTM && !season ? getLeagueMeta(code) : Promise.resolve(null)), [code, season]);
  const values = useAsync(() => (hasTM && !season ? getMarketValues(code, 25) : Promise.resolve([])), [code, season]);
  const decorated = useAsync(() => (hasTM ? getDecorated(code) : Promise.resolve([])), [code]);

  // Matchday pager: default to the first matchday that still has unplayed games
  const days = useMemo(() => {
    const ms = all.data || [];
    const keys = [...new Set(ms.map((m) => (m.matchday ?? 0)))].sort((a, b) => a - b);
    // Current matchday = the latest matchday that has been played, or the next one once it is complete.
    // Postponed / suspended games are ignored, otherwise one postponed match pins the pager to an old matchday.
    const inMd = (k: number) => ms.filter((m) => (m.matchday ?? 0) === k);
    const active = (m: FMatch) => ['live', 'started', 'upcoming'].includes(phase(m));
    const played = (m: FMatch) => ['ft', 'live', 'started'].includes(phase(m));
    const pos = keys.filter((k) => k > 0);
    const lastPlayed = [...pos].reverse().find((k) => inMd(k).some(played));
    let current: number | undefined;
    if (lastPlayed === undefined) current = pos[0] ?? keys[0];
    else if (inMd(lastPlayed).some(active)) current = lastPlayed;
    else current = pos.find((k) => k > lastPlayed) ?? (inMd(0).some(active) ? 0 : lastPlayed);
    return { keys, current };
  }, [all.data]);
  const md = Number(sp.get('md')) || days.current;
  const mdRow = useCenterActive(md);      // mobile: keep the selected matchday centred
  const flatRows = useMemo(() => (tables.data || []).flatMap((t) => t.table), [tables.data]);
  const insights = useMemo(() => buildInsights(flatRows, scorers.data || []), [flatRows, scorers.data]);
  const recent = useMemo(() => (all.data || []).filter((m) => phase(m) === 'ft').sort((a, b) => b.utcDate.localeCompare(a.utcDate)).slice(0, 20), [all.data]);

  if (!comp) return <NotFound />;
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n, { replace: true }); };
  const mdMatches = (all.data || []).filter((m) => (m.matchday ?? 0) === md).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const [qualify, relegate] = RULES[code] || [4, 3];
  // A tournament is labelled by the edition the DATA is about (the repo may still hold the previous edition, e.g. Euro 2024),
  // never by the calendar: the upcoming edition gets an "available soon" notice instead of mislabelled results.
  const upcomingYear = comp.tournament ? getCurrentTournamentYear(comp.code as 'WC' | 'EC') : '';
  const kicks = (all.data || []).map((m: any) => Date.parse(m.utcDate)).filter((n: number) => Number.isFinite(n));
  const editionYear = comp.tournament && kicks.length ? String(new Date(Math.min(...kicks)).getUTCFullYear()) : '';
  const seasonLabel = comp.tournament ? (season || editionYear || upcomingYear) : (season || getCurrentSeasonLabel());
  const nextEditionSoon = !!comp.tournament && !!editionYear && Number(editionYear) < Number(upcomingYear);
  const crests: Record<number, string> = Object.fromEntries(flatRows.map((r: any) => [r.team.id, r.team.crest]));
  const soonLinks = [{ to: `/competition/${comp.slug}?tab=table`, label: 'Table' }, { to: '/matches', label: 'Scores' }];
  // A tournament whose data repo folder has no fixtures or groups yet (e.g. Euro 2028): a proper "available soon" page.
  if (comp.tournament && !all.loading && !tables.loading && !all.data?.length && !tables.data?.length) {
    const other = comp.code === 'WC' ? { to: '/competition/european-championship', label: 'UEFA Euro' } : { to: '/competition/fifa-world-cup', label: 'FIFA World Cup' };
    return <ComingSoon variant="page" badge={`${comp.country} · ${seasonLabel}`} title={`${comp.name} ${seasonLabel} is coming soon`} seoTitle={`${comp.name} ${seasonLabel} | Goal4U`}
      message={`Fixtures, groups, results and stats for the ${comp.name} will appear here as soon as the tournament schedule is published.`}
      actions={[{ to: '/matches', label: 'Today’s scores', primary: true }, other, { to: '/', label: 'Home' }]} />;
  }

  return (
    <div>
      <SEO {...competitionSeo(comp.name, seasonLabel.replace('-', '/'))} breadcrumbLeaf={comp.name} />
      <div className="bg-surface border-b border-line">
        <div className="max-w-[88rem] mx-auto px-4 pt-6">
          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-5 items-center pb-5">
            <div className="min-w-0">
              <div className="flex items-center gap-4">
                <LeagueLogo comp={comp} size={64} minSize={44} />
                <div className="min-w-0">
                  <h1 className="display text-[clamp(1.75rem,8vw,2.1rem)] sm:text-5xl break-words">{comp.name}</h1>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1.5">
                    <span className="text-muted text-sm">{comp.country} · {seasonLabel.replace('-', '/')} {comp.tournament ? 'edition' : 'season'}</span>
                    {seasons.data && seasons.data.length > 1 && (
                      <select aria-label="Season" value={season || ''} onChange={(e) => nav(e.target.value ? `/competition/${comp.slug}/${e.target.value}` : `/competition/${comp.slug}`)} className="chip !h-7 pr-6 text-xs">
                        <option value="">Current</option>
                        {seasons.data.map((s: any) => <option key={s.value} value={s.value}>{s.value.replace('-', '/')}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              <LeagueFacts intel={intel.data} />
            </div>
            {(intel.loading && hasTM && !season) || intel.data?.mvp ? <MvpCard intel={intel.data} loading={intel.loading} className="lg:w-[420px]" /> : null}
          </div>
          {nextEditionSoon && (
            <div className="card flex items-center gap-4 p-3 sm:p-4 mb-4 bg-brand-soft/50">
              <div className="w-24 sm:w-32 shrink-0"><PitchArt /></div>
              <div className="min-w-0"><p className="font-bold">{comp.name} {upcomingYear} is available soon</p>
                <p className="text-sm text-muted">You are looking at the {editionYear} tournament. The {upcomingYear} fixtures, groups and stats will appear here once they are published.</p></div>
            </div>
          )}
          <div className="tabs-x gap-1 -mb-px" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setParam('tab', k)}
                className={cx('px-4 h-11 font-semibold text-sm border-b-[3px] whitespace-nowrap', tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[88rem] mx-auto px-4 py-6">
        {tab === 'table' && (
          <div className="grid lg:grid-cols-[minmax(290px,340px)_minmax(0,1fr)] gap-5 lg:items-stretch">
            {/* Left rail — on desktop it is pinned to the table's height; recent matches scroll inside it */}
            <aside className="order-2 lg:order-1 lg:relative">
              <div className="flex flex-col gap-5 lg:absolute lg:inset-0">
                <section className="card overflow-hidden shrink-0"><CardHead>League insights</CardHead>{tables.loading ? <Skel className="h-48 m-4" /> : tables.error && !tables.data ? <div className="p-4"><ErrorState compact title="Insights couldn’t be loaded" onRetry={tables.retry} /></div> : <InsightList items={insights} code={code} />}</section>
                <section className="card overflow-hidden flex flex-col lg:flex-1 lg:min-h-0">
                  <div className="shrink-0"><CardHead>Recent matches</CardHead></div>
                  <div className="lg:flex-1 lg:overflow-y-auto lg:min-h-0">
                    {all.loading ? <Skel className="h-48 m-4" /> : all.error && !all.data ? <div className="p-4"><ErrorState compact title="Matches couldn’t be loaded" onRetry={all.retry} /></div> : recent.length ? groupByDay(recent).reverse().map(([day, ms]) => (
                      <div key={day}><p className="px-4 py-1.5 text-[11px] font-bold text-muted bg-surface-2/50 sticky top-0">{dayLabel(ms[0].utcDate)}</p><div className="divide-y divide-line/70">{ms.map((m) => <MatchRow key={m.id} m={m} />)}</div></div>
                    )) : <p className="px-4 pb-4 text-sm text-muted">No matches played yet this season.</p>}
                  </div>
                  <button onClick={() => setParam('tab', 'matches')} className="shrink-0 block w-full text-center text-sm font-semibold text-brand py-3 border-t border-line">All matches</button>
                </section>
              </div>
            </aside>
            <div className="order-1 lg:order-2 min-w-0 space-y-5">
              {tables.loading ? <TableSkel rows={14} /> :
              tables.error && !tables.data ? <ErrorState title="The table couldn’t be loaded" hint="Standings didn’t arrive. This isn’t an empty season." onRetry={tables.retry} /> :
              tables.data?.length ? (
                <>
                  {tables.data.map((t, i) => (
                    <div key={i} className="card overflow-hidden">
                      {tables.data!.length > 1 && <p className="px-4 py-3 font-bold border-b border-line">{t.group?.replace('_', ' ') || t.stage.replace('_', ' ')}</p>}
                      <StandingsTable rows={t.table} code={code} qualify={tables.data!.length > 1 ? 2 : qualify} relegate={tables.data!.length > 1 ? 0 : relegate} />
                    </div>
                  ))}
                </>
              ) : <Empty title="No table for this season yet" hint="Standings appear after the first round of matches." />}
            </div>
          </div>
        )}
        {tab === 'table' && tables.data?.length ? (
          <p className="text-xs text-muted flex gap-4 px-1 mt-3"><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-brand" />Qualification</span>{relegate > 0 && <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-live" />Relegation</span>}</p>
        ) : null}

        {tab === 'matches' && (
          all.loading ? <Skel className="h-80" /> : all.error && !all.data ? <ErrorState title="Fixtures couldn’t be loaded" hint="The match list didn’t arrive. This isn’t an empty season." onRetry={all.retry} /> : days.keys.length ? (
            <div>
              <div ref={mdRow} className="scroll-x snap-none gap-2 mb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
                {days.keys.map((k) => <button key={k} className="chip" aria-pressed={k === md} onClick={() => setParam('md', String(k))}>{k === 0 ? 'Knockouts' : `MD ${k}`}</button>)}
              </div>
              <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
                {mdMatches.map((m) => (
                  <div key={m.id} className="card overflow-hidden"><p className="px-4 pt-2.5 text-[11px] font-semibold text-muted">{dayLabel(m.utcDate)}</p><MatchRow m={m} /></div>
                ))}
              </div>
            </div>
          ) : <Empty title="No fixtures published" />
        )}

        {tab === 'stats' && (
          <div className="space-y-8">
            <Block title="League insights" sub="Calculated from this season’s results">
              {tables.loading ? <Skel className="h-24" /> : tables.error && !tables.data ? <ErrorState compact title="Insights couldn’t be loaded" onRetry={tables.retry} /> : insights.length ? <InsightList items={insights} code={code} layout="grid" /> : <Empty title="No insights yet" hint="They appear once matches have been played." />}
            </Block>
            <Block title="Player leaders" sub="Goals and assists this season">
              {scorers.loading ? <Skel className="h-80" /> : scorers.error && !scorers.data ? <ErrorState compact title="Player stats couldn’t be loaded" onRetry={scorers.retry} /> : scorers.data?.length ? (
                <div className="grid lg:grid-cols-2 gap-4 items-start">
                  <div className="card overflow-hidden"><CardHead>Top scorers</CardHead><ScorerList rows={scorers.data} code={code} limit={10} /></div>
                  <div className="card overflow-hidden"><CardHead>Most assists</CardHead><ScorerList rows={scorers.data.filter((s: any) => s.assists)} code={code} limit={10} metric="assists" /></div>
                </div>
              ) : <Empty title="No player stats yet" />}
            </Block>
            {hasTM && (
              <Block title="Talent & legacy" sub="Market values and all-time league titles">
                <div className="grid lg:grid-cols-2 gap-4 items-start">
                  <div className="card overflow-hidden"><CardHead>Most valuable players</CardHead>
                    {values.loading ? <Skel className="h-64 m-4" /> : values.error && !values.data ? <div className="p-4"><ErrorState compact title="Market values couldn’t be loaded" onRetry={values.retry} /></div> : values.data?.length ? <><ValueList players={values.data} limit={10} /><p className="px-4 py-3 text-[11px] text-muted">{VALUE_NOTE}</p></> : <p className="px-4 pb-4 text-sm text-muted">{season ? 'Market values are shown for the current season only.' : 'Market values are unavailable right now.'}</p>}
                  </div>
                  <div className="card overflow-hidden"><CardHead>Most decorated players</CardHead>
                    {decorated.loading ? <Skel className="h-64 m-4" /> : decorated.error && !decorated.data ? <div className="p-4"><ErrorState compact title="Trophy room couldn’t be loaded" onRetry={decorated.retry} /></div> : <><DecoratedList players={decorated.data || []} limit={10} /><p className="px-4 py-3 text-[11px] text-muted">All-time league titles won, from honours records.</p></>}
                  </div>
                </div>
              </Block>
            )}
          </div>
        )}

        {tab === 'analytics' && <AnalyticsPanel code={code} season={season} crests={crests} soon={soonLinks} />}
        {tab === 'predictions' && <PredictionsPanel code={code} season={season} crests={crests} soon={soonLinks} />}

        {tab === 'clubs' && (
          tables.loading ? <Skel className="h-80" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-3">
              {(tables.data?.flatMap((t) => t.table) || []).sort((a, b) => a.team.name.localeCompare(b.team.name)).map((r) => (
                <Link key={r.team.id} to={teamHref(code, r.team.id)} className="card p-4 flex flex-col items-center gap-3 hover:border-ink transition-colors">
                  <Crest src={r.team.crest} name={r.team.name} size={56} />
                  <span className="font-semibold text-center text-sm">{r.team.shortName || r.team.name}</span>
                </Link>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
