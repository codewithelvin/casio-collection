// D47's filter decides which strings become permanent model ids (D2), and it had
// no tests while it silently refused 1 095 of the 1 955 references in Casio's own
// Standard roster. These pin both directions: what it must admit, and what it
// must keep refusing — because the refused pile contains real watches *and* a
// gift bag, and only one of those distinctions is safe to get wrong.
import { describe, expect, it } from 'vitest'
import { isReference } from './roster.ts'

describe('what a reference looks like (D47, widened by O13)', () => {
  it('admits the styles the rule was originally calibrated on', () => {
    // Recovered from the reviewed M2b commits. Widening must not disturb these.
    for (const ref of ['DW-5600E-1', 'GW-M5610U-1', 'GA-2100-1A1', 'DW-5600BB-1', 'G-100-1B'])
      expect(isReference(ref), ref).toBe(true)
  })

  it('admits Casio’s ordinary market-coded suffix, which it used to refuse', () => {
    // The whole of O13. 1 151 references arrive on this shape alone, and
    // `sources.md` had been using EF-527D-1AV as its example of a real reference
    // for three sessions while the filter threw it away.
    for (const ref of ['EF-527D-1AV', 'AE-1200WHD-1AV', 'AW-81D-2AV', 'A168WA-3AY', 'B640WD-1AV'])
      expect(isReference(ref), ref).toBe(true)
  })

  it('admits the four-part suffix too', () => {
    // 187 more, e.g. W-219H-2A2V — digit, letter, digit, letter.
    for (const ref of ['W-219H-2A2V', 'MTD-100D-7A2V', 'EF-130D-1A2V'])
      expect(isReference(ref), ref).toBe(true)
  })

  it('admits the five G-SHOCK references the widening let in, and they are market codes', () => {
    // Named individually because the rule was recovered from G-SHOCK commits, so
    // this is the line where an unintended admission would matter most. Five is
    // the whole delta, and each is a Casio market code rather than a nickname.
    for (const ref of ['DW-5600E-1VQ', 'DW-6900-1VH', 'DW-6900LU-8SC', 'DW-6900RL-1AC', 'G-100-1BM'])
      expect(isReference(ref), ref).toBe(true)
  })

  it('still refuses a collaboration string with a name appended', () => {
    // DW-5600MW-7INSA is really DW-5600MW-7 with a collaborator's name on the
    // end. Under D2 a made-up id is permanent, so this is reported, never seeded.
    for (const token of ['DW-5600MW-7INSA', 'DW-5600-BAIT20-7', 'DW-6900-Space-Invaders'])
      expect(isReference(token), token).toBe(false)
  })

  it('still refuses everything on casio.com that is not a watch', () => {
    // **This is why O13 loosened the rule by one letter and not more.** Casio's
    // sitemap lists these beside the watches, and a rule loose enough to admit
    // every real reference admits the gift bag — which D2 would then make
    // permanent.
    for (const token of [
      'NGS-TS01-BS', // a T-shirt, size S
      'GXF003-BKXL', // a garment, size XL
      'GS-POWATSTD', // a shop display stand
      'GS-DXDISPCS',
      'GS-WATMNT-W', // a watch mount
      'C-RINGSTD2PSET',
      'G-SHOCK-BOOK',
      'GSHOCKGIFTBAG',
    ])
      expect(isReference(token), token).toBe(false)
  })

  it('still refuses the real references whose variant block carries digits', () => {
    // Refused, and knowingly: admitting these means letting digits into the
    // variant block, which is a different change with a different blast radius —
    // and it is the change that would let the gift bag in. Recorded so the next
    // reader knows these are a pending decision rather than an oversight.
    for (const token of ['GW-6900NASA24-1', 'GM-6900WTC22-9', 'DW-6900AP23-1'])
      expect(isReference(token), token).toBe(false)
  })

  it('still refuses a suffix that does not begin with a digit', () => {
    // The discriminator this filter has always turned on, and the reason none of
    // the merchandise above gets in: a reference's last hyphen group starts with
    // a digit.
    for (const token of ['A159WA-N1', 'WSD-F20A-BU', 'GM-2100-1A-MAN'])
      expect(isReference(token), token).toBe(false)
  })

  it('still refuses a suffix longer than the rule allows', () => {
    for (const token of ['MQ-24-7BLL', 'AQ-230A-1DMQ', 'MTP-1302D-9AVVT', 'AQ-230A-2A1MQY'])
      expect(isReference(token), token).toBe(false)
  })
})
