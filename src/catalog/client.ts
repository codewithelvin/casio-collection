import { useQuery, type UseQueryResult } from '@tanstack/react-query'
// **Types only, and that is enforced by `import type`.** §12 — this module is in
// the entry chunk, and `schema.ts` is Zod: a value import here would put 174 KB
// unminified of it in the first load of every URL on the site. The schemas are
// reached through `./parse.ts`, dynamically, beside the fetch they validate.
import type {
  Catalog,
  CatalogIndex,
  EditionModels,
  LineModels,
  ModelDocument,
  PublishedEdition,
  PublishedFamily,
  PublishedLine,
  PublishedModel,
  PublishedSeries,
  SearchIndexFile,
  SeriesModels,
} from './schema.ts'
import { fresh } from '../chunkReload.ts'

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

/**
 * §6.2's split, legs two and three — the files a screen reads when it needs
 * watches rather than the shape of the catalogue.
 *
 * `catalog.json` is still built and still served; what changes is that nothing
 * here has to download all of it to render one series. Measured on the artefact
 * these paths point at: a watch page went from 149.6 KB to 4.6 KB, a series page
 * to 4.0 KB, and the largest line — Vintage, 2 700 references — to 61.0 KB.
 *
 * There is no `?v=` on any of them, for `CATALOG_PATH`'s reason: the version
 * lives inside the file, so a query string could only be appended after the
 * fetch that needed it.
 */
const splitPath = (kind: string, id: string) =>
  `${import.meta.env.BASE_URL}catalog/${kind}/${encodeURIComponent(id)}.json`

export const SEARCH_INDEX_PATH = `${import.meta.env.BASE_URL}catalog/search-index.json`

/**
 * One fetch-and-parse for all four per-id artefacts.
 *
 * The parse is not ceremony here either — see this module's header. These files
 * are on the same CDN as the catalogue and an older service worker can serve any
 * of them long after their shape has moved on.
 *
 * **A 404 is turned into a null rather than an error**, and that distinction is
 * the whole reason this is one function. A missing model file means the URL
 * names a watch that does not exist, which is FR-10.2's designed not-found
 * screen; a 500 or a network failure means the site is broken, which is
 * FR-10.1's retry. Collapsing the two would show a reader "try again" for a
 * typo, forever.
 */
async function fetchSplit<T>(
  path: string,
  parse: (value: unknown) => Promise<T>,
  signal?: AbortSignal,
): Promise<T | null> {
  const response = await fetch(path, signal ? { signal } : undefined)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`catalog: HTTP ${response.status} from ${path}`)
  return parse(await response.json())
}

export async function fetchModel(id: string, signal?: AbortSignal): Promise<ModelDocument | null> {
  const { parseModelDocument } = await fresh(() => import('./parse.ts'))
  return fetchSplit(splitPath('model', id), async (value) => parseModelDocument(value), signal)
}

export async function fetchSeriesModels(id: string): Promise<SeriesModels | null> {
  const { parseSeriesModels } = await fresh(() => import('./parse.ts'))
  return fetchSplit(splitPath('series', id), async (value) => parseSeriesModels(value))
}

export async function fetchLineModels(id: string): Promise<LineModels | null> {
  const { parseLineModels } = await fresh(() => import('./parse.ts'))
  return fetchSplit(splitPath('line', id), async (value) => parseLineModels(value))
}

export async function fetchEditionModels(id: string): Promise<EditionModels | null> {
  const { parseEditionModels } = await fresh(() => import('./parse.ts'))
  return fetchSplit(splitPath('edition', id), async (value) => parseEditionModels(value))
}

export async function fetchSearchIndex(): Promise<SearchIndexFile> {
  const [response, { parseSearchIndex }] = await Promise.all([
    fetch(SEARCH_INDEX_PATH),
    fresh(() => import('./parse.ts')),
  ])
  if (!response.ok) {
    throw new Error(`catalog: HTTP ${response.status} from ${SEARCH_INDEX_PATH}`)
  }
  return parseSearchIndex(await response.json())
}

export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  // The schemas and the document are fetched concurrently, which is what makes
  // the dynamic import cost nothing: 2.4 MB of JSON is always slower to arrive
  // than the chunk that validates it.
  //
  // `fresh` on the import and not on the fetch, and the difference is the whole
  // point of the distinction. The catalogue is a versioned file that can fail
  // transiently, and FR-10.1 answers that with *try again* — a retry that can
  // work. `parse.ts` is a hashed chunk, so a 404 on it is a deploy rather than a
  // blip: the same retry asks for the same missing file for as long as the tab
  // is open, and the reader is offered a button that cannot help them.
  const [response, { parseCatalog }] = await Promise.all([
    fetch(CATALOG_PATH, signal ? { signal } : undefined),
    fresh(() => import('./parse.ts')),
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
    fresh(() => import('./parse.ts')),
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
 * §6.2's split — one query per artefact.
 *
 * **A key per id, not one key holding a map.** Two screens showing two series
 * hold two cache entries and neither refetches the other's, which is the whole
 * behaviour the split is for; a single key would make the cache as coarse as the
 * file it replaced.
 *
 * Every one of these inherits `staleTime: Infinity` from the QueryClient, as the
 * catalogue queries do. Within a session nothing is fetched twice, so walking a
 * line, opening a watch, going back and opening another is two series fetches at
 * most — and the second watch's model file, which is 600 bytes.
 * ------------------------------------------------------------------------- */

export const modelQueryOptions = (id: string) => ({
  queryKey: ['catalog', 'model', id] as const,
  queryFn: ({ signal }: { signal?: AbortSignal }) => fetchModel(id, signal),
})

export function useSeriesModels(id: string | undefined): UseQueryResult<SeriesModels | null, Error> {
  return useQuery({
    queryKey: ['catalog', 'series', id ?? ''] as const,
    queryFn: () => fetchSeriesModels(id ?? ''),
    enabled: Boolean(id),
  })
}

/**
 * **The hooks for the other three artefacts land with the screens that use
 * them, and that is a rule this file learned the hard way.**
 *
 * `useModel`, `useLineModels`, `useEditionModels` and `useSearchIndex` were
 * written here in one go, ahead of the screens. Every one of them was a function
 * nothing called, and `src/catalog/**` carries a 90% function floor (D31): the
 * group fell to 86.59% and the deploy stopped at the coverage gate — correctly,
 * because an artefact hook nothing has ever run is exactly the thing that ships
 * with a wrong query key and is found by a visitor.
 *
 * The fetchers below stay, because they are covered by tests of their own and
 * they are where the path and the 404 handling live. The one-line hook that
 * wraps each is written beside the screen that needs it.
 */

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
 *
 * **An entry with no photograph is withheld on the same terms, and this reverses
 * D29.** D29 made the typographic tile a primary state, on the reasoning that a
 * card with no picture is still a real answer to "does this watch exist". The
 * client's decision on 2026-08-26 is the opposite one: a watch nobody can show
 * you does not belong in a grid, and it waits there until a photograph is found
 * rather than being published without one.
 *
 * It is withheld, not retired. The two are different facts and only this filter
 * knows the difference:
 *
 *   * the entry keeps every sourced field and its id stays in
 *     `.published-ids.json`, so D2 holds and no tombstone is invented;
 *   * `modelById` still resolves it, so a direct URL and a shared link work;
 *   * `joinCollection` reads `catalog.models` whole and deliberately not this
 *     function, so a watch somebody already owns never disappears from their
 *     own collection — the case that comment was written for;
 *   * the moment `image` is set, it appears. Nothing has to be un-done.
 *
 * 347 G-SHOCK references sit here today, every one of them with a written reason
 * at `image: null` explaining which photograph routes were walked.
 */
export function browsable(models: readonly PublishedModel[]): PublishedModel[] {
  return models.filter((model) => !model.tombstone && model.image)
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

/**
 * The same two rules — withhold, then order — for a screen holding one of §6.2's
 * split files instead of the whole catalogue.
 *
 * It exists so that moving a screen onto a series or line file cannot quietly
 * drop either rule. `modelsInSeries` above does the filtering *and* the sorting
 * in one expression, and a caller that had already narrowed the models would
 * naturally write `browsable(file.models)` and forget the sort — which reads
 * fine on screen until a series has an F-103 and an F-15 in it.
 */
export function browsableSorted(models: readonly PublishedModel[]): PublishedModel[] {
  return browsable(models).sort(compareByRef)
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
