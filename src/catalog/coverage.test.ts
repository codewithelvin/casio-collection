import { describe, expect, it } from 'vitest'
import { buildCatalog } from './build.ts'
import { aSeries, aShownModel, aShownSource } from './catalog.fixtures.ts'
import { coverageOf, coverageTable, renderCoverageTable } from './coverage.ts'

/**
 * D26's **gate** — a facet at 59% hides and at 60% shows — belongs to the filter
 * bar and is tested with it at M3. What is testable here is the measurement the
 * gate is applied to, and the table that makes the number visible on every
 * build (§10.2 check 10).
 */

const catalogue = buildCatalog(
  aShownSource({
    series: [
      aSeries({
        models: [
          aShownModel({ year: 1996, display: 'digital', features: ['stopwatch'] }),
          aShownModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1', year: 2018, display: 'digital' }),
          aShownModel({ id: 'dw-5600c-1', ref: 'DW-5600C-1' }),
          aShownModel({ id: 'dw-5600d-1', ref: 'DW-5600D-1' }),
        ],
      }),
    ],
  }),
)

describe('coverage', () => {
  it('reports how many models carry each optional field', () => {
    const rows = coverageOf(catalogue.models)
    const year = rows.find((row) => row.field === 'year')
    expect(year).toEqual({ field: 'year', present: 2, total: 4, share: 0.5 })
  })

  it('counts an empty list and an empty object as absent, not as data', () => {
    const rows = coverageOf(catalogue.models)
    expect(rows.find((row) => row.field === 'features')?.present).toBe(1)
    expect(rows.find((row) => row.field === 'case')?.present).toBe(0)
  })

  it('reports zero rather than NaN when there is nothing to measure', () => {
    expect(coverageOf([]).every((row) => row.share === 0)).toBe(true)
  })
})

describe('the coverage table', () => {
  it('has a column per line that holds something, plus an overall column', () => {
    const columns = coverageTable(catalogue.models, catalogue.lines)
    expect(columns.map((column) => column.key)).toEqual(['g-shock', 'all'])
    expect(columns.at(-1)?.total).toBe(4)
  })

  it('renders the numbers, the model counts, and what the 60% line means', () => {
    const text = renderCoverageTable(coverageTable(catalogue.models, catalogue.lines))
    expect(text).toContain('§10.2 check 10')
    expect(text).toContain('50%')
    expect(text).toContain('60%')
    expect(text).toContain('D26')
    // The dot marks the rows a filter is built from — the only rows the
    // threshold has anything to say about.
    expect(text).toMatch(/· year/)
    expect(text).toMatch(/ {2}colorway/)
  })

  it('says the catalogue is unseeded rather than printing a grid of zeroes', () => {
    const empty = buildCatalog(
      aShownSource({ series: [aSeries({ models: [aShownModel({ tombstone: { reason: 'retired' } })] })] }),
    )
    const text = renderCoverageTable(
      coverageTable(
        empty.models.filter((model) => !model.tombstone),
        empty.lines,
      ),
    )
    expect(text).toContain('no models yet')
  })
})
