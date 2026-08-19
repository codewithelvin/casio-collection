import { Col, Row } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PublishedModel, PublishedSeries } from '../catalog/schema.ts'
import { WatchCard } from './WatchCard'

/**
 * §8.5 — the grid. AntD `Row`/`Col`, `gutter={[16,16]}`, responsive spans
 * straight out of §8.2's table.
 *
 * The spans are the table read into AntD's 24 columns: 12 → 2 up, 8 → 3 up,
 * 6 → 4 up, 4 → 6 up. `md` is 768 and `xl` is 1200, which are the two numbers
 * §8.2 actually names, so the breakpoints are the specification rather than an
 * approximation of it.
 */
export const GRID_SPANS = { xs: 12, md: 8, lg: 6, xl: 4 } as const
export const GRID_GUTTER: [number, number] = [16, 16]

/**
 * How many cards render before the reader has scrolled anywhere.
 *
 * Enough to fill the tallest first screen and a bit beyond, so the sentinel is
 * below the fold on every breakpoint and nothing appears to load late: six
 * across at `xl` is eight rows.
 */
const FIRST = 48

/** Added each time the sentinel comes into view. */
const MORE = 48

/** How far below the fold the end of the list counts as "near". */
const MARGIN_PX = 400

/**
 * **The grid renders what has been scrolled to, not the whole line.**
 *
 * §8.5 removed windowing in v1.1 as a dead requirement — "no Casio series has
 * anything close to 200 references, so the rule could never fire" — and named
 * the condition for reopening it: *if a line view ever grows large enough to
 * stutter, that is the moment to measure and reconsider*. This is that moment,
 * and it was measured rather than felt. On `/line/g-shock/` at a 4× CPU
 * throttle, which is §8.2's real device:
 *
 *   * 670 cards and **11 273 DOM nodes** on one page.
 *   * **~300 ms to settle a single keystroke** in the search box, because every
 *     character re-rendered all 670.
 *
 * What it is *not* is virtualisation. A windowed list wants a fixed row height,
 * and this grid's whole point is that the card's height is reserved by its
 * content at four breakpoints (§8.6). Cards are appended and never removed, so
 * scroll position is stable, the browser's own lazy image loading still governs
 * what downloads, and Ctrl-F finds anything already revealed. The cost is that
 * a reader who scrolls to the bottom of G-SHOCK ends up with all 670 — which is
 * the situation before this change, reached deliberately rather than on load.
 *
 * The count resets when the list changes identity, because a filter narrowing
 * 670 to 12 must not keep showing a window sized for the old list.
 */
export function WatchGrid({
  models,
  seriesById,
  accent,
}: {
  models: readonly PublishedModel[]
  seriesById?: Map<string, PublishedSeries> | undefined
  accent?: string | undefined
}) {
  const [shown, setShown] = useState(FIRST)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const appending = useRef(false)

  // The identity of the list, not the array reference: a parent that rebuilds
  // an equal array on every render would otherwise reset the window forever.
  const identity = useMemo(() => `${models.length}:${models[0]?.id ?? ''}:${models.at(-1)?.id ?? ''}`, [models])
  useEffect(() => setShown(FIRST), [identity])

  useEffect(() => {
    const node = sentinel.current
    // No IntersectionObserver means no way to know when to reveal more, so
    // everything renders. Slow beats absent — this is the same direction of
    // failure the catalogue takes everywhere else.
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(models.length)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        /**
         * **One append per frame, and this is not belt-and-braces.**
         *
         * At first paint the cards have not been laid out, so the sentinel sits
         * a few pixels below a grid of no height and keeps reporting itself as
         * visible. Every report appends another window before the browser has
         * had a chance to make the previous one tall, and the measurement was
         * 384 cards rendered on a page nobody had scrolled — eight windows in
         * one burst. Waiting a frame lets layout answer the question the
         * observer is actually asking.
         */
        if (appending.current) return

        /**
         * **Ask the layout, not the report.**
         *
         * An `IntersectionObserver` entry describes where the sentinel was when
         * the observation was taken, and at first paint that is underneath a
         * grid the browser has not yet given any height to. Trusting it appended
         * eight windows onto a page nobody had scrolled — 384 cards — and a
         * once-per-frame guard did not help, because each frame produced another
         * equally stale report. Measuring here answers the question the observer
         * was only approximating: *is the end of the list actually near?*
         */
        if (node.getBoundingClientRect().top > window.innerHeight + MARGIN_PX) return

        appending.current = true
        requestAnimationFrame(() => {
          appending.current = false
        })
        setShown((current) => Math.min(current + MORE, models.length))
      },
      // A screen's warning, so the next rows are there before the reader
      // arrives at the gap rather than after it.
      { rootMargin: `${MARGIN_PX}px` },
    )
    observer.observe(node)
    return () => observer.disconnect()
    // **`shown` is deliberately not a dependency.** Rebuilding the observer on
    // every append re-reports a sentinel that is still inside the root margin,
    // which appends again, and the window runs away from the reader — measured
    // at 384 cards rendered on a page nobody had scrolled. Observing the node
    // once is enough: appending pushes the sentinel down, intersection ends,
    // and the next crossing is the reader actually arriving.
  }, [models.length])

  const visible = shown >= models.length ? models : models.slice(0, shown)

  return (
    <>
      <Row gutter={GRID_GUTTER}>
        {visible.map((model) => (
          <Col key={model.id} {...GRID_SPANS}>
            <WatchCard
              model={model}
              seriesName={seriesById?.get(model.series)?.name}
              accent={accent}
            />
          </Col>
        ))}
      </Row>
      {/* Present only while there is more, so it cannot sit at the end of a
          finished list quietly observing nothing. */}
      {shown < models.length ? <div ref={sentinel} aria-hidden="true" /> : null}
    </>
  )
}
