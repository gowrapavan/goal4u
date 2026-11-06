/** GET /api/streams — the stream page's own API. 404 unless STREAMS_PAGE is on; 401 without the key when STREAMS_KEY is set; never cached. */
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { streamsEnabled, streamsKey } from './config';
import { createStreamsService } from './service';

export const keyMatches = (given: unknown, expected: string): boolean => {
  const a = Buffer.from(String(given ?? '')), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createStreamsRouter(opts: { env?: Record<string, string | undefined>; service?: ReturnType<typeof createStreamsService> } = {}) {
  const router = express.Router(); const service = opts.service ?? createStreamsService();
  const env = () => opts.env ?? process.env;
  router.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });
  router.use((_req, res, next) => (streamsEnabled(env()) ? next() : res.status(404).json({ error: 'Not found' })));
  router.get('/gate', (_req, res) => res.json({ required: !!streamsKey(env()) }));      // tells the page whether to ask for a key; reveals nothing else
  router.get('/', async (req, res) => {
    const key = streamsKey(env());
    if (key && !keyMatches(req.get('x-streams-key'), key)) return res.status(401).json({ error: 'Key required' });
    res.json(await service.load(req.query.refresh === '1'));
  });
  return router;
}
export default createStreamsRouter;
