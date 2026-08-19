import { describe, expect, it } from 'vitest'
import { sectionsWithin } from './useReveal'

/**
 * The line page's half of D58. D58 bounded each grid to 48 cards and left the
 * *number* of grids unbounded, which cost 1 082 ms on a back navigation at a 4×
 * throttle once `/line/vintage/` reached 228 cards in 68 sections.
 */
describe('sectionsWithin — how many series fit in a card budget', () => {
  const section = (cards: number) => ({ cards })
  const size = (s: { cards: number }) => s.cards
  const take = (sizes: number[], budget: number) =>
    sectionsWithin(sizes.map(section), size, budget).map(size)

  it('takes sections until the budget is spent', () => {
    // 22 + 16 + 13 = 51, which passes 48 on the third — so three sections, and
    // the fourth waits for the reader.
    expect(take([22, 16, 13, 10, 8], 48)).toEqual([22, 16, 13])
  })

  it('takes a section larger than the whole budget rather than nothing', () => {
    // G-SHOCK's largest series holds 162 against a budget of 48. Refusing it
    // would render an empty page with no sentinel, which would then never reveal
    // anything at all.
    expect(take([162, 122, 90], 48)).toEqual([162])
  })

  it('never splits a section', () => {
    // §8.5's sticky sub-heading names the series and states its count. Half a
    // series under a heading saying 40 is a lie the reader can count.
    expect(take([40], 10)).toEqual([40])
  })

  it('takes everything once the budget covers it', () => {
    expect(take([10, 8, 6], 48)).toEqual([10, 8, 6])
  })

  it('grows by whole sections as the budget grows', () => {
    const sizes = [22, 16, 13, 10, 8]
    expect(take(sizes, 48)).toHaveLength(3)
    expect(take(sizes, 96)).toHaveLength(5)
  })

  it('returns nothing from nothing rather than inventing a section', () => {
    // The "at least one" rule must not manufacture a section on an empty line —
    // a filter matching nothing renders FR-1.5's empty state, not a heading.
    expect(take([], 48)).toEqual([])
  })
})
