// Turn archived Casio product pages into `catalog-src/<line>/<series>.yaml`.
//
//   node seed.ts <line> --survey    every label and value the cached pages state
//   node seed.ts <line> --write     write the series files
//
// It reads **only what is already in the page cache** and never fetches. That is
// deliberate: `archive.ts` does the crawling, at a pace the archive sets, and
// this can be re-run against a growing cache as often as it takes. A seeding
// step that also fetches is a step that cannot be re-run.
//
// WHAT IT WILL NOT DO. It writes `id`, `ref`, `source` and the fields it can read
// from a stated row. It does not write `year` (D25 — the page dates nothing), it
// does not write `family` (guardrail 4a — a human's call), and it does not
// invent. A row it does not recognise is reported by `--survey` and ignored here,
// which is the direction the error has to fall: an unrecognised row costs a
// missing field, and a mis-recognised one publishes a wrong fact.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENOUGH_ROWS, imageUrl, snapshots, specRows } from './archive.ts'
import { seriesOf } from './sitemap.ts'

const CACHE = join(tmpdir(), 'casio-catalog-cache', 'archive')
const REPO = join(import.meta.dirname, '..', '..', '..', '..')

/** A model id is the reference, lowercased (D2, and the same rule as everywhere). */
const idOf = (ref: string) => ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')

/* ------------------------------------------------------------------------- *
 * Reading a field off a stated row
 *
 * Every function here returns `undefined` when the page does not say, and that
 * is the whole design. D27: absent means unknown, never a plausible guess.
 * ------------------------------------------------------------------------- */

const has = (text: string, ...needles: string[]) =>
  needles.some((n) => text.toLowerCase().includes(n.toLowerCase()))

/** `50-meter water resistance` → 50. `10 BAR` and `Water Resistant` state no number. */
function waterResistance(rows: Map<string, string>): number | undefined {
  const value = rows.get('Water resistance') ?? rows.get('Water Resistance')
  if (!value) return undefined
  const metres = /(\d+)\s*-?\s*met(?:er|re)/i.exec(value)
  if (metres) return Number(metres[1])
  // `20 BAR` is a pressure and converts exactly: 1 BAR ≈ 10 m of water. Casio
  // prints one or the other and means the same thing by both.
  const bar = /(\d+)\s*BAR/i.exec(value)
  return bar ? Number(bar[1]) * 10 : undefined
}

/**
 * `41 × 34 × 8.4 mm` under a label that spells out its own order.
 *
 * The label is read, not assumed: Casio prints `(L× W× H)` for a Sheen and
 * `(H× W× D)` for a G-SHOCK, and a reader that takes the first number as one or
 * the other is wrong half the time and never says so. Only a label naming all
 * three axes is used; anything else leaves the dimensions unknown.
 */
function caseSize(rows: Map<string, string>): Record<string, number> | undefined {
  for (const [label, value] of rows) {
    if (!/case size/i.test(label)) continue
    const axes = [...label.matchAll(/\b([LWHD])\s*[×x]?/g)].map((m) => m[1])
    const numbers = [...value.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
    if (axes.length !== 3 || numbers.length < 3) continue
    const field: Record<string, string> = {
      // The plan dimensions: the narrow one across the wrist is the width, the
      // long one along the arm is the height. `L` and `H` name the same axis on
      // a watch — Casio uses `L` where the strap runs and `H` where the case is
      // taller than it is wide.
      W: 'width_mm',
      L: 'height_mm',
      H: 'height_mm',
      D: 'depth_mm',
    }
    const out: Record<string, number> = {}
    axes.forEach((axis, index) => {
      const key = field[axis]
      // Where a label names both `L` and `H` the last axis is the thickness
      // whatever letter it wears — `L× W× H` is length, width, thickness.
      const resolved = key === 'height_mm' && index === 2 ? 'depth_mm' : key
      if (resolved && out[resolved] === undefined) out[resolved] = numbers[index]
    })
    return Object.keys(out).length > 0 ? out : undefined
  }
  return undefined
}

/** `37 g`. */
function weight(rows: Map<string, string>): number | undefined {
  const value = rows.get('Weight')
  const grams = value && /(\d+(?:\.\d+)?)\s*g\b/i.exec(value)
  return grams ? Number(grams[1]) : undefined
}

/**
 * `Case / bezel material: Stainless steel` → `Stainless steel`.
 *
 * Casio restates the label inside the value on some pages and not others, and it
 * does not restate it the same way: `Case / bezel material:`, `Case / bezel:`,
 * and on a third page no prefix at all, just `Stainless steel`. Anything up to
 * the first colon goes, which is safe here because no material Casio names
 * contains one.
 */
function material(rows: Map<string, string>): string | undefined {
  for (const [label, value] of rows) {
    if (!/case.*material|material.*case|case\s*\/\s*bezel/i.test(label)) continue
    const stripped = value.replace(/^[^:]{0,40}:\s*/, '').trim()
    return stripped || undefined
  }
  return undefined
}

/**
 * What drives it, from the row that says so.
 *
 * `solar-radio` needs **both** stated, and the radio row is its own row — the
 * same reading that made one Frogman `solar` and the one beside it `solar-radio`
 * (sources.md). Bluetooth is not a movement; it is a feature.
 */
function movement(rows: Map<string, string>): string | undefined {
  const all = [...rows].map(([label, value]) => `${label} ${value}`).join(' ')
  const solar = has(all, 'solar panel', 'tough solar', 'solar-powered', 'solar charging')
  const radio = has(all, 'radio-controlled', 'radio controlled', 'time calibration signal')
  if (solar && radio) return 'solar-radio'
  if (solar) return 'solar'
  const power = rows.get('Power supply and battery life') ?? rows.get('Battery') ?? ''
  // A named cell — SR920SW, CR2016 — is a quartz watch with a battery in it.
  if (/\b(?:SR|CR|LR)\d{3,4}[A-Z]*\b/i.test(power) || has(power, 'battery life')) return 'quartz'
  return undefined
}

/**
 * What the dial shows, from the timekeeping row rather than from the line.
 *
 * "The guide talks about hands" is not a statement (sources.md), so this reads
 * only the row that names the display in Casio's own words: `Analog: 3 hands`,
 * `Digital: hour, minute`. A page stating both gets `ana-digi`.
 */
function display(rows: Map<string, string>): string | undefined {
  const timekeeping = [...rows]
    .filter(([label]) => /timekeeping|other features|display/i.test(label))
    .map(([, value]) => value)
    .join(' ')
  if (!timekeeping) return undefined
  const analog = /\banalog(?:ue)?\s*:/i.test(timekeeping) || /\bhands\b/i.test(timekeeping)
  const digital = /\bdigital\s*:/i.test(timekeeping)
  if (analog && digital) return 'ana-digi'
  if (analog) return 'analog'
  if (digital) return 'digital'
  return undefined
}

/**
 * The feature tags the page states in its own rows.
 *
 * Each entry is a vocabulary term and the words Casio uses for it. Nothing is
 * inferred from the line: `shock-resistant` is here because a Casio page prints
 * *Shock Resistant* when it means it, and is absent from a page that does not
 * say so even if every watch in the series has it.
 *
 * `multi-alarm` against `alarm` is the reading sources.md warns about — "5 daily
 * alarms" is `multi-alarm` and "Multi-function alarm" is one alarm with several
 * modes, which is `alarm`. The order matters: the specific test runs first.
 */
const FEATURE_WORDS: [string, RegExp][] = [
  ['multi-alarm', /\b([2-9]|1\d)\s*(?:daily\s*)?alarms\b|\bmultiple daily alarms\b/i],
  ['alarm', /\balarm\b/i],
  ['world-time', /world time/i],
  ['stopwatch', /stopwatch/i],
  ['countdown-timer', /countdown timer/i],
  ['dual-time', /dual time|home time/i],
  ['full-auto-calendar', /full auto[- ]calendar/i],
  ['calendar', /\bcalendar\b/i],
  ['hourly-time-signal', /hourly time signal/i],
  ['led-light', /LED light|LED backlight/i],
  ['el-backlight', /EL backlight|electro-luminescent/i],
  ['super-illuminator', /super illuminator/i],
  ['auto-light', /auto light|auto-light/i],
  ['afterglow', /afterglow/i],
  ['radio-controlled', /radio-controlled|radio controlled|time calibration signal/i],
  ['bluetooth', /bluetooth|mobile link/i],
  ['tough-solar', /tough solar/i],
  ['power-saving', /power saving|power-saving/i],
  ['altimeter', /altimeter/i],
  ['barometer', /barometer/i],
  ['compass', /compass|bearing sensor/i],
  ['thermometer', /thermometer/i],
  ['step-counter', /step count/i],
  ['tide-graph', /tide graph/i],
  ['moon-data', /moon data|moon phase|moonphase/i],
  ['sunrise-sunset', /sunrise|sunset/i],
  ['shock-resistant', /shock[- ]resistan/i],
  ['mud-resistant', /mud[- ]resistan/i],
  ['magnetic-resistant', /magnetic[- ]resistan|anti-magnetic/i],
  ['screw-lock-crown', /screw[- ]lock crown|screw down crown/i],
  ['sapphire-crystal', /sapphire/i],
  ['mineral-glass', /mineral glass/i],
  ['calculator', /calculator/i],
  ['telememo', /telememo/i],
  ['databank', /databank|data bank/i],
  ['vibration-alarm', /vibration alarm/i],
  ['flash-alert', /flash alert/i],
]

function features(rows: Map<string, string>): string[] {
  const text = [...rows].map(([label, value]) => `${label}: ${value}`).join(' \n ')
  const found: string[] = []
  // A general tag is dropped where the specific one it contains was already
  // matched. "5 daily alarms" satisfies both `multi-alarm` and `alarm`, and
  // "Full auto-calendar" satisfies both `full-auto-calendar` and `calendar`;
  // writing both double-counts one fact in D26's density measure and reads as
  // two separate features on the card.
  const impliedBy: Record<string, string> = {
    alarm: 'multi-alarm',
    calendar: 'full-auto-calendar',
  }
  for (const [tag, pattern] of FEATURE_WORDS) {
    if (!pattern.test(text)) continue
    if (impliedBy[tag] && found.includes(impliedBy[tag])) continue
    found.push(tag)
  }
  return found
}

/** A stated module number, where the page has a row for one. */
function moduleOf(rows: Map<string, string>): string | undefined {
  for (const [label, value] of rows) {
    if (!/^module/i.test(label)) continue
    const number = /\b(\d{3,4})\b/.exec(value)
    if (number) return number[1]
  }
  return undefined
}

export interface Seeded {
  id: string
  ref: string
  url: string
  image: string | null
  fields: Record<string, unknown>
}

export function toModel(ref: string, url: string, rows: Map<string, string>, image: string | null): Seeded {
  const size = caseSize(rows)
  const grams = weight(rows)
  const stuff = material(rows)
  const caseFields = { ...(size ?? {}), ...(grams ? { weight_g: grams } : {}), ...(stuff ? { material: stuff } : {}) }
  const tags = features(rows)
  return {
    id: idOf(ref),
    ref,
    url,
    image,
    fields: {
      display: display(rows),
      movement: movement(rows),
      module: moduleOf(rows),
      case: Object.keys(caseFields).length > 0 ? caseFields : undefined,
      water_resistance_m: waterResistance(rows),
      features: tags.length > 0 ? tags : undefined,
    },
  }
}

/* ------------------------------------------------------------------------- *
 * YAML
 *
 * Written by hand rather than with a serialiser, because `catalog-src/` is not
 * prettier-formatted and must not be (CLAUDE.md): the committed files have a
 * house style — `features` on one line however long — and a library would
 * reflow every one of them into a different one.
 * ------------------------------------------------------------------------- */

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`

function modelYaml(model: Seeded): string {
  const lines = [`  - id: ${model.id}`, `    ref: ${model.ref}`]
  lines.push(`    source:`)
  lines.push(`      { url: ${quote(model.url)}, kind: official }`)
  const f = model.fields
  if (f.display) lines.push(`    display: ${f.display as string}`)
  if (f.movement) lines.push(`    movement: ${f.movement as string}`)
  if (f.module) lines.push(`    module: '${f.module as string}'`)
  if (f.case) {
    const c = f.case as Record<string, unknown>
    const parts = Object.entries(c).map(([k, v]) =>
      k === 'material' ? `${k}: ${quote(String(v))}` : `${k}: ${v}`,
    )
    lines.push(`    case: { ${parts.join(', ')} }`)
  }
  if (f.water_resistance_m !== undefined) lines.push(`    water_resistance_m: ${f.water_resistance_m}`)
  if (f.features) lines.push(`    features: [${(f.features as string[]).join(', ')}]`)
  if (model.image) {
    lines.push(`    image: ${model.id}`)
    lines.push(`    image_credit:`)
    lines.push(`      author: Casio Computer Co., Ltd.`)
    lines.push(`      licence: rights-reserved`)
    lines.push(`      url: ${quote(model.url)}`)
  }
  return lines.join('\n')
}

const HEADER = (series: string, line: string, count: number) => `# ${series.toUpperCase()} — seeded ${new Date().toISOString().slice(0, 10)} (M9), from Casio's own
# product pages (D52).
#
# EVERY FIELD ON EVERY ENTRY BELOW, AND EVERY PHOTOGRAPH, COMES FROM THE ONE PAGE
# NAMED IN ITS \`source\`. That is §10.6's one-page rule met exactly rather than
# approximately, and it is the reason this line could be seeded at all: a module
# guide describes a module, so \`case\`, \`water_resistance_m\` and the rest could
# never be written from one (D25), and no source names the module of a current
# ${line} reference anyway. The product page describes the reference.
#
# The page answers 403 on casio.com and 200 from the Internet Archive, which is a
# retrieval route and not a second source — the bytes are Casio's AEM markup, the
# Specifications accordion is server-rendered in them, and the \`/content/dam/\`
# image URL each entry credits is still served live by casio.com today.
#
# DELIBERATELY NOT WRITTEN:
#   * \`year\` — the page states no release date for the reference (D25).
#   * \`family\` — a judgement about how a watch looks, and a human's to make
#     (§10.6 guardrail 4a). Proposed, never written by the skill.
#   * any field the page does not state. ${count} reference${count === 1 ? '' : 's'} here; the rows
#     Casio printed differ between them, and an absent field means the page was
#     silent, not that the watch lacks it (D27).

series:
  id: ${series}
  name: ${series.toUpperCase()}
  line: ${line}

models:
`

/* ------------------------------------------------------------------------- *
 * CLI
 * ------------------------------------------------------------------------- */

const isMain = process.argv[1]?.endsWith('seed.ts') ?? false
if (isMain) {
  const [line, mode] = process.argv.slice(2)
  if (!line) {
    console.error('usage: seed.ts <line> [--survey | --write]')
    process.exit(1)
  }

  // The cache is the input. Nothing here reaches the network.
  //
  // **The capture is kept with its timestamp, and the best one is chosen by row
  // count.** Both halves matter. Choosing by body length would pick the newer,
  // emptier template (`archive.ts` documents the 53 KB page stating one row);
  // and losing the timestamp would write `source.url` for the *largest* capture
  // while the fields came from a different one — a citation pointing at a page
  // that does not say what the entry claims, which is the one error this whole
  // route exists to avoid.
  const captures = new Map<string, { html: string; timestamp: string; rows: Map<string, string> }[]>()
  for (const file of readdirSync(CACHE)) {
    const match = /^page-(.+)-(\d{14})\.html$/.exec(file)
    if (!match) continue
    const html = readFileSync(join(CACHE, file), 'utf8')
    const [, ref, timestamp] = match
    if (!captures.has(ref)) captures.set(ref, [])
    captures.get(ref)!.push({ html, timestamp, rows: specRows(html) })
  }

  const found = await snapshots(line)
  const readings: { ref: string; url: string; rows: Map<string, string>; image: string | null }[] = []
  const thin: string[] = []
  for (const [ref, candidates] of found) {
    const mine = captures.get(ref)
    if (!mine || mine.length === 0) continue

    /**
     * **An English capture beats a richer German one, and this is not a
     * preference about languages.** Casio's `de` pages state the same rows in
     * German — `Gehäusegröße (L x B x H)`, `Wasserdichtigkeit`, `Glas` — and
     * every reader below matches on the English label, so a German capture
     * yields an entry with six rows on the page and **no fields at all** while
     * still clearing the D50 row gate. It is not wrong, it is empty, and it
     * silently displaces a page that would have filled the table.
     *
     * Ranked rather than filtered: a reference whose only capture is German is
     * still seeded from it, sparsely and honestly, rather than dropped.
     */
    const scored = mine
      .map((capture) => {
        const url = candidates.find((c) => c.timestamp === capture.timestamp)?.url ?? ''
        return { ...capture, url, english: !/\/de\/watches\//.test(url) }
      })
      .filter((capture) => capture.url !== '')
      .sort((a, b) => Number(b.english) - Number(a.english) || b.rows.size - a.rows.size)
    const best = scored[0]
    if (!best) continue
    const { html, timestamp, rows } = best
    // **D50 applied at the point it bites.** A page stating one row — and the
    // 2024 template does exactly that for some references, `Surface treatment`
    // and nothing else — is not a specification table, and a reference behind
    // one is not seeded. It is not rejected forever: the crawler keeps looking
    // at the other captures, and this is re-run against a growing cache.
    if (rows.size < ENOUGH_ROWS) {
      if (rows.size > 0) thin.push(`${ref} (${rows.size})`)
      continue
    }
    // The URL of the capture actually read, not of the biggest one on file.
    const source = candidates.find((c) => c.timestamp === timestamp)
    if (!source) continue
    readings.push({ ref, url: source.url, rows, image: imageUrl(html, ref) })
  }

  console.log(`# ${line}: ${readings.length} of ${found.size} archived pages are cached and readable`)
  if (thin.length > 0) {
    console.log(`# ${thin.length} state too little to seed from (D50): ${thin.join(', ')}`)
  }

  if (mode === '--survey') {
    const labels = new Map<string, Set<string>>()
    for (const reading of readings)
      for (const [label, value] of reading.rows) {
        if (!labels.has(label)) labels.set(label, new Set())
        labels.get(label)!.add(value)
      }
    for (const [label, values] of [...labels].sort((a, b) => b[1].size - a[1].size)) {
      console.log(`\n${label}  (${values.size} distinct)`)
      for (const value of [...values].slice(0, 6)) console.log(`    ${value.slice(0, 150)}`)
    }
    process.exit(0)
  }

  const bySeries = new Map<string, Seeded[]>()
  const unreadable: string[] = []
  for (const reading of readings) {
    const model = toModel(reading.ref, reading.url, reading.rows, reading.image)

    /**
     * **A page we could not read a single field off is not seeded, whatever it
     * says.** This is D46's rule about the image-only operation chart, arrived at
     * from the other side: there the guide states no specifications, and here the
     * page states them in a language or under labels this reader does not know —
     * the German captures are the case that raised it, but the rule is not about
     * German. Either way the entry would carry `kind: official` and an empty
     * specification table, telling a reader **nobody has looked** while the page
     * it cites plainly did state something. That is a worse claim than absence.
     *
     * Reported by reference, because an audit can only report what is missing
     * from what was seeded — it cannot report a page nobody opened.
     */
    if (Object.values(model.fields).every((value) => value === undefined)) {
      unreadable.push(reading.ref)
      continue
    }

    const series = seriesOf(reading.ref)
    if (!bySeries.has(series)) bySeries.set(series, [])
    bySeries.get(series)!.push(model)
  }
  if (unreadable.length > 0) {
    console.log(
      `# ${unreadable.length} state specifications this reader cannot parse, so they are ` +
        `not seeded (D46): ${unreadable.join(', ')}`,
    )
  }

  const images: string[] = []
  for (const [series, models] of [...bySeries].sort((a, b) => b[1].length - a[1].length)) {
    models.sort((a, b) => a.ref.localeCompare(b.ref))
    const body = HEADER(series, line, models.length) + models.map(modelYaml).join('\n') + '\n'
    const dir = join(REPO, 'catalog-src', line)
    if (mode === '--write') {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${series}.yaml`), body)
    }
    for (const model of models) if (model.image) images.push(`${model.id}\t${model.image}`)
    console.log(`${series.padEnd(14)} ${String(models.length).padStart(3)} references`)
  }

  if (mode === '--write') {
    const list = join(CACHE, `${line}-images.tsv`)
    writeFileSync(list, images.join('\n') + '\n')
    console.log(`\nwrote ${bySeries.size} series to catalog-src/${line}/`)
    console.log(`${images.length} image URLs listed in ${list}`)
  }
}
