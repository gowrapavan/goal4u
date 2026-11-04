import { useMemo, useRef, useState } from 'react';
import { ErrorState, SkelGroup, SlowNetworkIndicator, StaleNotice, VideoCardSkel } from '../components/states';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { STATIC_SEO } from '../lib/seo-text';
import { Skel, VideoCard, VideoThumb, ShortCard, useVideoPlayer, Empty, cx } from '../components/ui';
import { YouTubePlayer } from '../components/YouTubePlayer';
import { getVideos, getShorts, useAsync, timeAgo, Video } from '../lib/api';

const UP_NEXT = 8;

/* Videos that failed to play for THIS viewer (region blocks differ per country) are remembered for a week and skipped. */
const BLOCK_KEY = 'g4u:blocked-videos'; const WEEK = 7 * 864e5;
const readBlocked = (): Record<string, number> => {
  try { const o = JSON.parse(localStorage.getItem(BLOCK_KEY) || '{}'); const now = Date.now(); return Object.fromEntries(Object.entries(o).filter(([, t]) => now - (t as number) < WEEK)) as Record<string, number>; } catch { return {}; }
};
const saveBlocked = (o: Record<string, number>) => { try { localStorage.setItem(BLOCK_KEY, JSON.stringify(o)); } catch { /* private mode */ } };

export function Watch() {
  const [tab, setTab] = useState<'videos' | 'shorts'>('videos');
  const [n, setN] = useState(24);
  const [channel, setChannel] = useState('');
  const [picked, setPicked] = useState<Video | null>(null);
  const [autoplay, setAutoplay] = useState(false);       // first video is cued, not auto-played
  const [blocked, setBlocked] = useState<Record<string, number>>(readBlocked);
  const [notice, setNotice] = useState<{ title: string; id: string } | null>(null);
  const playerTop = useRef<HTMLDivElement>(null);
  const [sp] = useSearchParams(); const wanted = sp.get('v');
  const vids = useAsync(() => getVideos(n + 24), [n]);
  const shorts = useAsync(() => getShorts(n + 24), [n]);
  const { play: playShort, modal } = useVideoPlayer();     // shorts keep the vertical pop-up player

  const src = tab === 'videos' ? vids : shorts;
  // A failed "load more" must not wipe the page: keep the last list that did load.
  const keptV = useRef<Video[] | null>(null); const keptS = useRef<Video[] | null>(null);
  if (vids.data) keptV.current = vids.data; if (shorts.data) keptS.current = shorts.data;
  const srcData = tab === 'videos' ? vids.data ?? keptV.current : shorts.data ?? keptS.current;
  const channels = useMemo(() => [...new Set((srcData || []).map((v) => v.channelName))].slice(0, 14), [srcData]);
  const list = (srcData || []).filter((v) => (!channel || v.channelName === channel) && (tab === 'shorts' || !blocked[v.videoId]));

  // The main player shows the picked video if it is still in the filtered list, otherwise the first one.
  const fromLink = !picked && wanted ? list.find((v) => v.videoId === wanted) : undefined;
  const active = picked && list.some((v) => v.videoId === picked.videoId) ? picked : fromLink || list[0] || null;
  const rest = list.filter((v) => v.videoId !== active?.videoId);
  const choose = (v: Video) => { setPicked(v); setAutoplay(true); setNotice(null); playerTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  // The player reported an error twice in a row (region block, private, embedding off): remember it and move on.
  const skip = (v: Video) => {
    const next = { ...blocked, [v.videoId]: Date.now() };
    setBlocked(next); saveBlocked(next);
    setNotice({ title: v.title, id: v.videoId });
    const nxt = rest.find((x) => x.videoId !== v.videoId) || null;
    setPicked(nxt);
  };

  return (
    <div className="max-w-[88rem] mx-auto px-4 pt-6">
      <SEO {...STATIC_SEO.watch} />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-4"><h1 className="display text-3xl sm:text-4xl">Watch</h1>
        <div className="flex gap-1 p-1 bg-surface-2 rounded-full" role="tablist">
          {(['videos', 'shorts'] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setChannel(''); }} className={cx('px-4 h-9 rounded-full text-sm font-semibold capitalize transition-colors', tab === k ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>{k}</button>)}
        </div>
      </div>
      <div className="scroll-x gap-2 -mx-4 px-4 lg:mx-0 lg:px-0 mb-6">
        <button className="chip" aria-pressed={!channel} onClick={() => setChannel('')}>All channels</button>
        {channels.map((c) => <button key={c} className="chip" aria-pressed={channel === c} onClick={() => setChannel(c)}>{c}</button>)}
      </div>

      {src.error && srcData && <StaleNotice what={`more ${tab}`} onRetry={src.retry} />}
      {src.loading && !srcData ? (
        <SkelGroup label={`Loading ${tab}`}>
          {tab === 'shorts'
            ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skel key={i} className="aspect-[9/16] rounded-2xl" />)}</div>
            : <><div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6"><Skel className="aspect-video rounded-xl sm:rounded-2xl" /><Skel className="h-72 max-lg:hidden" /></div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6 mt-8">{Array.from({ length: 8 }).map((_, i) => <VideoCardSkel key={i} />)}</div></>}
          <SlowNetworkIndicator loading={src.loading} />
        </SkelGroup>
      )
        : src.error && !srcData ? <div className="max-w-md mx-auto"><ErrorState title={`${tab === 'videos' ? 'Videos' : 'Shorts'} couldn’t be loaded`} onRetry={src.retry} /></div>
        : !list.length ? (
          <div className="max-w-md mx-auto">{channel
            ? <Empty icon={PlayCircle} title="No videos from this channel" hint="Choose All channels to see everything." action={{ label: 'All channels', onClick: () => setChannel('') }} />
            : !(srcData || []).length
              ? <Empty icon={PlayCircle} title={`No ${tab} available right now`} hint="New videos appear here as channels publish them." />
              : <Empty icon={PlayCircle} title="These videos can’t be played here" hint="Playback failed for every video in this list, usually because of a regional or embedding restriction. They can still be opened on YouTube." />}</div>)
        : tab === 'shorts' ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 justify-items-center">{list.map((v) => <ShortCard key={v.videoId} v={v} onPlay={playShort} />)}</div>
        : active && (
          <>
            <div ref={playerTop} className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-stretch scroll-mt-32">
              {/* Main embedded player */}
              <div className="min-w-0">
                <div className="aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-black shadow-lg">
                  <YouTubePlayer key={active.videoId} videoId={active.videoId} title={active.title} autoplay={autoplay || !!fromLink} onUnavailable={() => skip(active)} />
                </div>
                {notice && (
                  <p role="status" className="mt-2 text-xs rounded-lg bg-surface-2 px-3 py-2 text-muted flex flex-wrap items-center gap-x-2">
                    <span className="min-w-0">“{notice.title}” can’t be played here, so it was skipped.</span>
                    <a className="text-brand font-semibold hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.youtube.com/watch?v=${notice.id}`}>Open on YouTube</a>
                    <button className="font-semibold hover:text-ink" onClick={() => setNotice(null)}>Dismiss</button>
                  </p>
                )}
                <h2 className="display-wide text-lg sm:text-xl mt-3 leading-snug">{active.title}</h2>
                <p className="text-sm text-muted mt-1 flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold text-ink">{active.channelName}</span><span>·</span><span>{timeAgo(active.uploadDate)}</span><span>·</span>
                  <a className="inline-flex items-center gap-1 text-brand font-semibold hover:underline" target="_blank" rel="noopener noreferrer" href={`https://www.youtube.com/watch?v=${active.videoId}`}>Open on YouTube <ExternalLink size={13} /></a>
                </p>
              </div>
              {/* Up next — pinned to the player's height on desktop, scrolls inside */}
              <aside className="relative min-w-0" aria-label="Up next">
                <div className="flex flex-col lg:absolute lg:inset-0 card p-3 sm:p-4">
                  <p className="font-bold mb-3 shrink-0">Up next</p>
                  <ul className="space-y-1 overflow-y-auto thin-scroll max-h-[26rem] lg:max-h-none lg:flex-1 lg:min-h-0 pr-1.5">
                    {rest.slice(0, UP_NEXT).map((v) => (
                      <li key={v.videoId}>
                        <button onClick={() => choose(v)} className="group flex gap-3 text-left w-full rounded-lg p-1.5 hover:bg-surface-2/60 transition-colors">
                          <VideoThumb v={v} className="w-[132px] aspect-video rounded-lg object-cover bg-surface-2 shrink-0" />
                          <span className="min-w-0"><span className="block text-sm font-semibold leading-snug line-clamp-3 group-hover:text-brand">{v.title}</span><span className="block text-xs text-muted mt-1 truncate">{v.channelName} · {timeAgo(v.uploadDate)}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>

            {rest.length > UP_NEXT && (
              <section className="mt-10">
                <h2 className="display text-[1.6rem] sm:text-[1.9rem] mb-4">More videos</h2>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6 sm:gap-y-7">{rest.slice(UP_NEXT).map((v) => <VideoCard key={v.videoId} v={v} onPlay={choose} />)}</div>
              </section>
            )}
          </>
        )}
      {src.data && src.data.length >= n && <div className="text-center mt-10"><button className="chip on" onClick={() => setN(n + 24)}>Load more</button></div>}
      {modal}
    </div>
  );
}
