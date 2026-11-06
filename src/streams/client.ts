/** The stream page's only network code: its own API (/api/streams), never the app's data calls. */
import type { StreamsGate, StreamsPayload } from './types';

const KEY = 'sx-key';
export const savedKey = (): string => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const saveKey = (k: string) => { try { k ? sessionStorage.setItem(KEY, k) : sessionStorage.removeItem(KEY); } catch { /* private mode: the key is asked again */ } };

export type Loaded = { kind: 'ok'; data: StreamsPayload } | { kind: 'missing' } | { kind: 'locked' } | { kind: 'error'; message: string };

async function get(url: string, key: string): Promise<Response> {
  return fetch(url, { headers: key ? { 'x-streams-key': key } : {}, signal: AbortSignal.timeout(25_000), cache: 'no-store' });
}
export async function loadGate(): Promise<StreamsGate | null> {
  try { const r = await get('/api/streams/gate', ''); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function loadStreams(key: string, refresh = false): Promise<Loaded> {
  try {
    const r = await get(`/api/streams${refresh ? '?refresh=1' : ''}`, key);
    if (r.status === 404) return { kind: 'missing' };
    if (r.status === 401) return { kind: 'locked' };
    if (!r.ok) return { kind: 'error', message: `The server answered ${r.status}.` };
    return { kind: 'ok', data: await r.json() };
  } catch { return { kind: 'error', message: 'Could not reach the server. Check your connection and try again.' }; }
}
