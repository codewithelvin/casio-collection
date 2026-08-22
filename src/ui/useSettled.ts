import { useEffect, useState } from 'react'

/**
 * False on the first render, true once the browser has nothing better to do.
 *
 * For decoration that is worth having and worth *not* having first — the front
 * door's seven ghosted watches being the case it was written for. Those are
 * 180 KB of WebP behind a mask, at 30% opacity, on a page whose content is seven
 * names and seven counts; they already carry `loading="lazy"` and
 * `fetchPriority="low"` and the browser still fetched all seven inside the first
 * second, because "low" is a hint about ordering and not about waiting. On the
 * 1.6 Mbps profile Lighthouse simulates for a phone, 180 KB is most of a second
 * of the same pipe the entry script is trying to arrive down.
 *
 * **Only ever used for something absolutely positioned or otherwise out of
 * flow.** Content that appears on the second render moves the page, and a layout
 * shift is a worse fault than a late photograph — which is the whole reason this
 * is a hook with a comment rather than a `setTimeout` at a call site.
 *
 * `requestIdleCallback` is the right primitive and Safari does not have it. The
 * fallback is not a polyfill: a frame's worth of `setTimeout` is enough to let
 * the first paint out, and getting the decoration slightly earlier than idle is
 * a failure nobody can see.
 */
export function useSettled(): boolean {
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const idle = window.requestIdleCallback
    if (typeof idle === 'function') {
      // The timeout is a ceiling, not a target. A main thread that never goes
      // idle would otherwise never show the decoration at all.
      const handle = idle(() => setSettled(true), { timeout: 2000 })
      return () => window.cancelIdleCallback?.(handle)
    }
    const timer = setTimeout(() => setSettled(true), 200)
    return () => clearTimeout(timer)
  }, [])

  return settled
}
