import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../catalog/build.ts'
import { IMAGE_DIR, loadCatalogSource } from '../../scripts/catalog/load.ts'
import { LINE_GROUNDS, LINE_GROUND_OPACITY } from '../theme/palette.ts'

/**
 * The watch ghosted behind each line card on the front door.
 *
 * `LINE_GROUNDS` is a hand-written map, which makes it the one thing on the
 * front door that can go stale without anything going red: rename a model,
 * withdraw a colourway, or let `catalog:images` refuse a photograph for being
 * over budget, and the card quietly loses its ground — or worse, keeps a broken
 * `<img>` in it. So the map is checked against the real `catalog-src/`, not
 * against a fixture. A fixture would only prove the map agrees with itself.
 */
const { source, failures } = await loadCatalogSource()
if (!source) throw new Error(`catalog-src will not parse: ${JSON.stringify(failures)}`)
const payload = buildCatalog(source)

describe('the line card grounds', () => {
  it('names a watch for every line the front door publishes', () => {
    // D51 — an unpublished line has no card, so it needs no ground. The
    // direction that matters is that no *published* card goes without one.
    for (const line of payload.lines) {
      expect(LINE_GROUNDS[line.id], `${line.id} has no ground`).toBeTruthy()
    }
  })

  it('names only photographs the catalogue publishes, in the line they are named for', () => {
    for (const [lineId, ground] of Object.entries(LINE_GROUNDS)) {
      const model = payload.models.find((candidate) => candidate.image === ground)
      expect(model, `${lineId}: no model claims the photograph ${ground}`).toBeDefined()
      expect(model!.line, `${ground} is a ${model!.line} watch, not a ${lineId} one`).toBe(lineId)
      // A tombstone is a retired entry (D2), and illustrating a whole line with
      // one would put a watch on the front door that the catalogue has withdrawn.
      expect(model!.tombstone, `${ground} is tombstoned`).toBeUndefined()
    }
  })

  it('names only files that are actually on disk, at both densities', () => {
    for (const ground of Object.values(LINE_GROUNDS)) {
      expect(existsSync(join(IMAGE_DIR, `${ground}.webp`)), `${ground}.webp is missing`).toBe(true)
      expect(existsSync(join(IMAGE_DIR, `${ground}@2x.webp`)), `${ground}@2x.webp missing`).toBe(
        true,
      )
    }
  })
})

/* ------------------------------------------------------------------------- *
 * The opacity is a contrast ceiling
 * ------------------------------------------------------------------------- */

const channel = (value: number) => {
  const s = value / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Both themes composite greys onto greys, so one channel is the whole colour. */
const contrast = (a: number, b: number) => {
  const first = channel(a)
  const second = channel(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** `over(#fff, #000, 0.08)` — what a black pixel at 8% leaves of a white card. */
const over = (below: number, above: number, alpha: number) => below + (above - below) * alpha

describe('the opacity of a line card ground', () => {
  /**
   * **These are not taste assertions and they are not pinning the two numbers.**
   * They re-derive the ceiling those numbers came from, so raising either one
   * fails with the ratio it would have shipped rather than with "expected 0.08".
   *
   * The count under a line name is `colorTextDescription`, set in `tokens.ts` to
   * the darkest quiet grey that still clears AA on a plain card — 4.7:1, which
   * is almost no headroom. What keeps it above 4.5 with a photograph behind it
   * is that the token is translucent: it composites against the tinted ground
   * and darkens with it.
   */
  it('keeps the count above AA on light, under the darkest pixel a photograph can have', () => {
    const ground = over(255, 0, LINE_GROUND_OPACITY.light)
    const text = over(ground, 0, 0.55)
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * Dark fails in the opposite direction, which is why the two numbers differ.
   * Most of these watches are black resin on a nearly black card and cannot lift
   * it at all; what can is a steel bracelet or a white dial.
   */
  it('keeps the count above AA on dark, under the brightest pixel a photograph can have', () => {
    const ground = over(20, 255, LINE_GROUND_OPACITY.dark)
    const text = over(ground, 255, 0.55)
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5)
  })
})
