import { describe, expect, it } from 'vitest'
// From the component module on purpose: this is the one export of it that is a
// pure function, and importing it here is what keeps that true.
import { avatarColour } from './CollectorAvatar'

/**
 * D71 — the colour behind a set of initials is the only thing that makes one
 * mostly-initialled card recognisable among twenty-four, so the property worth
 * pinning is not what colour it picks but that **it picks the same one every
 * time**. A hash that drifted with input order or string length would look fine
 * on any single page and be useless across two.
 */
describe('avatarColour', () => {
  it('is stable for the same handle', () => {
    expect(avatarColour('elvin')).toBe(avatarColour('elvin'))
  })

  it('is different for different handles', () => {
    expect(avatarColour('elvin')).not.toBe(avatarColour('marco'))
  })

  it('is case-sensitive, which is fine because handles are lower-cased (FR-7.2)', () => {
    expect(avatarColour('elvin')).not.toBe(avatarColour('ELVIN'))
  })

  it('holds the saturation and lightness fixed, so white initials stay legible (NFR-8)', () => {
    for (const handle of ['a', 'elvin', 'zzzzzzzzzzzz', '0', 'a-very-long-handle-indeed']) {
      expect(avatarColour(handle)).toMatch(/^hsl\(\d{1,3} 45% 38%\)$/)
    }
  })

  it('answers for an empty handle rather than throwing', () => {
    expect(avatarColour('')).toMatch(/^hsl\(0 45% 38%\)$/)
  })
})
