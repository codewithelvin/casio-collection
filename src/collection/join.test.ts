import { describe, expect, it } from 'vitest'
import { catalogFixture } from '../test/catalogFixture'
import { NO_FILTERS } from '../catalog/filters.ts'
import {
  entriesWithStatus,
  facetsForEntries,
  filterEntries,
  joinCollection,
  modelsOf,
  sortEntries,
  viewEntries,
} from './join.ts'
import type { CollectionItem } from './api.ts'

/**
 * §13.1 — "the client-side join (§6.5), **including the missing-model path
 * (FR-6.5), which is the one that silently loses a user's watch if it breaks**".
 *
 * That sentence is why this file exists. Every other fault here shows itself;
 * a dropped row does not, because nobody counts their own collection.
 */

const item = (over: Partial<CollectionItem> = {}): CollectionItem => ({
  model_id: 'ga-2100-1a1',
  status: 'owned',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('joining rows to the catalogue (§6.5)', () => {
  it('pairs each row with its model', () => {
    const entries = joinCollection(catalogFixture, [item(), item({ model_id: 'f-91w-1' })])

    expect(entries.map((entry) => entry.model?.ref)).toEqual(['GA-2100-1A1', 'F-91W-1'])
  })

  /**
   * FR-6.5, and the assertion this whole file is for. The row is kept, the
   * model is absent, and the count is unchanged — a collection that returns
   * two watches when three were marked is the one fault here that destroys
   * trust in all of it and is never reported.
   */
  it('keeps a row the catalogue no longer carries', () => {
    const entries = joinCollection(catalogFixture, [
      item(),
      item({ model_id: 'withdrawn-reference' }),
    ])

    expect(entries).toHaveLength(2)
    expect(entries[1]?.model).toBeUndefined()
    expect(entries[1]?.item.model_id).toBe('withdrawn-reference')
  })

  it('preserves the order the rows arrived in', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'f-91w-1' }),
      item({ model_id: 'nope' }),
      item({ model_id: 'ga-2100-1a1' }),
    ])

    expect(entries.map((entry) => entry.item.model_id)).toEqual([
      'f-91w-1',
      'nope',
      'ga-2100-1a1',
    ])
  })

  it('splits by status without losing anything (FR-6.1)', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'f-91w-1', status: 'owned' }),
      item({ model_id: 'ga-2100-1a1', status: 'wishlist' }),
      item({ model_id: 'gone', status: 'owned' }),
    ])

    expect(entriesWithStatus(entries, 'owned')).toHaveLength(2)
    expect(entriesWithStatus(entries, 'wishlist')).toHaveLength(1)
  })

  it('drops the unlisted rows when asked for models, and only then', () => {
    const entries = joinCollection(catalogFixture, [item(), item({ model_id: 'gone' })])

    expect(modelsOf(entries)).toHaveLength(1)
    expect(entries).toHaveLength(2)
  })
})

describe('filters scoped to what is held (FR-6.2)', () => {
  it('builds the facets from the held models, not the catalogue', () => {
    const entries = joinCollection(catalogFixture, [item({ model_id: 'f-91w-1' })])
    const fields = facetsForEntries(entries).map((facet) => facet.field)

    // F-91W-1 carries a year and a display, so those earn their place at 100%
    // coverage over a view of one — which is D26 measuring the view rather than
    // the catalogue, and is the whole reason the rule is written that way.
    expect(fields).toContain('year')
    expect(fields).toContain('display')
  })

  it('returns everything when nothing is selected', () => {
    const entries = joinCollection(catalogFixture, [item(), item({ model_id: 'gone' })])

    expect(filterEntries(entries, NO_FILTERS, false)).toHaveLength(2)
  })

  /**
   * The corner where FR-6.2 and FR-6.5 pull against each other. An unlisted row
   * carries no year, so it cannot answer a request for 1989 — and letting it
   * through would be a different lie from the one FR-6.5 forbids. Unfiltered it
   * is always there, and the tab count never moves.
   */
  it('excludes an unlisted row from an active filter', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'f-91w-1' }),
      item({ model_id: 'gone' }),
    ])

    const filtered = filterEntries(entries, { ...NO_FILTERS, year: ['1989'] }, true)

    expect(filtered.map((entry) => entry.item.model_id)).toEqual(['f-91w-1'])
  })
})

describe('ordering (FR-6.2)', () => {
  it('puts the most recently added first by default', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'f-91w-1', created_at: '2026-01-01T00:00:00.000Z' }),
      item({ model_id: 'ga-2100-1a1', created_at: '2026-08-01T00:00:00.000Z' }),
      item({ model_id: 'dw-5600e-1v', created_at: '2026-04-01T00:00:00.000Z' }),
    ])

    expect(sortEntries(entries, 'added').map((entry) => entry.item.model_id)).toEqual([
      'ga-2100-1a1',
      'dw-5600e-1v',
      'f-91w-1',
    ])
  })

  /**
   * Two watches marked in one request share a timestamp to the millisecond. With
   * no tie-break the order is whatever the sort happened to do, and the grid
   * reshuffles itself on every refetch for no reason the reader can see.
   */
  it('breaks a shared timestamp on the id, so the order is stable', () => {
    const same = '2026-08-01T00:00:00.000Z'
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'ga-2100-1a1', created_at: same }),
      item({ model_id: 'dw-5600e-1v', created_at: same }),
    ])

    const once = sortEntries(entries, 'added').map((entry) => entry.item.model_id)
    const twice = sortEntries([...entries].reverse(), 'added').map((entry) => entry.item.model_id)

    expect(once).toEqual(twice)
  })

  it('honours the catalogue orders too', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'ga-2100-1a1' }),
      item({ model_id: 'dw-5600e-1v' }),
    ])

    expect(sortEntries(entries, 'ref').map((entry) => entry.model?.ref)).toEqual([
      'DW-5600E-1V',
      'GA-2100-1A1',
    ])
  })

  /** It has no reference to order by, and the front of a grid is not where a
   *  data error belongs — but it is still there, which is the requirement. */
  it('sorts an unlisted row last rather than dropping it', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'aaa-gone' }),
      item({ model_id: 'ga-2100-1a1' }),
    ])

    expect(sortEntries(entries, 'ref').map((entry) => entry.item.model_id)).toEqual([
      'ga-2100-1a1',
      'aaa-gone',
    ])
  })
})

describe('the one call the screen makes', () => {
  it('filters then orders', () => {
    const entries = joinCollection(catalogFixture, [
      item({ model_id: 'f-91w-1', created_at: '2026-01-01T00:00:00.000Z' }),
      item({ model_id: 'f-91w-3', created_at: '2026-08-01T00:00:00.000Z' }),
      item({ model_id: 'ga-2100-1a1', created_at: '2026-09-01T00:00:00.000Z' }),
    ])

    // 1989 and 2003 are the two F-91W years; GA-2100-1A1 is 2019 and drops out,
    // even though it is the most recently added of the three.
    const shown = viewEntries(entries, { ...NO_FILTERS, year: ['1989', '2003'] }, true, 'added')

    expect(shown.map((entry) => entry.model?.ref)).toEqual(['F-91W-3', 'F-91W-1'])
  })
})
