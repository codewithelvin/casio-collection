// Ask robots.txt before fetching anything, on every host this skill touches.
//
//   node robots.ts <url>...     report allowed/denied for each, and why
//
// WHY THIS EXISTS AS CODE RATHER THAN AS A HABIT. Every crawler here sends a
// browser user agent, because casio.com 403s anything else — which means the
// site cannot tell us apart from a person and cannot throttle us as a bot. When
// the other side has no way to say no, honouring the one place it *can* say no
// stops being politeness and becomes the whole of the contract.
//
// WHAT IT FOUND, checked 2026-08-19 and worth writing down because it is the
// opposite of what a cautious reader assumes:
//
//   * `web.archive.org/robots.txt` is a **404**. No file means no restriction
//     (RFC 9309 §2.3.1.3), so the archive crawl was never against anything. The
//     archive's own restraint is a rate limit, not a robots rule, and that is
//     already honoured at one request per five seconds.
//   * `casio.com/robots.txt` disallows `/casioIdAuth/login/`,
//     `/customer/account/` and `/checkout/` for `*`, and allows everything else.
//     Product pages, `/content/dam/` and `/news/` are open. So the 403 wall the
//     product pages answer with is a bot *filter*, not a stated prohibition —
//     robots.txt is where the site states them, and it does not state this one.
//
// The check is enforced rather than assumed because that distinction is easy to
// lose: the next person reads "casio.com 403s us" and concludes the site said
// no. It did not, and this file is where anyone can see what it did say.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'robots')
mkdirSync(CACHE, { recursive: true })

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * The token our group is matched on.
 *
 * We send a Chrome user agent, so the group that applies to us is the one a
 * browser-shaped client falls into: `*`. Claiming a bot name we do not have
 * would be worse, not better — it would let us pick a more permissive group than
 * the one the site meant for us.
 */
const TOKEN = '*'

interface Rule {
  allow: boolean
  path: string
}

interface Robots {
  rules: Rule[]
  crawlDelayMs: number | null
  /** Sitemaps the file declares — Casio's names 32, which is a roster in itself. */
  sitemaps: string[]
  /** No file, or a 4xx: nothing is restricted. */
  unrestricted: boolean
}

/**
 * Parse the groups that apply to `TOKEN`.
 *
 * A file can carry the same user agent twice — casio.com has two `User-agent: *`
 * groups, one listing checkout paths and one saying `Allow: /` — so the rules of
 * every matching group are collected rather than the first one winning.
 */
export function parse(text: string): Omit<Robots, 'unrestricted'> {
  const rules: Rule[] = []
  const sitemaps: string[] = []
  let crawlDelayMs: number | null = null
  let applies = false
  let inGroup = false

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const [rawField, ...rest] = line.split(':')
    const field = rawField.trim().toLowerCase()
    const value = rest.join(':').trim()

    // `Sitemap` is not part of any group and is read wherever it appears.
    if (field === 'sitemap') {
      if (value) sitemaps.push(value)
      continue
    }

    if (field === 'user-agent') {
      // A blank line ends a group; a user-agent line after a rule starts a new
      // one. Consecutive user-agent lines share the rules that follow them.
      if (inGroup) {
        applies = false
        inGroup = false
      }
      if (value === TOKEN || value.toLowerCase() === TOKEN) applies = true
      continue
    }

    if (!applies) continue
    inGroup = true
    if (field === 'allow' || field === 'disallow') {
      // `Disallow:` with an empty value allows everything — it is the explicit
      // way of saying "no restriction", and must not be read as "deny /".
      if (field === 'disallow' && value === '') continue
      if (value) rules.push({ allow: field === 'allow', path: value })
    }
    if (field === 'crawl-delay') {
      const seconds = Number(value)
      if (Number.isFinite(seconds)) crawlDelayMs = Math.max(crawlDelayMs ?? 0, seconds * 1000)
    }
  }
  return { rules, crawlDelayMs, sitemaps }
}

/**
 * A robots path pattern to a regex: a star is any run of characters, a trailing
 * `$` anchors the end, and everything else is matched literally.
 *
 * Written out in words rather than shown, because the obvious example contains a
 * star followed by a slash and that ends this comment. The first version hid the
 * problem with a zero-width space, which parsed, read identically, and failed
 * the lint gate in CI two pushes running.
 */
function toRegExp(path: string): RegExp {
  const anchored = path.endsWith('$')
  const body = anchored ? path.slice(0, -1) : path
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + escaped + (anchored ? '$' : ''))
}

const memory = new Map<string, Robots>()

async function fetchRobots(origin: string): Promise<Robots> {
  const cached = memory.get(origin)
  if (cached) return cached

  const file = join(CACHE, origin.replace(/[^a-z0-9]+/gi, '-') + '.txt')
  let text: string | null = existsSync(file) ? readFileSync(file, 'utf8') : null

  if (text === null) {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } }).catch(
      () => null,
    )
    if (res && res.status === 200) {
      text = await res.text()
      writeFileSync(file, text)
    } else if (res && res.status >= 400 && res.status < 500) {
      // No file is not an error and does not mean "deny". RFC 9309 is explicit.
      text = ''
      writeFileSync(file, '')
    } else {
      // A 5xx or an unreachable host says nothing about permission, so nothing
      // is fetched until it does. Failing open here would be helping ourselves
      // to a "yes" the server never gave.
      const denied: Robots = { rules: [{ allow: false, path: '/' }], crawlDelayMs: null, sitemaps: [], unrestricted: false }
      memory.set(origin, denied)
      return denied
    }
  }

  const parsed = parse(text)
  const robots: Robots = { ...parsed, unrestricted: text.trim() === '' }
  memory.set(origin, robots)
  return robots
}

/**
 * May we fetch this URL?
 *
 * Longest match wins, and `Allow` beats `Disallow` at equal length — the rule
 * every major crawler follows and the one RFC 9309 §2.2.2 writes down.
 */
export async function allowed(url: string): Promise<boolean> {
  const parsed = new URL(url)
  const robots = await fetchRobots(parsed.origin)
  if (robots.unrestricted) return true

  const target = parsed.pathname + parsed.search
  let best: { rule: Rule; length: number } | null = null
  for (const rule of robots.rules) {
    if (!toRegExp(rule.path).test(target)) continue
    const length = rule.path.length
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { rule, length }
    }
  }
  return best ? best.rule.allow : true
}

/** What the host asked us to wait between requests, if it asked. */
export async function crawlDelayMs(origin: string): Promise<number | null> {
  return (await fetchRobots(origin)).crawlDelayMs
}

/** Every sitemap the host declares. Casio's robots.txt names 32 of them. */
export async function declaredSitemaps(origin: string): Promise<string[]> {
  return (await fetchRobots(origin)).sitemaps
}

/* ------------------------------------------------------------------------- *
 * CLI
 * ------------------------------------------------------------------------- */

const isMain = process.argv[1]?.endsWith('robots.ts') ?? false
if (isMain) {
  const urls = process.argv.slice(2)
  if (urls.length === 0) {
    console.error('usage: robots.ts <url>...')
    process.exit(1)
  }
  for (const url of urls) {
    const ok = await allowed(url)
    const delay = await crawlDelayMs(new URL(url).origin)
    console.log(`${ok ? 'ALLOWED' : 'DENIED '}  ${url}${delay ? `   (crawl-delay ${delay / 1000}s)` : ''}`)
  }
}
