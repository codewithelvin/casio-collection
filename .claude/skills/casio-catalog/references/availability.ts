// Whether Casio still lists a reference — the `discontinued` field, measured.
//
//   node availability.ts                 report what would change
//   node availability.ts --write         write `discontinued` into the YAML
//   node availability.ts <line> --write  one line only
//
// WHY THIS IS A SCRIPT AND NOT A JUDGEMENT. `discontinued` has been in the
// schema since M1 and no model has ever carried it, because there was no rule
// for what counts as evidence. "This watch looks old" is not a source, and
// guardrail 2 refuses a field nobody read off a page. So the field sat there
// while every model in the catalogue said nothing about the one thing a
// collector asks first.
//
// **Casio's own sitemap is the page that answers it.** `casio.com/<loc>/
// sitemap.xml` is Casio listing the references it sells today, and the
// reference is in the path (D48). Presence is a positive statement by Casio;
// absence from the whole of that list is Casio not listing it. Neither is a
// guess, and both come from one official source — which is what lets this be
// one field rather than a per-model citation the way D54's year needs.
//
// Three things it is honest about and one it is not:
//
//   * A reference Casio lists  → `discontinued: false`. Direct.
//   * A reference it does not  → `discontinued: true`.  Absence, from a list
//     that is complete by construction: the sitemap is not a selection.
//   * A tombstoned entry       → nothing. A tombstone means this *entry* was
//     retired, sometimes because the reference turned out not to exist, and
//     "Casio no longer lists it" is a claim about a watch rather than a row.
//   * **Three locales of twenty-nine.** `sitemap.ts` fetches `us`, `intl` and
//     `de`; `jp` and `asia` list no products at all. A watch sold only in Japan
//     is therefore invisible here and reads as no longer listed. That is the
//     one direction this can be wrong in, it is recorded in the specification
//     beside the decision, and it is why the reader is shown *no longer listed
//     by Casio* rather than the bare word discontinued.
//
// Idempotent: a model whose field already says the right thing is not touched,
// and one that says the wrong thing has its line replaced rather than a second
// one added.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCALES, refresh, roster } from './sitemap.ts'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')

const args = process.argv.slice(2)
const write = args.includes('--write')
const onlyLine = args.find((a) => !a.startsWith('--'))

/**
 * Every reference Casio lists anywhere on casio.com, across every segment.
 *
 * Unioned rather than matched per line on purpose. The segment a page is served
 * from is not a reliable statement of its line — Casio's Taiwan site files
 * Baby-G references under `edifice` — and the question here is not *where*
 * Casio lists a reference but *whether* it does.
 */
await refresh()
const listed = new Set<string>()
for (const refs of roster().values()) for (const ref of refs) listed.add(ref.toUpperCase())
console.log(`Casio lists ${listed.size} references across ${roster().size} segments (${LOCALES.join(', ')})`)

interface Change {
  path: string
  id: string
  ref: string
  value: boolean
  /** The existing `discontinued:` line to replace, or null to insert. */
  at: number | null
  /** Index of the line after this entry's last, where a new field is inserted. */
  end: number
}

const changes: Change[] = []
const tally = new Map<string, { listed: number; gone: number; skipped: number }>()

for (const entry of readdirSync(join(REPO, 'catalog-src'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  if (onlyLine && entry.name !== onlyLine) continue
  const dir = join(REPO, 'catalog-src', entry.name)
  const files = readdirSync(dir).filter((n) => n.endsWith('.yaml'))
  if (files.length === 0) continue
  const count = tally.get(entry.name) ?? { listed: 0, gone: 0, skipped: 0 }
  tally.set(entry.name, count)

  for (const name of files) {
    const path = join(dir, name)
    const lines = readFileSync(path, 'utf8').split('\n')

    const starts: number[] = []
    for (let i = 0; i < lines.length; i++) if (/^ {2}- id: \S+\s*$/.test(lines[i])) starts.push(i)

    starts.forEach((start, index) => {
      let end = starts[index + 1] ?? lines.length
      // Walk back over blank lines **and comments**. A comment before the next
      // entry belongs to that entry; inserting above it keeps the field with the
      // watch it describes, which is what the human reading the diff expects.
      while (end > start + 1 && (lines[end - 1].trim() === '' || lines[end - 1].trim().startsWith('#')))
        end -= 1
      const block = lines.slice(start, end)
      const id = /^ {2}- id: (\S+)/.exec(block[0])![1]
      const ref = block.map((l) => /^ {4}ref: (\S+)/.exec(l)?.[1]).find(Boolean)
      if (!ref) return

      // A tombstone retires the entry, not the watch. Saying anything about
      // Casio's catalogue here would be a claim about a reference this
      // catalogue has already said it got wrong.
      if (block.some((l) => /^ {4}tombstone:/.test(l))) {
        count.skipped += 1
        return
      }

      const value = !listed.has(ref.toUpperCase())
      if (value) count.gone += 1
      else count.listed += 1

      const existing = block.findIndex((l) => /^ {4}discontinued:/.test(l))
      if (existing !== -1) {
        if (block[existing].trim() === `discontinued: ${value}`) return
        changes.push({ path, id, ref, value, at: start + existing, end })
        return
      }
      changes.push({ path, id, ref, value, at: null, end })
    })
  }
}

const total = [...tally.values()].reduce((n, c) => n + c.listed + c.gone, 0)
console.log(`\n${total} models measured, by line:`)
for (const [line, c] of [...tally].sort((a, b) => a[0].localeCompare(b[0]))) {
  const share = c.listed + c.gone === 0 ? 0 : Math.round((c.listed / (c.listed + c.gone)) * 100)
  console.log(
    `  ${line.padEnd(10)} ${String(c.listed).padStart(5)} still listed  ` +
      `${String(c.gone).padStart(5)} no longer  (${share}% current)` +
      (c.skipped > 0 ? `  ${c.skipped} tombstoned, skipped` : ''),
  )
}

const inserts = changes.filter((c) => c.at === null).length
const rewrites = changes.length - inserts
console.log(`\n${changes.length} models change: ${inserts} gain the field, ${rewrites} change value`)
for (const change of changes.filter((c) => c.at !== null))
  console.log(`  ${change.ref.padEnd(18)} → discontinued: ${change.value}  (was the other)`)

if (!write) {
  console.log(`\nNothing written. Run with --write.`)
  process.exit(0)
}

const byFile = new Map<string, Change[]>()
for (const change of changes) byFile.set(change.path, [...(byFile.get(change.path) ?? []), change])

for (const [path, entries] of byFile) {
  const lines = readFileSync(path, 'utf8').split('\n')
  // Back to front, so an insertion never moves an index still to be used.
  for (const change of [...entries].sort((a, b) => (b.at ?? b.end) - (a.at ?? a.end))) {
    if (change.at !== null) lines[change.at] = `    discontinued: ${change.value}`
    else lines.splice(change.end, 0, `    discontinued: ${change.value}`)
  }
  writeFileSync(path, lines.join('\n'))
  console.log(`  ${path.split(/[\\/]/).slice(-2).join('/')}  ${entries.length}`)
}
