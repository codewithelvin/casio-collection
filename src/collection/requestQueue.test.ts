import { describe, expect, it } from 'vitest'
import type { BrowseModel } from '../catalog/schema.ts'
import type { CatalogRequestRow } from './api.ts'
import { countByVerdict, groupRequests, normaliseRef } from './requestQueue.ts'

const model = (overrides: Partial<BrowseModel>): BrowseModel => ({
  id: 'x-1',
  ref: 'X-1',
  line: 'vintage',
  series: 'x',
  image: overrides.id ?? 'x-1',
  ...overrides,
})

let nextId = 0
const row = (overrides: Partial<CatalogRequestRow>): CatalogRequestRow => ({
  id: (nextId += 1),
  ref: 'X-1',
  link: null,
  note: null,
  created_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

describe('normalising a reference', () => {
  it('treats one reference typed three ways as one reference', () => {
    const forms = ['GA-2100-1A1', 'ga2100 1a1', 'Ga-2100-1a1']
    expect(new Set(forms.map(normaliseRef)).size).toBe(1)
  })

  /**
   * The rule this is protecting. `A159WA-N1` and `A159W-N1` are different
   * watches whose photographs are byte-identical, which is how this codebase
   * learned that a prefix match publishes the wrong one. Normalising separators
   * is safe; anything looser is a guess wearing an answer's clothes.
   */
  it('does not collapse two references that differ by a character', () => {
    expect(normaliseRef('A159WA-N1')).not.toBe(normaliseRef('A159W-N1'))
  })
})

describe('answering a queued reference against the catalogue', () => {
  /**
   * **The verdict the page exists for.** 511 watches are in the catalogue and
   * withheld from every grid, facet, search result and count because they have
   * no photograph (D63). A visitor searches, finds nothing, and reports it — and
   * a queue that only showed the reference would send somebody to seed an entry
   * that has existed all along.
   */
  it('separates a withheld watch from a missing one', () => {
    const catalog = [model({ id: 'dw-5600-x', ref: 'DW-5600X', image: undefined })]

    const queue = groupRequests(
      [row({ ref: 'DW-5600X' }), row({ ref: 'DW-9999Z' })],
      catalog,
    )

    const withheld = queue.find((entry) => entry.ref === 'DW-5600X')
    const missing = queue.find((entry) => entry.ref === 'DW-9999Z')
    expect(withheld?.verdict).toBe('withheld')
    expect(withheld?.modelId).toBe('dw-5600-x')
    expect(missing?.verdict).toBe('missing')
    expect(missing?.modelId).toBeNull()
  })

  it('reads a visible watch as catalogued, which is a fact about the search', () => {
    const queue = groupRequests([row({ ref: 'GA-2100-1A1' })], [
      model({ id: 'ga-2100-1a1', ref: 'GA-2100-1A1' }),
    ])

    expect(queue[0]?.verdict).toBe('catalogued')
  })

  it('reads a tombstone as withdrawn rather than as missing (D2)', () => {
    const queue = groupRequests([row({ ref: 'X-1' })], [model({ tombstone: { reason: 'withdrawn' } })])

    expect(queue[0]?.verdict).toBe('withdrawn')
  })

  it('matches through separators and case', () => {
    const queue = groupRequests([row({ ref: '  ga2100 1a1 ' })], [
      model({ id: 'ga-2100-1a1', ref: 'GA-2100-1A1' }),
    ])

    expect(queue[0]?.verdict).toBe('catalogued')
  })
})

describe('grouping the queue', () => {
  /**
   * One row is one person, because the unique index is on (user_id, upper(ref)).
   * That is what lets the queue leave `user_id` out of its return entirely and
   * still answer the only question that orders the work.
   */
  it('counts distinct people, not reports', () => {
    const queue = groupRequests(
      [row({ ref: 'GW-M5610' }), row({ ref: 'gw-m5610' }), row({ ref: 'GWM5610' })],
      [],
    )

    expect(queue).toHaveLength(1)
    expect(queue[0]?.askedBy).toBe(3)
  })

  it('puts the most-asked-for reference first', () => {
    const queue = groupRequests(
      [row({ ref: 'ONE' }), row({ ref: 'TWO' }), row({ ref: 'TWO' })],
      [],
    )

    expect(queue.map((entry) => entry.ref)).toEqual(['TWO', 'ONE'])
  })

  it('breaks a tie on recency', () => {
    const queue = groupRequests(
      [
        row({ ref: 'OLD', created_at: '2026-01-01T00:00:00.000Z' }),
        row({ ref: 'NEW', created_at: '2026-09-01T00:00:00.000Z' }),
      ],
      [],
    )

    expect(queue.map((entry) => entry.ref)).toEqual(['NEW', 'OLD'])
  })

  it('shows the most recent spelling and gathers notes newest first', () => {
    const queue = groupRequests(
      [
        row({ ref: 'gw-m5610', note: 'older', created_at: '2026-01-01T00:00:00.000Z' }),
        row({ ref: 'GW-M5610', note: 'newer', created_at: '2026-09-01T00:00:00.000Z' }),
      ],
      [],
    )

    expect(queue[0]?.ref).toBe('GW-M5610')
    expect(queue[0]?.notes).toEqual(['newer', 'older'])
  })

  it('drops empty notes and links but never the row itself', () => {
    const queue = groupRequests(
      [row({ ref: 'X-2', note: '   ', link: '  ' }), row({ ref: 'X-2', link: 'https://a' })],
      [],
    )

    expect(queue[0]?.askedBy).toBe(2)
    expect(queue[0]?.notes).toEqual([])
    expect(queue[0]?.links).toEqual(['https://a'])
  })

  it('does not repeat one link reported twice', () => {
    const queue = groupRequests(
      [row({ ref: 'X-3', link: 'https://a' }), row({ ref: 'X-3', link: 'https://a' })],
      [],
    )

    expect(queue[0]?.links).toEqual(['https://a'])
  })

  /**
   * The field is a free-text input and will contain jokes, emoji and mistakes —
   * the skill says so and says not to research them. It does not say to lose
   * them: a row that normalises to nothing still gets its own line, because a
   * queue quietly reporting itself as shorter than it is is the exact failure
   * this whole page was written to end.
   */
  it('keeps a reference that normalises to nothing', () => {
    const queue = groupRequests([row({ ref: '???' }), row({ ref: '!!!' })], [])

    expect(queue).toHaveLength(2)
    expect(queue.every((entry) => entry.verdict === 'missing')).toBe(true)
  })

  it('reads an empty queue as an empty queue', () => {
    expect(groupRequests([], [model({})])).toEqual([])
    expect(countByVerdict([])).toEqual({ missing: 0, withheld: 0, catalogued: 0, withdrawn: 0 })
  })

  it('counts the four verdicts', () => {
    const catalog = [
      model({ id: 'seen', ref: 'SEEN' }),
      model({ id: 'hidden', ref: 'HIDDEN', image: undefined }),
      model({ id: 'gone', ref: 'GONE', tombstone: { reason: 'withdrawn' } }),
    ]

    const counts = countByVerdict(
      groupRequests(
        [row({ ref: 'SEEN' }), row({ ref: 'HIDDEN' }), row({ ref: 'GONE' }), row({ ref: 'NEW' })],
        catalog,
      ),
    )

    expect(counts).toEqual({ missing: 1, withheld: 1, catalogued: 1, withdrawn: 1 })
  })
})
