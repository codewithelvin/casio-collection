/**
 * Tell Bing and Yandex what changed, instead of waiting to be crawled.
 *
 * **Why this exists on this site in particular.** Pages gives no server-side
 * anything — no rewrites, no headers, no log of who crawled what — so the usual
 * levers for "the crawlers are not coming" are all unavailable. IndexNow is the
 * one that is not: a key served as a static file, and an HTTP POST naming the
 * URLs that moved. Bing and Yandex both consume it from the same endpoint, and
 * Yandex is the crawler that prompted this.
 *
 * **It submits what changed, never the whole site.** The sitemap's `<lastmod>`
 * is the commit date of the catalogue file behind each page (`lib/lastmod.ts`),
 * so "changed in this deploy" is exactly "lastmod is today" — a deploy that
 * touched three watches submits three URLs. Submitting all 3 800 on every push
 * would be the same as submitting nothing: IndexNow's own guidance is that a
 * feed of unchanged URLs is what gets a host ignored, and it would also be a
 * lie about what changed.
 *
 * **The home page is included whenever anything else is**, because the front
 * door lists the lines and their counts and a new reference changes it — that
 * is a real change to that document, not a courtesy ping.
 *
 * Failure is reported and does not fail the deploy. The site is already live by
 * the time this runs; a search engine declining a hint is not a reason to mark a
 * good deploy red.
 *
 *   node scripts/indexnow.ts              submit today's URLs
 *   node scripts/indexnow.ts --dry        print what would be submitted
 *   node scripts/indexnow.ts --all        every URL in the sitemap (first run only)
 */
import { pathToFileURL } from 'node:url'

const HOST = 'casiovault.com'
const ORIGIN = `https://${HOST}`

/**
 * The key is a static file at the site root, which is how the endpoint verifies
 * that whoever is submitting controls the host. It is **not a secret** — it is
 * published at `keyLocation` by design, and putting it in a GitHub secret would
 * only hide from the next maintainer that it is world-readable. Rotating it is
 * writing a new file and changing this line.
 */
const KEY = '4e01ab3901f0677661a3767c174da27f'
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`

/** One endpoint. Bing and Yandex share the IndexNow network and forward between them. */
const ENDPOINT = 'https://api.indexnow.org/indexnow'

/** The documented ceiling per request. */
const MAX_PER_REQUEST = 10_000

const dry = process.argv.includes('--dry')
const all = process.argv.includes('--all')

/**
 * Read the sitemap off the **live site**, not out of `dist/`.
 *
 * This runs in the deploy job, after `deploy-pages` and the smoke test, so the
 * live sitemap is the one that was just published — and reading it back is a
 * second, free proof that the deploy actually landed. Reading `dist/` would also
 * work and would tell us nothing about whether anybody can see it.
 */
async function liveSitemap(): Promise<string> {
  const response = await fetch(`${ORIGIN}/sitemap.xml`, {
    headers: { 'User-Agent': 'casiovault-indexnow' },
  })
  if (!response.ok) throw new Error(`sitemap: HTTP ${response.status}`)
  return response.text()
}

interface Entry {
  loc: string
  lastmod: string | null
}

export function parseSitemap(xml: string): Entry[] {
  const entries: Entry[] = []
  for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block[1] ?? '')?.[1]
    if (!loc) continue
    // `<lastmod>` is optional and omitted rather than guessed (lastmod.ts), so a
    // URL without one is simply not "changed today" — it is undated.
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(block[1] ?? '')?.[1] ?? null
    entries.push({ loc, lastmod })
  }
  return entries
}

/**
 * Whether a `<lastmod>` falls on `day`.
 *
 * The comparison is on the date part alone and both sides are taken in the same
 * zone. `lastmod.ts` writes an offset-bearing local timestamp
 * (`2026-09-05T09:51:44+04:00`), so comparing its first ten characters against a
 * UTC date is wrong for four hours a day in one direction — which would show up
 * as a deploy that submitted nothing, silently, and only sometimes.
 */
export function changedOn(lastmod: string | null, day: string): boolean {
  if (!lastmod) return false
  const parsed = new Date(lastmod)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === day
}

export function selectUrls(entries: Entry[], day: string, everything: boolean): string[] {
  if (everything) return entries.map((entry) => entry.loc)

  const changed = entries.filter((entry) => changedOn(entry.lastmod, day)).map((entry) => entry.loc)
  if (changed.length === 0) return []

  // The front door lists every line and its count, so anything that changes a
  // count changes it too. Added rather than assumed to be in the list, because
  // its own lastmod moves only when the home page's own sources do.
  const home = `${ORIGIN}/`
  return changed.includes(home) ? changed : [home, ...changed]
}

async function submit(urlList: string[]): Promise<void> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  })
  // 200 and 202 are both success; 202 means "accepted, key not yet verified",
  // which is the normal answer on a first submission and not a problem to solve.
  const body = await response.text().catch(() => '')
  console.log(`indexnow: HTTP ${response.status} for ${urlList.length} URLs ${body.trim()}`)
  if (response.status >= 400) {
    console.log('indexnow: refused. The deploy is fine; the hint was not accepted.')
  }
}

async function run(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const entries = parseSitemap(await liveSitemap())
  const urls = selectUrls(entries, day, all)

  console.log(`indexnow: ${entries.length} URLs in the sitemap, ${urls.length} to submit for ${day}`)

  if (urls.length === 0) {
    console.log('indexnow: nothing changed today — submitting nothing, which is the point.')
    return
  }
  if (dry) {
    for (const url of urls.slice(0, 50)) console.log(`  ${url}`)
    if (urls.length > 50) console.log(`  … and ${urls.length - 50} more`)
    return
  }
  for (let i = 0; i < urls.length; i += MAX_PER_REQUEST) {
    await submit(urls.slice(i, i + MAX_PER_REQUEST))
  }
}

// Guarded so the pure functions above can be imported by a test without the
// module reaching for the network as a side effect of being loaded.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // Never fail the deploy over a hint. The site is already live by the time this
  // runs, and a red job here would say something untrue about the deploy.
  await run().catch((error: unknown) => {
    console.log(`indexnow: ${error instanceof Error ? error.message : String(error)}`)
  })
}
