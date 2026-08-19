// Re-read every entry against the page it already cites, and fill what is missing.
//
//   node reread.ts                report what would change
//   node reread.ts --write        add only the missing fields
//   node reread.ts <line> --write one line only
//
// WHY THIS EXISTS. `specRows` returned only the **first** value div of each
// accordion row until 2026-08-19, and Casio emits several for one label —
// DBC-611-1's `Other features` has four, of which the third says *Data Bank*.
// So a page could state a fact, the reader could read that page, and the fact
// would still not be in the catalogue. Nothing went red; the entry just said
// less than its own source did. 71 published models were affected, and the
// visible symptom was `audit` §3 reporting `databank` as "carried by one model"
// for three sessions as though it might be a typo.
//
// Fixing the reader fixes every future seed. This fixes the past ones, and it is
// a separate script rather than a re-run of `seed.ts --write` for one reason:
// **`seed.ts --write` regenerates a whole series file.** Pointed at a mixed file
// it would replace fields read off a module manual (D44, D53) with fields read
// off a product page, which is the merge §10.6 forbids — 872 of the catalogue's
// entries cite something other than an archived product page.
//
// THE RULES IT KEEPS, which are why it is safe to run over reviewed files:
//
//   * **Only an entry whose own `source:` is an archived product page.** Not its
//     `image_credit.url` — on a D53 entry that points at the product page while
//     the source is the manual, and confusing the two treated 51 Baby-G manual
//     entries as archive-sourced. That mistake would have licensed exactly the
//     merge this script exists to avoid.
//   * **Only the capture the entry itself names.** The timestamp is in its own
//     URL. A reference has up to four captures and the seeder chose one; reading
//     the others would credit this entry with facts from a page it does not cite.
//   * **It adds and never overwrites.** A field that already has a value is left
//     alone even where the page says something else — that is reported, for a
//     human, because §10.6 says a contradiction is asked about and not resolved.
//   * **It never removes a feature**, including one no longer found. The union is
//     re-sorted into vocabulary order so the diff reads as insertions.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { specRows } from './archive.ts'
import { toModel } from './seed.ts'
import { FEATURE_ORDER } from './seed.ts'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')

const args = process.argv.slice(2)
const write = args.includes('--write')
const onlyLine = args.find((a) => !a.startsWith('--'))

const rank = new Map(FEATURE_ORDER.map((tag, i) => [tag, i]))
const inVocabOrder = (tags: readonly string[]): string[] =>
  [...new Set(tags)].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))

interface Change {
  path: string
  ref: string
  line: string
  /** Lines to insert, and the index to insert them at. */
  inserts: { at: number; text: string }[]
  /** An existing `features:` line rewritten in place. */
  rewrite: { at: number; text: string } | null
  added: string[]
  conflicts: string[]
}

const changes: Change[] = []
let archiveSourced = 0
let other = 0
let noCapture = 0

for (const entry of readdirSync(join(REPO, 'catalog-src'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  if (onlyLine && entry.name !== onlyLine) continue
  const dir = join(REPO, 'catalog-src', entry.name)
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const path = join(dir, name)
    const lines = readFileSync(path, 'utf8').split('\n')

    const starts: number[] = []
    for (let i = 0; i < lines.length; i++) if (/^ {2}- id: \S+\s*$/.test(lines[i])) starts.push(i)

    const fileChanges: Change[] = []
    starts.forEach((start, index) => {
      let end = starts[index + 1] ?? lines.length
      while (end > start + 1 && (lines[end - 1].trim() === '' || lines[end - 1].trim().startsWith('#')))
        end -= 1
      const block = lines.slice(start, end)
      const ref = block.map((l) => /^ {4}ref: (\S+)/.exec(l)?.[1]).find(Boolean)
      if (!ref) return
      if (block.some((l) => /^ {4}tombstone:/.test(l))) return

      // The `source:` url and nothing else. `image_credit.url` sits further down
      // and is a different claim about a different thing.
      const sourceAt = block.findIndex((l) => /^ {4}source:/.test(l))
      if (sourceAt === -1) return
      const sourceText = block.slice(sourceAt, sourceAt + 6).join(' ')
      const url = /url: '([^']+)'/.exec(sourceText)?.[1]
      if (!url) return
      const stamp = /web\.archive\.org\/web\/(\d{14})id_\/.*product\./.exec(url)?.[1]
      if (!stamp) {
        other += 1
        return
      }
      archiveSourced += 1

      const file = join(CACHE, `page-${ref}-${stamp}.html`)
      if (!existsSync(file)) {
        noCapture += 1
        return
      }
      const rows = specRows(readFileSync(file, 'utf8'))
      if (rows.size === 0) return
      const fresh = toModel(ref, url, rows, null).fields

      const inserts: { at: number; text: string }[] = []
      const added: string[] = []
      const conflicts: string[] = []
      let rewrite: { at: number; text: string } | null = null

      // Scalars: fill an absent one, report a disagreement, never overwrite.
      const scalar = (key: string, format: (v: unknown) => string) => {
        const value = fresh[key]
        if (value === undefined || value === null) return
        const at = block.findIndex((l) => new RegExp(`^ {4}${key}:`).test(l))
        if (at !== -1) {
          const shown = block[at].slice(`    ${key}: `.length).trim().replace(/^'|'$/g, '')
          if (shown !== String(value)) conflicts.push(`${key}: has ${shown}, page says ${value}`)
          return
        }
        // Inserted at the end of the entry rather than in schema order: the
        // objects are strict but unordered, and an insertion point that depends
        // on which neighbours exist is a second thing to get wrong.
        inserts.push({ at: end, text: format(value) })
        added.push(key)
      }
      scalar('display', (v) => `    display: ${v}`)
      scalar('movement', (v) => `    movement: ${v}`)
      scalar('module', (v) => `    module: '${v}'`)
      scalar('water_resistance_m', (v) => `    water_resistance_m: ${v}`)

      // Features: the union, back in vocabulary order. Never a removal.
      const featureAt = block.findIndex((l) => /^ {4}features: \[/.test(l))
      const found = (fresh.features as string[] | undefined) ?? []
      if (found.length > 0) {
        const existing =
          featureAt === -1
            ? []
            : (/^ {4}features: \[(.*)\]/.exec(block[featureAt])?.[1] ?? '')
                .split(', ')
                .filter(Boolean)
        const union = inVocabOrder([...existing, ...found])
        const extra = found.filter((t) => !existing.includes(t))
        if (extra.length > 0) {
          const text = `    features: [${union.join(', ')}]`
          if (featureAt === -1) inserts.push({ at: end, text })
          else rewrite = { at: start + featureAt, text }
          added.push(...extra.map((t) => `+${t}`))
        }
      }

      if (inserts.length === 0 && rewrite === null && conflicts.length === 0) return
      fileChanges.push({ path, ref, line: entry.name, inserts, rewrite, added, conflicts })
    })
    changes.push(...fileChanges)
  }
}

console.log(`${archiveSourced} entries cite an archived product page as their own source`)
console.log(`${other} cite something else — a module manual or a community page — and are untouched`)
if (noCapture > 0) console.log(`${noCapture} name a capture that is no longer in the page cache`)

const withAdds = changes.filter((c) => c.added.length > 0)
const withConflicts = changes.filter((c) => c.conflicts.length > 0)
console.log(`\n${withAdds.length} entries gain something their own source states:`)
const byLine = new Map<string, number>()
for (const c of withAdds) byLine.set(c.line, (byLine.get(c.line) ?? 0) + 1)
for (const [line, n] of [...byLine].sort((a, b) => b[1] - a[1])) console.log(`  ${line.padEnd(10)} ${n}`)
for (const c of withAdds.slice(0, 40)) console.log(`  ${c.line}/${c.ref.padEnd(18)} ${c.added.join(' ')}`)
if (withAdds.length > 40) console.log(`  … and ${withAdds.length - 40} more`)

if (withConflicts.length > 0) {
  console.log(`\n${withConflicts.length} entries DISAGREE with their page. Nothing is changed — read these:`)
  for (const c of withConflicts.slice(0, 30)) console.log(`  ${c.line}/${c.ref}: ${c.conflicts.join('; ')}`)
  if (withConflicts.length > 30) console.log(`  … and ${withConflicts.length - 30} more`)
}

if (!write) {
  console.log(`\nNothing written. Run with --write.`)
  process.exit(0)
}

const byFile = new Map<string, Change[]>()
for (const c of withAdds) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c])

for (const [path, entries] of byFile) {
  const lines = readFileSync(path, 'utf8').split('\n')
  // Rewrites first — they change no indices. Then insertions back to front.
  for (const c of entries) if (c.rewrite) lines[c.rewrite.at] = c.rewrite.text
  const inserts = entries.flatMap((c) => c.inserts).sort((a, b) => b.at - a.at)
  for (const insert of inserts) lines.splice(insert.at, 0, insert.text)
  writeFileSync(path, lines.join('\n'))
  console.log(`  ${path.split(/[\\/]/).slice(-2).join('/')}  ${entries.length}`)
}
