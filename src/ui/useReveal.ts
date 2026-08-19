import { useEffect, useRef, useState } from 'react'

/**
 * D58's mechanism, extracted so it can be applied at more than one level.
 *
 * It was written inside `WatchGrid` for the models in one grid. The line page
 * then needed the same rule **across** grids, and the measurement that proved it
 * is the one D58 itself asked for: on `/line/vintage/` at a 4× CPU throttle —
 * §8.2's real device — pressing *back* from a watch took **1 082 ms with no
 * network at all**. Nothing was downloading; the page was rebuilding 228 cards
 * from scratch, because a line page renders one grid per series and D58 only
 * bounded each grid, not the number of them. Vintage went from 43 series to 68
 * in one session and the page went from 82 cards to 228.
 *
 * Duplicating the observer in the line route was the obvious move and the wrong
 * one: every subtlety below was learned by getting it wrong once, and a second
 * copy would have to learn them again.
 *
 * `total` is counted in **whatever unit the caller reveals** — cards in the
 * grid, cards-worth-of-sections on the line page — because the thing that costs
 * time is the number of cards, not the number of containers holding them.
 *
 * `identity` resets the window when the list becomes a different list. A filter
 * narrowing 670 to 12 must not keep a window sized for the old one, and the
 * *array reference* cannot answer that — a parent rebuilding an equal array on
 * every render would reset the window forever.
 */
export function useReveal(
  total: number,
  identity: string,
  { first = 48, more = 48, marginPx = 400 } = {},
) {
  const [shown, setShown] = useState(first)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const appending = useRef(false)

  useEffect(() => setShown(first), [identity, first])

  useEffect(() => {
    const node = sentinel.current
    // No IntersectionObserver means no way to know when to reveal more, so
    // everything renders. Slow beats absent — the same direction of failure the
    // catalogue takes everywhere else.
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(total)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return

        /**
         * **One append per frame, and this is not belt-and-braces.**
         *
         * At first paint the cards have not been laid out, so the sentinel sits a
         * few pixels below a grid of no height and keeps reporting itself as
         * visible. Every report appends another window before the browser has had
         * a chance to make the previous one tall, and the measurement was 384
         * cards rendered on a page nobody had scrolled — eight windows in one
         * burst. Waiting a frame lets layout answer the question the observer is
         * actually asking.
         */
        if (appending.current) return

        /**
         * **Ask the layout, not the report.**
         *
         * An `IntersectionObserver` entry describes where the sentinel was when
         * the observation was taken, and at first paint that is underneath a grid
         * the browser has not yet given any height to. Trusting it appended eight
         * windows onto an unscrolled page, and a once-per-frame guard did not
         * help, because each frame produced another equally stale report.
         * Measuring here answers what the observer was only approximating: *is
         * the end of the list actually near?*
         */
        if (node.getBoundingClientRect().top > window.innerHeight + marginPx) return

        appending.current = true
        requestAnimationFrame(() => {
          appending.current = false
        })
        setShown((current) => Math.min(current + more, total))
      },
      // A screen's warning, so the next rows are there before the reader arrives
      // at the gap rather than after it.
      { rootMargin: `${marginPx}px` },
    )
    observer.observe(node)
    return () => observer.disconnect()
    // **`shown` is deliberately not a dependency.** Rebuilding the observer on
    // every append re-reports a sentinel still inside the root margin, which
    // appends again, and the window runs away from the reader — measured at 384
    // cards on an unscrolled page. Observing the node once is enough: appending
    // pushes the sentinel down, intersection ends, and the next crossing is the
    // reader actually arriving.
  }, [total, more, marginPx])

  return { shown, sentinel, done: shown >= total }
}

/**
 * How many whole sections fit inside a card budget — the line page's half of
 * D58, and a pure function because every way it can be wrong is a rendering cost
 * or a watch nobody can reach.
 *
 * **The budget is spent, not checked.** A section is taken and its cards are
 * subtracted, so a section larger than the whole budget is still taken whole:
 * G-SHOCK's largest series holds 162 against a budget of 48, and refusing it
 * would reveal nothing at all. Sections are never split, because §8.5's sticky
 * sub-heading is a claim about the series under it and half a series under a
 * heading saying `162` is a lie the reader can count.
 *
 * At least one section always comes back, for the same reason: a page that
 * revealed nothing would have no sentinel to scroll towards and would therefore
 * never reveal anything.
 */
export function sectionsWithin<T>(sections: readonly T[], size: (item: T) => number, budget: number): T[] {
  const out: T[] = []
  let left = budget
  for (const section of sections) {
    if (out.length > 0 && left <= 0) break
    out.push(section)
    left -= size(section)
  }
  return out
}
