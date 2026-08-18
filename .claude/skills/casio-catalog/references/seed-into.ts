// Add references to a series file that already exists.
//
//   node seed-into.ts <line> <series> --crawl    fetch the missing pages
//   node seed-into.ts <line> <series> --dry      what would be added, from the cache
//   node seed-into.ts <line> <series> --write    add them
//
// WHY NOT `seed.ts`. That regenerates a whole series file from the archive, which
// is right for a line nobody has seeded and destructive for one somebody has.
// `catalog-src/vintage/a168.yaml` holds one hand-checked entry from The Digital
// Watch Library — a community source, with a year the product pages do not state
// — and Casio lists 27 A168 references. Regenerating would take the year away.
//
// So this **adds entries and never touches an existing one**. A reference already
// in the file is skipped whatever the archive says about it, because the entry
// there was reviewed and this was not.
//
// D50 still bites: a page stating fewer than four rows is reported and not
// seeded. D25 still bites: no `year` is written, because the product page states
// none — the existing entry's 1991 came from a source that did.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENOUGH_ROWS, archivedFor, imageUrl, isEnglish, page, specRows } from './archive.ts'
import { modelYaml, toModel, type Seeded } from './seed.ts'
import { seriesOf } from './sitemap.ts'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
const REPO = join(import.meta.dirname, '..', '..', '..', '..')

const [line, series, mode] = process.argv.slice(2)
if (!line || !series || !['--crawl', '--dry', '--write'].includes(mode ?? '')) {
  console.error('usage: seed-into.ts <line> <series> [--crawl | --dry | --write]')
  process.exit(1)
}

const path = join(REPO, 'catalog-src', line, `${series}.yaml`)
if (!existsSync(path)) {
  console.error(`No ${path} — this adds to a series that exists. Use seed.ts for a new one.`)
  process.exit(1)
}

const original = readFileSync(path, 'utf8')
const present = new Set(
  [...original.matchAll(/^ {4}ref: (\S+)\s*$/gm)].map((m) => m[1].toUpperCase()),
)
console.log(`${series}: ${present.size} references already in the file`)

/* ------------------------------------------------------------------------- *
 * Which references belong here
 * ------------------------------------------------------------------------- */

const found = await archivedFor(line)
const mine = [...found].filter(([ref]) => seriesOf(ref) === series)
const missing = mine.filter(([ref]) => !present.has(ref.toUpperCase()))
console.log(
  `${mine.length} archived pages are in this series; ${missing.length} are not in the file yet`,
)

/* ------------------------------------------------------------------------- *
 * Read them
 *
 * `--crawl` fetches what the cache is missing, at the archive's pace. `--dry` and
 * `--write` read the cache and never fetch, so they can be re-run freely against
 * a cache that is still filling.
 * ------------------------------------------------------------------------- */

const readings: { ref: string; url: string; rows: Map<string, string>; image: string | null }[] = []
const thin: string[] = []
const unreachable: string[] = []
let dry = 0

for (const [ref, candidates] of missing) {
  // Rank the captures the way seed.ts does: English first, then by how much the
  // page states. A foreign capture clears D50's row gate and yields no fields,
  // because every field reader matches an English label.
  const scored = [...candidates].sort(
    (a, b) => Number(isEnglish(b.url)) - Number(isEnglish(a.url)),
  )

  let best: { url: string; rows: Map<string, string>; image: string | null } | null = null
  let fetched = 0
  for (const snapshot of scored) {
    const cached = join(CACHE, `page-${snapshot.ref}-${snapshot.timestamp}.html`)
    const html =
      mode === '--crawl' ? await page(snapshot) : existsSync(cached) ? readFileSync(cached, 'utf8') : null
    if (!html) continue
    fetched += 1
    const rows = specRows(html)
    if (!best || rows.size > best.rows.size) {
      best = { url: snapshot.url, rows, image: imageUrl(html, snapshot.ref, new Set(found.keys())) }
    }
    if (rows.size >= ENOUGH_ROWS && isEnglish(snapshot.url)) break
  }

  if (!best || fetched === 0) {
    unreachable.push(ref)
    console.error(`  ${ref}: ${mode === '--crawl' ? 'the archive served no capture' : 'not cached'}`)
    // Five in a row while crawling is the cooldown, not five absent pages.
    if (mode === '--crawl' && (dry += 1) >= 5) {
      console.error(`\nSTOPPING: ${dry} in a row could not be fetched — that is the cooldown.`)
      break
    }
    continue
  }
  dry = 0
  if (best.rows.size < ENOUGH_ROWS) {
    thin.push(`${ref} (${best.rows.size})`)
    continue
  }
  readings.push({ ref, ...best })
  console.error(`  ${ref}: ${best.rows.size} rows${best.image ? ' + image' : ''}`)
}

if (thin.length > 0) console.log(`\n${thin.length} state too little to seed from (D50): ${thin.join(', ')}`)
if (unreachable.length > 0) console.log(`${unreachable.length} could not be read: ${unreachable.join(', ')}`)

const models: Seeded[] = readings
  .map((r) => toModel(r.ref, r.url, r.rows, r.image))
  // A page whose every field is unreadable would claim `official` and say
  // nothing — worse than absence, and the same rule seed.ts applies (D46).
  .filter((model) => Object.values(model.fields).some((value) => value !== undefined))
  .sort((a, b) => a.ref.localeCompare(b.ref))

console.log(`\n${models.length} entries ready to add`)
if (mode !== '--write') {
  for (const model of models) console.log(`  ${model.ref.padEnd(16)} ${Object.entries(model.fields).filter(([, v]) => v !== undefined).map(([k]) => k).join(' ')}`)
  process.exit(0)
}

/* ------------------------------------------------------------------------- *
 * Write
 *
 * Appended to the end of `models:`, and the file is otherwise byte-identical —
 * `catalog-src/` is not prettier-formatted and a parse-and-serialise round trip
 * would rewrite the entry that is already there.
 * ------------------------------------------------------------------------- */

if (models.length === 0) {
  console.log('nothing to add')
  process.exit(0)
}

const lines = original.split('\n')
while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()

const note = [
  ``,
  `# ADDED ${new Date().toISOString().slice(0, 10)}: ${models.length} more references, from Casio's own`,
  `# product pages via the archive (D52). The entry above this block predates them`,
  `# and is left exactly as it was — a different source, and a \`year\` these pages`,
  `# do not state.`,
  `#`,
  `# No \`year\` on any of the entries below: the product page dates nothing (D25).`,
]

writeFileSync(path, [...lines, ...note, models.map(modelYaml).join('\n')].join('\n') + '\n')
console.log(`added ${models.length} entries to ${path}`)

const images = models.filter((m) => m.image).map((m) => `${m.id}\t${m.image}`)
if (images.length > 0) {
  const list = join(CACHE, `${line}-${series}-images.tsv`)
  writeFileSync(list, images.join('\n') + '\n')
  console.log(`${images.length} image URLs → ${list}`)
  console.log(`\nNext: node photos.ts ${line} ${line}-${series}`)
}
