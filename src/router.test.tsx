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

  /**
   * FR-7.4 — the route resolves for a visitor with **no session at all**, which
   * is the half §7.3 marks public. With no Supabase project configured there is
   * nothing to look a handle up in, so what renders is FR-7.5's neutral page —
   * and that it is FR-7.5's page rather than the guard's panel is the
   * assertion. Nothing on this route asks anybody to sign in.
   */
  it('renders a public profile route without a session (FR-7.4)', async () => {
    renderApp('/u/elvin')

    expect(await screen.findByText(t('profile.notFound.title'))).toBeInTheDocument()
    expect(screen.queryByText(t('auth.required.title'))).not.toBeInTheDocument()
  })

  /**
   * The SEO build writes a real file at `dist/watch/<id>/index.html`, so Pages
   * redirects `/watch/<id>` to `/watch/<id>/` and the router is handed a
   * trailing slash it never saw before. If that stopped matching, every
   * catalogued deep link on the live site would render the 404 — which is
   * precisely the class of failure D13 exists for, arriving through a new door.
   */
  it('resolves a watch deep link with the trailing slash Pages redirects to', async () => {
    renderApp('/watch/ga-2100-1a1/')
    expect(
      await screen.findByRole('heading', { name: 'GA-2100-1A1', level: 2 }),
    ).toBeInTheDocument()
  })

  it('renders the 404 for an unknown route (FR-10.2)', async () => {
    renderApp('/no-such-page')

    expect(await screen.findByRole('heading', { name: t('notFound.title') })).toBeInTheDocument()
    // FR-10.2 — it offers a way onward rather than only saying no.
    expect(await screen.findByRole('button', { name: t('notFound.home') })).toBeInTheDocument()
  })
})
