// Casio's dated news releases — the only source this project has found that
// states when a reference appeared (D54).
//
//   node news.ts --list            the dated releases, and which name a model
//   node news.ts --dry             which catalogue models would get a year
//   node news.ts --write           write `year` and `year_source` into the YAML
//
// `casio.com/intl/news/` answers **200 live** — the news path was never behind
// the 403 that closed the product pages, and robots.txt allows it. The date is
// in the URL: `/intl/news/2026/0527-mrg-bf1000eb/`.
//
// WHAT IT WILL NOT DO. It never adds a reference. D54 puts the year on entries
// whose specifications already came from a product page; a release carries no
// specification table, and seeding from one alone is what D50 refused. It also
// never writes a year onto a model that already has one — Vintage's years come
// from a source that states them, and this is not entitled to overrule it.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allowed } from './robots.ts'
import { isReference } from './roster.ts'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'news')
mkdirSync(CACHE, { recursive: true })
const REPO = join(import.meta.dirname, '..', '..', '..', '..')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Casio's own site, not a charity serving somebody else's. Still unhurried. */
const PACE_MS = 2_000
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const YEARS = ['2024', '2025', '2026']

async function fetchCached(key: string, url: string): Promise<string | null> {
  const file = join(CACHE, key)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  if (!(await allowed(url))) {
    console.error(`  robots.txt disallows ${url}`)
    return null
  }
  const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null)
  if (!res || res.status !== 200) return null
  const body = await res.text()
  writeFileSync(file, body)
  await wait(PACE_MS)
  return body
}

/** `/intl/news/2026/0527-mrg-bf1000eb/` → year, date and the slug's model part. */
interface Release {
  url: string
  year: number
  date: string
  slug: string
  /** The slug with its `MMDD-` stripped and its hyphens removed: `MRGBF1000EB`. */
  family: string | null
}

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

function releaseOf(path: string): Release | null {
  const m = /\/intl\/news\/(\d{4})\/(\d{4})-([^/"]+)\/?$/.exec(path)
  if (!m) return null
  const [, year, mmdd, slug] = m
  // A slug that names a model carries digits: `mrg-bf1000eb`, `dw6900tr`,
  // `gst-b1000d`. One that does not — `ifdesign`, `toyota`, `education` — is
  // corporate news and names no reference this catalogue could date.
  const family = /\d/.test(slug) ? key(slug) : null
  return {
    url: `https://www.casio.com/intl/news/${year}/${mmdd}-${slug}/`,
    year: Number(year),
    date: `${year}-${mmdd.slice(0, 2)}-${mmdd.slice(2)}`,
    slug,
    family,
  }
}

/* ------------------------------------------------------------------------- *
 * The releases
 * ------------------------------------------------------------------------- */

const index = await fetchCached('index.html', 'https://www.casio.com/intl/news/')
if (!index) {
  console.error('casio.com/intl/news/ did not answer')
  process.exit(1)
}

const releases = [
  ...new Set([...index.matchAll(/href="(\/intl\/news\/\d{4}\/\d{4}-[^"]+)"/g)].map((m) => m[1])),
]
  .map(releaseOf)
  .filter((r): r is Release => r !== null && YEARS.includes(String(r.year)))
  .sort((a, b) => a.date.localeCompare(b.date))

const named = releases.filter((r) => r.family)
console.log(
  `${releases.length} releases in ${YEARS.join(', ')}; ${named.length} name a model in the slug`,
)

const mode = process.argv[2]
if (mode === '--list') {
  for (const r of releases) console.log(`  ${r.date}  ${r.family ?? '(not a model)'.padEnd(18)}  ${r.slug}`)
  process.exit(0)
}

/* ------------------------------------------------------------------------- *
 * Which references each release is about
 *
 * **The slug is the guard, and it is the whole reason this is safe.** A release
 * about the GMW-B5000 mentions the original 1983 square in its second
 * paragraph, and a reader that took every reference-shaped token off the page
 * would date a forty-year-old watch to 2025. So a token counts only if it
 * belongs to the model the release is *about*, which the URL states.
 * ------------------------------------------------------------------------- */

const dated = new Map<string, { year: number; url: string; date: string }>()
const readFailures: string[] = []

for (const release of named) {
  const html = await fetchCached(`${release.year}-${release.slug}.html`, release.url)
  if (!html) {
    readFailures.push(release.slug)
    continue
  }
  const refs = new Set(
    [...html.matchAll(/\b[A-Z]{1,5}-?[A-Z]{0,2}\d{2,5}[A-Z]{0,4}-\d{1,2}[A-Z]?\d?\b/g)]
      .map((m) => m[0])
      .filter(isReference)
      .filter((ref) => key(ref).startsWith(release.family!)),
  )
  for (const ref of refs) {
    // Earliest announcement wins: a model re-mentioned in a later release was
    // still announced when it was announced.
    const seen = dated.get(key(ref))
    if (!seen || release.date < seen.date) {
      dated.set(key(ref), { year: release.year, url: release.url, date: release.date })
    }
  }
  console.error(`  ${release.date}  ${release.slug.padEnd(22)} ${refs.size} references`)
}

if (readFailures.length > 0) {
  console.log(`${readFailures.length} releases did not answer: ${readFailures.join(', ')}`)
}
console.log(`${dated.size} references are dated by a release`)

/* ------------------------------------------------------------------------- *
 * The join
 * ------------------------------------------------------------------------- */

interface Hit {
  path: string
  id: string
  ref: string
  year: number
  url: string
  /** Index of the line after this entry's last, where the fields are inserted. */
  end: number
}

const hits: Hit[] = []
const notInCatalogue = new Set(dated.keys())

// `catalog-src/` holds files as well as line directories — `lines.yaml` and
// `.published-ids.json` — so the entries are filtered by what they are rather
// than by what they are named.
for (const entry of readdirSync(join(REPO, 'catalog-src'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(REPO, 'catalog-src', entry.name)
  if (!readdirSync(dir).some((n) => n.endsWith('.yaml'))) continue
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const path = join(dir, name)
    const lines = readFileSync(path, 'utf8').split('\n')

    const starts: number[] = []
    for (let i = 0; i < lines.length; i++) if (/^ {2}- id: \S+\s*$/.test(lines[i])) starts.push(i)

    starts.forEach((start, index) => {
      let end = starts[index + 1] ?? lines.length
      while (end > start + 1 && lines[end - 1].trim() === '') end -= 1
      const block = lines.slice(start, end)
      const id = /^ {2}- id: (\S+)/.exec(block[0])![1]
      const ref = block.map((l) => /^ {4}ref: (\S+)/.exec(l)?.[1]).find(Boolean)
      if (!ref) return
      notInCatalogue.delete(key(ref))
      // Never overrule a year that is already there (D54, and D25 behind it).
      if (block.some((l) => /^ {4}year:/.test(l))) return
      const found = dated.get(key(ref))
      if (found) hits.push({ path, id, ref, year: found.year, url: found.url, end })
    })
  }
}

console.log(`\n${hits.length} catalogue models would gain a year:`)
for (const hit of hits) console.log(`  ${hit.ref.padEnd(18)} ${hit.year}  ${hit.url}`)
if (notInCatalogue.size > 0) {
  console.log(
    `\n${notInCatalogue.size} dated references are not in the catalogue, and this does not add them ` +
      `(a release states no specifications — D50).`,
  )
}

if (mode !== '--write') {
  console.log(`\nNothing written. Run with --write.`)
  process.exit(0)
}

const byFile = new Map<string, Hit[]>()
for (const hit of hits) byFile.set(hit.path, [...(byFile.get(hit.path) ?? []), hit])

for (const [path, entries] of byFile) {
  const lines = readFileSync(path, 'utf8').split('\n')
  // Back to front, so an insertion never moves an index still to be used.
  for (const hit of [...entries].sort((a, b) => b.end - a.end)) {
    lines.splice(hit.end, 0, `    year: ${hit.year}`, `    year_source: '${hit.url}'`)
  }
  writeFileSync(path, lines.join('\n'))
  console.log(`  ${path.split(/[\\/]/).pop()}  +${entries.length}`)
}

console.log(`\n${hits.length} years written. Next: npm run catalog:build && npm run catalog:validate`)
