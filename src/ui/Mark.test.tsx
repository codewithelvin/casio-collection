import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Mark } from './Mark'

/**
 * D34's technical consequence, and the one part of the identity that is a rule
 * rather than a drawing: below 32 px the screws and strap stubs become grey
 * mush and take the octagon's shape with them, so a second file exists
 * permanently. The switch is easy to undo by accident — someone tidies the
 * component and the favicon quietly turns to soup at a size nobody re-checks.
 */
describe('the mark (D34, §8.11)', () => {
  const screwCount = (container: HTMLElement) => container.querySelectorAll('circle').length

  it('draws the screws at 32 px and above', () => {
    const { container } = render(<Mark size={32} />)
    expect(screwCount(container)).toBe(4)
  })

  it('drops the screws below 32 px', () => {
    const { container } = render(<Mark size={16} />)
    expect(screwCount(container)).toBe(0)
  })

  it('keeps the octagon and the check in both variants', () => {
    for (const size of [16, 48]) {
      const { container } = render(<Mark size={size} />)
      // The bezel and the check — the two shapes that carry the meaning.
      expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
      expect(container.querySelector('svg')).toHaveAttribute('width', String(size))
    }
  })
})
