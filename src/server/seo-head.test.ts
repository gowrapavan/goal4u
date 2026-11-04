import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSeo, injectHead, verificationFromEnv } from './seo-meta.ts';
import { buildSeoIndex, DEFAULT_SEO_CONFIG } from './seo-data.ts';
import { fixtureSource } from './seo-fixtures.ts';
import { lookupPlayerRemote, _resetPlayerCache } from './remote-source.ts';

const ORIGIN = 'https://goal4u.netlify.app';
const SHELL = '<!doctype html><html><head><title>x</title><meta name="description" content="y" /></head><body><div id="root"></div></body></html>';
const snapshot = () => ({ index: buildSeoIndex(fixtureSource(), DEFAULT_SEO_CONFIG), ready: true });
const REC = { player_id: 3374, name: 'Kylian Mbappé', details: { position: 'Centre-Forward', current_club_name: 'Real Madrid', citizenship: ['France'], market_value: '€160.00m' } };
const head = (html: string) => html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

test('verification tokens: only real-looking values are used, and only from the two named settings', () => {
  assert.deepEqual(verificationFromEnv({ GOOGLE_SITE_VERIFICATION: 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234', BING_SITE_VERIFICATION: '0123456789ABCDEF0123456789ABCDEF' }),
    { googleVerification: 'abcDEF123_-abcDEF123_-abcDEF123_-abcDEF1234', bingVerification: '0123456789ABCDEF0123456789ABCDEF' });
  assert.deepEqual(verificationFromEnv({}), { googleVerification: undefined, bingVerification: undefined });
  assert.equal(verificationFromEnv({ GOOGLE_SITE_VERIFICATION: 'x"><script>alert(1)</script>' }).googleVerification, undefined);
  assert.equal(verificationFromEnv({ GOOGLE_SITE_VERIFICATION: 'short' }).googleVerification, undefined);
  assert.equal(verificationFromEnv({ BING_SITE_VERIFICATION: 'not hex!!' }).bingVerification, undefined);
});

test('verification meta tags are written once, are not data-rh (they survive hydration), and only when configured', async () => {
  const d = await resolveSeo({ path: '/', search: '' }, { origin: ORIGIN, snapshot: snapshot() });
  const html = injectHead(SHELL, d, { googleVerification: 'g'.repeat(43), bingVerification: 'B'.repeat(32) });
  assert.equal(count(head(html), /name="google-site-verification" content="g{43}" \/>/g), 1);
  assert.equal(count(head(html), /name="msvalidate\.01" content="B{32}" \/>/g), 1);
  assert.ok(!/(google-site-verification|msvalidate\.01)[^>]*data-rh/.test(head(html)));
  const none = injectHead(SHELL, d);
  assert.ok(!/google-site-verification|msvalidate/.test(none));
});

test('the default share image declares its size and alt; every image has alt text; nothing is duplicated', async () => {
  const d = await resolveSeo({ path: '/', search: '' }, { origin: ORIGIN, snapshot: snapshot() });
  const h = head(injectHead(SHELL, d));
  assert.equal(count(h, /og:image:width" content="512"/g), 1); assert.equal(count(h, /og:image:height" content="512"/g), 1);
  assert.equal(count(h, /og:image:alt" content="Goal4U logo"/g), 1); assert.equal(count(h, /twitter:image:alt" content="Goal4U logo"/g), 1);
  for (const re of [/<title>/g, /name="description"/g, /rel="canonical"/g, /og:title"/g, /og:image"/g, /twitter:card"/g]) assert.equal(count(h, re), 1, String(re));
  const nf = await resolveSeo({ path: '/definitely/not/a/page', search: '' }, { origin: ORIGIN, snapshot: snapshot() });
  assert.ok(!/og:image/.test(head(injectHead(SHELL, nf))));        // a 404 carries no image tags at all
});

test('player page with a record: own title, description, Person data, crawlable text, indexable', async () => {
  const d = await resolveSeo({ path: '/player/3374', search: '' }, { origin: ORIGIN, snapshot: snapshot(), lookupPlayer: async () => REC });
  assert.equal(d.status, 200); assert.equal(d.robots, 'index,follow'); assert.equal(d.canonical, `${ORIGIN}/player/3374`);
  assert.equal(d.title, 'Kylian Mbappé Profile, Market Value & Career | Goal4U');
  assert.match(d.description, /^Kylian Mbappé · Centre-Forward · Real Madrid · France\. Market value €160\.00m\./);
  assert.ok(d.jsonLd.some((j: any) => j['@type'] === 'Person' && j.name === 'Kylian Mbappé'));
  assert.ok(d.jsonLd.some((j: any) => j['@type'] === 'BreadcrumbList'));
  assert.match(d.body || '', /<h1>Kylian Mbappé<\/h1>/); assert.match(d.body || '', /Club: Real Madrid/);
  const html = injectHead(SHELL, d);
  assert.match(html, /<title>Kylian Mbappé Profile, Market Value &amp; Career \| Goal4U<\/title>/);
});

test('player page without verified facts (no record, source down, no lookup): generic text, never indexed, still a working page', async () => {
  const snap = snapshot();
  for (const env of [{ lookupPlayer: async () => null }, { lookupPlayer: async () => { throw new Error('down'); } }, {}]) {
    const d = await resolveSeo({ path: '/player/3374', search: '' }, { origin: ORIGIN, snapshot: snap, ...env } as any);
    assert.equal(d.status, 200); assert.equal(d.robots, 'noindex,follow'); assert.equal(d.canonical, `${ORIGIN}/player/3374`);
    assert.ok(!d.body);
  }
  const bad = await resolveSeo({ path: '/player/abc', search: '' }, { origin: ORIGIN, snapshot: snap });
  assert.ok(bad.status === 404 || bad.robots === 'noindex,follow');        // never an indexable page for a non-id
});

test('player text is escaped (no markup from a name)', async () => {
  const d = await resolveSeo({ path: '/player/1', search: '' }, { origin: ORIGIN, snapshot: snapshot(), lookupPlayer: async () => ({ name: 'A <b>"B"</b> & C', details: {} }) });
  const html = injectHead(SHELL, d);
  assert.ok(!/<b>/.test(html)); assert.match(html, /A &lt;b&gt;/);
});

test('lookupPlayerRemote: found, 404 = no record, unreachable throws, answers are remembered', async () => {
  _resetPlayerCache();
  let calls = 0;
  const f: any = async (url: string) => {
    calls++;
    if (/\/7\.json$/.test(url)) return { ok: true, status: 200, json: async () => ({ data: REC }) };
    if (/\/8\.json$/.test(url)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: false, status: 502, json: async () => ({}) };
  };
  assert.equal((await lookupPlayerRemote('7', f, 1000)).name, 'Kylian Mbappé');
  assert.equal(await lookupPlayerRemote('8', f, 1000), null);
  await assert.rejects(() => lookupPlayerRemote('9', f, 1000));
  const before = calls;
  await lookupPlayerRemote('7', f, 2000); await lookupPlayerRemote('8', f, 2000);
  assert.equal(calls, before);                                                      // both remembered
  assert.equal(await lookupPlayerRemote('x1', f, 1000), null);                      // a non-id never reaches the network
  assert.equal(calls, before);
});
