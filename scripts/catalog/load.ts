// Reading `catalog-src/` off the disk. Everything that decides whether the
// catalogue is *correct* lives in src/catalog/ as pure functions (D31 puts a 90%
// floor on that folder); this file only turns files into the data those
// functions take, and it is the one place in the pipeline that knows about
// paths, YAML and the filesystem.
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMap, isSeq, parseDocument, type Document } from 'yaml'
import type { CatalogSource, Issue, SeriesSource } from '../../src/catalog/integrity.ts'
import { LINES_FILE, SERIES_FILE } from '../../src/catalog/schema.ts'
import { issuesFromSchema } from '../../src/catalog/report.ts'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SRC_DIR = join(ROOT, 'catalog-src')
export const RAW_IMAGE_DIR = join(SRC_DIR, 'images', 'raw')
export const IMAGE_DIR = join(ROOT, 'public', 'img', 'models')
export const OUT_DIR = join(ROOT, 'public', 'catalog')
export const OUT_FILE = join(OUT_DIR, 'catalog.json')
/** The models-free projection every page's first paint reads instead (§6.2). */
export const INDEX_FILE = join(OUT_DIR, 'catalog-index.json')
export const MANIFEST_FILE = join(SRC_DIR, '.published-ids.json')

/** Directories under `catalog-src/` that are not lines. */
const NOT_A_LINE = new Set(['images'])

interface Commented {
  commentBefore?: string | null
  comment?: string | null
}

/**
 * §10.2 check 3 — which models carry a written acknowledgement that their
 * reference does not match the line pattern.
 *
 * This is why the pipeline uses a parser that keeps comments. The specification
 * says the exception "must be acknowledged in the file with a one-line comment",
 * and a comment is the right place for it: it sits beside the reference in the
 * diff, it needs no schema field, and it cannot be mistaken for data. Any
 * comment attached to the model entry or to one of its fields counts, as long as
 * it contains `ref-exception`.
 */
function refExceptionsOf(doc: Document): Set<string> {
  const found = new Set<string>()
  const models = doc.get('models', true)
  if (!isSeq(models)) return found

  for (const item of models.items) {
    if (!isMap(item)) continue
    const id = item.get('id')
    if (typeof id !== 'string') continue

    const comments: (string | null | undefined)[] = [item.commentBefore, item.comment]
    for (const pair of item.items) {
      const key = pair.key as Commented | null
      const value = pair.value as Commented | null
      comments.push(key?.commentBefore, key?.comment, value?.commentBefore, value?.comment)
    }
    if (comments.some((comment) => comment && /ref-exception/i.test(comment))) found.add(id)
  }
  return found
}

function yamlErrors(file: string, doc: Document): Issue[] {
  return doc.errors.map((error) => ({
    check: 'yaml',
    where: `${file}: line ${error.linePos?.[0]?.line ?? '?'}`,
    message: error.message,
  }))
}

async function listSeriesFiles(): Promise<{ folder: string; file: string; path: string }[]> {
  const found: { folder: string; file: string; path: string }[] = []
  const entries = await readdir(SRC_DIR, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || NOT_A_LINE.has(entry.name)) continue
    const inFolder = await readdir(join(SRC_DIR, entry.name)).catch(() => [])
    for (const name of inFolder.filter((name) => name.endsWith('.yaml')).sort()) {
      found.push({
        folder: entry.name,
        file: `catalog-src/${entry.name}/${name}`,
        path: join(SRC_DIR, entry.name, name),
      })
    }
  }
  return found
}

export interface LoadResult {
  source: CatalogSource | null
  /** Everything that stopped the source being readable — parse and schema alike. */
  failures: Issue[]
}

export async function loadCatalogSource(): Promise<LoadResult> {
  const failures: Issue[] = []

  const linesPath = join(SRC_DIR, 'lines.yaml')
  const linesText = await readFile(linesPath, 'utf8').catch(() => null)
  if (linesText === null) {
    return {
      source: null,
      failures: [{ check: '4', where: 'catalog-src/lines.yaml', message: 'the file is missing' }],
    }
  }

  const linesDoc = parseDocument(linesText)
  failures.push(...yamlErrors('catalog-src/lines.yaml', linesDoc))
  const linesRaw: unknown = linesDoc.toJS()
  const linesParsed = LINES_FILE.safeParse(linesRaw)
  if (!linesParsed.success) {
    failures.push(...issuesFromSchema('catalog-src/lines.yaml', linesParsed.error.issues, linesRaw))
  }

  const series: SeriesSource[] = []
  for (const entry of await listSeriesFiles()) {
    const text = await readFile(entry.path, 'utf8')
    const doc = parseDocument(text)
    const parseFailures = yamlErrors(entry.file, doc)
    failures.push(...parseFailures)
    if (parseFailures.length > 0) continue

    const raw: unknown = doc.toJS()
    const parsed = SERIES_FILE.safeParse(raw)
    if (!parsed.success) {
      failures.push(...issuesFromSchema(entry.file, parsed.error.issues, raw))
      continue
    }

    series.push({
      file: entry.file,
      folder: entry.folder,
      series: parsed.data.series,
      models: parsed.data.models,
      refExceptions: refExceptionsOf(doc),
    })
  }

  const manifestText = await readFile(MANIFEST_FILE, 'utf8').catch(() => null)
  let publishedIds: string[] = []
  if (manifestText !== null) {
    try {
      const parsed: unknown = JSON.parse(manifestText)
      const ids = (parsed as { ids?: unknown }).ids
      publishedIds = Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === 'string')
        : []
    } catch {
      // D2's only integrity mechanism is this file. An unreadable one is not a
      // thing to shrug at and carry on from — the check it feeds would pass
      // vacuously, which is worse than failing.
      failures.push({
        check: '2',
        where: 'catalog-src/.published-ids.json',
        message: 'the published-id manifest is not valid JSON, so check 2 cannot run',
      })
    }
  }

  const images = new Set(
    (await readdir(IMAGE_DIR).catch(() => [])).filter((name) => name.endsWith('.webp')),
  )

  if (!linesParsed.success) return { source: null, failures }
  return { source: { lines: linesParsed.data, series, publishedIds, images }, failures }
}
