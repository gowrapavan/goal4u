import { TeamColorsProvider, useCrestColors } from '../lib/team-colors';
import { LeagueLogo } from '../components/LeagueLogo';
import { ErrorState, MatchPageSkel, StaleNotice } from '../components/states';
import { useEffect, useState } from 'react';
import { useCenterActive } from '../hooks/useCenterActive';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { matchSeo, matchHeading, commonName } from '../lib/seo-text';
import { Crest, Skel, Empty, cx } from '../components/ui';
import { MatchHero } from '../components/match/MatchHero';
import { VsCenter, StatusChip } from '../components/MatchCard';
import { StateStrip, ComparePanel, FormStrip, H2HVisual, RelatedMeetings, NextFixtures } from '../components/match/MatchSnapshot';
import { getMatchBundle, getMatchLive, getMatchDetails, getMatchIntel, getFeed, ymd, addDays, uniqueMatches, isOpen, stadiumBg, useAsync, phase, FMatch, StatsStatus, StatsPart, MoreStatRow, StatsSource, compByCode, teamHref, dayLabel, kickoff, tn } from '../lib/api';
import { FactList, FormPanel, H2HPanel, IntelError, IntelLoading, SeasonPanel, TablePanel } from '../components/match/MatchIntel';
import { KeyStats, StatsPanel, ScorerList } from '../components/match/MatchStatsUI';
import { LineupsTab } from '../components/match/LineupsUI';
import { Timeline } from '../components/match/MatchTimeline';
import { MatchSidebar } from '../components/match/MatchSidebar';
import { competitionLine } from '../lib/match-round';
import type { DetailsResponse } from '../lib/match-details-types';
import { TopPerformers, MatchInfoCard, PlayTime } from '../components/match/MatchExtrasUI';
import { ShotMap } from '../components/match/ShotMap';
import NotFound from './NotFound';

const TABS = [['summary', 'Summary'], ['context', 'Form & table'], ['stats', 'Stats'], ['lineups', 'Line-ups'], ['h2h', 'Head to head']] as const;
const STAT_ROWS: [string, string, boolean?][] = [
  ['possession', 'Possession'], ['expected_goals', 'Expected goals (xG)'], ['shots', 'Shots'], ['shots_on_target', 'Shots on target'],
  ['corners', 'Corners'], ['passes_accurate', 'Accurate passes'], ['total_passes', 'Total passes'], ['fouls', 'Fouls'],
  ['yellow_cards', 'Yellow cards'], ['offsides', 'Offsides'], ['goalkeeper_saves', 'Saves'],
];
// Only used to order events by minute and to compare an already-validated rating; never for statistics values.
const num = (v: any) => parseFloat(String(v ?? 0).replace('%', '')) || 0;

/** Empty state that says WHY: the live feed unreachable, the match not paired with it yet, not started, or simply no data. */
function NoStats({ reason, live }: { reason?: string | null; live: boolean }) {
  const hint = reason === 'upstream_unavailable' ? 'The statistics feed couldn\u2019t be reached just now.' + (live ? ' We keep retrying every 20 seconds.' : ' Please try again in a minute.')
    : reason === 'no_mapping' ? 'This match couldn\u2019t be paired with the statistics feed yet.' + (live ? ' We keep trying every 20 seconds.' : '')
    : reason === 'mismatch' ? 'The statistics feed returned a different match, so nothing is shown rather than the wrong numbers.'
    : reason === 'not_started' ? 'Statistics appear as soon as the match starts.'
    : live ? 'Live statistics appear here as soon as the feed has them.' : 'No detailed statistics have been published for this match.';
  return <Empty title={live ? 'Live statistics are on their way' : 'Detailed statistics aren\u2019t available for this match'} hint={hint} />;
}

const sourceNote = (src: StatsSource | undefined, derived?: boolean) =>
  src === 'live' ? `Live data, refreshed every 20 seconds${derived ? '; team totals are added up from player figures' : ''}.`
  : src === 'stats365' ? 'Match data.' : src === 'legacy' ? 'Match data.' : '';


export function MatchDetail() {
  const { id, season } = useParams(); const [sp] = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('summary');
  const tabRow = useCenterActive(tab);   // mobile: active tab centred, no scrollbar
  const [reload, setReload] = useState(0);
  const b = useAsync(() => getMatchBundle(id!, sp.get('c') || undefined, season), [id, season, reload]);
  // Context is computed from matches.json only, so it works with or without any statistics file.
  const intel = useAsync(() => (b.data?.match ? getMatchIntel(id!, b.data.code, b.data.season) : Promise.resolve(null)), [id, b.data?.code, b.data?.season, !!b.data?.match]);

  // Next fixtures for both teams (league + Champions League), de-duplicated. Skipped for archived-season pages.
  const nextFx = useAsync(async () => {
    const mm = b.data?.match; if (!mm || season) return null;
    const codes = [...new Set([b.data.code as string, 'CL'])];
    const ms = uniqueMatches(await getFeed({ codes, from: ymd(new Date()), to: ymd(addDays(new Date(), 90)) })).filter((x) => isOpen(x) && x.id !== mm.id);
    const pick = (tid: number) => ms.filter((x) => x.homeTeam.id === tid || x.awayTeam.id === tid).slice(0, 3);
    return { home: pick(mm.homeTeam.id), away: pick(mm.awayTeam.id) };
  }, [id, season, b.data?.code, !!b.data?.match]);

  // Live: while a match is in play the statistics half is re-fetched every 20 s (server cache 15 s). The server decides
  // WHICH source is used (see server/match-stats.ts); the page only renders what it gets.
  // Rich details (line-ups with photos and positions, shot map, top performers, match info): one extra request, English only.
  const det = useAsync(() => getMatchDetails(id!, sp.get('c') || undefined, season), [id, season]);
  const [detUp, setDetUp] = useState<DetailsResponse | null>(null);
  useEffect(() => { setDetUp(null); }, [id, season]);
  const details: DetailsResponse | undefined = (detUp ?? det.data) as DetailsResponse | undefined;
  const dt = details && details.available ? details.details : null;
  const [liveUp, setLiveUp] = useState<StatsPart | null>(null);
  const [liveErr, setLiveErr] = useState(false);       // the last live refresh failed: what is on screen may be out of date
  useEffect(() => { setLiveErr(false); }, [id, season]);
  useEffect(() => { setLiveUp(null); }, [id, season]);
  const part: StatsPart | undefined = (liveUp ?? b.data) as StatsPart | undefined;
  const eligible = !!part?.liveEligible; const bCode = b.data?.code as string | undefined;
  useEffect(() => {
    if (!eligible) return;
    let stop = false;
    const tick = async () => { if (stop || document.hidden) return; try { const j = await getMatchLive(id!, bCode, season); if (!stop && (j.stats || j.live)) setLiveUp(j); if (!stop) setLiveErr(false); } catch { if (!stop) setLiveErr(true); /* keep what is on screen */ } try { const d = await getMatchDetails(id!, bCode, season, true); if (!stop && d.available) setDetUp(d); } catch { /* keep what is on screen */ } };
    const t = setInterval(tick, 20_000);
    return () => { stop = true; clearInterval(t); };
  }, [id, season, eligible, bCode]);

  // A match that should be over but has no result yet: ask again every 30 s (quietly — the page is only rebuilt when something actually changed).
  const pendingNow = !!b.data?.match && phase({ ...b.data.match, code: b.data.code } as FMatch) === 'pending';
  useEffect(() => {
    if (!pendingNow) return;
    let stop = false;
    const sig = (x: any) => `${x?.match?.status}|${x?.match?.score?.fullTime?.home}|${x?.match?.score?.fullTime?.away}`;
    const base = sig(b.data);
    const t = setInterval(async () => {
      if (stop || document.hidden) return;
      try { const nb = await getMatchBundle(id!, sp.get('c') || undefined, season); if (!stop && sig(nb) !== base) setReload((n) => n + 1); } catch { /* try again next time */ }
    }, 30_000);
    return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNow, id, season]);

  const teamColors = useCrestColors(b.data?.match?.homeTeam?.crest, b.data?.match?.awayTeam?.crest);   // a hook: must stay above every early return
  if (b.loading) return <MatchPageSkel loading={b.loading} />;
  if (!b.data?.match) {
    // 404 = no such match. Anything else (503 data unavailable, network, server error) is a failed load, not a missing match.
    if (b.error && b.status !== 404 && b.status !== 400) return (
      <div className="max-w-xl mx-auto px-4 pt-16 pb-20"><ErrorState title="We couldn’t load this match" hint="The match data is temporarily unavailable. This is not a missing page. Please try again." onRetry={() => setReload((n) => n + 1)} /></div>
    );
    return <NotFound />;
  }
  const raw0 = b.data.match; const st = part!.stats; const code = b.data.code as string;
  const ss: StatsStatus | undefined = part!.statsStatus; const src = part!.statsSource; const lv = part!.live;
  // The data repo's copy of the fixture can lag by minutes. When the live feed has the match, its minute and score are
  // shown — but only to bring a not-yet-updated fixture forward; a fixture already FINISHED / postponed is never overridden.
  const lagging = ['IN_PLAY', 'PAUSED', 'TIMED', 'SCHEDULED'].includes(raw0.status);
  const raw = lv && lagging && lv.score.home != null && lv.score.away != null ? {
    ...raw0, status: lv.status === 'full time' ? 'FINISHED' : lv.status === 'half time' ? 'PAUSED' : 'IN_PLAY', minute: lv.minute,
    score: { ...raw0.score, fullTime: { home: lv.score.home, away: lv.score.away }, halfTime: lv.score.ht_home != null && lv.score.ht_away != null ? { home: lv.score.ht_home, away: lv.score.ht_away } : raw0.score?.halfTime },
  } : raw0;
  const m: FMatch = { ...raw, code, competition: raw.competition || {} };
  const p = phase(m); const comp = compByCode(code);
  // The score comes from the match record only — never from a statistics record.
  const fh = raw.score?.fullTime?.home; const fa = raw.score?.fullTime?.away;
  const ht = (raw.score?.halfTime?.home ?? -1) >= 0 && (raw.score?.halfTime?.away ?? -1) >= 0 ? raw.score.halfTime : null;   // the live source sends -1 for "not known"
  const dur = raw.score?.duration === 'EXTRA_TIME' ? 'After extra time' : raw.score?.duration === 'PENALTY_SHOOTOUT' ? 'Decided on penalties' : null;
  const pen = raw.score?.penalties?.home != null ? raw.score.penalties : null;
  const hasRes = fh != null && fa != null && p !== 'upcoming';
  const ref = raw.referees?.[0]?.name;
  const title = `${m.homeTeam.name} vs ${m.awayTeam.name}${hasRes ? ` ${fh}-${fa}` : ''} | ${comp?.short || code}`;

  return (
    <TeamColorsProvider value={teamColors}>
    <div className="max-w-[88rem] mx-auto px-4 max-sm:pt-0 pt-5 pb-8">
      <SEO {...matchSeo({ homeId: m.homeTeam.id, awayId: m.awayTeam.id, home: m.homeTeam.name, away: m.awayTeam.name, compName: comp?.name || code, compShort: comp?.short || code, status: m.status, scoreHome: raw.score?.fullTime?.home, scoreAway: raw.score?.fullTime?.away, utcDate: m.utcDate, matchday: m.matchday })}
        breadcrumbLeaf={`${commonName(m.homeTeam.id, m.homeTeam.name)} vs ${commonName(m.awayTeam.id, m.awayTeam.name)}`}
        schema={{ '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${commonName(m.homeTeam.id, m.homeTeam.name)} vs ${commonName(m.awayTeam.id, m.awayTeam.name)}`, startDate: m.utcDate, sport: 'Soccer',
          homeTeam: { '@type': 'SportsTeam', name: commonName(m.homeTeam.id, m.homeTeam.name) }, awayTeam: { '@type': 'SportsTeam', name: commonName(m.awayTeam.id, m.awayTeam.name) }, ...(comp ? { superEvent: { '@type': 'SportsEvent', name: comp.name } } : {}) }} />
      <h1 className="sr-only">{matchHeading({ homeId: m.homeTeam.id, awayId: m.awayTeam.id, home: m.homeTeam.name, away: m.awayTeam.name, compName: comp?.name || code, compShort: comp?.short || code, status: m.status, scoreHome: raw.score?.fullTime?.home, scoreAway: raw.score?.fullTime?.away, utcDate: m.utcDate, matchday: m.matchday })}</h1>
      <div className="grid lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)] gap-5 lg:gap-6 items-start">
      <div className="min-w-0">
      <MatchHero m={m} raw={raw} code={code} season={season} events={st?.events} venue={raw.venue || dt?.info.venue} referee={ref || dt?.info.referee}
        attendance={dt?.info.attendance} ht={ht} hasRes={hasRes} dur={dur} pen={pen} />


      <div ref={tabRow} className="tabs-x gap-1 mt-5 border-b border-line -mx-4 px-4 sm:mx-0 sm:px-0" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('px-3.5 sm:px-4 h-11 text-sm font-semibold border-b-[3px] -mb-px whitespace-nowrap', tab === k ? 'border-brand' : 'border-transparent text-muted hover:text-ink')}>{l}</button>)}
      </div>

      <div className={cx(tab !== 'summary' && 'card p-4 sm:p-6', 'mt-4')}>
        {tab === 'summary' && (
          <div className="space-y-4">
            {liveErr && !!eligible && <StaleNotice what="the live score" auto />}
            <StateStrip m={m} />
            {dt && <MatchInfoCard d={dt} homeName={tn(m.homeTeam)} awayName={tn(m.awayTeam)} />}
            {dt && <TopPerformers performers={dt.performers} potm={dt.potm} homeName={tn(m.homeTeam)} awayName={tn(m.awayTeam)} />}
            <KeyStats stats={st?.stats ?? null} more={st?.moreStats} home={m.homeTeam} away={m.awayTeam} live={src === 'live' && lv?.status !== 'full time'} onAll={() => setTab('stats')} />
            {(p === 'ft' || p === 'live' || p === 'pending' || st?.events?.length) && (
              <section className="card p-4 sm:p-5">
                <h3 className="display-wide text-base mb-3">Match events</h3>
                {st?.events?.length ? (
                  <>
                    <Timeline events={st.events} details={dt} />
                    <p className="text-xs text-muted mt-4">{sourceNote(src, lv?.statsDerived)} The goal events agree with the {src === 'live' && lv?.status !== 'full time' ? 'live' : 'final'} score.{ss?.events?.note ? ` ${ss.events.note}` : ''}</p>
                  </>
                ) : ss?.events?.state === 'excluded' ? (
                  <Empty title="Match events aren’t shown" hint={ss.events.reason || 'The event list for this match is incomplete.'} />
                ) : (
                  <Empty title="Match events aren’t available" hint={p === 'live' ? 'Events will appear here as soon as the live feed reports them.' : p === 'pending' ? 'The result hasn’t reached the data feed yet. This page checks again every 30 seconds.' : 'The final score is confirmed. Detailed events aren’t available for this match.'} />
                )}
              </section>
            )}
            {dt && <ShotMap shots={dt.shots} homeName={tn(m.homeTeam)} awayName={tn(m.awayTeam)} />}
            {intel.loading ? <IntelLoading /> : intel.data ? (
              <>
                <ComparePanel intel={intel.data} />
                <div className="grid lg:grid-cols-2 gap-4 items-stretch"><FormStrip intel={intel.data} /><H2HVisual intel={intel.data} /></div>
                <RelatedMeetings intel={intel.data} current={intel.data.season} />
              </>
            ) : <IntelError onRetry={intel.retry} />}
            {!season && <NextFixtures m={m} next={nextFx.data} loading={nextFx.loading} />}
            {intel.data && (intel.data.facts.length > 0 || intel.data.notes.length > 0) && (
              <details className="card px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold">Key facts in words</summary><div className="mt-3"><FactList intel={intel.data} /></div></details>
            )}
          </div>
        )}
        {tab === 'context' && (intel.loading ? <IntelLoading /> : intel.error || !intel.data ? <IntelError onRetry={intel.retry} /> : (
          <div className="space-y-8">
            <section><h3 className="display-wide text-lg mb-3">Form</h3><FormPanel intel={intel.data} /></section>
            {(intel.data.table || intel.data.tableNote) && <section><h3 className="display-wide text-lg mb-3">League table before kickoff</h3><TablePanel intel={intel.data} /></section>}
            {intel.data.seasonRecords && <section><h3 className="display-wide text-lg mb-3">This season</h3><SeasonPanel intel={intel.data} /></section>}
          </div>
        ))}
        {tab === 'stats' && (st?.stats
          ? <>{dt?.playTime && <div className="mb-4"><PlayTime t={dt.playTime} /></div>}<StatsPanel stats={st.stats} more={st.moreStats} home={m.homeTeam} away={m.awayTeam} homeName={tn(m.homeTeam)} awayName={tn(m.awayTeam)} note={sourceNote(src, lv?.statsDerived)} live={src === 'live' && lv?.status !== 'full time'} dropped={ss?.droppedStats || []} /></>
          : ss?.state === 'invalid' || ss?.state === 'unavailable'
            ? <Empty title="Detailed statistics unavailable" hint="The stored statistics record couldn’t be tied to this fixture reliably, so it isn’t shown." />
            : ss?.state === 'verified'
              ? <Empty title="No team statistics recorded" hint="This match has no usable team statistics." />
              : <NoStats reason={part!.liveReason} live={p === 'live' || !!part!.liveEligible} />)}
        {tab === 'lineups' && <LineupsTab details={details} loading={det.loading} failed={det.error && !details} onRetry={det.retry} legacy={st?.lineups} home={m.homeTeam} away={m.awayTeam} />}
        {tab === 'h2h' && (intel.loading ? <Skel className="h-48" /> : intel.error || !intel.data ? <IntelError onRetry={intel.retry} /> : <H2HPanel intel={intel.data} />)}
      </div>
      </div>
      <MatchSidebar current={m} currentId={m.id} currentCode={code} homeId={m.homeTeam.id} awayId={m.awayTeam.id} season={season} />
      </div>
    </div>
    </TeamColorsProvider>
  );
}
