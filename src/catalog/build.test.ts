import { describe, expect, it } from 'vitest'
import { buildCatalog, digestInput, serialiseCatalog, stamp } from './build.ts'
import { aModel, aSeries, aSource } from './catalog.fixtures.ts'

describe('the published artefact (§6.2)', () => {
  it('keeps the lines in editorial order and counts what is in them', () => {
    const catalog = buildCatalog(aSource())
    expect(catalog.lines.map((line) => line.id)).toEqual(['g-shock', 'vintage'])
    expect(catalog.lines.map((line) => line.order)).toEqual([0, 1])
    expect(catalog.lines.find((line) => line.id === 'g-shock')?.count).toBe(2)
    // A line with nothing in it is published with a count of 0 rather than
    // dropped: the rail lists every line of D15 whether or not it is seeded.
    expect(catalog.lines.find((line) => line.id === 'vintage')?.count).toBe(0)
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
