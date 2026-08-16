/**
 * D12 — English only, but every user-facing string goes through this module.
 * No string literals in JSX; the lint rule in eslint.config.js enforces it.
 *
 * Adding a locale later is a second dictionary and a switcher, not a refactor.
 * That is the whole reason this file exists while the app speaks one language.
 */
const en = {
  // Identity and shell
  // D39 — the product is Casio Vault. The wordmark is two spans rather than one
  // string because §8.11 sets CASIO at weight 600 and the second word at 400,
  // and a single string cannot carry two weights without markup in the copy.
  'app.name': 'Casio Vault',
  'app.name.casio': 'CASIO',
  'app.name.vault': 'VAULT',
  'app.tagline': 'Browse the catalogue. Mark what you own.',
  'nav.open': 'Open navigation',
  'nav.close': 'Close navigation',
  'nav.lines': 'Lines',
  'theme.toLight': 'Switch to light theme',
  'theme.toDark': 'Switch to dark theme',
  'search.placeholder': 'Search a reference — GA-2100, F-91W, square',
  'search.open': 'Open search',
  'account.signIn': 'Sign in',

  // Routes — placeholder headings until the milestone that fills them
  'route.home.title': 'Casio Vault',
  'route.line.title': 'Line',
  'route.series.title': 'Series',
  'route.watch.title': 'Watch',
  'route.search.title': 'Search',
  'route.collection.title': 'My Collection',
  'route.settings.title': 'Settings',
  'route.profile.title': 'Collection',
  'route.authCallback.title': 'Signing you in',

  // FR-10.2 — the unknown route
  'notFound.title': 'That page is not here',
  'notFound.body':
    'The link may be old, or the reference may not be catalogued yet. Try a search, or start from a line.',
  'notFound.home': 'Go to the catalogue',

  // Cross-cutting async states (FR-10.1)
  'state.loading': 'Loading',
  'state.error.title': 'Something went wrong',
  'state.error.retry': 'Try again',

  // M0 placeholder — every route renders this until its own milestone lands
  'placeholder.notBuilt': 'This screen arrives in a later milestone.',

  // Browsing (M2)
  'home.lead': 'Browse by line, then by series. Press Owned One on anything you have.',
  'home.linesHeading': 'Lines',
  'home.models': 'models',
  'home.unseeded': 'Not catalogued yet',
  'home.unseededHint': 'This line has no references in the catalogue yet.',
  'line.seriesHeading': 'Series in this line',
  'line.empty.title': 'This line is not catalogued yet',
  'line.empty.body':
    'No references for this line have been sourced yet. The catalogue is seeded a series at a time, from real sources only — nothing here is invented to fill a gap.',
  'line.notFound.title': 'No such line',
  'line.notFound.body': 'That line is not one of the eight this catalogue covers.',
  'series.notFound.title': 'No such series',
  'series.notFound.body': 'That series is not in the catalogue.',
  'series.backToLine': 'All series in this line',
  'grid.empty': 'Nothing to show here yet.',

  // The watch page (FR-3)
  'watch.notFound.title': 'That reference is not catalogued',
  'watch.notFound.body':
    'It may not have been sourced yet. Nothing enters this catalogue without a page to read it off.',
  'watch.specs': 'Specification',
  'watch.otherInSeries': 'Other models in this series',
  'watch.officialPage': 'Casio product page',
  'watch.leavesSite': 'opens casio.com',
  'watch.sourceHeading': 'Where this came from',
  'watch.source.official': 'From the manufacturer',
  'watch.source.retailer': 'From a retailer listing',
  'watch.source.community': 'From an enthusiast source',
  'watch.tombstone.title': 'This entry has been retired',
  'watch.tombstone.replacedBy': 'Use this entry instead',
  'watch.noSpecs':
    'Nobody has sourced the specifications for this reference yet. Absent means unknown, not zero.',

  // Specification field labels (FR-3.2). Only rendered for fields the model has.
  'spec.year': 'Year',
  'spec.display': 'Display',
  'spec.movement': 'Movement',
  'spec.module': 'Module',
  'spec.case.material': 'Case',
  'spec.case.width_mm': 'Width',
  'spec.case.height_mm': 'Height',
  'spec.case.depth_mm': 'Depth',
  'spec.case.weight_g': 'Weight',
  'spec.water_resistance_m': 'Water resistance',
  'spec.features': 'Features',
  'spec.colorway': 'Colourway',
  'spec.line': 'Line',
  'spec.series': 'Series',

  // Footer — FR-10.3. The non-affiliation notice is body text, not small print
  // (§8.11): the name, the shape and the colour all point at Casio, so this
  // sentence is what pays for them. It is repeated on the About page and in the
  // meta description so it travels with a link preview (FR-10.4).
  'footer.disclaimer':
    'An independent, non-commercial project, not affiliated with or endorsed by Casio Computer Co., Ltd.',
  'footer.attribution':
    'Product images and reference codes are the property of Casio Computer Co., Ltd.',
  'footer.source': 'Source code',
  'footer.catalogVersion': 'Catalogue',
  'footer.madeBy': 'Made by Claude for Casio Lovers',
} as const

export type StringKey = keyof typeof en

export function t(key: StringKey): string {
  return en[key]
}

/** Exported for the lint rule's allow-list and for tests that assert copy. */
export const strings = en

/* ------------------------------------------------------------------------- *
 * Vocabulary labels
 *
 * These are keyed by the values in `catalog/vocabulary.ts` rather than being
 * `en` keys, because they are read from data at render time and a `StringKey`
 * union cannot be indexed by a string that arrived in a JSON file.
 *
 * `featureLabel` falls back to humanising the id rather than rendering nothing.
 * The vocabulary grows by an explicit, reported step (§10.6 guardrail 4), so a
 * value can legitimately reach the browser one deploy before its label does —
 * and a filter chip reading "el backlight" is a cosmetic fault, where a blank
 * chip is a broken one.
 * ------------------------------------------------------------------------- */

const DISPLAY_LABELS: Record<string, string> = {
  digital: 'Digital',
  analog: 'Analogue',
  'ana-digi': 'Ana-digi',
}

const MOVEMENT_LABELS: Record<string, string> = {
  quartz: 'Quartz',
  solar: 'Solar',
  'solar-radio': 'Solar, radio-controlled',
  automatic: 'Automatic',
  manual: 'Manual wind',
}

const FEATURE_LABELS: Record<string, string> = {
  'world-time': 'World time',
  stopwatch: 'Stopwatch',
  'countdown-timer': 'Countdown timer',
  alarm: 'Alarm',
  'multi-alarm': 'Multiple alarms',
  'dual-time': 'Dual time',
  calendar: 'Calendar',
  'full-auto-calendar': 'Full auto calendar',
  'hourly-time-signal': 'Hourly time signal',
  'led-light': 'LED light',
  'el-backlight': 'EL backlight',
  'super-illuminator': 'Super Illuminator',
  'auto-light': 'Auto light',
  afterglow: 'Afterglow',
  'radio-controlled': 'Radio-controlled',
  bluetooth: 'Bluetooth',
  'tough-solar': 'Tough Solar',
  'power-saving': 'Power saving',
  altimeter: 'Altimeter',
  barometer: 'Barometer',
  compass: 'Compass',
  thermometer: 'Thermometer',
  'step-counter': 'Step counter',
  'tide-graph': 'Tide graph',
  'moon-data': 'Moon data',
  'sunrise-sunset': 'Sunrise and sunset',
  'shock-resistant': 'Shock resistant',
  'mud-resistant': 'Mud resistant',
  'magnetic-resistant': 'Magnetic resistant',
  'screw-lock-crown': 'Screw-lock crown',
  'sapphire-crystal': 'Sapphire crystal',
  'mineral-glass': 'Mineral glass',
  calculator: 'Calculator',
  telememo: 'Telememo',
  databank: 'Databank',
  'vibration-alarm': 'Vibration alarm',
  'flash-alert': 'Flash alert',
}

const humanise = (value: string) => value.replace(/-/g, ' ')

export const displayLabel = (value: string): string => DISPLAY_LABELS[value] ?? humanise(value)
export const movementLabel = (value: string): string => MOVEMENT_LABELS[value] ?? humanise(value)
export const featureLabel = (value: string): string => FEATURE_LABELS[value] ?? humanise(value)

/** FR-3.2a — the reader is told what kind of page the data was read off. */
export function sourceLabel(kind: string): string {
  if (kind === 'official') return t('watch.source.official')
  if (kind === 'retailer') return t('watch.source.retailer')
  return t('watch.source.community')
}
