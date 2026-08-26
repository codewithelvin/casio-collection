import type { CatalogSource, SeriesSource } from './integrity.ts'
import type { Edition, LinesFile, Model } from './schema.ts'

/**
 * Test data for the pipeline. Excluded from coverage in `vite.config.ts` — it is
 * scaffolding, and counting it would let a fixture inflate the D31 floor that
 * exists to be hard to reach.
 *
 * The default source is a **clean catalogue that produces no failures and no
 * warnings**, so every test can say precisely which one thing it broke. Two
 * series share the `square` family on purpose: a family of one is a warning
 * (D32), and a fixture that carries a warning by default hides the test for it.
 */

/** The pattern every line starts with (see `catalog-src/lines.yaml`). */
export const REF_PATTERN = '[A-Z]{1,5}-?[A-Z]{0,2}[0-9]{2,5}[A-Z0-9]*(?:-[A-Z0-9]{1,6})*'

/**
 * **Deliberately minimal — the five required fields of D27 and nothing else.**
 * Do not give this a photograph by default. It was tried on 2026-08-26 and it
 * breaks the two things this fixture exists for: every `check 5` and `check 5a`
 * test states its own image case, and the audit test about "a model carrying
 * nothing beyond id, ref and source" has no subject left.
 *
 * Since a model with no `image` is now withheld from grids and counts
 * (`browsable` in `client.ts`), a test that asserts on a **count** wants
 * `aShownModel` below instead.
 */
export function aModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'dw-5600e-1v',
    ref: 'DW-5600E-1V',
    source: { url: 'https://www.casio.com/dw-5600e-1v', kind: 'official' },
    ...overrides,
  }
}

/**
 * A model that a grid will actually show: `aModel` plus the photograph and the
 * credit D41 will not let travel without it.
 *
 * `image` is derived from the id because `image: <id>` is the convention
 * `catalog:images` enforces, and two models sharing one file is not a state the
 * real catalogue can reach. Pair it with `publishedImages` so check 5 can find
 * the `.webp` it claims.
 */
export function aShownModel(overrides: Partial<Model> = {}): Model {
  const base = aModel(overrides)
  return { image: base.id, image_credit: aCredit(), ...base }
}

/** The `images` set that makes every photograph in these models real (check 5). */
export function publishedImages(...models: readonly Model[]): Set<string> {
  const names = new Set<string>()
  for (const model of models) {
    if (!model.image) continue
    names.add(`${model.image}.webp`)
    names.add(`${model.image}@2x.webp`)
  }
  return names
}

/**
 * `aSource`, but every model carries a photograph and every photograph is
 * published.
 *
 * **This is the fixture for anything that asserts on a count.** A model with no
 * `image` is withheld from grids, counts, facets and — since a series with
 * nothing browsable is not published either — from `catalog.series`. So a test
 * about ordering, counts, editions or facets written on `aSource` is asserting
 * against a catalogue that publishes nothing, and the failure looks like a bug
 * in the thing under test rather than a fixture with no pictures in it.
 *
 * `aSource` itself stays photograph-less on purpose: `check 5`, `check 5a` and
 * the audit's "carrying nothing beyond id, ref and source" all need that.
 */
export function aShownSource(overrides: Partial<CatalogSource> = {}): CatalogSource {
  const series =
    overrides.series ??
    [
      aSeries({ models: [aShownModel()] }),
      aSeries({
        file: 'catalog-src/g-shock/gw-m5610.yaml',
        series: { id: 'gw-m5610', name: 'GW-M5610', line: 'g-shock', family: 'square' },
        models: [aShownModel({ id: 'gw-m5610u-1', ref: 'GW-M5610U-1' })],
      }),
    ]

  return {
    ...aSource({ ...overrides, series }),
    images: overrides.images ?? publishedImages(...series.flatMap((entry) => entry.models)),
  }
}

/**
 * D41 — a photograph never travels without its credit, so neither does a
 * fixture that carries one. A test that set an image and no credit would be
 * asserting against a state check 5a exists to make impossible.
 */
export function aCredit(overrides: Partial<Model['image_credit']> = {}) {
  return {
    author: 'Multicherry',
    licence: 'cc-by-sa-4.0' as const,
    url: 'https://commons.wikimedia.org/wiki/File:Casio_F-91W.jpg',
    ...overrides,
  }
}

export function aSeries(overrides: Partial<SeriesSource> = {}): SeriesSource {
  return {
    file: 'catalog-src/g-shock/dw-5600.yaml',
    folder: 'g-shock',
    series: { id: 'dw-5600', name: 'DW-5600', line: 'g-shock', family: 'square' },
    models: [aModel()],
    refExceptions: new Set<string>(),
    ...overrides,
  }
}

export function aLinesFile(overrides: Partial<LinesFile['lines'][number]> = {}): LinesFile {
  return {
    lines: [
      {
        id: 'g-shock',
        name: 'G-SHOCK',
        slug: 'g-shock',
        accent: '#F25C05',
        ref_pattern: REF_PATTERN,
        families: [
          { id: 'square', name: 'The square' },
          { id: 'octagonal', name: 'Octagonal' },
        ],
        ...overrides,
      },
      {
        id: 'vintage',
        name: 'Vintage / Casio Collection',
        slug: 'vintage',
        accent: '#B08D57',
        ref_pattern: REF_PATTERN,
      },
    ],
  }
}

export function anEdition(overrides: Partial<Edition> = {}): Edition {
  return {
    id: 'pac-man',
    name: 'PAC-MAN Collaboration',
    partner: 'Bandai Namco Entertainment Inc.',
    source: { url: 'https://www.casio.com/pac-man_collaboration/', kind: 'official' },
    ...overrides,
  }
}

/**
 * The default source declares **no editions and names none**, which keeps it the
 * clean catalogue this file promises: an edition nothing is in is a warning
 * (D62), so a fixture carrying one by default would hide the test written for
 * it. The tests that are about editions pass their own pair.
 */
/**
 * `images` stays **empty by default and is never derived**. Deriving it was
 * tried on 2026-08-26 and it silently disarmed every `check 5` test: a test that
 * claims a photograph in order to watch the check fail got the file invented
 * underneath it and the check passed.
 *
 * A test that wants photographs to be real passes
 * `images: publishedImages(...models)`.
 */
export function aSource(overrides: Partial<CatalogSource> = {}): CatalogSource {
  return {
    lines: aLinesFile(),
    editions: [],
    series: [
      aSeries(),
      aSeries({
        file: 'catalog-src/g-shock/gw-m5610.yaml',
        series: { id: 'gw-m5610', name: 'GW-M5610', line: 'g-shock', family: 'square' },
        models: [aModel({ id: 'gw-m5610u-1', ref: 'GW-M5610U-1' })],
      }),
    ],
    publishedIds: [],
    images: new Set<string>(),
    ...overrides,
  }
}

/** The current year the checks are run against, fixed so check 9 is not a clock. */
export const CURRENT_YEAR = 2026
