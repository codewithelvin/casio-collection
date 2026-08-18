import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **jsdom does no layout, so this cannot assert the thing that was wrong.** What
 * was wrong was measured in a real browser: the modal title ran to x=630 and
 * AntD's close button started at x=615, so a faint grey X sat on top of the last
 * word of "Sign in to keep track of the watches you own".
 *
 * AntD gives `.ant-modal-title` no `padding-inline-end`, and §8's type scale
 * renders the title at 18 px rather than AntD's 16, which is what walks the text
 * into the corner. The fix is one rule in `index.css`, and the only thing a unit
 * test can honestly do is refuse to let it disappear without somebody noticing.
 * The real assertion belongs in the Playwright journey M7 still owes.
 */
describe('the modal title reserves room for the close button', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'index.css'), 'utf8')

  it('declares a padding-inline-end on .ant-modal-title', () => {
    const rule = /\.ant-modal-title\s*\{[^}]*padding-inline-end:\s*(\d+)px/.exec(css)
    expect(rule, '.ant-modal-title must reserve room, or long titles run under the X').not.toBeNull()
    // The button is 32 px wide at a 13 px inset. Less than that and the text
    // touches it again; the number is the geometry, not a taste.
    expect(Number(rule![1])).toBeGreaterThanOrEqual(44)
  })
})
