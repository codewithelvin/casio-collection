import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteOwnAccount,
  fetchCollection,
  fetchCollectors,
  fetchListedOwners,
  fetchModelOwnerCounts,
  fetchOwnLinks,
  fetchProfile,
  fetchProfileByHandle,
  fetchPublicCollection,
  isHandleAvailable,
  putCollectionItem,
  removeCollectionItem,
  replaceOwnLinks,
  setAvatarPublished,
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
    lastNot: null as { column: string; operator: string; value: unknown } | null,
    lastInvoke: null as { name: string; options: unknown } | null,
    invokeResult: { data: null as unknown, error: null as { message: string } | null },
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
    // D70's link set is replaced rather than diffed, and the delete half names
    // the platforms to keep with `not in`. Recorded so the test can assert that
    // a save does not wipe the rows it is about to write back.
    chain['not'] = vi.fn((column: string, operator: string, value: unknown) => {
      db.lastNot = { column, operator, value }
      return chain
    })
    return chain
  })

  const rpc = vi.fn((name: string, args?: unknown) => {
    db.lastRpc = { name, args }
    return Promise.resolve(db.result)
  })

  const functions = {
    invoke: vi.fn((name: string, options?: unknown) => {
      db.lastInvoke = { name, options }
      return Promise.resolve(db.invokeResult)
    }),
  }

  return { db, createClient: vi.fn(() => ({ auth: {}, from, rpc, functions })) }
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
  db.lastNot = null
  db.lastInvoke = null
  db.invokeResult = { data: null, error: null }
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
   * **This is an RPC and not a select, and D73 is the reason.**
   *
   * The filter used to be the requirement — `is_public = true` in the query, so
   * a private profile was invisible to the *statement* rather than fetched and
   * filtered here. That is still true and is now the function's job, because the
   * policy the filter leaned on admitted every published row to every caller:
   * one unfiltered request returned the whole directory whether or not its
   * members had asked to be in one, which made `is_listed` unenforceable.
   *
   * Asserting the call shape rather than a filter is therefore the point. If
   * this ever goes back to `.from('profiles')`, this test is what says no.
   */
  it('reads a published profile through profile_by_handle, not through a select', async () => {
    db.result = { data: null, error: null }

    await fetchProfileByHandle('elvin')

    expect(db.lastRpc).toEqual({ name: 'profile_by_handle', args: { p_handle: 'elvin' } })
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

/**
 * M11 — D69 through D73.
 *
 * Every read below is an **RPC**, and the tests assert the call rather than a
 * filter for a reason that is the whole of D73: a select against `profiles` used
 * to work and used to be wrong, because the policy behind it handed every
 * published row to every caller. If any of these ever goes back to `.from(…)`,
 * these are the tests that say no.
 *
 * The arguments are asserted verbatim too. A misspelled parameter name is not an
 * error in PostgREST — it is a call to a function that does not exist with that
 * signature, or worse, a default silently taken. Both look like "no collectors
 * yet" on screen.
 */
describe('the collector directory (D69)', () => {
  it('reads through the collectors function, never through a select', async () => {
    db.result = { data: [], error: null }

    await fetchCollectors({ search: 'elvin', sort: 'new', owns: 'ga-2100-1a1', limit: 24, offset: 48 })

    expect(db.lastRpc).toEqual({
      name: 'collectors',
      args: {
        p_search: 'elvin',
        p_sort: 'new',
        p_owns: 'ga-2100-1a1',
        p_limit: 24,
        p_offset: 48,
      },
    })
  })

  /**
   * An empty search box must not become a search for the empty string. It
   * happens to be harmless in `collectors()` — the SQL tests for both — and it
   * is sent as null anyway, because a filter that is always satisfied is a
   * filter the planner still has to consider.
   */
  it('sends no search rather than an empty one', async () => {
    await fetchCollectors({ search: '   ' })

    expect((db.lastRpc?.args as { p_search: unknown }).p_search).toBeNull()
  })

  it('defaults the page to the first twenty-four', async () => {
    await fetchCollectors()

    expect(db.lastRpc?.args).toMatchObject({ p_sort: 'watches', p_limit: 24, p_offset: 0 })
  })

  it('throws rather than reporting an empty directory when the read failed', async () => {
    db.result = { data: null, error: { message: 'function does not exist' } }

    await expect(fetchCollectors()).rejects.toThrow('function does not exist')
  })
})

describe('who owns a watch (FR-3.8, D72)', () => {
  it('asks for the named owners by model', async () => {
    await fetchListedOwners('ga-2100-1a1')

    expect(db.lastRpc).toEqual({
      name: 'listed_owners',
      args: { p_model_id: 'ga-2100-1a1', p_limit: 8 },
    })
  })

  it('asks for counts in a batch, so a grid could ever be one request', async () => {
    await fetchModelOwnerCounts(['ga-2100-1a1', 'f-91w-1'])

    expect(db.lastRpc).toEqual({
      name: 'model_owner_counts',
      args: { p_model_ids: ['ga-2100-1a1', 'f-91w-1'] },
    })
  })

  /**
   * **The floor arrives as `null`, not as a zero**, and this pins the shape
   * rather than the number: the function returns the row with a null count when
   * fewer than five people own the watch, and the strip renders nothing at all.
   * A zero here would render "0 collectors own this", which is a claim.
   */
  it('passes a floored count through as null', async () => {
    db.result = {
      data: [{ model_id: 'ga-2100-1a1', owned_count: null, wishlist_count: null }],
      error: null,
    }

    await expect(fetchModelOwnerCounts(['ga-2100-1a1'])).resolves.toEqual([
      { model_id: 'ga-2100-1a1', owned_count: null, wishlist_count: null },
    ])
  })

  it('throws when the count cannot be read', async () => {
    db.result = { data: null, error: { message: 'permission denied' } }

    await expect(fetchListedOwners('ga-2100-1a1')).rejects.toThrow('permission denied')
  })
})

describe('the profile links (D70)', () => {
  it('deletes only the platforms that are gone', async () => {
    await replaceOwnLinks('user-1', [
      { platform: 'github', handle: 'someone' },
      { platform: 'website', handle: 'https://example.com' },
    ])

    expect(db.lastNot).toEqual({
      column: 'platform',
      operator: 'in',
      value: '(github,website)',
    })
    expect(db.lastPayload).toEqual([
      { user_id: 'user-1', platform: 'github', handle: 'someone' },
      { user_id: 'user-1', platform: 'website', handle: 'https://example.com' },
    ])
  })

  /**
   * Clearing every link is the case the `not in` clause cannot express — an
   * empty list would build `not in ()`, which is a syntax error in one dialect
   * and "delete nothing" in another. The delete runs unqualified instead.
   */
  it('clears them all when the last one is removed', async () => {
    await replaceOwnLinks('user-1', [])

    expect(db.lastNot).toBeNull()
    expect(db.lastFilters).toEqual({ user_id: 'user-1' })
  })

  it('throws when the delete half fails, rather than writing over half a set', async () => {
    db.result = { data: null, error: { message: 'permission denied' } }

    await expect(
      replaceOwnLinks('user-1', [{ platform: 'github', handle: 'someone' }]),
    ).rejects.toThrow('permission denied')
  })

  it('reads its own links by user', async () => {
    db.result = { data: [{ platform: 'github', handle: 'someone' }], error: null }

    await expect(fetchOwnLinks('user-1')).resolves.toHaveLength(1)
    expect(db.lastTable).toBe('profile_links')
    expect(db.lastFilters).toEqual({ user_id: 'user-1' })
  })
})

describe('publishing the profile picture (D71)', () => {
  /**
   * **The browser never sends an image**, and that is the assertion. It sends a
   * boolean to a function that fetches the bytes itself from a named Google host
   * and writes them with the service-role key — which is why `profiles.avatar`
   * is absent from the update grant and why this site has no upload path (S10).
   */
  it('asks the Edge Function to store, and sends no image', async () => {
    db.invokeResult = { data: { avatar: 'data:image/jpeg;base64,AAAA', stored: true }, error: null }

    await expect(setAvatarPublished(true)).resolves.toBe('data:image/jpeg;base64,AAAA')

    expect(db.lastInvoke).toEqual({
      name: 'avatar',
      options: { method: 'POST', body: { store: true } },
    })
  })

  it('withdraws it with the same call and the opposite flag', async () => {
    db.invokeResult = { data: { avatar: null, stored: false }, error: null }

    await expect(setAvatarPublished(false)).resolves.toBeNull()
    expect((db.lastInvoke?.options as { body: unknown }).body).toEqual({ store: false })
  })

  /**
   * A Google account with no picture answers 204, which arrives as no error and
   * no body. That is not a failure and must not be reported as one: the switch
   * simply stays off, because the column is still null.
   */
  it('reads "there is no picture" as null rather than as an error', async () => {
    db.invokeResult = { data: null, error: null }

    await expect(setAvatarPublished(true)).resolves.toBeNull()
  })

  it('throws when the function itself failed', async () => {
    db.invokeResult = { data: null, error: { message: 'not configured' } }

    await expect(setAvatarPublished(true)).rejects.toThrow('not configured')
  })
})
