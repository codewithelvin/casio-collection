// Write `official_url` (FR-3.5) on every model Casio still lists.
//
//   node official-urls.ts --plan
//   node official-urls.ts --write
//
// THE LINK COMES FROM CASIO'S OWN SITEMAP, NEVER FROM A GUESS. D48: the product
// pages answer 403 to anything that is not a person, but `casio.com/<loc>/
// sitemap.xml` answers 200 and carries the full URL of every reference Casio
// sells. So the URL is Casio stating where the page is — the same provenance
// D59 already trusts for `discontinued`, read from the same file.
//
// WHY THIS WAS NOT WRITTEN BEFORE: nobody could confirm the link actually opens.
// casio.com answers 403 to every request from this machine, full browser headers
// included, so the honest position was that we had a URL nobody had seen resolve.
// The client opened one in their own browser on 2026-09-07 and it answered 200.
// That is the check this file was waiting on, and it is why it exists now rather
// than a fortnight ago.
//
// A reference NOT in the sitemap gets nothing. That is D59's `discontinued: true`
// population — Casio no longer lists it, so there is no official page to link to,
// and inventing one would send a reader to a 404 wearing Casio's name.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './sitemap.ts'

const HERE = join(fileURLToPath(import.meta.url), '..')
const REPO = join(HERE, '..', '..', '..', '..')
// The same directory `sitemap.ts` writes to. Not a local `.cache/` — these are
// shared with `availability.ts`, and two copies of Casio's roster that can
// disagree is precisely the failure D59 exists to avoid.
const CACHE = join(tmpdir(), 'casio-catalog-cache')

const mode = process.argv[2] ?? '--plan'
if (!['--plan', '--write'].includes(mode)) {
  console.error('usage: official-urls.ts --plan|--write')
  process.exit(2)
}

/**
 * reference -> URL, first locale wins.
 *
 * `LOCALES` is ordered `us, intl, de, jp`, so an English page is preferred and a
 * German one is only used for a reference the English roster does not carry.
 * A reader in Berlin gets casio.com's own locale redirect; what matters here is
 * that the link resolves and says the same thing every time it is written.
 */
const urls = new Map<string, string>()
let files = 0
for (const loc of LOCALES) {
  const f = join(CACHE, `sm-${loc}.xml`)
  if (!existsSync(f)) continue
  files++
  for (const [, url] of readFileSync(f, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const m = /\/watches\/[a-z/-]+\/product\.([^/]+)\/?$/.exec(url)
    if (!m) continue
    const ref = m[1]!
    if (!urls.has(ref)) urls.set(ref, url.replace(/\/?$/, '/'))
  }
}
if (files === 0) {
  console.error('no cached sitemaps — run `node sitemap.ts` first')
  process.exit(1)
}
console.error(`${urls.size} references in Casio's sitemap, from ${files} locales`)

/* -------------------------------------------------------------------------- *
 * Apply, line by line — `catalog-src` is not prettier-formatted and a
 * parse-and-serialise round trip would rewrite every entry in the file.
 * -------------------------------------------------------------------------- */

let matched = 0
let already = 0
let written = 0
const perLine = new Map<string, number>()

for (const line of readdirSync(join(REPO, 'catalog-src'))) {
  const dir = join(REPO, 'catalog-src', line)
  let stat
  try {
    stat = readdirSync(dir)
  } catch {
    continue // not a directory (lines.yaml and friends)
  }
  for (const file of stat.filter((f) => f.endsWith('.yaml'))) {
    const path = join(dir, file)
    const lines = readFileSync(path, 'utf8').split('\n')
    const inserts: Array<{ at: number; text: string }> = []

    for (let i = 0; i < lines.length; i++) {
      // `[^\n]*` and not `.*` before the end: this tree is CRLF against
      // prettier's `endOfLine: lf`, so every split line ends with '\r', and
      // '.' does not match '\r'. A `.*$` here silently matches nothing.
      const ref = /^ {4}ref:[ \t]*(\S+)[^\n]*$/.exec(lines[i] ?? '')
      if (!ref) continue
      const url = urls.get(ref[1]!)
      if (!url) continue
      matched++

      // The entry runs to the next `- id:`; if it already states the field,
      // leave it — a hand-written URL outranks a derived one.
      let end = lines.length
      for (let j = i + 1; j < lines.length; j++) {
        if (/^ {2}- id:/.test(lines[j] ?? '')) {
          end = j
          break
        }
      }
      if (lines.slice(i, end).some((l) => /^ {4}official_url:/.test(l))) {
        already++
        continue
      }
      inserts.push({ at: i + 1, text: `    official_url: '${url}'` })
      perLine.set(line, (perLine.get(line) ?? 0) + 1)
      written++
    }

    if (mode === '--write' && inserts.length > 0) {
      for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) lines.splice(at, 0, text)
      writeFileSync(path, lines.join('\n'))
    }
  }
}

console.log(`\n${matched} catalogue entries are in Casio's sitemap`)
console.log(`  ${already} already state official_url`)
console.log(`  ${written} would gain one`)
for (const [line, n] of [...perLine].sort((a, b) => b[1] - a[1])) console.log(`    ${line.padEnd(10)} ${n}`)
if (mode === '--write') console.log(`\nwritten.`)
else console.log(`\n(plan only — pass --write)`)
