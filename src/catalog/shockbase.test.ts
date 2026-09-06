import { describe, expect, it } from 'vitest'

import {
  FUNCTION_FEATURES,
  KNOWN_UNMAPPED,
  labelledValue,
  parseWatchPage,
  readBareToggle,
  readDisplay,
  readFunctions,
  readMovement,
  readSize,
  readWaterResistance,
  readWeight,
  readYear,
} from './shockbase.ts'
import { FEATURES } from './vocabulary.ts'

/** A cell in ShockBase's shape: a class, and a `function=` link inside it. */
const cell = (state: 'cellactive' | 'cellinactive', fn: string, label = fn) =>
  `<td class="${state}"><a href="../function_page_dyn.php?function=${fn}" class="white">${label}</a></td>`

/** A bare cell — Solar and Multi Band are printed without a link. */
const bare = (state: 'cellactive' | 'cellinactive', label: string) =>
  `<td class="${state}">${label}</td>`

const row = (label: string, value: string) =>
  `<tr><td align="right">${label}</td><td>${value}</td></tr>`

describe('labelledValue', () => {
  it('takes the cell after the label, not a fixed position', () => {
    const html = `<tr><td>Weight: </td><td>  51 g</br> </td></tr>`
    expect(labelledValue(html, 'Weight:')).toBe('51 g')
  })

  it('reads through an anchor-wrapped label', () => {
    const html = `<td><a href="x.php">Glass:</a></td><td>Mineral Glass</td>`
    expect(labelledValue(html, 'Glass:')).toBe('Mineral Glass')
  })

  it('is undefined when the label is absent, rather than returning a neighbour', () => {
    expect(labelledValue(`<td>Band:</td><td>Resin</td>`, 'Bezel:')).toBeUndefined()
  })

  it('is undefined for an empty value cell rather than an empty string', () => {
    expect(labelledValue(`<td>Color:</td><td>  </td>`, 'Color:')).toBeUndefined()
  })
})

describe('readFunctions — the three states', () => {
  const html = [cell('cellactive', 'world_time'), cell('cellinactive', 'compass')].join('')

  it('splits active from inactive', () => {
    expect(readFunctions(html)).toEqual({ active: ['world_time'], inactive: ['compass'] })
  })

  it('keeps "the page says no" apart from "the page does not mention it"', () => {
    const reading = parseWatchPage(html)
    // compass is inactive: not a feature, and not reported as unknown either.
    expect(reading.features).not.toContain('compass')
    expect(reading.absentFunctions).not.toContain('compass')
    // altimeter is on neither list — that is the third state.
    expect(reading.absentFunctions).toContain('altimeter')
  })
})

describe('the mapping never invents a vocabulary value', () => {
  it('every mapped feature exists in FEATURES', () => {
    for (const feature of Object.values(FUNCTION_FEATURES)) expect(FEATURES).toContain(feature)
  })

  it('reports an active function it has no word for instead of guessing', () => {
    const reading = parseWatchPage(cell('cellactive', 'carbon_guard_core'))
    expect(reading.unmapped).toEqual(['carbon_guard_core'])
    expect(reading.features).toEqual([])
  })

  it('a mapped key is never also listed as known-unmapped', () => {
    for (const key of Object.keys(FUNCTION_FEATURES)) expect(KNOWN_UNMAPPED.has(key)).toBe(false)
  })
})

/**
 * The calibration that caught a real error. ShockBase's `Multi Stop Watch` is
 * about having SEVERAL stopwatches; a GA-2100 has one and the cell is inactive.
 * Mapping it to `stopwatch` wrote a falsehood onto every watch that lacks the
 * multi variant, which is most of them.
 */
describe('multi_stop_watch and multi_timer are not stopwatch and countdown-timer', () => {
  it('an active Multi Stop Watch does not become `stopwatch`, and is reported', () => {
    const reading = parseWatchPage(cell('cellactive', 'multi_stop_watch'))
    expect(reading.features).not.toContain('stopwatch')
    // It has no vocabulary value, so it is reported like any other — being in
    // KNOWN_UNMAPPED records that somebody already decided, not that it is hidden.
    expect(reading.unmapped).toEqual(['multi_stop_watch'])
  })

  it('an inactive Multi Timer says nothing about a countdown timer', () => {
    const reading = parseWatchPage(cell('cellinactive', 'multi_timer'))
    expect(reading.features).not.toContain('countdown-timer')
  })
})

describe('readYear', () => {
  it('reads the release year', () => {
    expect(readYear(row('Release:', 'August  2019'))).toBe(2019)
  })

  it('is undefined when the page dates nothing (D25 — never a guess)', () => {
    expect(readYear(row('Release:', 'unknown'))).toBeUndefined()
    expect(readYear('<td>Module:</td><td>5611</td>')).toBeUndefined()
  })
})

describe('measurements', () => {
  it('reads HxWxT in that order', () => {
    expect(readSize(row('Size (HxWxT): ', '48.5 x 45.4 x 11.8 mm'))).toEqual({
      height_mm: 48.5,
      width_mm: 45.4,
      depth_mm: 11.8,
    })
  })

  it('yields nothing rather than a zero when the row is malformed', () => {
    expect(readSize(row('Size (HxWxT): ', '--'))).toEqual({})
    expect(readWeight(row('Weight: ', '-'))).toBeUndefined()
  })

  it('reads water resistance only from an active cell', () => {
    const active = `<td class="cellactive"><a href="x">Water Resistance:<br>200m</a></td>`
    const inactive = `<td class="cellinactive"><a href="x">Water Resistance:<br>200m</a></td>`
    expect(readWaterResistance(active)).toBe(200)
    expect(readWaterResistance(inactive)).toBeUndefined()
  })
})

describe('display and movement', () => {
  it('reads ana-digi from both words', () => {
    expect(readDisplay(row('Timekeeping:', 'Analog / Digital'))).toBe('ana-digi')
    expect(readDisplay(row('Timekeeping:', 'Digital'))).toBe('digital')
    expect(readDisplay(row('Timekeeping:', 'Analog'))).toBe('analog')
  })

  it('solar plus multi band is one value', () => {
    const html = bare('cellactive', 'Solar') + bare('cellactive', 'Multi Band / <br>Wave Ceptor')
    expect(readMovement(html)).toBe('solar-radio')
  })

  it('solar alone is solar', () => {
    expect(readMovement(bare('cellactive', 'Solar') + bare('cellinactive', 'Multi Band'))).toBe('solar')
  })

  it('radio without solar falls back to quartz and keeps the fact as a feature', () => {
    const html = bare('cellinactive', 'Solar') + bare('cellactive', 'Multi Band / <br>Wave Ceptor')
    expect(readMovement(html)).toBe('quartz')
    expect(parseWatchPage(html).features).toContain('radio-controlled')
  })

  it('says nothing when neither toggle is on the page', () => {
    expect(readMovement('<td>Module:</td><td>5611</td>')).toBeUndefined()
    expect(readBareToggle('<td>x</td>', /^solar$/i)).toBeUndefined()
  })

  /**
   * ShockBase states power in two markup forms and this only read one of them.
   * Measured across the G-SHOCK line before the fix: `tough_solar` active on
   * 133 watches and `multi_band_` on 102, every one of them reported as an
   * unmapped key and filed as plain quartz where it was filed at all.
   */
  describe('power stated as a function link, not a bare cell', () => {
    it('reads solar from function=tough_solar', () => {
      const html = cell('cellactive', 'tough_solar', 'Solar')
      expect(readMovement(html)).toBe('solar')
      expect(parseWatchPage(html).features).toContain('tough-solar')
    })

    it('reads radio from function=multi_band_, trailing underscore and all', () => {
      const html = cell('cellactive', 'multi_band_', 'Multi Band')
      expect(parseWatchPage(html).features).toContain('radio-controlled')
    })

    it('combines the linked forms into solar-radio', () => {
      const html = cell('cellactive', 'tough_solar') + cell('cellactive', 'multi_band_')
      expect(readMovement(html)).toBe('solar-radio')
    })

    it('does not report a key it now handles as unmapped', () => {
      const reading = parseWatchPage(cell('cellactive', 'tough_solar') + cell('cellactive', 'multi_band_'))
      expect(reading.unmapped).toEqual([])
    })

    it('refuses to call a solar-assisted watch quartz', () => {
      const html = cell('cellinactive', 'tough_solar') + cell('cellactive', 'solar_assisted')
      expect(readMovement(html)).toBeUndefined()
    })

    it('still says quartz when the page states both toggles off', () => {
      const html = cell('cellinactive', 'tough_solar') + cell('cellinactive', 'multi_band_')
      expect(readMovement(html)).toBe('quartz')
    })
  })
})

describe('alarms', () => {
  it('more than one alarm is multi-alarm', () => {
    expect(parseWatchPage(`<td class="cellactive">Alarms: 5</td>`).features).toContain('multi-alarm')
  })

  it('a single alarm is alarm', () => {
    expect(parseWatchPage(`<td class="cellactive">Alarms: 1</td>`).features).toContain('alarm')
  })
})

describe('glass and light', () => {
  it('maps sapphire and mineral', () => {
    expect(parseWatchPage(row('Glass:', 'Sapphire Glass')).features).toContain('sapphire-crystal')
    expect(parseWatchPage(row('Glass:', 'Mineral Glass')).features).toContain('mineral-glass')
  })

  it('takes the most specific light first', () => {
    expect(parseWatchPage(row('Light Type:', 'Super Illuminator')).features).toContain('super-illuminator')
    expect(parseWatchPage(row('Light Type:', 'LED')).features).toContain('led-light')
  })
})

describe('nothing about photographs, ever (D74)', () => {
  it('an image on the page is not read, derived or returned', () => {
    const html = `<img src="pics2/2100/GA-2100/GA-2100-1A_small.webp">` + row('Color:', 'Black')
    const reading = parseWatchPage(html)
    expect(JSON.stringify(reading)).not.toMatch(/webp|pics2|img/i)
  })
})

describe('a whole page', () => {
  const page = [
    '<script>document.title = "GA-2100-1A";</script>',
    row('Module:', '5611'),
    row('Release:', 'August  2019'),
    row('Subseries:', 'GA-2100'),
    row('Color:', 'Black'),
    row('Timekeeping:', 'Analog / Digital'),
    row('Glass:', 'Mineral Glass'),
    row('Light Type:', 'LED'),
    row('Bezel:', 'Resin'),
    row('Band:', 'Resin'),
    row('Weight: ', '51 g'),
    row('Size (HxWxT): ', '48.5 x 45.4 x 11.8 mm'),
    `<td class="cellactive"><a href="x">Water Resistance:<br>200m</a></td>`,
    cell('cellactive', 'carbon_guard_core'),
    cell('cellactive', 'world_time'),
    cell('cellinactive', 'compass'),
    cell('cellinactive', 'multi_stop_watch'),
    `<td class="cellactive">Alarms: 5</td>`,
    bare('cellinactive', 'Solar'),
  ].join('')

  it('reads the reference the way the catalogue writes it', () => {
    const reading = parseWatchPage(page)
    expect(reading).toMatchObject({
      module: '5611',
      year: 2019,
      display: 'ana-digi',
      movement: 'quartz',
      water_resistance_m: 200,
      colorway: 'Black',
      case: { material: 'Resin', height_mm: 48.5, width_mm: 45.4, depth_mm: 11.8, weight_g: 51 },
    })
    expect(reading.features).toEqual(['world-time', 'multi-alarm', 'led-light', 'mineral-glass'])
    expect(reading.unmapped).toEqual(['carbon_guard_core'])
  })

  it('does not claim the four features ShockBase has no row for', () => {
    const reading = parseWatchPage(page)
    for (const absent of ['stopwatch', 'countdown-timer', 'hourly-time-signal', 'full-auto-calendar'])
      expect(reading.features).not.toContain(absent)
  })

  it('collapses one material rather than writing "Resin / Resin"', () => {
    expect(parseWatchPage(page).case.material).toBe('Resin')
  })

  it('writes two materials where the bezel and band differ', () => {
    const html = row('Bezel:', 'Stainless steel') + row('Band:', 'Resin')
    expect(parseWatchPage(html).case.material).toBe('Stainless steel / Resin')
  })
})
