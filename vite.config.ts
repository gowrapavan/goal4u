import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig } from 'vite';

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

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  define: { __PUBLIC_FILES__: JSON.stringify(publicFiles()) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
}));
