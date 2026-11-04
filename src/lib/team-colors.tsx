import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Fallbacks used until a crest has been read (or when it cannot be read): brand blue vs amber, as before. */
export const DEFAULT_HOME = '#0b3bbf', DEFAULT_AWAY = '#f59e0b';
export type TeamColors = { home: string; away: string; homeInk: string; awayInk: string; ready: boolean };

const cache = new Map<string, string | null>();           // crest url → "#rrggbb" or null (could not be read)
const LS = 'g4u:cc1:';                                      // remembered on the device: the second visit needs no waiting at all
const remembered = (src: string): string | null | undefined => {
  try { const v = localStorage.getItem(LS + src); if (v === null) return undefined; return v === 'none' ? null : v; } catch { return undefined; }
};
const remember = (src: string, v: string | null) => { try { localStorage.setItem(LS + src, v ?? 'none'); } catch { /* storage full or blocked */ } };
/** The colour if it is already known (this session or an earlier visit), undefined if it has to be read first. */
export function peekCrestColor(src?: string | null): string | null | undefined {
  if (!src) return null;
  if (cache.has(src)) return cache.get(src);
  const r = remembered(src); if (r !== undefined) cache.set(src, r);
  return r;
}
const pending = new Map<string, Promise<string | null>>();

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const parse = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lum = (h: string) => { const [r, g, b] = parse(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** White or near-black text, whichever reads better on the colour. */
export const inkOn = (h: string) => (lum(h) > 0.38 ? '#161616' : '#ffffff');
const dist = (a: string, b: string) => { const x = parse(a), y = parse(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };

/** The crest's main colour: the most common saturated, not-too-light, not-too-dark colour (white / grey / black backgrounds are ignored). */
export function dominantColor(data: Uint8ClampedArray): string | null {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]; if (a < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, sat = max === min ? 0 : (max - min) / (255 - Math.abs(2 * l - 255));
    if (sat < 0.35 || l < 40 || l > 215) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; bins.set(key, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  return best && best.n >= 12 ? hex(best.r / best.n, best.g / best.n, best.b / best.n) : null;
}

export function crestColor(src?: string | null): Promise<string | null> {
  if (!src) return Promise.resolve(null);
  const known = peekCrestColor(src); if (known !== undefined) return Promise.resolve(known);
  const hit = pending.get(src); if (hit) return hit;
  const job = new Promise<string | null>((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 48;
        const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 48, 48);
        resolve(dominantColor(ctx.getImageData(0, 0, 48, 48).data));
      } catch { resolve(null); }                          // a picture from another origin cannot be read: keep the default
    };
    img.onerror = () => resolve(null);
    img.src = src;
  }).then((v) => { cache.set(src, v); if (v) remember(src, v); pending.delete(src); return v; });
  pending.set(src, job);
  return job;
}

/** Shown only while a crest has not been read yet (first visit, a second or two): neutral, so nothing flashes from one colour to another. */
const NEUTRAL_HOME = '#64748b', NEUTRAL_AWAY = '#94a3b8';

/** Home / away colours taken from the two crests. If they are too alike to tell apart, the away side keeps a fallback. `ready` is false until both crests have been read. */
export function useCrestColors(homeCrest?: string | null, awayCrest?: string | null): TeamColors {
  const [c, setC] = useState<{ h: string | null | undefined; a: string | null | undefined }>(() => ({ h: peekCrestColor(homeCrest), a: peekCrestColor(awayCrest) }));
  useEffect(() => {
    let live = true;
    setC({ h: peekCrestColor(homeCrest), a: peekCrestColor(awayCrest) });
    Promise.all([crestColor(homeCrest), crestColor(awayCrest)]).then(([h, a]) => live && setC({ h, a }));
    return () => { live = false; };
  }, [homeCrest, awayCrest]);
  return useMemo(() => {
    const ready = c.h !== undefined && c.a !== undefined;
    if (!ready) return { home: NEUTRAL_HOME, away: NEUTRAL_AWAY, homeInk: '#ffffff', awayInk: '#161616', ready: false };
    const home = c.h || DEFAULT_HOME;
    let away = c.a || DEFAULT_AWAY;
    if (dist(home, away) < 90) away = c.a && dist(DEFAULT_AWAY, home) >= 90 ? DEFAULT_AWAY : dist(DEFAULT_HOME, home) >= 90 ? DEFAULT_HOME : '#6b7280';
    return { home, away, homeInk: inkOn(home), awayInk: inkOn(away), ready: true };
  }, [c]);
}

const Ctx = createContext<TeamColors>({ home: DEFAULT_HOME, away: DEFAULT_AWAY, homeInk: '#fff', awayInk: '#161616', ready: true });
export const TeamColorsProvider = ({ value, children }: { value: TeamColors; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export const useTeamColors = () => useContext(Ctx);
