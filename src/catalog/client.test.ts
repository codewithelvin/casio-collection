import { describe, expect, it, vi } from 'vitest'
import {
  browsable,
  compareByRef,
  CATALOG_INDEX_PATH,
  CATALOG_PATH,
  catalogIndexQueryOptions,
  catalogQueryOptions,
  editionById,
  fetchCatalog,
  fetchCatalogIndex,
  imageSources,
  modelsInEdition,
  lineBySlug,
  lineTree,
  modelById,
  modelsInLine,
  modelsInSeries,
  otherModelsInSeries,
  seriesById,
  seriesInLine,
} from './client.ts'
import type { Catalog, PublishedModel } from './schema.ts'
import { catalogFixture, catalogFixtureJson, catalogIndexFixtureJson } from '../test/catalogFixture'

/**
 * `image` is on by default because `browsable` withholds a model without one
 * since 2026-08-26. A helper with no photograph would make every selector here
 * return an empty list, which reads as a broken selector rather than a fixture
 * with no pictures in it. A test that wants the withheld case passes
 * `image: null`.
 */
const model = (overrides: Partial<PublishedModel>): PublishedModel => ({
  id: 'x-1',
  ref: 'X-1',
  line: 'vintage',
  series: 'x',
  source: { url: 'https://example.com/x-1', kind: 'community' },
  image: overrides.id ?? 'x-1',
  ...overrides,
})

describe('fetching the published catalogue', () => {
  it('parses a valid artefact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => catalogFixtureJson() })),
    )

    const catalog = await fetchCatalog()
    expect(catalog.models).toHaveLength(catalogFixture.models.length)
    expect(catalog.version).toBe(catalogFixture.version)
  })

  it('reads its path from BASE_URL rather than a literal (D13)', () => {
    expect(CATALOG_PATH.endsWith('catalog/catalog.json')).toBe(true)
    expect(CATALOG_PATH.startsWith(import.meta.env.BASE_URL)).toBe(true)
  })

  it('throws on a non-OK response rather than returning an empty catalogue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    )
    // An empty catalogue would render as "Casio made nothing", which is the
    // silent failure the parse exists to make loud.
    await expect(fetchCatalog()).rejects.toThrow(/404/)
  })

  it('throws when the artefact does not match the schema', async () => {
    // A stale edge cache or an old service worker can serve last month's shape
    // long after the file has moved on. §6.2 makes this the one place that finds
    // out, rather than an undefined field deep inside a render.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: 'x' }) })),
    )
    await expect(fetchCatalog()).rejects.toThrow()
  })

  it('passes an abort signal through when given one', async () => {
    const spy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => catalogFixtureJson(),
    }))
    vi.stubGlobal('fetch', spy)

    const controller = new AbortController()
    await fetchCatalog(controller.signal)

    expect(spy).toHaveBeenCalledWith(CATALOG_PATH, { signal: controller.signal })
  })
})

describe('fetching the index (§6.2, the split)', () => {
  it('parses an artefact with no models at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => catalogIndexFixtureJson() })),
    )

    const index = await fetchCatalogIndex()
    expect(index.version).toBe(catalogFixture.version)
    expect(index.lines).toHaveLength(catalogFixture.lines.length)
    expect(index.series).toHaveLength(catalogFixture.series.length)
    // The point of the file. `strictObject` is what enforces it: a `models` key
    // arriving here would be rejected rather than quietly doubling the download
    // the split exists to avoid.
    expect('models' in index).toBe(false)
  })

  it('rejects a catalogue served at the index path', async () => {
    // Which is the failure a stale edge cache or an old service worker produces
    // — the two artefacts differ by one key, so nothing else would notice.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => catalogFixtureJson() })),
    )
    await expect(fetchCatalogIndex()).rejects.toThrow()
  })

  it('reads its path from BASE_URL rather than a literal (D13)', () => {
    expect(CATALOG_INDEX_PATH.endsWith('catalog/catalog-index.json')).toBe(true)
    expect(CATALOG_INDEX_PATH.startsWith(import.meta.env.BASE_URL)).toBe(true)
  })

  it('does not contain the catalogue path as a substring', () => {
    // A test about a string, guarding a real bug: every fetch stub and service
    // worker rule in this repo matches on the filename, and `catalog.json` is
    // *not* a substring of `catalog-index.json` — so a matcher written for one
    // silently misses the other and the rail waits forever on a 404.
    expect(CATALOG_INDEX_PATH.includes('catalog.json')).toBe(false)
  })

  it('throws on a non-OK response rather than returning an empty catalogue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    )
    await expect(fetchCatalogIndex()).rejects.toThrow(/404/)
  })

  it('caches under its own key, so neither query can serve the other', () => {
    // Two keys for one file would be the mistake §7.2 warns about; two keys for
    // two files is what keeps a screen holding the index from being handed a
    // document with no models in it.
    expect(catalogIndexQueryOptions.queryKey).not.toEqual(catalogQueryOptions.queryKey)
  })
})

describe('ordering and tombstones', () => {
  it('sorts references numerically, so F-103 does not precede F-15', () => {
    const refs = [model({ id: 'f-103', ref: 'F-103' }), model({ id: 'f-15', ref: 'F-15' })]
    expect([...refs].sort(compareByRef).map((entry) => entry.ref)).toEqual(['F-15', 'F-103'])
  })

  it('excludes tombstoned entries from anything that counts', () => {
    const models = [
      model({ id: 'live', ref: 'A-1' }),
      model({ id: 'dead', ref: 'A-2', tombstone: { reason: 'duplicate' } }),
    ]
    expect(browsable(models).map((entry) => entry.id)).toEqual(['live'])
  })
})

describe('selectors over the catalogue', () => {
  const catalog: Catalog = catalogFixture

  it('finds a line by its slug and nothing by a slug that is not one', () => {
    expect(lineBySlug(catalog, 'vintage')?.name).toBe('Vintage / Casio Collection')
    expect(lineBySlug(catalog, 'nope')).toBeUndefined()
    expect(lineBySlug(catalog, undefined)).toBeUndefined()
  })

  it('finds a series and a model by id, and undefined without one', () => {
    expect(seriesById(catalog, 'f-91w')?.name).toBe('F-91W')
    expect(seriesById(catalog, undefined)).toBeUndefined()
    expect(modelById(catalog, 'f-91w-1')?.ref).toBe('F-91W-1')
    expect(modelById(catalog, undefined)).toBeUndefined()
    expect(modelById(catalog, 'not-a-model')).toBeUndefined()
  })

  it('lists the series and the models of a line', () => {
    expect(seriesInLine(catalog, 'vintage').map((series) => series.id)).toEqual(['f-91w'])
    expect(modelsInLine(catalog, 'vintage').map((entry) => entry.ref)).toEqual([
      'F-91W-1',
      'F-91W-3',
    ])
    expect(modelsInLine(catalog, 'edifice')).toEqual([])
  })

  it('lists the models of a series in reference order', () => {
    // `f-91w`, not `dw-5600`. The DW-5600 series holds `dw-5600bb-1`, which
    // carries no photograph and is therefore withheld — so that series can only
    // return one model and an ordering assertion over it proves nothing. F-91W
    // holds two photographed references, which is what this test needs.
    expect(modelsInSeries(catalog, 'f-91w').map((entry) => entry.ref)).toEqual([
      'F-91W-1',
      'F-91W-3',
    ])
  })

  it('withholds a model with no photograph from a series listing', () => {
    // The other half of the rule above, asserted rather than implied: DW-5600
    // holds three references in the fixture and shows the two with pictures.
    // DW-5600BB-1 carries no photograph and does not appear.
    expect(modelsInSeries(catalog, 'dw-5600').map((entry) => entry.ref)).toEqual([
      'DW-5600C-1',
      'DW-5600E-1V',
    ])
  })

  it('excludes the current model from the rest of its series (FR-3.4)', () => {
    const current = modelById(catalog, 'f-91w-1')
    expect(current).toBeDefined()
    const others = otherModelsInSeries(catalog, current as PublishedModel)
    expect(others.map((entry) => entry.id)).toEqual(['f-91w-3'])
  })
})

describe('editions (D62)', () => {
  const catalog: Catalog = catalogFixture

  it('finds an edition by id and nothing by an id that is not one', () => {
    expect(editionById(catalog, 'pac-man')?.name).toBe('PAC-MAN Collaboration')
    expect(editionById(catalog, 'nope')).toBeUndefined()
    expect(editionById(catalog, undefined)).toBeUndefined()
  })

  it('lists an edition’s references across the lines and series they sit in', () => {
    // The whole reason the screen exists: these two are in different series and
    // different lines, and no other URL on this site shows them together.
    const models = modelsInEdition(catalog, 'pac-man')
    expect(models.map((model) => model.ref)).toEqual(['F-91W-1', 'GA-2100-1A1'])
    expect(new Set(models.map((model) => model.line)).size).toBe(2)
  })

  it('leaves a model in no edition out of every edition', () => {
    expect(modelsInEdition(catalog, 'pac-man').map((model) => model.id)).not.toContain(
      'dw-5600e-1v',
    )
    expect(modelsInEdition(catalog, 'not-an-edition')).toEqual([])
  })

  it('excludes a tombstoned reference, as every other grid does', () => {
    const withRetired: Catalog = {
      ...catalogFixture,
      models: [
        ...catalogFixture.models,
        {
          id: 'ga-2100-2a1',
          ref: 'GA-2100-2A1',
          line: 'g-shock',
          series: 'ga-2100',
          source: { url: 'https://example.com/ga-2100-2a1', kind: 'official' },
          edition: 'pac-man',
          tombstone: { reason: 'a duplicate' },
        },
      ],
    }
    expect(modelsInEdition(withRetired, 'pac-man').map((model) => model.id)).not.toContain(
      'ga-2100-2a1',
    )
  })
})

describe('the line tree (§8.4)', () => {
  it('renders a family holding two or more series as a heading', () => {
    const tree = lineTree(catalogFixture, 'g-shock')
    const square = tree.families.find((group) => group.family.id === 'square')
    expect(square?.series.map((series) => series.id)).toEqual(['dw-5600', 'gw-m5610'])
  })

  it('does not render a family holding one series, and lets that series fall through', () => {
    // A heading over a single series earns nothing, and the series still has to
    // be reachable — that is what lets D32 keep the family out of the URL.
    const tree = lineTree(catalogFixture, 'g-shock')
    expect(tree.families.map((group) => group.family.id)).not.toContain('octagonal')
    expect(tree.ungrouped.map((series) => series.id)).toContain('ga-2100')
  })

  it('puts a series with no family at all directly under the line', () => {
    const tree = lineTree(catalogFixture, 'vintage')
    expect(tree.families).toEqual([])
    expect(tree.ungrouped.map((series) => series.id)).toEqual(['f-91w'])
  })

  it('leaves every series reachable with every family collapsed', () => {
    const tree = lineTree(catalogFixture, 'g-shock')
    const reachable = new Set([
      ...tree.ungrouped.map((series) => series.id),
      ...tree.families.flatMap((group) => group.series.map((series) => series.id)),
    ])
    for (const series of seriesInLine(catalogFixture, 'g-shock')) {
      expect(reachable.has(series.id)).toBe(true)
    }
  })
})

describe('image sources (§8.6, NFR-7)', () => {
  it('returns nothing at all for a model with no photograph', () => {
    // Not a path that 404s — the typographic tile is a primary state and the
    // card decides on the absence of sources, not on an image failing to load.
    expect(imageSources(undefined)).toBeNull()
  })

  it('builds the 1x and 2x paths catalog:images actually writes', () => {
    const sources = imageSources('f-91w-1')
    expect(sources?.src).toBe(`${import.meta.env.BASE_URL}img/models/f-91w-1.webp`)
    expect(sources?.srcSet).toContain('@2x.webp 2x')
  })
})
