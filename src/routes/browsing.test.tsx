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
  it('lists every line with its real count, and says why a line is empty', async () => {
    renderApp('/')

    const gShock = await screen.findByRole('link', { name: /G-SHOCK/ })
    expect(gShock).toHaveAttribute('href', '/line/g-shock')

    // "Not catalogued yet" rather than "0". Those are different claims: one is
    // about this catalogue and the other reads as being about Casio.
    expect(await screen.findAllByText(t('home.unseeded'))).not.toHaveLength(0)
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

  it('explains an unseeded line instead of showing an empty grid (FR-1.5)', async () => {
    renderApp('/line/edifice')
    expect(await screen.findByText(t('line.empty.title'))).toBeInTheDocument()
  })

  it('says so when the line is not one of the eight', async () => {
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
    // /line/edifice/f-91w would otherwise render the Vintage series under an
    // Edifice breadcrumb — a URL that looks authoritative and is wrong.
    renderApp('/line/edifice/f-91w')
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
