// Which series the archive has product pages for, and this catalogue does not.
//
//   node unseeded.ts [<line>...]
//
// The work list for the D52 route, ranked by how many references each series
// would bring in. Reads the cached CDX index and `catalog-src/`, and fetches an
// index only for a line nobody has looked at yet — it never fetches a page.
//
// This is `candidates.ts` asked the other way round. That one ranks series whose
// **module** is known, which is D44's route and the only one available where no
// product page was ever captured. This one ranks series whose **page** exists,
// which is D52's route and strictly better where it applies: one page states the
// fields, names the photograph, and is about the reference rather than a module.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEGMENTS, archivedFor, lineOfReference } from './archive.ts'
import { isReference } from './roster.ts'
import { seriesOf } from './sitemap.ts'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')

/** Every reference already in the catalogue, and every series file that exists. */
function catalogued() {
  const refs = new Set<string>()
  const series = new Set<string>()
  const root = join(REPO, 'catalog-src')
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
      series.add(`${entry.name}/${file.replace('.yaml', '')}`)
      const text = readFileSync(join(dir, file), 'utf8')
      for (const [, ref] of text.matchAll(/^ {4}ref: (\S+)\s*$/gm)) refs.add(ref.toUpperCase())
    }
  }
  return { refs, series }
}

const { refs, series: existing } = catalogued()
const lines = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(SEGMENTS)

for (const line of lines) {
  if (!existsSync(join(REPO, 'catalog-src', line))) {
    console.log(`\n${line}: no catalog-src directory — seed it with seed.ts first`)
    continue
  }
  const found = await archivedFor(line)

  const bySeries = new Map<string, { fresh: string[]; had: number }>()
  for (const ref of found.keys()) {
    // D47 — an archived page is not a reference just because Casio served it.
    if (!isReference(ref)) continue
    // The path is not the line: Casio serves Baby-G references under
    // /tw/watches/edifice/. Ask what the rest of the index says.
    const belongs = lineOfReference(ref)
    if (belongs !== null && belongs !== line) continue
    const id = seriesOf(ref)
    if (!bySeries.has(id)) bySeries.set(id, { fresh: [], had: 0 })
    const bucket = bySeries.get(id)!
    if (refs.has(ref.toUpperCase())) bucket.had += 1
    else bucket.fresh.push(ref)
  }

  const work = [...bySeries]
    .filter(([, b]) => b.fresh.length > 0)
    .sort((a, b) => b[1].fresh.length - a[1].fresh.length)

  const total = work.reduce((n, [, b]) => n + b.fresh.length, 0)
  console.log(`\n${line}: ${total} references in ${work.length} series have a page and are not catalogued`)
  for (const [id, bucket] of work.slice(0, 20)) {
    const state = existing.has(`${line}/${id}`) ? `adds to ${bucket.had}` : 'NEW series'
    console.log(`  ${line}:${id}`.padEnd(28) + `${String(bucket.fresh.length).padStart(4)}  ${state}`)
  }
  if (work.length > 20) console.log(`  … and ${work.length - 20} more series`)
}

console.log(`\nFeed the ones worth doing to: node pipeline.ts series <line>:<series>...`)
