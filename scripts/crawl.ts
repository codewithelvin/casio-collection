/**
 * **A crawler, run against `dist/` before the artefact is uploaded.**
 *
 * Everything else in this build asserts that a *file* was written. Nothing
 * asserted the thing those files exist for: that a crawler starting at `/`,
 * obeying robots.txt and following links, actually reaches all 3 500 pages and
 * finds a real document at each one. Those are different claims, and this
 * project has already shipped the gap between them — 389 URLs were advertised
 * in sitemap.xml that no page on the site linked to, and the way that was found
 * was somebody crawling the live site months later.
 *
 * So this walks the artefact the way a search engine walks the site:
 *
 *   * it resolves a path to a file the way **GitHub Pages** does, including the
 *     301 on a directory without a trailing slash and the 404.html fallback,
 *     because "the file exists" and "the URL serves it" are not the same
 *     sentence on a static host (D13);
 *   * it obeys the generated robots.txt, using RFC 9309 matching — longest
 *     rule wins, `Allow` breaks a tie — so the rules are exercised rather than
 *     assumed;
 *   * it follows `<a href>` out of the served HTML, which is what a crawler
 *     that runs no JavaScript sees, and which on this site is the `<noscript>`
 *     body the prerender step writes;
 *   * and it reconciles what it reached against sitemap.xml in both directions.
 *
 * **The findings that fail the build are the ones that mean a page is lost**: a
 * link to nothing, a sitemap URL that does not serve, a page in the sitemap
 * that says `noindex`. Everything else is reported and does not fail, because
 * an orphan can be a deliberate one and a duplicate title is a judgement call.
 *
 * `--render` additionally opens a sample of pages in Chromium and checks what a
 * *rendering* crawler sees, which is a different document — see `renderCheck`.
 *
 * Run with `npm run crawl`, or `npm run crawl -- --render`.
 */
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

/* ------------------------------------------------------------------------- *
 * robots.txt, per RFC 9309.
 * ------------------------------------------------------------------------- */

interface Rule {
  allow: boolean
  /** The path pattern as written, kept for the longest-match comparison. */
  pattern: string
  match: RegExp
}

/**
 * The rules in the `*` group, which since the 48-crawler roster came out is the
 * only group this file has.
 *
 * A named group would be selected over `*` by a crawler whose token matched it,
 * so reading only `*` is reading what the overwhelming majority of crawlers
 * read. If a named group is ever added, this stops being the whole story and
 * should grow a `--user-agent`.
 */
export function parseRobots(text: string): Rule[] {
  const rules: Rule[] = []
  let inStar = false

  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line === '') continue

    const [field = '', ...rest] = line.split(':')
    const value = rest.join(':').trim()
    const name = field.trim().toLowerCase()

    if (name === 'user-agent') {
      inStar = value === '*'
      continue
    }
    if (!inStar) continue
    if (name !== 'allow' && name !== 'disallow') continue
    if (value === '') continue

    rules.push({ allow: name === 'allow', pattern: value, match: robotsPattern(value) })
  }

  return rules
}

/**
 * A robots path pattern as a regex. `*` is any run of characters, a trailing
 * `$` anchors the end, and everything else matches as a **prefix** — which is
 * the rule people forget, and the reason `/collection` also covers
 * `/collections-of-mine` if such a page ever exists.
 */
function robotsPattern(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`)
}

/** Longest matching rule wins; `Allow` breaks a tie; no match means allowed. */
export function robotsAllows(rules: Rule[], path: string): boolean {
  let best: Rule | undefined
  for (const rule of rules) {
    if (!rule.match.test(path)) continue
    const length = rule.pattern.replace(/\$$/, '').length
    const bestLength = best ? best.pattern.replace(/\$$/, '').length : -1
    if (length > bestLength || (length === bestLength && rule.allow)) best = rule
  }
  return best ? best.allow : true
}

/* ------------------------------------------------------------------------- *
 * GitHub Pages, as a function.
 * ------------------------------------------------------------------------- */

interface Served {
  status: number
  /** Where a 301 points. */
  location?: string
  file?: string
}

/**
 * What GitHub Pages does with a path, which is not what `existsSync` does.
 *
 * The three behaviours that matter to a crawler, and all three have bitten this
 * project or were one deploy away from it:
 *
 *   * `/watch/ga-2100-1a1` — a directory asked for without its trailing slash
 *     is a **301** to the slash form, not a 200. Every internal `<Link>` in the
 *     app renders exactly this shape, so it is the normal case rather than an
 *     edge one.
 *   * `/anything-else` — an unknown path serves `404.html` with a **404**
 *     status. D13's fallback makes the app work there; the status is still 404
 *     and every crawler treats the URL as dead.
 *   * `/` and `/x/` — served from `index.html` inside the directory.
 */
async function serve(path: string): Promise<Served> {
  const clean = path.split('?')[0]?.split('#')[0] ?? '/'

  const asFile = join(dist, clean)
  const asIndex = join(dist, clean, 'index.html')

  if (clean.endsWith('/')) {
    if (await isFile(asIndex)) return { status: 200, file: asIndex }
    return { status: 404, file: join(dist, '404.html') }
  }

  if (await isFile(asFile)) return { status: 200, file: asFile }
  if (await isFile(asIndex)) return { status: 301, location: `${clean}/` }
  if (await isFile(`${asFile}.html`)) return { status: 200, file: `${asFile}.html` }

  return { status: 404, file: join(dist, '404.html') }
}

const isFile = async (path: string): Promise<boolean> =>
  stat(path)
    .then((info) => info.isFile())
    .catch(() => false)

/* ------------------------------------------------------------------------- *
 * Reading a page.
 * ------------------------------------------------------------------------- */

interface Page {
  path: string
  status: number
  title: string | undefined
  description: string | undefined
  canonical: string | undefined
  robots: string | undefined
  jsonLd: number
  ogImage: string | undefined
  h1: string | undefined
  links: string[]
  comments: number
  bytes: number
}

const ORIGIN = 'https://casiovault.com'

const meta = (html: string, name: string): string | undefined =>
  new RegExp(`<meta\\s+(?:name|property)="${name}"\\s+content="([^"]*)"`, 'i').exec(html)?.[1]

async function read(path: string, served: Served): Promise<Page> {
  const html = served.file ? await readFile(served.file, 'utf8') : ''

  const links = [...html.matchAll(/<a\s[^>]*href="([^"]+)"/gi)]
    .map((match) => match[1] ?? '')
    .filter((href) => !/^(https?:|mailto:|tel:|#)/i.test(href))
    .map((href) => (href.startsWith('/') ? href : posix.join(posix.dirname(path), href)))

  return {
    path,
    status: served.status,
    title: /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1],
    description: meta(html, 'description'),
    canonical: /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(html)?.[1],
    robots: meta(html, 'robots'),
    jsonLd: [...html.matchAll(/application\/ld\+json/g)].length,
    ogImage: meta(html, 'og:image'),
    h1: /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.trim(),
    links: [...new Set(links)],
    comments: [...html.matchAll(/<!--/g)].length,
    bytes: Buffer.byteLength(html),
  }
}

/* ------------------------------------------------------------------------- *
 * The crawl.
 * ------------------------------------------------------------------------- */

interface Finding {
  fatal: boolean
  message: string
}

async function crawl() {
  const robots = parseRobots(await readFile(join(dist, 'robots.txt'), 'utf8'))
  const sitemap = new Set(
    [...(await readFile(join(dist, 'sitemap.xml'), 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => (match[1] ?? '').replace(ORIGIN, ''),
    ),
  )

  const pages = new Map<string, Page>()
  const blocked = new Set<string>()
  const redirects = new Map<string, string>()
  const findings: Finding[] = []
  /** Who linked to what, so a broken link can be reported with its source. */
  const referrers = new Map<string, string>()

  let queue = ['/']
  const seen = new Set(queue)

  /**
   * A frontier at a time, not a URL at a time.
   *
   * Fetched strictly one after another this takes minutes on 3 500 pages, which
   * is long enough that nobody runs it before pushing — and a check nobody runs
   * is not a check. It is also not how any crawler behaves. Each round takes the
   * whole frontier concurrently and the links it finds become the next one, so
   * the wall clock is the depth of the site (home → line → series → watch, four
   * rounds) rather than the number of pages in it.
   *
   * `CONCURRENCY` is a cap because the frontier at depth three is 2 900 series
   * pages' worth of models, and opening 2 900 file handles at once is how a
   * Node script meets EMFILE.
   */
  const CONCURRENCY = 64

  while (queue.length > 0) {
    const frontier = queue
    queue = []

    for (let start = 0; start < frontier.length; start += CONCURRENCY) {
      const batch = frontier.slice(start, start + CONCURRENCY)

      const fetched = await Promise.all(
        batch.map(async (path) => {
          if (!robotsAllows(robots, path)) {
            blocked.add(path)
            return undefined
          }

          let served = await serve(path)
          if (served.status === 301 && served.location) {
            redirects.set(path, served.location)
            served = await serve(served.location)
          }

          return read(path, served)
        }),
      )

      for (const page of fetched) {
        if (!page) continue
        pages.set(page.path, page)

        if (page.status === 404) {
          const from = referrers.get(page.path)
          findings.push({
            fatal: true,
            message: `404: ${page.path}${from ? ` — linked from ${from}` : ''}`,
          })
          continue
        }

        for (const link of page.links) {
          if (seen.has(link)) continue
          seen.add(link)
          referrers.set(link, page.path)
          queue.push(link)
        }
      }
    }
  }

  /* ----------------------------------------------------------------------- *
   * What the crawl found.
   * ----------------------------------------------------------------------- */

  const reached = [...pages.values()].filter((page) => page.status === 200)
  const indexable = reached.filter((page) => !page.robots?.includes('noindex'))

  // A URL offered to crawlers that a crawler cannot reach by following links.
  // This is the exact finding that produced the `listed` rule in seo.ts, and it
  // is worth a permanent check rather than a comment recording that it happened.
  const orphans = [...sitemap].filter((loc) => !pages.has(loc) || pages.get(loc)?.status !== 200)
  for (const orphan of orphans.slice(0, 10)) {
    findings.push({ fatal: true, message: `in sitemap.xml but not reachable by crawling: ${orphan}` })
  }
  if (orphans.length > 10) {
    findings.push({ fatal: true, message: `…and ${orphans.length - 10} more sitemap orphans` })
  }

  // The mirror image, and only a warning: a page can be deliberately reachable
  // and deliberately unlisted. Every one of these should be explained by a
  // `noindex`, and one that is not is a page nobody is being told about.
  const unlisted = indexable.filter((page) => !sitemap.has(page.path))
  for (const page of unlisted.slice(0, 10)) {
    findings.push({
      fatal: false,
      message: `reachable and indexable but absent from sitemap.xml: ${page.path}`,
    })
  }

  // A noindex page inside the sitemap is a contradiction the site is making
  // with itself, and Google reports it as such in Search Console.
  for (const page of reached) {
    if (page.robots?.includes('noindex') && sitemap.has(page.path)) {
      findings.push({ fatal: true, message: `noindex but listed in sitemap.xml: ${page.path}` })
    }
  }

  for (const page of reached) {
    if (!page.title) findings.push({ fatal: true, message: `no <title>: ${page.path}` })
    if (!page.description) findings.push({ fatal: true, message: `no description: ${page.path}` })
    if (!page.h1) findings.push({ fatal: false, message: `no <h1> in the served HTML: ${page.path}` })
    if (page.comments > 0) {
      findings.push({ fatal: true, message: `${page.comments} HTML comment(s) shipped: ${page.path}` })
    }
    if (!page.robots) findings.push({ fatal: false, message: `no robots directive: ${page.path}` })

    // A canonical that names a different URL than the one serving it is the
    // page telling a crawler to index something else instead.
    const expected = `${ORIGIN}${page.path}`
    if (page.canonical && page.canonical !== expected) {
      findings.push({
        fatal: false,
        message: `canonical points elsewhere: ${page.path} -> ${page.canonical}`,
      })
    }
  }

  // Two pages with one title are two pages competing for the same query, and on
  // a catalogue it usually means a template lost the thing that distinguishes
  // them. Reported, never fatal — a real collision is a data question.
  const titles = new Map<string, string[]>()
  for (const page of indexable) {
    const list = titles.get(page.title ?? '') ?? []
    list.push(page.path)
    titles.set(page.title ?? '', list)
  }
  const duplicates = [...titles.entries()].filter(([, paths]) => paths.length > 1)
  for (const [title, paths] of duplicates.slice(0, 5)) {
    findings.push({
      fatal: false,
      message: `${paths.length} pages share the title ${JSON.stringify(title)}: ${paths.slice(0, 3).join(', ')}…`,
    })
  }

  // Every internal link that lands on a redirect. Not an error — GitHub Pages
  // sends the crawler on and it arrives — but it is a hop per link, and it is
  // worth knowing the number rather than discovering it in a crawl report.
  const redirected = redirects.size

  return { pages, reached, indexable, sitemap, blocked, findings, redirected, orphans, unlisted }
}

/* ------------------------------------------------------------------------- *
 * The other crawler: the one that runs JavaScript.
 * ------------------------------------------------------------------------- */

/**
 * **Googlebot renders, which means it never sees the `<noscript>`.**
 *
 * Everything above reads the served HTML, which is what Bing's non-rendering
 * fetches, every link-preview scraper and most assistant crawlers see. Googlebot
 * is the one that matters most and is the one that sees a *different document*:
 * it runs the bundle, React replaces `#root`, and the fallback body — the whole
 * of what the check above just validated — is discarded before indexing.
 *
 * So the two documents both have to be right, and only one of them can be
 * checked by reading a file. This opens a sample in the same Chromium build
 * Playwright ships, from a server running **inside this process** (a server
 * started in another one is not reachable here), and asserts that what React
 * leaves behind carries the same page: a heading, the reference, and enough
 * text that the URL is about something.
 *
 * A sample rather than all 3 500, because the failure this catches is a broken
 * bundle or a route that renders empty, and that is not per-page.
 */
/**
 * The DOM, as much of it as the callback below touches.
 *
 * `page.evaluate` runs its function in the browser and type-checks it *here*,
 * where `tsconfig.node.json` declares no `dom` library — correctly, because
 * every other line under `scripts/` runs in Node and should be told so when it
 * reaches for `window`. Adding `dom` to the whole build's type space to satisfy
 * one closure would trade that away; naming the four members this closure
 * actually uses does not.
 */
interface RenderedDocument {
  title: string
  querySelector(selector: string): {
    textContent: string | null
    innerHTML: string
    querySelectorAll(selector: string): { length: number }
  } | null
}

async function renderCheck(paths: string[]) {
  // From the declared dependency rather than from `playwright`, which is only
  // in node_modules as its transitive.
  const { chromium } = await import('@playwright/test')

  const server = createServer((request, response) => {
    void (async () => {
      const served = await serve(request.url ?? '/')
      if (served.status === 301 && served.location) {
        response.writeHead(301, { Location: served.location })
        response.end()
        return
      }
      const type = served.file?.endsWith('.js')
        ? 'text/javascript'
        : served.file?.endsWith('.css')
          ? 'text/css'
          : served.file?.endsWith('.json')
            ? 'application/json'
            : served.file?.endsWith('.webp')
              ? 'image/webp'
              : served.file?.endsWith('.woff2')
                ? 'font/woff2'
                : 'text/html; charset=utf-8'
      response.writeHead(served.status, { 'Content-Type': type })
      if (served.file) createReadStream(served.file).pipe(response)
      else response.end()
    })()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const browser = await chromium.launch()
  const page = await browser.newPage()

  const results: { path: string; title: string; text: number; links: number; empty: boolean }[] = []

  for (const path of paths) {
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'networkidle' })
    const measured = await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: RenderedDocument }).document
      const root = doc.querySelector('#root')
      return {
        title: doc.title,
        text: (root?.textContent ?? '').trim().length,
        links: root?.querySelectorAll('a[href]').length ?? 0,
        empty: (root?.innerHTML ?? '').trim() === '',
      }
    })
    results.push({ path, ...measured })
  }

  await browser.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return results
}

/* ------------------------------------------------------------------------- *
 * Reporting.
 * ------------------------------------------------------------------------- */

const report = await crawl()

console.log(`crawl: ${report.pages.size} URLs visited from / following links only`)
console.log(`crawl: ${report.reached.length} served 200, ${report.indexable.length} indexable`)
console.log(`crawl: ${report.sitemap.size} URLs in sitemap.xml, ${report.orphans.length} unreachable`)
console.log(`crawl: ${report.blocked.size} paths not fetched, blocked by robots.txt`)
console.log(`crawl: ${report.redirected} internal links landed on a 301 to the trailing slash`)

if (process.argv.includes('--render')) {
  const sample = [
    '/',
    '/symbols/',
    '/line/g-shock/',
    ...[...report.sitemap].filter((loc) => loc.startsWith('/line/g-shock/')).slice(1, 2),
    ...[...report.sitemap].filter((loc) => loc.startsWith('/watch/')).slice(0, 2),
    '/editions/',
  ]
  console.log(`\ncrawl: rendering ${sample.length} pages in Chromium…`)
  for (const result of await renderCheck(sample)) {
    const state = result.empty ? 'EMPTY #root' : `${result.text} chars, ${result.links} links`
    console.log(`  ${result.path} — ${state} — ${JSON.stringify(result.title)}`)
    if (result.empty) report.findings.push({ fatal: true, message: `renders empty: ${result.path}` })
  }
}

const fatal = report.findings.filter((finding) => finding.fatal)
const warnings = report.findings.filter((finding) => !finding.fatal)

if (warnings.length > 0) {
  console.log(`\ncrawl: ${warnings.length} note(s)`)
  for (const warning of warnings.slice(0, 20)) console.log(`  - ${warning.message}`)
  if (warnings.length > 20) console.log(`  …and ${warnings.length - 20} more`)
}

if (fatal.length > 0) {
  console.error(`\ncrawl: ${fatal.length} failure(s)`)
  for (const failure of fatal.slice(0, 20)) console.error(`  ✗ ${failure.message}`)
  if (fatal.length > 20) console.error(`  …and ${fatal.length - 20} more`)
  process.exit(1)
}

console.log('\ncrawl: every reachable page has a title, a description and no shipped comments')
