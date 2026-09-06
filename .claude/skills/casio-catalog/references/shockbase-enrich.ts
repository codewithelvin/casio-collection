// Enrich existing G-SHOCK entries from ShockBase (D74 as revised 2026-09-06).
//
//   node shockbase-enrich.ts probe  GA-2100-1A          one reference, parsed, nothing written
//   node shockbase-enrich.ts plan   g-shock:ga-2100     what would change, per entry
//   node shockbase-enrich.ts write  g-shock:ga-2100     merge it in
//
// THIS ENRICHES; IT DOES NOT SEED. Only references already in the YAML are
// touched. Adding the 726 references O17 found is a separate decision and a
// separate tool — a permanent id (D2) is not a side effect of a field pass.
//
// THE MINIMAL URL IS A 200 THAT MEANS NO. `watch_dyn.php?model=GA-2100-1A`
// answers 200, sets the right document title, and serves HALF A PAGE — 32 KB
// against 62 KB, two active cells against a full checklist, and no Size row at
// all. Every field this tool reads would have come back empty or wrong while
// looking perfectly healthy. The full URL carries `subseries` and `series` too,
// and resolving those is most of what this file does.
//
// NOTHING HERE READS AN IMAGE. D74's photograph half stands: ShockBase's own
// disclaimer says the pictures are Casio's copyright, so `image` and
// `image_credit` are never read, never derived and never written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWatchPage, type ShockbaseReading } from '../../../../src/catalog/shockbase.ts'
import { FEATURES } from '../../../../src/catalog/vocabulary.ts'

const HERE = join(fileURLToPath(import.meta.url), '..')
const REPO = join(HERE, '..', '..', '..', '..')
const CACHE = join(REPO, '.cache', 'shockbase')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const PACE_MS = 400

const [, , mode, scope] = process.argv
if (!mode || !scope || !['probe', 'plan', 'write'].includes(mode)) {
  console.error('usage: shockbase-enrich.ts probe|plan|write <REF | line:series>')
  process.exit(2)
}

mkdirSync(CACHE, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch, cached on disk. The cache IS the progress, so an interrupted run
 * resumes rather than restarts — and a failed fetch is never cached, because
 * "did not answer" must never be replayed later as "said nothing".
 */
const get = async (url: string, key: string): Promise<string | undefined> => {
  const path = join(CACHE, `${key}.html`)
  if (existsSync(path)) {
    const cached = readFileSync(path, 'utf8')
    if (cached.length > 0) return cached
  }
  await sleep(PACE_MS)
  const response = await fetch(url, { headers: { 'user-agent': UA } })
  if (!response.ok) {
    console.error(`  ${response.status} ${url}`)
    return undefined
  }
  const html = await response.text()
  writeFileSync(path, html)
  return html
}

/* -------------------------------------------------------------------------- *
 * Resolving a subseries to its numeric series
 *
 * ShockBase files GA-2100 under numeric series 2100, GW-M5610 under 5600, and
 * the mapping is not derivable from the reference — MRG-B2100 is 2100 and
 * MTG-M900 is 900. So it is read once from the 175 series pages and cached.
 * -------------------------------------------------------------------------- */

const MAP = join(CACHE, 'series-map.tsv')

const buildSeriesMap = async (): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  if (existsSync(MAP)) {
    for (const line of readFileSync(MAP, 'utf8').split('\n')) {
      const [subseries, series] = line.split('\t')
      if (subseries && series) map.set(subseries.toUpperCase(), series)
    }
    return map
  }

  console.error('building the subseries -> series map (175 pages, once)')
  const overview = await get('https://shockbase.org/watches/series_overview.php', 'overview')
  if (!overview) throw new Error('series overview did not answer')
  const ids = [...new Set([...overview.matchAll(/series_dyn\.php\?series=([^"&]+)/g)].map((m) => m[1]))]

  for (const id of ids) {
    const page = await get(`https://shockbase.org/watches/series_dyn.php?series=${id}`, `series-${id}`)
    if (!page) continue
    for (const match of page.matchAll(/subseries_dyn\.php\?series=[^"&]+&subseries=([^"&]+)/g)) {
      map.set(match[1].toUpperCase(), id)
    }
  }
  writeFileSync(MAP, [...map].map(([sub, id]) => `${sub}\t${id}`).join('\n') + '\n')
  console.error(`  ${map.size} subseries mapped`)
  return map
}

/** The full three-parameter URL. Anything less serves half a page. */
const watchUrl = (ref: string, subseries: string, series: string): string =>
  `https://shockbase.org/watches/watch_dyn.php?model=${encodeURIComponent(ref)}` +
  `&subseries=${encodeURIComponent(subseries)}&series=${encodeURIComponent(series)}`

/**
 * The subseries a reference belongs to, longest match first.
 *
 * THE VARIANT BLOCK SITS BETWEEN THE SUBSERIES AND THE HYPHEN, which is what
 * the first version of this got wrong: it required `GA-2100` to be followed by
 * `-`, so `GA-2100AH-6A` matched nothing and **65 of 77 GA-2100 entries were
 * reported as "no ShockBase subseries"** — a clean-looking run that had quietly
 * skipped 84% of the series. Casio's shape is prefix + number + up to four
 * variant letters + suffix, so the subseries may be followed by a hyphen OR by
 * those letters.
 *
 * Longest-first still matters and is what keeps GMA-S2100 off GM-S2100's page.
 */
const subseriesOf = (ref: string, known: Iterable<string>): string | undefined =>
  [...known]
    .filter((sub) => new RegExp(`^${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[A-Z]{0,4}-`, 'i').test(ref))
    .sort((a, b) => b.length - a.length)[0]

const readOne = async (
  ref: string,
  map: Map<string, string>,
): Promise<(ShockbaseReading & { url: string }) | undefined> => {
  const subseries = subseriesOf(ref, map.keys())
  if (!subseries) {
    console.error(`  ${ref}: no ShockBase subseries`)
    return undefined
  }
  const series = map.get(subseries)!
  const url = watchUrl(ref, subseries, series)
  const html = await get(url, `watch-${ref.replace(/[^A-Za-z0-9-]/g, '_')}`)
  if (!html) return undefined

  // THE REDUCED PAGE IS NOT DETECTABLE BY SHAPE, WHICH IS WHY THE URL IS THE
  // DEFENCE. Measured on GA-2100-1A: the one-parameter URL serves a page that
  // still carries the Size row and the whole checklist, and marks **2** cells
  // active where the three-parameter URL marks **6**. So it is not a broken page
  // or a truncated one — it is a complete, well-formed page stating that the
  // watch has fewer functions than it has. No structural check can catch that;
  // only asking the right URL can, which is what `watchUrl` exists for. The
  // check below is a floor against an outright empty table, nothing more.
  if (!/class="cell(in)?active"/.test(html)) {
    console.error(`  ${ref}: no function table — not read`)
    return undefined
  }
  // The page must say it is the watch we asked for.
  const title = /document\.title\s*=\s*"([^"]+)"/.exec(html)?.[1]
  if (title && title.toUpperCase() !== ref.toUpperCase()) {
    console.error(`  ${ref}: page is titled ${title} — not read`)
    return undefined
  }
  return { ...parseWatchPage(html), url }
}

/* -------------------------------------------------------------------------- *
 * The YAML side — line-based, in place
 *
 * `catalog-src/` is not prettier-formatted and a parse-and-serialise round trip
 * would rewrite every entry and every header comment in the file. So entries are
 * located by their `- id:` line and edited as text.
 * -------------------------------------------------------------------------- */

interface Entry {
  id: string
  ref: string
  start: number
  end: number
  keys: Map<string, number>
  indent: string
}

const readEntries = (lines: string[]): Entry[] => {
  const entries: Entry[] = []
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)- id:\s*(\S+)\s*$/.exec(lines[i])
    if (!head) continue
    const indent = head[1] + '  '
    const entry: Entry = { id: head[2], ref: '', start: i, end: lines.length, keys: new Map(), indent }
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*- id:\s*\S+\s*$/.test(lines[j])) {
        entry.end = j
        break
      }
      const key = new RegExp(`^${indent}([a-z_]+):`).exec(lines[j])
      if (key && !entry.keys.has(key[1])) entry.keys.set(key[1], j)
      const ref = new RegExp(`^${indent}ref:\\s*(\\S+)\\s*$`).exec(lines[j])
      if (ref) entry.ref = ref[1]
    }
    entries.push(entry)
  }
  return entries
}

/** Where a block key's value ends — its own line plus any deeper-indented lines. */
const blockEnd = (lines: string[], at: number, indent: string): number => {
  let end = at + 1
  while (end < lines.length && (lines[end].startsWith(indent + ' ') || lines[end].trim() === '')) end++
  return end
}

const yamlScalar = (value: string | number): string =>
  typeof value === 'number' ? String(value) : /^[A-Za-z][A-Za-z0-9 /.-]*$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`

/* -------------------------------------------------------------------------- *
 * Run
 * -------------------------------------------------------------------------- */

const map = await buildSeriesMap()

if (mode === 'probe') {
  const reading = await readOne(scope, map)
  console.log(JSON.stringify(reading ?? null, null, 1))
  process.exit(reading ? 0 : 1)
}

const [line, series] = scope.split(':')
if (!line || !series) {
  console.error('scope must be line:series, e.g. g-shock:ga-2100')
  process.exit(2)
}
const path = join(REPO, 'catalog-src', line, `${series}.yaml`)
if (!existsSync(path)) {
  console.error(`no such file: catalog-src/${line}/${series}.yaml`)
  process.exit(2)
}

const original = readFileSync(path, 'utf8')
const lines = original.split('\n')
const entries = readEntries(lines)
console.error(`${entries.length} entries in ${line}/${series}.yaml`)

interface Change {
  entry: Entry
  reading: ShockbaseReading & { url: string }
  added: string[]
  conflicts: string[]
  droppedFeatures: string[]
  gainedFeatures: string[]
}

const changes: Change[] = []
const unread: string[] = []
const allUnmapped = new Map<string, number>()

for (const entry of entries) {
  if (!entry.ref) continue
  const reading = await readOne(entry.ref, map)
  if (!reading) {
    unread.push(entry.ref)
    continue
  }
  for (const key of reading.unmapped) allUnmapped.set(key, (allUnmapped.get(key) ?? 0) + 1)

  const added: string[] = []
  const conflicts: string[] = []
  const has = (key: string) => entry.keys.has(key)

  // Only fields the entry does not already carry. A field already written was
  // read off the source that entry cites, and silently overwriting it with a
  // community reading would make the citation false without anybody noticing.
  // `year` carries `year_source` with it, always.
  //
  // THIS IS HOW SHOCKBASE GETS CREDITED WITHOUT §10.6 BEING BROKEN. The entry's
  // `source` names the page every OTHER field was read from — the module manual
  // — and re-pointing it at ShockBase would make that citation false for the
  // features the manual states and ShockBase has no row for (`stopwatch`,
  // `countdown-timer`, `hourly-time-signal`, `full-auto-calendar`). D54 already
  // established the shape for exactly this: a per-field citation, enforced by
  // integrity check 6, which rejects a `year_source` with no `year`.
  if (reading.year && !has('year')) {
    added.push('year')
    if (!has('year_source')) added.push('year_source')
  }
  if (reading.module && !has('module')) added.push('module')
  if (reading.colorway && !has('colorway')) added.push('colorway')
  if (reading.water_resistance_m !== undefined && !has('water_resistance_m')) added.push('water_resistance_m')
  if (Object.keys(reading.case).length > 0 && !has('case')) added.push('case')
  if (reading.display && !has('display')) added.push('display')
  if (reading.movement && !has('movement')) added.push('movement')

  // Where the entry DOES carry the field, disagreement is reported rather than
  // resolved — two sources disagreeing about a watch is a finding, not a merge.
  const existingText = lines.slice(entry.start, entry.end).join('\n')
  if (reading.module && has('module') && !existingText.includes(`'${reading.module}'`))
    conflicts.push(`module: yaml≠shockbase(${reading.module})`)
  if (reading.display && has('display') && !new RegExp(`display:\\s*${reading.display}\\b`).test(existingText))
    conflicts.push(`display: yaml≠shockbase(${reading.display})`)

  const existingFeatures = /features:\s*\[([^\]]*)\]/.exec(existingText)?.[1]
  const current = existingFeatures ? existingFeatures.split(',').map((f) => f.trim()).filter(Boolean) : []
  const dropped = current.filter((f) => !reading.features.includes(f as never))

  /**
   * Features are MERGED, never replaced.
   *
   * ShockBase states things the module manual does not (carbon-core-guard on
   * 198 models) and the manual states things ShockBase has no row for
   * (stopwatch, countdown-timer, hourly-time-signal, full-auto-calendar). Taking
   * ShockBase's list wholesale would delete the second set from every entry; so
   * this only ever ADDS, and `dropped` is reported rather than acted on.
   */
  const gained = reading.features.filter((f) => !current.includes(f))
  if (gained.length > 0 && existingFeatures !== undefined) added.push('features+')

  if (added.length > 0 || conflicts.length > 0) {
    changes.push({ entry, reading, added, conflicts, droppedFeatures: dropped, gainedFeatures: gained })
  }
}

console.log(`\n${changes.length} of ${entries.length} entries would change`)
for (const change of changes) {
  const bits = change.added.map((k) => {
    if (k === 'features+') return `features+[${change.gainedFeatures.join(' ')}]`
    if (k === 'year_source') return 'year_source'
    const value = (change.reading as Record<string, unknown>)[k]
    return `${k}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
  })
  console.log(`  ${change.entry.ref.padEnd(18)} +${bits.join(' +') || '(none)'}`)
  if (change.conflicts.length > 0) console.log(`  ${' '.repeat(18)}  ! ${change.conflicts.join('; ')}`)
}

if (unread.length > 0) console.log(`\n${unread.length} not read from ShockBase: ${unread.join(', ')}`)
if (allUnmapped.size > 0) {
  console.log(`\nactive functions with no vocabulary value (reported, never written):`)
  for (const [key, count] of [...allUnmapped].sort((a, b) => b[1] - a[1])) console.log(`  ${key.padEnd(22)} ${count}`)
}

if (mode !== 'write') process.exit(0)
if (changes.length === 0) {
  console.log('nothing to write')
  process.exit(0)
}

/* Apply, from the bottom of the file up so earlier line numbers stay valid. */
for (const change of [...changes].sort((a, b) => b.entry.start - a.entry.start)) {
  const { entry, reading, added } = change
  if (added.length === 0) continue
  const indent = entry.indent
  const block: string[] = []

  // Merge gained features into the existing inline list, in vocabulary order.
  // Done before the insert below so `entry.keys` line numbers are still valid.
  if (added.includes('features+') && change.gainedFeatures.length > 0) {
    const at = entry.keys.get('features')
    const line = at === undefined ? undefined : lines[at]
    // `[^\n]*` rather than `.*` before `$`: the working tree is CRLF against
    // prettier's `endOfLine: lf`, so splitting on '\n' leaves a trailing '\r'
    // on every line. `.` does not match '\r' (it is a line terminator), so
    // `.*$` never reached the end and EVERY single-line list was reported as
    // "not a single-line list — left alone" — 620 of them, silently correct
    // sounding. `[^\n]*` eats the '\r'.
    const inline = line === undefined ? null : /^(\s*features:\s*\[)([^\]]*)(\][^\n]*)$/.exec(line)
    if (!inline) {
      // A features list that is not one inline array is not one this tool edits.
      console.error(`  ${entry.ref}: features is not a single-line list — left alone`)
    } else {
      const current = inline[2].split(',').map((f) => f.trim()).filter(Boolean)
      const merged = [...current, ...change.gainedFeatures].sort(
        (a, b) => FEATURES.indexOf(a as never) - FEATURES.indexOf(b as never),
      )
      lines[at!] = `${inline[1]}${merged.join(', ')}${inline[3]}`
    }
  }

  for (const key of added) {
    // `features+` is a MARKER, not a field. It is handled by the merge above,
    // and falling through to the generic branch wrote a literal
    // `features+: undefined` line into 620 entries — `yamlScalar(undefined)`
    // stringifies to "undefined" rather than throwing, so nothing complained.
    // A sentinel that shares a namespace with real keys is a trap; this is the
    // guard, and the `plan` output now prints the gained features by name.
    if (key === 'features+') continue
    if (key === 'case') {
      block.push(`${indent}case:`)
      for (const [k, v] of Object.entries(reading.case)) block.push(`${indent}  ${k}: ${yamlScalar(v as string | number)}`)
    } else if (key === 'module') {
      block.push(`${indent}module: '${reading.module}'`)
    } else if (key === 'year_source') {
      block.push(`${indent}year_source: '${reading.url}'`)
    } else {
      const value = (reading as Record<string, unknown>)[key]
      block.push(`${indent}${key}: ${yamlScalar(value as string | number)}`)
    }
  }

  // Inserted after `ref:` (or after `source:`'s block if ref is not present),
  // which is where the existing files put the descriptive fields.
  const anchor = entry.keys.get('source') ?? entry.keys.get('ref') ?? entry.start
  const at = entry.keys.has('source') ? blockEnd(lines, anchor, indent) : anchor + 1
  lines.splice(at, 0, ...block)
}

writeFileSync(path, lines.join('\n'))
console.log(`\nwrote ${changes.filter((c) => c.added.length > 0).length} entries to catalog-src/${line}/${series}.yaml`)
console.log(
  `\`source\` is left as it was, and ShockBase is credited per field via \`year_source\`.\n` +
    `Re-pointing \`source\` at ShockBase would make the entry's citation false for the\n` +
    `features the module manual states and ShockBase has no row for — stopwatch,\n` +
    `countdown-timer, hourly-time-signal, full-auto-calendar. That is a decision with\n` +
    `a measurable cost, not a flag to set quietly.`,
)
