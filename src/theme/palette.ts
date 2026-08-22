/**
 * Every colour decision in the product, **and not one import of `antd`.**
 *
 * That absence is the whole reason this file was split out of `tokens.ts`. The
 * shell — the header, the rail, the footer, the front door — is rendered without
 * Ant Design so that the first load does not have to evaluate it (§12), and
 * `LINE_ACCENTS` is read by nine modules including several of those. While these
 * constants lived beside `themeConfig`, importing one accent colour pulled
 * `antd/es/index.js` into the entry chunk and with it AntD's whole theme
 * runtime. `tokens.ts` now imports *this*, never the other way round.
 *
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
 * `colorTextDescription` is set to the darkest quiet grey that still clears
 * 4.5:1 on a plain card — 4.7:1, so it has almost no headroom, and the count
 * under every line name is set in it. Tint the ground behind that text and the
 * ratio falls with it.
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

/**
 * **§8.3's quiet text colour, and the one token this project overrides rather
 * than accepts.**
 *
 * AntD's secondary text does not pass AA, and the lead paragraph on the front
 * page is secondary text. `colorTextDescription` is an alias of
 * `colorTextTertiary`, `rgba(0, 0, 0, 0.45)` — #8C8C8C once composited on white,
 * which is 3.4:1 against the 4.5:1 that WCAG AA asks of body text. 0.55 is
 * #737373 and 4.8:1. Set centrally because `type="secondary"` is one decision
 * the whole product reads through, and a page that fixed its own copy would
 * leave the next one to be found by an audit.
 *
 * The dark value is raised with it. It already passed on its own —
 * rgba(255, 255, 255, 0.45) is 4.5:1 on #141414 — but only just, and "secondary"
 * meaning two different degrees of quiet in the two themes is the kind of
 * difference that gets reported as a bug in one of them.
 */
export const TEXT_DESCRIPTION: Record<ThemeMode, string> = {
  light: 'rgba(0, 0, 0, 0.55)',
  dark: 'rgba(255, 255, 255, 0.55)',
}

/**
 * The surfaces and text colours the AntD-free shell paints with — **written out
 * here, and proved equal to AntD's own tokens by `palette.test.ts`.**
 *
 * The shell cannot call `theme.useToken()` any more: that function *is* AntD's
 * theme runtime, and evaluating it was a measurable slice of the 1 469 ms of
 * scripting that stood between a visitor and the first pixel. So the values are
 * written down — and a written-down copy of somebody else's constant is exactly
 * the drift this repository keeps a test for. `palette.test.ts` runs AntD's
 * `defaultAlgorithm` and `darkAlgorithm` over the same seed `themeConfig` uses
 * and asserts every entry below matches, so the day an AntD upgrade moves
 * `colorBgElevated` the suite says so instead of the drawer quietly going the
 * wrong shade.
 *
 * These become CSS custom properties under `:root` and `[data-theme='dark']`
 * (see `index.css`), which is what lets the same values reach a static first
 * paint that runs no JavaScript at all.
 */
export interface ShellTokens {
  /** Header, rail and footer. */
  bgContainer: string
  /** The page behind the content region. */
  bgLayout: string
  /** The drawer, which sits above the page and is a shade lighter in dark. */
  bgElevated: string
  /** Hairlines: under the header, beside the rail, above the footer. */
  borderSecondary: string
  /** Body text. */
  text: string
  /** Quiet text — counts, metadata, the lead paragraph. */
  textDescription: string
  /** The accent, after AntD's algorithm has had its say (see the test). */
  primary: string
  /** Skeleton blocks and the placeholder accent stripe. */
  fillSecondary: string
  /** The error state's glyph. */
  warning: string
}

export const SHELL_TOKENS: Record<ThemeMode, ShellTokens> = {
  light: {
    bgContainer: '#ffffff',
    bgLayout: '#f5f5f5',
    bgElevated: '#ffffff',
    borderSecondary: '#f0f0f0',
    text: 'rgba(0, 0, 0, 0.88)',
    textDescription: TEXT_DESCRIPTION.light,
    // Not CASIO_BLUE_LIGHT verbatim: AntD lowercases and re-emits the seed, and
    // this has to be the string the route content is actually painted with.
    primary: '#0033a0',
    fillSecondary: 'rgba(0, 0, 0, 0.06)',
    warning: '#faad14',
  },
  dark: {
    bgContainer: '#141414',
    bgLayout: '#000000',
    bgElevated: '#1f1f1f',
    borderSecondary: '#303030',
    text: 'rgba(255, 255, 255, 0.85)',
    textDescription: TEXT_DESCRIPTION.dark,
    // **Not CASIO_BLUE_DARK.** The dark algorithm shifts #4D9BFF to #4487dc, and
    // that shifted value is what every AntD-rendered link and primary button on
    // the site is; a shell painting the seed colour instead would be a shade off
    // from the page it frames. The test is what pins this.
    primary: '#4487dc',
    fillSecondary: 'rgba(255, 255, 255, 0.12)',
    warning: '#d89614',
  },
}

/**
 * The heading sizes AntD derives from `fontSize: 16`, needed by the shell and
 * the front door for the same reason the colours are: a heading rendered at the
 * wrong size in the static first paint is a layout shift when React replaces it,
 * and CLS is a quarter of the score this was all done for. Also pinned by
 * `palette.test.ts`.
 */
export const HEADING = {
  h2: { size: 34, lineHeight: 1.2352941176470589 },
  h3: { size: 28, lineHeight: 1.2857142857142858 },
  h4: { size: 22, lineHeight: 1.3636363636363635 },
} as const

/** The key the theme choice is remembered under, read by the store *and* by the
 *  inline script in the document head that has to know before any JS runs. */
export const THEME_STORAGE_KEY = 'cc.theme'
