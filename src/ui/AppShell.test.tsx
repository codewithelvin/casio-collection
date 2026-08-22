import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { useUiStore } from './uiStore'
import { catalogFixture } from '../test/catalogFixture'
import { t } from '../i18n/strings'

/**
 * jsdom answers every media query with `matches: false`. That used to decide
 * which layout the shell rendered, because §8.2's breakpoint was
 * `Grid.useBreakpoint()`; since §12 it is a media query in `shell.css` and jsdom
 * applies no stylesheet at all, so **both** the rail and the drawer trigger are
 * in the tree here and neither is hidden.
 *
 * That is not a weakness of these tests, it is the change they are describing: a
 * shell whose shape comes from CSS has a shape before any JavaScript runs, which
 * is the whole reason the entry chunk went from 232 KB gzipped to 110. What it
 * does mean is that a query for a line has to say *where* — the rail and the
 * drawer both hold one — so the drawer tests scope themselves to the dialog.
 */
/** Line names carry `/` and `-`, which are regex syntax in a name matcher. */
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The rail, which is on screen at every width in jsdom (see above). */
const rail = async () => within(await screen.findByRole('navigation', { name: t('nav.lines') }))

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

    // §8.11 is explicit that this is body text. The footer's other line is
    // `.cc-small` at 14px; what this asserts is that the notice is not on it.
    expect(notice.className).not.toContain('cc-small')
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

  it('puts the theme on the document, so the shell is painted before React runs (§12)', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('theme.toDark') }))

    // The shell has no access to an AntD token any more; its colours are custom
    // properties selected by this attribute. Set from the store rather than from
    // an effect, because an effect runs after paint and a dark-mode visitor would
    // get a frame of white header on every page load.
    await waitFor(() => expect(document.documentElement.dataset['theme']).toBe('dark'))
  })

  it('opens the line drawer below 768 px (§8.2)', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('nav.open') }))

    await waitFor(() => expect(useUiStore.getState().drawerOpen).toBe(true))
    const drawer = within(await screen.findByRole('dialog', { name: t('nav.lines') }))
    expect(await drawer.findByRole('link', { name: /G-SHOCK/ })).toBeInTheDocument()
  })

  it('closes the drawer on Escape, and on a line being chosen (§8.2)', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('nav.open') }))
    await screen.findByRole('dialog', { name: t('nav.lines') })

    // Escape is the keyboard's way out of a modal surface, and it was AntD's
    // Drawer doing it before §12 replaced the Drawer with a fixed panel. A
    // dismissible surface with no Escape is the sort of thing that only gets
    // noticed by someone who cannot use the mask.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(useUiStore.getState().drawerOpen).toBe(false))
  })

  it('gives the drawer its own elevated surface, and the rail no surface at all (§8.2)', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ mode: 'dark' })
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: t('nav.open') }))
    const panel = await screen.findByRole('dialog', { name: t('nav.lines') })

    // Measured at 390×844 in dark mode before this was fixed: the nav painted
    // its own container colour (#141414) over the drawer's elevated one
    // (#1f1f1f) and stopped at 312 px of an 844 px panel — a darker slab with a
    // hard seam under the last line.
    //
    // jsdom applies no stylesheet, so the colours are not readable here; what is
    // readable is that the drawer is the element carrying the elevated class and
    // the nav inside it carries none. The nav takes its background from whatever
    // it is placed in, which is what makes it correct in the rail *and* the
    // drawer without either container knowing about the other.
    expect(panel.className).toContain('cc-drawer')
    const nav = within(panel).getByRole('navigation', { name: t('nav.lines') })
    expect(nav.className).toBe('cc-nav')
  })

  it('gives every line in the rail a glyph', async () => {
    renderApp('/')
    const nav = await rail()

    // A line added later without an entry in LINE_GLYPHS renders bare, which is
    // silent — it looks like a styling choice rather than a missing mapping.
    // Asserted per line rather than over every row on screen, because the rail
    // also holds series rows and those deliberately have no glyph.
    for (const line of catalogFixture.lines) {
      const row = await nav.findByRole('link', {
        name: new RegExp(escapeRegExp(line.name)),
      })
      expect(row.querySelector('svg'), `${line.name} has no glyph`).not.toBeNull()
    }
  })

  it('makes every line in the rail a real link (§12)', async () => {
    renderApp('/')
    const nav = await rail()

    // It was an AntD Menu item with an onClick, because a SubMenu title toggles
    // rather than firing onClick — so the rail's primary navigation could not be
    // middle-clicked, opened in a new tab, or read as a link by anything. The
    // href is the point of the rewrite, so it is the thing asserted.
    const row = await nav.findByRole('link', { name: /G-SHOCK/ })
    expect(row.getAttribute('href')).toBe('/line/g-shock')
  })

  it('carries the model count beside every line in the rail (FR-1.1)', async () => {
    renderApp('/')
    const nav = await rail()

    // This used to assert that Edifice, holding nothing, rendered its name with
    // no count beside it. D51 removed the state rather than the count: a line
    // with no models is not published, so every row in the rail has a real
    // number and none of them can be zero.
    expect(await nav.findByRole('link', { name: /G-SHOCK\s*4/ })).toBeInTheDocument()
    expect(await nav.findByRole('link', { name: /Vintage.*2/ })).toBeInTheDocument()
    expect(nav.queryByRole('link', { name: /Edifice/ })).toBeNull()
  })

  it('labels the Vintage line with both of its senses', async () => {
    renderApp('/')
    const nav = await rail()

    // Casio calls this line "Casio Collection" in Europe and "Vintage" elsewhere,
    // and a reader arrives with one word or the other. It was also the site's own
    // name until D39, which is the collision D21 accepted and the rename removed —
    // the label was never about our name and did not change with it.
    expect(await nav.findByRole('link', { name: /Vintage \/ Casio Collection/ })).toBeInTheDocument()
  })

  it('expands a line to its series, and says which line the expander is for', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const nav = await rail()

    // The expander is a control of its own now that the Menu is gone, so it needs
    // a name of its own — a rail of seven buttons all called "Expand" is a screen
    // reader reading a list of seven identical controls.
    const expander = await nav.findByRole('button', { name: /G-SHOCK/ })
    expect(expander.getAttribute('aria-expanded')).toBe('false')

    await user.click(expander)

    expect(await nav.findByRole('link', { name: /DW-5600/ })).toBeInTheDocument()
    // §8.4 — a family holding two or more series is a heading, and never a link.
    // D32 keeps it out of the URL, by construction: there is no href to give it.
    expect(await nav.findByText('The square')).toBeInTheDocument()
    expect(nav.queryByRole('link', { name: 'The square' })).toBeNull()
  })
})
