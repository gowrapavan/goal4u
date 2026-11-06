import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/**
 * The pictures in public/assets (league logos: pl.png, pl-dark.png …) and public/images, as { 'assets/pl.png': '<8-char content hash>' }.
 * The app only asks for files that exist (no wasted 404 requests) and puts the hash in the URL (?v=…), so a replaced logo is picked up
 * immediately even though the files are cached for a year.
 */
function publicFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of ['assets', 'images']) {
    const p = path.resolve(__dirname, 'public', dir);
    if (!existsSync(p)) continue;
    for (const f of readdirSync(p)) {
      if (!/\.(png|webp|jpe?g|svg)$/i.test(f)) continue;
      out[`${dir}/${f}`] = createHash('md5').update(readFileSync(path.join(p, f))).digest('hex').slice(0, 8);
    }
  }
  return out;
}

/** The optional secret stream page (src/streams): STREAMS_PAGE / STREAMS_PATH from the environment or .env. Off by default: then the page is not part of the build at all. */
function streamsFlags(mode: string) {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string | undefined>;
  const on = /^(1|true|yes|on)$/i.test(String(env.STREAMS_PAGE ?? '').trim());
  const p = String(env.STREAMS_PATH ?? '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  return { __STREAMS_PAGE__: JSON.stringify(on), __STREAMS_PATH__: JSON.stringify(/^[a-z0-9][a-z0-9-]{2,39}$/.test(p) ? p : 'streams') };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: { __PUBLIC_FILES__: JSON.stringify(publicFiles()), ...streamsFlags(mode) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
