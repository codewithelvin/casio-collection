import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  CATALOG,
  type Catalog,
  type PublishedFamily,
  type PublishedLine,
  type PublishedModel,
  type PublishedSeries,
} from './schema.ts'

/**
 * §7.1 — fetch, parse and cache the published artefact, plus the pure selectors
 * every browsing screen reads it through.
 *
 * The parse is not ceremony. `catalog.json` is a static file on a CDN that an
 * older service worker or a stale edge cache can serve long after its shape has
 * moved on, and the difference between a Zod error at load and an undefined
 * field deep in a render is the difference between one designed error state and
 * a white screen. §6.2 says there is exactly one definition of a model; this is
 * the browser end of that sentence.
 */

/**
 * D13 — built from BASE_URL, never a literal. This read `/casio-collection/…`
 * until D39 and the line did not change, which is the only proof the rule was
 * worth having.
 *
 * There is deliberately **no `?v=` cache-buster**. §6.2 makes the version a
 * content digest that lives *inside* the file, so the query string could only be
 * appended after the fetch that needed it. What actually keeps this fresh is
 * Pages' ten-minute `max-age` plus TanStack's `staleTime: Infinity`, which is
 * the right pairing: the browser revalidates on its own schedule and the app
 * never refetches within a session.
 */
export const CATALOG_PATH = `${import.meta.env.BASE_URL}catalog/catalog.json`

export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const response = await fetch(CATALOG_PATH, signal ? { signal } : undefined)
  if (!response.ok) {
    throw new Error(`catalog: HTTP ${response.status} from ${CATALOG_PATH}`)
  }
  return CATALOG.parse(await response.json())
}

/**
 * §7.2 — one query, immutable per version, shared by every screen.
 *
 * The options are separated from the hook because M5 needs the catalogue
 * somewhere a hook cannot go: `/auth/callback` applies a pending press inside an
 * effect and has to name the watch in the toast that confirms it, which means
 * awaiting the data rather than rendering on it. Both paths going through one
 * definition is what stops a second query key existing for the same file — two
 * keys would mean two copies of a 300 KB document in the cache and a screen
 * that refetches what another screen already has.
 */
export const catalogQueryOptions = {
  queryKey: ['catalog'] as const,
  queryFn: ({ signal }: { signal?: AbortSignal }) => fetchCatalog(signal),
}

export function useCatalog(): UseQueryResult<Catalog, Error> {
  return useQuery(catalogQueryOptions)
}

/* ------------------------------------------------------------------------- *
 * Selectors. Pure, so they are tested against a fixture rather than a render.
 * ------------------------------------------------------------------------- */

/**
 * A retired entry is published and reachable forever (FR-3.6) and counted
 * nowhere. Every grid and every count goes through this; `modelById` does not,
 * which is exactly the asymmetry D2 asks for.
 */
export function browsable(models: readonly PublishedModel[]): PublishedModel[] {
  return models.filter((model) => !model.tombstone)
}

/**
 * FR-1.4's default order, A→Z by reference code. `numeric` matters more than it
 * looks: without it `F-103` sorts before `F-15`, because string order compares
 * "0" against "5" and stops there. A collector reading down a series column
 * notices that immediately.
 */
export function compareByRef(a: PublishedModel, b: PublishedModel): number {
  return a.ref.localeCompare(b.ref, 'en', { numeric: true, sensitivity: 'base' })
}

export function lineBySlug(catalog: Catalog, slug: string | undefined): PublishedLine | undefined {
  if (!slug) return undefined
  return catalog.lines.find((line) => line.slug === slug)
}

export function seriesById(
  catalog: Catalog,
  seriesId: string | undefined,
): PublishedSeries | undefined {
  if (!seriesId) return undefined
  return catalog.series.find((series) => series.id === seriesId)
}

export function modelById(catalog: Catalog, id: string | undefined): PublishedModel | undefined {
  if (!id) return undefined
  return catalog.models.find((model) => model.id === id)
}

export function seriesInLine(catalog: Catalog, lineId: string): PublishedSeries[] {
  return catalog.series.filter((series) => series.line === lineId)
}

export function modelsInSeries(catalog: Catalog, seriesId: string): PublishedModel[] {
  return browsable(catalog.models.filter((model) => model.series === seriesId)).sort(compareByRef)
}

export function modelsInLine(catalog: Catalog, lineId: string): PublishedModel[] {
  return browsable(catalog.models.filter((model) => model.line === lineId)).sort(compareByRef)
}

/** FR-3.4 — the strip on a watch page, which excludes the watch you are on. */
export function otherModelsInSeries(catalog: Catalog, model: PublishedModel): PublishedModel[] {
  return modelsInSeries(catalog, model.series).filter((other) => other.id !== model.id)
}

/**
 * §8.4's three rules about families, in one place because all three are about
 * the same thing: a heading has to earn its row.
 *
 * A family holding fewer than two series is not rendered as a heading and its
 * series fall through to the ungrouped list, so collapsing every family still
 * leaves every series reachable — which is the rule that makes the family safe
 * to keep out of the URL (D32).
 */
export interface LineTree {
  families: { family: PublishedFamily; series: PublishedSeries[] }[]
  ungrouped: PublishedSeries[]
}

export function lineTree(catalog: Catalog, lineId: string): LineTree {
  const series = seriesInLine(catalog, lineId)
  const families: LineTree['families'] = []
  const grouped = new Set<string>()

  for (const family of catalog.families.filter((candidate) => candidate.line === lineId)) {
    const members = series.filter((candidate) => candidate.family === family.id)
    if (members.length < 2) continue
    families.push({ family, series: members })
    for (const member of members) grouped.add(member.id)
  }

  return { families, ungrouped: series.filter((candidate) => !grouped.has(candidate.id)) }
}

/**
 * §8.6 / NFR-7 — the card and the detail page read images through this so the
 * `@2x` convention lives in one place. `catalog:images` writes `<id>.webp` at
 * 400 px and `<id>@2x.webp` at 800 px, and a model with no photograph returns
 * nothing at all rather than a path that 404s.
 */
export function imageSources(image: string | undefined): { src: string; srcSet: string } | null {
  if (!image) return null
  const base = `${import.meta.env.BASE_URL}img/models/${image}`
  return { src: `${base}.webp`, srcSet: `${base}.webp 1x, ${base}@2x.webp 2x` }
}
