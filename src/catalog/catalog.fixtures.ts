import type { CatalogSource, SeriesSource } from './integrity.ts'
import type { LinesFile, Model } from './schema.ts'

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

export function aModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'dw-5600e-1v',
    ref: 'DW-5600E-1V',
    source: { url: 'https://www.casio.com/dw-5600e-1v', kind: 'official' },
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

export function aSource(overrides: Partial<CatalogSource> = {}): CatalogSource {
  return {
    lines: aLinesFile(),
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
