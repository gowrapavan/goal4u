import { useParams, Link } from 'react-router-dom';
import { ErrorState } from '../components/states';
import { SEO } from '../components/SEO';
import { playerSeo } from '../lib/seo-text';
import { Skel, Empty, TrophyGrid, PlayerImg, Crest, cx } from '../components/ui';
import { RatingPill } from '../components/match/LineupsUI';
import { ratingTone } from '../lib/match-details-types';
import { BallIcon, BootIcon } from '../components/match/EventIcons';
import { fetchTMPlayerInfo, getPlayerRelated, getPlayerSeason, matchHref, teamHref, useAsync, type PlayerSeason, type RelatedGroup } from '../lib/api';
import { getAge, convertINRtoEUR } from '../utils/formatting';

async function load(idOrSlug: string) {
  let id = idOrSlug;
  if (!/^\d+$/.test(id)) {
    const r = await fetch(`/api/data/id-lookup?type=players&name=${encodeURIComponent(decodeURIComponent(id).replace(/-/g, ' '))}`);
    if (!r.ok) return null; id = String((await r.json()).id);
  }
  return fetchTMPlayerInfo(id);
}

const Row = ({ k, v }: { k: string; v?: string | null }) => v ? <div className="py-2.5 border-b border-line/70 last:border-0 flex justify-between gap-4"><dt className="text-muted text-sm">{k}</dt><dd className="font-semibold text-sm text-right min-w-0 [overflow-wrap:anywhere]">{v}</dd></div> : null;
const initialsOf = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const TONE_BG: Record<string, string> = { blue: '#2236ff', green: '#16a34a', amber: '#f59e0b', red: '#ef4444', none: '#94a3b8' };

/** Ratings of the last matches as bars (oldest → newest), coloured like the rating pills, with the opponent's crest underneath. */
function FormBars({ matches }: { matches: PlayerSeason['matches'] }) {
  const list = matches.slice(0, 10).reverse();
  if (!list.length) return null;
  return (
    <div>
      <ol className="flex items-end gap-1.5 sm:gap-2.5 h-40" aria-label="Match ratings, oldest to newest">
        {list.map((m) => {
          const h = m.rating == null ? 6 : Math.max(10, Math.min(100, ((m.rating - 4) / 6) * 100));
          return (
            <li key={m.matchId} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5" title={`${m.venue === 'H' ? 'vs' : 'at'} ${m.opp.name}: ${m.rating ?? 'no rating'}`}>
              <span className="num text-[10px] sm:text-xs font-bold text-muted leading-none">{m.rating != null ? m.rating.toFixed(1) : '–'}</span>
              <span className="w-full max-w-[2.75rem] rounded-t-md" style={{ height: `${h}%`, background: TONE_BG[ratingTone(m.rating)] }} />
            </li>
          );
        })}
      </ol>
      <ol className="flex gap-1.5 sm:gap-2.5 mt-2 border-t border-line pt-2" aria-hidden>
        {list.map((m) => <li key={m.matchId} className="flex-1 min-w-0 flex justify-center"><Crest src={m.opp.crest} name={m.opp.name} size={18} /></li>)}
      </ol>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="px-2 sm:px-4 py-3 text-center min-w-0"><div className="display num text-[1.75rem] sm:text-[2rem] leading-none min-h-[2rem] flex items-center justify-center">{children}</div><p className="text-[10px] sm:text-[11px] uppercase tracking-[.12em] text-muted font-bold mt-2">{label}</p></div>;
}

function SeasonCards({ s, loading }: { s: PlayerSeason | null | undefined; loading: boolean }) {
  if (loading) return <><Skel className="h-72 rounded-2xl" /><Skel className="h-80 rounded-2xl" /></>;
  if (!s || !s.totals.apps) return <section className="card p-5"><h2 className="display text-xl sm:text-2xl mb-1">This season</h2><p className="text-sm text-muted">No appearances for this player in our match data yet.</p></section>;
  const t = s.totals;
  return (
    <>
      <section className="card overflow-hidden" aria-label="This season">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 sm:px-6 pt-4 sm:pt-5"><h2 className="display text-xl sm:text-2xl">This season</h2><span className="text-xs text-muted">{s.season.replace('-', '/')} · from our match data</span></div>
        <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-line max-sm:[&>*:nth-child(n+4)]:border-t max-sm:[&>*:nth-child(n+4)]:border-line mt-4 border-y border-line">
          <Stat label="Apps">{t.apps}</Stat><Stat label="Minutes">{t.minutes}</Stat><Stat label="Goals">{t.goals}</Stat><Stat label="Assists">{t.assists}</Stat>
          <Stat label="Avg rating">{t.avgRating != null ? <RatingPill r={t.avgRating} /> : '–'}</Stat>
          <Stat label="Cards"><span className="inline-flex items-center gap-2 text-2xl sm:text-3xl"><span className="inline-flex items-center gap-1"><i className="w-2.5 h-3.5 rounded-[2px] bg-[#facc15]" />{t.yellow}</span><span className="inline-flex items-center gap-1"><i className="w-2.5 h-3.5 rounded-[2px] bg-[#ef4444]" />{t.red}</span></span></Stat>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex items-baseline justify-between mb-3"><h3 className="text-[11px] font-bold uppercase tracking-[.14em] text-muted">Form · last {Math.min(10, s.matches.length)} ratings</h3>{t.xg > 0 && <span className="text-xs text-muted num">{t.shots} shots · {t.xg.toFixed(2)} xG</span>}</div>
          <FormBars matches={s.matches} />
        </div>
      </section>
      <section className="card overflow-hidden" aria-label="Matches">
        <h2 className="display text-xl sm:text-2xl px-4 sm:px-6 pt-4 sm:pt-5 pb-3">Matches</h2>
        <div className="hidden sm:grid grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_3.5rem_2.75rem_2.75rem_3.5rem] gap-2 px-6 py-2 bg-surface-2/70 text-[10px] font-bold uppercase tracking-[.12em] text-muted"><span>Date</span><span>Opponent</span><span>Result</span><span className="text-right">Min</span><span className="text-center">G</span><span className="text-center">A</span><span className="text-right">Rating</span></div>
        <ul>
          {s.matches.map((m) => {
            const fin = m.gf != null && m.ga != null && m.status === 'FINISHED'; const res = !fin ? null : m.gf! > m.ga! ? 'W' : m.gf! < m.ga! ? 'L' : 'D';
            const chip = fin ? <span className="inline-flex items-center gap-1.5 text-xs font-bold num"><span className={cx('w-5 h-5 rounded grid place-items-center text-[10px] text-white', res === 'W' ? 'bg-emerald-600' : res === 'L' ? 'bg-red-500' : 'bg-slate-400')}>{res}</span>{m.gf}–{m.ga}</span> : <span className="text-muted text-xs">–</span>;
            return (
              <li key={m.matchId} className="border-t border-line/70 first:border-t-0">
                <Link to={matchHref({ id: m.matchId, code: m.code })} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem_3.5rem_2.75rem_2.75rem_3.5rem] items-center gap-2 px-4 sm:px-6 py-3 hover:bg-surface-2/50 transition-colors">
                  <span className="text-[11px] leading-tight text-muted font-semibold num">{new Date(m.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  <span className="flex items-center gap-2.5 min-w-0"><Crest src={m.opp.crest} name={m.opp.name} size={24} />
                    <span className="min-w-0 leading-tight"><span className="block text-sm font-semibold truncate">{m.venue === 'H' ? 'vs' : 'at'} {m.opp.name}</span>
                      <span className="sm:hidden flex items-center gap-1.5 text-[11px] text-muted">{chip}<span>{m.started ? 'Start' : 'Sub'}{m.minutes != null ? ` · ${m.minutes}'` : ''}</span>{m.goals > 0 && <span className="inline-flex items-center gap-0.5 font-bold text-ink"><BallIcon size={13} />{m.goals}</span>}{m.assists > 0 && <span className="inline-flex items-center gap-0.5 font-bold text-ink"><BootIcon size={13} />{m.assists}</span>}</span></span></span>
                  <span className="hidden sm:block">{chip}</span>
                  <span className="hidden sm:block text-right num text-sm text-muted">{m.minutes != null ? `${m.minutes}'` : '–'}</span>
                  <span className="hidden sm:flex justify-center items-center gap-0.5 num text-sm font-bold">{m.goals > 0 ? <><BallIcon size={15} />{m.goals}</> : <span className="text-muted font-normal">–</span>}</span>
                  <span className="hidden sm:flex justify-center items-center gap-0.5 num text-sm font-bold">{m.assists > 0 ? <><BootIcon size={15} />{m.assists}</> : <span className="text-muted font-normal">–</span>}</span>
                  <span className="flex justify-end">{m.rating != null ? <RatingPill r={m.rating} /> : <span className="text-muted text-xs">–</span>}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** Club teammates and national-team players, as photo cards that open the other player's page. Shown under the match list. */
function RelatedPlayers({ groups, loading, club }: { groups: RelatedGroup[] | undefined; loading: boolean; club: { name: string; crest: string | null } | null }) {
  if (loading) return <Skel className="h-64 rounded-2xl" />;
  if (!groups?.length) return null;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="card overflow-hidden" aria-label={g.title}>
          <div className="flex items-center gap-2.5 px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
            {g.key === 'club' && club?.crest && <Crest src={club.crest} name={club.name} size={28} />}
            <h2 className="display text-xl sm:text-2xl">{g.title}</h2>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
            {g.players.map((r) => (
              <li key={r.id}>
                <Link to={`/player/${r.id}`} className="group block h-full rounded-2xl border border-line bg-surface hover:border-ink hover:-translate-y-0.5 transition-all overflow-hidden">
                  <div className="aspect-[4/3] bg-surface-2 overflow-hidden">
                    <PlayerImg id={r.id} alt={r.name} className="w-full h-full object-cover object-top bg-white group-hover:scale-[1.03] transition-transform"
                      fallback={<span className="w-full h-full grid place-items-center display text-3xl text-muted">{initialsOf(r.name)}</span>} />
                  </div>
                  <div className="p-3 min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{r.name}</p>
                    <p className="text-xs text-muted truncate mt-0.5">{r.position || '—'}</p>
                    <div className="flex items-center justify-between gap-2 mt-2 min-h-[1.25rem]">
                      {r.valueLabel ? <span className="num text-xs font-semibold">{r.valueLabel}</span> : <span />}
                      {r.alsoNational && <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-brand-soft text-brand px-2 py-0.5 truncate">Intl</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function Player() {
  const { name } = useParams();
  const p = useAsync(() => load(name!), [name]);
  const pid = p.data?.player_id;
  const season = useAsync(() => (pid ? getPlayerSeason(pid).catch(() => null) : Promise.resolve(null)), [pid]);
  // related players: asked once the season data is in, so the club id it carries can be passed along as a hint
  const related = useAsync(() => (pid && !season.loading ? getPlayerRelated(pid, season.data?.club?.id).catch(() => ({ groups: [] as RelatedGroup[] })) : new Promise<{ groups: RelatedGroup[] }>(() => {})), [pid, season.loading]);
  if (p.loading) return <div className="max-w-[78rem] mx-auto px-4 pt-8 space-y-5"><Skel className="h-64 rounded-2xl" /><div className="grid lg:grid-cols-[1fr_22rem] gap-5"><Skel className="h-80" /><Skel className="h-80" /></div></div>;
  const d = p.data;
  if (!d && p.error && p.status !== 404 && p.status !== 400) return <div className="max-w-xl mx-auto px-4 pt-16"><ErrorState title="This player couldn’t be loaded" hint="The profile didn’t arrive. It isn’t missing, so please try again." onRetry={p.retry} /></div>;
  if (!d) return <div className="max-w-xl mx-auto px-4 pt-16"><SEO title="Player not found | Goal4U" description="This player profile is not available." noindex /><Empty title="Player profile not found" hint="We don’t have a profile for this player yet." /></div>;
  const x = d.details || {}; const ss = season.data;
  const mv = x.market_value ? convertINRtoEUR(x.market_value) : null;
  const trophies = (d.trophies?.length ? d.trophies : (x.achievements || []).map((a: any) => ({ name: a.trophy, count: a.count }))) as any[];
  const dob = x.date_of_birth ? String(x.date_of_birth).split(' (')[0] : null;
  const club = ss?.club ?? null; const position = x.position || ss?.role || null; const clubName = x.current_club_name || club?.name || null;
  const specs = [['Market value', mv], ['Age', dob ? String(getAge(dob)) : null], ['Nationality', x.citizenship?.[0]], ['Height', x.height], ['Foot', x.foot]].filter(([, v]) => v && v !== '—') as [string, string][];
  const profileRows = [
    ['Market value', mv], ['Born', [dob, x.place_of_birth].filter(Boolean).join(' · ') || null], ['Nationality', x.citizenship?.join(', ')], ['Height', x.height], ['Preferred foot', x.foot],
    ['Other positions', x.other_positions?.join(', ')], ['Joined', x.joined], ['Contract until', x.contract_expires],
    ['International', x.national_team_name ? `${x.national_team_name} · ${x.national_caps ?? 0} caps, ${x.national_goals ?? 0} goals` : null],
  ].filter(([, v]) => v) as [string, string][];
  const profile = profileRows.length > 0 && <section className="card p-4 sm:p-5"><h2 className="display text-xl sm:text-2xl mb-1">Profile</h2><dl>{profileRows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</dl></section>;
  return (
    <div className="max-w-[78rem] mx-auto px-4 pt-5 sm:pt-8 pb-6">
      <SEO {...playerSeo(d.name)} breadcrumbLeaf={d.name} schema={{ '@context': 'https://schema.org', '@type': 'Person', name: d.name, jobTitle: 'Football Player' }} />
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Player">
        <div className="absolute inset-x-0 top-0 h-[4.5rem] sm:h-40 bg-brand" style={{ backgroundImage: 'radial-gradient(90% 140% at 90% 0%, rgba(255,255,255,.22), transparent 60%), linear-gradient(120deg, rgba(0,0,0,.18), transparent 55%)' }} />
        {x.shirt_number && <span aria-hidden className="display absolute right-4 sm:right-10 top-0 text-[5.5rem] sm:text-[11rem] leading-[.9] text-white/25 select-none">{x.shirt_number}</span>}
        <div className="relative px-4 sm:px-8 pt-[2.5rem] sm:pt-[6.5rem] pb-5 sm:pb-6 flex items-end gap-4 sm:gap-7">
          <div className="relative shrink-0">
            <div className="w-28 h-28 sm:w-44 sm:h-44 rounded-2xl sm:rounded-3xl overflow-hidden ring-4 ring-surface bg-surface-2 shadow-lg">
              <PlayerImg id={d.player_id} imagePath={d.image_path || undefined} alt={d.name} className="w-full h-full object-cover object-top bg-white"
                fallback={<span className="w-full h-full grid place-items-center display text-4xl sm:text-6xl text-muted">{initialsOf(d.name)}</span>} />
            </div>
            {club && <Link to={teamHref(club.code, club.id)} aria-label={club.name} className="absolute -bottom-2 -right-2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-surface ring-2 ring-line grid place-items-center shadow"><Crest src={club.crest} name={club.name} size={26} /></Link>}
          </div>
          <div className="min-w-0 pb-1">
            <h1 className="display text-[clamp(1.7rem,7.5vw,2.4rem)] sm:text-[2.6rem] leading-[1.03] break-words [overflow-wrap:anywhere]">{d.name}</h1>
            <p className="mt-1.5 text-sm sm:text-base text-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {clubName && (club ? <Link to={teamHref(club.code, club.id)} className="font-semibold text-ink hover:text-brand">{clubName}</Link> : <span className="font-semibold text-ink">{clubName}</span>)}
              {clubName && position && <span aria-hidden>·</span>}{position && <span>{position}</span>}
              {x.shirt_number && <><span aria-hidden>·</span><span className="num">#{x.shirt_number}</span></>}
            </p>
          </div>
        </div>
        {specs.length > 0 && (
          <dl className={cx('grid border-t border-line divide-x divide-line', ({ 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3' } as Record<number, string>)[specs.length] ?? 'grid-cols-2 sm:grid-cols-4')}>
            {specs.slice(0, 4).map(([k, v]) => <div key={k} className="px-4 sm:px-6 py-3.5 min-w-0 max-sm:[&:nth-child(n+3)]:border-t max-sm:[&:nth-child(n+3)]:border-line"><dt className="text-[10px] uppercase tracking-[.12em] text-muted font-bold">{k}</dt><dd className="font-bold text-sm sm:text-base mt-0.5 truncate">{v}</dd></div>)}
          </dl>
        )}
      </section>
      <div className="mt-5 grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 lg:gap-6 items-start">
        <div className="space-y-5 min-w-0"><SeasonCards s={ss} loading={season.loading} /><RelatedPlayers groups={related.data?.groups} loading={season.loading || related.loading} club={club} /><div className="lg:hidden">{profile}</div></div>
        <aside className="space-y-5 min-w-0">
          <div className="hidden lg:block">{profile}</div>
          <section className="card p-4 sm:p-5"><h2 className="display text-xl sm:text-2xl mb-3">Honours <span className="text-muted text-base">{trophies.length ? `(${trophies.length})` : ''}</span></h2>{trophies.length ? <TrophyGrid items={trophies} /> : <p className="text-sm text-muted">No honours listed.</p>}</section>
        </aside>
      </div>
    </div>
  );
}
