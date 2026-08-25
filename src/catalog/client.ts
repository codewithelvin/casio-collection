import { useQuery, type UseQueryResult } from '@tanstack/react-query'
// **Types only, and that is enforced by `import type`.** §12 — this module is in
// the entry chunk, and `schema.ts` is Zod: a value import here would put 174 KB
// unminified of it in the first load of every URL on the site. The schemas are
// reached through `./parse.ts`, dynamically, beside the fetch they validate.
import type {
  Catalog,
  CatalogIndex,
  PublishedEdition,
  PublishedFamily,
  PublishedLine,
  PublishedModel,
  PublishedSeries,
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

/**
 * §6.2's split, first leg — **the file a page reads when it needs the shape of
 * the catalogue and not a watch in it.**
 *
 * The trigger for this was written down before it was reached: §6.2 says the
 * split is reopened at 250 KB gzipped or 2 500 models, and `report.ts` prints
 * both numbers on every build. The catalogue passed 2 500 at 2 832 models, and
 * the cost had already landed where §6.2 predicted — the front door renders
 * seven cards and the rail 328 rows, and both were waiting on 1.7 MB of
 * specifications for references neither of them names. Measured at PSI's 4×
 * throttle: 105 KB gzipped to download, then a 2.4 MB `JSON.parse` and a Zod
 * pass over 2 832 models, all of it before the first card appeared.
 *
 * This is the index leg only. Per-series files and a slim search index are the
 * other two and are **not** built: everything that genuinely needs a model still
 * loads the whole catalogue, off the critical path.
 */
export const CATALOG_INDEX_PATH = `${import.meta.env.BASE_URL}catalog/catalog-index.json`

export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  // The schemas and the document are fetched concurrently, which is what makes
  // the dynamic import cost nothing: 2.4 MB of JSON is always slower to arrive
  // than the chunk that validates it.
  const [response, { parseCatalog }] = await Promise.all([
    fetch(CATALOG_PATH, signal ? { signal } : undefined),
    import('./parse.ts'),
  ])
  if (!response.ok) {
    throw new Error(`catalog: HTTP ${response.status} from ${CATALOG_PATH}`)
  }
  return parseCatalog(await response.json())
}

/**
 * The index is parsed with the same rigour as the catalogue, and that is
 * affordable for the reason the split exists: 343 objects rather than 3 175. The
 * argument in this module's header — a Zod error at load beats an undefined field
 * deep in a render — does not get weaker on the file that arrives first.
 *
 * **It takes no `AbortSignal`.** The catalogue's exists because M5 awaits that
 * query outside a hook and needs to be able to walk away from it; this one is
 * read by the shell on every page and there is nowhere for it to be cancelled
 * from. An argument nothing passes is an argument that will be passed wrongly.
 */
export async function fetchCatalogIndex(): Promise<CatalogIndex> {
  // Concurrent, for the reason `fetchCatalog` gives — and it matters more here,
  // because this is the fetch the shell waits for on every URL. Awaiting the
  // import first would put a second round trip in front of the first paint.
  const [response, { parseCatalogIndex }] = await Promise.all([
    fetch(CATALOG_INDEX_PATH),
    import('./parse.ts'),
  ])
  if (!response.ok) {
    throw new Error(`catalog: HTTP ${response.status} from ${CATALOG_INDEX_PATH}`)
  }
  return parseCatalogIndex(await response.json())
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

/**
 * `enabled` is here for exactly one caller and it is worth naming which:
 * `SearchField`, which is mounted in the shell on every URL and needs the
 * catalogue only once somebody touches it. Every screen that renders watches
 * leaves it alone and gets the fetch on mount, which is what it wants.
 */
export function useCatalog(options?: { enabled?: boolean }): UseQueryResult<Catalog, Error> {
  return useQuery({ ...catalogQueryOptions, enabled: options?.enabled ?? true })
}

/**
 * A **second key, deliberately**, and the paragraph above says two keys for one
 * file would be a mistake. They are two files: this one holds no models, so
 * nothing is stored twice and neither query can serve the other's readers.
 *
 * Both are `staleTime: Infinity` under the same version digest, so a page that
 * reads the index and then navigates to one that needs a model pays for the
 * catalogue once and never again for the session.
 */
export const catalogIndexQueryOptions = {
  queryKey: ['catalog-index'] as const,
  queryFn: () => fetchCatalogIndex(),
}

export function useCatalogIndex(): UseQueryResult<CatalogIndex, Error> {
  return useQuery(catalogIndexQueryOptions)
}

/* ------------------------------------------------------------------------- *
 * Selectors. Pure, so they are tested against a fixture rather than a render.
 *
 * Everything that reads only lines, families or series is typed against
 * `CatalogIndex`. `Catalog` satisfies it structurally, so each of these reads
 * either artefact and a screen holding the whole catalogue calls exactly the
 * function a screen holding the index does.
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

export function lineBySlug(
  catalog: CatalogIndex,
  slug: string | undefined,
): PublishedLine | undefined {
  if (!slug) return undefined
  return catalog.lines.find((line) => line.slug === slug)
}

export function seriesById(
  catalog: CatalogIndex,
  seriesId: string | undefined,
): PublishedSeries | undefined {
  if (!seriesId) return undefined
  return catalog.series.find((series) => series.id === seriesId)
}

export function modelById(catalog: Catalog, id: string | undefined): PublishedModel | undefined {
  if (!id) return undefined
  return catalog.models.find((model) => model.id === id)
}

export function seriesInLine(catalog: CatalogIndex, lineId: string): PublishedSeries[] {
  return catalog.series.filter((series) => series.line === lineId)
}

export function modelsInSeries(catalog: Catalog, seriesId: string): PublishedModel[] {
  return browsable(catalog.models.filter((model) => model.series === seriesId)).sort(compareByRef)
}

export function modelsInLine(catalog: Catalog, lineId: string): PublishedModel[] {
  return browsable(catalog.models.filter((model) => model.line === lineId)).sort(compareByRef)
}

export function editionById(
  catalog: CatalogIndex,
  editionId: string | undefined,
): PublishedEdition | undefined {
  if (!editionId) return undefined
  return catalog.editions.find((edition) => edition.id === editionId)
}

/**
 * D62 — every reference in an edition, **across every line it reaches**.
 *
 * This is the one grid on the site whose models do not share a line, and that is
 * the point of the screen rather than an accident of it: the PAC-MAN
 * collaboration is four references in four different series, and there was no
 * URL on this site that could show them together. Sorted by reference like every
 * other grid, so a reader arriving from a series page reads the same order.
 */
export function modelsInEdition(catalog: Catalog, editionId: string): PublishedModel[] {
  return browsable(catalog.models.filter((model) => model.edition === editionId)).sort(compareByRef)
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

export function lineTree(catalog: CatalogIndex, lineId: string): LineTree {
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
