import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sectionsWithin, useReveal } from './useReveal'

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

  it('can spend a whole window and reveal nothing, which is why the hook chases', () => {
    // `/line/g-shock/`'s first seven sections, in the order the page renders
    // them. Because the budget is *spent* rather than checked, the sixth
    // section overshoots it by 78 — more than one window — so raising the
    // budget from 144 to 192 buys the reader **exactly nothing**.
    //
    // That is the whole bug the catch-up effect in `useReveal` exists for: no
    // new cards means the sentinel does not move, an IntersectionObserver only
    // speaks when intersection *changes*, and the page stops for good with a
    // skeleton still under it. Kept as a pure fact so the hook's test below has
    // something to point at.
    const sizes = [69, 32, 28, 9, 4, 80, 8]
    expect(take(sizes, 144)).toHaveLength(6)
    expect(take(sizes, 192)).toHaveLength(6)
    expect(take(sizes, 240)).toHaveLength(7)
  })
})

/**
 * The line page in miniature: a budget counted in cards, spent on whole
 * sections. `useReveal` is driven exactly as `LineRoute` drives it.
 */
function Sections({ sizes }: { sizes: number[] }) {
  const total = sizes.reduce((sum, n) => sum + n, 0)
  const { shown, sentinel, done } = useReveal(total, `line:${total}`)
  const visible = sectionsWithin(sizes, (n) => n, shown)
  return (
    <div>
      <span data-testid="sections">{visible.length}</span>
      <span data-testid="shown">{shown}</span>
      {done ? null : <div data-testid="sentinel" ref={sentinel} />}
    </div>
  )
}

describe('useReveal — reaching the end of what is revealed', () => {
  let arrive: (() => void) | undefined

  beforeEach(() => {
    // jsdom has no IntersectionObserver, and without one the hook renders
    // everything by design — so the stub is what makes the windowed path
    // testable. Holding the callback lets a test say "the reader got to the
    // bottom" precisely once, which is the condition that broke.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        callback: IntersectionObserverCallback
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback
        }
        observe() {
          arrive = () =>
            this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never)
        }
        disconnect() {
          arrive = undefined
        }
        unobserve() {}
      },
    )
  })

  afterEach(() => {
    arrive = undefined
    vi.unstubAllGlobals()
  })

  const sections = () => Number(screen.getByTestId('sections').textContent)

  it('renders one window and stops until the reader arrives', () => {
    render(<Sections sizes={[69, 32, 28, 9, 4, 80, 8, 6, 4]} />)
    // A budget of 48 is spent by the first section alone, and a section is
    // never split — so one section, and nothing beyond it before a scroll.
    expect(sections()).toBe(1)
    expect(Number(screen.getByTestId('shown').textContent)).toBe(48)
  })

  it('does not stall on an append that reveals no new section', async () => {
    // The regression. `/line/g-shock/`'s real section sizes: reaching the
    // bottom used to buy one window and one window only, and the third of those
    // rendered the same six sections as the second. The observer had no further
    // change to report, so the page stopped at 222 of 742 watches — under four
    // skeleton cards promising more — and the only way out was a reload.
    //
    // jsdom reports every rect at the origin, so the sentinel is always "within
    // reach" here: one arrival should therefore carry the list all the way, and
    // before the fix it carried it exactly one window.
    render(<Sections sizes={[69, 32, 28, 9, 4, 80, 8, 6, 4, 3, 3, 49]} />)
    expect(sections()).toBe(1)

    act(() => arrive?.())

    await waitFor(() => expect(sections()).toBe(12))
  })
})
