/**
 * The controlled vocabularies — §10.2 check 6.
 *
 * A typo in a facet value does not fail: it becomes a **new facet value with a
 * count of one**, sitting in the filter bar under a name nobody will ever type,
 * hiding the watch it was meant to describe. That is the silent failure this
 * file exists to make impossible, so these lists are enforced by the schema at
 * parse time rather than checked afterwards — a bad value cannot be written into
 * the catalogue at all.
 *
 * The lists are deliberately the **facetable fields and only those** (FR-1.3:
 * year, display, movement, feature). Everything else a model carries — the case
 * material, the colourway, the module number — is spec-table decoration read by
 * a human, and a controlled vocabulary over free description buys nothing.
 *
 * These lists **grow**, and growing one is an explicit, reported step (§10.6
 * guardrail 4). The skill may never add a value silently, because a vocabulary
 * that grows on its own is the same thing as no vocabulary.
 */

/** D27 / FR-D1 — where a model's data was read from, shown to the reader. */
export const SOURCE_KINDS = ['official', 'retailer', 'community'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/**
 * D41 — the basis on which a catalogue photograph is published.
 *
 * A controlled list for the same reason the feature list is one, and with more
 * at stake: free text would let `CC BY-SA 4.0` and `CC-BY-SA 4.0` and
 * `Creative Commons` all be written for the same file, and a claim about the
 * right to use somebody's photograph is not a field to be casual about.
 *
 * The first five are **licences** — terms this site can meet by crediting the
 * author, naming the licence and linking to both. `own-work` is the site
 * owner's own photograph, which needs no permission and is still credited,
 * because a reader cannot tell the difference by looking.
 *
 * `rights-reserved` is **not a licence and does not pretend to be one**. It is
 * Casio's product photography, and photography published by a retailer or an
 * enthusiast archive, used under D11's position: non-commercial, attributed,
 * and taken down in full on request. Recording it as its own value rather than
 * leaving the field blank is the D27 argument applied to pictures — a catalogue
 * that shows its working can be corrected, and one that hides it cannot. The
 * reader is told which kind of thing they are looking at.
 */
export const IMAGE_LICENCES = [
  'cc-by-sa-4.0',
  'cc-by-sa-3.0',
  'cc-by-4.0',
  'cc0-1.0',
  'public-domain',
  'own-work',
  'rights-reserved',
] as const
export type ImageLicence = (typeof IMAGE_LICENCES)[number]

/**
 * Where each licence's own terms live. A credit that cannot be checked is
 * decoration. The two empty strings are the two values that have no terms to
 * link to — the owner's own photograph, and a file used under D11 rather than
 * under a grant.
 */
export const IMAGE_LICENCE_URLS: Record<ImageLicence, string> = {
  'cc-by-sa-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-sa-3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'cc-by-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'cc0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'public-domain': 'https://en.wikipedia.org/wiki/Public_domain',
  'own-work': '',
  'rights-reserved': '',
}

/**
 * Whether the photograph carries an actual grant. `Photograph **by** Ashley
 * Pomeroy` names a person who licensed their work; `Photograph **from** the
 * Digital Watch Library` names a page it was taken from. Saying "by" over a
 * file nobody granted would dress a borrowing up as a licence.
 */
export const isLicensed = (licence: string): boolean => licence !== 'rights-reserved'

/** What the dial shows. Three values, and they are exhaustive for Casio. */
export const DISPLAYS = ['digital', 'analog', 'ana-digi'] as const
export type Display = (typeof DISPLAYS)[number]

/**
 * How the watch is driven, in the terms a collector uses rather than a
 * horologist's. "Solar" is strictly a power source rather than a movement, but
 * *Tough Solar* is how Casio sells it and how a buyer searches for it, and a
 * facet exists to be recognised. A watch that is both solar and radio-synced is
 * one value, not two, because that is the combination Casio ships and names.
 */
export const MOVEMENTS = ['quartz', 'solar', 'solar-radio', 'automatic', 'manual'] as const
export type Movement = (typeof MOVEMENTS)[number]

/**
 * Feature tags. The rule for adding one: it has to be something a **product
 * page states plainly** and a collector would filter by. "Water resistant" is
 * not here because `water_resistance_m` is a number; "shock resistant" is,
 * because on a Casio it is a claim printed on the case rather than a measurement.
 *
 * Starting narrow is deliberate. A short list makes the skill stop and report
 * when it meets something new, which is where a human decides whether it is
 * genuinely a new feature or a new name for one already here.
 */
export const FEATURES = [
  // Timekeeping
  'world-time',
  'stopwatch',
  'countdown-timer',
  'alarm',
  'multi-alarm',
  'dual-time',
  'calendar',
  'full-auto-calendar',
  'hourly-time-signal',
  // Light
  'led-light',
  'el-backlight',
  'super-illuminator',
  'auto-light',
  'afterglow',
  // Synchronisation and power
  'radio-controlled',
  'bluetooth',
  // Beside `bluetooth` because it is the same kind of claim one generation
  // earlier: how the watch talks to something that is not a wrist. Two models
  // state it on their own source page — WQV-1's case prints IR BEAM and
  // HBX-100's says it "connected with a PC via infrared signals".
  'infrared',
  'tough-solar',
  'power-saving',
  // Sensors
  'altimeter',
  'barometer',
  'compass',
  'thermometer',
  'step-counter',
  // The gap `cpa-100`, `bp-100`, `jp-100`, `jp-200` and `chr-100` have each
  // reported in turn, now with the headcount this list asks for: four models
  // across four series, each stating it on its OWN source — BP-100, JP-100W and
  // JP-200W carry DWL's "I take your pulse" icon and CHR-100's case prints HEART
  // RATE. Named `pulse-sensor` rather than `heart-rate` because it has to cover
  // PULSECHECK, "pulse" and HEART RATE, which are three words for one sensor,
  // and because `step-counter` beside it is named for the instrument too.
  'pulse-sensor',
  'tide-graph',
  'moon-data',
  'sunrise-sunset',
  // Construction
  'shock-resistant',
  'mud-resistant',
  'magnetic-resistant',
  'screw-lock-crown',
  'sapphire-crystal',
  'mineral-glass',
  // The odd ones Casio is actually known for
  'calculator',
  'telememo',
  'databank',
  // The Wrist Camera, WQV-1 and WQV-10.
  //
  // THE ONLY VALUE HERE ADDED IN THE KNOWLEDGE THAT IT SHIPS AS A SINGLETON, so
  // the reason is on the record rather than left for `catalog:audit` to raise
  // against a future reader. Two models carry it and both cite it off their own
  // source page — but `camera` counts 1 in the published facets, because
  // `browsable` withholds a watch with no photograph and WQV-10 has none. That
  // is not an evidence problem and it cannot be fixed: Casio pictures the WQV-10
  // only inside its sibling's tile asset, 296 px wide against §10.3's 300 px
  // floor, measured.
  //
  // Kept anyway. The alternative is that the first camera anybody put on a wrist
  // is described as a digital watch with an alarm, permanently, because of a
  // photograph its sibling could not have. `vibration-alarm` is the other
  // documented singleton in this list.
  'camera',
  'vibration-alarm',
  'flash-alert',
] as const
export type Feature = (typeof FEATURES)[number]

/**
 * The fields a facet can be built from (FR-1.3), and therefore the fields whose
 * density D26 measures. `year` is in the list and is **exempt from the 60%
 * threshold** — it keeps an explicit *Unknown year* option instead (D5, D25),
 * which buys the same honesty a different way.
 *
 * `discontinued` is the one boolean here, and it is the only facet whose values
 * are not drawn from a vocabulary above: `true` and `false` are the whole domain,
 * and the reader never sees either word (`facetValueLabel` turns them into
 * *No longer listed by Casio* and *Currently listed*). It is also the only field
 * nobody reads off a page one watch at a time — D59 measures the whole
 * catalogue against Casio's sitemap in one pass, which is why its coverage sits
 * at 100% and it is the one control D26's gate never hides.
 */
export const FACET_FIELDS = ['year', 'discontinued', 'display', 'movement', 'features'] as const
export type FacetField = (typeof FACET_FIELDS)[number]

/**
 * The optional fields the coverage table reports on (§10.2 check 10). Wider
 * than the facet list on purpose: the point of the table is to show what a
 * seeding session actually filled in, and `image` and `module` are two of the
 * things most likely to be missing on a watch discontinued in 1997.
 */
export const COVERAGE_FIELDS = [
  'name',
  'year',
  'display',
  'movement',
  'module',
  'case',
  'water_resistance_m',
  'features',
  'colorway',
  'image',
] as const
export type CoverageField = (typeof COVERAGE_FIELDS)[number]

/** D26 — a facet renders only where this share of the models in view carry it. */
export const DENSITY_THRESHOLD = 0.6

/** §10.2 check 9 — a Casio quartz watch cannot predate the Casiotron. */
export const EARLIEST_YEAR = 1974
