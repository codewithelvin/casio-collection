// Drop an `image` claim whose file was never published.
//
//   node verify-images.ts            report
//   node verify-images.ts --write    remove the claim and its credit
//
// Runs between `catalog:images` and `catalog:build`.
//
// WHY IT IS NEEDED, and why the photograph backfill does not need it. That path
// writes `image:` only after checking the published `.webp` exists, because it
// runs after `catalog:images` by construction. `seed-into.ts` cannot: it writes
// the whole entry — fields, photograph and all — from one page, in one pass,
// before any file has been fetched, let alone encoded.
//
// So the claim is written hopefully and checked here. §10.3 refuses a source it
// cannot fit inside the budget even at D56's floor of quality 66, and an entry
// left claiming that file fails integrity check 5 and stops the build. The watch
// keeps every field it read; it loses only the assertion that there is a picture
// of it, and D29 has always said the typographic card is a primary state.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const PUBLISHED = join(REPO, 'public', 'img', 'models')

const write = process.argv.includes('--write')

const published = (id: string) =>
  existsSync(join(PUBLISHED, `${id}.webp`)) && existsSync(join(PUBLISHED, `${id}@2x.webp`))

let dropped = 0
const root = join(REPO, 'catalog-src')

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(root, entry.name)
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    const path = join(dir, name)
    const lines = readFileSync(path, 'utf8').split('\n')
    const keep: string[] = []
    let removedHere = 0

    for (let index = 0; index < lines.length; index++) {
      // `image: null` is not a claim, it is the explicit statement that there is
      // no photograph — the value §10.2 tells you to write. Removing it would
      // turn a decision into a silence.
      const claim = /^ {4}image: (?!null\s*$)(\S+)\s*$/.exec(lines[index])
      if (!claim || published(claim[1])) {
        keep.push(lines[index])
        continue
      }

      console.log(`  ${entry.name}/${name.replace('.yaml', '')}  ${claim[1]} — no published file, claim dropped`)
      removedHere += 1
      dropped += 1

      // Skip the claim and the credit block that belongs to it. The credit is
      // indented deeper than a model field, so it ends at the next line that is
      // not — which is the next field, the next entry, or the end.
      index += 1
      if (/^ {4}image_credit:\s*$/.test(lines[index] ?? '')) {
        index += 1
        while (index < lines.length && /^ {6}\S/.test(lines[index])) index += 1
      }
      index -= 1
    }

    if (removedHere > 0 && write) writeFileSync(path, keep.join('\n'))
  }
}

console.log(
  dropped === 0
    ? '\nEvery image claim has a published file.'
    : `\n${dropped} claim${dropped === 1 ? '' : 's'} ${write ? 'dropped' : 'would be dropped'}. ` +
        (write ? 'Next: npm run catalog:build' : 'Re-run with --write.'),
)
