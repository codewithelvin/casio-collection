import { describe, expect, it } from 'vitest'
import { LINES_FILE, MODEL, PUBLISHED_MODEL, SERIES_FILE } from './schema.ts'

/**
 * §13.1 — acceptance and rejection, one case per §10.2 integrity check that the
 * schema is the enforcer of. Checks **6** (the controlled vocabulary) and **7**
 * (every model carries a source) live here rather than in `integrity.test.ts`
 * because the schema refuses them at parse time, which is earlier and stricter
 * than a check afterwards.
 */

const source = { url: 'https://www.casio.com/dw-5600e-1v', kind: 'official' } as const

describe('the model schema', () => {
  it('accepts a model carrying only the five things D27 requires', () => {
    // The `dbc-611-1` entry from §6.1 — the reference exists, someone owns it,
    // and that is enough to be in the catalogue.
    const parsed = MODEL.safeParse({ id: 'dbc-611-1', ref: 'DBC-611-1', source, image: null })
    expect(parsed.success).toBe(true)
  })

  it('accepts a fully specified model', () => {
    const parsed = MODEL.safeParse({
      id: 'ga-2100-1a1',
      ref: 'GA-2100-1A1',
      source,
      name: null,
      year: 2019,
      display: 'ana-digi',
      movement: 'quartz',
      module: '5611',
      case: { material: 'resin', width_mm: 45.4, height_mm: 48.5, depth_mm: 11.8, weight_g: 51 },
      water_resistance_m: 200,
      features: ['world-time', 'stopwatch', 'countdown-timer', 'led-light'],
      colorway: 'Black / black dial',
      image: 'ga-2100-1a1',
    })
    expect(parsed.success).toBe(true)
  })

  it('treats an explicit null and an absent key as the same unknown', () => {
    const withNull = MODEL.parse({ id: 'aa', ref: 'A', source, year: null })
    const without = MODEL.parse({ id: 'aa', ref: 'A', source })
    expect(withNull.year ?? null).toBe(without.year ?? null)
  })

  // §10.2 check 1
  it('rejects an id that is not URL-safe forever (check 1)', () => {
    for (const id of ['DW-5600E', 'dw 5600e', '-dw-5600', 'dw_5600', 'd']) {
      expect(MODEL.safeParse({ id, ref: 'DW-5600E-1V', source }).success).toBe(false)
    }
  })

  // §10.2 check 6
  it('rejects a feature outside the controlled vocabulary (check 6)', () => {
    const parsed = MODEL.safeParse({ id: 'aa', ref: 'A', source, features: ['world-time', 'sollar'] })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['features', 1])
  })

  it('rejects a display or movement outside the vocabulary (check 6)', () => {
    expect(MODEL.safeParse({ id: 'aa', ref: 'A', source, display: 'digi-ana' }).success).toBe(false)
    expect(MODEL.safeParse({ id: 'aa', ref: 'A', source, movement: 'eco-drive' }).success).toBe(false)
  })

  // §10.2 check 7
  it('rejects a model with no source at all (check 7)', () => {
    expect(MODEL.safeParse({ id: 'aa', ref: 'A' }).success).toBe(false)
  })

  it('rejects a source missing its kind, or claiming a kind that is not one of the three (check 7)', () => {
    expect(MODEL.safeParse({ id: 'aa', ref: 'A', source: { url: 'https://x.test/a' } }).success).toBe(false)
    expect(
      MODEL.safeParse({ id: 'aa', ref: 'A', source: { url: 'https://x.test/a', kind: 'wikipedia' } }).success,
    ).toBe(false)
  })

  it('rejects a source url that is not a url (check 7)', () => {
    expect(MODEL.safeParse({ id: 'aa', ref: 'A', source: { url: 'casio.com', kind: 'official' } }).success).toBe(
      false,
    )
  })

  it('rejects a misspelt field rather than ignoring it', () => {
    // The whole reason every object is strict: this would otherwise parse
    // cleanly and publish a watch with no water resistance.
    const parsed = MODEL.safeParse({ id: 'aa', ref: 'A', source, wather_resistance_m: 200 })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.code).toBe('unrecognized_keys')
  })

  it('rejects a fractional year and an empty reference', () => {
    expect(MODEL.safeParse({ id: 'aa', ref: 'A', source, year: 1989.5 }).success).toBe(false)
    expect(MODEL.safeParse({ id: 'aa', ref: '', source }).success).toBe(false)
  })

  it('accepts a tombstone and its successor (D2)', () => {
    const parsed = MODEL.safeParse({
      id: 'aa',
      ref: 'A',
      source,
      tombstone: { reason: 'duplicate of dw-5600e-1v', replaced_by: 'dw-5600e-1v' },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a tombstone with no reason — a retirement nobody explained', () => {
    expect(MODEL.safeParse({ id: 'aa', ref: 'A', source, tombstone: { replaced_by: 'bb' } }).success).toBe(false)
  })
})

describe('the series file schema', () => {
  it('accepts the §6.1 shape', () => {
    const parsed = SERIES_FILE.safeParse({
      series: { id: 'ga-2100', name: 'GA-2100', line: 'g-shock', family: 'octagonal', aka: ['CasiOak'] },
      models: [{ id: 'ga-2100-1a1', ref: 'GA-2100-1A1', source }],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a series file with no models', () => {
    const parsed = SERIES_FILE.safeParse({
      series: { id: 'ga-2100', name: 'GA-2100', line: 'g-shock' },
      models: [],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('the lines file schema', () => {
  const line = {
    id: 'g-shock',
    name: 'G-SHOCK',
    slug: 'g-shock',
    accent: '#F25C05',
    ref_pattern: 'GA-[0-9]{4}',
  }

  it('accepts a line with a family vocabulary', () => {
    const parsed = LINES_FILE.safeParse({
      lines: [{ ...line, families: [{ id: 'square', name: 'The square' }] }],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an accent that is not a six-digit hex colour', () => {
    expect(LINES_FILE.safeParse({ lines: [{ ...line, accent: 'orange' }] }).success).toBe(false)
    expect(LINES_FILE.safeParse({ lines: [{ ...line, accent: '#F25' }] }).success).toBe(false)
  })

  it('rejects a lines file with no lines', () => {
    expect(LINES_FILE.safeParse({ lines: [] }).success).toBe(false)
  })
})

describe('the published model schema', () => {
  it('accepts a model with every unknown field omitted', () => {
    const parsed = PUBLISHED_MODEL.safeParse({
      id: 'aa',
      ref: 'A',
      line: 'g-shock',
      series: 'dw-5600',
      source,
    })
    expect(parsed.success).toBe(true)
  })

  it('refuses a null where the artefact should carry no key at all', () => {
    // D27's "absent means unknown" is one state in the published file, not two.
    const parsed = PUBLISHED_MODEL.safeParse({
      id: 'aa',
      ref: 'A',
      line: 'g-shock',
      series: 'dw-5600',
      source,
      year: null,
    })
    expect(parsed.success).toBe(false)
  })
})
