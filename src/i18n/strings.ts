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

  // Filters and sorting (M3, FR-1.3 to FR-1.5)
  'filter.year': 'Year',
  'filter.display': 'Display',
  'filter.movement': 'Movement',
  'filter.features': 'Features',
  'filter.unknownYear': 'Unknown year',
  'filter.clearAll': 'Clear all',
  // The empty state says the long form. Beside the chips the context is the
  // chips; alone on an empty grid, "Clear all" does not say all of what.
  'filter.clearAllFilters': 'Clear all filters',
  'filter.remove': 'Remove',
  'filter.sort': 'Sort',
  'filter.showing': 'shown',
  'sort.ref': 'Reference A–Z',
  'sort.year-desc': 'Year, newest first',
  'sort.year-asc': 'Year, oldest first',
  'filter.none.title': 'Nothing here carries every filter',
  'filter.none.body':
    'These filters are all set at once, and no watch in this view matches all of them. Drop one, or clear them all.',

  // Search (M3, FR-2)
  'search.results': 'results',
  'search.result': 'result',
  'search.seeAll': 'See all',
  'search.hint': 'Press / to search',
  'search.noTerm.title': 'Type a reference, a name, or the word collectors use',
  'search.noTerm.body':
    'GA-2100 and ga2100 are the same search. So is the square, which reaches DW-5600, GW-M5610 and every other case that shape.',
  'search.empty.title': 'Nothing matches that',
  'search.empty.body':
    'It may not be catalogued yet — most of this catalogue is still to be sourced. Try the reference without punctuation, or the series name on its own.',

  // The watch page (FR-3)
  'watch.notFound.title': 'That reference is not catalogued',
  'watch.notFound.body':
    'It may not have been sourced yet. Nothing enters this catalogue without a page to read it off.',
  'watch.specs': 'Specification',
  'watch.zoom': 'View larger',
  'watch.otherInSeries': 'Other models in this series',
  'watch.officialPage': 'Casio product page',
  'watch.leavesSite': 'opens casio.com',
  'watch.sourceHeading': 'Where this came from',
  'watch.source.official': 'From the manufacturer',
  'watch.source.retailer': 'From a retailer listing',
  'watch.source.community': 'From an enthusiast source',
  'watch.tombstone.title': 'This entry has been retired',
  'watch.tombstone.replacedBy': 'Use this entry instead',
  // D41 — the credit under a photograph. "Photograph by" and not "Image from":
  // the licence asks for the person, not the website.
  'image.creditBy': 'Photograph by',
  // The distinction is the point: "by" names someone who granted a licence,
  // "from" names a page a file was taken from under D11.
  'image.creditFrom': 'Photograph from',
  'licence.rights-reserved': 'All rights reserved',
  'licence.cc-by-sa-4.0': 'CC BY-SA 4.0',
  'licence.cc-by-sa-3.0': 'CC BY-SA 3.0',
  'licence.cc-by-4.0': 'CC BY 4.0',
  'licence.cc0-1.0': 'CC0 1.0',
  'licence.public-domain': 'Public domain',
  'licence.own-work': 'Photographed for this catalogue',

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

  // Authentication (M4, §8.9, §9)
  //
  // §8.9 gives this modal one job. D6 asks for an email address before the site
  // has demonstrated anything, so the copy has to do the persuading that the
  // architecture refuses to do: one line saying what happens, the watch that
  // triggered it, the button. No tabs, no password field, no terms wall.
  'auth.modal.title': 'Sign in to keep track of the watches you own',
  'auth.modal.lead':
    'Your collection is private to your account. Nothing is shared unless you choose to share it.',
  'auth.modal.thisOne': "We'll mark this one for you",
  'auth.google': 'Continue with Google',
  'auth.googleOnly':
    'Google is the only way in at the moment. An email sign-in link is built and will be switched on later.',
  'auth.or': 'or',
  'auth.email.label': 'Email address',
  'auth.email.placeholder': 'you@example.com',
  'auth.email.send': 'Email me a sign-in link',
  'auth.email.invalid': 'That does not look like an email address.',
  'auth.inbox.title': 'Check your inbox',
  'auth.inbox.body': 'A sign-in link is on its way to',
  'auth.inbox.hint': 'The link works once. If it has not arrived in a minute, look in spam.',
  'auth.error.title': 'That did not work',
  'auth.error.body':
    'Something went wrong reaching the sign-in service. Trying again usually settles it.',
  'auth.error.retry': 'Try again',
  'auth.close': 'Close',

  // The state the site is in before the Supabase project exists (§14.2). It is
  // a real state and not a placeholder: browsing is unaffected by design.
  'auth.unavailable.title': 'Signing in is not switched on yet',
  'auth.unavailable.body':
    'Accounts arrive shortly. Everything in the catalogue is public and works without one.',

  // §7.3 — a required route renders the modal over a blurred shell rather than
  // redirecting, so the URL survives and you land where you meant to.
  'auth.required.title': 'Sign in to see this page',
  'auth.required.body':
    'This page shows what you have marked, so it has to know who you are. The address you typed is kept — signing in brings you straight back to it.',

  // The OAuth and magic-link return (§9.2, §9.4)
  'auth.callback.working': 'One moment — putting you back where you were.',
  'auth.callback.failed.title': 'That sign-in did not complete',
  'auth.callback.failed.body':
    'The link may have been used already, or it may have expired. Nothing is wrong with your account; starting again takes a moment.',
  'auth.callback.home': 'Back to the catalogue',

  // Ownership (M5, §3.4, §8.7)
  //
  // The two labels are the product in two words. "Owned One" is what the button
  // says before it is pressed and it is phrased as the thing you are claiming
  // rather than as an instruction — *Add to collection* describes the software,
  // *Owned One* describes the reader. After the press it is a statement of
  // fact, so it loses the verb entirely.
  'owned.mark': 'Owned One',
  'owned.marked': 'Owned',
  'wishlist.add': 'Add to wishlist',
  'wishlist.remove': 'Remove from wishlist',
  // FR-4.5 — D8 moves a watch rather than duplicating it, and a press that
  // silently empties one list to fill another has to say so.
  'owned.moved': 'Moved from your wishlist',
  // FR-4.3 — the optimistic write failed and the button has already gone back
  // to what it said. What is owed is the reason and a second attempt, not an
  // apology: nothing the reader did was wrong and nothing of theirs is lost.
  'owned.failed.title': 'That did not save',
  'owned.failed.body':
    'The mark has been put back to what it was. Your connection may have dropped — trying again usually settles it.',
  'owned.retry': 'Try again',
  // FR-4.4 — the only ownership action that destroys something typed. It asks
  // once, says exactly what goes, and does not ask at all when there is nothing
  // to lose: a confirmation on every removal is a confirmation nobody reads.
  'owned.removeNote.title': 'Remove this watch and its note?',
  'owned.removeNote.body':
    'The note you wrote against this watch is stored with the mark, so removing the mark deletes the note too. This cannot be undone.',
  'owned.removeNote.confirm': 'Remove it',
  'owned.removeNote.cancel': 'Keep it',
  // §9.4 step 4 — the press that survived a sign-in, applied on the way back.
  'owned.restored': 'Marked, as you asked before signing in',

  // The account control in the header (§8.1)
  'account.menu': 'Account',
  'account.signedInAs': 'Signed in as',
  'account.myCollection': 'My Collection',
  'account.settings': 'Settings',
  'account.signOut': 'Sign out',
  'account.restoring': 'Restoring your session',

  // Footer — FR-10.3. The non-affiliation notice is body text, not small print
  // (§8.11): the name, the shape and the colour all point at Casio, so this
  // sentence is what pays for them. It is repeated on the About page and in the
  // meta description so it travels with a link preview (FR-10.4).
  'footer.disclaimer':
    'An independent, non-commercial project, not affiliated with or endorsed by Casio Computer Co., Ltd.',
  // Two claims, because there are two kinds of picture here (D41): Casio's
  // product photography, and photographs licensed to us by whoever took them.
  // It was drafted at three sentences and cut back to two — the footer is small
  // print carrying a legal position, and a legal position nobody finishes
  // reading is not doing its job. The detail belongs on the watch, where the
  // credit under the picture says exactly which kind it is.
  'footer.attribution':
    'Reference codes and product photography are the property of Casio Computer Co., Ltd. Other photographs are credited on the watch they show.',
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

const LICENCE_LABELS: Record<string, StringKey> = {
  'cc-by-sa-4.0': 'licence.cc-by-sa-4.0',
  'cc-by-sa-3.0': 'licence.cc-by-sa-3.0',
  'cc-by-4.0': 'licence.cc-by-4.0',
  'cc0-1.0': 'licence.cc0-1.0',
  'public-domain': 'licence.public-domain',
  'own-work': 'licence.own-work',
  'rights-reserved': 'licence.rights-reserved',
}

/**
 * D41 — the licence name as it is written by the body that wrote it. These are
 * not translated and must not be: *CC BY-SA 4.0* is the licence's own
 * identifier, and a localised paraphrase of a licence name is a different claim.
 */
export const imageLicenceLabel = (licence: string): string => {
  const key = LICENCE_LABELS[licence]
  return key ? t(key) : licence
}

/** FR-3.2a — the reader is told what kind of page the data was read off. */
export function sourceLabel(kind: string): string {
  if (kind === 'official') return t('watch.source.official')
  if (kind === 'retailer') return t('watch.source.retailer')
  return t('watch.source.community')
}

/* ------------------------------------------------------------------------- *
 * The filter bar and the search results (M3)
 *
 * These compose rather than interpolate. A dictionary of sentences with holes
 * in them is the thing that makes a second locale a rewrite, and every string
 * here is short enough that joining two of them reads the same in English as
 * one would. Where a number sits inside a phrase — *See all 24 results* — the
 * phrase is split at the number rather than templated around it.
 * ------------------------------------------------------------------------- */

const FACET_LABELS: Record<string, StringKey> = {
  year: 'filter.year',
  display: 'filter.display',
  movement: 'filter.movement',
  features: 'filter.features',
}

export const facetLabel = (field: string): string => {
  const key = FACET_LABELS[field]
  return key ? t(key) : humanise(field)
}

const SORT_LABELS: Record<string, StringKey> = {
  ref: 'sort.ref',
  'year-desc': 'sort.year-desc',
  'year-asc': 'sort.year-asc',
}

export const sortLabel = (sort: string): string => {
  const key = SORT_LABELS[sort]
  return key ? t(key) : humanise(sort)
}

/**
 * A facet value as the reader sees it. `unknown` is the one value that is not
 * data at all — it is D5's explicit option, and it is written out in words
 * because "unknown" on its own beside a year reads as a broken row.
 */
export function facetValueLabel(field: string, value: string): string {
  if (field === 'year') return value === 'unknown' ? t('filter.unknownYear') : value
  if (field === 'display') return displayLabel(value)
  if (field === 'movement') return movementLabel(value)
  return featureLabel(value)
}

/** *24 results*, *1 result* — the count and its noun, agreeing. */
export const resultCount = (count: number): string =>
  `${count} ${count === 1 ? t('search.result') : t('search.results')}`

/** FR-2.3 — *See all 24 results*, the last row of the dropdown. */
export const seeAllResults = (count: number): string =>
  `${t('search.seeAll')} ${resultCount(count)}`
