import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createNewsRouter } from './news-api.ts';
import { buildFocus } from './news-filter.ts';

const realFetch = globalThis.fetch;
const a = (title: string, extra: any = {}) => ({ title, description: '', url: `https://n.test/${encodeURIComponent(title)}`, publishedAt: new Date().toISOString(), urlToImage: 'https://img.test/x.jpg', source: { name: 'Src' }, ...extra });
const FOCUS = buildFocus([{ id: 7, code: 'CL', utcDate: new Date(Date.now() + 30 * 3600_000).toISOString(), homeTeam: { id: 78, name: 'Club Atlético de Madrid', shortName: 'Atleti' }, awayTeam: { id: 66, name: 'Manchester United FC', shortName: 'Man United' } }] as any);
const withFocus = async () => ({ focus: FOCUS, clubTerms: [] as string[] });

async function withServer<T>(fn: (base: string) => Promise<T>, getFocus = withFocus) {
  const app = express(); app.use('/api/news', createNewsRouter(getFocus));
  const srv = app.listen(0); const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/news`;
  try { return await fn(base); } finally { srv.close(); globalThis.fetch = realFetch; }
}
const stub = (handler: (u: URL) => any, urls: URL[] = []) => {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input); if (!url.startsWith('https://newsapi.org')) return realFetch(input, init);
    const u = new URL(url); urls.push(u); const r = handler(u);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as any;
};
const many = (n: number) => Array.from({ length: n }, (_, i) => a(`Arsenal story number ${i}`));

test('without a key: clear configuration error', async () => {
  delete process.env.NEWSAPI_KEY;
  await withServer(async (base) => { const r = await realFetch(`${base}/`); assert.equal(r.status, 500); assert.match((await r.json()).error, /NEWSAPI_KEY/); });
});

test('queries cover the fixtures, are restricted to football outlets, and only football survives', async () => {
  process.env.NEWSAPI_KEY = 'test'; const urls: URL[] = [];
  stub(() => ({ body: { status: 'ok', articles: [
    a('Do the Panthers play today? Schedule, time, channel for next Carolina football game', { description: 'slated to be silent in Week 5' }),
    a('Leicester Tigers beat Bath in Premiership Rugby thriller'),
    a('College Football Rankings: Texas Drops'),
    a('Atlético Madrid v Manchester United: Champions League preview'),
    a('Real Madrid and Barcelona battle for wonderkid'),
    ...many(8),
  ] } }), urls);
  await withServer(async (base) => {
    const j = await (await realFetch(`${base}/?page=1`)).json();
    const qs = urls.map((u) => u.searchParams.get('q') || '');
    assert.ok(qs.some((q) => /atleti|atlético de madrid/i.test(q) && /man united|manchester united/i.test(q)), 'a fixture query names both clubs');
    assert.ok(urls.every((u) => u.searchParams.get('domains')?.includes('skysports.com')), 'pass 1 is limited to football outlets');
    const titles = j.articles.map((x: any) => x.title);
    assert.ok(!titles.some((t: string) => /Panthers|Rugby|College Football/.test(t)));
    assert.equal(titles[0], 'Atlético Madrid v Manchester United: Champions League preview');           // match story first
    assert.deepEqual(j.articles[0].related, { matchId: 7, code: 'CL', label: 'Atleti v Man United', kickoff: FOCUS[0].utcDate, both: true });
  });
});

test('if the football-outlet pass is thin, a second unrestricted pass runs (still strictly filtered)', async () => {
  process.env.NEWSAPI_KEY = 'test'; const urls: URL[] = [];
  stub((u) => ({ body: { status: 'ok', articles: u.searchParams.get('domains') ? [a('Arsenal win')] : [a('Liverpool sign midfielder'), a('NFL: Cowboys beat Giants')] } }), urls);
  await withServer(async (base) => {
    const j = await (await realFetch(`${base}/?page=2`)).json();
    assert.ok(urls.some((u) => !u.searchParams.get('domains')), 'unrestricted pass happened');
    assert.deepEqual(j.articles.map((x: any) => x.title).sort(), ['Arsenal win', 'Liverpool sign midfielder']);
  });
});

test('results are cached so repeat loads do not spend NewsAPI quota', async () => {
  process.env.NEWSAPI_KEY = 'test'; const urls: URL[] = [];
  stub(() => ({ body: { status: 'ok', articles: many(12) } }), urls);
  await withServer(async (base) => {
    await realFetch(`${base}/?page=3`); const n1 = urls.length;
    const r = await realFetch(`${base}/?page=3`); assert.equal((await r.json()).cached, true); assert.equal(urls.length, n1);
  });
});

test('NewsAPI errors surface the real reason', async () => {
  process.env.NEWSAPI_KEY = 'bad';
  stub(() => ({ status: 401, body: { status: 'error', code: 'apiKeyInvalid', message: 'Your API key is invalid or incorrect.' } }));
  await withServer(async (base) => { const r = await realFetch(`${base}/?page=4`); assert.equal(r.status, 502); assert.match((await r.json()).error, /API key is invalid/); });
});

test('one failing query does not break the page (partial results)', async () => {
  process.env.NEWSAPI_KEY = 'test'; let i = 0;
  stub(() => (i++ === 0 ? { status: 429, body: { status: 'error', message: 'rate limited' } } : { body: { status: 'ok', articles: many(12) } }));
  await withServer(async (base) => { const j = await (await realFetch(`${base}/?page=5`)).json(); assert.ok(j.articles.length >= 10); assert.equal(j.partial, true); });
});

test('if fixtures cannot be loaded, news still works with the base queries', async () => {
  process.env.NEWSAPI_KEY = 'test'; stub(() => ({ body: { status: 'ok', articles: many(12) } }));
  await withServer(async (base) => { const j = await (await realFetch(`${base}/?page=1`)).json(); assert.ok(j.articles.length >= 10); }, async () => ({ focus: [], clubTerms: [] }));
});
