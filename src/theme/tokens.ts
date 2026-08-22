import { theme, type ThemeConfig } from 'antd'
import {
  CASIO_BLUE_DARK,
  CASIO_BLUE_LIGHT,
  TEXT_DESCRIPTION,
  type ThemeMode,
} from './palette.ts'

/**
 * The Ant Design theme, and **nothing else** — because this module imports
 * `antd` and is therefore the one thing the shell must not touch.
 *
 * Everything that is merely a colour moved to `palette.ts` when the shell
 * stopped rendering with AntD (§12). Nine modules read `LINE_ACCENTS`, several
 * of them in the first load, and while it lived here each of them pulled AntD's
 * whole theme runtime along with it. The two files hold one set of values: this
 * one seeds AntD from `palette.ts`, and `palette.test.ts` proves the shell's
 * written-down copy of the resulting tokens still matches what AntD computes.
 *
 * `themeConfig` is imported by exactly two places now — the lazily loaded
 * `AntdRoot` that wraps route content, and `renderApp` in the tests.
 */
export function themeConfig(mode: ThemeMode): ThemeConfig {
  const accent = mode === 'dark' ? CASIO_BLUE_DARK : CASIO_BLUE_LIGHT
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: accent,
      colorLink: accent,
      // Was 4, tightened from AntD's 6 on the argument that the mark is a
      // chamfered octagon and a softer radius reads as a different family of
      // shape. The client looked at the built grids and asked for rounder, which
      // settles it: the mark is 32 px of bezel and the cards are the page, so
      // the cards are what the site's shape language actually is. 8 is soft
      // enough to read as deliberate and still far from a pill.
      borderRadius: 8,

      // §5.1 ships no stylesheet, so the typeface is declared here and in the
      // @font-face block in index.css, and nowhere else. See that file for why
      // Plex: the catalogue is mostly reference codes, and Plex draws digits,
      // capitals and hyphens to be read as data.
      fontFamily:
        "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      fontFamilyCode: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",

      // Up from AntD's 14. The phone is the real device (principle 5) and the
      // primary content is a reference code read at arm's length in a shop, so
      // the base size is set for that rather than for a dense desktop table.
      // Everything else derives from it — headings, the rail, the footer — so
      // this is the one number to change.
      fontSize: 16,
      fontSizeSM: 14,
      fontSizeLG: 18,

      // See `TEXT_DESCRIPTION` in palette.ts: AntD's secondary text does not
      // pass AA, and the lead paragraph on the front page is secondary text.
      colorTextDescription: TEXT_DESCRIPTION[mode],
    },
    components: {
      Layout: {
        headerHeight: 64,
        headerPadding: '0 16px',
      },
    },
  }
}
