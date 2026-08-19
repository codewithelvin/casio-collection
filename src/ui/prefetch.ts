/**
 * Warm the watch route's chunk before the reader presses a card.
 *
 * **React Router's `lazy` blocks the navigation and renders no pending UI.** The
 * previous screen simply stays on show until the chunk resolves, so a press is
 * unacknowledged for however long the fetch takes. Measured over CDP against the
 * live site: pressing a card the first time in a session took **221 ms, of which
 * 194 ms was fetching `index-CcOp2Wg0.js`** — the watch route. The same press
 * with the chunk already in memory took **0 ms**. So the stall is the fetch, all
 * of it, and it is entirely avoidable: the reader's pointer arrives at a card
 * some time before their finger does.
 *
 * Hover is not the only intent, and on a phone it is not available at all —
 * `pointerenter` fires for a mouse, `touchstart` for a finger before the tap
 * completes, and `focusin` for the keyboard. Any of the three is enough.
 *
 * The specifier is **the same string `router.tsx` uses**, so Vite resolves both
 * to one module and the prefetch warms the chunk the router will actually ask
 * for. A different spelling of the same path would build a second chunk and this
 * would warm the wrong one while costing a download.
 */
let started: Promise<unknown> | null = null

export function prefetchWatchRoute(): void {
  // Once per document. The module registry caches the result anyway, but an
  // unbounded number of `import()` calls on a 228-card grid is a lot of promises
  // for no benefit.
  if (started) return
  // Failure is silent on purpose: this is an optimisation, and the navigation
  // that follows will surface any real problem through `fresh()`, which already
  // handles a chunk that has gone missing under a deploy.
  started = import('../routes/watch').catch(() => undefined)
}

/** Spread onto a link to warm the route on any of the three intents. */
export const prefetchOnIntent = {
  onPointerEnter: prefetchWatchRoute,
  onTouchStart: prefetchWatchRoute,
  onFocus: prefetchWatchRoute,
} as const
