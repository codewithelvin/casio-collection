import type { CatalogSource } from './integrity.ts'
import {
  CATALOG,
  CATALOG_INDEX,
  CATALOG_PAYLOAD,
  EDITION_MODELS,
  LINE_MODELS,
  MODEL_DOCUMENT,
  SEARCH_INDEX_FILE,
  SERIES_MODELS,
  type Catalog,
  type CatalogIndex,
  type CatalogPayload,
  type EditionModels,
  type FacetSummary,
  type LineModels,
  type Model,
  type ModelDocument,
  type PublishedModel,
  type SearchIndexFile,
  type SeriesModels,
} from './schema.ts'
// Not `client.ts`: this module runs in Node under `catalog:build`, and the
// client reads `import.meta.env.BASE_URL` at module scope.
import { searchTextBuilder } from './searchText.ts'
import { FACET_FIELDS } from './vocabulary.ts'

/**
 * §6.2 — assembling the one published file (D3).
 *
 * Two properties matter more than anything else this module does.
 *
 * **It is deterministic.** The same source produces a byte-identical payload,
 * every time, on any machine: every list is sorted by a stable key and nothing
 * reads a clock or a filesystem. That is what lets the version be a digest of
 * the content (see `stamp`), and it is what makes guardrail 7's "running the
 * same command twice produces no diff" a fact rather than a hope.
 *
 * **Unknown is omitted, never written.** A `null` in the artefact would be a
 * third state between "we know it is nothing" and "nobody has looked", and every
 * screen would have to decide what to do with it. Dropping the key means the
 * published file says exactly what FR-3.2 renders — the field is not there.
 */

/** Strips null and undefined, so an unknown field is an absent key (D27). */
function compact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue
    out[key] = value
  }
  return out
}

function publishModel(model: Model, line: string, series: string): Record<string, unknown> {
  const caseFields = model.case ? compact(model.case) : undefined
  return compact({
    id: model.id,
    ref: model.ref,
    line,
    series,
    source: model.source,
    name: model.name,
    // D62 — the edition, and the page that puts this reference in it where
    // neither page already cited does. They travel together for `year_source`'s
    // reason: a citation is only useful next to the claim it supports.
    edition: model.edition,
    edition_source: model.edition_source,
    year: model.year,
    // D54 — travels with the year, because a year read off a different page
    // than the specifications has to say so on the page that shows it.
    year_source: model.year_source,
    display: model.display,
    movement: model.movement,
    module: model.module,
    case: caseFields && Object.keys(caseFields).length > 0 ? caseFields : undefined,
    water_resistance_m: model.water_resistance_m,
    // An empty list is dropped rather than published. "No features recorded" and
    // "recorded, and there are none" are the same thing to a reader, and keeping
    // the empty array would let it count as coverage in D26's density measure —
    // a facet claiming data it does not have is exactly what D26 forbids.
    features: model.features && model.features.length > 0 ? model.features : undefined,
    colorway: model.colorway,
    image: model.image,
    image_credit: model.image_credit ? compact(model.image_credit) : undefined,
    official_url: model.official_url,
    // D59 — **both booleans are published**, and that is the whole of the
    // field. `false` is not a missing value: it is Casio's own sitemap saying it
    // still lists this reference. Dropping it the way an unknown is dropped
    // would leave the artefact unable to tell *still sold* from *nobody
    // measured*, which is the one distinction the availability filter reads.
    // `compact` still drops null and undefined, so unmeasured stays absent.
    discontinued: model.discontinued,
    tombstone: model.tombstone ? compact(model.tombstone) : undefined,
  })
}

function facetOf(
  models: readonly PublishedModel[],
  field: (typeof FACET_FIELDS)[number],
): FacetSummary {
  const counts = new Map<string, number>()
  let present = 0

  for (const model of models) {
    if (field === 'features') {
      const features = model.features ?? []
      if (features.length === 0) continue
      present += 1
      for (const feature of features) counts.set(feature, (counts.get(feature) ?? 0) + 1)
      continue
    }
    const value = model[field]
    if (value === undefined) continue
    present += 1
    const key = String(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const values = [...counts.entries()].map(([value, count]) => ({ value, count }))
  if (field === 'year') {
    // Newest first, which is the order the year filter reads in (FR-1.4).
    values.sort((a, b) => Number(b.value) - Number(a.value))
  } else {
    // Commonest first, ties broken alphabetically so the order never wobbles.
    values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }

  return {
    coverage: models.length === 0 ? 0 : present / models.length,
    present,
    total: models.length,
    values,
  }
}

export function buildCatalog(source: CatalogSource): CatalogPayload {
  const lineOrder = new Map(source.lines.lines.map((line, index) => [line.id, index]))

  const entries = [...source.series].sort((a, b) => {
    const orderA = lineOrder.get(a.series.line) ?? Number.MAX_SAFE_INTEGER
    const orderB = lineOrder.get(b.series.line) ?? Number.MAX_SAFE_INTEGER
    return orderA - orderB || a.series.id.localeCompare(b.series.id)
  })

  const models: Record<string, unknown>[] = []
  const series: Record<string, unknown>[] = []
  const modelsPerLine = new Map<string, number>()
  const familiesInUse = new Map<string, Set<string>>()
  const modelsPerEdition = new Map<string, number>()

  for (const entry of entries) {
    const sorted = [...entry.models].sort((a, b) => a.ref.localeCompare(b.ref))
    // A tombstone is reachable forever (FR-3.6) but is not stock: it is
    // published, and it is counted nowhere. An entry with no photograph is
    // withheld on the same terms — see `browsable` in `client.ts` for why, and
    // for why that is a reversal of D29 rather than an application of it.
    //
    // Both sides must apply the same test or the counts lie: this one bakes
    // `series.count` and the facets into catalog.json, and the client filters
    // the grid. A series reading "20 watches" above five cards is the bug.
    const browsable = sorted.filter((model) => !model.tombstone && model.image)

    for (const model of sorted) {
      models.push(publishModel(model, entry.series.line, entry.series.id))
    }

    for (const model of browsable) {
      if (!model.edition) continue
      modelsPerEdition.set(model.edition, (modelsPerEdition.get(model.edition) ?? 0) + 1)
    }

    modelsPerLine.set(
      entry.series.line,
      (modelsPerLine.get(entry.series.line) ?? 0) + browsable.length,
    )

    if (entry.series.family) {
      const forLine = familiesInUse.get(entry.series.line) ?? new Set<string>()
      forLine.add(entry.series.family)
      familiesInUse.set(entry.series.line, forLine)
    }

    // The same sentence as the line, family and edition rules, a fourth time:
    // only a series that actually holds a browsable model is published. This
    // one only started to matter when photograph-less entries began being
    // withheld — 11 single-reference series in Vintage and Edifice hold exactly
    // one model with no picture, and without this they publish a page with a
    // heading, a count of zero and nothing under it. Their models stay
    // reachable by their own URL, exactly as a tombstone does.
    if (browsable.length > 0) {
      series.push(
        compact({
          id: entry.series.id,
          name: entry.series.name,
          slug: entry.series.id,
          line: entry.series.line,
          family: entry.series.family,
          aka: entry.series.aka && entry.series.aka.length > 0 ? entry.series.aka : undefined,
          count: browsable.length,
        }),
      )
    }
  }

  // Only lines that actually hold a model are published — D51, and the same
  // sentence as the family rule below, one level up. `lines.yaml` declares the
  // lines that *may* be seeded; the artefact describes what exists, and a card
  // reading "Not catalogued yet" is a category with nothing in it.
  //
  // `order` is the index in the declared list and is taken **before** the
  // filter, so the editorial order of lines.yaml survives a line dropping out
  // and coming back when it is seeded.
  const lines = source.lines.lines
    .map((line, index) => ({
      id: line.id,
      name: line.name,
      slug: line.slug,
      accent: line.accent,
      order: index,
      count: modelsPerLine.get(line.id) ?? 0,
    }))
    .filter((line) => line.count > 0)

  // Only families that actually hold a series are published. The vocabulary in
  // lines.yaml is a list of names that *may* be used; the artefact describes what
  // exists, and a heading with nothing under it is not a grouping.
  const families = source.lines.lines.flatMap((line) =>
    (line.families ?? [])
      .filter((family) => familiesInUse.get(line.id)?.has(family.id))
      .map((family, index) => ({ id: family.id, name: family.name, line: line.id, order: index })),
  )

  // D62 — the same sentence as the line rule and the family rule, a third time:
  // only editions that actually hold a reference are published. `editions.yaml`
  // declares what may be named; the artefact describes what exists, and an
  // edition with nothing in it is a heading over an empty grid.
  //
  // `order` is the index in the declared list and is taken **before** the
  // filter, so the editorial order survives an edition dropping out and coming
  // back when its references are seeded.
  const editions = source.editions
    .map((edition, index) => ({
      id: edition.id,
      name: edition.name,
      slug: edition.id,
      ...(edition.partner ? { partner: edition.partner } : {}),
      ...(edition.year != null ? { year: edition.year } : {}),
      ...(edition.aka && edition.aka.length > 0 ? { aka: edition.aka } : {}),
      source: edition.source,
      order: index,
      count: modelsPerEdition.get(edition.id) ?? 0,
    }))
    .filter((edition) => edition.count > 0)

  const payload = CATALOG_PAYLOAD.parse({ lines, families, series, editions, models, facets: {} })

  // Same test as above, for the same reason: a facet counting watches the grid
  // will not show sends the reader to an empty result.
  const browsable = payload.models.filter((model) => !model.tombstone && model.image)
  const facets: Record<string, FacetSummary> = {}
  for (const field of FACET_FIELDS) facets[field] = facetOf(browsable, field)

  return { ...payload, facets }
}

/**
 * §6.2 — the build stamp.
 *
 * The specification's example is `2026-08-16.1`, a date and a counter. A counter
 * needs somewhere to remember the last one, and the only place that could live
 * is a committed file that CI would have to write back — so in practice the
 * number would either drift or stop moving. The date alone is worse: it changes
 * when nothing changed, and the whole point of the stamp is that
 * `catalog.json?v=<version>` may be cached forever.
 *
 * A digest of the payload has neither problem. It changes exactly when the
 * catalogue changes, it needs no state, and two people building the same source
 * get the same answer. The date is still in the file, as `generatedAt`, which is
 * what the footer prints (FR-10.3).
 */
export function stamp(payload: CatalogPayload, version: string, generatedAt: string): Catalog {
  return CATALOG.parse({ version, generatedAt, ...payload })
}

/** The exact bytes written to `public/catalog/catalog.json`. */
export function serialiseCatalog(catalog: Catalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`
}

/**
 * The second artefact: the same catalogue with `models` dropped (§6.2).
 *
 * It is **derived from the stamped catalogue rather than assembled beside it**,
 * which is the only arrangement in which the two cannot disagree. Building it
 * from the payload would give the version digest two ways to be computed and one
 * of them would eventually be wrong; taking it from the finished document means
 * an index carrying version `abc123` is, by construction, the index of the
 * catalogue carrying version `abc123`.
 */
export function indexOf(catalog: Catalog): CatalogIndex {
  return CATALOG_INDEX.parse({
    version: catalog.version,
    generatedAt: catalog.generatedAt,
    lines: catalog.lines,
    families: catalog.families,
    series: catalog.series,
    editions: catalog.editions,
    facets: catalog.facets,
  })
}

/**
 * The exact bytes written to `public/catalog/catalog-index.json`.
 *
 * **Not pretty-printed, unlike the catalogue.** The two-space indent on
 * `catalog.json` is there so a human can read a diff of it, and the file it is
 * on is a build artefact nobody diffs — but this one is fetched before the
 * first paint of every page, and the indent is a third of it. The catalogue
 * keeps its indent because whoever opens 2.4 MB by hand is doing so to read it.
 */
export function serialiseIndex(index: CatalogIndex): string {
  return `${JSON.stringify(index)}\n`
}

/* ------------------------------------------------------------------------- *
 * §6.2's split, legs two and three.
 *
 * Every function here follows `indexOf`'s rule and takes the **stamped
 * catalogue**, never the payload: the stamp is then carried rather than
 * recomputed, so a series file claiming version `abc123` is by construction a
 * slice of the catalogue carrying `abc123`. A reader holding two artefacts can
 * compare their versions and know whether they agree.
 * ------------------------------------------------------------------------- */

/** One watch, for `catalog/model/<id>.json`. */
export function modelDocumentsOf(catalog: Catalog): Map<string, ModelDocument> {
  const { version, generatedAt } = catalog
  return new Map(
    catalog.models.map((model) => [model.id, MODEL_DOCUMENT.parse({ version, generatedAt, model })]),
  )
}

/**
 * The models of each series, keyed by series id, for `catalog/series/<id>.json`.
 *
 * **Every series in the index gets a file, including one whose models are all
 * withheld.** An empty array is a different answer from a 404, and only the
 * first one is true: the series exists, it is in the index the rail renders, and
 * the page for it should say "nothing to show" rather than fail to load. A 404
 * would reach the client as an error state and read as a broken link.
 */
export function seriesModelsOf(catalog: Catalog): Map<string, SeriesModels> {
  return new Map(
    [...groupBy(catalog, (model) => model.series, catalog.series.map((series) => series.id))].map(
      ([series, models]) => [
        series,
        SERIES_MODELS.parse({
          version: catalog.version,
          generatedAt: catalog.generatedAt,
          series,
          models,
        }),
      ],
    ),
  )
}

/** The models of each line, for `catalog/line/<id>.json`. Same emptiness rule. */
export function lineModelsOf(catalog: Catalog): Map<string, LineModels> {
  return new Map(
    [...groupBy(catalog, (model) => model.line, catalog.lines.map((line) => line.id))].map(
      ([line, models]) => [
        line,
        LINE_MODELS.parse({
          version: catalog.version,
          generatedAt: catalog.generatedAt,
          line,
          models,
        }),
      ],
    ),
  )
}

/**
 * Group every model by a key, **starting from the published keys and adding any
 * the models name that are not among them.**
 *
 * Both halves are load-bearing and the second one was found by a thrown error
 * rather than by reasoning, so it is written down here.
 *
 * *Starting from the published list* is what gives an empty series or line a
 * file. An empty array and a 404 are different answers and only the first is
 * true — the series is in the index the rail renders, and its page should say
 * there is nothing to show rather than fail to load.
 *
 * *Adding the ones that are missing* is D51 meeting the 2026-08-26 rule. A
 * series is only published if it holds a model with a photograph, so DW-500 —
 * three references, none photographed — is in `models` and not in `series`.
 * Requiring the key to be published would throw on it (it did), and dropping it
 * silently would be worse: `modelById` still has to resolve those models for
 * FR-3.6, and the watch page reads the series file to find them.
 */
function groupBy(
  catalog: Catalog,
  keyOf: (model: PublishedModel) => string,
  published: readonly string[],
): Map<string, PublishedModel[]> {
  const grouped = new Map<string, PublishedModel[]>(published.map((key) => [key, []]))
  for (const model of catalog.models) {
    const key = keyOf(model)
    const bucket = grouped.get(key)
    if (bucket) bucket.push(model)
    else grouped.set(key, [model])
  }
  return grouped
}

/**
 * The models of each edition, for `catalog/edition/<id>.json`.
 *
 * Unlike series and line, a model here is found by a field that is **absent on
 * almost every model**, so this walks the editions rather than the models and an
 * edition nothing names gets an empty file — which is exactly what the build
 * already warns about rather than failing on.
 */
export function editionModelsOf(catalog: Catalog): Map<string, EditionModels> {
  const { version, generatedAt } = catalog
  return new Map(
    catalog.editions.map((edition) => [
      edition.id,
      EDITION_MODELS.parse({
        version,
        generatedAt,
        edition: edition.id,
        models: catalog.models.filter((model) => model.edition === edition.id),
      }),
    ]),
  )
}

/**
 * The slim search index (§6.2's third leg).
 *
 * **The text is normalised here, once, instead of in every browser.** It reuses
 * `searchTextOf` from `search.ts` rather than reimplementing the field list,
 * because a second copy of "what search can see" is a second thing to keep in
 * step and the one that would drift is the one nobody looks at — FR-2.1's
 * family and edition matching would quietly stop working.
 *
 * `browsable` is applied, matching what the in-browser index always did: a
 * tombstoned entry is reachable by URL forever and counted nowhere else, and a
 * model with no photograph is withheld (2026-08-26).
 */
export function searchIndexOf(catalog: Catalog): SearchIndexFile {
  const textOf = searchTextBuilder(catalog)
  // The same test `client.ts` and `seo.ts` apply, spelled here for the third
  // time rather than imported from the client for the reason in the imports.
  const browsable = catalog.models.filter((model) => !model.tombstone && model.image)
  const entries = browsable.map((model) => ({
    id: model.id,
    ref: model.ref,
    line: model.line,
    series: model.series,
    ...(model.name === undefined ? {} : { name: model.name }),
    ...(model.year === undefined ? {} : { year: model.year }),
    ...(model.image === undefined ? {} : { image: model.image }),
    text: textOf(model),
  }))
  return SEARCH_INDEX_FILE.parse({
    version: catalog.version,
    generatedAt: catalog.generatedAt,
    entries,
  })
}

/**
 * The bytes of any of the split artefacts.
 *
 * **Not pretty-printed**, for `serialiseIndex`'s reason and more strongly: these
 * are fetched by the browser and nothing else, and there are 4 600 of them.
 */
export function serialiseSplit(document: object): string {
  return `${JSON.stringify(document)}\n`
}

/** The bytes the version digest is taken over — the payload, without the stamp. */
export function digestInput(payload: CatalogPayload): string {
  return JSON.stringify(payload)
}
