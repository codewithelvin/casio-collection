import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from '../test/renderApp'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore } from '../auth/session.ts'
import type { CollectionItem } from '../collection/api.ts'
import { strings } from '../i18n/strings'

/**
 * FR-7.4 / §8.10 — `/u/<handle>` as a stranger sees it: **no session at all**,
 * which is what makes this file different from `collection.test.tsx`. Nothing is
 * stored under the session key here, so the shell settles as a guest and the
 * route fetches the profile on its own.
 *
 * What is worth a full-shell render is the shape of the page rather than the
 * join, which is proved cheaply elsewhere: that a published profile is **one
 * grid of owned watches and no tabs**, and that a wishlist row cannot reach the
 * screen through it. The query's own `status` filter is asserted in
 * `collection/api.test.ts`; this covers the component that would have to agree
 * with it if the mock ever stopped filtering — which is exactly what the mock
 * below does, deliberately.
 */
const { db, createClient } = vi.hoisted(() => {
  const db = {
    rows: [] as unknown[],
    profile: null as unknown,
  }

  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order']) {
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
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }

  return { db, createClient: vi.fn(() => ({ auth, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const item = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  model_id: 'ga-2100-1a1',
  status: 'owned',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

function published(rows: CollectionItem[]) {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  db.profile = { id: 'user-2', handle: 'elvin', display_name: 'Elvin', is_public: true }
  db.rows = rows
}

beforeEach(() => {
  vi.clearAllMocks()
  db.rows = []
  db.profile = null
  localStorage.clear()
  resetSupabaseClient()
  resetSessionStore()
})

describe('a published profile (FR-7.4, §8.10)', () => {
  it('is one grid of owned watches, with nothing to switch between', async () => {
    published([item({ model_id: 'ga-2100-1a1' })])

    renderApp('/u/elvin')

    // Level 3, a step under every other route's page title. With the tabs gone
    // the heading is the only chrome on this page, and 30 px of somebody's name
    // over a grid with nothing under it to balance the weight was the client's
    // note. Asserting the level rather than the size is the part jsdom can see.
    expect(await screen.findByRole('heading', { name: 'Elvin', level: 3 })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  /**
   * **The mock ignores the `status` filter, and that is the point.** It hands
   * back every row it is given whatever the query asked for, so a wishlist row
   * reaching the screen here would mean the component is relying on the database
   * to keep the client's decision — and one policy change away from publishing
   * what somebody is saving up for.
   */
  it('never shows a wishlist row, whatever comes back', async () => {
    published([
      item({ model_id: 'ga-2100-1a1', status: 'owned' }),
      item({ model_id: 'f-91w-1', status: 'wishlist' }),
    ])

    renderApp('/u/elvin')

    expect(await screen.findByRole('link', { name: 'GA-2100-1A1' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'F-91W-1' })).toBeNull()
  })

  /** The count the tab label used to carry, kept because it names the grid. */
  it('says how many are owned', async () => {
    published([item({ model_id: 'ga-2100-1a1' }), item({ model_id: 'f-91w-1' })])

    renderApp('/u/elvin')

    expect(await screen.findByText(`${strings['profile.owned']} · 2`)).toBeInTheDocument()
  })

  /** FR-7.5 — unknown and private render the same page, and `null` is both. */
  it('says nothing about a handle that is unknown or private', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')

    renderApp('/u/nobody')

    expect(await screen.findByText(strings['profile.notFound.title'])).toBeInTheDocument()
  })
})
