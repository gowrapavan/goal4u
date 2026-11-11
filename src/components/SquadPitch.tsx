import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skel, PlayerImg, Crest, cx } from './ui';
import { getTeamFormation, useAsync, type TeamFormation } from '../lib/api';
import { buildXI, poolFromSquad, DEFAULT_FORMATION, STANDARD_FORMATIONS, type FilledSlot, type PoolPlayer } from '../lib/formation';

const PARTICLES = new Set(['de', 'van', 'von', 'da', 'di', 'dos', 'del', 'le', 'la', 'el', 'al', 'ten', 'ter', 'der', 'den', 'mac', 'mc']);
/** "Bruno Fernandes" → "Fernandes", "Matthijs de Ligt" → "de Ligt": the name that fits under a photo. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1], prev = parts[parts.length - 2];
  return PARTICLES.has(prev.toLowerCase()) ? `${prev} ${last}` : last;
}
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const pct = (n: number) => `${Math.round(n * 100)}%`;
const SECTOR_LABEL: Record<string, string> = { g: 'Goalkeeper', d: 'Defender', m: 'Midfielder', f: 'Forward' };

function Photo({ p, className }: { p: PoolPlayer; className: string }) {
  return (
    <span className={cx('block rounded-full overflow-hidden bg-white shadow-lg', className)}>
      <PlayerImg id={p.id} alt={p.name} size={64} className="w-full h-full object-cover object-top"
        fallback={<span className="w-full h-full grid place-items-center font-bold text-white bg-[#1d4ed8] text-sm">{initials(p.name)}</span>} />
    </span>
  );
}

function PitchLines() {
  return (
    <svg viewBox="0 0 100 125" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
      <g fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth=".4">
        <rect x="4" y="4" width="92" height="117" />
        <line x1="4" y1="62.5" x2="96" y2="62.5" /><circle cx="50" cy="62.5" r="11" />
        <rect x="24" y="4" width="52" height="19" /><rect x="37" y="4" width="26" height="7" />
        <rect x="24" y="102" width="52" height="19" /><rect x="37" y="114" width="26" height="7" />
        <path d="M42.45 23A11 11 0 0 0 57.55 23" /><path d="M42.45 102A11 11 0 0 1 57.55 102" />
        <rect x="43" y="1.6" width="14" height="2.4" /><rect x="43" y="121" width="14" height="2.4" />
      </g>
      <g fill="#fff" fillOpacity=".7"><circle cx="50" cy="62.5" r=".6" /><circle cx="50" cy="15" r=".5" /><circle cx="50" cy="110" r=".5" /></g>
    </svg>
  );
}

function Token({ s, crest }: { s: FilledSlot; crest: string | null }) {
  const style = { left: `${s.x}%`, top: `${s.y}%` };
  const base = 'absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[clamp(3.4rem,18cqw,6rem)] transition-all duration-500';
  if (!s.player) return <span className={base} style={style}><span className="w-[clamp(2.3rem,11.5cqw,4rem)] h-[clamp(2.3rem,11.5cqw,4rem)] rounded-full border-2 border-dashed border-white/60 grid place-items-center text-white/70 text-lg">?</span></span>;
  const p = s.player;
  return (
    <Link to={`/player/${p.id}`} className={cx(base, 'group')} style={style} title={`${p.name}${p.role ? ` · ${p.role}` : ''}`}>
      <span className="relative">
        <Photo p={p} className="w-[clamp(2.3rem,11.5cqw,4rem)] h-[clamp(2.3rem,11.5cqw,4rem)] border-[3px] border-white group-hover:scale-105 transition-transform" />
        {crest && <img src={crest} alt="" width={20} height={20} loading="lazy" className="absolute -top-1 -right-1.5 w-[clamp(14px,3.6cqw,20px)] h-[clamp(14px,3.6cqw,20px)] object-contain rounded-full bg-white p-px shadow" />}
        {p.number && <span className="absolute -bottom-1 -left-1.5 min-w-[clamp(14px,3.6cqw,18px)] h-[clamp(14px,3.6cqw,18px)] px-1 rounded-full bg-[#0b1437] text-white text-[clamp(8px,1.9cqw,10px)] font-bold grid place-items-center num ring-1 ring-white/70">{p.number}</span>}
      </span>
      <span className="mt-1.5 max-w-full truncate rounded-full bg-black/60 px-2 py-[2px] text-[clamp(9px,2.2cqw,12px)] font-bold text-white leading-tight backdrop-blur-sm group-hover:bg-black/80">{p.name?.trim() ? shortName(p.name) : p.number ? `#${p.number}` : '—'}</span>
    </Link>
  );
}

function SectorBar({ label, value, unit, share }: { label: string; value: number | null; unit: string; share: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span className="font-semibold">{label}</span><span className="num text-muted">{value != null ? <><b className="text-ink text-base">{value}</b> {unit} · {pct(share)} of matches</> : 'No data'}</span></div>
      <div className="h-1.5 rounded-full bg-surface-2 mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.round(share * 100)}%` }} /></div>
    </div>
  );
}

export function SquadPitch({ teamId, teamName, crest, squad }: { teamId: number; teamName: string; crest: string | null; squad: { id: number; name: string; position?: string | null }[] }) {
  const tf = useAsync<TeamFormation | null>(() => getTeamFormation(teamId).catch(() => null), [teamId]);
  const [pick, setPick] = useState<string | null>(null);
  const data = tf.data;
  const hasHistory = !!data && data.pool.length >= 11;
  const pool = useMemo(() => (hasHistory ? data!.pool : poolFromSquad(squad)), [hasHistory, data, squad]);
  const favourite = hasHistory && data!.formation ? data!.formation : DEFAULT_FORMATION;
  const formation = pick ?? favourite;
  const xi = useMemo(() => buildXI(pool, formation), [pool, formation]);

  const options = useMemo(() => {
    const used = hasHistory ? data!.usage : [];
    const seen = new Set(used.map((u) => u.formation));
    return [
      ...used.map((u) => ({ f: u.formation, note: pct(u.share) })),
      ...STANDARD_FORMATIONS.filter((f) => !seen.has(f)).map((f) => ({ f, note: '' })),
    ].slice(0, 8);
  }, [hasHistory, data]);

  if (tf.loading) return <Skel className="h-[34rem] rounded-2xl" />;
  const shown = formation === favourite && hasHistory;

  return (
    <section className="card overflow-hidden" aria-label="Favourite starting XI">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-line flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-brand">Team intelligence</p>
          <h2 className="display text-xl sm:text-2xl leading-tight">Favourite XI <span className="text-muted">· {formation}</span></h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            {hasHistory
              ? <>Built from {teamName}’s last {data!.matches} line-ups: the shape they use most, and in each place the player who most often starts there. {shown ? 'Pick another shape to see who would fill it.' : ''}</>
              : <>There are not enough recent line-ups yet, so this is the standard {DEFAULT_FORMATION} filled from the squad list. It sharpens as the season’s matches come in.</>}
          </p>
        </div>
        <div role="tablist" aria-label="Formation" className="flex flex-wrap gap-1.5">
          {options.map(({ f, note }) => (
            <button key={f} role="tab" aria-selected={formation === f} onClick={() => setPick(f === favourite ? null : f)}
              className={cx('h-9 px-3 rounded-full text-sm font-semibold border inline-flex items-center gap-1.5', formation === f ? 'bg-ink text-bg border-ink' : 'border-line text-muted hover:text-ink hover:border-ink')}>
              <span className="num">{f}</span>
              {f === favourite && hasHistory ? <span className="text-[10px] uppercase tracking-wide rounded-full bg-lime text-lime-ink px-1.5 py-px">Most used</span> : note ? <span className="text-[11px] opacity-70 num">{note}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] gap-5 lg:gap-8 p-4 sm:p-6 items-start">
        {/* The whole pitch fits on screen: its width is limited by the window height (4:5 ratio, minus the sticky header and padding), and the players scale with it. */}
        <div className="relative mx-auto lg:mx-0 aspect-[4/5] rounded-2xl overflow-hidden shadow-inner ring-1 ring-black/10 [container-type:inline-size]"
          style={{ width: 'min(100%, 34rem, calc((100svh - 11rem) * 0.8))', minWidth: 'min(100%, 17rem)', background: 'repeating-linear-gradient(180deg,#1c8450 0 12.5%,#23965a 12.5% 25%)' }}>
          <PitchLines />
          {xi.slots.map((s) => <Token key={s.key} s={s} crest={crest} />)}
        </div>

        <div className="space-y-5 min-w-0">
          <div className="rounded-2xl border border-line p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              {crest && <Crest src={crest} name={teamName} size={36} />}
              <div className="min-w-0"><p className="display text-3xl leading-none num">{favourite}</p><p className="text-xs text-muted mt-1">{hasHistory && data!.formation ? 'Their favourite shape' : 'Default shape'}</p></div>
            </div>
            {hasHistory && data!.formation ? (
              <div className="space-y-3.5">
                <SectorBar label="Back line" value={data!.sectors.defence?.value ?? null} unit="defenders" share={data!.sectors.defence?.share ?? 0} />
                <SectorBar label="Midfield" value={data!.sectors.midfield?.value ?? null} unit="midfielders" share={data!.sectors.midfield?.share ?? 0} />
                <SectorBar label="Front line" value={data!.sectors.attack?.value ?? null} unit="forwards" share={data!.sectors.attack?.share ?? 0} />
              </div>
            ) : <p className="text-sm text-muted">No formation was recorded in the recent line-ups, so there is no favourite shape to measure.</p>}
          </div>

          <div className="rounded-2xl border border-line p-4 sm:p-5">
            <h3 className="display-wide text-base mb-3">On the bench</h3>
            {xi.bench.length ? (
              <ul className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-1">
                {xi.bench.map((p) => (
                  <li key={p.id}>
                    <Link to={`/player/${p.id}`} className="flex items-center gap-3 py-1.5 rounded-lg hover:bg-surface-2/60 -mx-1.5 px-1.5">
                      <Photo p={p} className="w-9 h-9 shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{p.name}</span><span className="block text-xs text-muted truncate">{p.role || SECTOR_LABEL[p.sector]}</span></span>
                      {hasHistory && <span className="text-[11px] text-muted num text-right shrink-0">{p.subs > 0 ? `${p.subs} off bench` : `${p.starts} starts`}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No bench information yet.</p>}
          </div>

          <p className="text-xs text-muted leading-relaxed">How it is worked out: every starting XI and bench from the team’s previous matches (this season, plus last season while the new one is young) is read. The most-used formation wins, recent matches counting more. Each place is then given to the player who starts there most often, by position and by side of the pitch, with regular starters and recent form ranked first. Players no longer in the current squad are left out.</p>
        </div>
      </div>
    </section>
  );
}
