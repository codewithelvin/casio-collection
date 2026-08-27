import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '../test/renderApp'
import { SESSION_STORAGE_KEY } from '../auth/config.ts'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore } from '../auth/session.ts'
import type { CollectionItem } from '../collection/api.ts'
import { strings } from '../i18n/strings'

/**
 * §3.6 — My Collection, driven through the real shell and the real route table.
 *
 * Full-shell renders are what M3 and M4 both measured as starving this suite, so
 * this file is deliberately short and holds only what cannot be proved against
 * the pure join: that the counts reach the tab labels, that FR-6.5's row is on
 * the screen rather than merely in an array, and that the first run is a
 * designed page instead of an empty grid.
 */

const { auth, db, createClient } = vi.hoisted(() => {
  const db = { rows: [] as unknown[], profile: { is_public: false } }

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order', 'update']) {
      chain[method] = vi.fn(() => chain)
    }
    chain['maybeSingle'] = vi.fn(() => Promise.resolve({ data: db.profile, error: null }))
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve({
        data: table === 'profiles' ? db.profile : db.rows,
        error: null,
      }).then(resolve, reject)
    return chain
  })

  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }

  return { auth, db, createClient: vi.fn(() => ({ auth, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

const item = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  model_id: 'ga-2100-1a1',
  status: 'owned',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

/**
 * The stored key is what makes the shell start at `restoring` rather than
 * `guest` (§9.5), which is the only path that loads the client and settles into
 * a session — the same route a returning visitor takes.
 */
function signedInWith(rows: CollectionItem[]) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
  auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
  db.rows = rows
  resetSessionStore()
}

beforeEach(() => {
  vi.clearAllMocks()
  db.rows = []
  db.profile = { is_public: false }
  resetSupabaseClient()
  resetSessionStore()
})

describe('/collection (FR-6.1)', () => {
  it('splits the rows into two tabs, each carrying its own count', async () => {
    signedInWith([
      item({ model_id: 'ga-2100-1a1', status: 'owned' }),
      item({ model_id: 'f-91w-1', status: 'owned' }),
      item({ model_id: 'dw-5600e-1v', status: 'wishlist' }),
    ])

    renderApp('/collection')

    expect(await screen.findByRole('tab', { name: /Owned \(2\)/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Wishlist \(1\)/ })).toBeInTheDocument()
  })

  /**
   * FR-6.5 on the screen rather than in an array. The join test proves the row
   * survives; this proves somebody can see it.
   */
  it('shows a marked reference the catalogue no longer carries', async () => {
    signedInWith([item({ model_id: 'withdrawn-reference' })])

    renderApp('/collection')

    expect(await screen.findByText(strings['collection.unlisted.badge'])).toBeInTheDocument()
    expect(screen.getByText('withdrawn-reference')).toBeInTheDocument()
    // And it is counted, so the tab label does not disagree with the grid.
    expect(screen.getByRole('tab', { name: /Owned \(1\)/ })).toBeInTheDocument()
  })

  /** FR-6.4 — "a designed first-run state ... not a blank page". */
  it('offers a way into the catalogue when nothing is marked', async () => {
    signedInWith([])

    renderApp('/collection')

    expect(await screen.findByText(strings['collection.empty.title'])).toBeInTheDocument()
    expect(screen.getByText(strings['collection.empty.browse'])).toBeInTheDocument()
  })

  /**
   * §7.2 — the tab is part of what is on screen, so *Back* has to restore it.
   *
   * Driven as the round trip rather than as two assertions about a query string,
   * because the mechanism is not what broke: `Tabs` was uncontrolled and a route
   * remounts on *Back*, so the reader came out of a watch they opened from their
   * wishlist looking at Owned. Only the whole trip catches that.
   */
  it('comes back to the tab the watch was opened from', async () => {
    signedInWith([
      item({ model_id: 'ga-2100-1a1', status: 'owned' }),
      item({ model_id: 'dw-5600e-1v', status: 'wishlist' }),
    ])

    const { router } = renderApp('/collection')

    await userEvent.click(await screen.findByRole('tab', { name: /Wishlist \(1\)/ }))
    expect(router.state.location.search).toBe('?tab=wishlist')

    await userEvent.click(await screen.findByRole('link', { name: 'DW-5600E-1V' }))
    await screen.findByRole('heading', { name: 'DW-5600E-1V', level: 2 })

    await act(async () => {
      await router.navigate(-1)
    })

    expect(await screen.findByRole('tab', { name: /Wishlist \(1\)/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  /**
   * FR-6.2's default. The rows come back newest-first from the query, but the
   * order on screen has to be the screen's decision — a fixture in the other
   * order is what makes that a real assertion.
   */
  it('opens on the most recently added', async () => {
    signedInWith([
      item({ model_id: 'f-91w-1', created_at: '2026-01-01T00:00:00.000Z' }),
      item({ model_id: 'ga-2100-1a1', created_at: '2026-08-01T00:00:00.000Z' }),
    ])

    renderApp('/collection')

    await screen.findByRole('tab', { name: /Owned \(2\)/ })
    const links = await screen.findAllByRole('link', { name: /GA-2100-1A1|F-91W-1/ })
    expect(links[0]).toHaveAccessibleName('GA-2100-1A1')
  })
})

describe('the note (FR-5)', () => {
  it('saves what was typed when the field is left', async () => {
    signedInWith([item({ model_id: 'ga-2100-1a1', status: 'owned' })])

    renderApp('/watch/ga-2100-1a1')

    const field = await screen.findByRole('textbox', { name: strings['note.heading'] })
    // **Five characters, and keep it that way.** `userEvent.type` dispatches a
    // full event sequence per character, and every one re-renders a TextArea whose
    // `autoSize` measures the DOM and whose `showCount` re-wraps it. This read
    // `Bought in Osaka.` — sixteen characters — and took **25 s on its own with no
    // instrumentation**, which is roughly 10× cheaper than under coverage: the
    // test then timed out at the 60 s ceiling twice during `test:coverage`, once
    // on a fully idle machine, for a reason that has nothing to do with what it
    // asserts.
    //
    // What it asserts is that **leaving the field saves what was typed**. The
    // sentence was never the subject, and the eleven extra keystrokes bought
    // nothing except the flake.
    await userEvent.type(field, 'Osaka')
    await userEvent.tab()

    expect(await screen.findByText(strings['note.saved'])).toBeInTheDocument()
    // Asserted explicitly now, because shortening the input would otherwise make
    // "what was typed" a claim nothing in the test checks.
    expect(field).toHaveValue('Osaka')
  })

  /** FR-5.4 — said while they are typing, and it changes with the profile. */
  it('says who can see it', async () => {
    signedInWith([item({ model_id: 'ga-2100-1a1', status: 'owned' })])

    renderApp('/watch/ga-2100-1a1')

    expect(await screen.findByText(strings['note.private'])).toBeInTheDocument()
  })

  it('warns instead when the profile is published', async () => {
    signedInWith([item({ model_id: 'ga-2100-1a1', status: 'owned' })])
    db.profile = { is_public: true }

    renderApp('/watch/ga-2100-1a1')

    expect(await screen.findByText(strings['note.public'])).toBeInTheDocument()
  })

  /**
   * FR-5.1 — the note belongs to the mark. An editor over an unmarked watch
   * would write to a row that does not exist, and `setCollectionNote` would
   * update nothing and report success.
   */
  it('is absent on a watch that is not marked', async () => {
    signedInWith([])

    renderApp('/watch/f-91w-1')

    await screen.findByRole('heading', { name: 'F-91W-1', level: 2 })
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: strings['note.heading'] }),
      ).not.toBeInTheDocument(),
    )
  })
})
