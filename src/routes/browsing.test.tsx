import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { t } from '../i18n/strings'

/**
 * M2 — browsing. These drive the real route table through the real shell, so a
 * screen that renders only because a test mounted it in isolation cannot pass.
 */

describe('the home route', () => {
  it('lists every published line with its real count', async () => {
    renderApp('/')

    const gShock = await screen.findByRole('link', { name: /G-SHOCK/ })
    expect(gShock).toHaveAttribute('href', '/line/g-shock')
    expect(await screen.findByText(`4 ${t('home.models')}`)).toBeInTheDocument()
  })

  it('puts no card on the front door that has nothing behind it (D51)', async () => {
    renderApp('/')
    await screen.findByRole('link', { name: /G-SHOCK/ })

    // The front door used to carry a "Not catalogued yet" card for each of the
    // five unseeded lines. D51 took that state out of the artefact rather than
    // out of the card, so the assertion is about every card's count rather than
    // about one string — "0 models" is the same empty category wearing a number.
    const cards = screen.getAllByRole('link', { name: new RegExp(`${t('home.models')}$`) })
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
  it('passes the column height through the link, so a card cannot sit short of its row', async () => {
    renderApp('/')

    const link = await screen.findByRole('link', { name: /G-SHOCK/ })
    // The card asks for `height: 100%`, which is a claim about its parent. This
    // anchor is that parent.
    expect(link).toHaveStyle({ height: '100%' })
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

    expect(main!.querySelectorAll('.ant-card')).toHaveLength(7)
    // A line card has no photograph, so its skeleton has no square tile. The
    // watch grid's skeleton does, and borrowing it here put an image placeholder
    // above every line name and then collapsed it when the catalogue landed.
    expect(main!.querySelector('.ant-card-cover')).toBeNull()
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
