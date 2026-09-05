// `npm run catalog:build` — §10.1. Validate, then emit the one published file.
//
// This runs in CI ahead of `vite build`, so a catalogue that fails §10.2 stops
// the deploy exactly as a failing test does (§14.3). `public/catalog/` is a
// build artefact and is not committed: the source of truth is the YAML.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
  digestInput,
  editionModelsOf,
  indexOf,
  lineModelsOf,
  modelDocumentsOf,
  searchIndexOf,
  serialiseCatalog,
  serialiseIndex,
  serialiseSplit,
  seriesModelsOf,
  stamp,
} from '../../src/catalog/build.ts'
import type { Catalog } from '../../src/catalog/schema.ts'
import { renderSize } from '../../src/catalog/report.ts'
import { INDEX_FILE, MANIFEST_FILE, OUT_DIR, OUT_FILE } from './load.ts'
import { runValidation } from './validate.ts'

/**
 * §6.2's example stamp is a date and a counter. A counter needs somewhere to
 * remember the last one and CI has nowhere to write it back to; a date alone
 * changes when nothing changed, and the whole value of the stamp is that
 * `catalog.json?v=<version>` can be cached forever. A digest of the content has
 * neither problem — it moves exactly when the catalogue moves. The date is still
 * in the file as `generatedAt`, which is what the footer prints (FR-10.3).
 */
function versionOf(payload: Parameters<typeof digestInput>[0]): string {
  return createHash('sha256').update(digestInput(payload)).digest('hex').slice(0, 12)
}

/**
 * D2 — the manifest only ever grows. Every id this catalogue has published stays
 * in it forever, because it is the only thing standing between a rename and
 * somebody's collection row pointing at nothing.
 */
async function updateManifest(ids: string[]): Promise<number> {
  const text = await readFile(MANIFEST_FILE, 'utf8').catch(() => '{}')
  const parsed: unknown = JSON.parse(text)
  const previous = (parsed as { ids?: unknown }).ids
  const known = new Set(
    Array.isArray(previous) ? previous.filter((id): id is string => typeof id === 'string') : [],
  )
  const added = ids.filter((id) => !known.has(id))
  if (added.length === 0) return 0

  const merged = { ...(parsed as object), ids: [...known, ...added].sort() }
  await writeFile(MANIFEST_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return added.length
}

/**
 * §6.2's split, written beside the one big file rather than instead of it.
 *
 * **`catalog.json` stays for now and that is deliberate.** Every screen still
 * reads it; these files are emitted first, measured, and moved onto one at a
 * time. Emitting and measuring is the cheap half and it is what proves the
 * shape — a split that turns out to have a 300 KB line file in it is better
 * discovered here than after seven screens have been rewritten around it.
 *
 * The whole directory is rewritten on every build and never pruned, because
 * `public/catalog/` is gitignored and CI builds it from empty. A local tree that
 * has been building for weeks can hold a series file for a series that no longer
 * exists; it is not served from there, and `npm run crawl` reads the sitemap
 * rather than the directory.
 */
async function writeSplit(catalog: Catalog): Promise<void> {
  const groups: [string, Map<string, object>][] = [
    ['model', modelDocumentsOf(catalog)],
    ['series', seriesModelsOf(catalog)],
    ['line', lineModelsOf(catalog)],
    ['edition', editionModelsOf(catalog)],
  ]

  const report: string[] = []

  for (const [kind, documents] of groups) {
    await mkdir(join(OUT_DIR, kind), { recursive: true })
    let largest = { id: '', gzip: 0 }
    let total = 0

    // Written in parallel within a group: 3 827 model files one await at a time
    // is the slowest part of the build by an order of magnitude.
    await Promise.all(
      [...documents].map(async ([id, document]) => {
        const body = serialiseSplit(document)
        total += Buffer.byteLength(body, 'utf8')
        const gzip = gzipSync(body).length
        if (gzip > largest.gzip) largest = { id, gzip }
        // The id is a published id (D2) and is already constrained to the
        // characters a filename may hold — ID_PATTERN admits letters, digits and
        // hyphens only, so there is no path separator to escape here.
        await writeFile(join(OUT_DIR, kind, `${id}.json`), body, 'utf8')
      }),
    )

    report.push(
      `  ${kind.padEnd(8)} ${String(documents.size).padStart(5)} files, ` +
        `${(total / 1024).toFixed(0)} KB raw, largest ${largest.id} at ` +
        `${(largest.gzip / 1024).toFixed(1)} KB gzipped`,
    )
  }

  const searchText = serialiseSplit(searchIndexOf(catalog))
  await writeFile(join(OUT_DIR, 'search-index.json'), searchText, 'utf8')
  report.push(
    `  search       1 file,  ${(Buffer.byteLength(searchText, 'utf8') / 1024).toFixed(0)} KB raw, ` +
      `${(gzipSync(searchText).length / 1024).toFixed(1)} KB gzipped`,
  )

  console.log(`\n§6.2 split:\n${report.join('\n')}`)
}

async function runBuild(): Promise<boolean> {
  const { ok, payload } = await runValidation()
  if (!ok || !payload) return false

  const version = versionOf(payload)
  const generatedAt = new Date().toISOString().slice(0, 10)
  const catalog = stamp(payload, version, generatedAt)
  const text = serialiseCatalog(catalog)
  const size = renderSize({
    bytes: Buffer.byteLength(text, 'utf8'),
    gzipBytes: gzipSync(text).length,
    models: catalog.models.length,
  })

  console.log(`\n${size.text}`)
  if (!size.ok) return false

  const indexText = serialiseIndex(indexOf(catalog))

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, text, 'utf8')
  await writeFile(INDEX_FILE, indexText, 'utf8')
  await writeSplit(catalog)
  console.log(`\nWrote public/catalog/catalog.json at version ${version}`)
  // Printed rather than merely written, because this is the number that decides
  // what the front door waits for. If it ever approaches the catalogue's own
  // size, `models` has stopped being the reason the file is big and the first
  // leg of §6.2's split has stopped paying for itself.
  console.log(
    `Wrote public/catalog/catalog-index.json — ${catalog.series.length} series, ` +
      `${(Buffer.byteLength(indexText, 'utf8') / 1024).toFixed(1)} KB raw, ` +
      `${(gzipSync(indexText).length / 1024).toFixed(1)} KB gzipped`,
  )

  const added = await updateManifest(catalog.models.map((model) => model.id))
  if (added > 0) {
    console.log(
      `catalog-src/.published-ids.json gained ${added} id${added === 1 ? '' : 's'} — commit it with the catalogue change (D2)`,
    )
  }

  return true
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!(await runBuild())) process.exit(1)
}
