import { describe, expect, it } from 'vitest'
import { auditCatalogue, renderAudit, type AuditInput } from './audit.ts'
import { buildCatalog } from './build.ts'
import { aLinesFile, aModel, aSeries, aShownModel, aShownSource } from './catalog.fixtures.ts'
import type { CatalogSource } from './integrity.ts'

/**
 * §10.5 — the audit reports what the build is happy with.
 *
 * Every test here therefore starts from a source that **passes** `catalog:validate`
 * and asserts that the audit still has something to say about it. A test that
 * proved the audit noticed a build failure would be proving the wrong thing:
 * `integrity.test.ts` already covers those, and the whole reason this command
 * exists is the class of problem no check will ever raise.
 */

function auditOf(source: CatalogSource, extra: Partial<AuditInput> = {}) {
  return auditCatalogue({
    payload: buildCatalog(source),
    images: source.images,
    publishedIds: source.publishedIds,
    parseFailures: [],
    size: null,
    ...extra,
  })
}

describe('1 — unsourced fields', () => {
  it('reports each optional field against the models of its own series', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v', ref: 'DW-5600E-1V', year: 1996, movement: 'quartz' }),
            aShownModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1', movement: 'quartz' }),
          ],
        }),
      ],
    })

    const [series] = auditOf(source).unsourced
    expect(series).toMatchObject({ line: 'g-shock', series: 'dw-5600', models: 2 })

    const year = series?.gaps.find((gap) => gap.field === 'year')
    expect(year).toEqual({ field: 'year', missing: 1, total: 2, ids: ['dw-5600bb-1'] })
    // A field every model carries is not a gap and is not printed.
    expect(series?.gaps.some((gap) => gap.field === 'movement')).toBe(false)
  })

  it('names the models carrying nothing beyond id, ref and source', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [
            // One photographed, so the series publishes at all; one genuinely
            // bare, which is the subject. `aShownModel` would give the bare one
            // an image and a credit and leave this test with nothing to find.
            aShownModel({ id: 'dw-5600e-1v', year: 1996 }),
            aModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1' }),
          ],
        }),
      ],
    })

    expect(auditOf(source).unsourced[0]?.bare).toEqual(['dw-5600bb-1'])
  })

  it('leaves out a series with nothing browsable in it', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [aShownModel({ tombstone: { reason: 'never existed' } })],
        }),
      ],
    })

    const report = auditOf(source)
    expect(report.unsourced).toEqual([])
    expect(report.models).toBe(0)
    expect(report.tombstoned).toBe(1)
  })

  it('counts the source kinds, which is the FR-D1 number a reader sees', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v' }),
            aShownModel({
              id: 'dw-5600c-1',
              ref: 'DW-5600C-1',
              source: { url: 'https://wiki/x', kind: 'community' },
            }),
          ],
        }),
      ],
    })

    expect(auditOf(source).sources).toEqual({ official: 1, retailer: 0, community: 1 })
  })
})

describe('2 — missing images', () => {
  it('separates a model with no photograph from one whose file is not there', () => {
    const source = aShownSource({
      images: new Set(['dw-5600e-1v.webp']),
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v', image: 'dw-5600e-1v' }),
            aShownModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1', image: null }),
          ],
        }),
      ],
    })

    const { images } = auditOf(source)
    expect(images.without).toEqual(['dw-5600bb-1'])
    expect(images.broken).toEqual([{ id: 'dw-5600e-1v', missing: ['dw-5600e-1v@2x.webp'] }])
  })

  it('reports a webp no model claims, at either width, once', () => {
    const source = aShownSource({
      images: new Set(['ga-2100-1a1.webp', 'ga-2100-1a1@2x.webp']),
      series: [aSeries({ models: [aShownModel({ image: null })] })],
    })

    expect(auditOf(source).images.orphans).toEqual(['ga-2100-1a1'])
  })

  it('does not ask anyone to photograph a tombstone', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v', image: null }),
            aShownModel({ id: 'dw-5600-dupe', ref: 'DW-5600-DUPE', tombstone: { reason: 'duplicate' } }),
          ],
        }),
      ],
    })

    expect(auditOf(source).images.without).toEqual(['dw-5600e-1v'])
  })
})

describe('3 — out-of-vocabulary facets', () => {
  it('carries through the values the schema refused', () => {
    const report = auditOf(aShownSource(), {
      parseFailures: [
        {
          check: '6',
          where: 'catalog-src/vintage/f-91w.yaml: models.0.features.0',
          message: '"stopwach" is not …',
        },
        { check: 'schema', where: 'elsewhere', message: 'unrelated' },
      ],
    })

    expect(report.vocabulary.rejected).toHaveLength(1)
    expect(report.vocabulary.rejected[0]?.where).toContain('features.0')
  })

  it('names a facet value carried by exactly one model', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v', movement: 'quartz', features: ['stopwatch'] }),
            aShownModel({
              id: 'dw-5600bb-1',
              ref: 'DW-5600BB-1',
              movement: 'quartz',
              features: ['stopwatch', 'tide-graph'],
            }),
          ],
        }),
      ],
    })

    expect(auditOf(source).vocabulary.singletons).toEqual([
      { field: 'features', value: 'tide-graph' },
    ])
  })

  it('says nothing about a year with one model in it — that is a thin catalogue, not a typo', () => {
    const source = aShownSource({
      series: [aSeries({ models: [aShownModel({ year: 1996 })] })],
    })

    expect(auditOf(source).vocabulary.singletons).toEqual([])
  })
})

describe('5 — id drift', () => {
  it('reports a published id that is no longer in the source (D2)', () => {
    const source = aShownSource({ publishedIds: ['dw-5600e-1v', 'f-91w-1'] })

    expect(auditOf(source).drift.vanished).toEqual(['f-91w-1'])
  })

  it('reports the ids the next build makes permanent', () => {
    const source = aShownSource({ publishedIds: ['dw-5600e-1v'] })

    expect(auditOf(source).drift.pending).toEqual(['gw-m5610u-1'])
  })

  it('lists tombstones with and without a successor', () => {
    const source = aShownSource({
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v' }),
            aShownModel({
              id: 'dw-5600-dupe',
              ref: 'DW-5600-DUPE',
              tombstone: { reason: 'dup', replaced_by: 'dw-5600e-1v' },
            }),
            aShownModel({
              id: 'dw-5600-ghost',
              ref: 'DW-5600-GHOST',
              tombstone: { reason: 'never existed' },
            }),
          ],
        }),
      ],
    })

    expect(auditOf(source).drift.tombstones).toEqual([
      { id: 'dw-5600-dupe', replacedBy: 'dw-5600e-1v' },
      { id: 'dw-5600-ghost', replacedBy: null },
    ])
  })
})

describe('a catalogue that would not parse', () => {
  it('still reports what it knows, with the sections that need a payload gone quiet', () => {
    const report = auditCatalogue({
      payload: null,
      images: new Set(['orphan.webp']),
      publishedIds: ['f-91w-1'],
      parseFailures: [
        { check: '6', where: 'catalog-src/vintage/f-91w.yaml', message: 'bad feature' },
      ],
      size: null,
    })

    expect(report.models).toBe(0)
    expect(report.unsourced).toEqual([])
    expect(report.vocabulary.rejected).toHaveLength(1)
    // The manifest is read straight off disk, so D2's check still has an answer.
    expect(report.drift.vanished).toEqual(['f-91w-1'])
    expect(report.images.orphans).toEqual(['orphan'])
  })
})

describe('rendering', () => {
  it('reads as a work list: the field, how many lack it, and which ones', () => {
    const source = aShownSource({
      images: new Set<string>(),
      publishedIds: [],
      series: [
        aSeries({
          models: [
            aShownModel({ id: 'dw-5600e-1v', year: 1996, features: ['stopwatch'] }),
            // Bare on purpose — see the note on the `bare` test above.
            aModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1' }),
          ],
        }),
      ],
    })

    const text = renderAudit(auditOf(source, { size: { bytes: 2048, gzipBytes: 600, models: 2 } }))

    expect(text).toContain('2 browsable models')
    expect(text).toContain('1. Unsourced fields')
    expect(text).toContain('· year')
    expect(text).toContain('dw-5600bb-1')
    expect(text).toContain('nothing but id, ref and source: dw-5600bb-1')
    expect(text).toContain('2. Missing images')
    expect(text).toContain('3. Out-of-vocabulary facets')
    expect(text).toContain('4. Budget')
    expect(text).toContain('0.6 KB gzipped')
    expect(text).toContain('5. Id drift')
    expect(text).toContain('the next build publishes for the first time')
  })

  it('says so plainly when there is nothing to report', () => {
    const source = aShownSource({
      images: new Set(['dw-5600e-1v.webp', 'dw-5600e-1v@2x.webp']),
      publishedIds: ['dw-5600e-1v'],
      series: [
        aSeries({ models: [aShownModel({ image: 'dw-5600e-1v', year: 1996, movement: 'quartz' })] }),
      ],
    })

    const text = renderAudit(auditOf(source))

    expect(text).toContain('every model has an image at both widths.')
    expect(text).toContain('the manifest and the source agree.')
    expect(text).toContain('nothing was serialised')
  })

  it('caps a long list of ids rather than printing a screen of them', () => {
    const models = Array.from({ length: 9 }, (_, index) =>
      aShownModel({ id: `dw-5600-${index}`, ref: `DW-5600-${index}` }),
    )
    const source = aShownSource({ lines: aLinesFile(), series: [aSeries({ models })] })

    expect(renderAudit(auditOf(source))).toContain('+3 more')
  })

  it('reports an empty catalogue as empty rather than as clean', () => {
    const text = renderAudit(
      auditCatalogue({
        payload: null,
        images: new Set(),
        publishedIds: [],
        parseFailures: [],
        size: null,
      }),
    )

    expect(text).toContain('0 browsable models')
    expect(text).toContain('no models yet.')
  })

  it('prints the one thing a seeding session most wants to see: a series with every field filled', () => {
    const source = aShownSource({
      images: new Set(['dw-5600e-1v.webp', 'dw-5600e-1v@2x.webp']),
      series: [
        aSeries({
          models: [
            aShownModel({
              image: 'dw-5600e-1v',
              name: 'Origin',
              year: 1996,
              display: 'digital',
              movement: 'quartz',
              module: '1545',
              case: { material: 'resin', width_mm: 42.8 },
              water_resistance_m: 200,
              features: ['stopwatch'],
              colorway: 'Black',
            }),
          ],
        }),
      ],
    })

    expect(renderAudit(auditOf(source))).toContain('every optional field is filled')
  })
})
