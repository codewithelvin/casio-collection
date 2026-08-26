import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { t } from '../i18n/strings'

/**
 * M3 — the filter bar over a real grid.
 *
 * The fixture is what makes these honest. On the G-SHOCK line one model of four
 * carries a display type and three of four carry a year, so D26's gate has
 * something to actually decide rather than a made-up cohort: the year control
 * appears and the display control does not, from the same data, on the same
 * page.
 */
/**
 * **Scoped to `main`, and that scope is load-bearing since §12.**
 *
 * The rail used to be an AntD `Menu`, so its rows had role `menuitem` and a
 * query for a link could only find a card. It is a list of real `<a>` elements
 * now — which is most of why the rewrite was worth doing — and on
 * `/line/g-shock/dw-5600` the rail opens the line it is showing, so a bare
 * `queryAllByRole('link', { name: /^DW-5600/ })` matches the rail's *series* row
 * as well as the cards. It has no `aria-label`, so it arrived here as a `null`
 * in the middle of the list and read as a sorting bug.
 */
const cardsNamed = (pattern: RegExp) =>
  within(screen.getByRole('main'))
    .queryAllByRole('link', { name: pattern })
    .map((link) => link.getAttribute('aria-label'))

describe('which facets appear (FR-1.3a, D26)', () => {
  it('offers a facet where the data is dense and hides one where it is not', async () => {
    renderApp('/line/g-shock')

    // Year: three of four models. Display: one of four, so a Digital filter here
    // would silently hide the three watches nobody recorded a display for.
    expect(await screen.findByRole('button', { name: /Year/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Display/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Movement/ })).not.toBeInTheDocument()
  })
})

describe('filtering a grid (FR-1.3, FR-1.6)', () => {
  it('narrows the grid and writes the choice into the URL', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/line/g-shock')

    await user.click(await screen.findByRole('button', { name: /Year/ }))
    await user.click(await screen.findByRole('checkbox', { name: /2019/ }))

    await waitFor(() => expect(router.state.location.search).toContain('year=2019'))
    await waitFor(() => expect(cardsNamed(/^DW-5600E-1V$/)).toHaveLength(0))
    expect(cardsNamed(/^GA-2100-1A1$/)).toHaveLength(1)
  })

  it('opens a shared link already filtered', async () => {
    // The whole point of FR-1.6: the view survives being pasted into a message.
    renderApp('/line/g-shock?year=2019')

    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()
    expect(cardsNamed(/^DW-5600E-1V$/)).toHaveLength(0)
  })

  it('reaches an undated watch through Unknown year and nothing else (D5, D25)', async () => {
    renderApp('/line/g-shock?year=unknown')

    // DW-5600C-1 carries a photograph and no year. Every other way of filtering
    // this page hides it; this is the option that does not.
    //
    // It used to be DW-5600BB-1, which carries the five required fields and
    // nothing more — including no photograph, which is why it is now withheld
    // from every grid and cannot be the subject here.
    expect(await screen.findByRole('link', { name: 'DW-5600C-1' })).toBeInTheDocument()
    expect(cardsNamed(/^GA-2100-1A1$/)).toHaveLength(0)
  })

  it('removes one chip and leaves the rest of the filter alone', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/line/g-shock?year=1996,2019')

    await user.click(await screen.findByRole('button', { name: `${t('filter.remove')} 1996` }))

    await waitFor(() => expect(router.state.location.search).toContain('year=2019'))
    expect(router.state.location.search).not.toContain('1996')
  })
})

describe('a filter that matches nothing (FR-1.5)', () => {
  it('names the emptiness and offers one press out of it', async () => {
    const { router } = renderApp('/line/g-shock?year=1066')
    const user = userEvent.setup()

    // Never a blank area, and never a grid that silently ignored the URL.
    expect(await screen.findByText(t('filter.none.title'))).toBeInTheDocument()
    // The chip names what is responsible — the year nothing was made in.
    expect(await screen.findByText('1066')).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: t('filter.clearAllFilters') }))

    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })
})

describe('where the page starts when you arrive', () => {
  it('opens a watch at the top, however far down the grid it was clicked', async () => {
    // The bug this replaces: a single-page navigation keeps the browser's scroll
    // position, so opening the eighteenth card of a series landed two thousand
    // pixels down a page four hundred pixels tall — on the footer.
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    const user = userEvent.setup()
    renderApp('/line/vintage/f-91w')
    await screen.findByRole('link', { name: 'F-91W-3' })
    scrollTo.mockClear()

    await user.click(screen.getByRole('link', { name: 'F-91W-3' }))

    await screen.findByRole('heading', { name: 'F-91W-3', level: 2 })
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('holds its place when a filter changes, because that is the same page', async () => {
    // FR-1.6 makes a filter a navigation. Scrolling to the top on every one of
    // them would throw the reader out of the grid they are reading.
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    const user = userEvent.setup()
    renderApp('/line/g-shock')
    await user.click(await screen.findByRole('button', { name: /Year/ }))

    /**
     * **Pretend the reader has scrolled**, and assert the restored offset
     * rather than the absence of a call.
     *
     * ScrollRestoration scrolls on *every* navigation — either to the position
     * saved under the key, or to the top when there is none. jsdom's scrollY is
     * permanently 0, so both branches call `scrollTo(0, 0)` and "was not
     * called" could never pass: it cannot tell *held its place* from *jumped to
     * the top*, which is the entire behaviour being tested. Giving the page a
     * scroll offset separates them — 820 comes back only if the key matched.
     */
    Object.defineProperty(window, 'scrollY', { value: 820, configurable: true })
    scrollTo.mockClear()

    try {
      await user.click(await screen.findByRole('checkbox', { name: /2019/ }))

      await waitFor(() => expect(cardsNamed(/^DW-5600E-1V$/)).toHaveLength(0))
      expect(scrollTo).toHaveBeenCalledWith(0, 820)
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    }
  })
})

describe('sorting (FR-1.4)', () => {
  it('orders by year newest first and keeps undated watches last', async () => {
    renderApp('/line/g-shock/dw-5600?sort=year-desc')

    await screen.findByRole('link', { name: 'DW-5600E-1V' })
    // DW-5600E-1V is 1996; DW-5600C-1 has no year at all. Undated first would
    // read as an odd order rather than as a fault, which is how it survives.
    //
    // The undated one used to be DW-5600BB-1. It has no photograph, so it is
    // withheld from the grid and an order over it could not be observed — and
    // the assertion would have "passed" over a one-element list.
    expect(cardsNamed(/^DW-5600/)).toEqual(['DW-5600E-1V', 'DW-5600C-1'])
  })

  it('defaults to reference A→Z, which puts the same two the other way round', async () => {
    renderApp('/line/g-shock/dw-5600')

    await screen.findByRole('link', { name: 'DW-5600E-1V' })
    expect(cardsNamed(/^DW-5600/)).toEqual(['DW-5600C-1', 'DW-5600E-1V'])
  })
})
