import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { SESSION_STORAGE_KEY } from '../auth/config.ts'
import { AVATAR_STORAGE_KEY } from '../auth/avatar.ts'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore } from '../auth/session.ts'
import { initials } from './AccountDropdown.tsx'
import { strings } from '../i18n/strings'

/**
 * The header control and §7.3's guard, driven through the real shell and the
 * real route table — the same reason `renderApp` exists at all: a test against
 * a hand-written route list proves only that the list agrees with itself.
 *
 * Deliberately one file and few tests. M3 established that full-shell renders
 * are what starve this suite, so what is here is what cannot be proved any
 * other way: that the guard is on the routes §7.3 marks required, and that the
 * URL survives it.
 */

const { auth, createClient } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  }

  // From M6 `/collection` is a real screen that reads rows, so a client with
  // only an `auth` on it puts the guard's own test behind an error state.
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order']) chain[method] = vi.fn(() => chain)
    chain['maybeSingle'] = vi.fn(() => Promise.resolve({ data: null, error: null }))
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject)
    return chain
  })

  return { auth, createClient: vi.fn(() => ({ auth, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: {
    id: 'user-1',
    email: 'collector@example.com',
    user_metadata: { full_name: 'Elvin Huseynov' },
  },
}

function configure() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
}

function signedIn() {
  configure()
  localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
  auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  resetSupabaseClient()
  resetSessionStore()
})

describe('the account control (§8.1)', () => {
  /**
   * The state the site is in today, and the reason the header carried a comment
   * instead of a button from M0 until now: a Sign in button that opens nothing
   * is worse than no button.
   */
  it('is absent entirely until a Supabase project is configured', async () => {
    resetSessionStore()
    renderApp('/')

    expect(await screen.findByRole('banner')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: strings['account.signIn'] })).not.toBeInTheDocument()
  })

  it('offers Sign in to a guest, and the press opens the modal (D6)', async () => {
    configure()
    resetSessionStore()
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: strings['account.signIn'] }))

    expect(await screen.findByText(strings['auth.modal.title'])).toBeInTheDocument()
  })

  it('becomes an account menu once a stored session is restored', async () => {
    signedIn()
    resetSessionStore()
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: strings['account.menu'] }))

    expect(await screen.findByText(strings['account.signOut'])).toBeInTheDocument()
    expect(screen.getByText('Elvin Huseynov')).toBeInTheDocument()
  })

  /**
   * S7 / S8 — the profile picture reaches the header as a `data:` URI and never
   * as a Google URL. Asserting the *scheme* rather than merely that an image
   * rendered is the point: `img-src 'self' data:` is what makes this legal
   * without widening the CSP, and a future change that swapped the data URI for
   * a remote one would still render a picture and would break the policy.
   */
  it('shows the cached profile picture, and it is a data URI rather than a URL', async () => {
    signedIn()
    localStorage.setItem(AVATAR_STORAGE_KEY, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
    resetSessionStore()
    renderApp('/')

    const button = await screen.findByRole('button', { name: strings['account.menu'] })
    const image = within(button).getByRole('presentation', { hidden: true })
    expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(image.getAttribute('src')).not.toContain('googleusercontent')
  })

  it('falls back to initials when nothing is cached, which is never wrong', async () => {
    signedIn()
    resetSessionStore()
    renderApp('/')

    const button = await screen.findByRole('button', { name: strings['account.menu'] })
    expect(button).toHaveTextContent(initials('Elvin Huseynov'))
    expect(within(button).queryByRole('presentation', { hidden: true })).not.toBeInTheDocument()
  })

  /** §9.5 — clears the store, resets the query cache, returns the user to `/`. */
  it('signs out from a guarded page and lands back on the catalogue', async () => {
    signedIn()
    resetSessionStore()
    const { router } = renderApp('/collection')

    await userEvent.click(await screen.findByRole('button', { name: strings['account.menu'] }))
    await userEvent.click(await screen.findByText(strings['account.signOut']))

    expect(await screen.findByRole('button', { name: strings['account.signIn'] })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  /**
   * FR-11.6 — a shared device must not hold the last person's watches, and must
   * not leave their face in the header either.
   */
  it('drops the cached picture on sign-out', async () => {
    signedIn()
    localStorage.setItem(AVATAR_STORAGE_KEY, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
    resetSessionStore()
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: strings['account.menu'] }))
    await userEvent.click(await screen.findByText(strings['account.signOut']))

    await screen.findByRole('button', { name: strings['account.signIn'] })
    expect(localStorage.getItem(AVATAR_STORAGE_KEY)).toBeNull()
  })
})

describe('a route §7.3 marks required', () => {
  it('keeps the URL and asks, rather than redirecting', async () => {
    configure()
    resetSessionStore()
    const { router } = renderApp('/collection')

    expect(await screen.findByText(strings['auth.required.title'])).toBeInTheDocument()
    // The whole argument for not redirecting: the address someone typed or was
    // sent is still the address they are on, so there is nothing to reconstruct.
    expect(router.state.location.pathname).toBe('/collection')
    expect(await screen.findByText(strings['auth.modal.title'])).toBeInTheDocument()
  })

  it('says accounts are not switched on yet rather than asking for one', async () => {
    resetSessionStore()
    renderApp('/collection')

    expect(await screen.findByText(strings['auth.unavailable.title'])).toBeInTheDocument()
    expect(screen.queryByText(strings['auth.modal.title'])).not.toBeInTheDocument()
  })

  it('renders the page itself once there is a session', async () => {
    signedIn()
    resetSessionStore()
    renderApp('/collection')

    // Waiting on the header rather than on the page is deliberate. While the
    // status is `restoring` the guard renders the page blurred, so the heading
    // is already in the DOM inside a node React is about to replace — a query
    // that resolves against it passes and then holds a detached element. The
    // account menu appearing is the signal that the session has settled.
    await screen.findByRole('button', { name: strings['account.menu'] })

    // M6 made this a real screen, and with no rows behind it that screen is
    // FR-6.4's first run. Which page it is does not matter here; that it is the
    // page rather than the guard's panel is the whole assertion.
    expect(await screen.findByText(strings['collection.empty.title'])).toBeInTheDocument()
    expect(screen.queryByText(strings['auth.required.title'])).not.toBeInTheDocument()
  })
})

describe('initials', () => {
  it.each([
    ['Elvin Huseynov', 'EH'],
    ['Elvin van der Berg', 'EB'],
    ['collector@example.com', 'C'],
    ['   ', '?'],
  ])('renders %s as %s', (label, expected) => {
    expect(initials(label)).toBe(expected)
  })
})
