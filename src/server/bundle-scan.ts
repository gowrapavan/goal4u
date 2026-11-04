/**
 * Build-time leak check: the finished browser bundle (everything in dist/ the visitor downloads) must not contain the data-service access token
 * or the data-service address. If it does, the build FAILS — a leaked token is not something to find out about from a stranger.
 * Pure (files in, findings out) so it is tested; scripts/build-netlify.ts reads dist/ and calls it.
 */
export interface ScanFile { name: string; text: string }
export interface Secret { label: string; value: string }
export interface Leak { file: string; label: string }

export function findLeaks(files: ScanFile[], secrets: Secret[]): Leak[] {
  const real = secrets.filter((s) => s.value && s.value.length >= 8);        // an empty or tiny value would match everything
  const out: Leak[] = [];
  for (const f of files) for (const s of real) if (f.text.includes(s.value) || f.text.includes(encodeURIComponent(s.value))) out.push({ file: f.name, label: s.label });
  return out;
}
