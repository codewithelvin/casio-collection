import { describe, expect, it } from 'vitest'
import {
  activeFilters,
  applyFilters,
  applyViewState,
  DEFAULT_SORT,
  facetsFor,
  hasActiveFilters,
  NO_FILTERS,
  parseViewState,
  sortModels,
  toggleFilter,
  UNKNOWN_YEAR,
  writeViewState,
  type Filters,
} from './filters.ts'
import type { PublishedModel } from './schema.ts'

const model = (overrides: Partial<PublishedModel>): PublishedModel => ({
  id: 'x-1',
  ref: 'X-1',
  line: 'vintage',
  series: 'x',
  source: { url: 'https://example.com/x-1', kind: 'community' },
  ...overrides,
})

/** `count` models, `withField` of which carry `movement` — the density dial. */
const cohort = (count: number, withField: number): PublishedModel[] =>
  Array.from({ length: count }, (_, i) =>
    model({
      id: `x-${i + 1}`,
      ref: `X-${i + 1}`,
      ...(i < withField ? { movement: 'quartz' as const } : {}),
    }),
  )

const filters = (overrides: Partial<Filters> = {}): Filters => ({ ...NO_FILTERS, ...overrides })
const fieldsOf = (models: PublishedModel[]) => facetsFor(models).map((facet) => facet.field)

describe('facet density (D26, FR-1.3a)', () => {
  it('hides a facet at 59% and shows it at 60%', () => {
    // The threshold is the decision, so the test is written on both sides of it
    // rather than somewhere comfortably clear of it.
    expect(fieldsOf(cohort(100, 59))).not.toContain('movement')
    expect(fieldsOf(cohort(100, 60))).toContain('movement')
  })

  it('measures density over the view, never over the catalogue', () => {
    // D26's other half, and the one that does the work: movement sits at 30%
    // across the real catalogue and at 100% inside F-91W. Same field, same
    // build, different answer — because the question is about what is on screen.
    const sparseLine = [...cohort(10, 3)]
    const denseSeries = sparseLine.filter((candidate) => candidate.movement !== undefined)

    expect(fieldsOf(sparseLine)).not.toContain('movement')
    expect(fieldsOf(denseSeries)).toContain('movement')
  })

  it('exempts year from the threshold but not from having a year (D26, D5)', () => {
    // One dated watch in ten is 10% coverage and the facet still shows, because
    // the Unknown year option buys the honesty the threshold buys elsewhere.
    const barelyDated = [model({ id: 'a', ref: 'A-1', year: 1989 }), ...cohort(9, 0)]
    expect(fieldsOf(barelyDated)).toContain('year')

    // …but a view where nobody has a year would offer one option selecting
    // everything, which is a control that cannot change what you see.
    expect(fieldsOf(cohort(10, 0))).not.toContain('year')
  })

  it('offers Unknown year only where something is actually undated', () => {
    const allDated = [
      model({ id: 'a', ref: 'A-1', year: 1989 }),
      model({ id: 'b', ref: 'B-1', year: 2003 }),
    ]
    const years = facetsFor(allDated).find((facet) => facet.field === 'year')
    expect(years?.options.map((option) => option.value)).toEqual(['2003', '1989'])

    const mixed = [...allDated, model({ id: 'c', ref: 'C-1' })]
    const withUnknown = facetsFor(mixed).find((facet) => facet.field === 'year')
    expect(withUnknown?.options.at(-1)).toEqual({ value: UNKNOWN_YEAR, count: 1 })
  })

  it('treats an empty feature list as nobody having looked', () => {
    const models = [
      model({ id: 'a', ref: 'A-1', features: [] }),
      model({ id: 'b', ref: 'B-1', features: [] }),
      model({ id: 'c', ref: 'C-1', features: ['alarm'] }),
    ]
    expect(fieldsOf(models)).not.toContain('features')
  })

  it('builds nothing at all from an empty view', () => {
    expect(facetsFor([])).toEqual([])
  })

  it('counts every value in view, and orders them so the common one leads', () => {
    const models = [
      model({ id: 'a', ref: 'A-1', display: 'digital' }),
      model({ id: 'b', ref: 'B-1', display: 'digital' }),
      model({ id: 'c', ref: 'C-1', display: 'analog' }),
    ]
    const display = facetsFor(models).find((facet) => facet.field === 'display')
    expect(display?.options).toEqual([
      { value: 'digital', count: 2 },
      { value: 'analog', count: 1 },
    ])
    expect(display?.coverage).toBe(1)
  })
})

describe('filtering (FR-1.3)', () => {
  const models = [
    model({
      id: 'a',
      ref: 'A-1',
      year: 1989,
      display: 'digital',
      features: ['alarm', 'stopwatch'],
    }),
    model({ id: 'b', ref: 'B-1', year: 2003, display: 'analog', features: ['alarm'] }),
    model({ id: 'c', ref: 'C-1', display: 'digital' }),
  ]
  const ids = (selected: Filters) => applyFilters(models, selected).map((m) => m.id)

  it('returns everything when nothing is selected', () => {
    expect(ids(NO_FILTERS)).toEqual(['a', 'b', 'c'])
  })

  it('reads two years as either, because a watch has one', () => {
    expect(ids(filters({ year: ['1989', '2003'] }))).toEqual(['a', 'b'])
  })

  it('reads two features as both, because a watch has many', () => {
    // Selecting world time and stopwatch and getting every watch with either
    // one reads as the filter not working.
    expect(ids(filters({ features: ['alarm'] }))).toEqual(['a', 'b'])
    expect(ids(filters({ features: ['alarm', 'stopwatch'] }))).toEqual(['a'])
  })

  it('combines across facets with AND', () => {
    expect(ids(filters({ year: ['1989'], display: ['digital'] }))).toEqual(['a'])
    expect(ids(filters({ year: ['1989'], display: ['analog'] }))).toEqual([])
  })

  it('keeps an undated watch reachable through Unknown year and only through it', () => {
    expect(ids(filters({ year: [UNKNOWN_YEAR] }))).toEqual(['c'])
    expect(ids(filters({ year: ['1989'] }))).not.toContain('c')
    expect(ids(filters({ year: ['1989', UNKNOWN_YEAR] }))).toEqual(['a', 'c'])
  })

  it('excludes a watch that simply has no value for the field', () => {
    // Absent is unknown, never a match (D27). A watch with no recorded display
    // is not quietly counted as digital.
    expect(ids(filters({ features: ['alarm'] }))).not.toContain('c')
  })

  it('matches nothing when the combination matches nothing (FR-1.5 is then the UI s job)', () => {
    expect(ids(filters({ year: ['1974'] }))).toEqual([])
  })
})

describe('sorting (FR-1.4)', () => {
  const models = [
    model({ id: 'b', ref: 'B-1', year: 2003 }),
    model({ id: 'c', ref: 'C-1' }),
    model({ id: 'a', ref: 'A-1', year: 1989 }),
    model({ id: 'd', ref: 'D-1' }),
  ]
  const order = (sort: Parameters<typeof sortModels>[1]) =>
    sortModels(models, sort).map((m) => m.id)

  it('defaults to reference A→Z', () => {
    expect(DEFAULT_SORT).toBe('ref')
    expect(order('ref')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('puts undated watches last in both year directions, never first', () => {
    // The one rule that spans both orders. Undated-first would open the
    // oldest-first view of a Vintage series on the watches nobody has dated,
    // which reads as an odd order rather than as a fault.
    expect(order('year-desc')).toEqual(['b', 'a', 'c', 'd'])
    expect(order('year-asc')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('breaks a tie on the reference, so the order is stable across reloads', () => {
    const sameYear = [
      model({ id: 'z', ref: 'Z-1', year: 1989 }),
      model({ id: 'a', ref: 'A-1', year: 1989 }),
    ]
    expect(sortModels(sameYear, 'year-desc').map((m) => m.id)).toEqual(['a', 'z'])
  })

  it('leaves the input array alone', () => {
    const input = [...models]
    sortModels(input, 'year-asc')
    expect(input.map((m) => m.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('the view state in the URL (FR-1.6)', () => {
  it('round-trips a full state', () => {
    const state = {
      filters: filters({ year: ['1989', UNKNOWN_YEAR], features: ['alarm'] }),
      sort: 'year-desc' as const,
    }
    const params = writeViewState(new URLSearchParams(), state)
    expect(params.toString()).toBe('year=1989%2Cunknown&features=alarm&sort=year-desc')
    expect(parseViewState(params)).toEqual(state)
  })

  it('leaves the URL of an unfiltered grid bare', () => {
    // The URL people actually paste, and the one that has to stay clean.
    const params = writeViewState(new URLSearchParams(), {
      filters: NO_FILTERS,
      sort: DEFAULT_SORT,
    })
    expect(params.toString()).toBe('')
  })

  it('keeps the search term when a filter changes, and the filters when the term does', () => {
    const params = writeViewState(new URLSearchParams('q=f-91w'), {
      filters: filters({ display: ['digital'] }),
      sort: DEFAULT_SORT,
    })
    expect(params.get('q')).toBe('f-91w')
    expect(params.get('display')).toBe('digital')
  })

  it('falls back to the default sort rather than trusting a hand-edited URL', () => {
    expect(parseViewState(new URLSearchParams('sort=price-desc')).sort).toBe(DEFAULT_SORT)
  })

  it('keeps a value the catalogue no longer has, so the empty state can name it', () => {
    // Dropping it silently would show a full grid under a URL that claimed a
    // filter — the reader would have no way to tell which one lied.
    expect(parseViewState(new URLSearchParams('year=1066')).filters.year).toEqual(['1066'])
  })

  it('ignores blanks and repeats in a hand-edited URL', () => {
    expect(parseViewState(new URLSearchParams('features=alarm,,alarm, stopwatch')).filters).toEqual(
      filters({ features: ['alarm', 'stopwatch'] }),
    )
  })

  it('reads an absent query string as an unfiltered default view', () => {
    expect(parseViewState(new URLSearchParams())).toEqual({
      filters: NO_FILTERS,
      sort: DEFAULT_SORT,
    })
  })
})

describe('the chips above the grid (FR-1.3)', () => {
  it('lists every active selection in facet order', () => {
    expect(activeFilters(filters({ features: ['alarm'], year: ['1989'] }))).toEqual([
      { field: 'year', value: '1989' },
      { field: 'features', value: 'alarm' },
    ])
  })

  it('knows when there is nothing to clear', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false)
    expect(hasActiveFilters(filters({ year: ['1989'] }))).toBe(true)
  })

  it('toggles a value on and back off without disturbing the others', () => {
    const one = toggleFilter(NO_FILTERS, 'year', '1989')
    expect(one.year).toEqual(['1989'])

    const two = toggleFilter(one, 'display', 'digital')
    expect(toggleFilter(two, 'year', '1989')).toEqual(filters({ display: ['digital'] }))
  })
})

describe('the grid, filtered and ordered', () => {
  it('filters first and sorts what is left', () => {
    const models = [
      model({ id: 'a', ref: 'A-1', year: 1989, display: 'digital' }),
      model({ id: 'b', ref: 'B-1', year: 2003, display: 'digital' }),
      model({ id: 'c', ref: 'C-1', year: 1995, display: 'analog' }),
    ]
    const shown = applyViewState(models, {
      filters: filters({ display: ['digital'] }),
      sort: 'year-desc',
    })
    expect(shown.map((m) => m.id)).toEqual(['b', 'a'])
  })
})
