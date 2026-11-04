import { useEffect, useRef } from 'react';

/** Loads YouTube's IFrame Player API once, shared by every player on the page. */
let apiPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('YouTube API blocked')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/**
 * Embedded YouTube player that reports playback errors instead of silently showing "Video unavailable".
 *  - On the first error it retries once (embeds sometimes fail on a cold load and play fine on the second try).
 *  - If the retry fails too (region-blocked, private, embedding disabled …) it calls `onUnavailable(code)`,
 *    so the page can skip to the next video. Error codes: 2 invalid, 5 player error, 100 not found/private,
 *    101/150 embedding blocked (also used for region blocks), 153 player configuration.
 *  - If the API script itself is blocked, it falls back to a plain iframe embed.
 */
export function YouTubePlayer({ videoId, title, autoplay, onUnavailable }: {
  videoId: string; title: string; autoplay: boolean; onUnavailable: (code: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onUnavailable); report.current = onUnavailable;

  useEffect(() => {
    let dead = false; let player: any = null; let retried = false;
    loadYT().then((YT) => {
      if (dead || !host.current) return;
      const mount = document.createElement('div');
      host.current.replaceChildren(mount);
      player = new YT.Player(mount, {
        videoId, width: '100%', height: '100%',
        playerVars: { autoplay: autoplay ? 1 : 0, rel: 0, modestbranding: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onError: (e: { data: number }) => {
            if (dead) return;
            if (!retried) {
              retried = true;
              setTimeout(() => { try { autoplay ? player.loadVideoById(videoId) : player.cueVideoById(videoId); } catch { /* player gone */ } }, 400);
              return;
            }
            report.current(e.data);
          },
        },
      });
    }).catch(() => {
      if (dead || !host.current) return;
      const f = document.createElement('iframe');
      f.src = `https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1`;
      f.title = title; f.allowFullscreen = true; f.className = 'w-full h-full';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      host.current.replaceChildren(f);
    });
    return () => { dead = true; try { player?.destroy(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return <div ref={host} className="w-full h-full [&_iframe]:w-full [&_iframe]:h-full" aria-label={title} />;
}
