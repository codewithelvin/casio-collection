import { theme } from 'antd'
import { describe, expect, it } from 'vitest'
import { HEADING, SHELL_TOKENS, THEME_STORAGE_KEY, type ThemeMode } from './palette.ts'
import { themeConfig } from './tokens.ts'

/**
 * **The shell writes AntD's colours down, and this is what stops them drifting.**
 *
 * §12 took Ant Design out of the first load, so the header, the rail, the footer
 * and the front door can no longer call `theme.useToken()` — that function is
 * the theme runtime whose evaluation was the thing being removed. Their colours
 * are literals in `palette.ts` instead, and a literal copy of somebody else's
 * constant is precisely the failure this repository keeps writing tests against:
 * nothing throws when it is wrong. The drawer just goes the wrong shade of grey,
 * in one theme, on one breakpoint, and it ships.
 *
 * So the copy is checked against the original. These tests run AntD's own
 * algorithms over the seed `themeConfig` builds and compare every entry. An
 * AntD upgrade that moves a token fails here, in a file whose name says why.
 */

/** The tokens AntD would produce for a mode, from `themeConfig`'s own seed. */
function antdTokens(mode: ThemeMode): Record<string, unknown> {
  const config = themeConfig(mode)
  const algorithm = config.algorithm as unknown as (
    seed: Record<string, unknown>,
  ) => Record<string, unknown>
  return algorithm({ ...theme.defaultSeed, ...config.token })
}

describe('the shell palette against AntD (§12)', () => {
  for (const mode of ['light', 'dark'] as const) {
    describe(mode, () => {
      const tokens = antdTokens(mode)
      const shell = SHELL_TOKENS[mode]

      it('paints the same container, layout and elevated surfaces', () => {
        expect(shell.bgContainer).toBe(tokens['colorBgContainer'])
        expect(shell.bgLayout).toBe(tokens['colorBgLayout'])
        expect(shell.bgElevated).toBe(tokens['colorBgElevated'])
      })

      it('draws the same hairline', () => {
        expect(shell.borderSecondary).toBe(tokens['colorBorderSecondary'])
      })

      it('sets body text and the skeleton fill to the same values', () => {
        // AntD emits these without spaces after the commas; the palette is
        // written the way CSS is normally written in this repo. Comparing with
        // the spaces stripped keeps the test about the colour rather than about
        // whitespace, which is not something a drift would show up as.
        const same = (a: string, b: unknown) => expect(a.replace(/\s/g, '')).toBe(String(b))
        same(shell.text, tokens['colorText'])
        same(shell.fillSecondary, tokens['colorFillSecondary'])
      })

      it('uses the accent AntD actually renders, not the seed', () => {
        // The interesting half is dark: the seed is #4D9BFF and the dark
        // algorithm ships #4487dc. A shell painted with the seed would be a
        // shade off every link and primary button on the page it frames.
        expect(shell.primary).toBe(tokens['colorPrimary'])
      })

      it('uses the same warning colour the error state is drawn in', () => {
        expect(shell.warning).toBe(tokens['colorWarning'])
      })

      it('derives its headings from fontSize 16 exactly as AntD does', () => {
        // A heading a few pixels off in the static first paint is a layout shift
        // when React replaces it, and CLS is a quarter of the score all of this
        // was done for.
        expect(HEADING.h2.size).toBe(tokens['fontSizeHeading2'])
        expect(HEADING.h3.size).toBe(tokens['fontSizeHeading3'])
        expect(HEADING.h4.size).toBe(tokens['fontSizeHeading4'])
        expect(HEADING.h2.lineHeight).toBe(tokens['lineHeightHeading2'])
        expect(HEADING.h3.lineHeight).toBe(tokens['lineHeightHeading3'])
        expect(HEADING.h4.lineHeight).toBe(tokens['lineHeightHeading4'])
      })
    })
  }

  it('names the storage key the head script and the store both read', () => {
    // Two readers, one string. The inline script in the document head sets
    // data-theme before any module runs; the store reads the same key when it
    // initialises. If they disagree, a dark-mode visitor gets a white flash on
    // every page and nothing in the app is broken enough to notice.
    expect(THEME_STORAGE_KEY).toBe('cc.theme')
  })
})
