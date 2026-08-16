import type { Issue } from './integrity.ts'

/**
 * How a failing catalogue build reads.
 *
 * This is not decoration. The pipeline's whole job is to refuse bad data, and a
 * refusal nobody can act on gets worked around — the §10.2 number, the file, the
 * model id and what to do about it are all in every line for that reason.
 * Formatting lives here, pure and tested, so the scripts are the thin I/O
 * wrapper they should be.
 */

/** §6.2 — one file, 150 KB gzipped, with the split designed but not built. */
export const CATALOG_BUDGET_GZIP = 150 * 1024
/** §6.2 — either trigger reopens the split. Printed on every run. */
export const SPLIT_TRIGGER_GZIP = 250 * 1024
export const SPLIT_TRIGGER_MODELS = 2500

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** A Zod issue, structurally — so this module never imports Zod's internals. */
export interface SchemaIssue {
  code: string
  path: readonly PropertyKey[]
  message: string
  keys?: readonly string[]
}

const VOCABULARY_FIELDS = new Set(['features', 'display', 'movement'])

/** Follows a Zod issue path into the parsed document to recover what was written. */
function valueAt(document: unknown, path: readonly PropertyKey[]): unknown {
  let current = document
  for (const step of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[step]
  }
  return current
}

/**
 * Turns a schema rejection into the same shape as an integrity failure, so one
 * report renders both. §10.2 checks 6 and 7 are enforced here rather than in
 * `integrity.ts` — an unknown feature or a missing source cannot get past the
 * parse — and the numbers are attached back on so the output still reads against
 * the specification.
 *
 * `document` is the parsed YAML the issues came from, and it is worth the extra
 * argument: Zod's own message for a rejected enum lists every allowed value,
 * which for the feature vocabulary is thirty-odd words of noise wrapped around
 * the one word that matters — the one that was actually written.
 */
export function issuesFromSchema(
  file: string,
  issues: readonly SchemaIssue[],
  document?: unknown,
): Issue[] {
  return issues.map((issue) => {
    const path = issue.path.map(String)
    const field = path.filter((part) => !/^\d+$/.test(part)).at(-1) ?? ''
    const where = path.length > 0 ? `${file}: ${path.join('.')}` : file
    const written = valueAt(document, issue.path)

    if (VOCABULARY_FIELDS.has(field)) {
      const name = typeof written === 'string' ? `"${written}"` : 'that value'
      return {
        check: '6',
        where,
        message:
          `${name} is not in the ${field} vocabulary. It lives in src/catalog/vocabulary.ts, and a genuinely ` +
          `new value is added there in its own explicit step (§10.6 guardrail 4) — never as a side effect, ` +
          `or it becomes a facet with a count of one that nobody can find`,
      }
    }

    if (field === 'source' || path.includes('source')) {
      return {
        check: '7',
        where,
        message: `${issue.message}. Every model carries a URL and what kind of page it was (D27, FR-D1)`,
      }
    }

    if (issue.code === 'unrecognized_keys') {
      return {
        check: 'schema',
        where,
        message: `${issue.message}. Every object is strict — a misspelt field would otherwise publish as silence`,
      }
    }

    return { check: 'schema', where, message: issue.message }
  })
}

export function renderIssues(label: string, issues: readonly Issue[]): string {
  if (issues.length === 0) return ''
  const lines = issues.map((issue) => {
    // A §10.2 number where there is one; a bare label where the failure is the
    // parse itself and no numbered check ever got to run.
    const marker = /^\d/.test(issue.check) ? `§10.2 #${issue.check}` : issue.check
    return `  ${marker.padEnd(11)} ${issue.where}\n      ${issue.message}`
  })
  return [`${label} (${issues.length}):`, ...lines].join('\n')
}

export interface SizeReport {
  bytes: number
  gzipBytes: number
  models: number
}

/**
 * §10.2 check 8. Note what happens when this fails: the budget is 150 KB and the
 * split trigger is 250 KB, so **the budget always fails first** and the split can
 * never be reached by waiting. That is the right way round — the failure is the
 * moment somebody decides between trimming the data and building §6.2's split,
 * and it is a decision rather than a threshold quietly crossed.
 */
export function renderSize(report: SizeReport): { ok: boolean; text: string } {
  const ok = report.gzipBytes <= CATALOG_BUDGET_GZIP
  const lines = [
    `catalog.json: ${report.models} models, ${kb(report.bytes)} raw, ${kb(report.gzipBytes)} gzipped`,
    `  budget         ${kb(report.gzipBytes)} of ${kb(CATALOG_BUDGET_GZIP)} gzipped (NFR-4)`,
    `  split trigger  ${kb(report.gzipBytes)} of ${kb(SPLIT_TRIGGER_GZIP)} gzipped, ${report.models} of ${SPLIT_TRIGGER_MODELS} models (§6.2)`,
  ]
  if (!ok) {
    lines.push(
      '',
      `Over the ${kb(CATALOG_BUDGET_GZIP)} budget. §6.2 already has the answer written down:`,
      'split into a lightweight index, per-series files and a slim search index.',
      'A larger number is not one of the options.',
    )
  }
  return { ok, text: lines.join('\n') }
}
