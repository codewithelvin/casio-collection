import { Col, Row } from 'antd'
import { useMemo } from 'react'
import type { PublishedModel, PublishedSeries } from '../catalog/schema.ts'
import { WatchCard } from './WatchCard'
import { useReveal } from './useReveal'

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
 *
 * Exported because the **line page reveals whole series and has to stop at the
 * same number of cards** — the cost is cards, not the containers holding them,
 * and two windows sized differently would be two answers to one question.
 */
export const WINDOW = 48

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
  // The identity of the list, not the array reference: a parent that rebuilds an
  // equal array on every render would otherwise reset the window forever.
  const identity = useMemo(
    () => `${models.length}:${models[0]?.id ?? ''}:${models.at(-1)?.id ?? ''}`,
    [models],
  )
  const { shown, sentinel, done } = useReveal(models.length, identity, {
    first: WINDOW,
    more: WINDOW,
  })

  const visible = done ? models : models.slice(0, shown)

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
      {done ? null : <div ref={sentinel} aria-hidden="true" />}
    </>
  )
}
