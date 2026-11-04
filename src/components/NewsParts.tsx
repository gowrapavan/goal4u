import { useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cx } from './ui';
import { timeAgo } from '../lib/api';
import { topicOf } from '../server/news-filter';

export type Related = { matchId: number; code: string; label: string; short?: string; kickoff: string; both: boolean };
export type Article = { title: string; url: string; urlToImage?: string | null; publishedAt?: string; description?: string | null; source?: { name?: string }; related?: Related };

export const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Image with a branded fallback (source initials) when missing or broken. */
export function NewsThumb({ a, className, plain, onBad }: { a: Article; className?: string; plain?: boolean; onBad?: (url: string) => void }) {
  const [bad, setBad] = useState(false);
  const [ok, setOk] = useState(false);
  const fail = () => { setBad(true); if (a.urlToImage) onBad?.(a.urlToImage); };
  const initials = (a.source?.name || 'News').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return a.urlToImage && !bad
    ? <img src={a.urlToImage} alt="" loading="lazy" ref={(el) => { if (el && el.complete && el.naturalWidth > 40 && !ok) setOk(true); }} onError={fail} onLoad={(e) => { if (e.currentTarget.naturalWidth <= 40) fail(); else setOk(true); }} className={cx('w-full h-full object-cover transition-opacity duration-300', ok ? 'opacity-100' : 'opacity-0', className)} />
    : <span className={cx('grid place-items-center w-full h-full bg-gradient-to-br from-brand to-[#0a1266] text-white/90 display text-3xl sm:text-4xl', className)}>{plain ? null : initials}</span>;
}

/** “Atleti v Man United” → “ATL v MUN”: uses the team codes (tla) from the data; older cached items fall back to the first 3 letters. */
const shortLabel = (r: Related) => r.short || r.label.split(/\s+v\s+/).map((t) => t.replace(/[^\p{L}]/gu, '').slice(0, 3).toUpperCase()).join(' v ');

const matchChip = 'inline-flex items-center gap-1 h-5 px-2 rounded-full bg-brand text-brand-ink text-[10.5px] font-bold whitespace-nowrap shrink-0';
const topicChip = 'inline-flex items-center h-5 px-2 rounded-full bg-lime text-lime-ink text-[10.5px] font-bold whitespace-nowrap shrink-0';

/**
 * Source · time, with the story's tag beside it (match tag or topic tag). The tag adapts to the room it has:
 * full text if it fits (“Atleti v Man United”), team codes if not (“ATL v MUN”), hidden only if even that does not fit.
 * Widths are measured against hidden copies, so it follows the real text and the card width (no layout jump).
 */
export function NewsMeta({ a }: { a: Article }) {
  const box = useRef<HTMLSpanElement>(null), gText = useRef<HTMLSpanElement>(null), gFull = useRef<HTMLSpanElement>(null), gShort = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<'full' | 'short' | 'none'>('full');
  const rel = a.related, topic = rel ? null : topicOf(a);
  const full = rel?.label || topic || '', short = rel ? shortLabel(rel) : full;
  const text = `${a.source?.name || ''}${a.publishedAt ? ` · ${timeAgo(a.publishedAt)}` : ''}`;
  useLayoutEffect(() => {
    const b = box.current; if (!b || !full || !gText.current || !gFull.current || !gShort.current) return;
    const measure = () => {
      const room = b.clientWidth, base = gText.current!.offsetWidth + 8;
      setMode(base + gFull.current!.offsetWidth <= room ? 'full' : base + gShort.current!.offsetWidth <= room ? 'short' : 'none');
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(b);
    return () => ro.disconnect();
  }, [full, short, text]);
  const chip = (label: string) => rel
    ? <span className={matchChip}><CalendarDays size={11} className="shrink-0" />{label}</span>
    : <span className={topicChip}>{label}</span>;
  if (!full) return <span className="block text-xs text-muted">{text}</span>;
  return (
    <span ref={box} className="relative flex items-center gap-2 w-full min-w-0 overflow-hidden min-h-5">
      <span className={cx('text-xs text-muted whitespace-nowrap', mode === 'none' && 'truncate min-w-0')}>{text}</span>
      {mode !== 'none' && chip(mode === 'full' ? full : short)}
      {/* hidden copies used only for measuring */}
      <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-2 whitespace-nowrap">
        <span ref={gText} className="text-xs">{text}</span><span ref={gFull}>{chip(full)}</span><span ref={gShort}>{chip(short)}</span>
      </span>
    </span>
  );
}

/** Match-related stories get a match tag (“Atleti v Man United”); others get their topic tag. */
export function NewsTag({ a }: { a: Article }) {
  if (a.related) return <span className="inline-flex items-center gap-1.5 h-6 px-2.5 max-sm:h-5 max-sm:px-2 max-sm:text-[10px] rounded-full bg-brand text-brand-ink text-[11px] font-bold max-w-full"><CalendarDays size={12} className="shrink-0" /><span className="truncate">{a.related.label}</span></span>;
  const t = topicOf(a);
  return t ? <span className="inline-flex items-center h-6 px-2.5 max-sm:h-5 max-sm:px-2 max-sm:text-[10px] rounded-full bg-lime text-lime-ink text-[11px] font-bold self-start">{t}</span> : null;
}
