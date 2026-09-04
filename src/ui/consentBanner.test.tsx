import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { CONSENT_STORAGE_KEY } from '../analytics/consent'
import { useUiStore } from './uiStore'

/**
 * **Every test in this file needs a measurement ID, and that is the point.**
 *
 * These tests originally ran with `VITE_GA_ID` unset — the state the site was
 * actually deployed in — and passed, because the banner rendered regardless of
 * whether analytics existed. That was the bug: a live consent request for a
 * Google Analytics that was never loaded. Stubbing the ID makes the suite
 * describe a build where consent means something, and the last test below
 * covers the build where it does not.
 */
beforeEach(() => {
  vi.stubEnv('VITE_GA_ID', 'G-ZPV33WSDLL')
})

interface AnalyticsWindow extends Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

const scope = window as AnalyticsWindow

afterEach(() => {
  localStorage.clear()
  delete scope.dataLayer
  delete scope.gtag
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((n) => n.remove())
  useUiStore.setState({ consent: null, consentPromptOpen: false })
  vi.unstubAllEnvs()
})

describe('the consent banner (D68)', () => {
  it('asks once, before anything has been answered', async () => {
    renderApp('/')
    expect(await screen.findByRole('region', { name: /analytics consent/i })).toBeInTheDocument()
  })

  /**
   * The requirement that separates a consent from a nag: refusing has to cost
   * exactly what accepting costs. Both are buttons, both are one press, and
   * neither is styled as the one the site prefers.
   */
  it('offers accepting and declining as two equal presses', async () => {
    renderApp('/')
    const accept = await screen.findByRole('button', { name: 'Accept' })
    const decline = await screen.findByRole('button', { name: 'Decline' })
    expect(accept.className).toBe(decline.className)
  })

  it('loads nothing from Google until somebody accepts', async () => {
    renderApp('/')
    await screen.findByRole('region', { name: /analytics consent/i })
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull()
    expect(scope.dataLayer).toBeUndefined()
  })

  it('remembers a decline and never asks again', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Decline' }))

    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied')
    expect(screen.queryByRole('region', { name: /analytics consent/i })).not.toBeInTheDocument()
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('remembers an acceptance and puts the banner away', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: 'Accept' }))

    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
    expect(screen.queryByRole('region', { name: /analytics consent/i })).not.toBeInTheDocument()
  })

  it('does not ask somebody who already answered', async () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied')
    useUiStore.setState({ consent: 'denied' })
    renderApp('/')
    await screen.findByRole('main')
    expect(screen.queryByRole('region', { name: /analytics consent/i })).not.toBeInTheDocument()
  })

  /**
   * Withdrawal has to be as easy as granting was, and `/settings` is behind a
   * session — so a signed-out reader would have had no route back to this at
   * all. The control is in the footer disclosure, which every page carries.
   */
  it('can be reopened from the footer after an answer', async () => {
    const user = userEvent.setup()
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
    useUiStore.setState({ consent: 'granted' })
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: /about this site/i }))
    await user.click(await screen.findByRole('button', { name: 'Analytics' }))

    expect(await screen.findByRole('region', { name: /analytics consent/i })).toBeInTheDocument()
    // Reopening must not itself erase the answer — only the two buttons do that.
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
  })

  it('lets a reopened question be left exactly as it was', async () => {
    const user = userEvent.setup()
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
    useUiStore.setState({ consent: 'granted', consentPromptOpen: true })
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Keep as is' }))
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('granted')
    expect(screen.queryByRole('region', { name: /analytics consent/i })).not.toBeInTheDocument()
  })

  /**
   * The one that was missing, and it shipped. A build with no `VITE_GA_ID` has
   * no analytics — no tag, no cookie, no beacon — so asking anybody to agree to
   * it is asking a question the site does not mean. This was live on
   * casiovault.com and confirmed in a browser: banner present, no gtag script,
   * no dataLayer. It covers a fork, a preview build and every local build too.
   */
  it('asks nothing at all when analytics is not configured', async () => {
    vi.stubEnv('VITE_GA_ID', '')
    renderApp('/')
    await screen.findByRole('main')
    expect(screen.queryByRole('region', { name: /analytics consent/i })).not.toBeInTheDocument()
  })

  it('offers no analytics control in the footer when there is nothing to control', async () => {
    const user = userEvent.setup()
    vi.stubEnv('VITE_GA_ID', '')
    renderApp('/')
    await user.click(await screen.findByRole('button', { name: /about this site/i }))
    expect(screen.queryByRole('button', { name: 'Analytics' })).not.toBeInTheDocument()
  })

  it('turns analytics off for the next load when a grant is withdrawn', async () => {
    const user = userEvent.setup()
    localStorage.setItem(CONSENT_STORAGE_KEY, 'granted')
    useUiStore.setState({ consent: 'granted', consentPromptOpen: true })
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Decline' }))
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('denied')
  })
})
