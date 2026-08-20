// What it would take to FINISH a scope, before any of it is done.
//
//   node survey.ts <scope> [--deep]
//
//   <line>:<series>   one series          finish-casio vintage:a159
//   <series>          one series, line inferred from catalog-src
//   <line>            every series in the line, ranked by work remaining
//   <year>            references dated to that year, and models already carrying it
//   <REF>             one reference       finish-casio A159WA-N1
//
// WHY THIS EXISTS. "Finish series X" used to mean "seed whatever the crawler
// offers", and the crawler is one roster of two. On A159 that answered three
// references when eight exist: the two most famous A159s are refused by D47's
// shape filter, and three more are in Casio's current sitemap with no archived
// page at all. Every one of those five is invisible to `seed-into.ts`, and each
// is invisible for a DIFFERENT REASON that implies different work — or no work.
//
// So the survey reads BOTH rosters and puts every reference in exactly one
// state. A scope is finished when no reference is left in a state that means
// work, and every reference that is not catalogued has a named reason.
//
//   CATALOGUED      in a catalog-src YAML file already
//   SEEDABLE        an archived product page exists — crawl and seed it (D52)
//   REFUSED-D47     Casio's own sitemap lists it, `CANONICAL_REF` will not admit
//                   it. REAL, and the crawler can never find it. Name it by hand
//                   with seed-refs.ts. D47 as revised (O13, closed 2026-08-19)
//                   names the real references it knowingly refuses and calls
//                   admitting them a separate decision — so this state is not a
//                   bug report, it is the list D47 already acknowledges
//   NO-PAGE         in Casio's sitemap, no archived page anywhere. Identity is
//                   official (D48) and NOTHING states a specification, so it is
//                   NOT WRITTEN — 0 of 2 812 models carry no field, and an entry
//                   claiming `official` while stating nothing is what D46 refuses
//   FOREIGN-LINE    the rest of the archive files it under another line — refused,
//                   because D2 makes a mis-filed id permanent
//   NOT-A-REFERENCE refused by shape and correctly so: distributor SKUs, and the
//                   T-shirts, display stands and gift bags Casio's sitemap lists
//
// `--deep` proves NO-PAGE instead of assuming it, with one domain-wide CDX query
// over casio.com rather than the cached per-segment index. The cached index is 29
// locales of one segment; the deep query is every host and path the archive has.
// It found `africa-fr` and `at` captures that the segment cache does not hold,
// and it is the only thing entitled to say "no archived page exists".
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archivedFor, isEnglish, lineOfReference } from '../../casio-catalog/references/archive.ts'
import { isReference } from '../../casio-catalog/references/roster.ts'
import { refresh, roster, seriesOf } from '../../casio-catalog/references/sitemap.ts'

const REPO = join(import.meta.dirname, '..', '..', '..', '..')
const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const argv = process.argv.slice(2)
const deep = argv.includes('--deep')
const scopeArg = argv.find((a) => !a.startsWith('--'))
if (!scopeArg) {
  console.error('usage: survey.ts <line>:<series> | <series> | <line> | <year> | <REF> [--deep]')
  process.exit(1)
}

/* ------------------------------------------------------------------------- *
 * What is already catalogued
 * ------------------------------------------------------------------------- */

interface Entry {
  line: string
  series: string
  ref: string
  /** Fields beyond `ref` and `source` — an entry with none would state nothing. */
  fields: string[]
  hasImage: boolean
  hasYear: boolean
  hasAvailability: boolean
}

function catalogue(): Entry[] {
  const out: Entry[] = []
  const root = join(REPO, 'catalog-src')
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'images') continue
    for (const file of readdirSync(join(root, dir.name)).filter((n) => n.endsWith('.yaml'))) {
      const text = readFileSync(join(root, dir.name, file), 'utf8')
      for (const block of text.split(/^ {2}- id: /m).slice(1)) {
        const ref = /^ {4}ref: (\S+)\s*$/m.exec(block)?.[1]
        if (!ref) continue
        const keys = [...block.matchAll(/^ {4}([a-z_]+):/gm)].map((m) => m[1])
        out.push({
          line: dir.name,
          series: file.replace('.yaml', ''),
          ref: ref.toUpperCase(),
          fields: keys.filter((k) => !['ref', 'source'].includes(k)),
          hasImage: keys.includes('image'),
          hasYear: keys.includes('year'),
          hasAvailability: keys.includes('discontinued'),
        })
      }
    }
  }
  return out
}

const entries = catalogue()
const byRef = new Map(entries.map((e) => [e.ref, e]))
const LINES = readdirSync(join(REPO, 'catalog-src'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'images')
  .map((d) => d.name)

/* ------------------------------------------------------------------------- *
 * The scope
 *
 * **Echo what it resolved to.** A well-formed answer to the wrong question looks
 * exactly like an answer: `pro-trek` is `protrek` on casio.com, and a CDX query
 * on the wrong segment returns 200 with an empty list. So the resolution is
 * printed before any of it is used, and an empty universe says which roster was
 * asked rather than "0 references".
 * ------------------------------------------------------------------------- */

type Scope =
  | { kind: 'series'; line: string; series: string }
  | { kind: 'line'; line: string }
  | { kind: 'year'; year: number }
  | { kind: 'ref'; line: string; series: string; ref: string }

function resolve(arg: string): Scope {
  if (/^\d{4}$/.test(arg)) return { kind: 'year', year: Number(arg) }
  if (arg.includes(':')) {
    const [line, series] = arg.split(':')
    return { kind: 'series', line, series: series.toLowerCase() }
  }
  if (LINES.includes(arg)) return { kind: 'line', line: arg }
  // A reference carries a variant suffix — `A159WA-N1`, `F-91W-1`. A series id
  // does not. `seriesOf` is the same mechanical prefix rule the catalogue uses.
  const upper = arg.toUpperCase()
  const series = seriesOf(upper)
  if (series !== upper.toLowerCase()) {
    const known = byRef.get(upper)
    const line = known?.line ?? lineOfReference(upper) ?? guessLine(series)
    return { kind: 'ref', line, series, ref: upper }
  }
  return { kind: 'series', line: guessLine(arg.toLowerCase()), series: arg.toLowerCase() }
}

function guessLine(series: string): string {
  for (const line of LINES) if (existsSync(join(REPO, 'catalog-src', line, `${series}.yaml`))) return line
  return 'vintage'
}

const scope = resolve(scopeArg)

/* ------------------------------------------------------------------------- *
 * The two rosters
 * ------------------------------------------------------------------------- */

await refresh()
const live = new Set<string>()
const liveUrl = new Map<string, string>()
for (const [, refs] of roster()) for (const r of refs) live.add(r.toUpperCase())
for (const loc of ['us', 'intl', 'de']) {
  const f = join(tmpdir(), 'casio-catalog-cache', `sm-${loc}.xml`)
  if (!existsSync(f)) continue
  for (const [, url] of readFileSync(f, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g)) {
    const m = /\/product\.([^/]+)\/?$/.exec(url)
    if (m && !liveUrl.has(m[1].toUpperCase())) liveUrl.set(m[1].toUpperCase(), url)
  }
}

/** One domain-wide CDX query. Distinguishes "no captures" from "did not answer". */
async function deepCaptures(prefix: string): Promise<Map<string, number> | null> {
  const key = join(CACHE, `cdx-deep-${prefix.toLowerCase()}.json`)
  let body: string
  if (existsSync(key)) body = readFileSync(key, 'utf8')
  else {
    const url =
      `http://web.archive.org/cdx/search/cdx?url=casio.com&matchType=domain` +
      `&filter=original:.*product%5C.${encodeURIComponent(prefix)}.*` +
      `&output=json&collapse=urlkey&fl=original,statuscode&limit=2000`
    const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null)
    if (!res || !res.ok) {
      console.error(`  deep CDX: ${res ? `HTTP ${res.status}` : 'no answer'} — DID NOT ANSWER, not "no captures"`)
      return null
    }
    body = await res.text()
    // The archive's per-IP cooldown answers HTML with a 200. That is a refusal
    // wearing the shape of an answer, and reporting it as zero captures would
    // turn a rate limit into a permanent claim about a watch.
    if (!body.trim().startsWith('[')) {
      console.error(`  deep CDX: answered ${body.length} bytes of HTML, not JSON — that is the cooldown`)
      return null
    }
    writeFileSync(key, body)
  }
  const counts = new Map<string, number>()
  for (const [original, statuscode] of JSON.parse(body).slice(1) as string[][]) {
    if (statuscode !== '200') continue
    const m = /product\.([^/]+)\/?$/.exec(original)
    if (!m) continue
    const r = m[1].toUpperCase()
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  return counts
}

/* ------------------------------------------------------------------------- *
 * Classify
 * ------------------------------------------------------------------------- */

type State =
  | 'CATALOGUED'
  | 'SEEDABLE'
  | 'REFUSED-D47'
  | 'NO-PAGE'
  | 'FOREIGN-LINE'
  | 'NOT-A-REFERENCE'

interface Row {
  ref: string
  state: State
  caps: number
  english: number
  listed: boolean
  note: string
}

async function classify(line: string, refs: Set<string>, prefix?: string): Promise<Row[]> {
  const archive = await archivedFor(line)
  let deepCounts: Map<string, number> | null = null
  const rows: Row[] = []

  for (const ref of [...refs].sort()) {
    const snaps = archive.get(ref) ?? []
    const caps = snaps.length
    const english = snaps.filter((s) => isEnglish(s.url)).length
    const listed = live.has(ref)
    const known = byRef.get(ref)

    if (known) {
      const gaps: string[] = []
      if (!known.hasImage) gaps.push('no image')
      if (!known.hasAvailability) gaps.push('no availability')
      if (known.fields.length === 0) gaps.push('STATES NOTHING')
      rows.push({
        ref,
        state: 'CATALOGUED',
        caps,
        english,
        listed,
        note: `${known.line}/${known.series}` + (gaps.length ? ` — ${gaps.join(', ')}` : ''),
      })
      continue
    }
    if (!isReference(ref)) {
      rows.push({
        ref,
        state: listed ? 'REFUSED-D47' : 'NOT-A-REFERENCE',
        caps,
        english,
        listed,
        note: listed
          ? 'Casio lists it — real, and the crawler can never find it'
          : 'refused by shape, and not in Casio’s roster either',
      })
      continue
    }
    const belongs = lineOfReference(ref)
    if (belongs !== null && belongs !== line) {
      rows.push({ ref, state: 'FOREIGN-LINE', caps, english, listed, note: `the archive files it under ${belongs}` })
      continue
    }
    if (caps > 0) {
      rows.push({ ref, state: 'SEEDABLE', caps, english, listed, note: english === 0 ? 'no English capture — expect D46' : '' })
      continue
    }
    if (deep && prefix && deepCounts === null) deepCounts = await deepCaptures(prefix)
    const proven = deepCounts ? (deepCounts.get(ref) ?? 0) === 0 : false
    rows.push({
      ref,
      state: 'NO-PAGE',
      caps: deepCounts?.get(ref) ?? 0,
      english,
      listed,
      note: proven
        ? 'proven: zero 200s in a domain-wide CDX query'
        : deep
          ? 'UNPROVEN — the deep query did not answer'
          : 'not in the cached index; run --deep to prove it',
    })
  }
  return rows
}

/** Every reference the two rosters know about, for one series. */
async function universe(line: string, series: string): Promise<Set<string>> {
  const refs = new Set<string>()
  for (const ref of (await archivedFor(line)).keys()) if (seriesOf(ref) === series) refs.add(ref)
  for (const ref of live) if (seriesOf(ref) === series) refs.add(ref)
  for (const e of entries) if (e.line === line && e.series === series) refs.add(e.ref)
  return refs
}

const ORDER: State[] = ['SEEDABLE', 'REFUSED-D47', 'NO-PAGE', 'FOREIGN-LINE', 'NOT-A-REFERENCE', 'CATALOGUED']
const WORK: State[] = ['SEEDABLE', 'REFUSED-D47']

function report(title: string, rows: Row[]): void {
  console.log(`\n${title} — ${rows.length} reference${rows.length === 1 ? '' : 's'} across both rosters`)
  console.log('')
  for (const state of ORDER) {
    const group = rows.filter((r) => r.state === state)
    if (group.length === 0) continue
    console.log(`  ${state}  (${group.length})`)
    for (const r of group) {
      const ev = `${r.listed ? 'listed' : '      '} caps=${String(r.caps).padStart(2)}/${String(r.english).padStart(2)}en`
      console.log(`    ${r.ref.padEnd(18)} ${ev}  ${r.note}`)
    }
    console.log('')
  }
}

function verdict(rows: Row[], line: string, series: string): void {
  const work = rows.filter((r) => WORK.includes(r.state))
  const gaps = rows.filter((r) => r.state === 'CATALOGUED' && r.note.includes('—'))
  if (work.length === 0 && gaps.length === 0) {
    console.log(`FINISHED. Every reference is catalogued or has a named reason not to be.`)
    return
  }
  console.log(`NOT FINISHED. ${work.length} references imply work:`)
  const seedable = rows.filter((r) => r.state === 'SEEDABLE').map((r) => r.ref)
  const refused = rows.filter((r) => r.state === 'REFUSED-D47').map((r) => r.ref)
  if (seedable.length > 0) {
    console.log(`\n  ${seedable.length} SEEDABLE — the crawler finds these itself:`)
    console.log(`    node ../casio-catalog/references/seed-into.ts ${line} ${series} --crawl`)
    console.log(`    node ../casio-catalog/references/seed-into.ts ${line} ${series} --write`)
  }
  if (refused.length > 0) {
    console.log(`\n  ${refused.length} REFUSED-D47 — the crawler never will. Name them:`)
    console.log(`    node references/seed-refs.ts ${line} ${series} --crawl ${refused.join(' ')}`)
    console.log(`    node references/seed-refs.ts ${line} ${series} --write ${refused.join(' ')}`)
  }
  if (gaps.length > 0) {
    console.log(`\n  ${gaps.length} catalogued with gaps:`)
    for (const g of gaps) console.log(`    ${g.ref.padEnd(18)} ${g.note}`)
  }
  console.log(`\n  then: photos.ts -> npm run catalog:images -> availability.ts ${line} --write`)
  console.log(`        -> npm run catalog:build && npm run catalog:validate`)
}

/* ------------------------------------------------------------------------- *
 * Run
 * ------------------------------------------------------------------------- */

if (scope.kind === 'series' || scope.kind === 'ref') {
  const { line, series } = scope
  console.log(`scope: ${scope.kind} ${line}:${series}${scope.kind === 'ref' ? ` (${scope.ref} only)` : ''}`)
  let refs = await universe(line, series)
  if (scope.kind === 'ref') refs = new Set([...refs].filter((r) => r === scope.ref))
  if (refs.size === 0) {
    console.log(
      `\nNo references. Both rosters were asked: the archive index for line "${line}" ` +
        `and Casio's sitemap. If that is a surprise, check the SEGMENT — ` +
        `g-shock is "gshock" and pro-trek is "protrek" on casio.com, and the wrong ` +
        `one answers with an empty list rather than an error.`,
    )
    process.exit(0)
  }
  const rows = await classify(line, refs, series.toUpperCase().replace(/-/g, ''))
  report(`${line}:${series}`, rows)
  verdict(rows, line, series)
} else if (scope.kind === 'line') {
  const { line } = scope
  console.log(`scope: line ${line}`)
  const allSeries = new Set<string>()
  for (const ref of (await archivedFor(line)).keys()) allSeries.add(seriesOf(ref))
  for (const e of entries) if (e.line === line) allSeries.add(e.series)
  for (const ref of live) {
    const s = seriesOf(ref)
    if (entries.some((e) => e.line === line && e.series === s)) allSeries.add(s)
  }
  const summary: { series: string; work: number; total: number; refused: number; noPage: number }[] = []
  for (const series of [...allSeries].sort()) {
    const rows = await classify(line, await universe(line, series))
    summary.push({
      series,
      total: rows.length,
      work: rows.filter((r) => WORK.includes(r.state)).length,
      refused: rows.filter((r) => r.state === 'REFUSED-D47').length,
      noPage: rows.filter((r) => r.state === 'NO-PAGE').length,
    })
  }
  const unfinished = summary.filter((s) => s.work > 0).sort((a, b) => b.work - a.work)
  console.log(`\n${allSeries.size} series; ${unfinished.length} are not finished\n`)
  console.log('  series              refs  work  D47  no-page')
  for (const s of unfinished) {
    console.log(
      `  ${s.series.padEnd(18)} ${String(s.total).padStart(4)}  ${String(s.work).padStart(4)}  ${String(s.refused).padStart(3)}  ${String(s.noPage).padStart(7)}`,
    )
  }
  console.log(`\nFinish one at a time: node survey.ts ${line}:<series>`)
} else {
  console.log(`scope: year ${scope.year}`)
  const carrying = entries.filter((e) => {
    const text = readFileSync(join(REPO, 'catalog-src', e.line, `${e.series}.yaml`), 'utf8')
    const block = text.split(/^ {2}- id: /m).find((b) => new RegExp(`^ {4}ref: ${e.ref}\\s*$`, 'm').test(b))
    return block ? new RegExp(`^ {4}year: ${scope.year}\\s*$`, 'm').test(block) : false
  })
  console.log(`\n${carrying.length} catalogued models already carry year ${scope.year}:`)
  for (const e of carrying) console.log(`    ${e.ref.padEnd(18)} ${e.line}/${e.series}`)
  console.log(
    `\nA year is only ever written from a DATED Casio news release (D54), and\n` +
      `casio.com/intl/news/ indexes recent years only — news.ts reads 2024-2026.\n` +
      `For anything earlier there is no dated official source, so no reference can\n` +
      `be attributed to ${scope.year} from here. That is a gap in the source, not in\n` +
      `the catalogue, and D25 is explicit that an unknown year stays absent.\n` +
      `\n  node ../casio-catalog/references/news.ts --list   the releases that exist\n` +
      `  node ../casio-catalog/references/news.ts --dry    which models would gain one`,
  )
  const series = new Set(carrying.map((e) => `${e.line}:${e.series}`))
  if (series.size > 0) {
    console.log(`\nThe series those models sit in, to finish as series:`)
    for (const s of [...series].sort()) console.log(`    node survey.ts ${s}`)
  }
}
