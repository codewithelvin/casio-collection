import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './test/renderApp'
import { SESSION_STORAGE_KEY } from './auth/config.ts'
import { resetSupabaseClient } from './auth/supabase.ts'
import { resetSessionStore } from './auth/session.ts'
import { resetChunkReload } from './chunkReload.ts'
import { strings } from './i18n/strings'

/**
 * **The failure a visitor reported, driven through the real shell and the real
 * route table.**
 *
 * > Failed to fetch dynamically imported module:
 * > https://casiovault.com/assets/AccountDropdown-_NJEQ997.js
 *
 * `chunkReload.test.ts` pins what `fresh` decides. This pins that the decision
 * is actually reached — which is the half that was missing, and the reason the
 * guard existed for two milestones while the site went on showing the error. A
 * unit test of a helper nothing calls is green.
 *
 * The account control is the right control to hold the first case: it renders on
 * every URL, so for a signed-in reader with a tab open across a deploy it is the
 * first stale chunk asked for, with no navigation involved at all.
 *
 * **The two cases deliberately break different chunks**, and that is not
 * arbitrary. `lazy()` memoises its payload, so a component whose import was left
 * hanging by a reload in one test is permanently pending in the next one — the
 * second assertion would then pass or fail on the order the file happens to run
 * in. A route chunk for the second case keeps them independent.
 */

const { auth, createClient } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return { auth, createClient: vi.fn(() => ({ auth, from: vi.fn() })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

/**
 * A deploy, expressed the only way a test can express one: the chunk was there,
 * and now asking for it throws exactly what the network throws. Written out
 * twice rather than through a helper because `vi.mock` is hoisted above every
 * declaration in the file, so a shared factory is not in scope yet when it runs.
 */
vi.mock('./ui/AccountDropdown.tsx', () => {
  throw new TypeError(
    'Failed to fetch dynamically imported module: /assets/AccountDropdown-_NJEQ997.js',
  )
})

vi.mock('./routes/search', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/search-B4tRq2Xz.js')
})

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: {} },
}

let reload: ReturnType<typeof vi.fn>

/** A returning reader, which is the only state that renders the dropdown. */
function signedIn() {
  localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
  auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
  resetSessionStore()
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  resetChunkReload()

  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    writable: true,
  })
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  // React logs every boundary catch and `RouteError` logs the error itself, on
  // purpose. Both are wanted in a browser and neither is wanted in the report.
  vi.spyOn(console, 'error').mockImplementation(() => {})

  resetSupabaseClient()
  resetSessionStore()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  localStorage.clear()
  sessionStorage.clear()
  resetChunkReload()
})

describe('a tab that was open across a deploy', () => {
  it('reloads instead of showing the error page, when the header asks for a chunk that is gone', async () => {
    signedIn()
    renderApp('/')

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    // The tab is on its way out, so the Suspense fallback is what stays on
    // screen. Anything else here is the reported failure.
    expect(screen.queryByText(strings['state.error.title'])).not.toBeInTheDocument()
  })

  /**
   * FR-10.1 / D33 — offline, `fresh` declines to reload, so the error is real
   * and reaches the router. Without an `errorElement` that meant React Router's
   * own developer page: a stack trace under "💿 Hey developer 👋", addressed to
   * the wrong person. This is what a visitor gets instead.
   */
  it('shows the error state with a way out when a reload is not the answer', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderApp('/search?q=ga2100')

    expect(await screen.findByText(strings['state.error.title'])).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: strings['state.error.retry'] }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
