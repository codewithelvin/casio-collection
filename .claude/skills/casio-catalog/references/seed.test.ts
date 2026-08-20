// Reading a specification row in a language other than English. Every page D46
// refused was one of these — 200 uncatalogued references whose only captures were
// Japanese, Indonesian, Chinese, Portuguese or French, holding 2 477 rows of
// Casio's own data that had been downloaded and then dropped.
//
// Only language-independent values are read this way: `40 × 35 × 9.1 mm` and
// `90 g` mean the same thing in every locale. A material does not, so it is still
// left unknown rather than translated (§10.6 guardrail 2).
import { describe, expect, it } from 'vitest'
import { toModel } from './seed.ts'

const fields = (rows: Record<string, string>) =>
  toModel('X-1', 'https://example.com/x', new Map(Object.entries(rows)), null).fields

describe('a specification row in another language', () => {
  it('reads a Japanese case size and weight', () => {
    // AE-1200WH-1A, whose only captures are /jp/. 45 × 42.1 × 12.5 mm, 39 g.
    const f = fields({
      'ケースサイズ（縦×横×厚さ）': '45 × 42.1 × 12.5 mm',
      質量: '39 g',
      防水性: '10気圧防水',
    })
    expect(f.case).toEqual({ height_mm: 45, width_mm: 42.1, depth_mm: 12.5, weight_g: 39 })
    // 10 atmospheres is 100 m, the same claim in the same units.
    expect(f.water_resistance_m).toBe(100)
  })

  it('reads a Chinese case size, weight and depth rating', () => {
    const f = fields({
      '錶殼尺寸（長 × 闊 × 高）': '46.3 × 43.4 × 15.8 mm',
      重量: '45 g',
      防水: '100 米防水',
    })
    expect(f.case).toEqual({ height_mm: 46.3, width_mm: 43.4, depth_mm: 15.8, weight_g: 45 })
    expect(f.water_resistance_m).toBe(100)
  })

  it('does not read Indonesian `L` as length — it is Lebar, the width', () => {
    // **The trap this table exists for.** `Ukuran casing (P× L× T)` is Panjang,
    // Lebar, Tebal — length, WIDTH, thickness. The English reader infers its axis
    // order from the [LWHD] letters in the label, and reusing that path here would
    // record 41 as the height and 47.2 as nothing, on 46 references, silently.
    const f = fields({
      'Ukuran casing (P× L× T)': '47.2 × 41 × 10.4 mm',
      Bobot: '69 g',
      'Ketahanan air': 'Ketahanan air 100 meter',
    })
    expect(f.case).toEqual({ height_mm: 47.2, width_mm: 41, depth_mm: 10.4, weight_g: 69 })
    expect(f.water_resistance_m).toBe(100)
  })

  it('leaves water resistance unknown where the row names no depth', () => {
    // `日常生活用防水` is *daily-life water resistant*. It is a category, not a
    // number, and unknown must render as itself rather than as a guessed 30 m.
    expect(fields({ 防水性: '日常生活用防水' }).water_resistance_m).toBeUndefined()
  })

  it('never mistakes a millimetre for a metre', () => {
    // A row that mixes a dimension into the water cell would otherwise read
    // `10.4 mm` as ten metres of water resistance.
    expect(fields({ 防水: '10.4 mm' }).water_resistance_m).toBeUndefined()
  })

  it('still does not read a material off a non-English page', () => {
    // `ステンレススチール` is stainless steel, and putting either the Japanese or a
    // translation of it into the catalogue would be writing a field nobody read in
    // the language the table is in. Absent is the honest answer.
    expect(fields({ 'ケース・ベゼル材質': 'ステンレススチール' }).case).toBeUndefined()
  })

  it('reads English exactly as before', () => {
    // The English path is untouched: same label, same inferred axis order.
    const f = fields({
      'Case size (L× W× H)': '45 × 42.1 × 12.5 mm',
      Weight: '39 g',
      'Water resistance': '100-meter water resistance',
    })
    expect(f.case).toEqual({ height_mm: 45, width_mm: 42.1, depth_mm: 12.5, weight_g: 39 })
    expect(f.water_resistance_m).toBe(100)
  })

  it('gives a page in an unknown language nothing, rather than a wrong guess', () => {
    // Korean is not in the table. The row is legible to a person and not to this
    // reader, and D46 refusing it is the correct outcome.
    expect(Object.values(fields({ '케이스 크기': '45 × 42.1 × 12.5 mm' })).every((v) => v === undefined)).toBe(true)
  })
})
