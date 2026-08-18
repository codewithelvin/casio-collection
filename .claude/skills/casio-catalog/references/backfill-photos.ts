// Put Casio's own photograph on models that already have their fields.
//
//   node backfill-photos.ts <line> --plan    how many could get one, from the CDX index alone
//   node backfill-photos.ts <line> --crawl   fetch the pages, list the image URLs
//   node backfill-photos.ts <line> --recheck rebuild the list from the cache, fetching nothing
//   node backfill-photos.ts <line> --write   patch catalog-src/<line>/*.yaml
//
// WHY THIS IS NOT `seed.ts`. Sheen and Oceanus were seeded *from* the archived
// product page, so `seed.ts --write` generates the whole series file and the
// photograph comes along with the fields. G-SHOCK, Baby-G, Edifice and Pro Trek
// were seeded the other way — from the module manual (D44) — and those files are
// reviewed, hand-headed and carry facts `seed.ts` cannot read. Running
// `seed.ts <line> --write` over them would overwrite every one of them.
//
// So this adds **one thing and nothing else**: `image` and `image_credit`, on
// entries that have neither. It never touches a field, never reorders an entry,
// and never writes an entry that is not already there.
//
// D41 IS MET THE SAME WAY D52 MEETS IT. The URL is read off Casio's own archived
// product page for that exact reference — never derived from the reference — and
// the file is then fetched from casio.com, which still serves it at 200. The
// credit names Casio, `rights-reserved` under D11, and points at the archived
// page, because a credit that cannot be opened is decoration and the live page
// answers 403.
//
// The photograph's provenance is therefore *not* the entry's `source`, and that
// difference is written into each series file's header rather than left for a
// reader to notice.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { imageUrl, page, snapshots, type Snapshot } from './archive.ts'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
const REPO = join(import.meta.dirname, '..', '..', '..', '..')

/** Where `catalog:images` writes what it publishes. The gate for `--write`. */
const PUBLISHED = join(REPO, 'public', 'img', 'models')

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Casio prints the same reference with and without its hyphens across systems. */
const key = (ref: string) => ref.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * **This catalogue's line id is not casio.com's URL segment, and the difference
 * is silent.** `g-shock` here is `gshock` there; `baby-g` is `babyg`; `pro-trek`
 * is `protrek`. Sheen and Oceanus happen to match, which is why `seed.ts` was
 * able to pass the line id straight through and why nothing had caught this.
 *
 * A CDX query on the wrong segment answers **200 with an empty list**, and the
 * first run of this script duly reported "0 archived product pages" for all 670
 * G-SHOCK references — a well-formed answer to the wrong question, which is the
 * exact shape of lie `sources.md` keeps a section for. The segments below are
 * read off Casio's own sitemap (`node sitemap.ts`), not guessed.
 *
 * A line can have more than one: Casio files 31 references under
 * `gshock/lifestyle` that are G-SHOCKs like any other.
 */
const SEGMENTS: Record<string, string[]> = {
  'g-shock': ['gshock', 'gshock/lifestyle'],
  'baby-g': ['babyg'],
  edifice: ['edifice'],
  'pro-trek': ['protrek'],
  sheen: ['sheen'],
  oceanus: ['oceanus'],
  vintage: ['casio/vintage', 'casio'],
}

/** Every archived capture for a line, across every segment Casio files it under. */
async function archived(line: string): Promise<Map<string, Snapshot[]>> {
  const merged = new Map<string, Snapshot[]>()
  for (const segment of SEGMENTS[line] ?? [line]) {
    for (const [ref, list] of await snapshots(segment)) {
      // Four captures per reference is `snapshots()`'s bound on politeness, and
      // merging two segments must not quietly double it.
      merged.set(ref, [...(merged.get(ref) ?? []), ...list].slice(0, 4))
    }
  }
  return merged
}

/* ------------------------------------------------------------------------- *
 * Reading the series files
 *
 * Line-based rather than through the YAML loader, because `--write` has to put
 * two keys back into a file whose exact formatting is reviewed and must not be
 * reflowed (CLAUDE.md: `catalog-src/` is not prettier-formatted and must not be).
 * A parse-and-serialise round trip would rewrite all 27 of them.
 * ------------------------------------------------------------------------- */

interface Entry {
  id: string
  ref: string
  hasImage: boolean
  /** Index of the `  - id:` line, and of the line after the entry's last. */
  start: number
  end: number
}

interface SeriesFile {
  path: string
  lines: string[]
  entries: Entry[]
}

function readSeries(line: string): SeriesFile[] {
  const dir = join(REPO, 'catalog-src', line)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => {
      const path = join(dir, name)
      const lines = readFileSync(path, 'utf8').split('\n')
      const entries: Entry[] = []
      for (let index = 0; index < lines.length; index++) {
        const id = /^ {2}- id: (\S+)\s*$/.exec(lines[index])
        if (!id) continue
        if (entries.length > 0) entries[entries.length - 1].end = index
        entries.push({ id: id[1], ref: '', hasImage: false, start: index, end: lines.length })
      }
      for (const entry of entries) {
        for (let index = entry.start; index < entry.end; index++) {
          const ref = /^ {4}ref: (\S+)\s*$/.exec(lines[index])
          if (ref) entry.ref = ref[1]
          if (/^ {4}image:/.test(lines[index])) entry.hasImage = true
        }
      }
      // The last entry's `end` runs to EOF, which includes the file's trailing
      // blank line. Pull it back to the last line that has something on it, so
      // an insertion lands inside the entry rather than after the file.
      const last = entries[entries.length - 1]
      if (last) {
        while (last.end > last.start + 1 && lines[last.end - 1].trim() === '') last.end -= 1
      }
      return { path, lines, entries }
    })
    .filter((file) => file.entries.length > 0)
}

/* ------------------------------------------------------------------------- *
 * CLI
 * ------------------------------------------------------------------------- */

const [line, mode] = process.argv.slice(2)
if (!line || !['--plan', '--crawl', '--recheck', '--write'].includes(mode ?? '')) {
  console.error('usage: backfill-photos.ts <line> [--plan | --crawl | --recheck | --write]')
  process.exit(1)
}

const files = readSeries(line)
if (files.length === 0) {
  console.error(`No catalog-src/${line}/*.yaml — this backfills a line that is already seeded.`)
  process.exit(1)
}

const all = files.flatMap((file) => file.entries)
const wanted = all.filter((entry) => !entry.hasImage)
console.log(
  `${line}: ${all.length} models, ${all.length - wanted.length} already have a photograph, ` +
    `${wanted.length} do not`,
)

const listPath = join(CACHE, `${line}-images.tsv`)

/**
 * **`--recheck` reads the cache and never fetches, and that is what makes it
 * safe to re-run.** The rule for which asset belongs to which reference changed
 * once already — it was matching by prefix, which would have put `GA-2100-1A1`'s
 * photograph under `GA-2100-1A` — so the list has to be rebuildable under a
 * corrected rule without asking the archive for 259 pages it already gave us.
 *
 * It is also the only way to re-run this while a crawl is going: a second
 * process hitting the same throttled host does not go faster, it trips the
 * cooldown for both.
 */
const cachedPage = (snapshot: Snapshot): string | null => {
  const file = join(CACHE, `page-${snapshot.ref}-${snapshot.timestamp}.html`)
  if (!existsSync(file) || statSync(file).size === 0) return null
  return readFileSync(file, 'utf8')
}

if (mode === '--plan' || mode === '--crawl' || mode === '--recheck') {
  const found = await archived(line)
  const byKey = new Map<string, Snapshot[]>()
  for (const [ref, list] of found) byKey.set(key(ref), list)

  const reachable = wanted.filter((entry) => byKey.has(key(entry.ref)))
  console.log(
    `${found.size} archived product pages on casio.com; ` +
      `${reachable.length} of the ${wanted.length} match a reference here`,
  )

  if (mode === '--plan') {
    const perSeries = new Map<string, { want: number; have: number }>()
    for (const file of files) {
      const name = file.path.split(/[\\/]/).pop()!.replace('.yaml', '')
      const want = file.entries.filter((entry) => !entry.hasImage)
      perSeries.set(name, {
        want: want.length,
        have: want.filter((entry) => byKey.has(key(entry.ref))).length,
      })
    }
    for (const [name, counts] of [...perSeries].sort((a, b) => b[1].have - a[1].have)) {
      console.log(`  ${name.padEnd(14)} ${String(counts.have).padStart(4)} of ${counts.want}`)
    }
    // A reference with no archived page is not a failure to report per-model —
    // it is most of a discontinued catalogue, and saying so 500 times is noise.
    console.log(`\nNext: node backfill-photos.ts ${line} --crawl`)
    process.exit(0)
  }

  /**
   * Only the image URL is wanted here, so the first capture naming one wins.
   *
   * `read()` in archive.ts is the wrong tool: it keeps fetching until it has a
   * specification table, which is a different question and several times the
   * requests. The fields on these models are already in the catalogue and came
   * from a manual — this run is not allowed to change them.
   */
  /**
   * Every reference known to exist, so a prefix match cannot quietly become
   * another watch's photograph. Both halves are needed: the catalogue knows
   * `GA-2100-1A1` is a model here, and the archive's roster knows about the
   * references Casio published that this catalogue has never seeded — whose
   * `color-variation` URLs are on these pages all the same.
   */
  const known = new Set<string>([
    ...found.keys(),
    ...all.map((entry) => entry.ref.toUpperCase()),
  ])

  const rows: string[] = []
  const silent: string[] = []
  const unreachable: string[] = []
  let dry = 0
  let stopped = false

  const write = () => writeFileSync(listPath, rows.join('\n') + (rows.length > 0 ? '\n' : ''))

  for (const entry of reachable) {
    const candidates = byKey.get(key(entry.ref))!
    let picked: { url: string; snapshot: Snapshot } | null = null
    let fetched = 0
    for (const snapshot of candidates) {
      const html = mode === '--recheck' ? cachedPage(snapshot) : await page(snapshot)
      if (!html) continue
      fetched += 1
      // Try the reference as the page spells it and as the catalogue spells it:
      // the asset is named after one of them and it is not always the same one.
      const url = imageUrl(html, snapshot.ref, known) ?? imageUrl(html, entry.ref, known)
      if (url) {
        picked = { url, snapshot }
        break
      }
    }

    if (picked) {
      dry = 0
      rows.push(`${entry.id}\t${picked.url}\t${picked.snapshot.url}`)
      console.error(`  ${entry.ref}: ${picked.url.split('/').pop()}`)
      write()
      continue
    }
    if (fetched > 0) {
      // Fetched, and Casio's own page names no asset for this reference. That is
      // an answer, and it is not a photograph.
      dry = 0
      silent.push(entry.ref)
      console.error(`  ${entry.ref}: the page names no photograph of this reference`)
      continue
    }
    unreachable.push(entry.ref)
    console.error(
      mode === '--recheck'
        ? `  ${entry.ref}: no capture in the cache — crawl it`
        : `  ${entry.ref}: unreachable — the archive served no capture`,
    )
    // Five in a row is the archive's per-IP cooldown, not five absent pages.
    // Everything fetched is cached, so a later run resumes rather than restarts.
    // In `--recheck` there is no cooldown to detect — an uncached page is one
    // nobody has fetched yet, and stopping on five of those would be wrong.
    if (mode !== '--recheck' && (dry += 1) >= 5) {
      console.error(`\nSTOPPING: ${dry} references in a row could not be fetched.`)
      console.error(`That is the cooldown, not the catalogue. Re-run this later; it resumes.`)
      stopped = true
      break
    }
  }

  write()
  console.log(
    `\n${rows.length} image URLs → ${listPath}` +
      `\n${silent.length} pages name no photograph, ${unreachable.length} not served`,
  )
  if (stopped) process.exit(2)
  console.log(`\nNext: node photos.ts ${line}   then: npm run catalog:images`)
  process.exit(0)
}

/* ------------------------------------------------------------------------- *
 * --write
 *
 * The gate is the **published file**, not the manifest and not the raw download.
 * `catalog:images` refuses a source it cannot fit inside §10.3's budget and
 * deletes what it half-wrote, so a raw file on disk is not proof of a
 * photograph. Writing `image:` for one of those would fail integrity check 5 and
 * leave the catalogue asserting a file that is not there.
 * ------------------------------------------------------------------------- */

if (!existsSync(listPath)) {
  console.error(`No ${listPath}. Run: node backfill-photos.ts ${line} --crawl`)
  process.exit(1)
}

const pageOf = new Map<string, string>()
for (const row of readFileSync(listPath, 'utf8').split('\n').filter(Boolean)) {
  const [id, , sourceUrl] = row.split('\t')
  if (sourceUrl) pageOf.set(id, sourceUrl)
}

const published = (id: string) =>
  existsSync(join(PUBLISHED, `${id}.webp`)) && existsSync(join(PUBLISHED, `${id}@2x.webp`))

let patched = 0
let waiting = 0
for (const file of files) {
  const additions = file.entries.filter(
    (entry) => !entry.hasImage && pageOf.has(entry.id) && published(entry.id),
  )
  waiting += file.entries.filter(
    (entry) => !entry.hasImage && pageOf.has(entry.id) && !published(entry.id),
  ).length
  if (additions.length === 0) continue

  const lines = [...file.lines]
  // Back to front, so an insertion never moves a line index still to be used.
  for (const entry of [...additions].sort((a, b) => b.start - a.start)) {
    lines.splice(
      entry.end,
      0,
      `    image: ${entry.id}`,
      `    image_credit:`,
      `      author: Casio Computer Co., Ltd.`,
      `      licence: rights-reserved`,
      `      url: ${quote(pageOf.get(entry.id)!)}`,
    )
    patched += 1
  }

  /**
   * The header said these entries have no photograph *and why*. They do now, so
   * the bullet comes out of "DELIBERATELY NOT WRITTEN" — a stale absence in that
   * list is worse than no list, because the list is the file's own account of
   * what it chose not to claim.
   */
  const bullet = lines.findIndex((text) => /^#\s+\*\s+`image`/.test(text))
  if (bullet >= 0) {
    let end = bullet + 1
    while (end < lines.length && /^#\s{4,}\S/.test(lines[end]) && !/^#\s+\*/.test(lines[end])) end += 1
    lines.splice(bullet, end - bullet)
  }
  const where = lines.findIndex((text) => /^# DELIBERATELY NOT WRITTEN/.test(text))
  const note = [
    `# THE PHOTOGRAPHS COME FROM A DIFFERENT CASIO PAGE, and each one says so (D53).`,
    `# Every *field* above is still read off the module manual named in \`source\`;`,
    `# the photograph is read off Casio's own archived product page for that exact`,
    `# reference (D52), which is what \`image_credit.url\` points at. The file itself`,
    `# is served live by casio.com from the \`/content/dam/\` path that page names —`,
    `# never a path derived from the reference, which is the whole of D41.`,
    `#`,
    `# NOT EVERY ENTRY HERE HAS ONE, and the ones without are not waiting on effort.`,
    `# The archive holds Casio's product page for some of these references and not`,
    `# others; an entry with no \`image\` is one whose page was never captured, or`,
    `# whose capture names no asset for it. The typographic card is the state for`,
    `# those, and it is a primary state rather than a fallback (D29).`,
    `#`,
  ]
  if (where >= 0) lines.splice(where, 0, ...note)

  writeFileSync(file.path, lines.join('\n'))
  console.log(`  ${file.path.split(/[\\/]/).pop()}  +${additions.length}`)
}

console.log(`\n${patched} entries given a photograph`)
if (waiting > 0) {
  console.log(`${waiting} have a URL but no published file yet — run: npm run catalog:images`)
}
console.log(`\nNext: npm run catalog:build && npm run catalog:validate`)
