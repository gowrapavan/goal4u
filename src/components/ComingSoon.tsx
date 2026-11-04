import { Link } from 'react-router-dom';
import { SEO } from './SEO';
import { cx } from './ui';

/**
 * Responsive, theme-aware illustration: a floodlit pitch with the ball in front of an empty goal.
 * Pure SVG (no network, no image file), scales with its container, colours come from the site's CSS variables so it
 * works in light and dark mode. `tone="404"` swaps the ball for a flag (offside).
 */
export function PitchArt({ tone = 'soon', className }: { tone?: 'soon' | '404'; className?: string }) {
  return (
    <svg viewBox="0 0 480 300" role="img" aria-label={tone === '404' ? 'An empty goal and an offside flag on a floodlit pitch' : 'A football in front of an empty goal on a floodlit pitch'} className={cx('w-full h-auto', className)}>
      <rect width="480" height="300" rx="28" style={{ fill: 'var(--brand-soft)' }} />
      {/* floodlight beams */}
      <g className="cs-beam" style={{ fill: 'var(--brand)' }}><polygon points="52,44 8,300 150,300" opacity=".16" /><polygon points="428,44 330,300 472,300" opacity=".16" /></g>
      {[52, 428].map((x) => (
        <g key={x}><rect x={x - 3} y="46" width="6" height="150" rx="3" style={{ fill: 'var(--muted)' }} opacity=".55" />
          <rect x={x - 20} y="30" width="40" height="18" rx="5" style={{ fill: 'var(--ink)' }} opacity=".85" />
          {[-12, -4, 4, 12].map((d) => <circle key={d} cx={x + d} cy="39" r="3" style={{ fill: 'var(--lime)' }} />)}</g>
      ))}
      {/* pitch */}
      <polygon points="40,300 120,150 360,150 440,300" style={{ fill: 'var(--pitch)' }} />
      <g fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2.5" strokeLinejoin="round">
        <polygon points="40,300 120,150 360,150 440,300" />
        <polyline points="196,150 188,178 292,178 284,150" />
        <ellipse cx="240" cy="262" rx="62" ry="17" />
      </g>
      {/* goal */}
      <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="205,150 205,106 275,106 275,150" />
        <g strokeWidth="1" strokeOpacity=".45">{[217, 229, 241, 253, 265].map((x) => <line key={x} x1={x} y1="108" x2={x} y2="150" />)}{[120, 134].map((y) => <line key={y} x1="207" y1={y} x2="273" y2={y} />)}</g>
      </g>
      {tone === '404' ? (
        <g><rect x="300" y="196" width="4" height="70" rx="2" style={{ fill: 'var(--ink)' }} /><path d="M304 198 h46 l-12 14 l12 14 h-46 z" style={{ fill: 'var(--live)' }} /></g>
      ) : (
        <g className="cs-ball"><ellipse cx="240" cy="290" rx="20" ry="4.5" fill="#000" opacity=".22" />
          <circle cx="240" cy="244" r="22" fill="#fff" stroke="#0d1220" strokeWidth="2.5" />
          <polygon points="240,232 251,240 247,253 233,253 229,240" fill="#0d1220" />
          <g stroke="#0d1220" strokeWidth="2" strokeLinecap="round"><line x1="240" y1="232" x2="240" y2="224" /><line x1="251" y1="240" x2="259" y2="236" /><line x1="247" y1="253" x2="253" y2="260" /><line x1="233" y1="253" x2="227" y2="260" /><line x1="229" y1="240" x2="221" y2="236" /></g></g>
      )}
    </svg>
  );
}

export interface SoonAction { to: string; label: string; primary?: boolean }

/**
 * The shared "nothing here (yet)" screen: illustration, heading, one sentence, and where to go next.
 *  variant "page"   — a whole page (h1, noindex head). Used for tournaments whose data is not published yet.
 *  variant "inline" — inside a tab or card, where the rest of the page stays visible.
 */
export function ComingSoon({ title = 'Available soon', message, actions = [], variant = 'inline', tone = 'soon', seoTitle, badge }: {
  title?: string; message: string; actions?: SoonAction[]; variant?: 'page' | 'inline'; tone?: 'soon' | '404'; seoTitle?: string; badge?: string;
}) {
  const page = variant === 'page';
  const H = page ? 'h1' : 'h2';
  return (
    <div className={cx('mx-auto text-center', page ? 'max-w-xl px-4 py-12 sm:py-20' : 'max-w-md px-2 py-8 card')}>
      {page && <SEO title={seoTitle || `${title} | Goal4U`} description={message} noindex />}
      <PitchArt tone={tone} className={page ? 'max-w-[26rem] mx-auto' : 'max-w-[18rem] mx-auto'} />
      {badge && <p className="inline-flex mt-5 rounded-full bg-brand-soft text-brand text-[11px] font-bold px-3 h-6 items-center">{badge}</p>}
      <H className={cx('display-wide mt-4', page ? 'text-3xl sm:text-4xl' : 'text-xl')}>{title}</H>
      <p className="text-muted mt-2 text-sm sm:text-base leading-relaxed">{message}</p>
      {actions.length > 0 && <div className="flex flex-wrap justify-center gap-2 mt-6">{actions.map((a) => <Link key={a.to + a.label} to={a.to} className={cx('chip', a.primary && 'on')}>{a.label}</Link>)}</div>}
    </div>
  );
}
