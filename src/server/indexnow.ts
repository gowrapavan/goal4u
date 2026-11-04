import { timingSafeEqual } from 'node:crypto';
import { configuredOrigin } from './site-url';
// Standard fetch is fine if using Node 18+

// 1. Generate & Verify Key
const INDEXNOW_KEY = "goal4u-indexnow-7a3b2c1d9e4f5a6b7c8d9e0f1a2b3c4d";

export const getIndexNowKey = () => INDEXNOW_KEY;

// 2. Submission Logic with Retries and Logging
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export async function submitToIndexNow(urls: string[], retries = 3): Promise<void> {
  if (!urls || urls.length === 0) return;

  // IndexNow tells search engines about a REAL domain, so it only runs once one is configured (APP_URL, or Netlify's URL); until then there is nothing to submit.
  const appUrl = configuredOrigin(process.env);
  if (!appUrl) return;
  // Prefix URLs if they are relative
  const absoluteUrls = urls.map(url => url.startsWith('http') ? url : `${appUrl}${url.startsWith('/') ? '' : '/'}${url}`);

  const payload = {
    host: appUrl.replace(/^https?:\/\//, ''),
    key: INDEXNOW_KEY,
    keyLocation: `${appUrl}/${INDEXNOW_KEY}.txt`,
    urlList: absoluteUrls
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
         console.log(`[IndexNow] Successfully submitted ${absoluteUrls.length} URLs (Attempt ${attempt})`);
         return;
      } else {
         console.warn(`[IndexNow] Submission failed (Status: ${response.status}) (Attempt ${attempt})`);
      }
    } catch (err) {
      console.error(`[IndexNow] Network Error during submission (Attempt ${attempt}):`, err);
    }
    
    if (attempt < retries) {
       console.log(`[IndexNow] Retrying in ${attempt * 2} seconds...`);
       await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  
  console.error(`[IndexNow] Failed to submit URLs after ${retries} attempts.`);
}

export function expressIndexNowRouter(app: any) {
  // 1. Verify Endpoint
  app.get(`/${INDEXNOW_KEY}.txt`, (req: any, res: any) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });

  // 2. Manual Trigger API
  app.post('/api/indexnow/submit', async (req: any, res: any) => {
     // Manual kicks need a token. In production ADMIN_TOKEN MUST be set (there is no default token); locally a dev token works.
     const expected = process.env.NODE_ENV === 'production' ? process.env.ADMIN_TOKEN : (process.env.ADMIN_TOKEN || 'local-dev-token');
     if (!tokenMatches(req.headers.authorization, expected)) return res.status(403).json({ error: "Unauthorized" });

     const urls = req.body?.urls;
     if (!Array.isArray(urls) || urls.length === 0 || urls.length > 100) return res.status(400).json({ error: "Input 'urls' must be an array of 1-100 paths." });
     // paths of THIS site only ("/match/1"): no other host, no protocol-relative "//x", no control characters, bounded length
     if (!urls.every((u: unknown) => typeof u === 'string' && u.length <= 300 && /^\/(?!\/)[^\s\\]*$/.test(u))) return res.status(400).json({ error: "Every entry must be a path on this site, starting with a single '/'." });

     // Don't wait for submission to respond
     submitToIndexNow(urls).catch(console.error);
     res.json({ success: true, message: `Queued ${urls.length} URLs for IndexNow submission.` });
  });
}

/** Constant-time check of "Authorization: Bearer <token>" — no early exit on the first wrong character, and an unset token matches nothing. */
export function tokenMatches(header: unknown, token: string | undefined): boolean {
  if (!token || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
