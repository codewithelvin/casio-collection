import type { BrowseModel } from './schema.ts'
import {
  COVERAGE_FIELDS,
  DENSITY_THRESHOLD,
  FACET_FIELDS,
  type CoverageField,
} from './vocabulary.ts'

/**
 * §10.2 check 10 — the coverage table, printed on every build.
 *
 * It exists so that D26's 60% threshold is **a number somebody reads** rather
 * than a silent gate. A facet that quietly stops rendering because a seeding
 * session diluted its line looks like a bug; the same thing with a table above
 * it looks like the data it is. The table is also the fastest honest answer to
 * "what did this session actually add", which is what M1c (D29) has to measure.
 *
 * The numbers here are **catalogue-wide**. The gate itself is applied per view
 * at render time, over the models on screen — that is the half of D26 that lets
 * Pro Trek show an altimeter facet while the catalogue as a whole is thin.
 */

export interface CoverageRow {
  field: CoverageField
  present: number
  total: number
  /** 0–1. `0` when there are no models at all, which reads as "nothing known". */
  share: number
}

export interface CoverageColumn {
  /** A line id, or `all`. */
  key: string
  label: string
  total: number
  rows: CoverageRow[]
}

function carries(model: BrowseModel, field: CoverageField): boolean {
  const value = model[field]
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

export function coverageOf(models: readonly BrowseModel[]): CoverageRow[] {
  return COVERAGE_FIELDS.map((field) => {
    const present = models.filter((model) => carries(model, field)).length
    return {
      field,
      present,
      total: models.length,
      share: models.length === 0 ? 0 : present / models.length,
    }
  })
}

/**
 * One column per line that has models, plus an `all` column. A line with nothing
 * in it is left out — a column of dashes says only that the catalogue is
 * not seeded, which the model count already said.
 */
export function coverageTable(
  models: readonly BrowseModel[],
  lines: readonly { id: string; name: string }[],
): CoverageColumn[] {
  const columns: CoverageColumn[] = []
  for (const line of lines) {
    const inLine = models.filter((model) => model.line === line.id)
    if (inLine.length === 0) continue
    columns.push({ key: line.id, label: line.id, total: inLine.length, rows: coverageOf(inLine) })
  }
  columns.push({ key: 'all', label: 'all', total: models.length, rows: coverageOf(models) })
  return columns
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}

export function renderCoverageTable(columns: CoverageColumn[]): string {
  const all = columns.find((column) => column.key === 'all')
  if (!all || all.total === 0) {
    return 'Coverage: no models yet. The catalogue is authored line by line (§10.4).'
  }

  const fieldWidth = Math.max(...COVERAGE_FIELDS.map((field) => field.length)) + 2
  const columnWidth = Math.max(9, ...columns.map((column) => column.label.length + 2))

  const head = [
    'field'.padEnd(fieldWidth),
    ...columns.map((column) => column.label.padStart(columnWidth)),
  ].join('')
  const counts = [
    'models'.padEnd(fieldWidth),
    ...columns.map((column) => String(column.total).padStart(columnWidth)),
  ].join('')

  const facetFields = new Set<string>(FACET_FIELDS)
  const body = COVERAGE_FIELDS.map((field, index) => {
    // A leading dot marks the fields a filter can be built from, because those
    // are the only rows the 60% rule has anything to say about.
    const label = `${facetFields.has(field) ? '·' : ' '} ${field}`.padEnd(fieldWidth)
    const cells = columns.map((column) =>
      percent(column.rows[index]?.share ?? 0).padStart(columnWidth),
    )
    return [label, ...cells].join('')
  })

  return [
    'Coverage — the share of models carrying each optional field (§10.2 check 10)',
    '',
    head,
    counts,
    ...body,
    '',
    `· marks a field a filter is built from. Under ${Math.round(DENSITY_THRESHOLD * 100)}% of the models`,
    '  in view it does not render at all (D26) — a filter over a sparse field hides',
    '  the models nobody recorded and reads as fact. Density is measured per view,',
    '  so these catalogue-wide numbers are the picture, not the gate.',
  ].join('\n')
}
