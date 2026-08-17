import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProvider, App as AntdApp } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import AuthCallbackRoute from './index.tsx'
import { resetSupabaseClient } from '../../auth/supabase.ts'
import { resetSessionStore, useSessionStore } from '../../auth/session.ts'
import { INTENT_KEY, writePendingIntent } from '../../auth/pendingIntent.ts'
import { strings } from '../../i18n/strings'

/**
 * §9.2 / §9.4 — the authenticated return.
 *
 * This route is the seam between two systems that cannot be tested together,
 * and it is the one place a code is exchanged. What it has to get right is
 * small and unforgiving: exchange once, then honour the slot, then leave — with
 * `replace`, so the back button does not land on a URL whose code is spent.
 */

const { auth, db, createClient } = vi.hoisted(() => {
  const auth = {
    exchangeCodeForSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }

  const db = { upsert: vi.fn(async (_payload: unknown) => ({ error: null })) }
  const from = vi.fn(() => ({ upsert: (payload: unknown) => db.upsert(payload) }))

  return { auth, db, createClient: vi.fn(() => ({ auth, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

/**
 * From M5 this route needs two more providers than it did at M4, and both are
 * load-bearing rather than decorative: `useQueryClient()` **throws** outside a
 * QueryClientProvider, and `App.useApp()` silently returns no-op stubs outside
 * `AntdApp` — so without them the tests would fail loudly and the toast
 * assertion would fail quietly, which is the worse of the two.
 */
function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  return render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/auth/callback" element={<AuthCallbackRoute />} />
              <Route path="/" element={<p>the catalogue</p>} />
              <Route path="/watch/:modelId" element={<p>the watch page</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  auth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null })
  db.upsert.mockResolvedValue({ error: null })
  resetSupabaseClient()
  resetSessionStore()
})

describe('coming back signed in', () => {
  it('exchanges the code and puts the user back where they were', async () => {
    writePendingIntent({ kind: 'return', returnTo: '/watch/f-91w-1' })

    renderAt('/auth/callback?code=abc123')

    expect(await screen.findByText('the watch page')).toBeInTheDocument()
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123')
    expect(useSessionStore.getState().status).toBe('authenticated')
  })

  it('consumes the slot, so a refresh cannot apply it twice', async () => {
    writePendingIntent({ kind: 'return', returnTo: '/watch/f-91w-1' })

    renderAt('/auth/callback?code=abc123')

    await screen.findByText('the watch page')
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull()
  })

  it('goes home when there was nothing waiting', async () => {
    renderAt('/auth/callback?code=abc123')
    expect(await screen.findByText('the catalogue')).toBeInTheDocument()
  })

  it('exchanges once, however many times the effect runs', async () => {
    const { rerender } = renderAt('/auth/callback?code=abc123')
    await screen.findByText('the catalogue')
    rerender(<div />)
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })
})

/**
 * §9.4 step 4 — the half M4 could not build, because `collection_items` did not
 * exist and nor did the button that writes an intent.
 *
 * This is what D6 is paying for. Every write needs a session, so a guest who
 * presses *Owned One* is sent away to Google mid-gesture; the promise made in
 * exchange is that the press is still there when they come back.
 */
describe('a press that survived the sign-in (M5)', () => {
  it('applies the mark before putting the user back', async () => {
    writePendingIntent({
      kind: 'collection',
      modelId: 'ga-2100-1a1',
      status: 'owned',
      returnTo: '/watch/ga-2100-1a1',
    })

    renderAt('/auth/callback?code=abc123')

    expect(await screen.findByText('the watch page')).toBeInTheDocument()
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', model_id: 'ga-2100-1a1', status: 'owned' }),
    )
  })

  it('carries a wishlist press just the same', async () => {
    writePendingIntent({
      kind: 'collection',
      modelId: 'f-91w-1',
      status: 'wishlist',
      returnTo: '/watch/f-91w-1',
    })

    renderAt('/auth/callback?code=abc123')

    await screen.findByText('the watch page')
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'wishlist' }))
  })

  it('writes nothing when the slot only held a return path', async () => {
    writePendingIntent({ kind: 'return', returnTo: '/watch/f-91w-1' })

    renderAt('/auth/callback?code=abc123')

    await screen.findByText('the watch page')
    expect(db.upsert).not.toHaveBeenCalled()
  })

  /**
   * The trade-off worth pinning down. They are signed in and they are landing
   * on the watch they pressed, where the button is one press away — so a failed
   * write must not turn a successful sign-in into an error page. Losing the
   * press is recoverable in one gesture; losing the sign-in is not.
   */
  it('still returns the user home when the write fails', async () => {
    db.upsert.mockRejectedValue(new Error('offline'))
    writePendingIntent({
      kind: 'collection',
      modelId: 'ga-2100-1a1',
      status: 'owned',
      returnTo: '/watch/ga-2100-1a1',
    })

    renderAt('/auth/callback?code=abc123')

    expect(await screen.findByText('the watch page')).toBeInTheDocument()
    expect(screen.queryByText(strings['auth.callback.failed.title'])).not.toBeInTheDocument()
  })

  it('consumes the slot, so a refresh cannot mark the watch twice', async () => {
    writePendingIntent({
      kind: 'collection',
      modelId: 'ga-2100-1a1',
      status: 'owned',
      returnTo: '/watch/ga-2100-1a1',
    })

    renderAt('/auth/callback?code=abc123')

    await screen.findByText('the watch page')
    await waitFor(() => expect(sessionStorage.getItem(INTENT_KEY)).toBeNull())
  })
})

describe('when it does not work', () => {
  it('never calls the exchange when the provider refused', async () => {
    // Pressing Cancel on Google's consent screen arrives here as a query
    // parameter, not as a failed redirect.
    renderAt('/auth/callback?error=access_denied&error_description=User+denied')

    expect(await screen.findByText(strings['auth.callback.failed.title'])).toBeInTheDocument()
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('explains a link with no code in it', async () => {
    renderAt('/auth/callback')
    expect(await screen.findByText(strings['auth.callback.failed.title'])).toBeInTheDocument()
  })

  it('explains a code that has already been used', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error('invalid request: both auth code and code verifier should be non-empty'),
    })

    renderAt('/auth/callback?code=spent')

    expect(await screen.findByText(strings['auth.callback.failed.title'])).toBeInTheDocument()
    expect(useSessionStore.getState().status).not.toBe('authenticated')
  })

  it('survives the client failing to load at all', async () => {
    // No project configured: getSupabase throws rather than returning a client.
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSupabaseClient()

    renderAt('/auth/callback?code=abc123')

    expect(await screen.findByText(strings['auth.callback.failed.title'])).toBeInTheDocument()
  })

  it('offers a way out rather than a dead end', async () => {
    renderAt('/auth/callback')

    await screen.findByText(strings['auth.callback.failed.title'])
    expect(screen.getByRole('button', { name: strings['auth.error.retry'] })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: strings['auth.callback.home'] })).toBeInTheDocument()
  })
})
