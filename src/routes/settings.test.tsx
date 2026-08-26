import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore, useSessionStore } from '../auth/session.ts'
import { strings } from '../i18n/strings'

/**
 * FR-7.1's handle field, and specifically **the colour of the line under it.**
 *
 * The client asked for one thing — make *Available* green — and the request
 * exposed a second, worse problem next to it: a handle somebody else already owns
 * put the input into `error` status, a red box, over a sentence rendered in the
 * same neutral grey as the resting hint. The control said no and the words did
 * not, which is the state a user reads as "it is fine, the box is just decorated
 * oddly".
 *
 * So all four states are asserted here rather than the one that was asked for.
 * jsdom applies no stylesheet, so the colours themselves are not readable — what
 * is readable is the class AntD attaches for each `type`, and that is what the
 * theme paints from.
 */
const { db, createClient } = vi.hoisted(() => {
  const db = {
    profile: { id: 'user-1', handle: null as string | null, display_name: null, is_public: false },
    /** What `handle_available` answers. `true` is free, `false` is taken. */
    available: true,
  }

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order', 'update']) chain[method] = vi.fn(() => chain)
    chain['maybeSingle'] = vi.fn(() => Promise.resolve({ data: db.profile, error: null }))
    // **The table matters here, and getting it wrong is not a test failure that
    // reads as one.** The settings page also loads the collection, and handing
    // `joinCollection` a profile object instead of an array throws inside a
    // render — which surfaces as the router's error boundary and a wall of HTML,
    // nowhere near the assertion that was actually being made.
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve({ data: table === 'profiles' ? db.profile : [], error: null }).then(
        resolve,
        reject,
      )
    return chain
  })

  const auth = {
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }

  /** `isHandleAvailable` is an RPC, not a select — `handle_available`. */
  const rpc = vi.fn(() => Promise.resolve({ data: db.available, error: null }))

  return { db, createClient: vi.fn(() => ({ auth, from, rpc })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

/**
 * The session is applied straight into the store rather than restored through
 * `getSession()`, which is what `note.test.tsx` does and for the same reason: a
 * store left at `restoring` leaves `RequireSession` rendering the page inside
 * `Veiled` — blurred, `aria-hidden`, and `pointer-events: none`. The text is
 * still findable through it, so a test that only queried for text would pass
 * against a page nobody can type into. Typing is what fails, loudly, and that is
 * how this was caught.
 */
function signedIn() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  resetSessionStore()
  useSessionStore.getState().applySession(SESSION as never)
}

/** The field, found the way a user finds it — by its own label. */
const handleField = () => screen.findByLabelText(strings['settings.handle'])

beforeEach(() => {
  vi.clearAllMocks()
  db.profile = { id: 'user-1', handle: null, display_name: null, is_public: false }
  db.available = true
  localStorage.clear()
  resetSupabaseClient()
  resetSessionStore()
})

describe('the handle field says which state it is in (FR-7.1, FR-7.2)', () => {
  it('resting, the hint is quiet — it is instructions, not news', async () => {
    signedIn()
    renderApp('/settings')

    const hint = await screen.findByText(strings['settings.handle.hint'])
    expect(hint.className).toContain('ant-typography-secondary')
  })

  it('a free handle is green', async () => {
    signedIn()
    db.available = true
    renderApp('/settings')

    await userEvent.type(await handleField(), 'elvin')

    const free = await screen.findByText(strings['settings.handle.free'], undefined, {
      timeout: 4000,
    })
    // The one the client asked for. `success` is what the theme paints green;
    // asserting the class rather than a colour is the only thing jsdom can hold.
    expect(free.className).toContain('ant-typography-success')
  })

  it('a taken handle is red, agreeing with the box around it', async () => {
    signedIn()
    db.available = false
    renderApp('/settings')

    await userEvent.type(await handleField(), 'elvin')

    const taken = await screen.findByText(strings['settings.handle.taken'], undefined, {
      timeout: 4000,
    })
    // This was grey before. A red input over a grey explanation is a control and
    // a message disagreeing about whether anything is wrong.
    expect(taken.className).toContain('ant-typography-danger')
  })

  it('a handle the rules refuse is red before anything is asked of the server', async () => {
    signedIn()
    renderApp('/settings')

    // One character: too short, so `validateHandle` refuses it locally and no
    // availability request is made at all (FR-7.2).
    await userEvent.type(await handleField(), 'a')

    await waitFor(() =>
      expect(screen.getByText(strings['settings.handle.tooShort']).className).toContain(
        'ant-typography-danger',
      ),
    )
  })
})
