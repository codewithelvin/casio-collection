import { z } from 'zod'
import { DISPLAYS, FEATURES, MOVEMENTS, SOURCE_KINDS } from './vocabulary.ts'

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

/** Decoration for the spec table (FR-3.2), not a facet — hence no vocabulary. */
export const CASE = z.strictObject({
  material: z.string().min(1).nullish(),
  width_mm: z.number().positive().nullish(),
  height_mm: z.number().positive().nullish(),
  depth_mm: z.number().positive().nullish(),
  weight_g: z.number().positive().nullish(),
})

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
  // Range checked in integrity.ts rather than here, so the message can name the
  // year and the file instead of reading "invalid input".
  year: z.number().int().nullish(),
  display: z.enum(DISPLAYS).nullish(),
  movement: z.enum(MOVEMENTS).nullish(),
  module: z.string().min(1).nullish(),
  case: CASE.nullish(),
  water_resistance_m: z.number().int().nonnegative().nullish(),
  features: z.array(z.enum(FEATURES)).nullish(),
  colorway: z.string().min(1).nullish(),
  /** The image basename, which is the model id by convention. `null` is normal. */
  image: idField.nullish(),
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
  year: z.number().int().optional(),
  display: z.enum(DISPLAYS).optional(),
  movement: z.enum(MOVEMENTS).optional(),
  module: z.string().optional(),
  case: publishedCase.optional(),
  water_resistance_m: z.number().optional(),
  features: z.array(z.enum(FEATURES)).optional(),
  colorway: z.string().optional(),
  image: z.string().optional(),
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

/** Everything except the stamp — this is what the version digest is taken over. */
export const CATALOG_PAYLOAD = z.strictObject({
  lines: z.array(PUBLISHED_LINE),
  families: z.array(PUBLISHED_FAMILY),
  series: z.array(PUBLISHED_SERIES),
  models: z.array(PUBLISHED_MODEL),
  facets: z.record(z.string(), FACET_SUMMARY),
})
export type CatalogPayload = z.infer<typeof CATALOG_PAYLOAD>

/**
 * The stamp is spread in **before** the payload rather than extended on after,
 * because Zod rebuilds an object in the order of its shape and that order is
 * what lands in the file. §6.2 shows `version` and `generatedAt` at the top and
 * that is where a human opening the artefact looks for them.
 */
export const CATALOG = z.strictObject({
  /** §6.2 — the build stamp, and the cache-busting query. */
  version: z.string().min(1),
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ...CATALOG_PAYLOAD.shape,
})
export type Catalog = z.infer<typeof CATALOG>
