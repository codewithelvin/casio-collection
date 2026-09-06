/**
 * Reading a ShockBase watch page (D74, revised 2026-09-06 by the client).
 *
 * D74 as first written let ShockBase state **identity and module and nothing
 * else** — every value came from the module manual. The client reversed the
 * field half the same day, and the revision is cleaner than the arrangement it
 * replaces: a ShockBase watch page states specifications about the **reference**,
 * so an entry sourced to it satisfies §10.6's one-page rule outright, instead of
 * carrying fields from a manual while citing a roster for identity.
 *
 * WHAT DID NOT CHANGE IS THE PHOTOGRAPH. ShockBase's own disclaimer says "This
 * website uses pictures from Casio websites. The copyright of these pictures is
 * owned by Casio" — a republisher describing itself. It cannot grant a licence
 * it does not hold, D41 refuses the shape, and nothing in this file reads,
 * derives or returns an image. That half of D74 stands.
 *
 * THE PAGE IS A CHECKLIST, WHICH IS WHY THE THIRD STATE MATTERS. Every function
 * ShockBase knows about is printed on every watch page; what distinguishes them
 * is `class="cellactive"` against `class="cellinactive"`. So there are three
 * states and not two, and this reader keeps them apart:
 *
 *   cellactive    the page says the watch HAS it        -> write the feature
 *   cellinactive  the page says the watch does NOT      -> write nothing
 *   absent        the page does not know the function   -> write nothing
 *
 * The two silences are different facts and neither is writable, but conflating
 * them would let a future reader treat "ShockBase has no row for it" as "the
 * watch lacks it". `absentFunctions` is returned so the difference stays visible.
 *
 * A FUNCTION WITH NO VOCABULARY VALUE IS REPORTED, NEVER INVENTED. `vocabulary.ts`
 * says the lists grow only as an explicit, reported step (§10.6 guardrail 4), so
 * an active function this file has no mapping for lands in `unmapped` and the
 * caller prints it. Carbon Core Guard, GPS, Dive Timer and DLC are all real
 * things ShockBase tracks and this catalogue has no word for; that is a decision
 * for a human, not a silent new facet value with a count of one.
 */

import { FEATURES, type Display, type Feature, type Movement } from './vocabulary.ts'

/* -------------------------------------------------------------------------- *
 * Mapping ShockBase's function keys onto the catalogue's vocabulary
 * -------------------------------------------------------------------------- */

/**
 * Keyed by the `function=` query parameter ShockBase links each cell to, which
 * is a stable identifier, rather than by the visible label, which carries
 * `<br>` tags and changes with the site's wording.
 */
export const FUNCTION_FEATURES: Readonly<Record<string, Feature>> = {
  world_time: 'world-time',
  auto_light: 'auto-light',
  bluetooth: 'bluetooth',
  vibration: 'vibration-alarm',
  mud_resistance: 'mud-resistant',
  magnetic_resistance: 'magnetic-resistant',
  altimeter: 'altimeter',
  barometer: 'barometer',
  compass: 'compass',
  thermometer: 'thermometer',
  step_tracker: 'step-counter',
  heart_rate: 'pulse-sensor',
  bpm_counter: 'pulse-sensor',
  tide_graph: 'tide-graph',
  moon_graph: 'moon-data',
  sunrise_sunset: 'sunrise-sunset',
}

/**
 * Active functions this catalogue deliberately has no word for.
 *
 * This set does NOT suppress reporting — an unmapped function is printed by the
 * caller whether or not it is listed here, because a run that quietly drops
 * facts about a watch is the thing `vocabulary.ts` exists to prevent. What the
 * set records is that a human has already looked at this key and decided not to
 * grow the vocabulary for it, so the next reader knows the difference between
 * *nobody has considered this* and *somebody has*. It also feeds
 * `absentFunctions`, which needs the full universe of keys this file knows.
 *
 * `data_memory` is here and not mapped to `databank` on purpose. The rule the
 * catalogue already follows is that a data store becomes `databank` only where
 * the page corroborates it — a Databank's memo store and a Sensor's altimeter
 * log are both "data memory" to ShockBase and are not the same feature. Mapping
 * it blind would file every Frogman under Databank.
 */
export const KNOWN_UNMAPPED = new Set([
  'alphagel',
  'carbon_guard_core',
  'dlc',
  'low_temp_resistance',
  'tough_mvt',
  'gps',
  'depth_meter',
  'dive_timer',
  'multi_date_format',
  'multi_day_format',
  'data_memory',
  // THESE TWO WERE MAPPED TO `stopwatch` AND `countdown-timer` AND THAT WAS
  // WRONG — caught by calibrating on GA-2100-1A, whose page marks both
  // INACTIVE. A GA-2100 plainly has a stopwatch and a countdown timer; what it
  // does not have is *several* of each, which is what ShockBase is tracking.
  // The label is `Multi Stop Watch`, and the word doing the work is "Multi".
  //
  // The consequence is worth stating because it decides what this source is
  // good for: ShockBase does not record whether a watch has a plain stopwatch,
  // a countdown timer, an hourly time signal or a full auto calendar at all.
  // Those four come from the module manual and ShockBase cannot replace them.
  'multi_stop_watch',
  'multi_timer',
])

/**
 * Function keys consumed by a reader of their own rather than by the table
 * above, so they are neither mapped nor missing. `tough_solar` and
 * `multi_band_` decide `movement` as well as a feature, which is why they
 * cannot be a plain key -> feature row; `solar_assisted` is deliberately
 * unmapped but is read by `readMovement` to suppress a wrong `quartz`.
 *
 * Listing them keeps the `unmapped` report meaningful: without this, the three
 * keys that were just FIXED would go on being printed as gaps forever, and a
 * report that cries wolf is one nobody reads the next time it is right.
 */
const HANDLED_ELSEWHERE = new Set(['tough_solar', 'multi_band_', 'multi_band', 'solar_assisted'])

/** Glass wording -> the two crystal features the vocabulary carries. */
const GLASS_FEATURES: ReadonlyArray<readonly [RegExp, Feature]> = [
  [/sapphire/i, 'sapphire-crystal'],
  [/mineral/i, 'mineral-glass'],
]

/** Light Type wording -> a light feature. Ordered; the first match wins. */
const LIGHT_FEATURES: ReadonlyArray<readonly [RegExp, Feature]> = [
  [/super\s*illuminator/i, 'super-illuminator'],
  [/\bLED\b/i, 'led-light'],
  [/\bEL\b/i, 'el-backlight'],
]

/* -------------------------------------------------------------------------- *
 * HTML reading
 * -------------------------------------------------------------------------- */

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The value cell that follows a label cell.
 *
 * ShockBase writes `<td align="right">Weight: </td><td>51 g</td>`, and
 * sometimes wraps the label in an anchor (`<a href="...">Glass:</a>`). Both
 * reduce to: find the label, take the next `<td>…</td>`. Anchored on the label
 * text rather than on position, because a table that gains a column is exactly
 * the change that silently shifts every positional read by one.
 */
export const labelledValue = (html: string, label: string): string | undefined =>
  labelledValues(html, label)[0]

/**
 * Every value cell carrying this label, in page order.
 *
 * `Bezel:` AND `Band:` EACH APPEAR TWICE, AND THE FIRST ONE IS A COLOUR. A
 * ShockBase page describes the band and bezel twice over — once for their
 * colour and once for their material — so `indexOf` took `Bezel: Black` and
 * wrote **Black** into `case.material` on nine of twelve GA-2100 entries in the
 * first plan run. It looked entirely healthy: a plausible string in a free-text
 * field that no vocabulary checks.
 *
 * The blocks are not distinguishable by markup, only by order, so the readers
 * below take the FIRST for colour and the LAST for material — and a material
 * that comes back equal to the colour is refused rather than written.
 */
export const labelledValues = (html: string, label: string): string[] => {
  const values: string[] = []
  let from = 0
  for (;;) {
    const at = html.indexOf(label, from)
    if (at < 0) break
    from = at + label.length
    const cell = /<td[^>]*>([\s\S]*?)<\/td>/i.exec(html.slice(from))
    if (!cell) break
    const text = stripTags(cell[1])
    if (text.length > 0) values.push(text)
  }
  return values
}

/** Every `function=` key on the page, split by whether its cell is active. */
export const readFunctions = (html: string): { active: string[]; inactive: string[] } => {
  const active: string[] = []
  const inactive: string[] = []
  const cell = /<td\s+class="(cellactive|cellinactive)"[^>]*>([\s\S]*?)<\/td>/gi
  for (const match of html.matchAll(cell)) {
    const key = /function=([a-z_]+)/i.exec(match[2])?.[1]
    if (!key) continue
    ;(match[1].toLowerCase() === 'cellactive' ? active : inactive).push(key)
  }
  return { active: [...new Set(active)], inactive: [...new Set(inactive)] }
}

/**
 * Solar and Multi Band are printed as bare text rather than as `function=`
 * links, so they need their own read. Both decide `movement`, which is why
 * getting them from the checklist rather than from the module number matters —
 * D25 forbids inferring a field from a neighbouring reference.
 */
export const readBareToggle = (html: string, label: RegExp): boolean | undefined => {
  const cell = /<td\s+class="(cellactive|cellinactive)"[^>]*>([\s\S]*?)<\/td>/gi
  for (const match of html.matchAll(cell)) {
    if (label.test(stripTags(match[2]))) return match[1].toLowerCase() === 'cellactive'
  }
  return undefined
}

/**
 * Whether a named `function=` key is active, inactive, or not on the page.
 *
 * SHOCKBASE STATES POWER TWO DIFFERENT WAYS AND THE FIRST VERSION OF THIS FILE
 * ONLY READ ONE. Some pages print `Solar` and `Multi Band / Wave Ceptor` as bare
 * text in a toggle cell; others link them as `function=tough_solar` and
 * `function=multi_band_`. Reading only the bare form missed **133 solar and 102
 * radio watches** across the G-SHOCK line — and `movement` is a facet, so those
 * would have been filed as plain quartz where they were filed at all.
 *
 * It surfaced because unmapped keys are *reported*: `tough_solar 133` in a run
 * summary is what a silent miss looks like when somebody bothered to print it.
 */
export const readFunctionState = (html: string, ...keys: string[]): boolean | undefined => {
  const cell = /<td\s+class="(cellactive|cellinactive)"[^>]*>([\s\S]*?)<\/td>/gi
  let seen: boolean | undefined
  for (const match of html.matchAll(cell)) {
    const key = /function=([a-z_]+)/i.exec(match[2])?.[1]
    if (!key || !keys.includes(key)) continue
    if (match[1].toLowerCase() === 'cellactive') return true
    seen = false
  }
  return seen
}

/** Solar, from either the linked form or the bare cell. */
const solarState = (html: string): boolean | undefined =>
  readFunctionState(html, 'tough_solar') ?? readBareToggle(html, /^solar$/i)

/** Radio sync, likewise. The trailing underscore in `multi_band_` is ShockBase's. */
const radioState = (html: string): boolean | undefined =>
  readFunctionState(html, 'multi_band_', 'multi_band') ??
  readBareToggle(html, /multi\s*band|wave\s*ceptor/i)

/* -------------------------------------------------------------------------- *
 * Field readers
 * -------------------------------------------------------------------------- */

/**
 * The release year.
 *
 * ShockBase prints `Release: August 2019` above a per-region table and credits
 * it to casio.com. D25 forbids a *guessed* year and §16 sanctions the other
 * route explicitly — a `year` read off the source the entry itself cites — which
 * is what this is once `source` names the ShockBase page. A page that says
 * `unknown`, or nothing, yields nothing.
 */
export const readYear = (html: string): number | undefined => {
  const value = labelledValue(html, 'Release:')
  if (!value) return undefined
  const year = /\b(19[7-9]\d|20[0-4]\d)\b/.exec(value)
  return year ? Number(year[1]) : undefined
}

/** `48.5 x 45.4 x 11.8 mm` — height, width, thickness, in that order. */
export const readSize = (
  html: string,
): { height_mm?: number; width_mm?: number; depth_mm?: number } => {
  const value = labelledValue(html, 'Size (HxWxT)')
  if (!value) return {}
  const size = /([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)/.exec(value)
  if (!size) return {}
  const [height_mm, width_mm, depth_mm] = size.slice(1, 4).map(Number)
  // A zero or a stray parse is not a measurement; §6.1 wants positives or nothing.
  return {
    ...(height_mm > 0 ? { height_mm } : {}),
    ...(width_mm > 0 ? { width_mm } : {}),
    ...(depth_mm > 0 ? { depth_mm } : {}),
  }
}

export const readWeight = (html: string): number | undefined => {
  const grams = /([\d.]+)\s*g\b/.exec(labelledValue(html, 'Weight:') ?? '')
  const value = grams ? Number(grams[1]) : NaN
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export const readWaterResistance = (html: string): number | undefined => {
  // The cell reads "Water Resistance:<br>200m" and is only meaningful when active.
  const cell = /<td\s+class="cellactive"[^>]*>([\s\S]*?)<\/td>/gi
  for (const match of html.matchAll(cell)) {
    const text = stripTags(match[1])
    if (!/water\s*resistance/i.test(text)) continue
    const metres = /(\d+)\s*m\b/i.exec(text)
    if (metres) return Number(metres[1])
  }
  return undefined
}

export const readDisplay = (html: string): Display | undefined => {
  const value = labelledValue(html, 'Timekeeping:')
  if (!value) return undefined
  const analog = /analog/i.test(value)
  const digital = /digital/i.test(value)
  if (analog && digital) return 'ana-digi'
  if (digital) return 'digital'
  if (analog) return 'analog'
  return undefined
}

/**
 * Movement, from the two power toggles.
 *
 * Solar plus Multi Band is `solar-radio`, which `vocabulary.ts` keeps as one
 * value because it is the combination Casio ships and names. Radio without
 * solar is a real and rarer thing (`GW-` predecessors on button cells) and the
 * vocabulary has no value for it, so it falls back to `quartz` and the
 * `radio-controlled` **feature** carries the fact — nothing is lost and nothing
 * is invented.
 */
export const readMovement = (html: string): Movement | undefined => {
  const solar = solarState(html)
  const radio = radioState(html)
  if (solar) return radio ? 'solar-radio' : 'solar'

  // `solar_assisted` is a third state this catalogue has no word for, on three
  // watches. Whatever it means, it is not "runs on a battery" — so rather than
  // fall through and assert `quartz`, the movement is left unwritten and the key
  // is reported. An unknown that renders as itself beats a confident wrong facet.
  if (readFunctionState(html, 'solar_assisted')) return undefined

  if (solar === undefined && radio === undefined) return undefined
  return 'quartz'
}

/* -------------------------------------------------------------------------- *
 * The whole page
 * -------------------------------------------------------------------------- */

// `exactOptionalPropertyTypes` is on, so `?:` alone forbids an explicit
// `undefined` — and every reader here returns `undefined` to mean "the page does
// not say", which is the whole point of the third state. The union is required.
export interface ShockbaseReading {
  ref?: string | undefined
  module?: string | undefined
  year?: number | undefined
  display?: Display | undefined
  movement?: Movement | undefined
  water_resistance_m?: number | undefined
  colorway?: string | undefined
  case: {
    material?: string | undefined
    width_mm?: number | undefined
    height_mm?: number | undefined
    depth_mm?: number | undefined
    weight_g?: number | undefined
  }
  features: Feature[]
  /** Active on the page, and this catalogue has no word for it (reported, never written). */
  unmapped: string[]
  /** Functions ShockBase does not print at all for this watch — the third state. */
  absentFunctions: string[]
}

/**
 * Case material, from the Bezel and Band cells.
 *
 * Written the way the existing catalogue writes it — `Resin`, or
 * `Resin / Stainless steel` where the two differ — because §6.1 keeps this as
 * free description rather than a controlled vocabulary, and matching what is
 * already there is what keeps the spec table readable.
 */
const readMaterial = (html: string, colour: string | undefined): string | undefined => {
  const last = (label: string): string | undefined => {
    const values = labelledValues(html, label)
    return values.length > 0 ? values[values.length - 1] : undefined
  }
  const parts = [last('Bezel:'), last('Band:')].filter(
    (p): p is string =>
      !!p &&
      !/^-+$/.test(p) &&
      // The colour block wearing the material block's label. Refusing here is
      // the second guard: taking the last cell already avoids it on the pages
      // measured, and this catches a page that carries only the colour block.
      p.toLowerCase() !== (colour ?? '').toLowerCase(),
  )
  if (parts.length === 0) return undefined
  return [...new Set(parts)].join(' / ')
}

/**
 * The colourway.
 *
 * Some pages carry a single `Color:` row and some describe the band and bezel
 * separately — GA-2100-1A has the first, GA-2100-1A2 the second — so where the
 * row is missing the FIRST `Bezel:` cell is the colour block and is used
 * instead. That is the same two-block fact as `readMaterial`, read from the
 * other end.
 */
const readColour = (html: string): string | undefined => {
  const stated = labelledValue(html, 'Color:')
  if (stated) return stated
  const bezel = labelledValues(html, 'Bezel:')
  return bezel.length > 1 ? bezel[0] : undefined
}

export const parseWatchPage = (html: string): ShockbaseReading => {
  const flat = html.replace(/\r?\n/g, ' ')
  const { active, inactive } = readFunctions(flat)

  const features = new Set<Feature>()
  const unmapped: string[] = []
  for (const key of active) {
    const feature = FUNCTION_FEATURES[key]
    if (feature) features.add(feature)
    else if (!HANDLED_ELSEWHERE.has(key)) unmapped.push(key)
  }

  // Power is a feature as well as half of `movement` — a solar-radio watch is
  // radio-controlled too — and both are stated in either of two markup forms.
  if (radioState(flat)) features.add('radio-controlled')
  if (solarState(flat)) features.add('tough-solar')

  for (const [pattern, feature] of GLASS_FEATURES) {
    if (pattern.test(labelledValue(flat, 'Glass:') ?? '')) {
      features.add(feature)
      break
    }
  }
  for (const [pattern, feature] of LIGHT_FEATURES) {
    if (pattern.test(labelledValue(flat, 'Light Type:') ?? '')) {
      features.add(feature)
      break
    }
  }

  // Alarms: 5 is `multi-alarm`; a single alarm is `alarm`. The cell is only
  // printed when the watch has one, so absence stays absence.
  const alarms = /Alarms:\s*(\d+)/i.exec(flat)
  if (alarms) features.add(Number(alarms[1]) > 1 ? 'multi-alarm' : 'alarm')

  // Every G-SHOCK is shock resistant, and it is the one claim printed on the
  // case rather than measured — but this reader only writes what the PAGE says,
  // so it is not added here. `shock-resistant` comes from the line, not from a
  // parse, and adding it blind would be this file inventing a field.

  const size = readSize(flat)
  const weight_g = readWeight(flat)
  const colorway = readColour(flat)
  const material = readMaterial(flat, colorway)

  const known = new Set([...Object.keys(FUNCTION_FEATURES), ...KNOWN_UNMAPPED])
  const seen = new Set([...active, ...inactive])

  return {
    ref: labelledValue(flat, 'Subseries:') ? /document\.title\s*=\s*"([^"]+)"/.exec(flat)?.[1] : undefined,
    module: labelledValue(flat, 'Module:'),
    year: readYear(flat),
    display: readDisplay(flat),
    movement: readMovement(flat),
    water_resistance_m: readWaterResistance(flat),
    colorway,
    case: { ...(material ? { material } : {}), ...size, ...(weight_g ? { weight_g } : {}) },
    features: [...features].sort((a, b) => FEATURES.indexOf(a) - FEATURES.indexOf(b)),
    unmapped: [...new Set(unmapped)].sort(),
    absentFunctions: [...known].filter((key) => !seen.has(key)).sort(),
  }
}
