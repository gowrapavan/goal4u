/**
 * Secret stream desk. Standalone: its own route outside AppLayout, its own API (/api/streams), its own styles (streams.css, every class starts
 * with "sx-"). It shares nothing with the match, team or feed pages, so it cannot change their data or look.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { loadGate, loadStreams, saveKey, savedKey, type Loaded } from './client';
import { filterRows, flatten, groupByLeague, hostOf, leaguesOf, type Row } from './view';
import type { StreamsPayload } from './types';
import './streams.css';

const REFRESH_MS = 60_000;

function Logo({ src }: { src: string }) {
  const [bad, setBad] = useState(false);
  return src && !bad ? <img className="sx-logo" src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <span className="sx-logo sx-logo-empty" aria-hidden />;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="sx-btn sx-btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { window.prompt('Copy this link', text); } }}>{done ? 'Copied' : 'Copy'}</button>;
}

function Card({ r }: { r: Row }) {
  const [open, setOpen] = useState(false);
  const extra = Object.entries(r.extra);
  return (
    <article className="sx-card">
      <header className="sx-card-head">
        <span className="sx-time">{r.time || '—'}</span>
        <span className="sx-badge">{r.source}</span>
        {r.via === 'backup' && <span className="sx-badge sx-badge-warn" title="The data service did not answer in time; this comes from the GitHub copy.">backup copy</span>}
      </header>
      <div className="sx-teams">
        <div className="sx-team"><Logo src={r.homeLogo} /><span>{r.home || '—'}</span></div>
        <span className="sx-vs">vs</span>
        <div className="sx-team sx-team-away"><span>{r.away || '—'}</span><Logo src={r.awayLogo} /></div>
      </div>
      {r.servers.length === 0 ? <p className="sx-muted">No link in this row.</p> : (
        <ul className="sx-servers">
          {r.servers.map((s, i) => (
            <li key={s.url + i} className="sx-server">
              <div className="sx-server-meta"><strong>{s.label || `Server ${i + 1}`}</strong><span className="sx-muted">{hostOf(s.url)}{s.type ? ` · ${s.type}` : ''}</span></div>
              <a className="sx-btn" href={s.url} target="_blank" rel="noopener noreferrer nofollow">Open</a>
              <CopyButton text={s.url} />
            </li>
          ))}
        </ul>
      )}
      {extra.length > 0 && (
        <>
          <button type="button" className="sx-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Details'}</button>
          {open && <dl className="sx-extra">{extra.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        </>
      )}
    </article>
  );
}

function Locked({ onKey, wrong }: { onKey: (k: string) => void; wrong: boolean }) {
  const [v, setV] = useState('');
  return (
    <div className="sx-center">
      <div className="sx-panel">
        <h1 className="sx-title">Stream desk</h1>
        <p className="sx-muted">Enter the access key.</p>
        <input className="sx-input" type="password" autoComplete="off" autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && onKey(v)} aria-label="Access key" />
        {wrong && <p className="sx-error" role="alert">That key was not accepted.</p>}
        <button type="button" className="sx-btn sx-btn-primary" disabled={!v} onClick={() => onKey(v)}>Unlock</button>
      </div>
    </div>
  );
}

export default function StreamsPage() {
  const [state, setState] = useState<Loaded | 'loading'>('loading');
  const [key, setKey] = useState(savedKey());
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [tab, setTab] = useState<string>('all');
  const [q, setQ] = useState('');
  const [league, setLeague] = useState('');
  const [last, setLast] = useState<StreamsPayload | null>(null);

  const run = useCallback(async (k: string, refresh = false) => {
    setBusy(true);
    const r = await loadStreams(k, refresh);
    if (r.kind === 'ok') { setLast(r.data); setWrong(false); }
    if (r.kind === 'locked') { saveKey(''); setKey(''); }
    setState(r.kind === 'error' && last ? { kind: 'ok', data: last } : r);     // a failed refresh keeps the last good list on screen
    setBusy(false);
    return r;
  }, [last]);

  useEffect(() => { (async () => { const g = await loadGate(); if (g?.required && !savedKey()) { setState({ kind: 'locked' }); return; } await run(savedKey()); })(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (!auto || state === 'loading' || (state as Loaded).kind !== 'ok') return; const t = setInterval(() => run(key), REFRESH_MS); return () => clearInterval(t); }, [auto, state, key, run]);

  const unlock = async (k: string) => { const r = await run(k); if (r.kind === 'ok') { saveKey(k); setKey(k); } else if (r.kind === 'locked') setWrong(true); };

  const data = state !== 'loading' && state.kind === 'ok' ? state.data : null;
  const rows = useMemo(() => (data ? flatten(data.sources, tab) : []), [data, tab]);
  const leagues = useMemo(() => leaguesOf(rows), [rows]);
  const shown = useMemo(() => filterRows(rows, q, league), [rows, q, league]);
  const groups = useMemo(() => groupByLeague(shown), [shown]);

  const head = <Helmet><title>Stream desk</title><meta name="robots" content="noindex,nofollow" /></Helmet>;
  if (state === 'loading') return <div className="sx-root">{head}<div className="sx-center"><div className="sx-spinner" role="status" aria-label="Loading" /></div></div>;
  if (state.kind === 'missing') return <div className="sx-root">{head}<div className="sx-center"><div className="sx-panel"><h1 className="sx-title">404</h1><p className="sx-muted">Nothing here.</p></div></div></div>;
  if (state.kind === 'locked') return <div className="sx-root">{head}<Locked onKey={unlock} wrong={wrong} /></div>;
  if (state.kind === 'error') return <div className="sx-root">{head}<div className="sx-center"><div className="sx-panel"><h1 className="sx-title">Could not load</h1><p className="sx-muted">{state.message}</p><button type="button" className="sx-btn sx-btn-primary" onClick={() => run(key, true)}>Try again</button></div></div></div>;

  const d = state.data;
  return (
    <div className="sx-root">
      {head}
      <header className="sx-top">
        <div><h1 className="sx-title">Stream desk</h1><p className="sx-muted">Updated {new Date(d.generatedAt).toLocaleTimeString()} · {shown.length} match{shown.length === 1 ? '' : 'es'}</p></div>
        <div className="sx-actions">
          <label className="sx-check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh</label>
          <button type="button" className="sx-btn sx-btn-primary" disabled={busy} onClick={() => run(key, true)}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </header>

      <nav className="sx-tabs" aria-label="Sources">
        <button type="button" className={`sx-tab ${tab === 'all' ? 'is-on' : ''}`} onClick={() => { setTab('all'); setLeague(''); }}>All <span>{d.sources.reduce((n, s) => n + s.matches.length, 0)}</span></button>
        {d.sources.map((s) => (
          <button type="button" key={s.file} className={`sx-tab ${tab === s.file ? 'is-on' : ''}`} onClick={() => { setTab(s.file); setLeague(''); }}>
            <i className={`sx-dot ${s.ok ? (s.via === 'backup' ? 'is-warn' : 'is-ok') : 'is-bad'}`} aria-hidden />{s.file} <span>{s.matches.length}</span>
          </button>
        ))}
      </nav>

      <div className="sx-filters">
        <input className="sx-input" type="search" placeholder="Search team, league or source" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        {leagues.length > 1 && (
          <div className="sx-chips" role="group" aria-label="League">
            <button type="button" className={`sx-chip ${league === '' ? 'is-on' : ''}`} onClick={() => setLeague('')}>All leagues</button>
            {leagues.map((l) => <button type="button" key={l} className={`sx-chip ${league === l ? 'is-on' : ''}`} onClick={() => setLeague(l)}>{l}</button>)}
          </div>
        )}
      </div>

      {d.sources.filter((s) => !s.ok || s.error).map((s) => (
        <div key={s.file} className="sx-note" role="status"><strong>{s.file}</strong>: {s.error}{!s.ok && ' — the other sources are unaffected.'}</div>
      ))}

      <main>
        {groups.length === 0 ? <p className="sx-empty">No matches to show.</p> : groups.map((g) => (
          <section key={g.league} className="sx-group">
            <h2 className="sx-league">{g.league}<span>{g.rows.length}</span></h2>
            <div className="sx-grid">{g.rows.map((r) => <Card key={r.source + r.id} r={r} />)}</div>
          </section>
        ))}
      </main>

      <section className="sx-health" aria-label="Source health">
        <h2 className="sx-league">Source health</h2>
        <table className="sx-table"><thead><tr><th>File</th><th>Status</th><th>Rows</th><th>Matches</th><th>Read from</th></tr></thead><tbody>
          {d.sources.map((s) => <tr key={s.file}><td>{s.file}.json</td><td>{s.ok ? 'OK' : s.error}</td><td>{s.rows}</td><td>{s.matches.length}</td><td>{s.via === 'backup' ? 'GitHub (backup)' : s.via === 'mirror' ? 'Data service' : '—'}</td></tr>)}
        </tbody></table>
      </section>
    </div>
  );
}
