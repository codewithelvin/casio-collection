import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteOwnAccount,
  fetchCollection,
  fetchProfile,
  fetchProfileByHandle,
  fetchPublicCollection,
  isHandleAvailable,
  putCollectionItem,
  removeCollectionItem,
  setCollectionNote,
  submitCatalogRequest,
  updateProfile,
} from './api.ts'
import { resetSupabaseClient } from '../auth/supabase.ts'

/**
 * The three statements, and specifically **the way they fail**.
 *
 * PostgREST does not reject. A row rejected by a check constraint, a policy
 * that admits nothing, a paused project — all of them come back as a resolved
 * promise carrying `{ data: null, error }`. So a missing `if (error) throw` is
 * not a crash, it is a write that reports success and did nothing, and the
 * optimistic button stays marked over a row that was never stored until the
 * next reload silently takes it away.
 *
 * That is why these four lines have tests of their own rather than being
 * covered incidentally by the component file: they are the difference between
 * FR-4.3's rollback running and never being reached.
 */

const { db, createClient } = vi.hoisted(() => {
  const db = {
    result: { data: [] as unknown, error: null as { message: string } | null },
    lastTable: '',
    lastFilters: {} as Record<string, unknown>,
    lastPayload: null as unknown,
    lastOnConflict: undefined as string | undefined,
    lastRpc: null as { name: string; args: unknown } | null,
  }

  const from = vi.fn((table: string) => {
    db.lastTable = table
    const chain: Record<string, unknown> = {}
    chain['select'] = vi.fn(() => chain)
    chain['order'] = vi.fn(() => chain)
    chain['eq'] = vi.fn((column: string, value: unknown) => {
      db.lastFilters[column] = value
      return chain
    })
    chain['maybeSingle'] = vi.fn(() => Promise.resolve(db.result))
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(db.result).then(resolve, reject)

    chain['upsert'] = vi.fn((payload: unknown, options?: { onConflict?: string }) => {
      db.lastPayload = payload
      db.lastOnConflict = options?.onConflict
      return Promise.resolve(db.result)
    })

    chain['update'] = vi.fn((payload: unknown) => {
      db.lastPayload = payload
      return chain
    })

    chain['insert'] = vi.fn((payload: unknown) => {
      db.lastPayload = payload
      return Promise.resolve(db.result)
    })

    chain['delete'] = vi.fn(() => chain)
    return chain
  })

  const rpc = vi.fn((name: string, args?: unknown) => {
    db.lastRpc = { name, args }
    return Promise.resolve(db.result)
  })

  return { db, createClient: vi.fn(() => ({ auth: {}, from, rpc })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  db.result = { data: [], error: null }
  db.lastTable = ''
  db.lastFilters = {}
  db.lastRpc = null
  db.lastPayload = null
  db.lastOnConflict = undefined
  resetSupabaseClient()
})

describe('reading a collection', () => {
  /**
   * The filter this asserts is not a tidiness. `collection_items` has two select
   * policies and the second one matches every row of every *published* profile
   * (FR-7.4), so an unfiltered select quietly returns strangers' collections
   * alongside yours — with no error, and correctly according to the policies.
   */
  it('asks for this user and nobody else', async () => {
    db.result = { data: [{ model_id: 'f-91w-1' }], error: null }

    await fetchCollection('user-1')

    expect(db.lastFilters['user_id']).toBe('user-1')
  })

  it('turns a PostgREST error into a thrown one', async () => {
    db.result = { data: null, error: { message: 'JWT expired' } }

    await expect(fetchCollection('user-1')).rejects.toThrow('JWT expired')
  })

  it('reads an empty collection as empty rather than as null', async () => {
    db.result = { data: null, error: null }

    await expect(fetchCollection('user-1')).resolves.toEqual([])
  })
})

describe('writing a mark', () => {
  it('upserts on the primary key, so a second press is not a second row (D8)', async () => {
    await putCollectionItem('user-1', 'ga-2100-1a1', 'owned')

    expect(db.lastOnConflict).toBe('user_id,model_id')
    expect(db.lastPayload).toEqual({
      user_id: 'user-1',
      model_id: 'ga-2100-1a1',
      status: 'owned',
    })
  })

  it('throws when the row is refused', async () => {
    // What a check constraint or a policy actually looks like from here.
    db.result = { data: null, error: { message: 'new row violates row-level security policy' } }

    await expect(putCollectionItem('user-1', 'ga-2100-1a1', 'owned')).rejects.toThrow(
      'row-level security',
    )
  })
})

describe('the note (FR-5.1)', () => {
  /**
   * An update rather than an upsert, and that is the requirement rather than a
   * preference: a note belongs to a mark, so there is always a row. An upsert
   * would let a note create a collection row with no status behind it — a watch
   * that is neither owned nor wished for, which the schema permits and nothing
   * in the product means.
   */
  it('updates the row that already exists', async () => {
    await setCollectionNote('user-1', 'ga-2100-1a1', 'Bought in Osaka.')

    expect(db.lastPayload).toEqual({ note: 'Bought in Osaka.' })
    expect(db.lastFilters).toEqual({ user_id: 'user-1', model_id: 'ga-2100-1a1' })
  })

  /**
   * FR-4.4 decides whether to ask before removing a mark by asking whether a
   * note exists. Two ways of having no note would mean two answers.
   */
  it('stores an emptied note as null rather than as an empty string', async () => {
    await setCollectionNote('user-1', 'ga-2100-1a1', '   ')
    expect(db.lastPayload).toEqual({ note: null })

    await setCollectionNote('user-1', 'ga-2100-1a1', null)
    expect(db.lastPayload).toEqual({ note: null })
  })

  it('throws when the write is refused', async () => {
    db.result = { data: null, error: { message: 'permission denied' } }
    await expect(setCollectionNote('user-1', 'x', 'note')).rejects.toThrow('permission denied')
  })
})

describe('the profile (M8)', () => {
  it('reads the signed-in user’s own row', async () => {
    db.result = { data: { id: 'user-1', handle: null, display_name: null, is_public: false }, error: null }

    await expect(fetchProfile('user-1')).resolves.toMatchObject({ id: 'user-1' })
    expect(db.lastFilters).toEqual({ id: 'user-1' })
  })

  it('reads a missing profile as null rather than throwing', async () => {
    db.result = { data: null, error: null }
    await expect(fetchProfile('user-1')).resolves.toBeNull()
  })

  it('writes only the fields it was given', async () => {
    await updateProfile('user-1', { handle: 'elvin', is_public: true })

    expect(db.lastTable).toBe('profiles')
    expect(db.lastPayload).toEqual({ handle: 'elvin', is_public: true })
    expect(db.lastFilters).toEqual({ id: 'user-1' })
  })

  it('throws when the profile write is refused', async () => {
    db.result = { data: null, error: { message: 'violates check constraint' } }
    await expect(updateProfile('user-1', { handle: 'ADMIN' })).rejects.toThrow('check constraint')
  })

  /**
   * FR-7.2 — through a function rather than a select, because §6.4 gives a
   * signed-in user no way to read anybody else's profile row. It answers one
   * bit and cannot enumerate handles: you have to know the string to ask.
   */
  it('checks availability through the function, not a query', async () => {
    db.result = { data: true, error: null }

    await expect(isHandleAvailable('elvin')).resolves.toBe(true)
    expect(db.lastRpc).toEqual({ name: 'handle_available', args: { candidate: 'elvin' } })
  })

  it('treats anything but a true from the function as taken', async () => {
    db.result = { data: false, error: null }
    await expect(isHandleAvailable('admin')).resolves.toBe(false)
  })
})

describe('a published profile (FR-7.4, FR-7.5)', () => {
  /**
   * The filter is the requirement. Asking for `is_public = true` means a
   * private profile is invisible to the *query*, rather than fetched and then
   * filtered here — where a timing difference could still tell a stranger that
   * the handle exists and has been withdrawn.
   */
  it('asks only for published profiles', async () => {
    db.result = { data: null, error: null }

    await fetchProfileByHandle('elvin')

    expect(db.lastFilters).toEqual({ handle: 'elvin', is_public: true })
  })

  it('answers null for a handle that is unknown or private, alike', async () => {
    db.result = { data: null, error: null }
    await expect(fetchProfileByHandle('nobody')).resolves.toBeNull()
  })

  /**
   * The second filter is the requirement, on the same argument as the first: a
   * published profile shows what somebody owns, so the wishlist is not fetched
   * and hidden, it is never sent. Filtering in the component would leave it in
   * the response for anyone who opens a network tab.
   */
  it('reads a published collection by user id, owned rows only', async () => {
    db.result = { data: [{ model_id: 'f-91w-1' }], error: null }

    await expect(fetchPublicCollection('user-2')).resolves.toHaveLength(1)
    expect(db.lastFilters['user_id']).toBe('user-2')
    expect(db.lastFilters['status']).toBe('owned')
  })
})

describe('the request queue (D22)', () => {
  it('sends the reference and drops empty optional fields', async () => {
    await submitCatalogRequest('user-1', { ref: '  GA-2100-1A1 ', link: '  ', note: '' })

    expect(db.lastTable).toBe('catalog_requests')
    expect(db.lastPayload).toEqual({
      user_id: 'user-1',
      ref: 'GA-2100-1A1',
      link: null,
      note: null,
    })
  })

  it('keeps a link and a note when they are given', async () => {
    await submitCatalogRequest('user-1', { ref: 'X-1', link: 'https://example.com', note: 'seen it' })

    expect(db.lastPayload).toMatchObject({ link: 'https://example.com', note: 'seen it' })
  })

  /** FR-9.5's cap arrives as a policy refusal, which the form turns into copy. */
  it('throws so the form can read the refusal', async () => {
    db.result = { data: null, error: { message: 'new row violates row-level security policy' } }
    await expect(submitCatalogRequest('user-1', { ref: 'X-1' })).rejects.toThrow('row-level security')
  })
})

describe('deleting an account (FR-7.6)', () => {
  /**
   * It takes no argument, and that is the whole safety property: the row
   * removed is auth.uid()'s because there is no parameter pointing anywhere
   * else. This asserts the call site keeps it that way.
   */
  it('calls the function with nothing to point at somebody else', async () => {
    await deleteOwnAccount()
    expect(db.lastRpc).toEqual({ name: 'delete_own_account', args: undefined })
  })

  it('throws rather than reporting a deletion that did not happen', async () => {
    db.result = { data: null, error: { message: 'not authenticated' } }
    await expect(deleteOwnAccount()).rejects.toThrow('not authenticated')
  })
})

describe('removing a mark', () => {
  it('names both halves of the key', async () => {
    await removeCollectionItem('user-1', 'ga-2100-1a1')

    expect(db.lastFilters).toEqual({ user_id: 'user-1', model_id: 'ga-2100-1a1' })
  })

  it('throws when the delete is refused', async () => {
    db.result = { data: null, error: { message: 'permission denied' } }

    await expect(removeCollectionItem('user-1', 'ga-2100-1a1')).rejects.toThrow('permission denied')
  })
})
