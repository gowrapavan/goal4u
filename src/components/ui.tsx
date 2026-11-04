import { LeagueLogo } from './LeagueLogo';
import { playerImageSources, PLAYER_FALLBACK_IMAGE } from '../utils/formatting';
import { roundShort } from '../lib/match-round';
import { useState, useEffect, useRef, ReactNode, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { X, Play, ChevronRight, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { imageUrl } from '../utils/data-origin';
import { FMatch, FTeam, Video, phase, scoreOf, hasScore, kickoff, matchHref, tn, winnerOf, timeAgo, shortDate, compByCode } from '../lib/api';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function Crest({ src, name, size = 28, minSize }: { src?: string | null; name?: string; size?: number; minSize?: number }) {
  const dim = minSize ? `clamp(${minSize}px, ${Math.round(size / 6)}vw, ${size}px)` : size;
  const [bad, setBad] = useState(false);
  if (!src || bad)
    return (
      <span className="grid place-items-center rounded-full bg-surface-2 text-muted font-bold shrink-0" style={{ width: dim, height: dim, fontSize: size * 0.36 }}>
        {(name || '?').slice(0, 2).toUpperCase()}
      </span>
    );
  return <img src={src} alt="" loading="lazy" width={size} height={size} onError={() => setBad(true)} className="object-contain shrink-0" style={{ width: dim, height: dim }} />;
}

export const Skel = ({ className = '', style }: { className?: string; style?: CSSProperties }) => <div className={cx('skeleton', className)} style={style} />;

/** Empty state: restrained icon, a clear heading, one line of explanation and, only when there is something useful to do, one action. */
export function Empty({ title, hint, icon: Icon = Inbox, action, compact, className }: { title: string; hint?: string; icon?: LucideIcon; action?: { label: string; to?: string; onClick?: () => void }; compact?: boolean; className?: string }) {
  return (
    <div className={cx('card text-center min-w-0', compact ? 'p-5' : 'p-6 sm:p-8', className)}>
      <span aria-hidden className="mx-auto mb-3 grid place-items-center w-11 h-11 rounded-full bg-surface-2 text-muted"><Icon size={20} /></span>
      <p className="display-wide text-base sm:text-lg [overflow-wrap:anywhere]">{title}</p>
      {hint && <p className="text-muted mt-1 text-sm max-w-md mx-auto [overflow-wrap:anywhere]">{hint}</p>}
      {action && (action.to
        ? <Link to={action.to} className="chip on mt-4">{action.label}</Link>
        : <button type="button" onClick={action.onClick} className="chip on mt-4">{action.label}</button>)}
    </div>
  );
}

export function SectionHead({ title, href, label = 'See all', sub }: { title: string; href?: string; label?: string; sub?: string }) {
  return (
    <div className="flex items-end justify-between flex-wrap mb-3.5 gap-x-4 gap-y-1">
      <div>
        <h2 className="display text-[1.3rem] sm:text-[1.9rem]">{title}</h2>
        {sub && <p className="text-muted text-[12px] sm:text-sm mt-0.5 sm:mt-1">{sub}</p>}
      </div>
      {href && (
        <Link to={href} className="text-[13px] sm:text-sm font-semibold text-brand inline-flex items-center gap-0.5 whitespace-nowrap hover:underline">
          {label} <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function LivePill({ minute }: { minute?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-live font-bold text-xs">
      <span className="live-dot" /> {minute ? `${minute}'` : 'LIVE'}
    </span>
  );
}

export function StatusCell({ m }: { m: FMatch }) {
  const p = phase(m);
  if (p === 'live') return <LivePill minute={m.minute} />;
  if (p === 'ft') return <span className="text-muted text-xs font-semibold">FT</span>;
  if (p === 'postponed') return <span className="text-muted text-xs font-semibold">PP</span>;
  if (p === 'pending') return <span className="text-muted text-xs font-semibold">Awaiting</span>;
  if (p === 'started') return <span className="leading-tight"><span className="num text-sm font-bold block">{kickoff(m.utcDate)}</span><span className="text-[10px] font-semibold text-muted">Kicked off</span></span>;
  return <span className="num text-sm font-bold">{kickoff(m.utcDate)}</span>;
}

/** W/D/L form dots from "W,W,D,L,W" */
export function Form({ value, max = 5 }: { value?: string | null; max?: number }) {
  const items = (value || '').split(',').filter(Boolean).slice(-max);
  if (!items.length) return null;
  const col: Record<string, string> = { W: 'bg-pitch text-white', D: 'bg-surface-2 text-muted', L: 'bg-live text-white' };
  return (
    <span className="inline-flex gap-1">
      {items.map((r, i) => (
        <span key={i} className={cx('w-[18px] h-[18px] grid place-items-center rounded-[5px] text-[10px] font-bold', col[r] || col.D)}>{r}</span>
      ))}
    </span>
  );
}

function TeamLine({ t, score, win, dim }: { t: FTeam; score: ReactNode; win: boolean; dim: boolean }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Crest src={t.crest} name={t.name} size={24} />
      <span className={cx('truncate flex-1 text-[15px]', win ? 'font-bold' : 'font-medium', dim && 'text-muted')}>{tn(t)}</span>
      <span className={cx('num display-wide text-[17px] w-6 text-right', dim && 'text-muted')}>{score}</span>
    </div>
  );
}

/** Dense row used in lists (fixtures, results, team pages) */
export function MatchRow({ m, showComp }: { m: FMatch; showComp?: boolean }) {
  const p = phase(m); const s = scoreOf(m); const w = winnerOf(m); const show = hasScore(m) && p !== 'upcoming';
  return (
    <Link to={matchHref(m)} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-surface-2/60 transition-colors">
      <div className="text-center leading-tight">
        <StatusCell m={m} />
        {showComp && (() => { const c = compByCode(m.code); return c ? <span className="mt-1.5 flex justify-center" title={c.short}><LeagueLogo comp={c} size={14} /></span> : null; })()}
      </div>
      <div className="grid gap-1.5 min-w-0">
        <TeamLine t={m.homeTeam} score={show ? s.h : ''} win={w === 'h'} dim={w === 'a'} />
        <TeamLine t={m.awayTeam} score={show ? s.a : ''} win={w === 'a'} dim={w === 'h'} />
      </div>
      <ChevronRight size={16} className="text-muted" />
    </Link>
  );
}

/** Compact card for the horizontal scoreboard rail */
export function ScoreCard({ m }: { m: FMatch }) {
  const p = phase(m); const s = scoreOf(m); const show = hasScore(m) && p !== 'upcoming';
  return (
    <Link to={matchHref(m)} className="card block w-[210px] p-3 hover:border-ink transition-colors">
      <div className="flex items-center justify-between text-[11px] text-muted mb-2">
        <span className="font-semibold truncate">{compByCode(m.code)?.short ?? ''}{roundShort(m, m.code) ? `${compByCode(m.code) ? ' · ' : ''}${roundShort(m, m.code)}` : ''}</span>
        <StatusCell m={m} />
      </div>
      {[['homeTeam', s.h], ['awayTeam', s.a]].map(([k, sc]: any) => (
        <div key={k} className="flex items-center gap-2 py-1">
          <Crest src={(m as any)[k].crest} name={(m as any)[k].name} size={22} />
          <span className="truncate flex-1 text-sm font-semibold">{tn((m as any)[k])}</span>
          <span className="num display-wide">{show ? sc : ''}</span>
        </div>
      ))}
    </Link>
  );
}

/* ─────────────── Video ─────────────── */
export function VideoModal({ video, onClose }: { video: Video | null; onClose: () => void }) {
  useEffect(() => {
    if (!video) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [video, onClose]);
  if (!video) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={video.title} className="fixed inset-0 z-[80] bg-black/85 grid place-items-center p-4" onClick={onClose}>
      <button aria-label="Close video" className="absolute top-4 right-4 text-white bg-white/15 rounded-full p-2" onClick={onClose}><X size={20} /></button>
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="aspect-video bg-black rounded-xl overflow-hidden">
          <iframe title={video.title} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`} />
        </div>
        <p className="text-white font-semibold mt-3 line-clamp-2">{video.title}</p>
        <p className="text-white/60 text-sm">{video.channelName} · <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.youtube.com/watch?v=${video.videoId}`}>Open on YouTube</a></p>
      </div>
    </div>
  );
}

const thumb = (v: Video) => v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

/** Video thumbnail that never shows YouTube's grey "…" placeholder: tiny / broken images become a branded tile. */
export function VideoThumb({ v, className }: { v: Video; className?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className={cx('grid place-items-center bg-gradient-to-br from-brand to-[#0a1266] text-white', className)}><Play size={20} fill="currentColor" /></span>;
  return <img src={thumb(v)} alt="" loading="lazy" onError={() => setBad(true)} onLoad={(e) => { if (e.currentTarget.naturalWidth < 200) setBad(true); }} className={className} />;
}

export function VideoCard({ v, onPlay, big }: { v: Video; onPlay: (v: Video) => void; big?: boolean }) {
  return (
    <button onClick={() => onPlay(v)} className="group text-left block w-full self-start align-top">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-2">
        <VideoThumb v={v} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className={cx('absolute left-3 bottom-3 grid place-items-center rounded-full bg-white text-black shadow transition-transform group-hover:scale-110', big ? 'w-12 h-12' : 'w-9 h-9')}><Play size={big ? 20 : 15} fill="currentColor" /></span>
      </div>
      <p className={cx('font-semibold mt-2 line-clamp-2 leading-snug group-hover:text-brand transition-colors', big ? 'text-lg' : 'text-[13.5px] sm:text-sm')}>{v.title}</p>
      <p className="text-xs text-muted mt-0.5">{v.channelName} · {timeAgo(v.uploadDate)}</p>
    </button>
  );
}

export function ShortCard({ v, onPlay }: { v: Video; onPlay: (v: Video) => void }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;                                                         // no thumbnail, no card
  const check = (e: { currentTarget: HTMLImageElement }) => { const i = e.currentTarget; if (i.naturalWidth > 0 && i.naturalWidth <= 130) setHidden(true); };   // YouTube's grey placeholder is 120 px wide
  return (
    <button onClick={() => onPlay(v)} className="relative block w-[150px] sm:w-[170px] aspect-[9/16] rounded-2xl overflow-hidden bg-surface-2 group text-left">
      <img src={`https://i.ytimg.com/vi/${v.videoId}/oar2.jpg`} onLoad={check} onError={(e) => { const i = e.target as HTMLImageElement; if (i.dataset.fb) setHidden(true); else { i.dataset.fb = '1'; i.src = thumb(v); } }} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      <span className="absolute bottom-0 p-3 text-white">
        <span className="line-clamp-3 text-[13px] font-semibold leading-snug">{v.title.replace(/#\w+/g, '').trim()}</span>
        <span className="block text-[11px] text-white/70 mt-1 truncate">{v.channelName}</span>
      </span>
    </button>
  );
}

export function useVideoPlayer() {
  const [v, setV] = useState<Video | null>(null);
  return { play: setV, modal: <VideoModal video={v} onClose={() => setV(null)} /> };
}

export { shortDate };

/** Trophy tiles — images come from the data repo (public + local_path), same as v3 */
export function TrophyGrid({ items }: { items: { name: string; count?: string | number; local_path?: string | null }[] }) {
  if (!items?.length) return null;
  return (
    <ul className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 9.75rem), 1fr))' }}>
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl bg-surface-2/60 p-3 min-w-0">
          <span className="w-10 h-12 shrink-0 grid place-items-center">
            {t.local_path ? <img src={imageUrl(t.local_path)} alt="" loading="lazy" className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} /> : null}
          </span>
          <span className="min-w-0 flex-1"><span className="display-wide text-lg leading-none text-brand">{String(t.count ?? 1).replace(/x$/i, '')}×</span><span className="block text-[13px] font-medium leading-snug mt-1 [overflow-wrap:anywhere]">{t.name?.trim()}</span></span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A player photo. Sources are tried best first (headshot png → player_images jpg → default.jpg).
 *  - A picture that really does not exist (404) moves straight to the next source.
 *  - A picture that failed because of the connection (slow, dropped, server busy) is asked for again, quietly, after 0.8 s, 1.6 s, 3.2 s — the page
 *    shows default.jpg meanwhile, and asks for the real photo again later (every 15 s, and the moment the phone is back online).
 *  - Only if even default.jpg cannot be shown does `fallback` (initials) appear.
 */
export function PlayerImg({ id, imagePath, alt = '', className, style, fallback, size }: { id?: number | string | null; imagePath?: string | null; alt?: string; className?: string; style?: CSSProperties; fallback?: React.ReactNode; size?: number }) {
  const real = useMemo(() => playerImageSources(id, imagePath), [id, imagePath]);
  const srcs = useMemo(() => (PLAYER_FALLBACK_IMAGE ? [...real, PLAYER_FALLBACK_IMAGE] : real), [real]);
  const [i, setI] = useState(0);          // which source
  const [tries, setTries] = useState(0);  // connection retries on this source
  const [round, setRound] = useState(0);  // background rounds for the real photo
  const timer = useRef<number | undefined>(undefined);
  const lastReal = real.length;           // index of default.jpg
  useEffect(() => { setI(0); setTries(0); setRound(0); }, [srcs]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // While default.jpg is showing because of a bad connection, look for the real photo again.
  const [waitingForReal, setWaitingForReal] = useState(false);
  useEffect(() => {
    if (!waitingForReal) return;
    const again = () => { setWaitingForReal(false); setI(0); setTries(0); setRound((r) => r + 1); };
    const t = window.setTimeout(again, 15000);
    window.addEventListener('online', again, { once: true });
    return () => { window.clearTimeout(t); window.removeEventListener('online', again); };
  }, [waitingForReal]);

  if (i >= srcs.length) return <>{fallback ?? null}</>;
  const onError = async () => {
    const url = srcs[i];
    let missing = false;
    try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); missing = r.status === 404 || r.status === 400 || r.status === 403; } catch { missing = false; }
    if (missing) { setTries(0); setI((n) => n + 1); return; }                 // it is simply not there: next source
    if (tries < 3) { timer.current = window.setTimeout(() => setTries((t) => t + 1), 800 * 2 ** tries); return; }
    // The connection keeps failing: show default.jpg now, keep looking for the real photo in the background.
    if (i < lastReal && round < 6) { setWaitingForReal(true); setTries(0); setI(lastReal); return; }
    setI((n) => n + 1);
  };
  return <img key={`${i}-${tries}-${round}`} src={srcs[i]} alt={alt} loading="lazy" decoding="async" width={size} height={size} onError={onError} className={className} style={style} />;
}
