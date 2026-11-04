/** Files in public/assets and public/images, from the build (vite.config.ts → __PUBLIC_FILES__). null = unknown (tests): every file is assumed to exist. */
declare const __PUBLIC_FILES__: Record<string, string> | undefined;
export type PublicFiles = Record<string, string> | null;
export const PUBLIC_FILES: PublicFiles = typeof __PUBLIC_FILES__ !== 'undefined' ? __PUBLIC_FILES__ : null;

/** '/assets/pl.png?v=1a2b3c4d' for a file that exists, null for one that does not (so nobody requests it). */
export function publicUrl(rel: string, files: PublicFiles = PUBLIC_FILES): string | null {
  const key = rel.replace(/^\/+/, '');
  if (!files) return `/${key}`;
  const v = files[key];
  return v ? `/${key}?v=${v}` : null;
}
