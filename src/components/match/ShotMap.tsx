import { useMemo, useState } from 'react';
import { cx } from '../ui';
import type { ShotDetail } from '../../lib/match-details-types';
import { VIEW_W, VIEW_H, shotXY, markerRadius, starPoints, filterShots, onTarget, type ShotFilter } from '../../lib/shot-map';

const f2 = (n: number) => n.toFixed(2);
const sum = (a: ShotDetail[]) => a.reduce((n, s) => n + s.xg, 0);
const OUT_L: Record<ShotDetail['outcome'], string> = { goal: 'Goal', saved: 'Saved', off: 'Off target', blocked: 'Blocked', post: 'Hit the post' };
const TEAM_C = { home: '#6d83ff', away: '#f5a524' } as const;
const LIME = '#aee600', INK = '#0b1437';
const FILTERS: [ShotFilter, string][] = [['all', 'All shots'], ['goals', 'Goals'], ['target', 'On target'], ['missed', 'Missed']];

/** The half pitch: deep blue with soft stripes, white lines, the box lightly lit. Goal at the top. */
function HalfPitch() {
  const cx0 = VIEW_W / 2;
  return (
    <g>
      <rect width={VIEW_W} height={VIEW_H} fill="url(#sm-grass)" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="0" y={i * 8} width={VIEW_W} height="4" fill="#fff" fillOpacity=".025" />)}
      <rect x="13.84" y="0" width="40.32" height="16.5" fill="#fff" fillOpacity=".05" />
      <g fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth=".3">
        <path d={`M0.4 ${VIEW_H}V0.4H${VIEW_W - 0.4}V${VIEW_H}`} />
        <rect x="13.84" y="0.4" width="40.32" height="16.1" />
        <rect x="24.84" y="0.4" width="18.32" height="5.1" />
        <path d={`M${cx0 - 7.31} 16.5A9.15 9.15 0 0 0 ${cx0 + 7.31} 16.5`} />
        <rect x="30.34" y="-1.4" width="7.32" height="1.8" strokeOpacity=".8" />
      </g>
      <circle cx={cx0} cy="11" r=".45" fill="#fff" fillOpacity=".8" />
    </g>
  );
}

function Mark({ s, selected, dim, onPick }: { s: ShotDetail; selected: boolean; dim: boolean; onPick: () => void }) {
  const p = shotXY(s); const r = markerRadius(s.xg);
  return (
    <g onClick={onPick} onMouseEnter={onPick} onFocus={onPick} tabIndex={0} role="button" opacity={dim ? 0.3 : 1} style={{ cursor: 'pointer', outline: 'none' }}
      aria-label={`${s.player ?? 'Unknown player'}, ${s.minute}', ${OUT_L[s.outcome]}, xG ${f2(s.xg)}`}>
      <circle cx={p.x} cy={p.y} r={Math.max(r + 2, 4)} fill="transparent" />
      {selected && <circle cx={p.x} cy={p.y} r={r + 2.2} fill="none" stroke="#fff" strokeWidth=".5" strokeDasharray="1.4 1" />}
      {s.outcome === 'goal' && <polygon points={starPoints(p.x, p.y, r * 1.35)} fill={LIME} stroke={INK} strokeWidth=".45" strokeLinejoin="round" />}
      {s.outcome === 'saved' && <circle cx={p.x} cy={p.y} r={r} fill={LIME} fillOpacity=".92" stroke="#fff" strokeOpacity=".9" strokeWidth=".35" />}
      {s.outcome === 'post' && <><circle cx={p.x} cy={p.y} r={r} fill="none" stroke={LIME} strokeWidth=".7" /><circle cx={p.x} cy={p.y} r={r * 0.32} fill={LIME} /></>}
      {s.outcome === 'off' && <circle cx={p.x} cy={p.y} r={r} fill="#fff" fillOpacity=".28" stroke="#fff" strokeOpacity=".75" strokeWidth=".3" />}
      {s.outcome === 'blocked' && <path d={`M${p.x - r * .7} ${p.y - r * .7}L${p.x + r * .7} ${p.y + r * .7}M${p.x + r * .7} ${p.y - r * .7}L${p.x - r * .7} ${p.y + r * .7}`} stroke="#fff" strokeOpacity=".85" strokeWidth=".6" strokeLinecap="round" />}
    </g>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-xl bg-surface-2/70 px-2.5 py-2 text-center"><p className={cx('display num text-xl leading-none', accent && 'text-brand')}>{value}</p><p className="text-[10px] uppercase tracking-wide text-muted mt-1">{label}</p></div>;
}

function Legend() {
  const ico = (k: ShotDetail['outcome']) => (
    <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden className="shrink-0 rounded bg-[#14209f]">
      {k === 'goal' && <polygon points={starPoints(0, 0.4, 6)} fill={LIME} stroke={INK} strokeWidth=".8" />}
      {k === 'saved' && <circle r="4.2" fill={LIME} stroke="#fff" strokeWidth=".7" />}
      {k === 'post' && <><circle r="4.2" fill="none" stroke={LIME} strokeWidth="1.4" /><circle r="1.4" fill={LIME} /></>}
      {k === 'off' && <circle r="4.2" fill="#fff" fillOpacity=".3" stroke="#fff" strokeOpacity=".8" strokeWidth=".7" />}
      {k === 'blocked' && <path d="M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
  return <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted">{(['goal', 'saved', 'post', 'off', 'blocked'] as const).map((k) => <li key={k} className="inline-flex items-center gap-1.5">{ico(k)}{OUT_L[k]}</li>)}<li className="inline-flex items-center gap-1.5">Bigger marker = bigger chance (xG)</li></ul>;
}

function Panel({ side, name, all, shown, sel, onSel }: { side: 'home' | 'away'; name: string; all: ShotDetail[]; shown: ShotDetail[]; sel: ShotDetail | null; onSel: (s: ShotDetail | null) => void }) {
  const order = useMemo(() => [...shown].sort((a, b) => (a.outcome === 'goal' ? 1 : 0) - (b.outcome === 'goal' ? 1 : 0) || b.xg - a.xg), [shown]);   // goals drawn last, on top
  const goals = all.filter((s) => s.outcome === 'goal').length;
  return (
    <div className="rounded-2xl border border-line overflow-hidden bg-surface min-w-0">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <p className="font-bold inline-flex items-center gap-2 min-w-0"><i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TEAM_C[side] }} /><span className="truncate">{name}</span></p>
        <span className="text-[11px] font-semibold text-muted shrink-0">attacking ↑</span>
      </div>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full h-auto touch-manipulation" role="group" aria-label={`${all.length} shots for ${name}`} onMouseLeave={() => onSel(null)}>
        <defs><linearGradient id="sm-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a2bd0" /><stop offset="1" stopColor="#101a8f" /></linearGradient></defs>
        <HalfPitch />
        {order.map((s, i) => <Mark key={`${s.team}-${s.minute}-${i}`} s={s} selected={sel === s} dim={!!sel && sel !== s} onPick={() => onSel(s)} />)}
        {!order.length && <text x={VIEW_W / 2} y={VIEW_H / 2 + 6} textAnchor="middle" fontSize="3" fill="#fff" fillOpacity=".7">No shots in this view</text>}
      </svg>
      <div className="grid grid-cols-4 gap-2 p-3">
        <Tile label="Shots" value={String(all.length)} />
        <Tile label="On target" value={String(all.filter((s) => onTarget(s.outcome)).length)} />
        <Tile label="Goals" value={String(goals)} accent />
        <Tile label="xG" value={f2(sum(all))} />
      </div>
    </div>
  );
}

/** Shots on two half-pitches (one per team), sized by expected goals. Tap or hover a shot for who, when and how good the chance was. */
export function ShotMap({ shots, homeName, awayName }: { shots: ShotDetail[]; homeName: string; awayName: string }) {
  const [filter, setFilter] = useState<ShotFilter>('all');
  const [sel, setSel] = useState<ShotDetail | null>(null);
  if (!shots.length) return null;
  const h = shots.filter((s) => s.team === 'home'), a = shots.filter((s) => s.team === 'away');
  const hs = filterShots(h, filter), as = filterShots(a, filter);
  const picked = sel && (hs.includes(sel) || as.includes(sel)) ? sel : null;
  return (
    <section className="card p-4 sm:p-5" aria-label="Shot map">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div><h3 className="display-wide text-base">Shot map</h3><p className="text-xs text-muted mt-0.5">Where each team shot from, looking at the goal they attacked.</p></div>
        <div role="tablist" aria-label="Shots to show" className="inline-flex rounded-full border border-line p-0.5 text-xs font-semibold">
          {FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setSel(null); }} className={cx('px-3 h-8 rounded-full', filter === k ? 'bg-ink text-bg' : 'text-muted hover:text-ink')}>{l}</button>)}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Panel side="home" name={homeName} all={h} shown={hs} sel={picked} onSel={setSel} />
        <Panel side="away" name={awayName} all={a} shown={as} sel={picked} onSel={setSel} />
      </div>
      <div className="mt-4 min-h-[3.5rem] rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-sm flex items-center gap-3" aria-live="polite">
        {picked ? (
          <>
            <i className="w-3 h-3 rounded-full shrink-0" style={{ background: TEAM_C[picked.team] }} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{picked.player ?? 'Unknown player'} <span className="num text-muted font-normal">· {picked.minute}'</span></p>
              <p className="text-xs text-muted truncate">{[picked.body, picked.situation].filter(Boolean).join(' · ') || (picked.team === 'home' ? homeName : awayName)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={cx('text-xs font-bold', picked.outcome === 'goal' ? 'text-emerald-600' : 'text-ink')}>{OUT_L[picked.outcome]}</p>
              <p className="num text-xs text-muted">xG <b className="text-ink">{f2(picked.xg)}</b>{picked.xgot != null && picked.xgot > 0 ? <> · xGOT <b className="text-ink">{f2(picked.xgot)}</b></> : null}</p>
            </div>
          </>
        ) : <p className="text-xs text-muted">Tap or hover a shot to see who took it, when, and how good the chance was.</p>}
      </div>
      <div className="mt-3"><Legend /></div>
    </section>
  );
}
