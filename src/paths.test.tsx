import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderApp } from './test/renderApp'
import { t } from './i18n/strings'

/**
 * **The rendered app has to link to the URL the rest of the site names.**
 *
 * Nothing here was catchable before. `scripts/seo.ts` is one file and it is
 * internally consistent — canonical, `og:url`, breadcrumb, sitemap and the
 * `<noscript>` links all come off one `canonical()` and all end in a slash. The
 * React tree is a different file that never mentions any of them, and it said
 * `/line/vintage`. Both halves were self-consistent and every test passed while
 * a JavaScript-running crawler collected an href the server answers with a 301.
 *
 * So the assertion is deliberately about the **whole rendered document** rather
 * than about any one link: it is the crawler's question — *of the URLs this page
 * offers me, which are the real ones?* — and a new `<Link>` written the old way
 * fails it wherever it is added, without anybody remembering to test it.
 *
 * The screens are entered at their slashed URLs, which is a second thing worth
 * proving: those are the URLs Pages redirects a reader to and the ones in the
 * sitemap, so if `matchPath` ever stopped ignoring a trailing slash, every
 * indexed page on the site would render the 404 (`router.test.tsx` makes the
 * same point for one watch, and this widens it to every route with a file).
 */
const internalLinks = () =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')).map(
    (anchor) => anchor.getAttribute('href') ?? '',
  )

const SCREENS = [
  // The front door's h2 is the site name; "Lines" below it is the h3 that opens
  // the grid, which is why this is not the string the other browsing tests wait on.
  ['the front door', '/', t('app.name')],
  ['a line', '/line/g-shock/', 'G-SHOCK'],
  ['a series', '/line/vintage/f-91w/', 'F-91W'],
  ['a watch', '/watch/f-91w-1/', 'F-91W-1'],
  ['the editions index', '/editions/', t('editions.heading')],
  ['an edition', '/editions/pac-man/', 'PAC-MAN Collaboration'],
  ['the symbol glossary', '/symbols/', t('symbols.heading')],
] as const

describe('the URLs the app links to (paths.ts)', () => {
  it.each(SCREENS)('offers only served URLs from %s', async (_what, url, heading) => {
    renderApp(url)
    await screen.findByRole('heading', { name: heading, level: 2 })

    const links = internalLinks()
    // A page with no internal link at all would pass the loop below without
    // asserting anything, and the shell alone guarantees at least the logo.
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) {
      expect(href, `${href} is a 301 on Pages, not a page`).toMatch(/\/$/)
    }
  })
})
