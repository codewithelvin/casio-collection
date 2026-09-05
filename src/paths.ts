/**
 * **Every internal URL this app links to, in the one form the server serves.**
 *
 * The SEO build writes a real file at `dist/line/vintage/index.html`, so on
 * Pages (D13) a page *is* a directory: `/line/vintage/` is 200, and
 * `/line/vintage` is a **301** to it. The canonical tag, the `og:url`, the JSON-LD
 * breadcrumb and every `<loc>` in the sitemap have always said the slashed form —
 * `scripts/seo.ts` builds all four from one `canonical()` — and so does every
 * link in the `<noscript>` body a JavaScript-less crawler reads.
 *
 * The *rendered* app said the other one. `<Link to="/line/vintage">` puts
 * `href="/line/vintage"` in the DOM, and a crawler that runs JavaScript — Yandex
 * does, and reported `/line/vintage` as an error while `/line/vintage/` was
 * fine — harvests that href, requests it, and finds a redirect where the sitemap
 * promised a page. Two URLs for one page, discovered by two halves of the same
 * site disagreeing.
 *
 * So the slash is not cosmetic and it is not only about crawlers: it is what
 * exists at that address. A reader who copies the address bar after an in-app
 * navigation, or reloads, spends a round trip on the redirect that this saves.
 *
 * **The routes that are missing from this file are missing deliberately.**
 * `/search`, `/collection`, `/settings`, `/u/:handle` and `/auth/callback` have
 * no file at their path in either form — they are served by the 404.html
 * fallback (§14.3) and none of them is indexable. A trailing slash there would
 * claim a directory that does not exist, which is the same lie in the other
 * direction, and `authCallbackUrl()` has to keep matching what Supabase has on
 * its allow-list besides. Those paths stay written where they are used.
 *
 * `matchPath` ignores a trailing slash, so the route table in `router.tsx` needs
 * nothing from this and keeps resolving both spellings — which it must, because
 * the unslashed ones are already indexed, already linked from elsewhere, and
 * still arrive here after Pages redirects them.
 */

/**
 * The front door has no entry here and needs none: `/` is already what
 * `canonical('')` writes and what Pages serves, so a `<Link to="/">` has never
 * been able to disagree with anything. This file is for the paths that could.
 */

/** D62 — the list of editions. */
export const EDITIONS = '/editions/'

/** The symbol glossary. */
export const SYMBOLS = '/symbols/'

/** One line: `/line/g-shock/`. `slug`, not `id` — the URL has always used it. */
export const linePath = (lineSlug: string): string => `/line/${lineSlug}/`

/** One series, under its line (D32): `/line/g-shock/dw-5600/`. */
export const seriesPath = (lineSlug: string, seriesId: string): string =>
  `/line/${lineSlug}/${seriesId}/`

/** One reference: `/watch/ga-2100-1a1/`. */
export const watchPath = (modelId: string): string => `/watch/${modelId}/`

/** One edition: `/editions/pac-man/`. */
export const editionPath = (editionSlug: string): string => `/editions/${editionSlug}/`
