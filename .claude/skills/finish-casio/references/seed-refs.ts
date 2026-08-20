// Seed references BY NAME, for the ones a crawl can never find.
//
//   node seed-refs.ts <line> <series> --crawl <REF>...   fetch their pages
//   node seed-refs.ts <line> <series> --dry   <REF>...   what would be written
//   node seed-refs.ts <line> <series> --write <REF>...   write them
//
// `seed-into.ts` is the right tool for everything a crawl discovers. This is for
// what it structurally cannot: `roster.ts`'s `CANONICAL_REF` refuses a variant
// block that is not digit-first, so `A159W-N1` and `A159WA-N1` — the two most
// recognisable A159s, both in Casio's own current sitemap — are invisible to it.
// `CANONICAL_REF`'s own comment already names `A159WA-N1` as a real reference it
// knowingly refuses, and O13 is the open question about widening it.
//
// THE ONE GATE THIS DROPS, AND THE ONE IT ADDS. It drops `isReference`, which is
// a DISCOVERY filter: it decides what a crawl may turn into a permanent id
// unsupervised, and it is deliberately tight because a rule loose enough to admit
// every real reference would admit the gift bag Casio's sitemap also lists.
//
// In its place: **every reference must be listed in Casio's own current sitemap.**
// That is Casio stating the reference exists (D48), which is a stronger claim
// about identity than any shape rule, and it cannot be satisfied by a typo. A
// reference not in the sitemap is refused here — go and find a source for it,
// or leave it out. There is no `--force`, on purpose: under D2 an id is permanent
// and this is the one file that could quietly make a bad one.
//
// Everything else is `seed-into.ts`'s: fields come from the one archived Casio
// product page named in `source` (D52), read by the same reader; a page stating
// fewer than four rows is reported and not seeded (D50); a page whose fields are
// all unreadable is reported and not seeded (D46); no `year`, because a product
// page dates nothing (D25); and no `discontinued`, because that is measured for
// the whole catalogue at once by `availability.ts` (D59).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ENOUGH_ROWS,
  archivedFor,
  imageUrl,
  isEnglish,
  lineOfReference,
  page,
  specRows,
} from '../../casio-catalog/references/archive.ts'
import { modelYaml, toModel, type Seeded } from '../../casio-catalog/references/seed.ts'
import { refresh, roster, seriesOf } from '../../casio-catalog/references/sitemap.ts'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
const REPO = join(import.meta.dirname, '..', '..', '..', '..')

const [line, series, mode, ...named] = process.argv.slice(2)
if (!line || !series || !['--crawl', '--dry', '--write'].includes(mode ?? '') || named.length === 0) {
  console.error('usage: seed-refs.ts <line> <series> [--crawl | --dry | --write] <REF>...')
  process.exit(1)
}

const path = join(REPO, 'catalog-src', line, `${series}.yaml`)
const existed = existsSync(path)
const original = existed ? readFileSync(path, 'utf8') : null
if (!existed) {
  console.error(
    `catalog-src/${line}/${series}.yaml does not exist. Create it with seed-into.ts, which\n` +
      `writes the file only once it has entries — this script appends and does not own a header.`,
  )
  process.exit(1)
}
const present = new Set([...original!.matchAll(/^ {4}ref: (\S+)\s*$/gm)].map((m) => m[1].toUpperCase()))

/* ------------------------------------------------------------------------- *
 * The gate: Casio's own sitemap
 * ------------------------------------------------------------------------- */

await refresh()
const live = new Set<string>()
for (const [, refs] of roster()) for (const r of refs) live.add(r.toUpperCase())

const wanted: string[] = []
for (const raw of named) {
  const ref = raw.toUpperCase()
  if (present.has(ref)) {
    console.log(`  ${ref}: already in the file — skipped, and nothing about it is touched`)
    continue
  }
  if (!live.has(ref)) {
    console.error(
      `  ${ref}: REFUSED — not in Casio's own sitemap, which is the only identity this\n` +
        `      script accepts. Nothing was written.`,
    )
    continue
  }
  // Check 4a: the series id must be a prefix of every ref in the file.
  if (seriesOf(ref) !== series) {
    console.error(`  ${ref}: REFUSED — its series is "${seriesOf(ref)}", not "${series}". It belongs in another file.`)
    continue
  }
  const belongs = lineOfReference(ref)
  if (belongs !== null && belongs !== line) {
    console.error(`  ${ref}: REFUSED — the rest of the archive files it under ${belongs} (D2 makes a mis-filed id permanent).`)
    continue
  }
  wanted.push(ref)
}
if (wanted.length === 0) {
  console.log('\nnothing to do')
  process.exit(0)
}
console.log(`\n${wanted.length} references Casio lists and this file does not: ${wanted.join(', ')}`)

/* ------------------------------------------------------------------------- *
 * Read their pages
 * ------------------------------------------------------------------------- */

const found = await archivedFor(line)
const readings: { ref: string; url: string; rows: Map<string, string>; image: string | null }[] = []
const thin: string[] = []
const unreachable: string[] = []
let consecutive = 0

for (const ref of wanted) {
  const candidates = found.get(ref) ?? []
  if (candidates.length === 0) {
    unreachable.push(ref)
    console.error(`  ${ref}: no archived capture in the index for line ${line}`)
    continue
  }
  const scored = [...candidates].sort((a, b) => Number(isEnglish(b.url)) - Number(isEnglish(a.url)))
  let best: { url: string; rows: Map<string, string>; image: string | null } | null = null
  let fetched = 0
  for (const snapshot of scored) {
    const cached = join(CACHE, `page-${snapshot.ref}-${snapshot.timestamp}.html`)
    const html =
      mode === '--crawl' ? await page(snapshot) : existsSync(cached) ? readFileSync(cached, 'utf8') : null
    if (!html) continue
    fetched += 1
    const rows = specRows(html)
    console.error(`  ${ref} @ ${snapshot.timestamp} ${isEnglish(snapshot.url) ? 'EN' : '  '} → ${rows.size} rows`)
    if (!best || rows.size > best.rows.size) {
      best = { url: snapshot.url, rows, image: imageUrl(html, snapshot.ref, new Set(found.keys())) }
    }
    if (rows.size >= ENOUGH_ROWS && isEnglish(snapshot.url)) break
  }
  if (!best || fetched === 0) {
    unreachable.push(ref)
    console.error(`  ${ref}: ${mode === '--crawl' ? 'the archive served no capture' : 'not cached — run --crawl first'}`)
    // Five unreachable in a row while crawling is the cooldown, not five absent
    // pages. A run that cannot fetch anything is the cooldown, not the catalogue.
    if (mode === '--crawl' && (consecutive += 1) >= 5) {
      console.error(`\nSTOPPING: ${consecutive} in a row could not be fetched — that is the cooldown.`)
      break
    }
    continue
  }
  consecutive = 0
  if (best.rows.size < ENOUGH_ROWS) {
    thin.push(`${ref} (${best.rows.size})`)
    continue
  }
  readings.push({ ref, ...best })
}

if (thin.length > 0) console.log(`\n${thin.length} state too little to seed from (D50): ${thin.join(', ')}`)
if (unreachable.length > 0) console.log(`${unreachable.length} could not be read: ${unreachable.join(', ')}`)

const read = readings.map((r) => ({ ...toModel(r.ref, r.url, r.rows, r.image), url: r.url }))

// Named, never merely dropped: "14 ready" out of 30 invites the reader to assume
// the other 16 do not exist. They do; this reader cannot parse their page.
const unreadable = read.filter((m) => Object.values(m.fields).every((v) => v === undefined))
if (unreadable.length > 0) {
  console.log(`\n${unreadable.length} state specifications this reader cannot parse (D46), so they are not seeded:`)
  for (const m of unreadable) {
    console.log(`  ${m.ref.padEnd(18)} ${m.url.replace(/^https:\/\/web\.archive\.org\/web\/\d+id_\//, '')}`)
  }
}

const models: Seeded[] = read
  .filter((m) => Object.values(m.fields).some((v) => v !== undefined))
  .sort((a, b) => a.ref.localeCompare(b.ref))

console.log(`\n${models.length} entries ready`)
if (mode !== '--write') {
  for (const m of models) {
    const fields = Object.entries(m.fields).filter(([, v]) => v !== undefined).map(([k]) => k)
    console.log(`  ${m.ref.padEnd(18)} ${fields.join(' ')}${m.image ? ' image' : ''}`)
  }
  process.exit(0)
}

if (models.length === 0) {
  console.log('nothing to write')
  process.exit(0)
}

/* ------------------------------------------------------------------------- *
 * Write
 *
 * Appended, and the rest of the file is byte-identical: `catalog-src/` is not
 * prettier-formatted and a parse-and-serialise round trip would rewrite every
 * entry that is already there.
 *
 * The note is the point of the diff. A reviewer reading `git diff` on this file
 * needs to know why a reference the project's own filter refuses is in it, and
 * "the tool did it" is not an answer — so the note names the filter, the roster
 * that overrules it, and the open question that has not been decided.
 * ------------------------------------------------------------------------- */

const lines = original!.split('\n')
while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()

const note = [
  ``,
  `# ADDED ${new Date().toISOString().slice(0, 10)}: ${models.length} reference${models.length === 1 ? '' : 's'} named by hand, because`,
  `# D47's discovery filter refuses ${models.length === 1 ? 'it' : 'them'}.`,
  `#`,
  `# Each is listed in Casio's OWN CURRENT SITEMAP, which is Casio stating that the`,
  `# reference exists (D48) — a stronger claim about identity than any shape rule,`,
  `# and the only identity \`seed-refs.ts\` accepts. \`roster.ts\`'s \`CANONICAL_REF\``,
  `# refuses ${models.length === 1 ? 'it' : 'them'} on the shape of the variant block; that filter governs what a`,
  `# CRAWL may turn into a permanent id unsupervised, and it is not a claim that`,
  `# the reference is fake. Widening it is O13 and the client's decision, so`,
  `# ${models.length === 1 ? 'this reference was' : 'these references were'} named instead, which needs no decision at all.`,
  `#`,
  `# Every field below comes from the one archived Casio product page named in its`,
  `# \`source\` (D52), read by the same reader as the rest of this file. No \`year\`:`,
  `# a product page dates nothing (D25). No \`discontinued\`: that is measured over`,
  `# the whole catalogue by \`availability.ts\` (D59), never written by hand.`,
]

writeFileSync(path, [...lines, ...note, models.map(modelYaml).join('\n')].join('\n') + '\n')
console.log(`added ${models.length} entries to catalog-src/${line}/${series}.yaml`)

const images = models.filter((m) => m.image).map((m) => `${m.id}\t${m.image}`)
if (images.length > 0) {
  mkdirSync(CACHE, { recursive: true })
  const list = join(CACHE, `${line}-${series}-images.tsv`)
  writeFileSync(list, images.join('\n') + '\n')
  console.log(`${images.length} image URLs → ${list}`)
  console.log(`\nNext: node ../casio-catalog/references/photos.ts ${line} ${line}-${series}`)
  console.log(`      npm run catalog:images`)
  console.log(`      node ../casio-catalog/references/availability.ts ${line} --write`)
}
