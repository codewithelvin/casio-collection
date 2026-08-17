import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
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

const { auth, createClient } = vi.hoisted(() => {
  const auth = {
    exchangeCodeForSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }
  return { auth, createClient: vi.fn(() => ({ auth })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

function renderAt(url: string) {
  return render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackRoute />} />
          <Route path="/" element={<p>the catalogue</p>} />
          <Route path="/watch/:modelId" element={<p>the watch page</p>} />
        </Routes>
      </MemoryRouter>
    </ConfigProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  auth.exchangeCodeForSession.mockResolvedValue({ data: { session: SESSION }, error: null })
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
