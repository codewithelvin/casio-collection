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
