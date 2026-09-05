import type { Catalog, BrowseModel } from '../catalog/schema.ts'
import {
  applyFilters,
  facetsFor,
  sortModels,
  type Facet,
  type Filters,
  type SortKey,
} from '../catalog/filters.ts'
import type { CollectionItem, CollectionStatus } from './api.ts'

/**
 * §6.5 — **the client-side join, and the one place a user's row can outlive the
 * catalogue entry it points at.**
 *
 * D1 put the catalogue in a file and the collection in Postgres, so there is no
 * SQL join to do this and never will be. What that buys is browsing that works
 * with the database asleep; what it costs is exactly this function, and FR-6.5
 * is the requirement that names the cost: a `model_id` with nothing to join to
 * is **not dropped**. It is the failure mode D1 accepts, it is handled here and
 * nowhere else, and the thing it must never do is quietly shorten somebody's
 * collection by one watch.
 */

export interface CollectionEntry {
  item: CollectionItem
  /**
   * FR-6.5 — absent when the catalogue no longer lists the id. A tombstoned
   * model is *not* this case: D2 keeps it published and reachable forever, so it
   * joins normally and carries its own notice (FR-3.6). This is the data error —
   * or a catalogue rolled back past a reference somebody had already marked.
   */
  model: BrowseModel | undefined
}

/**
 * A Map rather than `models.find` per row. A collection of four hundred against
 * a catalogue of five hundred is two hundred thousand comparisons done the
 * obvious way, on the phone §2.2 says is the real device.
 *
 * `catalog.models` is used whole and deliberately **not** through `browsable()`:
 * that filter exists to keep tombstones out of grids, and a tombstone the user
 * has marked is precisely what FR-3.6 promises stays reachable.
 */
export function joinCollection(
  catalog: Catalog,
  items: readonly CollectionItem[],
): CollectionEntry[] {
  const byId = new Map(catalog.models.map((model) => [model.id, model]))
  return items.map((item) => ({ item, model: byId.get(item.model_id) }))
}

export function entriesWithStatus(
  entries: readonly CollectionEntry[],
  status: CollectionStatus,
): CollectionEntry[] {
  return entries.filter((entry) => entry.item.status === status)
}

/** The models behind the entries, for anything that reads a catalogue view. */
export function modelsOf(entries: readonly CollectionEntry[]): BrowseModel[] {
  return entries.flatMap((entry) => (entry.model ? [entry.model] : []))
}

/**
 * FR-6.2 — "the same year/feature filters **scoped to what the user holds**".
 *
 * Scoped is the operative word and it is what makes D26's density rule do
 * something useful here: a collector holding nine watches, six of them dated,
 * gets a year control; the same rule over the whole catalogue would be answering
 * a question about somebody else's watches.
 */
export function facetsForEntries(entries: readonly CollectionEntry[]): Facet[] {
  return facetsFor(modelsOf(entries))
}

/**
 * FR-6.2 and FR-6.5 meeting, and the corner where they pull against each other.
 *
 * An unlisted entry carries no year, no movement and no features, so it cannot
 * be said to match a filter over any of them — and it is dropped by an active
 * one, exactly as a model missing that field is dropped in the catalogue
 * (`applyFilters`). That is not the silent loss FR-6.5 forbids: with no filter
 * on it is always shown, it is always counted in the tab label, and a filtered
 * grid is a subset the reader asked for. Showing it regardless would be the
 * other kind of lie — a watch with no year answering a request for 1989.
 */
export function filterEntries(
  entries: readonly CollectionEntry[],
  filters: Filters,
  hasFilters: boolean,
): CollectionEntry[] {
  if (!hasFilters) return [...entries]

  const kept = new Set(applyFilters(modelsOf(entries), filters).map((model) => model.id))
  return entries.filter((entry) => entry.model !== undefined && kept.has(entry.model.id))
}

/**
 * FR-6.2's fourth order plus the catalogue's three.
 *
 * *Date added* sorts on `created_at`, which is the row's and not the watch's —
 * the reason `sortModels` cannot do this and the reason the collection sorts
 * entries. The tie-break is the model id rather than nothing: two watches marked
 * in the same request share a timestamp to the millisecond, and an unstable
 * order there means a grid that reshuffles itself on every refetch.
 *
 * **An unlisted entry sorts last** under the catalogue orders rather than being
 * dropped — it has no reference to order by, and the front of the grid is not
 * where a data error belongs.
 */
export function sortEntries(
  entries: readonly CollectionEntry[],
  sort: SortKey,
): CollectionEntry[] {
  if (sort === 'added') {
    return [...entries].sort(
      (a, b) =>
        b.item.created_at.localeCompare(a.item.created_at) ||
        a.item.model_id.localeCompare(b.item.model_id),
    )
  }

  const order = new Map(sortModels(modelsOf(entries), sort).map((model, index) => [model.id, index]))
  return [...entries].sort((a, b) => {
    const left = a.model ? (order.get(a.model.id) ?? 0) : Number.MAX_SAFE_INTEGER
    const right = b.model ? (order.get(b.model.id) ?? 0) : Number.MAX_SAFE_INTEGER
    return left - right || a.item.model_id.localeCompare(b.item.model_id)
  })
}

/** The one call the collection screen makes, in the order the grid renders. */
export function viewEntries(
  entries: readonly CollectionEntry[],
  filters: Filters,
  hasFilters: boolean,
  sort: SortKey,
): CollectionEntry[] {
  return sortEntries(filterEntries(entries, filters, hasFilters), sort)
}
