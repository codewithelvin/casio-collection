import { useEffect, useRef, useState } from 'react'

/**
 * Whether the end of the list is close enough to be worth revealing more of —
 * asked of the layout rather than of an `IntersectionObserver` entry, for the
 * reason the observer callback below gives. Both the observer and the catch-up
 * effect ask it, and they must ask the same question: the catch-up loop is
 * bounded by nothing else.
 */
function withinReach(node: Element, marginPx: number): boolean {
  return node.getBoundingClientRect().top <= window.innerHeight + marginPx
}

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
  /**
   * **The sentinel is state, not a ref, so that mounting it re-runs the effect
   * that observes it.**
   *
   * With a ref, the observer was built once per `total` and kept whatever node
   * was attached at that moment. The sentinel unmounts as soon as the list is
   * `done` and mounts again the next time it is not — and if `total` did not
   * change in between (a filter swapped for another matching the same number of
   * models), no effect re-ran, so the observer went on watching a node that had
   * been detached from the document. A detached node never intersects, so
   * nothing ever appended again: the skeleton sat under the grid for good, and
   * scrolling could not clear it because scrolling is not what was broken.
   *
   * `setShown` from `useState` is referentially stable, so this doubles as the
   * ref callback with no `useCallback` around it. That matters: a fresh callback
   * each render would make React detach and reattach the node every time.
   */
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const appending = useRef(false)
  /**
   * Whether the reader has actually reached the end of what is revealed. Set by
   * the observer and never cleared, because it is asking a question about the
   * reader rather than about the list: once somebody has scrolled to the bottom,
   * every later append has to be checked against where the bottom now is. See
   * the catch-up effect below, which is the only thing that reads it.
   */
  const chasing = useRef(false)

  useEffect(() => setShown(first), [identity, first])

  useEffect(() => {
    // No IntersectionObserver means no way to know when to reveal more, so
    // everything renders. Slow beats absent — the same direction of failure the
    // catalogue takes everywhere else. Checked before the node, because a
    // missing node here only means "not attached yet": the ref callback runs
    // during the commit and this effect runs after it, one render early.
    if (typeof IntersectionObserver === 'undefined') {
      setShown(total)
      return
    }
    // `isConnected` is the whole point of the state above, stated once: a node
    // that is not in the document can never intersect, so observing one is how
    // the skeleton gets stranded. It is false in two cases — before the ref
    // callback has attached the node, and in the commit that removes it because
    // the list has just become `done`, where `total` changing re-runs this
    // effect one render before the null reaches `sentinel`.
    if (!sentinel?.isConnected) return

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
        if (!withinReach(sentinel, marginPx)) return

        chasing.current = true
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
    observer.observe(sentinel)
    return () => observer.disconnect()
    // **`shown` is deliberately not a dependency.** Rebuilding the observer on
    // every append re-reports a sentinel still inside the root margin, which
    // appends again, and the window runs away from the reader — measured at 384
    // cards on an unscrolled page. Observing the node once is enough: appending
    // pushes the sentinel down, intersection ends, and the next crossing is the
    // reader actually arriving.
  }, [sentinel, total, more, marginPx])

  /**
   * **An append that reveals nothing still has to make progress.**
   *
   * The observer notifies on a *change* of intersection, so it fires once when
   * the sentinel comes into reach and then stays quiet until the sentinel moves
   * out of reach and back. That is exactly right when an append adds cards,
   * because the new cards push the sentinel down. It is a dead end when an
   * append adds none — and on the line page a budget counted in cards buys
   * *whole sections*, so raising it by one window routinely changes nothing at
   * all.
   *
   * `/line/g-shock/` is the case, and every number here was measured in
   * Chromium against the real section sizes. Its first six sections are
   * 69, 32, 28, 9, 4 and 80 cards; a budget of 144 spends past the end of the
   * sixth and renders all six, and so does a budget of 192, because the seventh
   * needs 222. So the third time the reader reached the bottom the page grew by
   * nothing, the sentinel did not move, the observer never spoke again, and
   * **222 of 742 watches was as far as that page would ever go** — under four
   * skeleton cards that promised more was coming. Scrolling down did not help,
   * because the sentinel was already as intersecting as it could be; only
   * scrolling a screen *up* and back down produced another notification. From
   * the reader's side that is a page that has hung, and the fix is a reload that
   * throws away everything they had scrolled through.
   *
   * So: after any append the reader asked for, look again on the next frame, and
   * if the end of the list is *still* within reach, append again. The loop stops
   * the moment real cards push the sentinel out of reach, or when there is
   * nothing left — the same measurement that bounds the observer, so this cannot
   * run away any more than that can. It also retires the trailing skeleton on a
   * page whose sections have all been rendered but whose card budget has not yet
   * caught up with `total`.
   *
   * It is gated on `chasing` because it **continues** an append rather than
   * starting one: without a reader at the bottom of the list there is nothing to
   * chase, and a first paint must still render one window and stop.
   */
  useEffect(() => {
    if (!sentinel || !chasing.current || shown >= total) return
    const frame = requestAnimationFrame(() => {
      if (withinReach(sentinel, marginPx)) {
        setShown((current) => Math.min(current + more, total))
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [sentinel, shown, total, more, marginPx])

  return { shown, sentinel: setSentinel, done: shown >= total }
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
export function sectionsWithin<T>(
  sections: readonly T[],
  size: (item: T) => number,
  budget: number,
): T[] {
  const out: T[] = []
  let left = budget
  for (const section of sections) {
    if (out.length > 0 && left <= 0) break
    out.push(section)
    left -= size(section)
  }
  return out
}
