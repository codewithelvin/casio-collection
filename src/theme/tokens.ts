import { theme, type ThemeConfig } from 'antd'

/**
 * §8.11 — Casio blue. The client's instruction was "the brand blue"; #0033A0 is
 * matched by eye and lives here alone, so replacing it with an exact value from
 * a brand guideline is a one-line change.
 *
 * The dark value is the same hue lifted until it passes AA on a dark ground —
 * the light value fails badly there (about 1.6:1 on #141414).
 */
export const CASIO_BLUE_LIGHT = '#0033A0' // ~12:1 on white
export const CASIO_BLUE_DARK = '#4D9BFF' // ~6.7:1 on #141414

export type ThemeMode = 'light' | 'dark'

/**
 * Per-line accent colours (§8.3). Used only as a thin card top-border and the
 * sider's active indicator — never as a fill behind text, so contrast stays
 * fixed at AA in both themes and these values never need a dark variant.
 */
export const LINE_ACCENTS: Record<string, string> = {
  'g-shock': '#F25C05',
  vintage: '#B08D57',
  edifice: '#1F4E79',
  'pro-trek': '#2E7D32',
  'baby-g': '#E5559E',
  sheen: '#8E7CC3',
  oceanus: '#0091C8',
}

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
    },
    components: {
      Layout: {
        headerHeight: 64,
        headerPadding: '0 16px',
      },
    },
  }
}
