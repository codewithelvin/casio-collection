// `imageUrl` decides which photograph goes on which watch, and every way it can
// be wrong is silent — a plausible file under the wrong reference renders
// perfectly and nothing goes red. These are the four ways it was wrong.
import { describe, expect, it } from 'vitest'
import { decideLine, imageUrl, specRows } from './archive.ts'

const DAM = '/content/dam/casio/product-info/locales/intl/en/timepiece/product/watch'

/** A page carrying the given asset filenames, in the given order. */
const pageWith = (...assets: string[]) =>
  assets.map((name) => `<img src="https://www.casio.com${DAM}/X/assets/${name}">`).join('\n')

describe('imageUrl', () => {
  it('takes the asset named after the reference', () => {
    const html = pageWith('GA-2100-1A_Seq1.png')
    expect(imageUrl(html, 'GA-2100-1A')).toBe(`https://www.casio.com${DAM}/X/assets/GA-2100-1A_Seq1.png`)
  })

  it('accepts Casio’s letter suffix, which 83 of Sheen’s photographs need', () => {
    // The page for SHE-4539CM-4A publishes its main visual as SHE-4539CM-4AU.
    const html = pageWith('SHE-4539CM-4AU.png')
    expect(imageUrl(html, 'SHE-4539CM-4A')).toContain('SHE-4539CM-4AU.png')
  })

  it('refuses a reference extended by a digit — that is another watch', () => {
    // GA-2100-1A1 is a different model in this catalogue, and its
    // color-variation URL sits on GA-2100-1A's own page.
    const html = pageWith('GA-2100-1A1_Seq1.png')
    expect(imageUrl(html, 'GA-2100-1A')).toBeNull()
  })

  it('refuses an asset naming a second reference — that is two watches', () => {
    const html = pageWith('SHE-4539CM-4A_SHE-4540CM-3A.jpg')
    expect(imageUrl(html, 'SHE-4539CM-4A')).toBeNull()
  })

  it('keeps a suffix that is not a reference — a size or an angle is this watch', () => {
    expect(imageUrl(pageWith('DW-5600THC-1_l.png'), 'DW-5600THC-1')).toContain('DW-5600THC-1_l.png')
    expect(imageUrl(pageWith('DW-5600BBM-1_01.png'), 'DW-5600BBM-1')).toContain('DW-5600BBM-1_01.png')
  })

  it('refuses a letter suffix that spells a reference somebody else owns', () => {
    const html = pageWith('DW-5600EV.png')
    expect(imageUrl(html, 'DW-5600E', new Set(['DW-5600EV']))).toBeNull()
  })

  it('prefers the untransformed asset over a breakpoint rendition', () => {
    const html = pageWith('GA-2100-1A_Seq1.png.transform/main/image.png', 'GA-2100-1A_Seq1.png')
    expect(imageUrl(html, 'GA-2100-1A')).not.toContain('.transform/')
  })

  it('keeps page order rather than preferring the exactly-named file', () => {
    // The main visual comes first in the markup. The exactly-named files beside
    // it are crops and a photograph of somebody's wrist.
    const html = pageWith('SHE-4554GYM-8AU.png', 'SHE-4554GYM-8A_model-cut.jpg')
    expect(imageUrl(html, 'SHE-4554GYM-8A')).toContain('SHE-4554GYM-8AU.png')
  })
})

/**
 * `specRows` decides every field on every D52-seeded entry, and it had no tests
 * at all while carrying three documented silent failure modes. All three are
 * here, because each one returns *less data* rather than an error.
 */
describe('specRows', () => {
  const C = 'p-product_detail-spec-accordion__'
  /** One accordion row: a label element, then one value element per string. */
  const row = (label: string, ...values: string[]) =>
    `<li class="${C}panel-item">` +
    `<div class="${C}panel-item-ttl"><h4>${label}</h4></div>` +
    values.map((v) => `<div class="${C}panel-item-cont">${v}</div>`).join('') +
    `</li>`
  const page = (...rows: string[]) => `<div class="specifications">Specifications${rows.join('')}</div>`

  it('reads a label and its value', () => {
    expect(specRows(page(row('Weight', '48 g'))).get('Weight')).toBe('48 g')
  })

  it('keeps every value div in a row, not just the first', () => {
    // DBC-611-1's `Other features` emits four sibling value divs. Reading only
    // the first returned the calculator and dropped **Data Bank**, which is why
    // `databank` sat on one model in the whole catalogue and read as a typo in
    // audit §3 for three sessions. No error, no short table — a fact that was
    // quietly not there.
    const rows = specRows(
      page(row('Other features', '8-digit calculator', '12/24-hour format', 'Data Bank')),
    )
    expect(rows.get('Other features')).toBe('8-digit calculator · 12/24-hour format · Data Bank')
  })

  it('reads the 2022 markup, where the label is a bare div and not an h4', () => {
    // One tag's difference returned zero rows rather than an error, and was
    // worth 144 Sheen references. The reader names neither tag.
    const bare =
      `<div class="${C}panel-item-ttl"><div>Glass</div></div>` +
      `<div class="${C}panel-item-cont">Mineral Glass</div>`
    expect(specRows(`Specifications${bare}`).get('Glass')).toBe('Mineral Glass')
  })

  it('does not let the class attribute leak into the label', () => {
    // The split lands inside the label element's own class attribute, so the
    // chunk opens with `">` — a label of `"> Weight` matches no field reader and
    // would silently drop the row it just found.
    expect([...specRows(page(row('Weight', '48 g'))).keys()]).toEqual(['Weight'])
  })

  it('turns a <br> inside one value into the same separator', () => {
    expect(specRows(page(row('Band', 'Adjustable Clasp<br>Stainless Steel'))).get('Band')).toBe(
      'Adjustable Clasp · Stainless Steel',
    )
  })

  it('skips a row with a label and no value rather than storing an empty one', () => {
    // A section heading — Basic Information, Watch Features — is a label with
    // nothing of its own, and unknown must never render as a blank.
    expect(specRows(page(row('Watch Features'))).has('Watch Features')).toBe(false)
  })
})

describe('decideLine — which line the archive files a reference under', () => {
  it('takes the segment with the most captures', () => {
    // BSA-B100-1A: babyg in a dozen locales, edifice in one. Not a close call.
    expect(decideLine(new Map([['babyg', 12], ['edifice', 1]]))).toBe('baby-g')
  })

  it('refuses the general casio roster a vote', () => {
    // `casio` is Casio's whole roster — 1955 references across every line — so a
    // headcount of it beats one of `gshock` on a G-SHOCK. Letting it vote made
    // the guard refuse DW-5600E-1, the canonical square, as Vintage.
    expect(decideLine(new Map([['casio', 20], ['gshock', 3]]))).toBe('g-shock')
  })

  it('still lets casio-vintage vote, because that path is a claim', () => {
    expect(decideLine(new Map([['casio-vintage', 4], ['casio', 30]]))).toBe('vintage')
  })

  it('says nothing about a reference nothing has indexed', () => {
    // Silence, not a guess: an unindexed line simply does not vote, and a
    // reference with no votes is left alone rather than assigned.
    expect(decideLine(undefined)).toBeNull()
    expect(decideLine(new Map([['casio', 9]]))).toBeNull()
  })
})
