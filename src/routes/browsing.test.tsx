import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { t } from '../i18n/strings'

/**
 * M2 — browsing. These drive the real route table through the real shell, so a
 * screen that renders only because a test mounted it in isolation cannot pass.
 *
 * **The front-door queries are scoped to `main`, and that scope is load-bearing
 * since §12.** The rail used to be an AntD `Menu`, so its rows had role
 * `menuitem` and a query for a link could only find a card. It is a list of real
 * `<a>` elements now, and it carries the same seven line names the front door
 * does — so an unscoped `findByRole('link', { name: /G-SHOCK/ })` matches two
 * elements and throws.
 */
const front = () => within(screen.getByRole('main'))

describe('the home route', () => {
  it('lists every published line with its real count', async () => {
    renderApp('/')
    // Awaited once here; the route is lazy, so nothing is in `main` until it
    // resolves and every `front()` below it is synchronous.
    await screen.findByRole('heading', { name: t('home.linesHeading') })

    const gShock = await front().findByRole('link', { name: /G-SHOCK/ })
    expect(gShock).toHaveAttribute('href', '/line/g-shock')
    expect(await front().findByText(`4 ${t('home.models')}`)).toBeInTheDocument()
  })

  it('puts no card on the front door that has nothing behind it (D51)', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: t('home.linesHeading') })
    await front().findByRole('link', { name: /G-SHOCK/ })

    // The front door used to carry a "Not catalogued yet" card for each of the
    // five unseeded lines. D51 took that state out of the artefact rather than
    // out of the card, so the assertion is about every card's count rather than
    // about one string — "0 models" is the same empty category wearing a number.
    const cards = front().getAllByRole('link', { name: new RegExp(`${t('home.models')}$`) })
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.textContent).not.toMatch(new RegExp(`(^|\\D)0 ${t('home.models')}$`))
    }
  })

  /**
   * jsdom does not lay out, so neither of these can measure a card. They pin the
   * two mechanisms that made the measurement wrong on a real phone instead.
   *
   * What was reported: on a 360 px screen the G-SHOCK card stood 24 px shorter
   * than the `Vintage / Casio Collection` card beside it, and the whole block
   * shrank by 400 px the moment the catalogue arrived.
   */
  it('makes the card the grid item itself, so it cannot sit short of its row', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: t('home.linesHeading') })

    const link = await front().findByRole('link', { name: /G-SHOCK/ })

    // **The mechanism this pins has changed, and the old failure is now
    // structurally impossible rather than merely fixed.** It used to be an
    // anchor wrapping an AntD Card, where the card asked for `height: 100%` —
    // a claim about its parent — and the anchor sat at its content height and
    // left a gap under itself. The assertion was `toHaveStyle({ height: '100%' })`
    // on that anchor.
    //
    // §12 replaced Row/Col/Card with one CSS grid, and the anchor *is* the grid
    // item: `align-items: stretch` is the default, so it fills its row without
    // anyone claiming anything. There is no inner card to be shorter than its
    // wrapper, so what is asserted is that there is no wrapper — the link is a
    // direct child of the grid.
    expect(link.parentElement?.className).toContain('cc-line-grid')
    expect(link.className).toContain('cc-card')
  })

  it('loads through a skeleton of the front door s own shape, not the watch grid s', async () => {
    // Never resolves, so the page stays in its loading state for the assertions.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderApp('/')

    // The heading is not part of the skeleton — it is known before the fetch, so
    // it does not arrive later and shift the grid down under it. Awaited because
    // the route itself is lazy (router.tsx), not because the catalogue is.
    const heading = await screen.findByRole('heading', { name: t('home.linesHeading') })
    const main = heading.closest('main')
    expect(main).not.toBeNull()

    expect(main!.querySelectorAll('.cc-card')).toHaveLength(7)
    // A line card has no photograph, so its skeleton has no square tile. The
    // watch grid's skeleton does, and borrowing it here put an image placeholder
    // above every line name and then collapsed it when the catalogue landed.
    expect(main!.querySelector('img')).toBeNull()
    // And the skeleton stands in the same grid the cards will, so the seven
    // boxes do not re-flow into a different number of columns when they fill.
    expect(main!.querySelector('.cc-line-grid')).not.toBeNull()
  })
})

describe('the line route (FR-1.2)', () => {
  it('groups every model in the line under its series', async () => {
    renderApp('/line/g-shock')

    expect(await screen.findByRole('heading', { name: 'G-SHOCK', level: 2 })).toBeInTheDocument()

    // Largest series first, so the page opens on the group with depth rather
    // than on a run of single-card sections.
    const headings = await screen.findAllByRole('link', { name: /^DW-5600|^GW-M5610|^GA-2100/ })
    expect(headings.length).toBeGreaterThan(0)

    // Every model in the line is on the page, across its groups.
    expect(await screen.findByRole('link', { name: 'DW-5600E-1V' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'GW-M5610U-1' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()
  })

  it('opens on the families Casio names, and never on a family of one (§8.4)', async () => {
    renderApp('/line/g-shock')

    // `square` holds DW-5600 and GW-M5610 in the fixture, so it is a heading.
    const family = await screen.findByRole('heading', { name: 'The square', level: 4 })
    expect(family).toBeInTheDocument()

    // `octagonal` holds only GA-2100. §8.4 says that is not a heading, and its
    // series falls through to the ungrouped run below — which is the rule that
    // lets a family stay out of the URL (D32).
    expect(screen.queryByRole('heading', { name: 'Octagonal' })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()

    // The family comes before the series it holds, and before the ungrouped
    // ones. A heading after its own group would be furniture.
    const order = (name: string) =>
      Array.from(document.querySelectorAll('h4, section')).findIndex((node) =>
        node.textContent?.startsWith(name),
      )
    expect(order('The square')).toBeGreaterThanOrEqual(0)
    expect(order('The square')).toBeLessThan(order('DW-5600'))
  })

  it('renders no family heading for a line that has none', async () => {
    // Vintage carries no family in the fixture, and the page must read exactly
    // as it did before families existed rather than growing an empty level.
    renderApp('/line/vintage')
    await screen.findByRole('link', { name: 'F-91W-1' })
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument()
  })

  it('is not reachable for a line that holds nothing (D51)', async () => {
    // `/line/edifice` used to render a designed "not catalogued yet" page.
    // Edifice is not in the published artefact when it holds no models, so the
    // honest answer is that there is no such line *in this catalogue* — which is
    // what the not-found state already says.
    renderApp('/line/edifice')
    expect(await screen.findByText(t('line.notFound.title'))).toBeInTheDocument()
  })

  it('says so when the line is not one Casio Vault covers', async () => {
    renderApp('/line/rolex')
    expect(await screen.findByText(t('line.notFound.title'))).toBeInTheDocument()
  })
})

describe('the series route', () => {
  it('renders the grid and the names collectors actually type (FR-2.1)', async () => {
    renderApp('/line/vintage/f-91w')

    expect(await screen.findByRole('heading', { name: 'F-91W', level: 2 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'F-91W-1' })).toBeInTheDocument()
    expect(await screen.findByText('F91W')).toBeInTheDocument()
  })

  it('refuses a series that exists but does not live in the line the URL claims', async () => {
    // /line/g-shock/f-91w would otherwise render the Vintage series under a
    // G-SHOCK breadcrumb — a URL that looks authoritative and is wrong. Both
    // halves have to exist for this to test what it says: with an unpublished
    // line in the URL it would pass because the *line* was missing.
    renderApp('/line/g-shock/f-91w')
    expect(await screen.findByText(t('series.notFound.title'))).toBeInTheDocument()
  })
})

describe('the editions routes (D62)', () => {
  it('lists every published edition with its partner and its count', async () => {
    renderApp('/editions')

    await screen.findByRole('heading', { name: t('editions.heading'), level: 2 })
    const pacMan = await screen.findByRole('link', { name: /PAC-MAN Collaboration/ })
    expect(pacMan).toHaveAttribute('href', '/editions/pac-man')
    expect(pacMan.textContent).toContain('Bandai Namco Entertainment Inc.')
    expect(pacMan.textContent).toContain(`2 ${t('editions.count')}`)
  })

  it('agrees on the noun when an edition holds exactly one reference', async () => {
    renderApp('/editions')
    const uno = await screen.findByRole('link', { name: /UNO Collaboration/ })
    expect(uno.textContent).toContain(`1 ${t('editions.countOne')}`)
    // …and not the plural, which is the half that proves the agreement rather
    // than the presence of a number.
    expect(uno.textContent).not.toContain(`1 ${t('editions.count')}`)
  })

  it('shows an edition’s references from every line they sit in', async () => {
    // The claim the whole screen exists to make. These two are in different
    // series *and* different lines, and no other URL on this site shows them
    // together — so a grid that only managed one of them would be the feature
    // silently not working.
    renderApp('/editions/pac-man')

    await screen.findByRole('heading', { name: 'PAC-MAN Collaboration', level: 2 })
    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'F-91W-1' })).toBeInTheDocument()
  })

  it('names each card’s own series, which the series page never has to', async () => {
    renderApp('/editions/pac-man')
    await screen.findByRole('heading', { name: 'PAC-MAN Collaboration', level: 2 })
    // Which A168 or F-91W this is cannot be inferred on a page holding both.
    expect(await screen.findAllByText('GA-2100')).not.toHaveLength(0)
  })

  it('names the series on a photographed card too, not only on a typographic one', async () => {
    // The series used to live **only** inside the typographic tile, so on every
    // cross-series grid — search, the collection, a profile, an edition — a
    // watch that had been photographed lost the one piece of context those
    // grids exist to supply. Invisible for as long as those grids happened to
    // hold unphotographed watches. `/search` is used here because it is the
    // public route whose one photographed fixture model is reachable.
    renderApp('/search?q=dw5600e')
    expect(await screen.findByText(/DW-5600 · The square · 1996/)).toBeInTheDocument()
  })

  it('says which page the collaboration was read off, and what kind (FR-3.2a)', async () => {
    renderApp('/editions/pac-man')

    await screen.findByRole('heading', { name: t('edition.sourceHeading') })
    const source = await screen.findByRole('link', {
      name: new RegExp(t('watch.source.official')),
    })
    expect(source).toHaveAttribute('href', 'https://www.casio.com/pac-man_collaboration/')
    expect(source).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('says so when the edition is not one this catalogue carries', async () => {
    renderApp('/editions/not-an-edition')
    expect(await screen.findByText(t('edition.notFound.title'))).toBeInTheDocument()
  })

  it('offers the editions from the rail, below the lines', async () => {
    renderApp('/')
    const rail = within(await screen.findByRole('navigation', { name: t('nav.lines') }))
    const link = await rail.findByRole('link', { name: new RegExp(t('nav.editions')) })
    expect(link).toHaveAttribute('href', '/editions')
  })

  it('offers them from the front door too, without a second grid of cards', async () => {
    renderApp('/')
    await screen.findByRole('heading', { name: t('home.linesHeading') })
    expect(await front().findByRole('link', { name: t('editions.all') })).toHaveAttribute(
      'href',
      '/editions',
    )
  })
})

describe('the watch route (FR-3)', () => {
  it('renders only the fields the model carries, never an empty row (FR-3.2)', async () => {
    renderApp('/watch/dw-5600e-1v')

    expect(
      await screen.findByRole('heading', { name: 'DW-5600E-1V', level: 2 }),
    ).toBeInTheDocument()
    expect(await screen.findByText('3229')).toBeInTheDocument()
    expect(await screen.findByText('200 m')).toBeInTheDocument()
    expect(await screen.findByText('42.8 mm')).toBeInTheDocument()

    // The fixture model has no depth, so that row must not exist at all.
    expect(screen.queryByText(t('spec.case.depth_mm'))).not.toBeInTheDocument()
  })

  it('says nobody has looked when a model carries only its required fields (D27)', async () => {
    renderApp('/watch/dw-5600bb-1')
    expect(await screen.findByText(t('watch.noSpecs'))).toBeInTheDocument()
  })

  it('tells the reader what kind of page the data came off (FR-3.2a)', async () => {
    renderApp('/watch/f-91w-1')

    const source = await screen.findByRole('link', {
      name: new RegExp(t('watch.source.community')),
    })
    expect(source).toHaveAttribute('href', 'https://casiorestore.com/casio-f-91w')
    // Leaving the site, and never carrying the referrer with it.
    expect(source).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('offers the rest of the series and never the watch you are on (FR-3.4)', async () => {
    renderApp('/watch/f-91w-1')

    const heading = await screen.findByRole('heading', { name: t('watch.otherInSeries') })
    const strip = heading.nextElementSibling as HTMLElement
    expect(within(strip).getByText('F-91W-3')).toBeInTheDocument()
    expect(within(strip).queryByText('F-91W-1')).not.toBeInTheDocument()
  })

  it('names the series the reference sits in, and the words collectors use for it', async () => {
    renderApp('/watch/f-91w-1')

    const series = (await screen.findByText(t('spec.series'))).parentElement as HTMLElement
    expect(within(series).getByRole('link', { name: 'F-91W' })).toHaveAttribute(
      'href',
      '/line/vintage/f-91w',
    )
    // FR-2.1's alias, which the breadcrumb cannot carry and which is the reason
    // this line exists next to a breadcrumb that already names the series.
    expect(within(series).getByText('F91W')).toBeInTheDocument()
  })

  it('names no alias for a series that has none, rather than an empty tag (D27)', async () => {
    renderApp('/watch/dw-5600e-1v')

    const series = (await screen.findByText(t('spec.series'))).parentElement as HTMLElement
    expect(within(series).getByRole('link', { name: 'DW-5600' })).toBeInTheDocument()
    expect(series.querySelectorAll('.ant-tag')).toHaveLength(0)
  })

  it('still names the series where nobody has sourced a specification (D27)', async () => {
    // The series is not a row in the specification table, and this is the test
    // that keeps it out of one: a Series row would fill every table on the site
    // and retire the sentence that distinguishes an unsourced watch from a plain
    // one. Both have to be on this page at once.
    renderApp('/watch/dw-5600bb-1')

    expect(await screen.findByText(t('watch.noSpecs'))).toBeInTheDocument()
    const series = screen.getByText(t('spec.series')).parentElement as HTMLElement
    expect(within(series).getByRole('link', { name: 'DW-5600' })).toBeInTheDocument()
  })

  it('names the edition a reference was released in, linked to it (D62)', async () => {
    renderApp('/watch/ga-2100-1a1')

    const edition = (await screen.findByText(t('spec.edition'))).parentElement as HTMLElement
    expect(within(edition).getByRole('link', { name: 'PAC-MAN Collaboration' })).toHaveAttribute(
      'href',
      '/editions/pac-man',
    )
  })

  it('cites the page that put the reference in the edition, where there is one', async () => {
    // D62's `edition_source`, which is D54's argument applied to a second field:
    // every other fact on the page came off `source`, so a membership
    // established elsewhere has to say where.
    renderApp('/watch/f-91w-1')

    const edition = (await screen.findByText(t('spec.edition'))).parentElement as HTMLElement
    expect(within(edition).getByRole('link', { name: t('spec.edition.source') })).toHaveAttribute(
      'href',
      'https://www.casio.com/jp/f-91w-1/',
    )
  })

  it('says nothing at all about editions on a reference that is in none (D27)', async () => {
    // The line disappears entirely rather than rendering a label with nothing
    // after it — the state almost every reference in this catalogue is in.
    renderApp('/watch/dw-5600e-1v')
    await screen.findByRole('heading', { name: 'DW-5600E-1V', level: 2 })
    expect(screen.queryByText(t('spec.edition'))).not.toBeInTheDocument()
  })

  it('renders no citation where the edition’s own page established the membership', async () => {
    renderApp('/watch/ga-2100-1a1')
    const edition = (await screen.findByText(t('spec.edition'))).parentElement as HTMLElement
    expect(within(edition).queryByRole('link', { name: t('spec.edition.source') })).toBeNull()
  })

  it('links to the Casio product page only where the entry has one (FR-3.5)', async () => {
    renderApp('/watch/dw-5600e-1v')
    expect(await screen.findByRole('link', { name: /Casio product page/ })).toBeInTheDocument()
  })

  it('says whether Casio still lists the reference (D59)', async () => {
    renderApp('/watch/dw-5600e-1v')
    expect(await screen.findByText(t('filter.stillListed'))).toBeInTheDocument()
    expect(screen.queryByText(t('filter.noLongerListed'))).not.toBeInTheDocument()
  })

  it('marks a reference Casio has dropped, without calling it a problem (D59)', async () => {
    renderApp('/watch/f-91w-3')
    expect(await screen.findByText(t('filter.noLongerListed'))).toBeInTheDocument()
  })

  it('says nothing at all where availability was never measured (D27, D59)', async () => {
    // The third state, and the one a boolean invites you to lose: a model nobody
    // measured must not read as *currently listed*. Unknown renders as itself,
    // and here itself is nothing.
    renderApp('/watch/dw-5600bb-1')
    await screen.findByRole('heading', { name: 'DW-5600BB-1', level: 2 })
    expect(screen.queryByText(t('filter.stillListed'))).not.toBeInTheDocument()
    expect(screen.queryByText(t('filter.noLongerListed'))).not.toBeInTheDocument()
  })

  it('does not invent a product link for a model without one', async () => {
    renderApp('/watch/f-91w-1')
    await screen.findByRole('heading', { name: 'F-91W-1', level: 2 })
    expect(screen.queryByRole('link', { name: /Casio product page/ })).not.toBeInTheDocument()
  })

  it('sets the document title from the reference (FR-3.7)', async () => {
    renderApp('/watch/ga-2100-1a1')
    await screen.findByRole('heading', { name: 'GA-2100-1A1', level: 2 })
    expect(document.title).toContain('GA-2100-1A1')
  })

  it('credits the photograph to the person who took it (D41)', async () => {
    renderApp('/watch/dw-5600e-1v')

    // Attribution is the term of use, not a courtesy, so it sits under the
    // picture rather than in a credits page nobody opens.
    const author = await screen.findByRole('link', { name: /Multicherry/ })
    expect(author).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Casio_DW-5600E.jpg',
    )

    // …and the licence has to be reachable too. A credit nobody can check is
    // decoration.
    const licence = await screen.findByRole('link', { name: 'CC BY-SA 4.0' })
    expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/')
  })

  it('says the reference is not catalogued rather than rendering a blank page', async () => {
    renderApp('/watch/does-not-exist')
    expect(await screen.findByText(t('watch.notFound.title'))).toBeInTheDocument()
  })
})

describe('the card at all three image mixes (§8.6)', () => {
  it('renders a photograph where one exists', async () => {
    renderApp('/line/g-shock/dw-5600')
    const image = await screen.findByRole('img', { name: 'DW-5600E-1V' })
    expect(image).toHaveAttribute('loading', 'lazy')
    // NFR-7 — explicit geometry, so the grid does not reflow as images arrive.
    expect(image).toHaveAttribute('width', '400')
    expect(image).toHaveAttribute('height', '400')
  })

  it('renders the typographic tile as a designed state, not a broken image', async () => {
    renderApp('/line/g-shock/dw-5600')

    // DW-5600BB-1 has no image. It must produce no <img> at all — a src that
    // 404s is what §8.6 forbids — and must still say what it is.
    await screen.findByRole('link', { name: 'DW-5600BB-1' })
    expect(screen.queryByRole('img', { name: 'DW-5600BB-1' })).not.toBeInTheDocument()
    expect(screen.getByText('DW-5600BB-1')).toBeInTheDocument()
  })

  it('survives a grid with no photographs at all, which is today s catalogue', async () => {
    // Every one of the sixty-one real models is imageless, so this mix is not a
    // hypothetical: it is what the live site renders.
    renderApp('/line/vintage/f-91w')
    await screen.findByRole('link', { name: 'F-91W-1' })
    expect(screen.queryAllByRole('img', { name: /F-91W/ })).toHaveLength(0)
    expect(screen.getByText('F-91W-1')).toBeInTheDocument()
    expect(screen.getByText('F-91W-3')).toBeInTheDocument()
  })
})

describe('when the catalogue cannot be loaded (FR-10.1)', () => {
  it('offers a retry rather than a blank screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )

    renderApp('/')
    expect(await screen.findByText(t('state.error.title'))).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: t('state.error.retry') })).toBeInTheDocument()
  })

  it('retries the fetch when asked', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: t('state.error.retry') }))

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })
})
