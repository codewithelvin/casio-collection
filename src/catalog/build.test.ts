import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  digestInput,
  indexOf,
  serialiseCatalog,
  serialiseIndex,
  stamp,
} from './build.ts'
import { aModel, aSeries, aSource, anEdition } from './catalog.fixtures.ts'

describe('the published artefact (§6.2)', () => {
  it('keeps the lines in editorial order and counts what is in them', () => {
    const catalog = buildCatalog(aSource())
    expect(catalog.lines.map((line) => line.id)).toEqual(['g-shock'])
    expect(catalog.lines.map((line) => line.order)).toEqual([0])
    expect(catalog.lines.find((line) => line.id === 'g-shock')?.count).toBe(2)
  })

  it('does not publish a line with nothing in it (D51)', () => {
    // `vintage` is declared in this source's lines.yaml and holds no models. It
    // used to publish with a count of 0, and the front door rendered that as a
    // "Not catalogued yet" card — a category with nothing behind it, which is
    // the thing D51 exists to make impossible rather than merely absent.
    expect(buildCatalog(aSource()).lines.map((line) => line.id)).not.toContain('vintage')
  })

  it('takes a line’s order from where it is declared, not from what survives', () => {
    // g-shock is declared first and vintage second. Put the models in vintage
    // and none in g-shock: vintage must still publish with order 1. Numbering
    // the survivors instead would reshuffle the front door every time a line is
    // seeded, which is exactly what lines.yaml's "no order: field" note forbids.
    const catalog = buildCatalog(
      aSource({
        series: [
          aSeries({
            file: 'catalog-src/vintage/f-91w.yaml',
            folder: 'vintage',
            series: { id: 'f-91w', name: 'F-91W', line: 'vintage' },
            models: [aModel({ id: 'f-91w-1', ref: 'F-91W-1' })],
          }),
        ],
      }),
    )
    expect(catalog.lines.map((line) => line.id)).toEqual(['vintage'])
    expect(catalog.lines.find((line) => line.id === 'vintage')?.order).toBe(1)
  })

  it('writes the line and the series onto every model, because the YAML does not repeat them', () => {
    const catalog = buildCatalog(aSource())
    for (const model of catalog.models) {
      expect(model.line).toBe('g-shock')
      expect(['dw-5600', 'gw-m5610']).toContain(model.series)
    }
  })

  it('omits an unknown field instead of publishing a null', () => {
    const catalog = buildCatalog(
      aSource({
        series: [aSeries({ models: [aModel({ year: null, name: null, features: [] })] })],
      }),
    )
    const model = catalog.models[0]
    expect(model).toBeDefined()
    expect(Object.keys(model!)).toEqual(['id', 'ref', 'line', 'series', 'source'])
    expect(serialiseCatalog(stamp(catalog, 'x', '2026-08-16'))).not.toContain('null')
  })

  it('publishes discontinued: false, and only omits it when nobody measured (D59)', () => {
    // `false` used to be dropped alongside null, which made *still listed by
    // Casio* and *nobody has looked* the same absent key — and the availability
    // filter cannot be built on top of that.
    const catalog = buildCatalog(
      aSource({
        series: [
          aSeries({
            models: [
              aModel({ id: 'a-1', ref: 'A-1', discontinued: false }),
              aModel({ id: 'b-1', ref: 'B-1', discontinued: true }),
              aModel({ id: 'c-1', ref: 'C-1' }),
              aModel({ id: 'd-1', ref: 'D-1', discontinued: null }),
            ],
          }),
        ],
      }),
    )
    const byId = new Map(catalog.models.map((entry) => [entry.id, entry]))
    expect(byId.get('a-1')?.discontinued).toBe(false)
    expect(byId.get('b-1')?.discontinued).toBe(true)
    // Absent and an explicit null are the same statement (D27), and neither is a
    // claim about Casio's catalogue.
    expect(byId.get('c-1')).not.toHaveProperty('discontinued')
    expect(byId.get('d-1')).not.toHaveProperty('discontinued')
  })

  it('drops an empty case object rather than publishing an empty one', () => {
    const catalog = buildCatalog(
      aSource({
        series: [aSeries({ models: [aModel({ case: { material: null, width_mm: null } })] })],
      }),
    )
    expect(catalog.models[0]?.case).toBeUndefined()
  })

  it('publishes a tombstone and counts it nowhere (D2, FR-3.6)', () => {
    const catalog = buildCatalog(
      aSource({
        series: [
          aSeries({
            models: [
              aModel(),
              aModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1', tombstone: { reason: 'duplicate' } }),
            ],
          }),
        ],
      }),
    )
    expect(catalog.models).toHaveLength(2)
    expect(catalog.series[0]?.count).toBe(1)
    expect(catalog.lines[0]?.count).toBe(1)
    expect(catalog.facets.display?.total).toBe(1)
  })

  it('publishes a family only where a series uses it, in vocabulary order (D32)', () => {
    const withFamily = buildCatalog(aSource())
    expect(withFamily.families).toEqual([
      { id: 'square', name: 'The square', line: 'g-shock', order: 0 },
    ])

    const withoutFamily = buildCatalog(
      aSource({
        series: [aSeries({ series: { id: 'dw-5600', name: 'DW-5600', line: 'g-shock' } })],
      }),
    )
    expect(withoutFamily.families).toEqual([])
  })

  it('gives a series the id as its slug', () => {
    const catalog = buildCatalog(aSource())
    expect(catalog.series.every((series) => series.slug === series.id)).toBe(true)
  })

  it('produces the same bytes from the same source, every time', () => {
    // Guardrail 7, and the reason the version can be a digest of the content.
    const a = digestInput(buildCatalog(aSource()))
    const b = digestInput(buildCatalog(aSource()))
    expect(a).toBe(b)
  })

  it('sorts models by line order, then series, then reference', () => {
    const catalog = buildCatalog(
      aSource({
        series: [
          aSeries({
            models: [aModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1' }), aModel()],
          }),
          ...aSource().series.slice(1),
        ],
      }),
    )
    expect(catalog.models.map((model) => model.ref)).toEqual([
      'DW-5600BB-1',
      'DW-5600E-1V',
      'GW-M5610U-1',
    ])
  })
})

describe('the editions (D62)', () => {
  /** Two editions declared; only the first is named by a model. */
  const source = () =>
    aSource({
      editions: [
        anEdition(),
        anEdition({ id: 'uno', name: 'UNO Collaboration', partner: 'Mattel' }),
      ],
      series: [
        aSeries({ models: [aModel({ edition: 'pac-man' })] }),
        aSeries({
          file: 'catalog-src/g-shock/gw-m5610.yaml',
          series: { id: 'gw-m5610', name: 'GW-M5610', line: 'g-shock', family: 'square' },
          models: [aModel({ id: 'gw-m5610u-1', ref: 'GW-M5610U-1', edition: 'pac-man' })],
        }),
      ],
    })

  it('publishes an edition with the number of references in it', () => {
    const catalog = buildCatalog(source())
    expect(catalog.editions.map((edition) => edition.id)).toEqual(['pac-man'])
    expect(catalog.editions[0]?.count).toBe(2)
    expect(catalog.editions[0]?.slug).toBe('pac-man')
  })

  it('does not publish an edition nothing is in, as it does not publish an empty line', () => {
    expect(buildCatalog(source()).editions.map((edition) => edition.id)).not.toContain('uno')
  })

  it('takes an edition’s order from where it is declared, not from what survives', () => {
    // `pac-man` is declared first and `uno` second. Put both models in `uno`:
    // it must still publish with order 1, so the editorial order of
    // editions.yaml survives an edition dropping out and coming back.
    const catalog = buildCatalog(
      aSource({
        editions: [anEdition(), anEdition({ id: 'uno', name: 'UNO Collaboration' })],
        series: [aSeries({ models: [aModel({ edition: 'uno' })] })],
      }),
    )
    expect(catalog.editions.map((edition) => [edition.id, edition.order])).toEqual([['uno', 1]])
  })

  it('counts a tombstoned reference nowhere, the way every other count works', () => {
    const catalog = buildCatalog(
      aSource({
        editions: [anEdition()],
        series: [
          aSeries({
            models: [
              aModel({ edition: 'pac-man' }),
              aModel({
                id: 'dw-5600e-2v',
                ref: 'DW-5600E-2V',
                edition: 'pac-man',
                tombstone: { reason: 'a duplicate of DW-5600E-1V' },
              }),
            ],
          }),
        ],
      }),
    )
    expect(catalog.editions[0]?.count).toBe(1)
    // Published all the same, because a retired entry stays reachable (FR-3.6).
    expect(catalog.models.map((model) => model.id)).toContain('dw-5600e-2v')
  })

  it('writes the edition onto the model, and omits the key where there is none', () => {
    const catalog = buildCatalog(source())
    expect(catalog.models[0]?.edition).toBe('pac-man')
    const plain = buildCatalog(aSource()).models[0]
    expect(plain).toBeDefined()
    expect('edition' in plain!).toBe(false)
    expect('edition_source' in plain!).toBe(false)
  })

  it('carries the edition’s own source, so the page can cite it', () => {
    expect(buildCatalog(source()).editions[0]?.source.kind).toBe('official')
  })

  it('drops an empty alias list rather than publishing one', () => {
    const catalog = buildCatalog(
      aSource({
        editions: [anEdition({ aka: [] })],
        series: [aSeries({ models: [aModel({ edition: 'pac-man' })] })],
      }),
    )
    const edition = catalog.editions[0]
    expect(edition).toBeDefined()
    expect('aka' in edition!).toBe(false)
  })
})

describe('the facets (D26)', () => {
  const withData = aSource({
    series: [
      aSeries({
        models: [
          aModel({ year: 1996, display: 'digital', features: ['stopwatch', 'alarm'] }),
          aModel({
            id: 'dw-5600bb-1',
            ref: 'DW-5600BB-1',
            year: 2018,
            display: 'digital',
            features: ['stopwatch'],
          }),
          aModel({ id: 'dw-5600c-1', ref: 'DW-5600C-1' }),
        ],
      }),
    ],
  })

  it('counts each value and reports how much of the catalogue carries the field', () => {
    const { facets } = buildCatalog(withData)
    expect(facets.display?.values).toEqual([{ value: 'digital', count: 2 }])
    expect(facets.display?.coverage).toBeCloseTo(2 / 3)
    expect(facets.features?.values).toEqual([
      { value: 'stopwatch', count: 2 },
      { value: 'alarm', count: 1 },
    ])
  })

  it('orders years newest first and everything else commonest first', () => {
    const { facets } = buildCatalog(withData)
    expect(facets.year?.values.map((value) => value.value)).toEqual(['2018', '1996'])
  })

  it('reports zero coverage rather than dividing by nothing when a line is empty', () => {
    const { facets } = buildCatalog(
      aSource({ series: [aSeries({ models: [aModel({ tombstone: { reason: 'retired' } })] })] }),
    )
    expect(facets.year?.coverage).toBe(0)
    expect(facets.year?.values).toEqual([])
  })
})

describe('the stamp', () => {
  it('puts the version and the date first, where a human opening the file looks', () => {
    const catalog = stamp(buildCatalog(aSource()), 'a1b2c3d4e5f6', '2026-08-16')
    expect(Object.keys(catalog).slice(0, 2)).toEqual(['version', 'generatedAt'])
  })

  it('refuses a date that is not a date', () => {
    expect(() => stamp(buildCatalog(aSource()), 'v1', '16 August 2026')).toThrow()
  })

  it('ends the file with a newline, so git is happy with it', () => {
    expect(
      serialiseCatalog(stamp(buildCatalog(aSource()), 'v1', '2026-08-16')).endsWith('\n'),
    ).toBe(true)
  })

  it('leaves the stamp out of the digest input, so a rebuild of the same data is the same version', () => {
    expect(digestInput(buildCatalog(aSource()))).not.toContain('generatedAt')
  })
})

describe('the index artefact (§6.2, the split)', () => {
  const catalog = stamp(buildCatalog(aSource()), 'a1b2c3d4e5f6', '2026-08-16')

  it('carries the shape of the catalogue and none of its models', () => {
    const index = indexOf(catalog)
    expect(index.lines).toEqual(catalog.lines)
    expect(index.families).toEqual(catalog.families)
    expect(index.series).toEqual(catalog.series)
    expect(index.editions).toEqual(catalog.editions)
    expect(index.facets).toEqual(catalog.facets)
    expect('models' in index).toBe(false)
  })

  it('carries the catalogue’s own version, not one of its own', () => {
    // This is the property that makes the two files safe to serve separately: an
    // index stamped `abc` is the index of the catalogue stamped `abc`, so a
    // mismatch is visible rather than a rail quietly describing last week's
    // catalogue.
    const index = indexOf(catalog)
    expect(index.version).toBe(catalog.version)
    expect(index.generatedAt).toBe(catalog.generatedAt)
  })

  it('puts the version and the date first, as the catalogue does', () => {
    expect(Object.keys(indexOf(catalog)).slice(0, 2)).toEqual(['version', 'generatedAt'])
  })

  it('is not pretty-printed, because it is fetched before every first paint', () => {
    const text = serialiseIndex(indexOf(catalog))
    expect(text).not.toContain('\n  ')
    expect(text.endsWith('\n')).toBe(true)
    // And it is smaller than the file it was split out of, which is the only
    // reason any of this exists. A fixture this small makes the assertion weak
    // and the direction is what matters; the real numbers are printed by
    // `catalog:build` on every run.
    expect(text.length).toBeLessThan(serialiseCatalog(catalog).length)
  })
})
