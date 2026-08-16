import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { useUiStore } from './uiStore'
import { NAV_LINES } from './lines'
import { t } from '../i18n/strings'

/**
 * jsdom answers every media query with `matches: false`, so AntD's breakpoints
 * all read false and the shell renders its below-768 px form. That is the
 * layout §8.2 calls the real device, so it is the right default for these
 * tests — and it is what makes the drawer reachable here at all.
 */
describe('the app shell (§8.1, §8.2)', () => {
  beforeEach(() => {
    useUiStore.setState({ mode: 'light', drawerOpen: false })
  })

  it('renders the identity in the header', async () => {
    renderApp('/')
    const marks = await screen.findAllByRole('img', { name: t('app.name') })
    expect(marks.length).toBeGreaterThan(0)
  })

  it('carries the non-affiliation notice at body size, not as small print (FR-10.3, §8.11)', async () => {
    renderApp('/')

    const notice = await screen.findByText(t('footer.disclaimer'))
    expect(notice).toBeInTheDocument()

    // §8.11 is explicit that this is body text. AntD's body size is 14px and
    // the small size is 12px; asserting the notice is not set at the small size
    // is what stops it drifting into the footer's fine print later.
    const size = Number.parseFloat(getComputedStyle(notice).fontSize)
    expect(size).toBeGreaterThanOrEqual(14)
  })

  it('closes the footer with the required line (FR-10.3)', async () => {
    renderApp('/')
    expect(await screen.findByText(t('footer.madeBy'))).toBeInTheDocument()
  })

  it('toggles the theme from the header', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('theme.toDark') }))

    expect(useUiStore.getState().mode).toBe('dark')
    // The control has to describe what it will do next, or a screen-reader user
    // is told the opposite of the truth (NFR-8).
    expect(await screen.findByRole('button', { name: t('theme.toLight') })).toBeInTheDocument()
  })

  it('opens the line drawer below 768 px (§8.2)', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('nav.open') }))

    await waitFor(() => expect(useUiStore.getState().drawerOpen).toBe(true))
    expect(await screen.findByRole('menuitem', { name: /G-SHOCK/ })).toBeInTheDocument()
  })

  it('gives every line in the rail a glyph', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('nav.open') }))
    await screen.findByRole('menuitem', { name: /G-SHOCK/ })

    // A line added later without an entry in LINE_ICONS renders bare, which is
    // silent — it looks like a styling choice rather than a missing mapping.
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(NAV_LINES.length)
    for (const item of items) {
      expect(item.querySelector('svg'), `${item.textContent} has no glyph`).not.toBeNull()
    }
  })

  it('labels the Vintage line with both of its senses', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('nav.open') }))

    // Casio calls this line "Casio Collection" in Europe and "Vintage" elsewhere,
    // and a reader arrives with one word or the other. It was also the site's own
    // name until D39, which is the collision D21 accepted and the rename removed —
    // the label was never about our name and did not change with it.
    expect(await screen.findByRole('menuitem', { name: /Vintage \/ Casio Collection/ })).toBeInTheDocument()
  })
})
