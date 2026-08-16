import { describe, expect, it } from 'vitest'
import { CURRENT_YEAR, aLinesFile, aModel, aSeries, aSource } from './catalog.fixtures.ts'
import { checkIntegrity, type CatalogSource } from './integrity.ts'

/**
 * §13.1 — one case per §10.2 check, each breaking exactly one thing against a
 * fixture that is otherwise clean. Checks 6 and 7 are in `schema.test.ts`: they
 * are refused at parse time and cannot reach this function.
 */

const run = (source: CatalogSource) => checkIntegrity(source, { currentYear: CURRENT_YEAR })
const checks = (issues: { check: string }[]) => issues.map((issue) => issue.check)

describe('a catalogue with nothing wrong with it', () => {
  it('reports no failures and no warnings', () => {
    const report = run(aSource())
    expect(report.failures).toEqual([])
    expect(report.warnings).toEqual([])
  })
})

describe('check 1 — every id is globally unique and permanently URL-safe', () => {
  it('fails when the same id appears in two series files', () => {
    const source = aSource({
      series: [
        aSeries(),
        aSeries({
          file: 'catalog-src/g-shock/gw-m5610.yaml',
          series: { id: 'gw-m5610', name: 'GW-M5610', line: 'g-shock', family: 'square' },
          // The same id as the DW-5600 entry. Two watches, one collection row.
          models: [aModel({ id: 'dw-5600e-1v', ref: 'GW-M5610U-1' })],
        }),
      ],
    })
    const report = run(source)
    expect(checks(report.failures)).toContain('1')
    expect(report.failures[0]?.message).toMatch(/already used/)
  })

  it('fails an id the schema would also have refused, because this check stands alone', () => {
    const source = aSource({ series: [aSeries({ models: [aModel({ id: 'DW-5600E' })] })] })
    expect(checks(run(source).failures)).toContain('1')
  })
})

describe('check 2 — a published id may not disappear without a tombstone (D2)', () => {
  it('fails when a previously published id is simply gone', () => {
    const source = aSource({ publishedIds: ['dw-5600e-1v', 'dw-5600bb-1'] })
    const report = run(source)
    expect(checks(report.failures)).toEqual(['2'])
    expect(report.failures[0]?.message).toMatch(/dw-5600bb-1/)
  })

  it('passes when the id is still there', () => {
    expect(run(aSource({ publishedIds: ['dw-5600e-1v'] })).failures).toEqual([])
  })

  it('passes when the entry stayed and became a tombstone', () => {
    const source = aSource({
      publishedIds: ['dw-5600e-1v', 'dw-5600bb-1'],
      series: [
        aSeries({
          models: [
            aModel(),
            aModel({
              id: 'dw-5600bb-1',
              ref: 'DW-5600BB-1',
              tombstone: { reason: 'duplicate of dw-5600e-1v', replaced_by: 'dw-5600e-1v' },
            }),
          ],
        }),
        ...aSource().series.slice(1),
      ],
    })
    expect(run(source).failures).toEqual([])
  })
})

describe('check 2a — a tombstone must point somewhere', () => {
  it('fails when the successor is not in the catalogue', () => {
    const source = aSource({
      series: [
        aSeries({
          models: [aModel({ tombstone: { reason: 'renamed', replaced_by: 'dw-5600e-2v' } })],
        }),
        ...aSource().series.slice(1),
      ],
    })
    expect(checks(run(source).failures)).toContain('2a')
  })

  it('fails when the successor is the tombstone itself', () => {
    const source = aSource({
      series: [
        aSeries({
          models: [aModel({ tombstone: { reason: 'oops', replaced_by: 'dw-5600e-1v' } })],
        }),
        ...aSource().series.slice(1),
      ],
    })
    expect(checks(run(source).failures)).toContain('2a')
  })

  it('accepts a tombstone with no successor — the reference simply ended', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel({ tombstone: { reason: 'reference never existed' } })] }),
        ...aSource().series.slice(1),
      ],
    })
    expect(run(source).failures).toEqual([])
  })
})

describe('check 3 — references are unique and match their own line', () => {
  it('fails a duplicate reference', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel(), aModel({ id: 'dw-5600e-1v-alt' })] }),
        ...aSource().series.slice(1),
      ],
    })
    expect(checks(run(source).failures)).toContain('3')
  })

  it('warns — never fails — on a reference the line pattern does not match', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel({ id: 'dw-5600', ref: 'DW-5600 (early)' })] }),
        ...aSource().series.slice(1),
      ],
    })
    const report = run(source)
    expect(report.failures.filter((issue) => issue.check === '3')).toEqual([])
    expect(checks(report.warnings)).toContain('3')
  })

  it('says nothing once the exception is acknowledged in the file', () => {
    const source = aSource({
      series: [
        aSeries({
          models: [aModel({ id: 'dw-5600', ref: 'DW-5600 (early)' })],
          refExceptions: new Set(['dw-5600']),
        }),
        ...aSource().series.slice(1),
      ],
    })
    expect(run(source).warnings.filter((issue) => issue.check === '3')).toEqual([])
  })

  it('fails a line whose pattern is not a valid regular expression', () => {
    const lines = aLinesFile({ ref_pattern: 'GA-[0-9' })
    expect(checks(run(aSource({ lines })).failures)).toContain('3')
  })
})

describe('check 4 — lines, families and the folder they are filed under', () => {
  it('fails a series naming a line that does not exist', () => {
    const source = aSource({
      series: [aSeries({ series: { id: 'dw-5600', name: 'DW-5600', line: 'g-shocks' } })],
    })
    expect(checks(run(source).failures)).toContain('4')
  })

  it('fails a series filed in the wrong line folder', () => {
    const source = aSource({
      series: [aSeries({ folder: 'vintage' }), ...aSource().series.slice(1)],
    })
    const report = run(source)
    expect(report.failures[0]?.message).toMatch(/catalog-src\/vintage\//)
  })

  it('fails a family that is not in its line vocabulary (D32)', () => {
    const source = aSource({
      series: [
        aSeries({ series: { id: 'dw-5600', name: 'DW-5600', line: 'g-shock', family: 'squares' } }),
        ...aSource().series.slice(1),
      ],
    })
    expect(checks(run(source).failures)).toContain('4')
  })

  it('warns when a family holds a single series, because §8.4 will not render it', () => {
    const source = aSource({ series: [aSeries()] })
    const report = run(source)
    expect(report.failures).toEqual([])
    expect(checks(report.warnings)).toEqual(['4'])
  })

  it('accepts a series with no family at all', () => {
    const source = aSource({
      series: [aSeries({ series: { id: 'dw-5600', name: 'DW-5600', line: 'g-shock' } })],
    })
    expect(run(source).failures).toEqual([])
    expect(run(source).warnings).toEqual([])
  })

  it('fails a duplicated line id, slug, family id or series id', () => {
    const twoLines = aLinesFile()
    const first = twoLines.lines[0]
    expect(first).toBeDefined()
    const duplicated = { lines: [first!, { ...first! }] }
    expect(checks(run(aSource({ lines: duplicated })).failures)).toContain('4')

    const duplicateSlug = {
      lines: [first!, { ...first!, id: 'g-shock-2', slug: 'g-shock', families: undefined }],
    }
    expect(checks(run(aSource({ lines: duplicateSlug })).failures)).toContain('4')

    const duplicateFamily = aLinesFile({
      families: [
        { id: 'square', name: 'The square' },
        { id: 'square', name: 'Square, again' },
      ],
    })
    expect(checks(run(aSource({ lines: duplicateFamily })).failures)).toContain('4')

    const duplicateSeries = aSource({
      series: [aSeries(), aSeries({ file: 'catalog-src/g-shock/other.yaml' })],
    })
    expect(checks(run(duplicateSeries).failures)).toContain('4')
  })
})

describe('check 4a — a series id is the prefix its models actually share (D32)', () => {
  it('fails a model whose reference does not begin with its series id', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel({ id: 'ga-2100-1a1', ref: 'GA-2100-1A1' })] }),
        ...aSource().series.slice(1),
      ],
    })
    const report = run(source)
    expect(checks(report.failures)).toContain('4a')
  })

  it('accepts the suffix forms the prefix rule is built for', () => {
    const source = aSource({
      series: [
        aSeries({
          series: { id: 'a158', name: 'A158', line: 'vintage' },
          folder: 'vintage',
          file: 'catalog-src/vintage/a158.yaml',
          models: [aModel({ id: 'a158wa-1', ref: 'A158WA-1' })],
        }),
      ],
    })
    expect(run(source).failures).toEqual([])
  })
})

describe('check 5 — an image exists at both widths, or is explicitly absent', () => {
  it('fails when only the 400 px file was written', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel({ image: 'dw-5600e-1v' })] }),
        ...aSource().series.slice(1),
      ],
      images: new Set(['dw-5600e-1v.webp']),
    })
    const report = run(source)
    expect(checks(report.failures)).toEqual(['5'])
    expect(report.failures[0]?.message).toMatch(/@2x/)
  })

  it('passes when both widths are there', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel({ image: 'dw-5600e-1v' })] }),
        ...aSource().series.slice(1),
      ],
      images: new Set(['dw-5600e-1v.webp', 'dw-5600e-1v@2x.webp']),
    })
    expect(run(source).failures).toEqual([])
  })

  it('passes when there is no image, which is a normal state (D10)', () => {
    const source = aSource({
      series: [aSeries({ models: [aModel({ image: null })] }), ...aSource().series.slice(1)],
    })
    expect(run(source).failures).toEqual([])
  })
})

describe('check 9 — a year, where there is one, has to be possible', () => {
  it('fails a year before the first Casio quartz watch', () => {
    const source = aSource({
      series: [aSeries({ models: [aModel({ year: 1973 })] }), ...aSource().series.slice(1)],
    })
    expect(checks(run(source).failures)).toEqual(['9'])
  })

  it('fails a year further out than next year', () => {
    const source = aSource({
      series: [
        aSeries({ models: [aModel({ year: CURRENT_YEAR + 2 })] }),
        ...aSource().series.slice(1),
      ],
    })
    expect(checks(run(source).failures)).toEqual(['9'])
  })

  it('accepts both boundaries and no year at all', () => {
    for (const year of [1974, CURRENT_YEAR + 1, null]) {
      const source = aSource({
        series: [aSeries({ models: [aModel({ year })] }), ...aSource().series.slice(1)],
      })
      expect(run(source).failures).toEqual([])
    }
  })
})

describe('the report itself', () => {
  it('is ordered the same way every run, so two runs diff cleanly', () => {
    const source = aSource({
      series: [
        aSeries({
          models: [
            aModel({ year: 1900 }),
            aModel({ id: 'dw-5600bb-1', ref: 'DW-5600BB-1', image: 'x' }),
          ],
        }),
        ...aSource().series.slice(1),
      ],
    })
    const first = run(source)
    const second = run(source)
    expect(first.failures).toEqual(second.failures)
    expect(checks(first.failures)).toEqual(['5', '5', '9'])
  })
})
