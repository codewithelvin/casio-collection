// `npm run catalog:build` — §10.1. Validate, then emit the one published file.
//
// This runs in CI ahead of `vite build`, so a catalogue that fails §10.2 stops
// the deploy exactly as a failing test does (§14.3). `public/catalog/` is a
// build artefact and is not committed: the source of truth is the YAML.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { digestInput, serialiseCatalog, stamp } from '../../src/catalog/build.ts'
import { renderSize } from '../../src/catalog/report.ts'
import { MANIFEST_FILE, OUT_DIR, OUT_FILE } from './load.ts'
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
  const known = new Set(Array.isArray(previous) ? previous.filter((id): id is string => typeof id === 'string') : [])
  const added = ids.filter((id) => !known.has(id))
  if (added.length === 0) return 0

  const merged = { ...(parsed as object), ids: [...known, ...added].sort() }
  await writeFile(MANIFEST_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return added.length
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

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, text, 'utf8')
  console.log(`\nWrote public/catalog/catalog.json at version ${version}`)

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
