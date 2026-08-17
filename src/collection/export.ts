import type { CollectionEntry } from './join.ts'

/**
 * FR-6.6 and FR-6.3 — **the export, and the summary strip.** Both are pure,
 * both are M10's, and both are here rather than in a component because a
 * transform that silently drops a row is the same class of failure as the join
 * that silently drops one (D31 covers this folder).
 *
 * The export exists for a specific reason worth keeping in view: this site asks
 * people to type their collection into it, and the honest exchange for that is
 * that they can take it out again whenever they like, in a format that outlives
 * the site. Which is also why the export carries the **reference**, not just the
 * `model_id` — an id is meaningful only to this catalogue, and a file nobody can
 * read without the site it came from is not really theirs.
 */

export interface ExportRow {
  model_id: string
  ref: string
  line: string
  series: string
  status: string
  note: string
  added: string
}

/**
 * An unlisted row (FR-6.5) exports too, with the fields the catalogue can no
 * longer supply left empty. Dropping it here would be the same silent loss the
 * collection screen refuses to make — and the export is the one copy somebody
 * might still have after this site is gone.
 */
export function toRows(entries: readonly CollectionEntry[]): ExportRow[] {
  return entries.map(({ item, model }) => ({
    model_id: item.model_id,
    ref: model?.ref ?? '',
    line: model?.line ?? '',
    series: model?.series ?? '',
    status: item.status,
    note: item.note ?? '',
    added: item.created_at,
  }))
}

export function toJson(entries: readonly CollectionEntry[]): string {
  return JSON.stringify(toRows(entries), null, 2)
}

export const CSV_COLUMNS: readonly (keyof ExportRow)[] = [
  'model_id',
  'ref',
  'line',
  'series',
  'status',
  'note',
  'added',
]

/**
 * RFC 4180 quoting, and the three characters that make it necessary are all
 * reachable from a note: a comma, a double quote, and a newline. FR-5.3 keeps
 * notes as plain text **with line breaks preserved**, so a multi-line note is
 * the ordinary case rather than the exotic one — an unquoted export would turn
 * one watch into three broken rows in every spreadsheet that opened it.
 *
 * The leading-character guard is separate and is not about CSV at all: a cell
 * beginning `=`, `+`, `-` or `@` is executed as a formula by Excel and Sheets,
 * so a note reading `=cmd|...` is a spreadsheet injection carried in a file the
 * user believes is their own data. Prefixing an apostrophe is what stops it,
 * and it is invisible once the cell is read as text.
 */
export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`
  return guarded
}

export function toCsv(entries: readonly CollectionEntry[]): string {
  const rows = toRows(entries)
  const lines = [CSV_COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))
  }
  // A trailing newline, because a file without one is a file some tools read as
  // truncated.
  return lines.join('\r\n') + '\r\n'
}

/* ------------------------------------------------------------------------- *
 * FR-6.3 — the summary strip.
 * ------------------------------------------------------------------------- */

export interface CollectionStats {
  owned: number
  wishlist: number
  /** Lines represented, most-held first. Only what is actually held. */
  byLine: { line: string; count: number }[]
  /** FR-6.5's rows, counted separately — they belong to no line. */
  unlisted: number
}

/**
 * §8.8's three tiles come out of this: owned, wishlist, and the length of
 * `byLine`. The breakdown is sorted by count because a list of eight lines in
 * catalogue order buries the one the reader actually collects.
 */
export function collectionStats(entries: readonly CollectionEntry[]): CollectionStats {
  const byLine = new Map<string, number>()
  let owned = 0
  let wishlist = 0
  let unlisted = 0

  for (const { item, model } of entries) {
    if (item.status === 'owned') owned += 1
    else wishlist += 1

    if (!model) {
      unlisted += 1
      continue
    }
    byLine.set(model.line, (byLine.get(model.line) ?? 0) + 1)
  }

  return {
    owned,
    wishlist,
    unlisted,
    byLine: [...byLine.entries()]
      .map(([line, count]) => ({ line, count }))
      .sort((a, b) => b.count - a.count || a.line.localeCompare(b.line)),
  }
}

/**
 * Triggers a download of a string the browser never fetched.
 *
 * A blob URL rather than a `data:` URI: S7's CSP has no `data:` in its default
 * or object sources, and a multi-kilobyte data URI is also a URL long enough to
 * be truncated by things that log URLs. Revoked on the next tick, because a
 * blob URL that is never revoked keeps its whole contents alive for the life of
 * the document.
 */
export function downloadFile(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
