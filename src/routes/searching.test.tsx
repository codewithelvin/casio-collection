import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { catalogArtefactResponse, catalogFixture } from '../test/catalogFixture'
import type { Catalog } from '../catalog/schema.ts'
import { seeAllResults, t } from '../i18n/strings'

/**
 * M3 — search, driven through the real shell.
 *
 * jsdom answers every media query `false`, so AntD reads the below-768 px
 * layout and the field starts as an icon (§8.2). That is the device §8.2 calls
 * the real one, so these tests exercise the harder path by default: the search
 * has to be opened before it can be typed into.
 */
async function openSearch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: t('search.open') }))
  return screen.findByRole('combobox', { name: t('search.placeholder') })
}

describe('the header search (FR-2)', () => {
  it('offers the watches that match what is typed', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.type(await openSearch(user), 'ga2100')

    // Typed without the hyphen, found with it (FR-2.2).
    expect(await screen.findByText('GA-2100-1A1')).toBeInTheDocument()
  })

  it('goes to the watch when a result is chosen', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/')

    await user.type(await openSearch(user), 'casioak')
    await user.click(await screen.findByText('GA-2100-1A1'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/watch/ga-2100-1a1'))
  })

  it('carries the term to the results page on Enter (FR-1.6)', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/')

    const field = await openSearch(user)
    await user.type(field, 'square{Enter}')

    await waitFor(() => expect(router.state.location.pathname).toBe('/search'))
    expect(router.state.location.search).toBe('?q=square')
  })

  it('focuses the field from anywhere when / is pressed (FR-2.5)', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByRole('button', { name: t('search.open') })

    await user.keyboard('/')

    const field = await screen.findByRole('combobox', { name: t('search.placeholder') })
    await waitFor(() => expect(field).toHaveFocus())
    // The slash opened the field; it did not also land in it.
    expect(field).toHaveValue('')
  })

  it('shows eight and a way to the rest (FR-2.3)', async () => {
    // The fixture holds six models, so the cap needs a catalogue big enough to
    // reach it. Twelve colourways of one reference is not a contrivance — F-91W
    // has eighteen in the real catalogue.
    const many: Catalog = {
      ...catalogFixture,
      models: Array.from({ length: 12 }, (_, i) => ({
        id: `f-91w-${i + 10}`,
        ref: `F-91W-${i + 10}`,
        line: 'vintage',
        series: 'f-91w',
        source: { url: 'https://example.com/f-91w', kind: 'community' as const },
      })),
    }
    // Both artefacts from the same twelve-model catalogue (§6.2's split). Serving
    // it at the index path too would fail the index's parse — `models` is an
    // unrecognised key there — and leave the rail empty on a test about search.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        return (
          catalogArtefactResponse(String(input), many) ?? {
            ok: false,
            status: 404,
            json: async () => ({}),
          }
        )
      }),
    )

    const user = userEvent.setup()
    renderApp('/')
    await user.type(await openSearch(user), 'f91w')

    expect(await screen.findByText(seeAllResults(12))).toBeInTheDocument()
    expect(screen.getAllByText(/^F-91W-\d+$/)).toHaveLength(8)
  })
})

describe('the results page (FR-2.3)', () => {
  it('renders every match and says how many there are', async () => {
    renderApp('/search?q=f91w')

    expect(await screen.findByRole('heading', { name: 'f91w', level: 2 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'F-91W-1' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'F-91W-3' })).toBeInTheDocument()
  })

  it('asks for a term rather than showing an empty grid', async () => {
    renderApp('/search')
    expect(await screen.findByText(t('search.noTerm.title'))).toBeInTheDocument()
  })

  it('says nothing matched, and why that is not the same as nothing existing', async () => {
    renderApp('/search?q=rolex')
    expect(await screen.findByText(t('search.empty.title'))).toBeInTheDocument()
  })
})
