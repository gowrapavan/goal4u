import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * MOBILE ONLY (<1024px): keeps the selected chip / tab / day centred inside a horizontally scrolling row.
 * Attach the returned ref to the scroll container; the active child is the one with aria-pressed="true"
 * or aria-selected="true". Centres instantly on first render, smoothly when `dep` changes.
 * Does nothing on desktop or when the row does not overflow.
 */
export function useCenterActive(dep: unknown) {
  const node = useRef<HTMLElement | null>(null);
  const first = useRef(true);

  const run = useCallback((behavior: ScrollBehavior) => {
    const el = node.current;
    if (!el || typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return;
    const a = el.querySelector<HTMLElement>('[aria-pressed="true"],[aria-selected="true"]');
    if (!a || el.scrollWidth <= el.clientWidth + 1) return;
    const er = el.getBoundingClientRect(), ar = a.getBoundingClientRect();
    const left = el.scrollLeft + (ar.left - er.left) - (el.clientWidth - ar.width) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior });
  }, []);

  // callback ref: also fires when the row mounts late (after data has loaded)
  const ref = useCallback((el: HTMLElement | null) => {
    node.current = el;
    if (el) run('auto');
  }, [run]);

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    run('smooth');
  }, [dep, run]);

  return ref;
}
