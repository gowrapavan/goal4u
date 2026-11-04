/**
 * Market-value normalisation — pure functions, no I/O.
 *
 * The data repo stores Transfermarkt values scraped from transfermarkt.co.in,
 * i.e. in Indian rupees ("₹1,600 Cr"). The UI shows euros, so values are
 * converted at ONE fixed, documented rate (matches utils/formatting.ts).
 * Unparseable input yields null — never 0 — so "unknown" is never shown as "free".
 */

/** 1 EUR = INR_PER_EUR rupees. Keep in sync with convertINRtoEUR in utils/formatting.ts. */
export const INR_PER_EUR = 90;

const CRORE = 10_000_000;
const LAKH = 100_000;

/** Parse a market-value string to whole euros, or null if it can't be read reliably. */
export function parseMarketValueEUR(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === '-' || s === 'n/a') return null;
  const n = parseFloat(s.replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0] ?? '');
  if (!Number.isFinite(n) || n <= 0) return null;

  if (s.includes('€')) {                       // already euros: "€45m", "€1.2bn", "€500k"
    if (/bn|b\b/.test(s)) return Math.round(n * 1e9);
    if (/m/.test(s)) return Math.round(n * 1e6);
    if (/k|th/.test(s)) return Math.round(n * 1e3);
    return Math.round(n);
  }
  if (s.includes('₹') || s.includes('inr') || /\bcr\b|crore|lakh|\blac\b/.test(s)) {
    const inr = /crore|\bcr\b/.test(s) ? n * CRORE : /lakh|\blac\b|\bl\b/.test(s) ? n * LAKH : n;
    return Math.round(inr / INR_PER_EUR);
  }
  return null;                                 // unknown currency: refuse to guess
}

/** "€177.8M", "€1.2B", "€850K". null → null. */
export function formatEUR(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e9) return `€${(v / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (v >= 1e8) return `€${Math.round(v / 1e6)}M`;
  if (v >= 1e6) return `€${String(Math.round(v / 1e5) / 10).replace(/\.0$/, '')}M`;   // round half up, deterministic
  if (v >= 1e3) return `€${Math.round(v / 1e3)}K`;
  return `€${Math.round(v)}`;
}

export interface ValuedPlayer {
  rank: number; name: string; id: number | null; tmId: string | null; position: string | null;
  nationality: string | null; club: string | null; teamId: number | null; code: string;
  valueEur: number; valueLabel: string;
}

const LEAGUE_ORDER = ['PL', 'PD', 'SA', 'BL1', 'FL1'];

/** Normalise one league's raw market_values.json rows. Rows with an unreadable value are dropped, not zeroed. */
export function normaliseValues(rows: any[], code: string): ValuedPlayer[] {
  const out: ValuedPlayer[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const name = r?.player_name || r?.name;
    const valueEur = parseMarketValueEUR(r?.market_value);
    if (!name || valueEur == null) continue;
    const id = Number(r.player_id); const teamId = Number(r.team_id);
    out.push({
      rank: 0, name: String(name),
      id: Number.isFinite(id) && id > 0 ? id : null,
      tmId: r.tm_player_id != null ? String(r.tm_player_id) : null,
      position: r.position || null, nationality: r.nationality || null, club: r.club_name || null,
      teamId: Number.isFinite(teamId) && teamId > 0 ? teamId : null,
      code, valueEur, valueLabel: formatEUR(valueEur)!,
    });
  }
  // `age` in the source is unreliable (e.g. "1"), so it is deliberately not exposed.
  out.sort((a, b) => b.valueEur - a.valueEur || LEAGUE_ORDER.indexOf(a.code) - LEAGUE_ORDER.indexOf(b.code) || a.name.localeCompare(b.name));
  return out.map((p, i) => ({ ...p, rank: i + 1 }));
}

/** Merge several leagues; the same person is never listed twice (keyed by tmId, else name+club). */
export function mergeValues(lists: ValuedPlayer[][]): ValuedPlayer[] {
  const seen = new Set<string>(); const all: ValuedPlayer[] = [];
  for (const p of lists.flat()) {
    const k = p.tmId ? `tm:${p.tmId}` : `n:${p.name.toLowerCase()}|${(p.club || '').toLowerCase()}`;
    if (seen.has(k)) continue; seen.add(k); all.push(p);
  }
  all.sort((a, b) => b.valueEur - a.valueEur || LEAGUE_ORDER.indexOf(a.code) - LEAGUE_ORDER.indexOf(b.code) || a.name.localeCompare(b.name));
  return all.map((p, i) => ({ ...p, rank: i + 1 }));
}

/* ───────── league_metadata.json → league facts + MVP card ───────── */
export interface LeagueMeta {
  teams: string | null; players: string | null; avgAge: string | null;
  avgValue: string | null; totalValue: string | null;
  mvp: { name: string; id: number | null; tmId: string | null; valueEur: number; valueLabel: string } | null;
}
const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
export function normaliseMeta(raw: any): LeagueMeta | null {
  const d = raw?.data && !raw?.number_of_teams ? raw.data : raw;       // accept wrapped or unwrapped
  if (!d || typeof d !== 'object') return null;
  const m = d.most_valuable_player;
  const valueEur = parseMarketValueEUR(m?.value);
  const id = Number(m?.player_id);
  return {
    teams: clean(d.number_of_teams)?.replace(/\s*teams?$/i, '') ?? null,
    players: clean(d.players), avgAge: clean(d.avg_age),
    avgValue: formatEUR(parseMarketValueEUR(d.avg_market_value)),
    totalValue: formatEUR(parseMarketValueEUR(d.total_market_value)),
    mvp: m?.name && valueEur != null ? { name: String(m.name), id: Number.isFinite(id) && id > 0 ? id : null, tmId: m.tm_player_id != null ? String(m.tm_player_id) : null, valueEur, valueLabel: formatEUR(valueEur)! } : null,
  };
}

/* ───────── successful_players.json → most decorated (all-time league titles) ───────── */
export interface DecoratedPlayer { rank: number; name: string; id: number | null; tmId: string | null; position: string | null; nationality: string | null; titles: number }
export function normaliseDecorated(rows: any[]): DecoratedPlayer[] {
  const out: DecoratedPlayer[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const titles = parseInt(String(r?.total_titles ?? ''), 10);
    const name = r?.player_name || r?.name;
    if (!name || !Number.isFinite(titles) || titles <= 0) continue;     // unknown title count is dropped, never shown as 0
    const id = Number(r.player_id);
    out.push({ rank: 0, name: String(name), id: Number.isFinite(id) && id > 0 ? id : null, tmId: r.tm_player_id != null ? String(r.tm_player_id) : null, position: r.position || null, nationality: r.nationality || null, titles });
  }
  out.sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name));
  return out.map((p, i) => ({ ...p, rank: i + 1 }));
}
