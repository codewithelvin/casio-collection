import { coverageOf } from './coverage.ts'
import type { Issue } from './integrity.ts'
import { renderSize, type SizeReport } from './report.ts'
import type { CatalogPayload, PublishedModel } from './schema.ts'
import { COVERAGE_FIELDS, FACET_FIELDS, type CoverageField } from './vocabulary.ts'

/**
 * §10.5 — `/casio-catalog audit`. **Changes nothing.**
 *
 * The other five skill commands write files, and a command that writes files is
 * judged by `catalog:validate` refusing bad ones. This one is judged differently:
 * it is the command a human runs to decide *what to do next*, and everything it
 * reports is something the build is perfectly happy with. A model with no year,
 * a watch with no photograph, a feature carried by exactly one model — none of
 * those fail a check, and all of them are the catalogue quietly getting worse.
 *
 * So this is a report, not a gate, and the distinction is load-bearing in both
 * directions:
 *
 * - It **never exits non-zero for what it finds**. The gate is `catalog:validate`
 *   and there is exactly one of those (§10.6 guardrail 6). A second thing that
 *   can fail a build is a second thing to argue with.
 * - It **runs on a catalogue that is already failing**. An audit that refuses to
 *   speak until the build is green is useless precisely when it is needed, so a
 *   parse failure is one of the things it reports rather than a reason to stop.
 *
 * The five sections are the five things §10.5 names, in that order, and they are
 * numbered here so the output can be read against the specification the way a
 * §10.2 failure can.
 *
 * Everything below is pure. The filesystem, the manifest and the size of the
 * artefact all arrive as arguments, for the same reason as `integrity.ts`: D31's
 * 90% floor is on this folder, and a report that needs a directory on disk is a
 * report nobody writes the awkward test for.
 */

export interface AuditInput {
  /** Null when the source would not parse at all — sections 1, 2, 4 and 5 go quiet. */
  payload: CatalogPayload | null
  /** Basenames under `public/img/models`, e.g. `f-91w-1.webp`. */
  images: ReadonlySet<string>
  /** D2 — every id this catalogue has ever published. */
  publishedIds: readonly string[]
  /** Whatever refused to parse. §10.2 check 6 lands here rather than in a check. */
  parseFailures: readonly Issue[]
  /** Null when there was nothing to serialise. */
  size: SizeReport | null
}

/* --- 1. Unsourced fields ------------------------------------------------- */

export interface FieldGap {
  field: CoverageField
  missing: number
  total: number
  /** The models lacking it, sorted, so the report is a work list and not a statistic. */
  ids: string[]
}

export interface SeriesGaps {
  line: string
  series: string
  models: number
  gaps: FieldGap[]
  /** Models carrying nothing beyond the three fields D27 requires. */
  bare: string[]
}

/* --- 2. Missing images --------------------------------------------------- */

export interface ImageGaps {
  /** No photograph at all — the typographic card (§8.6) is what renders. */
  without: string[]
  /** Names a file that is not there at one width or both. Also §10.2 check 5. */
  broken: { id: string; missing: string[] }[]
  /**
   * A `.webp` under `public/img/models` that no model claims. Ids are permanent
   * (D2) so this is never a rename — it is a model that was never committed, or
   * an image built for an id that changed before it was ever published.
   */
  orphans: string[]
}

/* --- 3. Out-of-vocabulary facets ----------------------------------------- */

export interface Singleton {
  field: string
  value: string
}

export interface VocabularyGaps {
  /** Values the schema refused. They never reached the catalogue (§10.2 check 6). */
  rejected: Issue[]
  /**
   * Values that *are* in the vocabulary and are carried by exactly one model.
   * Guardrail 4's failure mode, arrived at legitimately: a filter option that
   * selects one watch is indistinguishable from a typo that got approved, and
   * neither is findable. `year` is excluded — a year with one model in it is
   * what a thin catalogue looks like, not a mistake.
   */
  singletons: Singleton[]
}

/* --- 5. Id drift --------------------------------------------------------- */

export interface IdDrift {
  /** Published, and no longer in the source. §10.2 check 2 — the serious one. */
  vanished: string[]
  /** In the source and not yet in the manifest: the next build publishes these. */
  pending: string[]
  /** Retired entries, reachable forever (FR-3.6) and counted nowhere. */
  tombstones: { id: string; replacedBy: string | null }[]
}

export interface AuditReport {
  models: number
  tombstoned: number
  sources: { official: number; retailer: number; community: number }
  unsourced: SeriesGaps[]
  images: ImageGaps
  vocabulary: VocabularyGaps
  size: SizeReport | null
  drift: IdDrift
}

function carriesNothing(model: PublishedModel): boolean {
  return coverageOf([model]).every((row) => row.present === 0)
}

function gapsFor(models: readonly PublishedModel[]): FieldGap[] {
  // `coverageOf` over one model answers "does this model carry that field", and
  // reusing it is deliberate: the alternative is a second definition of what
  // counts as carried, and the two would disagree about an empty feature list.
  const lacking = new Map<CoverageField, string[]>()
  for (const model of models) {
    for (const row of coverageOf([model])) {
      if (row.present === 0) lacking.set(row.field, [...(lacking.get(row.field) ?? []), model.id])
    }
  }

  return COVERAGE_FIELDS.map((field) => {
    const ids = lacking.get(field) ?? []
    return { field, missing: ids.length, total: models.length, ids: [...ids].sort() }
  })
    .filter((gap) => gap.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.field.localeCompare(b.field))
}

export function auditCatalogue(input: AuditInput): AuditReport {
  const all = input.payload?.models ?? []
  // Every count in this report is over browsable models. A tombstone is stock
  // that was withdrawn (§6.2) — auditing it for a missing photograph would be
  // asking somebody to go and find a picture of an entry that is retired.
  const browsable = all.filter((model) => !model.tombstone)

  const sources = { official: 0, retailer: 0, community: 0 }
  for (const model of browsable) sources[model.source.kind] += 1

  /* 1. Unsourced fields, per series — the level a seeding session works at. */
  const unsourced: SeriesGaps[] = []
  for (const series of input.payload?.series ?? []) {
    const inSeries = browsable.filter((model) => model.series === series.id)
    if (inSeries.length === 0) continue
    unsourced.push({
      line: series.line,
      series: series.id,
      models: inSeries.length,
      gaps: gapsFor(inSeries),
      bare: inSeries
        .filter(carriesNothing)
        .map((model) => model.id)
        .sort(),
    })
  }

  /* 2. Missing images. */
  const claimed = new Set<string>()
  const without: string[] = []
  const broken: ImageGaps['broken'] = []
  for (const model of browsable) {
    if (!model.image) {
      without.push(model.id)
      continue
    }
    claimed.add(model.image)
    const missing = [`${model.image}.webp`, `${model.image}@2x.webp`].filter(
      (name) => !input.images.has(name),
    )
    if (missing.length > 0) broken.push({ id: model.id, missing })
  }

  const orphans = [
    ...new Set(
      [...input.images]
        .filter((name) => name.endsWith('.webp'))
        .map((name) => name.replace(/(@2x)?\.webp$/, '')),
    ),
  ]
    .filter((base) => !claimed.has(base))
    .sort()

  /* 3. Out-of-vocabulary facets, and the ones that are in it but alone. */
  const singletons: Singleton[] = []
  for (const [field, summary] of Object.entries(input.payload?.facets ?? {})) {
    if (field === 'year') continue
    for (const entry of summary.values) {
      if (entry.count === 1) singletons.push({ field, value: entry.value })
    }
  }

  /* 5. Id drift against the manifest D2 makes the only integrity mechanism. */
  const present = new Set(all.map((model) => model.id))
  const known = new Set(input.publishedIds)

  return {
    models: browsable.length,
    tombstoned: all.length - browsable.length,
    sources,
    unsourced: unsourced.sort(
      (a, b) => a.line.localeCompare(b.line) || a.series.localeCompare(b.series),
    ),
    images: {
      without: without.sort(),
      broken: broken.sort((a, b) => a.id.localeCompare(b.id)),
      orphans,
    },
    vocabulary: {
      rejected: input.parseFailures.filter((issue) => issue.check === '6'),
      singletons: singletons.sort(
        (a, b) => a.field.localeCompare(b.field) || a.value.localeCompare(b.value),
      ),
    },
    size: input.size,
    drift: {
      vanished: input.publishedIds
        .filter((id) => !present.has(id))
        .slice()
        .sort(),
      pending: [...present].filter((id) => !known.has(id)).sort(),
      tombstones: all
        .filter((model) => model.tombstone)
        .map((model) => ({ id: model.id, replacedBy: model.tombstone?.replaced_by ?? null }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Rendering
 * ------------------------------------------------------------------------- */

const FACETS = new Set<string>(FACET_FIELDS)

/** Six ids, then a count. A work list nobody scrolls is a work list nobody reads. */
function idList(ids: readonly string[], limit = 6): string {
  if (ids.length === 0) return ''
  const shown = ids.slice(0, limit).join(', ')
  return ids.length > limit ? `${shown} +${ids.length - limit} more` : shown
}

function section(number: number, title: string, body: readonly string[]): string {
  return [`${number}. ${title}`, ...body.map((line) => `   ${line}`)].join('\n')
}

export function renderAudit(report: AuditReport): string {
  const blocks: string[] = []

  const kinds = Object.entries(report.sources)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`)
  blocks.push(
    [
      `${report.models} browsable model${report.models === 1 ? '' : 's'}` +
        (report.tombstoned > 0 ? `, ${report.tombstoned} tombstoned` : '') +
        (kinds.length > 0 ? ` — sourced ${kinds.join(', ')} (FR-D1)` : ''),
      'Nothing here fails a build. That is the point of it: every line below is',
      'something §10.2 is content with and a reader would not be.',
    ].join('\n'),
  )

  /* 1 */
  const gapLines: string[] = []
  for (const entry of report.unsourced) {
    gapLines.push(
      `${entry.line}/${entry.series} — ${entry.models} model${entry.models === 1 ? '' : 's'}`,
    )
    if (entry.gaps.length === 0) gapLines.push('  every optional field is filled')
    for (const gap of entry.gaps) {
      const mark = FACETS.has(gap.field) ? '·' : ' '
      const label = `${mark} ${gap.field}`.padEnd(22)
      gapLines.push(
        `  ${label}${String(gap.missing).padStart(4)} of ${gap.total}   ${idList(gap.ids)}`,
      )
    }
    if (entry.bare.length > 0) {
      gapLines.push(`  nothing but id, ref and source: ${idList(entry.bare)}`)
    }
  }
  if (gapLines.length === 0) gapLines.push('no models yet.')
  else
    gapLines.push(
      '',
      '· marks a field a filter is built from. Under 60% in view it does not render (D26).',
    )
  blocks.push(section(1, 'Unsourced fields — absent means nobody has found it (D27)', gapLines))

  /* 2 */
  const imageLines: string[] = []
  if (report.images.without.length > 0) {
    imageLines.push(
      `no photograph (${report.images.without.length}) — the typographic card renders, which is a`,
      'primary state and not a fallback (§8.6):',
      `  ${idList(report.images.without, 12)}`,
    )
  }
  for (const entry of report.images.broken) {
    imageLines.push(
      `${entry.id}: claims ${entry.missing.join(' and ')}, which is not there — §10.2 check 5 fails`,
    )
  }
  if (report.images.orphans.length > 0) {
    imageLines.push(`unclaimed files under public/img/models: ${idList(report.images.orphans, 12)}`)
  }
  if (imageLines.length === 0) imageLines.push('every model has an image at both widths.')
  blocks.push(section(2, 'Missing images', imageLines))

  /* 3 */
  const vocabLines: string[] = []
  for (const issue of report.vocabulary.rejected) {
    vocabLines.push(`refused at parse: ${issue.where}`)
  }
  for (const single of report.vocabulary.singletons) {
    vocabLines.push(`${single.field} "${single.value}" is carried by one model`)
  }
  if (vocabLines.length === 0)
    vocabLines.push('every facet value is in the vocabulary and shared by more than one model.')
  else {
    vocabLines.push(
      '',
      'A value carried by one model is a filter option that selects one watch, which',
      'reads the same whether it is real or a typo that got approved (guardrail 4).',
    )
  }
  blocks.push(section(3, 'Out-of-vocabulary facets', vocabLines))

  /* 4 */
  blocks.push(
    section(
      4,
      'Budget',
      report.size
        ? renderSize(report.size).text.split('\n')
        : ['nothing was serialised — the source did not parse.'],
    ),
  )

  /* 5 */
  const driftLines: string[] = []
  for (const id of report.drift.vanished) {
    driftLines.push(`"${id}" was published and is gone. A collection row still points at it (D2)`)
  }
  if (report.drift.pending.length > 0) {
    driftLines.push(
      `${report.drift.pending.length} id${report.drift.pending.length === 1 ? '' : 's'} the next build publishes for the first time — permanent from that moment:`,
    )
    driftLines.push(`  ${idList(report.drift.pending, 12)}`)
  }
  for (const stone of report.drift.tombstones) {
    driftLines.push(
      `tombstone ${stone.id}${stone.replacedBy ? ` → ${stone.replacedBy}` : ' (no successor)'}`,
    )
  }
  if (driftLines.length === 0) driftLines.push('the manifest and the source agree.')
  blocks.push(section(5, 'Id drift against .published-ids.json', driftLines))

  return blocks.join('\n\n')
}
