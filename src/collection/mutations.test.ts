import { describe, expect, it } from 'vitest'
import {
  itemFor,
  needsRemovalConfirmation,
  statusOf,
  withStatus,
  withoutItem,
} from './mutations.ts'
import type { CollectionItem } from './api.ts'

/**
 * §13.1 — the optimistic transforms, which are on D31's list because every one
 * of their failure modes is quiet. None of these throws when it is wrong; it
 * shows the wrong button, or loses a note, and the person who typed the note is
 * the one who finds out.
 */

const item = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  model_id: 'f-91w-1',
  status: 'owned',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

const NOW = '2026-08-17T12:00:00.000Z'

describe('reading a status out of the rows', () => {
  it('finds the row for a model', () => {
    const rows = [item(), item({ model_id: 'dw-5600e-1v', status: 'wishlist' })]
    expect(statusOf(rows, 'dw-5600e-1v')).toBe('wishlist')
    expect(itemFor(rows, 'f-91w-1')?.status).toBe('owned')
  })

  it('is null for a watch that is not held, which is not the same as owned', () => {
    expect(statusOf([item()], 'ga-2100-1a1')).toBeNull()
    expect(itemFor([], 'ga-2100-1a1')).toBeUndefined()
  })
})

describe('marking a watch (FR-4.1)', () => {
  it('adds a row that was not there', () => {
    const rows = withStatus([], 'ga-2100-1a1', 'owned', NOW)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      model_id: 'ga-2100-1a1',
      status: 'owned',
      note: null,
      created_at: NOW,
      updated_at: NOW,
    })
  })

  /**
   * The query reads `created_at desc`, so a new row belongs at the front. If it
   * went to the end the card would sit in one place optimistically and jump to
   * another when the request settled — a correction the user did nothing to
   * cause and cannot explain.
   */
  it('puts a new row first, in the order the server will send it back', () => {
    const existing = item({ model_id: 'f-91w-1' })
    const rows = withStatus([existing], 'ga-2100-1a1', 'owned', NOW)

    expect(rows.map((row) => row.model_id)).toEqual(['ga-2100-1a1', 'f-91w-1'])
  })

  it('does not touch the rows it is not about', () => {
    const other = item({ model_id: 'dw-5600e-1v', status: 'wishlist' })
    const rows = withStatus([other], 'ga-2100-1a1', 'owned', NOW)

    expect(rows[1]).toBe(other)
  })
})

describe('moving a watch from the wishlist (FR-4.5, D8)', () => {
  it('changes the status in place rather than adding a second row', () => {
    const rows = withStatus([item({ status: 'wishlist' })], 'f-91w-1', 'owned', NOW)

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('owned')
  })

  /**
   * The one that would be found by a user and not by a reviewer. A note lives on
   * the row, so a move implemented as delete-then-insert — or as a transform
   * that builds a fresh object — silently destroys what somebody typed. M6 is
   * where notes become editable; this is where the rule has to already hold.
   */
  it('keeps the note and the date the watch was added', () => {
    const held = item({
      status: 'wishlist',
      note: 'The one my father wore.',
      created_at: '2024-03-02T09:00:00.000Z',
    })

    const [moved] = withStatus([held], 'f-91w-1', 'owned', NOW)

    expect(moved?.note).toBe('The one my father wore.')
    expect(moved?.created_at).toBe('2024-03-02T09:00:00.000Z')
    expect(moved?.updated_at).toBe(NOW)
  })
})

describe('removing a mark (FR-4.4)', () => {
  it('drops only that row', () => {
    const rows = withoutItem([item(), item({ model_id: 'dw-5600e-1v' })], 'f-91w-1')

    expect(rows.map((row) => row.model_id)).toEqual(['dw-5600e-1v'])
  })

  it('is a no-op for a model that was not held', () => {
    expect(withoutItem([item()], 'ga-2100-1a1')).toHaveLength(1)
  })

  it('asks before destroying a note on an owned watch', () => {
    expect(needsRemovalConfirmation(item({ status: 'owned', note: 'Bought in Osaka.' }))).toBe(true)
  })

  /**
   * The other half of the requirement, and the half that gets dropped. A
   * confirmation on every removal is a confirmation nobody reads, which makes
   * the one that matters useless too.
   */
  it('does not interrupt when there is nothing to lose', () => {
    expect(needsRemovalConfirmation(item({ status: 'owned', note: null }))).toBe(false)
    expect(needsRemovalConfirmation(item({ status: 'owned', note: '   ' }))).toBe(false)
    expect(needsRemovalConfirmation(item({ status: 'wishlist', note: 'Someday.' }))).toBe(false)
    expect(needsRemovalConfirmation(undefined)).toBe(false)
  })
})
