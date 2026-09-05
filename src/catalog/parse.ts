// S7 — **first, and not optional.** See `zodJitless` for why the import order in
// this file is load-bearing: a schema constructed before that config runs fires a
// CSP violation the browser records in its Issues panel.
import '../zodJitless'
import {
  CATALOG,
  CATALOG_INDEX,
  EDITION_MODELS,
  LINE_MODELS,
  MODEL_DOCUMENT,
  SEARCH_INDEX_FILE,
  SERIES_MODELS,
  type Catalog,
  type CatalogIndex,
  type EditionModels,
  type LineModels,
  type ModelDocument,
  type SearchIndexFile,
  type SeriesModels,
} from './schema.ts'

/**
 * §12 — **the seam that keeps Zod out of the first load.**
 *
 * `client.ts` is in the entry chunk: the rail reads the catalogue index on every
 * URL, so the module holding `CATALOG_INDEX_PATH` is in the first load of all
 * 3 000-odd of them. While it also held `CATALOG_INDEX.parse` it dragged
 * `schema.ts` in, and `schema.ts` is Zod — 174 KB unminified, evaluated before
 * anything could be painted.
 *
 * So the parse lives here and `client.ts` reaches it with a dynamic import,
 * *concurrently with the fetch it is going to validate*. That is what makes this
 * free rather than a deferral: the chunk and the JSON are in flight together, and
 * the JSON is always the slower of the two.
 *
 * **The parse itself is not ceremony and is not weakened by moving.** `client.ts`
 * says why: `catalog.json` is a static file on a CDN that an older service worker
 * or a stale edge cache can serve long after its shape has moved on, and the
 * difference between a Zod error at load and an undefined field deep in a render
 * is the difference between one designed error state and a white screen.
 *
 * `zodJitless` is imported here rather than in `main.tsx`, which is where it used
 * to be. It had to be there when Zod was in the entry chunk; now that Zod is not,
 * an import in `main.tsx` would be the one line putting it back.
 */
export function parseCatalog(document: unknown): Catalog {
  return CATALOG.parse(document)
}

export function parseCatalogIndex(document: unknown): CatalogIndex {
  return CATALOG_INDEX.parse(document)
}

/**
 * §6.2's split, legs two and three. They live here for the same reason the two
 * above do — `client.ts` must not import `schema.ts` — and they are worth the
 * parse for a reason the big files are not quite so exposed to: there are 4 880
 * of these, they are fetched one at a time as a reader moves around, and a
 * service worker holding a stale one serves it for as long as its cache lasts.
 */
export function parseModelDocument(document: unknown): ModelDocument {
  return MODEL_DOCUMENT.parse(document)
}

export function parseSeriesModels(document: unknown): SeriesModels {
  return SERIES_MODELS.parse(document)
}

export function parseLineModels(document: unknown): LineModels {
  return LINE_MODELS.parse(document)
}

export function parseEditionModels(document: unknown): EditionModels {
  return EDITION_MODELS.parse(document)
}

export function parseSearchIndex(document: unknown): SearchIndexFile {
  return SEARCH_INDEX_FILE.parse(document)
}
