import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/renderWithProviders'
import { catalogFixture } from '../test/catalogFixture'
import { OwnershipControls } from './OwnershipControls'
import { resetSupabaseClient } from '../auth/supabase.ts'
import { resetSessionStore, useSessionStore } from '../auth/session.ts'
import { INTENT_KEY } from '../auth/pendingIntent.ts'
import type { CollectionItem } from '../collection/api.ts'
import { strings } from '../i18n/strings'

/**
 * §13.2 — "the Owned button through all five states of §8.7; optimistic update
 * and its rollback on failure; the wishlist → owned move (FR-4.5)".
 *
 * These run against the controls under their providers rather than through the
 * whole shell (see `renderWithProviders`): nothing being asserted here depends
 * on which route the button is on, and M3 and M4 both measured full-shell files
 * as what starves this suite.
 */

const { db, createClient } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  }

  /**
   * **The mock holds rows, and that is not decoration.**
   *
   * Every mutation ends in `onSettled` → `invalidateQueries`, so the refetch
   * that follows a press is part of the behaviour under test. A mock that
   * returned a fixed list would answer that refetch with the state from before
   * the write and silently undo it — which reads as "the optimistic update does
   * not stick" and is entirely the fixture's fault. Storing the rows makes the
   * round trip mean what it means in production.
   */
  const db = {
    rows: [] as Record<string, unknown>[],
    upsert: vi.fn(async (_payload: Record<string, unknown>) => ({
      error: null as { message: string } | null,
    })),
    remove: vi.fn(async (_filters: Record<string, unknown>) => ({
      error: null as { message: string } | null,
    })),
  }

  /**
   * A PostgREST builder is a chain that is also a promise. Every method returns
   * the chain and awaiting it runs the statement, so the mock has to be
   * thenable in the same way — otherwise `select().eq().order()` resolves to the
   * builder instead of to rows and the failure looks like a bug in the query.
   */
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'order']) {
      chain[method] = vi.fn(() => chain)
    }
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve({ data: db.rows, error: null }).then(resolve, reject)

    chain['upsert'] = vi.fn((payload: Record<string, unknown>) => db.upsert(payload))

    chain['delete'] = vi.fn(() => {
      // The filters are captured rather than discarded, because a delete that
      // ignored `model_id` would let a test pass while the code removed the
      // wrong row — or every row.
      const filters: Record<string, unknown> = {}
      const del: Record<string, unknown> = {}
      del['eq'] = vi.fn((column: string, value: unknown) => {
        filters[column] = value
        return del
      })
      del['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
        db.remove(filters).then(resolve, reject)
      return del
    })

    return chain
  })

  // `auth` is never touched by these tests — the session is set on the store
  // directly, which is both faster and closer to what is being asserted — but
  // the client still has to carry one, because `session.ts` attaches a listener
  // to it the moment anything signs in.
  return { db, createClient: vi.fn(() => ({ auth, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const MODEL = catalogFixture.models.find((model) => model.id === 'ga-2100-1a1')!
const OTHER = catalogFixture.models.find((model) => model.id === 'f-91w-1')!

const SESSION = {
  access_token: 'token',
  user: { id: 'user-1', email: 'collector@example.com', user_metadata: { full_name: 'Elvin' } },
}

const row = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  model_id: MODEL.id,
  status: 'owned',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

/** A project exists (§14.2) but nobody is signed in. */
function asGuest() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  resetSessionStore()
}

function asCollector(rows: CollectionItem[] = []) {
  asGuest()
  db.rows = rows as unknown as Record<string, unknown>[]
  useSessionStore.getState().applySession(SESSION as never)
}

const ownedButton = () => screen.getByRole('button', { name: strings['owned.mark'] })
const markedButton = () => screen.getByRole('button', { name: strings['owned.marked'] })

beforeEach(() => {
  vi.clearAllMocks()
  db.rows = []

  // The default behaviour is a working database: the write lands, and the
  // refetch that follows it sees what landed.
  db.upsert.mockImplementation(async (payload) => {
    const id = payload['model_id']
    const held = db.rows.some((existing) => existing['model_id'] === id)
    // A new array every time, never a mutated one: `fetchCollection` hands this
    // straight to the query cache, so mutating in place would edit the rows a
    // previous render is still holding.
    db.rows = held
      ? db.rows.map((existing) =>
          existing['model_id'] === id ? { ...existing, status: payload['status'] } : existing,
        )
      : [{ ...row({ model_id: id as string }), ...payload }, ...db.rows]
    return { error: null }
  })

  db.remove.mockImplementation(async (filters) => {
    db.rows = db.rows.filter((existing) => existing['model_id'] !== filters['model_id'])
    return { error: null }
  })

  resetSupabaseClient()
  resetSessionStore()
})

describe('§8.7 — what the button looks like', () => {
  /**
   * The state the live site is in until M4's console steps are done, and the
   * same rule the header's account menu follows: a primary action that cannot
   * work is worse than no action.
   */
  it('renders nothing at all with no Supabase project', () => {
    resetSessionStore()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    // Asserted as the absence of both controls rather than as an empty
    // container: `AntdApp` renders a wrapper div of its own, so the container is
    // never empty and a test written that way would pass whatever this did.
    expect(screen.queryByRole('button', { name: strings['owned.mark'] })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: strings['wishlist.add'] })).not.toBeInTheDocument()
  })

  it('is an outline Owned One for a guest', async () => {
    asGuest()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    const button = await screen.findByRole('button', { name: strings['owned.mark'] })
    expect(button).not.toHaveClass('ant-btn-primary')
  })

  it('is a solid Owned once the watch is held', async () => {
    asCollector([row({ status: 'owned' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    expect(await screen.findByRole('button', { name: strings['owned.marked'] })).toHaveClass(
      'ant-btn-primary',
    )
  })

  it('fills the heart for a wishlisted watch', async () => {
    asCollector([row({ status: 'wishlist' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    expect(
      await screen.findByRole('button', { name: strings['wishlist.remove'] }),
    ).toBeInTheDocument()
    // Still *Owned One*: a wishlisted watch is not an owned one (D8).
    expect(ownedButton()).toBeInTheDocument()
  })
})

describe('a guest pressing it (FR-4.2, §9.4)', () => {
  it('remembers the press and opens the modal rather than losing it', async () => {
    asGuest()
    renderWithProviders(<OwnershipControls model={MODEL} />, { route: '/line/g-shock/ga-2100' })

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    expect(JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? '{}')).toMatchObject({
      kind: 'collection',
      modelId: 'ga-2100-1a1',
      status: 'owned',
      returnTo: '/line/g-shock/ga-2100',
    })
    // §8.9 — the modal shows the watch that triggered it.
    expect(useSessionStore.getState().prompt.open).toBe(true)
    expect(useSessionStore.getState().prompt.model?.id).toBe('ga-2100-1a1')
  })

  it('writes nothing to the database, because there is nobody to write it for', async () => {
    asGuest()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('carries the wishlist press through the same slot', async () => {
    asGuest()
    renderWithProviders(<OwnershipControls model={MODEL} />, { route: '/watch/ga-2100-1a1' })

    await userEvent.click(await screen.findByRole('button', { name: strings['wishlist.add'] }))

    expect(JSON.parse(sessionStorage.getItem(INTENT_KEY) ?? '{}')).toMatchObject({
      kind: 'collection',
      status: 'wishlist',
      returnTo: '/watch/ga-2100-1a1',
    })
  })
})

describe('the optimistic write (FR-4.3)', () => {
  /**
   * The requirement is about *when*, not whether: "the button changes before the
   * network call resolves". So the write is held open and the button asserted
   * while it is still in flight — a test that awaits the request first would
   * pass on a perfectly unoptimistic implementation.
   */
  it('changes the button before the request resolves', async () => {
    asCollector()
    let settle = (): void => {}
    db.upsert.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = () => resolve({ error: null })
        }),
    )

    renderWithProviders(<OwnershipControls model={MODEL} />)
    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    expect(await screen.findByRole('button', { name: strings['owned.marked'] })).toBeInTheDocument()
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', model_id: 'ga-2100-1a1', status: 'owned' }),
    )

    settle()
  })

  /**
   * §6.3's note lives on the row, and PostgREST builds its `on conflict do
   * update set` from the keys it is sent. A payload carrying `note: null` for
   * completeness would erase a note on every press — and the erasure would look
   * like a bug in M6's editor rather than in the upsert.
   */
  it('never sends the note, so a move cannot erase one', async () => {
    asCollector([row({ status: 'wishlist', note: 'The one my father wore.' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    await waitFor(() => expect(db.upsert).toHaveBeenCalled())
    expect(db.upsert.mock.calls[0]?.[0]).not.toHaveProperty('note')
  })

  it('reverts the button and offers a retry when the write fails', async () => {
    asCollector()
    db.upsert.mockRejectedValue(new Error('offline'))

    renderWithProviders(<OwnershipControls model={MODEL} />)
    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    expect(await screen.findByText(strings['owned.failed.title'])).toBeInTheDocument()
    // FR-4.3 — reverted, not left claiming a mark that was never stored.
    await waitFor(() => expect(ownedButton()).toBeInTheDocument())
  })

  it('retries the same press from the toast', async () => {
    asCollector()
    db.upsert.mockRejectedValueOnce(new Error('offline'))

    renderWithProviders(<OwnershipControls model={MODEL} />)
    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.retry'] }))

    await waitFor(() => expect(db.upsert).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: strings['owned.marked'] })).toBeInTheDocument()
  })
})

describe('the wishlist → owned move (FR-4.5, D8)', () => {
  it('moves the watch and says so', async () => {
    asCollector([row({ status: 'wishlist' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    expect(await screen.findByText(new RegExp(strings['owned.moved']))).toBeInTheDocument()
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'owned' }))
  })

  it('says nothing when the watch was not on the wishlist to begin with', async () => {
    asCollector()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    await screen.findByRole('button', { name: strings['owned.marked'] })
    expect(screen.queryByText(new RegExp(strings['owned.moved']))).not.toBeInTheDocument()
  })
})

describe('removing a mark (FR-4.4)', () => {
  it('removes without interrupting when there is no note', async () => {
    asCollector([row({ status: 'owned', note: null })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.marked'] }))

    await waitFor(() => expect(db.remove).toHaveBeenCalled())
    expect(screen.queryByText(strings['owned.removeNote.title'])).not.toBeInTheDocument()
  })

  it('asks first when the mark carries a note, and says the note goes', async () => {
    asCollector([row({ status: 'owned', note: 'Bought in Osaka.' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.marked'] }))

    // `findAll`, because AntD's confirm renders the title twice — once as the
    // dialog's own title and once inside the confirm body.
    expect(await screen.findAllByText(strings['owned.removeNote.title'])).not.toHaveLength(0)
    expect(screen.getByText(strings['owned.removeNote.body'])).toBeInTheDocument()
    expect(db.remove).not.toHaveBeenCalled()
  })

  it('keeps the watch when the question is declined', async () => {
    asCollector([row({ status: 'owned', note: 'Bought in Osaka.' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.marked'] }))
    await userEvent.click(
      await screen.findByRole('button', { name: strings['owned.removeNote.cancel'] }),
    )

    expect(db.remove).not.toHaveBeenCalled()
    expect(markedButton()).toBeInTheDocument()
  })

  it('removes it once the question is answered', async () => {
    asCollector([row({ status: 'owned', note: 'Bought in Osaka.' })])
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.marked'] }))
    await userEvent.click(
      await screen.findByRole('button', { name: strings['owned.removeNote.confirm'] }),
    )

    await waitFor(() => expect(db.remove).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: strings['owned.mark'] })).toBeInTheDocument()
  })
})

/**
 * D33's one sentence: you can look offline, you cannot change anything offline.
 * FR-11.5 refuses the press rather than queueing it, because a queue replayed
 * later is an offline collection by another name and an offline collection is
 * the two-way merge D6 exists to prevent.
 */
describe('offline (FR-11.5)', () => {
  const goOffline = () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
  }
  const goOnline = () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  }

  afterEach(goOnline)

  it('disables both controls', async () => {
    goOffline()
    asCollector()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    expect(await screen.findByRole('button', { name: strings['owned.mark'] })).toBeDisabled()
    expect(screen.getByRole('button', { name: strings['wishlist.add'] })).toBeDisabled()
  })

  /**
   * The disabled attribute is a presentation. This is the guard behind it: a
   * press can still arrive from a keyboard, a test, or a stale render, and what
   * must not happen is a write that gets queued or optimistically applied.
   */
  it('writes nothing even if the press gets through', async () => {
    goOffline()
    asCollector()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    const button = await screen.findByRole('button', { name: strings['owned.mark'] })
    await userEvent.click(button, { pointerEventsCheck: 0 })

    expect(db.upsert).not.toHaveBeenCalled()
    // Nothing optimistic either — the button still says what it said.
    expect(button).toBeInTheDocument()
  })

  it('marks normally again once the connection is back', async () => {
    goOnline()
    asCollector()
    renderWithProviders(<OwnershipControls model={MODEL} />)

    await userEvent.click(await screen.findByRole('button', { name: strings['owned.mark'] }))

    await waitFor(() => expect(db.upsert).toHaveBeenCalled())
  })
})

describe('FR-4.6 — one watch at a time', () => {
  /**
   * "Marking one watch never freezes another." Two controls for two models are
   * rendered together and one is held mid-write; the other has to stay live.
   * This is the requirement that fails invisibly if the pending flag is ever
   * lifted to a shared store.
   */
  it('leaves another watch pressable while one write is in flight', async () => {
    asCollector()
    let settle = (): void => {}
    db.upsert.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = () => resolve({ error: null })
        }),
    )

    renderWithProviders(
      <>
        <div data-testid="first">
          <OwnershipControls model={MODEL} />
        </div>
        <div data-testid="second">
          <OwnershipControls model={OTHER} />
        </div>
      </>,
    )

    const [firstOwned, secondOwned] = await screen.findAllByRole('button', {
      name: strings['owned.mark'],
    })
    await userEvent.click(firstOwned!)

    await waitFor(() => expect(db.upsert).toHaveBeenCalledTimes(1))
    expect(secondOwned).toBeEnabled()

    await userEvent.click(secondOwned!)
    await waitFor(() => expect(db.upsert).toHaveBeenCalledTimes(2))

    settle()
  })
})
