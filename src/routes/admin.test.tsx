import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../test/renderApp'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore, useSessionStore } from '../auth/session.ts'
import { strings } from '../i18n/strings'

/**
 * `/admin/requests` — and what it shows to everybody who is not the one account.
 *
 * **The assertion that matters is a negative one**, which is why it is written
 * three times from three starting points. This route is not in the sitemap, has
 * no prerendered page and is linked from nowhere, so the only person who reaches
 * it by accident is somebody guessing — and the guess must not be rewarded with
 * a sign-in prompt. A prompt is an answer: it says there is something here and a
 * session is what stands between you and it. The 404 says nothing at all.
 *
 * That is also why this is not wrapped in `guarded` like `/collection` and
 * `/settings`, and a future refactor that "tidies" it into the same wrapper as
 * its neighbours would pass typecheck, pass lint, and quietly start announcing
 * the page. These tests are the thing that fails instead.
 */
const { db, createClient } = vi.hoisted(() => {
  const db = {
    /** What `is_admin()` answers. */
    admin: false,
    /** What `catalog_request_queue()` answers. */
    queue: [] as unknown[],
    /** Set when a caller names the table instead of the function. */
    tablesTouched: [] as string[],
  }

  const from = vi.fn((table: string) => {
    db.tablesTouched.push(table)
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order', 'update']) chain[method] = vi.fn(() => chain)
    chain['maybeSingle'] = vi.fn(() => Promise.resolve({ data: null, error: null }))
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve, reject)
    return chain
  })

  const auth = {
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }

  const rpc = vi.fn((name: string) => {
    if (name === 'is_admin') return Promise.resolve({ data: db.admin, error: null })
    if (name === 'catalog_request_queue') {
      // What the function returns to a caller it refuses: not an error, an empty
      // set. The screen must never depend on the difference, because the
      // database is the thing enforcing this and it enforces it silently.
      return Promise.resolve({ data: db.admin ? db.queue : [], error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })

  return { db, createClient: vi.fn(() => ({ auth, from, rpc })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

function signedIn() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  resetSessionStore()
  useSessionStore.getState().applySession(SESSION as never)
}

const row = (ref: string, extra: Record<string, unknown> = {}) => ({
  id: Math.floor(Math.random() * 1e6),
  ref,
  link: null,
  note: null,
  created_at: '2026-09-01T00:00:00.000Z',
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.admin = false
  db.queue = []
  db.tablesTouched = []
  localStorage.clear()
  resetSupabaseClient()
  resetSessionStore()
})

describe('who can see the queue', () => {
  it('shows a guest the 404, not a sign-in prompt', async () => {
    renderApp('/admin/requests')

    expect(await screen.findByText(strings['notFound.title'])).toBeInTheDocument()
    // The tell. `RequireSession` renders this button, and its presence here
    // would mean the route had been moved back under `guarded`.
    expect(screen.queryByText(strings['account.signIn'])).not.toBeInTheDocument()
    expect(screen.queryByText(strings['admin.requests.title'])).not.toBeInTheDocument()
  })

  it('shows a signed-in stranger the same 404', async () => {
    signedIn()
    db.admin = false

    renderApp('/admin/requests')

    expect(await screen.findByText(strings['notFound.title'])).toBeInTheDocument()
    expect(screen.queryByText(strings['admin.requests.title'])).not.toBeInTheDocument()
  })

  it('opens for the one account the database says is admin', async () => {
    signedIn()
    db.admin = true

    renderApp('/admin/requests')

    expect(await screen.findByText(strings['admin.requests.title'])).toBeInTheDocument()
  })

  /**
   * 0003 gave `catalog_requests` no select policy and 0004 revoked select from
   * `authenticated`; the read is a SECURITY DEFINER function instead. A screen
   * that reached for the table would get an empty array with no error — the
   * failure would look exactly like an empty queue.
   */
  it('never names the table, only the function', async () => {
    signedIn()
    db.admin = true
    db.queue = [row('GA-2100-1A1')]

    renderApp('/admin/requests')
    await screen.findByText(strings['admin.requests.title'])

    expect(db.tablesTouched).not.toContain('catalog_requests')
  })
})

describe('what the queue says about each reference', () => {
  it('says an empty queue is empty rather than broken', async () => {
    signedIn()
    db.admin = true

    renderApp('/admin/requests')

    expect(await screen.findByText(strings['admin.requests.empty.title'])).toBeInTheDocument()
  })

  /**
   * **The finding this page exists for.** `GA-2100-1A1` is in the fixture
   * catalogue with a photograph, so a visitor reporting it as missing did not
   * fail to find a gap — they failed to find a watch that is right there. The
   * queue has to say which, or the work goes to the wrong place.
   */
  it('marks a reference that is already catalogued', async () => {
    signedIn()
    db.admin = true
    db.queue = [row('GA-2100-1A1')]

    renderApp('/admin/requests')

    expect(
      await screen.findByText(strings['admin.requests.verdict.catalogued']),
    ).toBeInTheDocument()
    // And it links to the watch, so the next click settles it.
    expect(await screen.findByText(strings['admin.requests.open'])).toBeInTheDocument()
  })

  it('marks a reference nobody has catalogued', async () => {
    signedIn()
    db.admin = true
    db.queue = [row('DW-9999Z')]

    renderApp('/admin/requests')

    expect(await screen.findByText(strings['admin.requests.verdict.missing'])).toBeInTheDocument()
  })

  it('shows the note and the link a reporter left', async () => {
    signedIn()
    db.admin = true
    db.queue = [row('DW-9999Z', { note: 'Saw it in Tokyo', link: 'https://example.test/watch' })]

    renderApp('/admin/requests')

    expect(await screen.findByText('Saw it in Tokyo')).toBeInTheDocument()
    const link = await screen.findByRole('link', { name: 'https://example.test/watch' })
    // A stranger chose this destination, so it does not get told where the
    // visit came from.
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('counts the people who asked rather than the reports', async () => {
    signedIn()
    db.admin = true
    db.queue = [row('DW-9999Z'), row('dw-9999z'), row('DW9999Z')]

    renderApp('/admin/requests')

    expect(
      await screen.findByText(`3 ${strings['admin.requests.asked.many']}`),
    ).toBeInTheDocument()
  })
})
