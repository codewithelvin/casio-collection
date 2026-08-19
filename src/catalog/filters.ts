import type { PublishedModel } from './schema.ts'
import { compareByRef } from './client.ts'
import { DENSITY_THRESHOLD, FACET_FIELDS, type FacetField } from './vocabulary.ts'

/**
 * FR-1.3, FR-1.3a, FR-1.4 — what the filter bar is built from, what it does to
 * a grid, and the order the grid comes back in.
 *
 * All of it is pure and none of it knows about React, because every one of
 * these fails **silently** if it is wrong: a facet that hides when it should
 * show looks like a catalogue with less data than it has, and an off-by-one in
 * the null-year sort just looks like an odd order (D31).
 */

/** D5 / D25 — the explicit option that keeps an undated watch reachable. */
export const UNKNOWN_YEAR = 'unknown'

/** FR-1.4 — the orders a catalogue grid offers. */
export const SORTS = ['ref', 'year-desc', 'year-asc'] as const

/**
 * FR-6.2 — the collection offers one more, and **only the collection**.
 *
 * *Date added* is a fact about a row in `collection_items`, not about a watch,
 * so it is meaningless on a series page and is deliberately not in `SORTS`.
 * Which vocabulary applies is the screen's to declare (`useViewState` takes it),
 * which is what keeps `?sort=added` on a catalogue URL from parsing into an
 * order that silently means something else.
 */
export const COLLECTION_SORTS = ['added', 'ref', 'year-desc', 'year-asc'] as const

export type SortKey = (typeof COLLECTION_SORTS)[number]

/** FR-1.4 — reference A→Z, which is the order a collector reads a series in. */
export const DEFAULT_SORT: SortKey = 'ref'
/** FR-6.2 — newest first, because the collection is a record of what you did. */
export const DEFAULT_COLLECTION_SORT: SortKey = 'added'

export type Filters = Record<FacetField, string[]>

export const NO_FILTERS: Filters = {
  year: [],
  discontinued: [],
  display: [],
  movement: [],
  features: [],
}

export interface ViewState {
  filters: Filters
  sort: SortKey
}

export interface FacetOption {
  value: string
  count: number
}

export interface Facet {
  field: FacetField
  /** The share of the models in view carrying this field — D26's number. */
  coverage: number
  options: FacetOption[]
}

/**
 * `features` is a list, so "carries this field" means *carries at least one*.
 * An empty array is the same as an absent key: nobody sourced a feature list.
 */
function carries(model: PublishedModel, field: FacetField): boolean {
  if (field === 'features') return (model.features?.length ?? 0) > 0
  return model[field] !== undefined
}

/**
 * `String(value)` is what makes `discontinued` work here without a branch: a
 * boolean facet's values are the strings `'true'` and `'false'`, which is also
 * what lands in the URL and what `applyFilters` compares against. The reader
 * never meets either word — `facetValueLabel` turns them into English.
 */
function valuesOf(model: PublishedModel, field: FacetField): string[] {
  if (field === 'features') return model.features ?? []
  const value = model[field]
  return value === undefined ? [] : [String(value)]
}

/**
 * FR-1.3a / D26 — **the filter bar is built from data at render time, never
 * hard-coded**, and a facet appears only where at least 60% of the models
 * *currently in view* carry it.
 *
 * Density is measured over the view rather than the catalogue, and that is the
 * half that makes it honest rather than merely cautious: movement sits at 30%
 * catalogue-wide today and at 100% inside F-91W, so the facet that would be a
 * lie on the line page is the truth on the series page. A filter over a sparse
 * field is worse than no filter — choosing *Solar* silently hides the 85% whose
 * solar-ness nobody recorded, and the reader takes that absence for a fact.
 *
 * Two rules that are easy to lose:
 *
 * `year` is **exempt from the threshold** (D26) — it earns its place with an
 * explicit *Unknown year* option instead. Exempt from the threshold is not the
 * same as unconditional: where no model in view carries a year at all, the only
 * option would be *Unknown year* selecting everything, and a control that
 * cannot change what you see is noise. So it needs one real year, not 60%.
 *
 * The options are computed over the view **before** any filter is applied. A
 * bar recomputed against its own output narrows to a single option the moment
 * you press one, and then there is no way back to the other years without
 * finding the *Clear all* — the control removing the state it just created.
 */
export function facetsFor(models: readonly PublishedModel[]): Facet[] {
  const total = models.length
  if (total === 0) return []

  const facets: Facet[] = []

  for (const field of FACET_FIELDS) {
    const counts = new Map<string, number>()
    let present = 0

    for (const model of models) {
      if (!carries(model, field)) continue
      present += 1
      for (const value of valuesOf(model, field)) {
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
    }

    const coverage = present / total
    if (counts.size === 0) continue
    if (field !== 'year' && coverage < DENSITY_THRESHOLD) continue

    const options =
      field === 'year'
        ? [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            // Newest first: the year a reader is looking for is far more often
            // the recent one, and the tail of a Casio catalogue is long.
            .sort((a, b) => Number(b.value) - Number(a.value))
        : [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))

    if (field === 'year' && present < total) {
      options.push({ value: UNKNOWN_YEAR, count: total - present })
    }

    facets.push({ field, coverage, options })
  }

  return facets
}

/**
 * FR-1.3 — filters combine. Across facets it is AND; within a facet it depends
 * on the field, and the difference is not an inconsistency:
 *
 * `year`, `display` and `movement` hold **one** value per watch, so two chips
 * can only mean *either* — 1989 and 2003 is a request for both years.
 *
 * `features` holds **many**, so two chips mean *both*. Selecting *world time*
 * and *stopwatch* and getting every watch with either one reads as the filter
 * not working; each additional chip is a narrowing intent.
 */
export function applyFilters(
  models: readonly PublishedModel[],
  filters: Filters,
): PublishedModel[] {
  return models.filter((model) => {
    for (const field of FACET_FIELDS) {
      const selected = filters[field]
      if (selected.length === 0) continue

      if (field === 'features') {
        const owned = new Set<string>(model.features ?? [])
        if (!selected.every((value) => owned.has(value))) return false
        continue
      }

      if (field === 'year' && model.year === undefined) {
        // D5 — an undated watch is not hidden by the year facet, it is reachable
        // through the one option that names its absence.
        if (!selected.includes(UNKNOWN_YEAR)) return false
        continue
      }

      const value = model[field]
      if (value === undefined || !selected.includes(String(value))) return false
    }
    return true
  })
}

/**
 * FR-1.4 — three orders, and one rule that spans two of them: **models with no
 * year sort last in both year directions, never first.**
 *
 * That rule is the entire reason this is a tested function. `undefined` in a
 * numeric comparator is not a small bug — under ascending order every undated
 * watch would lead the grid, so the oldest-first view of a Vintage series would
 * open on the watches nobody has dated. It reads as an odd order rather than as
 * a fault, which is exactly how it survives a click-through.
 */
export function sortModels(models: readonly PublishedModel[], sort: SortKey): PublishedModel[] {
  const sorted = [...models]

  // A bare model carries no date added — that lives on the collection row. The
  // collection sorts *entries* rather than models (`collection/join.ts`), so
  // this branch is only reachable if a screen ever offers `added` without the
  // rows to honour it, and reference order is the honest answer to that.
  if (sort === 'ref' || sort === 'added') return sorted.sort(compareByRef)

  const direction = sort === 'year-desc' ? -1 : 1
  return sorted.sort((a, b) => {
    if (a.year === undefined && b.year === undefined) return compareByRef(a, b)
    if (a.year === undefined) return 1
    if (b.year === undefined) return -1
    return direction * (a.year - b.year) || compareByRef(a, b)
  })
}

/** The grid, filtered and ordered — the one call every browsing screen makes. */
export function applyViewState(
  models: readonly PublishedModel[],
  state: ViewState,
): PublishedModel[] {
  return sortModels(applyFilters(models, state.filters), state.sort)
}

/** FR-1.3's chips: every active selection, in facet order, as the bar shows them. */
export function activeFilters(filters: Filters): { field: FacetField; value: string }[] {
  return FACET_FIELDS.flatMap((field) => filters[field].map((value) => ({ field, value })))
}

export function hasActiveFilters(filters: Filters): boolean {
  return FACET_FIELDS.some((field) => filters[field].length > 0)
}

export function toggleFilter(filters: Filters, field: FacetField, value: string): Filters {
  const selected = filters[field]
  return {
    ...filters,
    [field]: selected.includes(value)
      ? selected.filter((candidate) => candidate !== value)
      : [...selected, value],
  }
}

/* ------------------------------------------------------------------------- *
 * FR-1.6 — the URL is where this state lives (§7.2), and these two functions
 * are the whole of it. They are pure and tested for the same reason the rest of
 * this file is: a view that cannot be reloaded is not a bug anyone reports, it
 * is a link that quietly opens the wrong page.
 * ------------------------------------------------------------------------- */

const SEPARATOR = ','

function isSort(value: string | null, allowed: readonly SortKey[]): value is SortKey {
  return value !== null && (allowed as readonly string[]).includes(value)
}

/**
 * Unknown values are **kept, not dropped**. A year the catalogue no longer has
 * still belongs in the state, because FR-1.5 then renders an empty state naming
 * the filter responsible — which is a readable answer, where silently deleting
 * the parameter would show a full grid and a URL that lied about it.
 */
export function parseViewState(
  params: URLSearchParams,
  allowed: readonly SortKey[] = SORTS,
  fallback: SortKey = DEFAULT_SORT,
): ViewState {
  const read = (field: FacetField): string[] => {
    const raw = params.get(field)
    if (!raw) return []
    return [
      ...new Set(
        raw
          .split(SEPARATOR)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ]
  }

  const sort = params.get('sort')

  return {
    filters: {
      year: read('year'),
      // D59 — `?discontinued=true` and `?discontinued=false`. The parameter is
      // the field name, as every other facet's is, and an unrecognised value is
      // kept for the same reason a vanished year is: FR-1.5 naming the filter
      // that emptied the grid is readable, and silently dropping it is a URL
      // that lied.
      discontinued: read('discontinued'),
      display: read('display'),
      movement: read('movement'),
      features: read('features'),
    },
    sort: isSort(sort, allowed) ? sort : fallback,
  }
}

/**
 * Writes the state back over an existing `URLSearchParams`, so the search term
 * on `/search?q=` survives a filter change and vice versa. An empty facet and
 * the default sort are **removed** rather than written empty: the URL of an
 * unfiltered grid is the bare path, which is the one people paste.
 */
export function writeViewState(
  params: URLSearchParams,
  state: ViewState,
  fallback: SortKey = DEFAULT_SORT,
): URLSearchParams {
  const next = new URLSearchParams(params)

  for (const field of FACET_FIELDS) {
    const selected = state.filters[field]
    if (selected.length === 0) next.delete(field)
    else next.set(field, selected.join(SEPARATOR))
  }

  // The screen's own default is what gets omitted, not the catalogue's — on
  // `/collection` the bare path means *recently added*, and writing `?sort=added`
  // into it would put a parameter in every link that changes nothing.
  if (state.sort === fallback) next.delete('sort')
  else next.set('sort', state.sort)

  return next
}
