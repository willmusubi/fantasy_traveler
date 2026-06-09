/** True when the user has asked the OS to minimise non-essential motion. SSR/test-safe (guards
 *  window/matchMedia). Use it to gate JS-driven motion (count-ups, smooth scrolls) — CSS animations
 *  are already covered by the global `@media (prefers-reduced-motion)` rule in global.css. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}
