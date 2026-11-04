import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLimiter, clientIp, bucketOf, allowedHosts, originVerdict, corsHeaders, API_SECURITY_HEADERS, PAGE_SECURITY_HEADERS } from './api-guard.ts';
import { tokenMatches } from './indexnow.ts';

test('rate limit: the limit-th call passes, the next is refused with a Retry-After, and the window resets', () => {
  const l = makeLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(l.hit('a', 0).ok, true); assert.equal(l.hit('a', 1).ok, true);
  const third = l.hit('a', 2); assert.equal(third.ok, true); assert.equal(third.remaining, 0);
  const fourth = l.hit('a', 3); assert.equal(fourth.ok, false); assert.ok(fourth.retryAfterSec >= 1 && fourth.retryAfterSec <= 60);
  assert.equal(l.hit('b', 4).ok, true);                         // another address is unaffected
  assert.equal(l.hit('a', 60_001).ok, true);                    // new window
});
test('rate limit memory is bounded: a flood of distinct addresses cannot grow it without end', () => {
  const l = makeLimiter({ windowMs: 60_000, max: 1, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) assert.equal(l.hit(`ip${i}`, 5).ok, true);
  assert.equal(l.hit('ip999', 6).ok, false);                    // still counting the recent ones after a reset
});
test('clientIp: Netlify\'s own header wins over a forged X-Forwarded-For', () => {
  const h = (m: Record<string, string>) => (n: string) => m[n];
  assert.equal(clientIp(h({ 'x-nf-client-connection-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' })), '1.2.3.4');
  assert.equal(clientIp(h({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' })), '9.9.9.9');
  assert.equal(clientIp(h({})), 'unknown');
});
test('bucketOf: pictures, news and data are counted apart', () => {
  assert.equal(bucketOf('/api/data/img/headshot/1.png'), 'img'); assert.equal(bucketOf('/api/img/x.png'), 'img');
  assert.equal(bucketOf('/api/news'), 'news'); assert.equal(bucketOf('/api/data/feed'), 'data'); assert.equal(bucketOf('/api/data/imgx'), 'data');
});
const ENV = { APP_URL: 'https://goal4u.netlify.app' };
test('origin check: own site and configured site pass; other websites are refused', () => {
  const allowed = allowedHosts(ENV, 'goal4u.netlify.app');
  assert.equal(originVerdict({ origin: 'https://goal4u.netlify.app' }, allowed).ok, true);
  assert.equal(originVerdict({ origin: 'https://evil.example' }, allowed).ok, false);
  assert.equal(originVerdict({ origin: 'null' }, allowed).ok, false);
  assert.equal(originVerdict({ origin: 'https://goal4u.netlify.app.evil.example' }, allowed).ok, false);
  assert.equal(originVerdict({ origin: 'https://evil.example', referer: 'https://goal4u.netlify.app/' }, allowed).ok, false);
});
test('origin check: hot-linked <img>/fetch from another site is refused; a link click and a plain request are fine', () => {
  const allowed = allowedHosts(ENV, 'goal4u.netlify.app');
  assert.equal(originVerdict({ secFetchSite: 'cross-site', secFetchDest: 'image' }, allowed).ok, false);
  assert.equal(originVerdict({ secFetchSite: 'cross-site', secFetchDest: 'empty' }, allowed).ok, false);
  assert.equal(originVerdict({ secFetchSite: 'cross-site', secFetchDest: 'document' }, allowed).ok, true);
  assert.equal(originVerdict({ secFetchSite: 'same-origin', secFetchDest: 'image' }, allowed).ok, true);
  assert.equal(originVerdict({}, allowed).ok, true);                                                   // curl, uptime pings, crawlers
  assert.equal(originVerdict({ referer: 'https://evil.example/page', secFetchDest: 'image' }, allowed).ok, false);   // an old browser, judged by Referer
  assert.equal(originVerdict({ referer: 'https://goal4u.netlify.app/x', secFetchDest: 'image' }, allowed).ok, true);
});
test('ALLOWED_ORIGINS adds hosts (origins or bare hosts)', () => {
  const a = allowedHosts({ ALLOWED_ORIGINS: 'https://partner.example, other.example' }, 'x.test');
  assert.ok(a.has('partner.example') && a.has('other.example') && a.has('x.test'));
});
test('CORS: nothing by default; an origin only when it is listed exactly', () => {
  assert.deepEqual(corsHeaders('https://evil.example', {}), {});
  assert.deepEqual(corsHeaders('https://evil.example', ENV), {});
  assert.deepEqual(corsHeaders('https://partner.example', { ALLOWED_ORIGINS: 'https://partner.example/' }), { 'Access-Control-Allow-Origin': 'https://partner.example', Vary: 'Origin' });
  assert.deepEqual(corsHeaders('https://partner.example.evil.example', { ALLOWED_ORIGINS: 'https://partner.example' }), {});
  assert.ok(!('Access-Control-Allow-Origin' in API_SECURITY_HEADERS));
});
test('security headers: API answers are nosniff, referrer-less and not indexable; pages cannot be framed', () => {
  assert.equal(API_SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff'); assert.match(API_SECURITY_HEADERS['X-Robots-Tag'], /noindex/);
  assert.match(PAGE_SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors 'self'/); assert.equal(PAGE_SECURITY_HEADERS['X-Frame-Options'], 'SAMEORIGIN');
  assert.ok(!/script-src|default-src/.test(PAGE_SECURITY_HEADERS['Content-Security-Policy']));       // a subset that cannot break the inline theme script or YouTube
});
test('admin token check: exact match only, constant-time path, unset token matches nothing', () => {
  assert.equal(tokenMatches('Bearer s3cret-token', 's3cret-token'), true);
  for (const bad of ['Bearer s3cret-tokeN', 'Bearer s3cret', 'bearer s3cret-token', 's3cret-token', '', undefined, null, ['Bearer s3cret-token']]) assert.equal(tokenMatches(bad as any, 's3cret-token'), false);
  assert.equal(tokenMatches('Bearer undefined', undefined), false); assert.equal(tokenMatches('Bearer ', ''), false);
});

test('proxied crest pictures use the picture budget, not the data budget', async () => {
  const { bucketOf } = await import('./api-guard');
  assert.equal(bucketOf('/api/data/ext/c/PL.png'), 'img');
  assert.equal(bucketOf('/api/data/competitions'), 'data');
});

test('direct access: the site\'s own fetch/img passes; a pasted address, a link, curl and other sites do not', async () => {
  const { directVerdict, allowedHosts } = await import('./api-guard');
  const allowed = allowedHosts({}, 'goal4u.test');
  const ok = (i: any, allowDirect = false) => directVerdict(i, allowed, allowDirect).ok;
  assert.equal(ok({ secFetchSite: 'same-origin', secFetchDest: 'empty', secFetchMode: 'cors' }), true);          // the page's fetch
  assert.equal(ok({ secFetchSite: 'same-origin', secFetchDest: 'image', secFetchMode: 'no-cors' }), true);       // an <img>
  assert.equal(ok({ secFetchSite: 'none', secFetchDest: 'document', secFetchMode: 'navigate' }), false);        // typed in the address bar
  assert.equal(ok({ secFetchSite: 'same-origin', secFetchDest: 'document', secFetchMode: 'navigate' }), false); // a link on the site opened as a page
  assert.equal(ok({ secFetchSite: 'cross-site', secFetchDest: 'empty', secFetchMode: 'cors' }), false);
  assert.equal(ok({}), false);                                                                                    // curl / a script: no headers at all
  assert.equal(ok({ referer: 'https://goal4u.test/match/1' }), true);                                            // an older browser that sends only a Referer
  assert.equal(ok({ referer: 'https://evil.test/' }), false);
  assert.equal(ok({}, true), true);                                                                               // API_ALLOW_DIRECT=1
});
