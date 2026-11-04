import { LeagueLogo } from './LeagueLogo';
import { ErrorState } from './states';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { Skel, Empty, Crest, PlayerImg, cx } from './ui';
import { ValuedPlayer, LeagueIntel, DecoratedPlayer, COMPS, VALUE_CODES, getMarketValues, useAsync } from '../lib/api';
import { getPlayerImage } from '../utils/formatting';

type Who = { id: number | null; name: string };
/** Headshot in a framed mat (never edge-to-edge): circle for list rows, portrait for the big cards. */
function Face({ p, size = 48, shape = 'circle' }: { p: Who; size?: number; shape?: 'circle' | 'portrait' }) {
  const portrait = shape === 'portrait';
  const w = size, h = portrait ? Math.round(size * 1.22) : size;
  const frame = cx('shrink-0 overflow-hidden bg-surface-2 ring-1 ring-line', portrait ? 'rounded-2xl p-1.5' : 'rounded-full p-[3px]');
  const initials = p.name.split(' ').map((x) => x[0]).slice(0, 2).join('');
  return (
    <span className={frame} style={{ width: w, height: h }}>
      <PlayerImg id={p.id} className={cx('w-full h-full object-cover bg-white', portrait ? 'rounded-xl' : 'rounded-full')} style={{ objectPosition: '50% 12%' }}
        fallback={<span className={cx('grid place-items-center w-full h-full bg-surface text-muted font-bold', portrait ? 'rounded-xl' : 'rounded-full')} style={{ fontSize: size * 0.3 }}>{initials}</span>} />
    </span>
  );
}
const Wrap = ({ p, className, children }: { p: Who; className?: string; children: React.ReactNode }) =>
  p.id ? <Link to={`/player/${p.id}`} className={className}>{children}</Link> : <div className={className}>{children}</div>;

export const VALUE_NOTE = 'Market value is an estimate of a player’s transfer worth, converted to euros (approximate). It is not a measure of current performance.';

/** Compact ranked list — used per league. */
export function ValueList({ players, limit = 10, showClub = true }: { players: ValuedPlayer[]; limit?: number; showClub?: boolean }) {
  if (!players.length) return <Empty title="Market values unavailable" hint="No valuation data is published for this competition." />;
  return (
    <ol>
      {players.slice(0, limit).map((p, i) => (
        <li key={p.tmId || p.name}>
          <Wrap p={p} className={cx('flex items-center gap-4 px-4 py-3 border-b border-line/70 last:border-0', p.id && 'hover:bg-surface-2/60')}>
            <span className="w-5 text-center text-sm font-bold text-muted num">{i + 1}</span>
            <Face p={p} size={48} />
            <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{p.name}</span><span className="block text-xs text-muted truncate">{[showClub && p.club, p.position].filter(Boolean).join(' · ')}</span></span>
            <span className="display-wide text-lg num">{p.valueLabel}</span>
          </Wrap>
        </li>
      ))}
    </ol>
  );
}

/** Global spotlight: #1 big, next four beneath. */
export function MvpSpotlight({ players, loading }: { players: ValuedPlayer[] | null; loading?: boolean }) {
  if (loading) return <Skel className="h-72 rounded-3xl" />;
  if (!players?.length) return null;
  const [top, ...rest] = players;
  return (
    <div className="card card-lift overflow-hidden grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Wrap p={top} className="relative p-5 sm:p-6 bg-gradient-to-br from-brand to-[#0a1266] text-white flex items-center gap-4 sm:gap-6 min-h-[200px]">
        <span className="relative shrink-0"><Face p={top} size={104} shape="portrait" /></span>
        <span className="relative min-w-0">
          <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-lime text-lime-ink text-[11px] font-bold">Most valuable player</span>
          <span className="block display text-3xl sm:text-4xl mt-2 break-words">{top.name}</span>
          <span className="block text-sm text-white/85 mt-1.5">{[top.club, top.position, top.nationality].filter(Boolean).join(' · ')}</span>
          <span className="flex items-baseline gap-2 mt-3"><span className="display text-4xl sm:text-5xl num">{top.valueLabel}</span><span className="text-xs text-white/75">market value</span></span>
        </span>
      </Wrap>
      <div className="p-2 sm:p-3">
        <p className="px-2 pt-1 pb-1 text-xs font-semibold text-muted">Next most valuable, across the top five leagues</p>
        <ValueList players={rest} limit={4} />
        <p className="px-4 pt-2 pb-2 text-[11px] text-muted leading-snug">{VALUE_NOTE}</p>
      </div>
    </div>
  );
}

/** Larger tile row — used on the league page. */
export function ValueTiles({ players, limit = 6 }: { players: ValuedPlayer[]; limit?: number }) {
  if (!players.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {players.slice(0, limit).map((p, i) => (
        <Wrap key={p.tmId || p.name} p={p} className={cx('card p-3 flex flex-col items-center text-center gap-1.5', p.id && 'hover:border-ink transition-colors')}>
          <span className="text-[11px] font-bold text-muted num self-start">#{i + 1}</span>
          <Face p={p} size={72} />
          <span className="font-semibold text-sm leading-tight line-clamp-2">{p.name}</span>
          <span className="text-[11px] text-muted truncate max-w-full">{p.club}</span>
          <span className="display-wide text-base text-brand num">{p.valueLabel}</span>
        </Wrap>
      ))}
    </div>
  );
}

/** League header card: the league's most valuable player (from league_metadata.json). */
export function MvpCard({ intel, loading, className }: { intel: LeagueIntel | null; loading?: boolean; className?: string }) {
  if (loading) return <Skel className={cx('h-[104px] rounded-2xl', className)} />;
  const m = intel?.mvp; if (!m) return null;
  const who = { id: m.id, name: m.name };
  return (
    <Wrap p={who} className={cx('card card-lift flex items-center gap-4 p-3 pr-5', m.id && 'hover:border-ink transition-colors', className)}>
      <Face p={who} size={72} shape="portrait" />
      <span className="min-w-0">
        <span className="inline-flex items-center h-5 px-2 rounded-full bg-lime text-lime-ink text-[10px] font-bold">Most valuable player</span>
        <span className="block display text-2xl sm:text-[1.75rem] mt-1 leading-[1.02] line-clamp-2 break-words">{m.name}</span>
        <span className="block text-xs text-muted truncate">{[intel!.mvpClub, intel!.mvpPosition].filter(Boolean).join(' · ') || ' '}</span>
        <span className="flex items-baseline gap-1.5 mt-0.5"><span className="display text-2xl text-brand num">{m.valueLabel}</span><span className="text-[11px] text-muted">market value</span></span>
      </span>
    </Wrap>
  );
}

/** One-line league facts from league_metadata.json. Missing facts are simply omitted. */
export function LeagueFacts({ intel }: { intel: LeagueIntel | null }) {
  const items: [string, string | null | undefined][] = [['Clubs', intel?.teams], ['Players', intel?.players], ['Avg. age', intel?.avgAge], ['Avg. value', intel?.avgValue], ['Total value', intel?.totalValue]];
  const shown = items.filter(([, v]) => v);
  if (!shown.length) return null;
  return <dl className="flex flex-wrap gap-x-6 gap-y-1 mt-3">{shown.map(([k, v]) => <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className="font-bold text-sm num">{v}</dd></div>)}</dl>;
}

/** Most decorated players: all-time league titles (successful_players.json). */
export function DecoratedList({ players, limit = 8 }: { players: DecoratedPlayer[]; limit?: number }) {
  if (!players.length) return <Empty title="Trophy room unavailable" hint="No title records are published for this competition." />;
  return (
    <ol>
      {players.slice(0, limit).map((p, i) => (
        <li key={p.tmId || p.name}>
          <Wrap p={p} className={cx('flex items-center gap-4 px-4 py-3 border-b border-line/70 last:border-0', p.id && 'hover:bg-surface-2/60')}>
            <span className="w-5 text-center text-sm font-bold text-muted num">{i + 1}</span>
            <Face p={p} size={48} />
            <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{p.name}</span><span className="block text-xs text-muted truncate">{[p.nationality, p.position].filter(Boolean).join(' · ')}</span></span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime text-lime-ink px-2.5 h-7 text-sm font-bold num"><Trophy size={14} />{p.titles}</span>
          </Wrap>
        </li>
      ))}
    </ol>
  );
}

/* ───────────── Home: value leaders ───────────── */
/** Compact card for the 7-up desktop row: small framed photo, tight type. */
function LeaderCard({ p, rank, top }: { p: ValuedPlayer; rank: number; top: number }) {
  const first = rank === 1;
  const initials = p.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <Wrap p={p} className={cx('group card overflow-hidden flex flex-col h-full', p.id && 'hover:border-ink transition-colors', first && 'ring-2 ring-lime')}>
      <span className="relative block p-2 pb-0">
        <span className="block aspect-square rounded-xl overflow-hidden bg-surface-2 ring-1 ring-line">
          <PlayerImg id={p.id} alt={p.name} className="w-full h-full object-cover bg-white group-hover:scale-[1.04] transition-transform duration-500" style={{ objectPosition: '50% 10%' }}
            fallback={<span className="grid place-items-center w-full h-full bg-surface text-muted display text-3xl">{initials}</span>} />
        </span>
        <span className={cx('absolute left-3.5 top-3.5 grid place-items-center w-6 h-6 rounded-full display text-sm shadow', first ? 'bg-lime text-lime-ink' : 'bg-ink text-bg')}>{rank}</span>
      </span>
      <span className="flex flex-col flex-1 px-2.5 pb-2.5 pt-2">
        <span className="text-[13px] font-bold leading-tight line-clamp-2 min-h-[2.2em]">{p.name}</span>
        <span className="text-[11px] text-muted truncate mt-0.5">{p.club}</span>
        <span className="display text-[1.35rem] leading-none text-brand mt-1.5 num">{p.valueLabel}</span>
        <span className="mt-1.5 block h-1 rounded-full bg-surface-2 overflow-hidden"><span className={cx('block h-full rounded-full', first ? 'bg-lime' : 'bg-brand')} style={{ width: `${Math.max(8, Math.round((p.valueEur / top) * 100))}%` }} /></span>
      </span>
    </Wrap>
  );
}

/** Home section: top 7 by market value (5 on phones), switchable between all leagues and each of the top five. */
export function ValueLeaders() {
  const [code, setCode] = useState('all');
  const q = useAsync(() => getMarketValues(code, 7), [code]);
  const chips = [{ code: 'all', label: 'All leagues', comp: null as (typeof COMPS)[number] | null }, ...COMPS.filter((c) => VALUE_CODES.includes(c.code)).map((c) => ({ code: c.code, label: c.short, comp: c as (typeof COMPS)[number] | null }))];
  const list = q.data || [];
  // hide only when the request really succeeded with nothing; a failed request shows a retry, never a vanished section
  if (!q.loading && !q.error && !q.data?.length && code === 'all') return null;
  const failedNoData = q.error && !q.data;
  return (
    <div>
      <div className="scroll-x gap-2 mb-4 -mx-4 px-4 lg:mx-0 lg:px-0" role="group" aria-label="League">
        {chips.map((c) => <button key={c.code} className="chip" aria-pressed={c.code === code} onClick={() => setCode(c.code)}>{c.comp && <LeagueLogo comp={c.comp} size={16} />}{c.label}</button>)}
      </div>
      {/* phones: compact ranked list (top 5) */}
      <ol className="lg:hidden card overflow-hidden divide-y divide-line/70">
        {q.loading ? Array.from({ length: 5 }).map((_, i) => <li key={i} className="p-3"><Skel className="h-12 rounded-xl" /></li>)
          : failedNoData ? <li className="p-2"><ErrorState compact title="Market values couldn’t be loaded" onRetry={q.retry} /></li>
          : list.length ? list.slice(0, 5).map((p, i) => (
            <li key={p.tmId || p.name}>
              <Wrap p={p} className="flex items-center gap-3 px-3 py-2.5 active:bg-surface-2/60">
                <span className={cx('grid place-items-center w-7 h-7 shrink-0 rounded-full display text-sm', i === 0 ? 'bg-lime text-lime-ink' : 'bg-surface-2 text-muted')}>{i + 1}</span>
                <Face p={p} size={46} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold leading-tight truncate">{p.name}</span>
                  <span className="block text-[11.5px] text-muted truncate">{[p.club, p.position].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="display text-xl text-brand num shrink-0">{p.valueLabel}</span>
              </Wrap>
            </li>
          ))
          : <li className="p-2"><Empty title="No market values for this league" /></li>}
      </ol>
      {/* lg and up: 7 compact cards in one row */}
      <div className="hidden lg:grid lg:grid-cols-7 gap-2.5">
        {q.loading ? Array.from({ length: 7 }).map((_, i) => <Skel key={i} className="h-[230px] rounded-2xl" />)
          : failedNoData ? <div className="col-span-7"><ErrorState compact title="Market values couldn’t be loaded" onRetry={q.retry} /></div>
          : list.length ? list.map((p, i) => <LeaderCard key={p.tmId || p.name} p={p} rank={i + 1} top={list[0].valueEur} />)
          : <div className="col-span-7"><Empty title="No market values for this league" /></div>}
      </div>
      <p className="text-[11px] text-muted mt-3">{VALUE_NOTE}</p>
    </div>
  );
}
