import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BadgeCheck, Ban, Clock3, Cookie, Database, FileText, Mail, MessageSquareWarning, Newspaper, Scale, ShieldCheck, Trophy, Tv, UserRound, Users } from 'lucide-react';
import { SEO } from '../components/SEO';
import { cx } from '../components/ui';
import { INFO_PAGES, INFO_SLUGS, LEGAL_UPDATED, type InfoSlug } from '../lib/site-pages';

/** Set VITE_CONTACT_EMAIL in the environment (Netlify → Site settings → Environment variables) to show the contact address. */
const CONTACT_EMAIL: string = (typeof import.meta !== 'undefined' && (import.meta as any).env ? String((import.meta as any).env.VITE_CONTACT_EMAIL ?? '') : '').trim();   // full name: Vite only inlines it that way

type Icon = typeof Mail;
const FACTS: Record<InfoSlug, { icon: Icon; title: string; text: string }[]> = {
  about: [
    { icon: Trophy, title: '9 competitions', text: 'Premier League to the World Cup' },
    { icon: Activity, title: 'Live every ~20 s', text: 'scores refresh while a match is on' },
    { icon: UserRound, title: 'No account', text: 'nothing to sign up for' },
  ],
  contact: [
    { icon: Clock3, title: 'We read everything', text: 'every message is read' },
    { icon: MessageSquareWarning, title: 'Send the page link', text: 'it is the fastest way to a fix' },
    { icon: BadgeCheck, title: 'Corrections first', text: 'data problems come first' },
  ],
  privacy: [
    { icon: UserRound, title: 'No accounts', text: 'no sign-up, no profile' },
    { icon: ShieldCheck, title: 'Never sold', text: 'we do not sell personal information' },
    { icon: Cookie, title: 'Stays on your device', text: 'light/dark choice lives in your browser' },
    { icon: Tv, title: 'YouTube on play', text: 'videos load from YouTube when you press play' },
  ],
  terms: [
    { icon: Users, title: 'Personal use', text: 'non-commercial, please' },
    { icon: Scale, title: 'Information only', text: 'not betting or financial advice' },
    { icon: Database, title: 'Third-party data', text: 'can be delayed or corrected' },
    { icon: Ban, title: 'Owners’ marks', text: 'crests and photos belong to their owners' },
  ],
};

const SOURCES: { icon: Icon; name: string; what: string }[] = [
  { icon: Tv, name: 'YouTube', what: 'Highlight and feature videos' },
  { icon: Newspaper, name: 'Original publishers', what: 'News links lead to the source article' },
];

function ContactBox() {
  if (!CONTACT_EMAIL) return <div className="rounded-2xl border border-dashed border-white/30 p-5 text-sm text-white/80">Our contact address is being set up. Please check back soon.</div>;
  const mail = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  return (
    <div className="rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-lime mb-1.5">Email us</p>
      <a href={`mailto:${CONTACT_EMAIL}`} className="display text-2xl sm:text-3xl text-white break-all inline-flex items-center gap-2 hover:underline decoration-lime decoration-4 underline-offset-4"><Mail size={22} className="shrink-0" />{CONTACT_EMAIL}</a>
      <div className="flex flex-wrap gap-2 mt-4 text-sm font-semibold">
        {['Wrong score or statistic', 'Feedback', 'Business enquiry', 'Privacy or copyright'].map((t) => <a key={t} href={mail(`Goal4U: ${t}`)} className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-white hover:bg-lime hover:text-lime-ink hover:border-lime transition-colors">{t}</a>)}
      </div>
    </div>
  );
}

/** Soft pitch lines behind the hero. */
function PitchArt() {
  return (
    <svg viewBox="0 0 400 260" className="absolute -right-10 -bottom-10 w-[34rem] max-w-none opacity-[.13] pointer-events-none select-none" aria-hidden>
      <g fill="none" stroke="#fff" strokeWidth="3">
        <rect x="10" y="10" width="380" height="240" rx="6" /><line x1="200" y1="10" x2="200" y2="250" /><circle cx="200" cy="130" r="42" />
        <rect x="10" y="70" width="64" height="120" /><rect x="326" y="70" width="64" height="120" /><rect x="10" y="102" width="24" height="56" /><rect x="366" y="102" width="24" height="56" />
      </g>
    </svg>
  );
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    setActive(ids[0]);
    if (typeof IntersectionObserver === 'undefined') return;
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: '-15% 0px -70% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids.join('|')]);
  return active;
}

export function Info({ slug }: { slug: InfoSlug }) {
  const pg = INFO_PAGES[slug];
  const ids = pg.sections.map((_, i) => `s${i + 1}`);
  const active = useActiveSection(ids);
  const facts = FACTS[slug];
  const legal = slug === 'privacy' || slug === 'terms';
  return (
    <div className="max-w-[88rem] mx-auto px-4 pt-5 sm:pt-8 pb-6">
      <SEO title={pg.title} description={pg.description} />

      <header className="relative overflow-hidden rounded-3xl text-white px-5 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14" style={{ background: 'linear-gradient(120deg,#0b1437 0%,#06279a 55%,#0035be 100%)' }}>
        <PitchArt />
        <div className="relative grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-8 lg:gap-14 items-end">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-lime"><FileText size={14} aria-hidden />{pg.nav}</p>
            <h1 className="display text-[clamp(2.4rem,6vw,4.4rem)] leading-[1.02] mt-3">{pg.heading}</h1>
            <p className="text-base sm:text-lg text-white/85 mt-4 leading-relaxed max-w-2xl">{pg.intro}</p>
            {legal && <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-3.5 py-1.5 text-xs font-semibold"><Clock3 size={13} aria-hidden />Last updated {LEGAL_UPDATED}</p>}
          </div>
          {slug === 'contact'
            ? <ContactBox />
            : <ul className={cx('grid gap-2.5', facts.length === 3 ? 'sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3' : 'grid-cols-2')}>
                {facts.map((f) => (
                  <li key={f.title} className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm p-3.5">
                    <f.icon size={18} className="text-lime mb-2" aria-hidden />
                    <p className="font-bold text-sm leading-tight">{f.title}</p>
                    <p className="text-xs text-white/75 mt-1 leading-snug">{f.text}</p>
                  </li>
                ))}
              </ul>}
        </div>
      </header>

      <nav aria-label="Information pages" className="flex flex-wrap gap-2 mt-5">
        {INFO_SLUGS.map((s) => <Link key={s} to={`/${s}`} aria-current={s === slug ? 'page' : undefined} className={cx('h-10 px-5 inline-flex items-center rounded-full text-sm font-semibold border transition-colors', s === slug ? 'bg-ink text-bg border-ink' : 'border-line text-muted hover:text-ink hover:border-ink')}>{INFO_PAGES[s].nav}</Link>)}
      </nav>

      <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] gap-6 lg:gap-10 mt-6 items-start">
        <aside className="hidden lg:block sticky top-28 self-start" aria-label="On this page">
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-muted mb-3">On this page</p>
          <ol className="border-l border-line">
            {pg.sections.map((s, i) => (
              <li key={s.h}>
                <a href={`#${ids[i]}`} className={cx('block -ml-px border-l-2 pl-4 py-1.5 text-sm leading-snug transition-colors', active === ids[i] ? 'border-brand text-ink font-semibold' : 'border-transparent text-muted hover:text-ink')}>
                  <span className="num text-[11px] mr-2 opacity-60">{String(i + 1).padStart(2, '0')}</span>{s.h}
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <div className="min-w-0 space-y-4">
          {pg.sections.map((s, i) => (
            <section key={s.h} id={ids[i]} className="card scroll-mt-28 p-5 sm:p-7 grid md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-x-10 gap-y-3">
              <h2 className="display-wide text-lg sm:text-xl leading-snug flex md:block items-baseline gap-3">
                <span className="num text-brand text-sm md:block md:mb-1.5">{String(i + 1).padStart(2, '0')}</span>{s.h}
              </h2>
              <div className="space-y-3 text-[15px] leading-relaxed text-ink/90 max-w-3xl">{s.p.map((t, k) => <p key={k}>{t}</p>)}</div>
            </section>
          ))}

          {slug === 'about' && (
            <section className="card p-5 sm:p-7" aria-label="Data sources">
              <h2 className="display-wide text-lg sm:text-xl mb-4">Our data sources at a glance</h2>
              <ul className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {SOURCES.map((s) => (
                  <li key={s.name} className="rounded-2xl border border-line p-4 bg-surface-2/40">
                    <s.icon size={20} className="text-brand mb-2.5" aria-hidden />
                    <p className="font-bold text-sm">{s.name}</p>
                    <p className="text-xs text-muted mt-1 leading-snug">{s.what}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {slug !== 'contact' && (
            <Link to="/contact" className="group flex items-center justify-between gap-4 rounded-3xl bg-brand-soft/70 border border-line px-5 py-5 sm:px-7 hover:border-brand transition-colors">
              <span><span className="block display-wide text-base sm:text-lg">{slug === 'about' ? 'Spotted something wrong?' : 'Questions about this page?'}</span><span className="block text-sm text-muted mt-0.5">Tell us on the contact page and include the link.</span></span>
              <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full bg-brand text-white group-hover:translate-x-0.5 transition-transform"><ArrowRight size={18} aria-hidden /></span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
export const About = () => <Info slug="about" />;
export const Contact = () => <Info slug="contact" />;
export const Privacy = () => <Info slug="privacy" />;
export const Terms = () => <Info slug="terms" />;
