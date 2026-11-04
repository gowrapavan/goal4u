import { LeagueLogo } from '../components/LeagueLogo';
import { ErrorState } from '../components/states';
import { CalendarDays } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { teamSeo } from '../lib/seo-text';
import { Crest, Skel, Empty, MatchRow, Form, TrophyGrid, PlayerImg, cx } from '../components/ui';
import { SquadPitch } from '../components/SquadPitch';
import { Banner } from '../components/Banner';
import { VsMatchCard } from '../components/MatchCard';
import { StandingsTable } from '../components/Table';
import { compBySlug, compByCode, winnerOf, getTeamMatches, getTables, getScorers, fetchTeams, fetchTMTeamInfo, useAsync, phase, isOpen, leagueHeaderBg, FMatch } from '../lib/api';
import { fetchTMTeamSquad } from '../services/api';
import { getAge, convertINRtoEUR } from '../utils/formatting';
import { imageUrl } from '../utils/data-origin';
import NotFound from './NotFound';

const GROUPS = [['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards'], ['OTH', 'Squad']] as const;
const grp = (pos?: string | null) => {
  const p = (pos || '').toLowerCase();
  if (!p) return 'OTH';
  if (p.includes('keep')) return 'GK';
  if (p.includes('mid')) return 'MID';          // before defence: "Defensive Midfield" is a midfielder
  if (p.includes('def') || p.includes('back')) return 'DEF';
  if (/(forward|offence|attack|wing|striker)/.test(p)) return 'FWD';
  return 'OTH';
};
const ord = (n: number) => `${n}${[, 'st', 'nd', 'rd'][n] && ![11, 12, 13].includes(n % 100) ? [, 'st', 'nd', 'rd'][n] : 'th'}`;
/** A window of the table centred on the team (never past the ends). */
const windowAround = (rows: any[], teamId: number, size = 7) => {
  const i = Math.max(0, rows.findIndex((r) => r.team.id === teamId));
  const start = Math.min(Math.max(0, i - 3), Math.max(0, rows.length - size));
  return rows.slice(start, start + size);
};

const DOMESTIC = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'ELC'];
/** W/D/L string (oldest → newest) for the team's last finished matches, across every competition. */
const formOf = (ms: FMatch[], id: number, n = 5) => ms.filter((m) => phase(m) === 'ft').slice(-n).map((m) => {
  const w = winnerOf(m); if (!w) return 'D';
  return (w === 'h') === (m.homeTeam.id === id) ? 'W' : 'L';
}).join(',');

export function TeamPage() {
  const { slug, season } = useParams(); const [sp] = useSearchParams();
  const comp = compBySlug(slug); const teamId = Number(sp.get('teamId'));
  const [tab, setTab] = useState<'overview' | 'matches' | 'squad'>('overview');
  const [filter, setFilter] = useState<'all' | 'league' | 'europe'>('all');
  const code = comp?.code || '';
  const isCL = code === 'CL';

  // Opened from the Champions League? Look at every competition so the club's own league can be found.
  const sched = useAsync(() => getTeamMatches(teamId, isCL ? [...DOMESTIC, 'CL'] : [code, 'CL'], season), [code, season, teamId]);
  // `lc` = the club's league. On a league page it is that league; on the Champions League page it is the
  // domestic competition the club plays most matches in (falls back to CL for clubs with no domestic data).
  const lc = useMemo(() => {
    if (!isCL) return code;
    const n: Record<string, number> = {};
    for (const m of sched.data || []) if (m.code !== 'CL') n[m.code] = (n[m.code] || 0) + 1;
    return Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0] || 'CL';
  }, [isCL, code, sched.data]);
  const waiting = isCL && sched.loading;               // league not known yet
  const leagueComp = compByCode(lc) || comp;

  const tables = useAsync(() => (waiting ? Promise.resolve([] as any[]) : getTables(lc, season)), [lc, season, waiting]);
  const clTables = useAsync(() => (lc === 'CL' || waiting ? Promise.resolve([] as any[]) : getTables('CL', season).catch(() => [])), [lc, season, waiting]);
  const scorers = useAsync(() => (waiting ? Promise.resolve([] as any[]) : getScorers(lc, season)), [lc, season, waiting]);
  const clScorers = useAsync(() => (lc === 'CL' || waiting ? Promise.resolve([] as any[]) : getScorers('CL', season).catch(() => [])), [lc, season, waiting]);
  const info = useAsync(() => fetchTMTeamInfo(teamId), [teamId]);
  const squad = useAsync(async () => {
    if (waiting) return null;
    const teams = await fetchTeams(lc, season);
    const t = teams.find((x: any) => x.id === teamId);
    if (t?.squad?.length) return { meta: t, players: t.squad.map((p: any) => ({ id: p.id, name: p.name, position: p.position, nat: p.nationality, dob: p.dateOfBirth })) };
    const tm = await fetchTMTeamSquad(teamId).catch(() => null);
    return { meta: t, players: (tm?.squad_roster || []).map((p: any) => ({ id: p.player_id, name: p.name, position: p.position })) };
  }, [lc, season, teamId, waiting]);

  const rows = tables.data?.[0]?.table || [];
  const row = rows.find((r: any) => r.team.id === teamId);
  const mine: FMatch[] = sched.data || [];
  const clRows: any[] = (clTables.data || []).flatMap((t: any) => t.table);
  const clRow = clRows.find((r) => r.team.id === teamId);
  // Champions League sections are shown ONLY when the team actually appears in CL data.
  const inEurope = lc !== 'CL' && (!!clRow || mine.some((m) => m.code === 'CL'));
  const visible = mine.filter((m) => filter === 'all' || (filter === 'europe' ? m.code === 'CL' : m.code !== 'CL'));
  const next = mine.find((m) => isOpen(m));
  const last = mine.filter((m) => phase(m) === 'ft').slice(-5).reverse();
  const formAll = formOf(mine, teamId);
  const team: any = row?.team || squad.data?.meta || clRow?.team || (mine[0] && (mine[0].homeTeam.id === teamId ? mine[0].homeTeam : mine[0].awayTeam));

  if (!comp || !teamId) return <NotFound />;
  if (!team && !tables.loading && !sched.loading && !squad.loading) return <NotFound />;
  const meta = squad.data?.meta; const tm = info.data?.tm_stats;
  const mv = tm?.total_market_value ? convertINRtoEUR(tm.total_market_value) : null;
  // Goals/assists from the league AND the Champions League, summed per player (with the split kept for display).
  const perf = (() => {
    const by = new Map<number, { player: any; goals: number; assists: number; split: { c: string; g: number }[] }>();
    ([[lc, scorers.data], ['CL', clScorers.data]] as [string, any[] | null][]).forEach(([c, list]) => (list || []).filter((x) => x.team?.id === teamId).forEach((x) => {
      const e = by.get(x.player.id) || by.set(x.player.id, { player: x.player, goals: 0, assists: 0, split: [] }).get(x.player.id)!;
      e.goals += x.goals || 0; e.assists += x.assists || 0; e.split.push({ c, g: x.goals || 0 });
    }));
    return [...by.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 3);
  })();
  const nextInEurope = next?.code === 'CL';
  // The club's three most-won trophies (by count), shown in the hero.
  const top3 = ((info.data?.trophies || []) as any[]).map((t) => ({ ...t, n: parseInt(String(t.count), 10) || 0 })).filter((t) => t.n > 0 && t.name).sort((a, b) => b.n - a.n).slice(0, 3);

  return (
    <div>
      <SEO {...teamSeo(team?.name || 'Team', leagueComp?.name)} breadcrumbLeaf={team?.name || 'Club'} schema={team?.name ? { '@context': 'https://schema.org', '@type': 'SportsTeam', name: team.name, sport: 'Soccer', ...(team.crest ? { logo: team.crest } : {}) } : undefined} />
      <Banner bg={leagueHeaderBg(lc)} rounded={false} scrim="normal">
        <div className="max-w-[88rem] mx-auto px-4 pt-8 max-sm:pt-5 pb-0">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 max-sm:gap-4 pb-5 max-sm:pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3 sm:gap-5">
                <span className="bg-white rounded-3xl max-sm:rounded-2xl p-3 max-sm:p-1.5 shrink-0 shadow-lg max-sm:[&_img]:w-[40px]! max-sm:[&_img]:h-[40px]!"><Crest src={team?.crest} name={team?.name} size={72} minSize={48} /></span>
                <div className="min-w-0">
                  <p className="text-sm max-sm:text-xs font-semibold text-white/90 text-shadow">{[leagueComp?.name, inEurope && 'Champions League'].filter(Boolean).join(' · ')}</p>
                  <h1 className="display text-3xl max-sm:text-[1.4rem] sm:text-5xl lg:text-6xl break-words text-shadow">{team?.name || '…'}</h1>
                  <p className="text-sm max-sm:text-[11px] max-sm:leading-snug text-white/90 mt-1.5 max-sm:mt-0.5 text-shadow">{[meta?.venue, meta?.founded && `Founded ${meta.founded}`, meta?.clubColors].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-6 text-shadow max-sm:grid max-sm:grid-cols-3 max-sm:gap-x-3 max-sm:gap-y-2.5 max-sm:mt-4">
                {row && <><div><p className="display text-4xl max-sm:text-[1.3rem]">{ord(row.position)}</p><p className="text-xs max-sm:text-[10px] text-white/85">League position</p></div>
                  <div><p className="display text-4xl max-sm:text-[1.3rem] num">{row.points}</p><p className="text-xs max-sm:text-[10px] text-white/85">Points</p></div>
                  <div><p className="display text-4xl max-sm:text-[1.3rem] num">{row.won}-{row.draw}-{row.lost}</p><p className="text-xs max-sm:text-[10px] text-white/85">W-D-L</p></div></>}
                {inEurope && clRow && <div><p className="display text-4xl max-sm:text-[1.3rem]">{ord(clRow.position)}</p><p className="text-xs max-sm:text-[10px] text-white/85">Champions League</p></div>}
                {mv && <div><p className="display text-4xl max-sm:text-[1.3rem]">{mv}</p><p className="text-xs max-sm:text-[10px] text-white/85">Squad value</p></div>}
              </div>
            </div>
            {top3.length > 0 && (
              <div className="shrink-0" aria-label="Most won trophies">
                <p className="text-xs font-semibold text-white/90 text-shadow mb-2 max-sm:mb-1.5 lg:text-right">Most won</p>
                <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  {top3.map((t, i) => (
                    <li key={i} className="glass rounded-2xl p-3 max-sm:p-1.5 flex flex-col items-center text-center gap-1.5 max-sm:gap-1 w-full lg:w-[140px] min-w-0">
                      <span className="w-14 h-14 max-sm:w-10 max-sm:h-10 sm:w-16 sm:h-16 grid place-items-center">
                        {t.local_path ? <img src={imageUrl(t.local_path)} alt="" className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} /> : null}
                      </span>
                      <span className="display text-3xl max-sm:text-[1.2rem] text-white leading-none num">{t.n}<span className="text-lg opacity-80">×</span></span>
                      <span className="text-[11px] max-sm:text-[9.5px] leading-tight text-white/90 line-clamp-2">{String(t.name).trim()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex gap-1 -mb-px">
            {(['overview', 'matches', 'squad'] as const).map((k) => <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={cx('px-5 max-sm:px-4 h-11 max-sm:h-10 text-sm font-semibold rounded-t-xl capitalize', tab === k ? 'bg-bg text-ink' : 'text-white/90 hover:text-white text-shadow')}>{k}</button>)}
          </div>
        </div>
      </Banner>

      <div className="max-w-[88rem] mx-auto px-4 py-6">
        {tab === 'overview' && (
          <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
            <div className="space-y-5 min-w-0">
              <section><h2 className="display text-3xl max-sm:text-2xl mb-3">{next && phase(next) === 'live' ? 'Playing now' : 'Next match'}{nextInEurope ? <span className="text-brand"> · Europe</span> : null}</h2>
                {sched.loading ? <Skel className="h-40" /> : sched.error && !sched.data ? <ErrorState compact title="Fixtures couldn’t be loaded" onRetry={sched.retry} /> : next ? <VsMatchCard m={next} /> : <Empty icon={CalendarDays} title="No upcoming fixture scheduled" />}
              </section>
              <section><div className="flex items-center justify-between mb-3"><h2 className="display text-3xl max-sm:text-2xl">Recent results</h2>{formAll && <Form value={formAll} />}</div>
                <div className="card overflow-hidden divide-y divide-line/70">{sched.loading ? <Skel className="h-40" /> : sched.error && !sched.data ? <div className="p-4"><ErrorState compact title="Results couldn’t be loaded" onRetry={sched.retry} /></div> : last.length ? last.map((m) => <MatchRow key={m.id} m={m} showComp={inEurope} />) : <p className="p-5 text-sm text-muted">No matches played yet this season.</p>}</div>
              </section>
              {info.data?.trophies?.length > 0 && <section><h2 className="display text-3xl max-sm:text-2xl mb-3">Club honours</h2><div className="card p-4"><TrophyGrid items={info.data.trophies.slice(0, 12)} /></div></section>}
              {perf.length > 0 && <section><h2 className="display text-3xl max-sm:text-2xl mb-3">Top performers</h2>
                <div className="grid sm:grid-cols-3 gap-3">{perf.map((s) => <Link key={s.player.id} to={`/player/${s.player.id}`} className="card p-4 max-sm:p-3 hover:border-ink transition-colors"><p className="display text-5xl max-sm:text-4xl text-brand">{s.goals}</p><p className="font-semibold mt-1 truncate">{s.player.name}</p><p className="text-xs text-muted">goals · {s.assists} assists</p>{s.split.length > 1 && <p className="text-[11px] text-muted mt-1">{s.split.map((x) => `${compByCode(x.c)?.short || x.c} ${x.g}`).join(' · ')}</p>}</Link>)}</div></section>}
            </div>
            <aside className="space-y-5 min-w-0">
              <section><h2 className="display text-3xl max-sm:text-2xl mb-3">{leagueComp?.short} table</h2>
                <div className="card overflow-hidden">{tables.loading ? <Skel className="h-80" /> : tables.error && !tables.data ? <div className="p-4"><ErrorState compact title="The table couldn’t be loaded" onRetry={tables.retry} /></div> : rows.length ? <StandingsTable compact rows={windowAround(rows, teamId)} code={lc} highlight={teamId} /> : <p className="p-5 text-sm text-muted">Table unavailable.</p>}</div>
                {rows.length > 0 && <Link to={`/competition/${leagueComp?.slug}`} className="block text-sm font-semibold text-brand mt-2">Full {leagueComp?.short} table</Link>}
              </section>
              {inEurope && clRows.length > 0 && (
                <section><h2 className="display text-3xl max-sm:text-2xl mb-3">Champions League</h2>
                  <div className="card overflow-hidden">
                    <StandingsTable compact rows={windowAround(clRows, teamId)} code="CL" highlight={teamId} qualify={8} relegate={0} />
                  </div>
                  <Link to="/competition/champions-league" className="block text-sm font-semibold text-brand mt-2">Full Champions League table</Link>
                </section>
              )}
            </aside>
          </div>
        )}

        {tab === 'matches' && (() => {
          const results = visible.filter((m) => phase(m) === 'ft').reverse();       // newest first
          const fixtures = visible.filter((m) => phase(m) !== 'ft');                // live / upcoming, soonest first
          const f = formOf(visible, teamId, 10).split(',').filter(Boolean);
          const rec = { W: f.filter((x) => x === 'W').length, D: f.filter((x) => x === 'D').length, L: f.filter((x) => x === 'L').length };
          const item = (m: FMatch) => <div key={m.id}><p className="px-4 pt-2 text-[11px] font-semibold text-muted">{new Date(m.utcDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {compByCode(m.code)?.short || m.code}{m.matchday ? ` · MD${m.matchday}` : ''}</p><MatchRow m={m} /></div>;
          return (
            <div className="max-w-4xl">
              {inEurope && (
                <div className="scroll-x gap-2 mb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
                  {([['all', 'All competitions'], ['league', leagueComp?.short || ''], ['europe', 'Champions League']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'europe' && <LeagueLogo comp={compByCode('CL')} size={16} />}{l}</button>)}
                </div>
              )}
              {sched.loading ? <Skel className="h-80" /> : sched.error && !sched.data ? <ErrorState title="Fixtures couldn’t be loaded" hint="The match list didn’t arrive. This isn’t an empty season." onRetry={sched.retry} /> : !visible.length ? <Empty icon={CalendarDays} title="No fixtures found" /> : (
                <div className="space-y-6">
                  {f.length > 0 && (
                    <div className="card p-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <div><p className="text-[11px] font-semibold text-muted mb-1">Form · last {f.length}</p><Form value={f.join(',')} max={10} /></div>
                      <p className="text-sm text-muted"><span className="font-bold text-ink num">{rec.W}</span> won · <span className="font-bold text-ink num">{rec.D}</span> drawn · <span className="font-bold text-ink num">{rec.L}</span> lost</p>
                    </div>
                  )}
                  {fixtures.length > 0 && <section><h2 className="display text-xl sm:text-2xl mb-2">{fixtures.some((m) => phase(m) === 'live') ? 'Live & upcoming' : 'Upcoming'}</h2><div className="card overflow-hidden divide-y divide-line/70">{fixtures.map(item)}</div></section>}
                  <section><h2 className="display text-xl sm:text-2xl mb-2">Recent results</h2>
                    {results.length ? <div className="card overflow-hidden divide-y divide-line/70">{results.map(item)}</div> : <p className="card p-5 text-sm text-muted">No matches played yet this season.</p>}
                  </section>
                </div>
              )}
            </div>
          );
        })()}

        {tab === 'squad' && (squad.loading || waiting ? <Skel className="h-80" /> : squad.error && !squad.data ? <ErrorState title="The squad couldn’t be loaded" onRetry={squad.retry} /> : squad.data?.players?.length ? (
          <div className="space-y-5">
            <SquadPitch teamId={teamId} teamName={team?.shortName || team?.name || ''} crest={team?.crest ?? null} squad={squad.data.players} />
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">{GROUPS.map(([g, label]) => { const ps = squad.data!.players.filter((p: any) => grp(p.position) === g); return ps.length ? (
              <section key={g} className="card overflow-hidden"><p className="px-4 pt-4 pb-1 font-bold flex items-center justify-between">{label}<span className="text-xs font-semibold text-muted num">{ps.length}</span></p>{ps.map((p: any) => (
                <Link key={p.id} to={`/player/${p.id}`} className="flex items-center gap-3 px-4 py-2 border-b border-line/60 last:border-0 hover:bg-surface-2/60">
                  <span className="w-10 h-10 rounded-full overflow-hidden bg-surface-2 shrink-0 ring-1 ring-line">
                    <PlayerImg id={p.id} alt={p.name} size={40} className="w-full h-full object-cover object-top" fallback={<span className="w-full h-full grid place-items-center text-xs font-bold text-muted">{String(p.name).split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}</span>} />
                  </span>
                  <span className="min-w-0 flex-1"><span className="block font-medium truncate">{p.name}</span>{p.position && <span className="block text-[11px] text-muted truncate">{p.position}</span>}</span>
                  <span className="text-xs text-muted shrink-0">{[p.nat, p.dob && getAge(p.dob)].filter(Boolean).join(' · ')}</span>
                </Link>))}</section>) : null; })}</div>
          </div>
        ) : <Empty title="Squad not published" hint="Squad lists usually appear after the transfer window closes." />)}
      </div>
    </div>
  );
}
