/**
 * The one place a page title is composed.
 *
 * THE BUG THIS EXISTS TO KILL: two implementations, and the wrong one wins.
 * `scripts/seo.ts` writes a real `<title>` into every prerendered page, and then
 * the React route mounts and overwrites `document.title` with a different
 * string. **Googlebot renders**, so the second one is what gets indexed — the
 * prerendered title is a decoy that only a curl sees.
 *
 * Measured by D66's crawl gate on 2026-09-04:
 *
 *   /symbols/   written  "Casio digital watch symbols explained — what every
 *                         indicator means · Casio Vault"
 *               indexed  "Display symbols · Casio Vault"
 *   a watch     written  "GA-2100-1A — specification · Casio Vault"
 *               indexed  "GA-2100-1A · Casio Vault"
 *
 * `/symbols/` is written to rank for *what does SIG mean on a Casio*, and the
 * rendered title threw that away for the nav label. Descriptions were never
 * affected, which is why it survived a review: the page looked right everywhere
 * except the one string search engines read.
 *
 * So: **both sides import from here, and neither builds a title itself.** This
 * module has no UI imports and must keep none — a shared helper that drags a
 * component's module with it is the `CollectorAvatar` fault, and this one is
 * imported by a build script that cannot load React at all.
 */

import { t } from '../i18n/strings.ts'

/** `<subject> · Casio Vault`, the plain form. */
export const siteTitle = (subject: string): string => `${subject} · ${t('app.name')}`

/**
 * `<subject> — <qualifier> · Casio Vault`.
 *
 * The qualifier is the half that kept getting lost, and it is the half doing
 * the SEO work: "specification" is what somebody types after a reference.
 */
export const qualifiedTitle = (subject: string, qualifier: string): string =>
  siteTitle(`${subject} — ${qualifier}`)

export const homeTitle = (): string => t('seo.home.title')
export const lineTitle = (name: string): string => qualifiedTitle(name, t('seo.line.qualifier'))
// `t()` takes a key and nothing else (D12) — there is no interpolation — so a
// count is concatenated here rather than pushed into the dictionary.
export const seriesTitle = (name: string, count: number): string =>
  qualifiedTitle(name, `${count} ${t('seo.series.references')}`)
export const editionsTitle = (): string => siteTitle(t('seo.editions.title'))
export const editionTitle = (name: string, count: number): string =>
  qualifiedTitle(name, `${count} ${t('seo.edition.references')}`)
export const symbolsTitle = (): string => siteTitle(t('seo.symbols.title'))
export const collectorsTitle = (): string => siteTitle(t('route.collectors.title'))
export const notFoundTitle = (): string => siteTitle(t('seo.notfound.title'))

/** A watch page. The qualifier is `specification`. */
export const watchTitle = (name: string): string => qualifiedTitle(name, t('seo.watch.qualifier'))

/** A search results page — runtime only, never prerendered with a term. */
export const searchTitle = (term: string): string => siteTitle(term)

/** A public profile — runtime only, and `noindex` under D45. */
export const profileTitle = (who: string): string => siteTitle(who)
