import { z } from 'zod'
import { DISPLAYS, FEATURES, IMAGE_LICENCES, MOVEMENTS, SOURCE_KINDS } from './vocabulary.ts'

/**
 * §6.2 — **there is exactly one definition of a model in the system**, and this
 * is it. The build validates against these schemas and the browser parses the
 * published file with them; the TypeScript types are inferred from them rather
 * than declared beside them. Two definitions would drift, and the drift would
 * show up as a field that silently disappears between the YAML and the page.
 *
 * Relative imports in this folder carry an explicit `.ts` extension. That looks
 * unusual, and the reason is load-bearing: the catalogue scripts under
 * `scripts/catalog/` are TypeScript run directly by Node's native type
 * stripping, and Node's resolver does not guess extensions. Vite, vitest and
 * `tsc` all accept the explicit form, so one style works everywhere and the
 * build shares this file rather than copying it.
 *
 * Every object is **strict**. An unrecognised key is an error, not something
 * ignored — `wather_resistance_m` would otherwise parse cleanly and publish a
 * model with no water resistance, which is precisely the class of failure D31
 * says nobody notices.
 */

/**
 * D2 — a model id is permanent, so its shape is fixed before the first publish
 * rather than corrected after. Lowercase, digits and hyphens: it appears in a
 * URL (`/watch/<id>`), in `collection_items.model_id`, and in an image filename,
 * and it must be identical in all three forever.
 */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/
const idField = z.string().regex(ID_PATTERN, 'must be lowercase letters, digits and hyphens (D2)')

/** Hex, six digits — the per-line accent used as a card border and rail marker (§8.3). */
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/

/** FR-D1 / D27 — a URL and what kind of page it was. Both, always. */
export const SOURCE = z.strictObject({
  url: z.url(),
  kind: z.enum(SOURCE_KINDS),
})
export type Source = z.infer<typeof SOURCE>

/**
 * D41 — who took the photograph, under what licence, and where it came from.
 *
 * Required wherever a model carries an `image`, and that is the point of it.
 * The site's footer can say honestly that reference codes belong to Casio; it
 * cannot say anything true about a photograph taken by a stranger and licensed
 * CC BY-SA. Attribution is not a courtesy under that licence, it is the term of
 * use — so the credit travels with the file it describes rather than living in
 * a page nobody opens.
 */
export const IMAGE_CREDIT = z.strictObject({
  /** As the licence asks it to be given: the name on the source page. */
  author: z.string().min(1),
  licence: z.enum(IMAGE_LICENCES),
  /** The page the file was taken from, so the claim can be checked. */
  url: z.url(),
})
export type ImageCredit = z.infer<typeof IMAGE_CREDIT>

/** Decoration for the spec table (FR-3.2), not a facet — hence no vocabulary. */
export const CASE = z.strictObject({
  material: z.string().min(1).nullish(),
  width_mm: z.number().positive().nullish(),
  height_mm: z.number().positive().nullish(),
  depth_mm: z.number().positive().nullish(),
  weight_g: z.number().positive().nullish(),
})

/**
 * D62 — an **edition**: a named limited or collaboration release, declared once
 * in `catalog-src/editions.yaml` and named by the references that belong to it.
 *
 * It is the second grouping over the catalogue and it is deliberately not shaped
 * like the first. A **series** is the reference prefix (D32): it is mechanical,
 * every model has exactly one, and it never crosses a line. An edition is none of
 * those things — PAC-MAN is four references spread across four series of the
 * Vintage line, Café Kitsuné is one, and nothing in a reference code says which
 * edition it is. `A168WECK-7A` and `A168WECM-5` differ by a letter and only one
 * of them is a collaboration, which is why this is authored data and not a
 * pattern.
 *
 * **It carries a source, and that is what separates it from a family.** A family
 * (D32) is a human judgement about how a watch looks and needs no citation. An
 * edition is a claim about the world — that Casio and Mattel made this watch
 * together — so §10.6's rule applies to it exactly as it applies to a model: a
 * page states it, or it is not written down.
 */
export const EDITION = z.strictObject({
  id: idField,
  /** As the page that announced it writes it — *PAC-MAN Collaboration*. */
  name: z.string().min(1),
  /** The other party, where there is one. An anniversary edition has none. */
  partner: z.string().min(1).nullish(),
  year: z.number().int().nullish(),
  /**
   * What people type. Load-bearing for FR-2.1 rather than decorative: search
   * normalises to letters and digits, so *Café Kitsuné* indexes as `cafkitsun`
   * and the word a reader actually types — `cafe kitsune` — matches nothing
   * without an alias that is spelled in ASCII.
   */
  aka: z.array(z.string().min(1)).nullish(),
  source: SOURCE,
})
export type Edition = z.infer<typeof EDITION>

/** `catalog-src/editions.yaml` — the edition vocabulary, in editorial order. */
export const EDITIONS_FILE = z.strictObject({
  editions: z.array(EDITION),
})
export type EditionsFile = z.infer<typeof EDITIONS_FILE>

/**
 * D2 — a withdrawn model becomes a tombstone, never a deletion. The entry stays
 * in its series file and stays reachable forever (FR-3.6), because somebody's
 * `collection_items` row points at it and nothing in the database can follow a
 * rename.
 *
 * A tombstone is not the same thing as `discontinued`. Discontinued means Casio
 * stopped selling it, which is true of most of what this site catalogues and is
 * not interesting. A tombstone means **this catalogue entry was retired** — a
 * duplicate, a reference that turned out not to exist, a split into two.
 */
export const TOMBSTONE = z.strictObject({
  reason: z.string().min(1),
  replaced_by: idField.nullish(),
})

/**
 * D27 — a model needs five things: `id`, `ref`, `line`, `series` and a `source`.
 * `line` and `series` come from the file the model sits in, so they are not
 * repeated here; the build writes them onto every published model.
 *
 * **Everything below the source is optional and absent means unknown.** Never
 * zero, never "N/A", never a plausible guess (§10.6 guardrail 2). An explicit
 * `null` and an omitted key mean the same thing, so the skill can write `null`
 * to record "looked for it, not there" without inventing a third state.
 */
export const MODEL = z.strictObject({
  id: idField,
  ref: z.string().min(1),
  source: SOURCE,

  name: z.string().min(1).nullish(),
  /**
   * D62 — the edition this reference was released in, by id. Absent on almost
   * everything, and that is the normal state: the overwhelming majority of Casio
   * references are ordinary catalogue models, so this is a small, exceptional
   * fact rather than a field waiting to be filled in.
   */
  edition: idField.nullish(),
  /**
   * D62 / D54 — the page that puts this reference in that edition, where it is
   * not the page in `source` and not the edition's own page.
   *
   * The usual case needs nothing here: Casio's collaboration page names its
   * references, so the edition's own `source` establishes the membership of
   * every model in it. This exists for the reference that page does *not* name —
   * `A100WEPC-1B` is a PAC-MAN watch from an earlier release than the
   * collaboration page Casio still publishes, and the page that says so is
   * neither of the two already cited. Written for the same reason `year_source`
   * is: one entry citing two pages is honest only when it says which said what.
   */
  edition_source: z.url().nullish(),
  // Range checked in integrity.ts rather than here, so the message can name the
  // year and the file instead of reading "invalid input".
  year: z.number().int().nullish(),
  /**
   * D54 — the page that states the year, where it is not the page in `source`.
   *
   * Casio's product page dates nothing (D25), which is why `year` is absent
   * across every line but Vintage. Casio's **news release** does date a
   * reference — the date is in the URL and on the page — so a year may be read
   * from there while the specifications still come from the product page. That
   * is one entry citing two pages, which §10.6 otherwise forbids, and this
   * field is what makes it honest rather than a merge: the year carries its own
   * source the way a photograph carries `image_credit`.
   *
   * Absent where the year came from the same page as everything else — the
   * Vintage entries read off The Digital Watch Library are dated by the source
   * they already cite, and adding a second URL saying the same thing would be
   * noise. Integrity check 6 enforces the direction that matters: a
   * `year_source` with no `year` is a citation for a fact that is not there.
   */
  year_source: z.url().nullish(),
  display: z.enum(DISPLAYS).nullish(),
  movement: z.enum(MOVEMENTS).nullish(),
  module: z.string().min(1).nullish(),
  case: CASE.nullish(),
  water_resistance_m: z.number().int().nonnegative().nullish(),
  features: z.array(z.enum(FEATURES)).nullish(),
  colorway: z.string().min(1).nullish(),
  /** The image basename, which is the model id by convention. `null` is normal. */
  image: idField.nullish(),
  /** D41 — required with an `image`, refused without one (§10.2 check 5a). */
  image_credit: IMAGE_CREDIT.nullish(),
  /** The official product page, where one still exists (FR-3.5). */
  official_url: z.url().nullish(),
  discontinued: z.boolean().nullish(),
  tombstone: TOMBSTONE.nullish(),
})
export type Model = z.infer<typeof MODEL>

/** One `catalog-src/<line>/<series>.yaml` file (§6.1). */
export const SERIES_FILE = z.strictObject({
  series: z.strictObject({
    /** D32 — the reference prefix, mechanically derived. Also the URL segment. */
    id: idField,
    name: z.string().min(1),
    line: idField,
    /** D32 — a display grouping. Optional, and never a URL segment. */
    family: idField.nullish(),
    /** What collectors call it. Matched by search (FR-2.1). */
    aka: z.array(z.string().min(1)).nullish(),
  }),
  models: z.array(MODEL).min(1, 'a series file with no models is not a series'),
})
export type SeriesFile = z.infer<typeof SERIES_FILE>

/**
 * `catalog-src/lines.yaml` — editorial order, display names, accents, the
 * per-line reference patterns of §10.2 check 3, and D32's family vocabulary.
 *
 * Order is **array order**, in both lists. An explicit `order:` field would be a
 * second place to hold the same fact, and the two would disagree the first time
 * somebody moved a line without renumbering.
 */
export const LINES_FILE = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        id: idField,
        name: z.string().min(1),
        slug: idField,
        accent: z.string().regex(HEX_COLOUR, 'must be a six-digit hex colour'),
        /**
         * §10.2 check 3 — there is no single Casio grammar, so each line carries
         * its own pattern and refines it as the line is seeded. Stored as a
         * regular-expression source string, anchored by the check itself.
         */
        ref_pattern: z.string().min(1),
        families: z
          .array(
            z.strictObject({
              id: idField,
              name: z.string().min(1),
            }),
          )
          .nullish(),
      }),
    )
    .min(1),
})
export type LinesFile = z.infer<typeof LINES_FILE>
export type LineDef = LinesFile['lines'][number]

/* ------------------------------------------------------------------------- *
 * The published artefact (§6.2)
 *
 * The same vocabulary as the authoring source, with two differences that both
 * exist to keep the file small enough for NFR-4's 150 KB. Unknown fields are
 * **omitted** rather than written `null` — which is also what FR-3.2 asks the
 * spec table to do, so the artefact says exactly what the page renders. And the
 * two stamp fields keep §6.2's literal names, `version` and `generatedAt`, which
 * are the only camelCase keys in the file.
 * ------------------------------------------------------------------------- */

const publishedCase = z.strictObject({
  material: z.string().optional(),
  width_mm: z.number().optional(),
  height_mm: z.number().optional(),
  depth_mm: z.number().optional(),
  weight_g: z.number().optional(),
})

export const PUBLISHED_MODEL = z.strictObject({
  id: z.string(),
  ref: z.string(),
  /** Written by the build from the file the model was authored in. */
  line: z.string(),
  series: z.string(),
  source: SOURCE,

  name: z.string().optional(),
  /** D62 — the edition this reference was released in. Absent on almost all. */
  edition: z.string().optional(),
  /** D62 — the page that puts it there, where neither page already cited does. */
  edition_source: z.url().optional(),
  year: z.number().int().optional(),
  /** D54 — the page that states the year, where it is not the one in `source`. */
  year_source: z.url().optional(),
  display: z.enum(DISPLAYS).optional(),
  movement: z.enum(MOVEMENTS).optional(),
  module: z.string().optional(),
  case: publishedCase.optional(),
  water_resistance_m: z.number().optional(),
  features: z.array(z.enum(FEATURES)).optional(),
  colorway: z.string().optional(),
  image: z.string().optional(),
  image_credit: IMAGE_CREDIT.optional(),
  official_url: z.string().optional(),
  discontinued: z.boolean().optional(),
  tombstone: z.strictObject({ reason: z.string(), replaced_by: z.string().optional() }).optional(),
})
export type PublishedModel = z.infer<typeof PUBLISHED_MODEL>

export const PUBLISHED_LINE = z.strictObject({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  accent: z.string(),
  order: z.number().int().nonnegative(),
  /** Models in the line, tombstones excluded — a retired entry is not stock. */
  count: z.number().int().nonnegative(),
})
export type PublishedLine = z.infer<typeof PUBLISHED_LINE>

export const PUBLISHED_FAMILY = z.strictObject({
  id: z.string(),
  name: z.string(),
  line: z.string(),
  order: z.number().int().nonnegative(),
})
export type PublishedFamily = z.infer<typeof PUBLISHED_FAMILY>

/**
 * D62 — an edition as the artefact carries it.
 *
 * `source` is published, unlike anything else describing the *shape* of the
 * catalogue, and it is published for the same reason a model's is: the edition
 * screen shows the reader which page this claim was read off. A line, a family
 * and a series are all descriptions of Casio's own naming; an edition asserts
 * that two companies made something together, and that assertion has to be
 * checkable from the page that makes it.
 */
export const PUBLISHED_EDITION = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** An edition id is already URL-safe, so the slug is the id — as with series. */
  slug: z.string(),
  partner: z.string().optional(),
  year: z.number().int().optional(),
  aka: z.array(z.string()).optional(),
  source: SOURCE,
  order: z.number().int().nonnegative(),
  /** Models in the edition, tombstones excluded. Never zero: see `buildCatalog`. */
  count: z.number().int().nonnegative(),
})
export type PublishedEdition = z.infer<typeof PUBLISHED_EDITION>

export const PUBLISHED_SERIES = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** A series id is already URL-safe, so the slug is the id. Both are published
   *  because §6.2 names both, and because the day they diverge the client should
   *  not have to be changed to notice. */
  slug: z.string(),
  line: z.string(),
  family: z.string().optional(),
  aka: z.array(z.string()).optional(),
  count: z.number().int().nonnegative(),
})
export type PublishedSeries = z.infer<typeof PUBLISHED_SERIES>

/**
 * D26 — what the filter bar can be built from. `coverage` is the share of
 * non-tombstoned models carrying the field **across the whole catalogue**; the
 * 60% gate itself is applied per view at render time, over the models actually
 * on screen, which is the half of D26 that makes it honest. These numbers are
 * here so the build can print them and so a client-side sanity check has
 * something to compare against.
 */
export const FACET_SUMMARY = z.strictObject({
  coverage: z.number().min(0).max(1),
  present: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  values: z.array(z.strictObject({ value: z.string(), count: z.number().int().positive() })),
})
export type FacetSummary = z.infer<typeof FACET_SUMMARY>

/**
 * Everything the artefact says about the *shape* of the catalogue — the lines,
 * the families, the series and the facet summary — and nothing it says about an
 * individual watch.
 *
 * **This exists because of what it costs to know a model.** 2 832 of them are
 * 1.7 MB of the 2.4 MB file, and the front door renders seven cards from
 * `lines` while the rail renders 328 rows from `series`; before the split both
 * paid for every specification of every reference to do it. Measured at PSI's
 * 4× throttle that was most of a second of main thread before anything on the
 * screen moved.
 *
 * It is spelled as a shape spread into both artefacts rather than as a
 * `.omit({ models: true })` off the whole, because §6.2's rule is that there is
 * one definition of each of these things and a derived schema is still one
 * definition. What it is *not* is a second file listing the same fields.
 */
export const CATALOG_SHAPE = z.strictObject({
  lines: z.array(PUBLISHED_LINE),
  families: z.array(PUBLISHED_FAMILY),
  series: z.array(PUBLISHED_SERIES),
  /**
   * D62 — and it belongs in the *shape* rather than beside the models for the
   * same reason `series` does: the editions index and the rail render names and
   * counts, and neither names a reference. Twelve objects, so the index leg of
   * §6.2's split keeps paying for itself.
   */
  editions: z.array(PUBLISHED_EDITION),
  facets: z.record(z.string(), FACET_SUMMARY),
})

/** Everything except the stamp — this is what the version digest is taken over. */
export const CATALOG_PAYLOAD = z.strictObject({
  ...CATALOG_SHAPE.shape,
  models: z.array(PUBLISHED_MODEL),
})
export type CatalogPayload = z.infer<typeof CATALOG_PAYLOAD>

/**
 * §6.2 — the build stamp, and the cache-busting query. Both artefacts carry it,
 * and they carry the *same* one: the digest is taken over the whole payload, so
 * an index whose version matches the catalogue's is an index of that catalogue.
 */
const STAMP = {
  version: z.string().min(1),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}

/**
 * The stamp is spread in **before** the payload rather than extended on after,
 * because Zod rebuilds an object in the order of its shape and that order is
 * what lands in the file. §6.2 shows `version` and `generatedAt` at the top and
 * that is where a human opening the artefact looks for them.
 */
export const CATALOG = z.strictObject({
  ...STAMP,
  ...CATALOG_PAYLOAD.shape,
})
export type Catalog = z.infer<typeof CATALOG>

/**
 * `catalog-index.json` — the same document with `models` left out.
 *
 * Every screen that needs a watch still parses the whole catalogue; what changed
 * is that the screens which do not — the front door, the rail on every page —
 * no longer wait for one. `Catalog` is assignable to this by construction, so a
 * selector typed against it reads either artefact and there is no second set of
 * accessors to keep in step.
 */
export const CATALOG_INDEX = z.strictObject({
  ...STAMP,
  ...CATALOG_SHAPE.shape,
})
export type CatalogIndex = z.infer<typeof CATALOG_INDEX>

/* ------------------------------------------------------------------------- *
 * §6.2's split, legs two and three.
 *
 * The index leg landed when the catalogue passed 2 500 models. These land
 * because it reached the other wall: 149.6 KB of NFR-4's 150 KB, with ~480
 * bytes of headroom, twelve reader-reported references waiting to be written and
 * a G-SHOCK roster of 6 600 against the 983 catalogued. §6.2's own answer to
 * this moment is written down — "split into a lightweight index, per-series
 * files and a slim search index. A larger number is not one of the options."
 *
 * **Every one of these is a slice of the same `PublishedModel`, never a second
 * definition of a watch.** That is the rule the whole file is built on, and it
 * is what makes four artefacts safe: a screen reading a series file and a screen
 * reading a line file are looking at the same objects, and `browsable()`,
 * `compareByRef` and the filters work on all of them unchanged.
 *
 * A model appears in more than one file — its own, its series', its line's, its
 * edition's. That is duplication on disk and not on the wire, which is the
 * trade the split is: a static host is bytes-per-request cheap and file-count
 * free, and the site already writes 3 827 HTML files for the same reason.
 * ------------------------------------------------------------------------- */

/**
 * `catalog/model/<id>.json` — one watch.
 *
 * The watch page's URL carries an id and nothing else, so this is the file that
 * makes a deep link cost one request instead of a lookup in something bigger.
 * The strip of other references in the series comes from the series file beside
 * it, which is a second request the page can make in parallel.
 */
export const MODEL_DOCUMENT = z.strictObject({
  ...STAMP,
  model: PUBLISHED_MODEL,
})
export type ModelDocument = z.infer<typeof MODEL_DOCUMENT>

/**
 * `catalog/series/<id>.json` — every model in one series, in file order.
 *
 * Not filtered by `browsable()` and not sorted here, deliberately. Both are
 * client decisions that have changed once already (D29 was reversed on
 * 2026-08-26) and baking either into the artefact would mean a rebuild to change
 * a rendering rule — and would hide a withheld model from `modelById`, which
 * has to keep resolving it for FR-3.6.
 */
export const SERIES_MODELS = z.strictObject({
  ...STAMP,
  series: z.string(),
  models: z.array(PUBLISHED_MODEL),
})
export type SeriesModels = z.infer<typeof SERIES_MODELS>

/**
 * `catalog/line/<id>.json` — every model in one line.
 *
 * The line page renders every reference in the line grouped by series, so it
 * genuinely needs all of them; fetching its series files one by one would be 778
 * requests for Vintage. This is the largest artefact and the one to watch: it is
 * what the per-file budget in `report.ts` is really about.
 */
export const LINE_MODELS = z.strictObject({
  ...STAMP,
  line: z.string(),
  models: z.array(PUBLISHED_MODEL),
})
export type LineModels = z.infer<typeof LINE_MODELS>

/**
 * `catalog/edition/<id>.json` — D62, and the one artefact that crosses lines.
 *
 * That is the whole point of the screen rather than an accident of it: the
 * PAC-MAN collaboration is four references in four series, and no line or series
 * file can hold them together.
 */
export const EDITION_MODELS = z.strictObject({
  ...STAMP,
  edition: z.string(),
  models: z.array(PUBLISHED_MODEL),
})
export type EditionModels = z.infer<typeof EDITION_MODELS>

/**
 * `catalog/search-index.json` — §6.2's third leg.
 *
 * **The matchable text is computed here, at build time, rather than in the
 * browser.** `buildSearchIndex` used to run over the whole catalogue on the
 * first keystroke of a session; what it produces per model is one normalised
 * string, and that string is small — the reference, the series and its aka, the
 * family, the line, the edition and its aka, all stripped to ASCII and
 * lowercased. Shipping the string instead of the eleven fields it was derived
 * from is what makes searching cost a fraction of the catalogue.
 *
 * The entries carry only what the dropdown row draws: the reference, the
 * photograph, the line for its accent, and the name and year for the second
 * line. Pressing a result navigates to `/watch/<id>`, which fetches the model
 * file — so nothing here needs a specification.
 *
 * **The results page is a different question and does not read this file for
 * its models.** It renders a full `WatchGrid` under a `FilterBar`, which filters
 * on `display`, `movement`, `features` and `year`; those are not here and must
 * not be, or this stops being slim. It matches against these entries and then
 * reads the line files the hits belong to — usually one or two, and already
 * cached if the reader came from a line page.
 */
export const SEARCH_ENTRY = z.strictObject({
  id: z.string(),
  ref: z.string(),
  line: z.string(),
  series: z.string(),
  name: z.string().optional(),
  year: z.number().int().optional(),
  image: z.string().optional(),
  /** Normalised at build time by `search.ts`'s own `normalise`. */
  text: z.string(),
})
export type SearchEntryDocument = z.infer<typeof SEARCH_ENTRY>

export const SEARCH_INDEX_FILE = z.strictObject({
  ...STAMP,
  entries: z.array(SEARCH_ENTRY),
})
export type SearchIndexFile = z.infer<typeof SEARCH_INDEX_FILE>
