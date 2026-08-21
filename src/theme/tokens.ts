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

/**
 * The watch ghosted behind each line card on the front door — the model id of a
 * photograph already in `public/img/models/`, never a new file.
 *
 * **This is an editorial choice and it sits beside the accent because it is the
 * same kind of choice.** Nothing in the catalogue says which watch *is* a line;
 * picking the first reference alphabetically would put `A-158WA-1`'s cousin on
 * Vintage and some `ECB-10` variant on Edifice, and the front door would be
 * illustrated by whichever colourway happened to sort first. So a human names
 * one per line, and `lineGrounds.test.ts` proves each one is a file that exists
 * and a model the catalogue actually publishes.
 *
 * All seven are Casio's own product photography on a transparent ground, which
 * is what makes the treatment work in both themes: what tints the card is the
 * watch, not a white rectangle around it.
 */
export const LINE_GROUNDS: Record<string, string> = {
  'g-shock': 'dw-5600e-1',
  vintage: 'f-91w-1',
  edifice: 'efr-526d-1av',
  'pro-trek': 'prw-35-1a',
  'baby-g': 'ba-110-1a',
  sheen: 'she-3047pg-5a',
  oceanus: 'ocw-s400-3a',
}

/**
 * How faint the ghost is. **Both numbers are ceilings derived from AA, not
 * values chosen by eye**, and the derivation is why they differ per theme.
 *
 * `colorTextDescription` above is set to the darkest quiet grey that still
 * clears 4.5:1 on a plain card — 4.7:1, so it has almost no headroom, and the
 * count under every line name is set in it. Tint the ground behind that text
 * and the ratio falls with it.
 *
 * What saves it is that the token is **translucent**: `rgba(0, 0, 0, 0.55)`
 * composites against whatever is behind it, so darkening the ground darkens the
 * text too and the ratio decays far more slowly than it would for an opaque
 * grey. Worked through for the worst case the photograph can produce — a fully
 * black pixel directly under the count on white — 0.08 lands at 4.55:1 and 0.10
 * at 4.49:1. Hence 0.08.
 *
 * Dark is the mirror image: the danger is a *bright* pixel (a steel bracelet, a
 * white dial) lifting a #1f1f1f card toward the text rather than away from it,
 * and that runs out at 0.13. Dark also needs the larger number to show anything
 * at all — most of these watches are black resin on a nearly black card, so only
 * their highlights read.
 *
 * The card also keeps the photograph out of the left half entirely, so the worst
 * case above is a bound rather than a description. Raising either number is a
 * contrast decision, not a taste one.
 */
export const LINE_GROUND_OPACITY: Record<ThemeMode, number> = { light: 0.08, dark: 0.12 }

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

      // **AntD's secondary text does not pass AA, and the lead paragraph on the
      // front page is secondary text.** `colorTextDescription` is an alias of
      // `colorTextTertiary`, `rgba(0, 0, 0, 0.45)` — #8C8C8C once composited on
      // white, which is 3.4:1 against the 4.5:1 that WCAG AA asks of body text.
      // 0.55 is #737373 and 4.8:1. Set here rather than per component because
      // `type="secondary"` is one decision the whole product reads through, and
      // a page that fixed its own copy would leave the next one to be found by
      // an audit.
      //
      // The dark value is raised with it. It already passed on its own —
      // rgba(255, 255, 255, 0.45) is 4.5:1 on #141414 — but only just, and
      // "secondary" meaning two different degrees of quiet in the two themes is
      // the kind of difference that gets reported as a bug in one of them.
      colorTextDescription: mode === 'dark' ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
    },
    components: {
      Layout: {
        headerHeight: 64,
        headerPadding: '0 16px',
      },
    },
  }
}
