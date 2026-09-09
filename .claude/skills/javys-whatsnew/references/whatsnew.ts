// javys.com's "What's New" feed → this year's new vintage references.
//
//   node whatsnew.ts --dry             what would be added, no writes
//   node whatsnew.ts --write           crawl, download images, write the YAML
//   node whatsnew.ts --write --year 2025   a specific year instead of the current one
//
// `https://www.javys.com/casio/whatsnew.htm` lists every series javys has
// added recently as `series.php?series_id=<PREFIX><YY><SEQ>` — Standard
// Analog, Standard Digital, Digital-Analog and Beside are the four subbrands
// it has ever carried, all four already mapped to this catalogue's `vintage`
// line (see .claude/skills/casio-catalog/references/sources.md and this
// session's own javys crawl). The `YY` right after the two-letter subbrand
// code is the year — `DA2601` is Digital-Analog's first 2026 release, `SD2512`
// is Standard Digital's twelfth 2025 one — so filtering to "this year" is
// exact rather than a heuristic over dates the page does not otherwise state.
//
// The live page is not year-scoped itself: it was measured on 2026-09-09
// still carrying every 2025 entry beneath the 2026 ones, which is what makes
// the year filter necessary rather than a nicety.
//
// Everything past discovery — the ref shape check, the per-model image
// fetch, the minimal-entry YAML, the append-not-overwrite rule — is the same
// pipeline this session used for the fuller javys backfill, because it is
// the same site and the same policy: id, ref, source and (where a usable
// photograph exists) image. Nothing else, until somebody reads the page in
// full.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const SRC = join(REPO, 'catalog-src')
const RAW_DIR = join(SRC, 'images', 'raw')
const LINE = 'vintage'
const BASE = 'https://www.javys.com/casio'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
}

const [, , ...args] = process.argv
const mode = args.includes('--write') ? 'write' : 'dry'
const yearArg = args.includes('--year') ? args[args.indexOf('--year') + 1] : undefined
const targetYY = yearArg
  ? String(Number(yearArg) % 100).padStart(2, '0')
  : String(new Date().getFullYear() % 100).padStart(2, '0')

/* --------------------------------------------------------------------- *
 * Fetching, politely — the same pace this session measured javys as
 * tolerating: ~3 requests/sec, with a retry rather than a hard failure on
 * the connection resets a slow crawl occasionally provokes.
 * --------------------------------------------------------------------- */

let lastRequest = 0
async function politeFetch(url: string): Promise<Response> {
  const wait = 320 - (Date.now() - lastRequest)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastRequest = Date.now()
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) })
    } catch (err) {
      lastErr = err
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
  }
  throw lastErr
}

/** D2's shape, and the series a reference sits in — recovered from
 *  .claude/skills/casio-catalog/references/sitemap.ts so a javys-sourced
 *  reference is grouped exactly the way every other route already is. */
function seriesOf(ref: string): string {
  const m = /^([A-Z]+(?:-[A-Z]+)?-?\d{2,5})/.exec(ref)
  return (m ? m[1] : ref).toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function idOf(ref: string): string {
  return ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

/** Read straight off the raw YAML rather than parsing it: this script's only
 *  dependency would otherwise be the `yaml` package, which needs the repo's
 *  own node_modules to resolve and this file may be run from outside it. */
function loadRefPattern(): RegExp {
  const text = readFileSync(join(SRC, 'lines.yaml'), 'utf8')
  const block = text.split(/\n {2}- id: /).find((b) => b.startsWith(`${LINE}\n`))
  if (!block) throw new Error(`lines.yaml: no line block for "${LINE}"`)
  const m = /ref_pattern: '([^']+)'/.exec(block)
  if (!m) throw new Error(`lines.yaml: "${LINE}" has no ref_pattern`)
  return new RegExp(`^${m[1]}$`)
}

/** Every reference already in ANY line's catalogue, not just vintage's —
 *  javys's subbrand tags have mistagged a handful of Baby-G/Pro Trek/G-Shock
 *  references before (memory: subbrand tags lie about the line), and this is
 *  what stops that from producing the same reference filed twice. */
function catalogued(): Set<string> {
  const refs = new Set<string>()
  for (const folder of readdirSync(SRC, { withFileTypes: true })) {
    if (!folder.isDirectory() || folder.name === 'images') continue
    const dir = join(SRC, folder.name)
    for (const file of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
      const text = readFileSync(join(dir, file), 'utf8')
      for (const m of text.matchAll(/^ {4}ref: (\S+)\s*$/gm)) refs.add(m[1].toUpperCase())
    }
  }
  return refs
}

/* --------------------------------------------------------------------- *
 * Discovery: whatsnew.htm → this year's series ids → their references
 * --------------------------------------------------------------------- */

interface DiscoveredSeries {
  seriesId: string
  prefix: string
  yy: string
}

/** Every `series.php?series_id=<PREFIX><YY><SEQ>` link on the page, however
 *  many times it repeats — the page links the same series from more than one
 *  place and de-duplication happens here rather than at every call site. */
function parseWhatsNew(html: string): DiscoveredSeries[] {
  const found = new Map<string, DiscoveredSeries>()
  for (const m of html.matchAll(/series\.php\?series_id=([A-Z]{2,3})(\d{2})(\d{2})/g)) {
    const seriesId = `${m[1]}${m[2]}${m[3]}`
    if (!found.has(seriesId)) found.set(seriesId, { seriesId, prefix: m[1], yy: m[2] })
  }
  return [...found.values()]
}

/** (ref, thumbnail url) pairs off a `series.php` page — the same template
 *  `series_new2.php` uses elsewhere on javys, order-independent on
 *  `src`/`alt` because javys prints `src` first on both. */
async function seriesRefs(seriesId: string): Promise<[string, string][]> {
  const res = await politeFetch(`${BASE}/series.php?series_id=${encodeURIComponent(seriesId)}`)
  if (!res.ok) return []
  const html = await res.text()
  const pairs: [string, string][] = []
  for (const tag of html.matchAll(/<img\b[^>]*>/g)) {
    const src = /src=['"]([^'"]+)['"]/.exec(tag[0])?.[1]
    const alt = /alt=['"]([^'"]+)['"]/.exec(tag[0])?.[1]
    if (src && alt && /\/images\/watch\//.test(src)) pairs.push([alt.trim(), src.trim()])
  }
  return pairs
}

/** The detail page's own citation url, and its large `_L` photo where the
 *  reference is recent enough to have one — every reference this script
 *  finds is brand new, so unlike the fuller vintage backfill this is the
 *  common case rather than the exception. */
async function detailPage(ref: string): Promise<{ url: string; large: string | null }> {
  const url = `${BASE}/new_web/watch/new_watch.php?id=${encodeURIComponent(ref)}`
  const res = await politeFetch(url)
  if (!res.ok) return { url, large: null }
  const html = await res.text()
  const m = /Limages\/\d{4}\/[^"'\s]+_L\.(?:jpg|jpeg|png)/i.exec(html)
  return { url, large: m ? `${BASE}/${m[0]}` : null }
}

/** Downloaded bytes, or null — checked by content-type and a sane minimum
 *  size, never by HTTP 200 alone (a UA-less crawl once got 771-byte error
 *  pages that read as an image at status 200). GIF is skipped: the image
 *  pipeline's ACCEPTED set does not include it. */
async function downloadImage(url: string): Promise<{ buf: Buffer; ext: string } | null> {
  const res = await politeFetch(url)
  if (!res.ok) return null
  const type = res.headers.get('content-type') ?? ''
  if (/gif/i.test(type) || /\.gif(?:$|\?)/i.test(url)) return null
  if (!/^image\//.test(type)) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 300) return null
  const ext = /\.(jpe?g|png)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'jpg'
  return { buf, ext }
}

/* --------------------------------------------------------------------- *
 * YAML — minimal entries, matching this session's javys-sourced files
 * (catalog-src/vintage/w-69.yaml, catalog-src/baby-g/ba-110.yaml): id, ref,
 * source, and image/image_credit where a usable photograph was found.
 * --------------------------------------------------------------------- */

interface NewModel {
  id: string
  ref: string
  sourceUrl: string
  image: string | null
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`

function modelYaml(m: NewModel): string {
  const lines = [
    `  - id: ${m.id}`,
    `    ref: ${m.ref}`,
    `    source: { url: ${quote(m.sourceUrl)}, kind: retailer }`,
  ]
  if (m.image) {
    lines.push(`    image: ${m.id}`)
    lines.push(`    image_credit:`)
    lines.push(`      author: Javys`)
    lines.push(`      licence: rights-reserved`)
    lines.push(`      url: ${quote(m.sourceUrl)}`)
  }
  return lines.join('\n')
}

function header(series: string, year: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `# ${series.toUpperCase()} — seeded ${today} from javys.com's What's New feed
# (20${year}). Only id, ref, source and (where a usable photograph was found)
# image are written here (D27) — the same minimal-entry policy this
# catalogue's other javys-sourced vintage files use.
#
# DELIBERATELY NOT WRITTEN, and each absence is real:
#   * \`family\` — a judgement about how a watch looks, and a human's to make.
#   * \`year\` — javys's own pages state none.
#   * every field a deeper read of the page in \`source\` would state.

series:
  id: ${series}
  name: ${series.toUpperCase()}
  line: ${LINE}

models:
`
}

function appendToSeries(series: string, models: NewModel[], year: string): { created: boolean } {
  const path = join(SRC, LINE, `${series}.yaml`)
  const existed = existsSync(path)
  const original = existed ? readFileSync(path, 'utf8') : header(series, year)
  const lines = original.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  const body = models.map(modelYaml).join('\n')
  writeFileSync(path, [...lines, body].join('\n') + '\n')
  return { created: !existed }
}

/* --------------------------------------------------------------------- *
 * Run
 * --------------------------------------------------------------------- */

console.log(`javys What's New — targeting 20${targetYY}, mode=${mode}`)

const whatsNewRes = await politeFetch(`${BASE}/whatsnew.htm`)
if (!whatsNewRes.ok) throw new Error(`whatsnew.htm: HTTP ${whatsNewRes.status}`)
const whatsNewHtml = await whatsNewRes.text()

const allSeries = parseWhatsNew(whatsNewHtml)
const thisYear = allSeries.filter((s) => s.yy === targetYY)
console.log(
  `${allSeries.length} series on the page, ${thisYear.length} from 20${targetYY}: ` +
    thisYear.map((s) => s.seriesId).join(', '),
)
if (thisYear.length === 0) {
  console.log('\nNothing to do.')
  process.exit(0)
}

const found = new Map<string, string>() // REF -> thumbnail url
for (const { seriesId } of thisYear) {
  const pairs = await seriesRefs(seriesId)
  for (const [ref, thumb] of pairs) {
    if (!found.has(ref.toUpperCase())) found.set(ref.toUpperCase(), thumb)
  }
}
console.log(`${found.size} unique references across those series.`)

const already = catalogued()
const refPattern = loadRefPattern()
const candidates = [...found.keys()].filter((ref) => !already.has(ref))
const malformed = candidates.filter((ref) => !refPattern.test(ref))
const valid = candidates.filter((ref) => refPattern.test(ref)).sort()

console.log(`${found.size - candidates.length} already catalogued (any line), skipped.`)
if (malformed.length > 0) {
  console.log(`${malformed.length} do not match vintage's ref_pattern and are refused: ${malformed.join(', ')}`)
}
console.log(`${valid.length} new reference${valid.length === 1 ? '' : 's'} to add.`)

if (valid.length === 0) {
  console.log('\nNothing to do.')
  process.exit(0)
}

if (mode === 'dry') {
  console.log('\n--dry: not fetching detail pages or writing anything. Re-run with --write to add these.')
  for (const ref of valid) console.log(`  ${ref}  → ${LINE}/${seriesOf(ref)}`)
  process.exit(0)
}

mkdirSync(RAW_DIR, { recursive: true })

const bySeries = new Map<string, string[]>()
for (const ref of valid) {
  const s = seriesOf(ref)
  if (!bySeries.has(s)) bySeries.set(s, [])
  bySeries.get(s)!.push(ref)
}

let written = 0
let withImage = 0
let noImage = 0

for (const [series, refs] of [...bySeries].sort((a, b) => a[0].localeCompare(b[0]))) {
  const models: NewModel[] = []
  for (const ref of refs) {
    const { url: sourceUrl, large } = await detailPage(ref)
    const imageUrl = large ?? found.get(ref)
    const id = idOf(ref)
    let image: string | null = null
    if (imageUrl) {
      const downloaded = await downloadImage(imageUrl)
      if (downloaded) {
        writeFileSync(join(RAW_DIR, `${id}.${downloaded.ext}`), downloaded.buf)
        image = id
        withImage += 1
      } else {
        noImage += 1
      }
    } else {
      noImage += 1
    }
    models.push({ id, ref, sourceUrl, image })
  }
  const { created } = appendToSeries(series, models, targetYY)
  written += models.length
  console.log(
    `${created ? 'created' : 'updated'} catalog-src/${LINE}/${series}.yaml — +${models.length}`,
  )
}

console.log(`\nDone. ${written} reference${written === 1 ? '' : 's'} added (${withImage} with an image, ${noImage} without).`)
console.log(`Next: npm run catalog:images && npm run catalog:build`)
