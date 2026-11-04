/** The current theme as the page sets it (<html data-theme="dark">), with ONE shared observer for every component that follows it. */
export type Theme = 'light' | 'dark';
export const getTheme = (): Theme => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
export function subscribeTheme(fn: () => void): () => void {
  listeners.add(fn);
  if (!observer && typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver(() => listeners.forEach((f) => f()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  return () => { listeners.delete(fn); if (!listeners.size && observer) { observer.disconnect(); observer = null; } };
}
