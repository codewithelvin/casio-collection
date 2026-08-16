import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from './test/renderApp'
import { t } from './i18n/strings'

describe('the route table (§7.3)', () => {
  it('renders the home route at /', async () => {
    renderApp('/')
    expect(
      await screen.findByRole('heading', { name: t('route.home.title'), level: 2 }),
    ).toBeInTheDocument()
  })

  it('resolves a watch deep link and renders that model', async () => {
    // D13's whole problem: this URL has to work when it is the first thing the
    // browser asks for, not only when it is reached by clicking. The router
    // half is proven here; the 404.html half is proven by the CI smoke step.
    renderApp('/watch/ga-2100-1a1')
    expect(
      await screen.findByRole('heading', { name: 'GA-2100-1A1', level: 2 }),
    ).toBeInTheDocument()
  })

  it('resolves a series URL with both segments (D32)', async () => {
    renderApp('/line/g-shock/dw-5600')
    expect(await screen.findByRole('heading', { name: 'DW-5600', level: 2 })).toBeInTheDocument()
  })

  it('carries the search term in the URL (FR-1.6)', async () => {
    renderApp('/search?q=ga2100')
    expect(await screen.findByText('ga2100')).toBeInTheDocument()
  })

  it('renders a public profile route without a session (FR-7.4)', async () => {
    renderApp('/u/elvin')
    expect(await screen.findByText('elvin')).toBeInTheDocument()
  })

  it('renders the 404 for an unknown route (FR-10.2)', async () => {
    renderApp('/no-such-page')

    expect(await screen.findByRole('heading', { name: t('notFound.title') })).toBeInTheDocument()
    // FR-10.2 — it offers a way onward rather than only saying no.
    expect(await screen.findByRole('button', { name: t('notFound.home') })).toBeInTheDocument()
  })
})
