// `imageUrl` decides which photograph goes on which watch, and every way it can
// be wrong is silent — a plausible file under the wrong reference renders
// perfectly and nothing goes red. These are the four ways it was wrong.
import { describe, expect, it } from 'vitest'
import { imageUrl } from './archive.ts'

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
