import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCollection, putCollectionItem, removeCollectionItem } from './api.ts'
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
    lastFilters: {} as Record<string, unknown>,
    lastPayload: null as unknown,
    lastOnConflict: undefined as string | undefined,
  }

  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {}
    chain['select'] = vi.fn(() => chain)
    chain['order'] = vi.fn(() => chain)
    chain['eq'] = vi.fn((column: string, value: unknown) => {
      db.lastFilters[column] = value
      return chain
    })
    chain['then'] = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(db.result).then(resolve, reject)

    chain['upsert'] = vi.fn((payload: unknown, options?: { onConflict?: string }) => {
      db.lastPayload = payload
      db.lastOnConflict = options?.onConflict
      return Promise.resolve(db.result)
    })

    chain['delete'] = vi.fn(() => chain)
    return chain
  })

  return { db, createClient: vi.fn(() => ({ auth: {}, from })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
  db.result = { data: [], error: null }
  db.lastFilters = {}
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
