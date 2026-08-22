import { DISPLAYS, FEATURES, MOVEMENTS } from '../catalog/vocabulary.ts'
import type { PublishedModel } from '../catalog/schema.ts'
import { t, type StringKey } from '../i18n/strings'

/**
 * **The suggestion a reader sends about one watch, as data.**
 *
 * Asked for by the client on 2026-08-22 and not in the specification, so it
 * carries no FR number — the decisions it leans on are the existing ones, named
 * below. This module is the half of the feature that has no network and no DOM:
 * the field list, the prefill, and the diff. It is pure because the two things
 * that go wrong here
 * are both silent — a field that quietly fails to prefill reads as *nobody has
 * this* and invites a reader to retype what the catalogue already knows, and a
 * diff that reports an unchanged field as changed sends the maintainer to look
 * at a watch nothing was said about.
 *
 * **Nothing in this file writes anything to the catalogue, and nothing
 * downstream of it does either.** The suggestion is emailed to the maintainer
 * and the catalogue changes when a human changes it, which is D22's rule for
 * the missing-reference queue applied to the same problem one level down: a
 * visitor's typing is a lead, not a source (rule 3, §10.8).
 */

/** How a field is edited, which is also how its value is compared. */
export type FieldKind = 'text' | 'number' | 'enum' | 'multi'

export interface SuggestionField {
  /** The path into a model, dotted for the `case` block. Also the form key. */
  key: string
  kind: FieldKind
  /** Reuses the specification table's own labels — one vocabulary, not two. */
  label: StringKey
  /** Rendered after the input, so a reader is not guessing millimetres. */
  unit?: string
  /** For `enum` and `multi`, the controlled vocabulary (rule 4). */
  options?: readonly string[]
}

/**
 * The specification table's fields, in the table's order.
 *
 * `year` is here and `year_source` is not, and neither is `image`, `source` or
 * `discontinued`. A reader can tell us a watch is a 1989 — they cannot tell us
 * which page this catalogue should cite for it, and `discontinued` is measured
 * over the whole catalogue at once by `availability.ts` rather than reported
 * (D59). A form that collects a field nobody can act on is a form that wastes
 * the one piece of goodwill it was given.
 */
export const SUGGESTION_FIELDS: readonly SuggestionField[] = [
  { key: 'year', kind: 'number', label: 'spec.year' },
  { key: 'display', kind: 'enum', label: 'spec.display', options: DISPLAYS },
  { key: 'movement', kind: 'enum', label: 'spec.movement', options: MOVEMENTS },
  { key: 'module', kind: 'text', label: 'spec.module' },
  { key: 'case.material', kind: 'text', label: 'spec.case.material' },
  { key: 'case.width_mm', kind: 'number', label: 'spec.case.width_mm', unit: 'mm' },
  { key: 'case.height_mm', kind: 'number', label: 'spec.case.height_mm', unit: 'mm' },
  { key: 'case.depth_mm', kind: 'number', label: 'spec.case.depth_mm', unit: 'mm' },
  { key: 'case.weight_g', kind: 'number', label: 'spec.case.weight_g', unit: 'g' },
  { key: 'water_resistance_m', kind: 'number', label: 'spec.water_resistance_m', unit: 'm' },
  { key: 'colorway', kind: 'text', label: 'spec.colorway' },
  { key: 'features', kind: 'multi', label: 'spec.features', options: FEATURES },
]

export interface SuggestionDraft {
  /** Every field but `features`, as the string its input holds. */
  values: Record<string, string>
  features: string[]
  note: string
  link: string
  email: string
}

/** One field the reader actually changed, with both sides of it. */
export interface FieldChange {
  key: string
  label: StringKey
  /** What the catalogue says today. Empty string where it says nothing. */
  from: string
  to: string
}

/**
 * The same change on its way out, with the label **translated**.
 *
 * The diff carries a `StringKey` because that is what the form would render;
 * the email carries words, because the person reading it is reading an email
 * and not a component. Sending `spec.case.width_mm` to somebody's inbox is the
 * kind of small, permanent ugliness that never gets fixed once it ships.
 */
export interface SuggestedChange {
  key: string
  label: string
  from: string
  to: string
}

export interface Suggestion {
  /** First in the payload and first in the subject line — the client asked for
   *  the reference so a suggestion can be matched to a watch at a glance. */
  ref: string
  modelId: string
  line: string
  series: string
  /** The page the reader was looking at, so the maintainer can open it. */
  url: string
  changes: SuggestedChange[]
  note: string
  link: string
  email: string
}

/** The model's own value for a field, as the string an input would hold. */
export function currentValue(model: PublishedModel, key: string): string {
  if (key === 'features') return (model.features ?? []).join(', ')
  const [head, tail] = key.split('.')
  const value = tail
    ? (model.case as Record<string, unknown> | undefined)?.[tail]
    : (model as unknown as Record<string, unknown>)[head!]
  return value === undefined || value === null ? '' : String(value)
}

/**
 * The client's "if there already spec fill them to corresponding input".
 *
 * Every field the model carries starts filled, and every field it does not
 * starts empty — which makes the form a picture of what D27 left unknown. The
 * gaps are the ask.
 */
export function draftFromModel(model: PublishedModel): SuggestionDraft {
  const values: Record<string, string> = {}
  for (const field of SUGGESTION_FIELDS) {
    if (field.kind === 'multi') continue
    values[field.key] = currentValue(model, field.key)
  }
  return { values, features: [...(model.features ?? [])], note: '', link: '', email: '' }
}

/**
 * Normalised for comparison, not for display. `42.8` and ` 42.80 ` are the same
 * claim about a case, and reporting them as a change would send somebody to
 * re-read a page that already agrees with us.
 */
function normalise(kind: FieldKind, raw: string): string {
  const trimmed = raw.trim()
  if (kind !== 'number' || trimmed === '') return trimmed
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? String(parsed) : trimmed
}

/** Fields whose numeric input is not a number. The form refuses to send these. */
export function invalidFields(draft: SuggestionDraft): string[] {
  return SUGGESTION_FIELDS.filter((field) => {
    if (field.kind !== 'number') return false
    const raw = (draft.values[field.key] ?? '').trim()
    if (raw === '') return false
    const parsed = Number(raw)
    return !Number.isFinite(parsed) || parsed < 0
  }).map((field) => field.key)
}

/** Only what the reader touched, each with what the catalogue says today. */
export function changedFields(model: PublishedModel, draft: SuggestionDraft): FieldChange[] {
  const changes: FieldChange[] = []
  for (const field of SUGGESTION_FIELDS) {
    const from = currentValue(model, field.key)
    const to =
      field.kind === 'multi'
        ? // Order is not a change: a reader who ticks the same features in a
          // different order has told us nothing new.
          [...draft.features].sort().join(', ')
        : normalise(field.kind, draft.values[field.key] ?? '')
    const before =
      field.kind === 'multi' ? from.split(', ').filter(Boolean).sort().join(', ') : from
    if (to === before) continue
    changes.push({ key: field.key, label: field.label, from, to })
  }
  return changes
}

/**
 * Whether there is anything worth sending. An empty form is not a suggestion,
 * and a Send that posts one would put an email in front of the maintainer that
 * says nothing at all — the D46 argument, applied to somebody's inbox.
 */
export function isSendable(model: PublishedModel, draft: SuggestionDraft): boolean {
  if (invalidFields(draft).length > 0) return false
  return changedFields(model, draft).length > 0 || draft.note.trim() !== ''
}

export function buildSuggestion(
  model: PublishedModel,
  draft: SuggestionDraft,
  url: string,
): Suggestion {
  return {
    ref: model.ref,
    modelId: model.id,
    line: model.line,
    series: model.series,
    url,
    changes: changedFields(model, draft).map((change) => ({ ...change, label: t(change.label) })),
    note: draft.note.trim(),
    link: draft.link.trim(),
    email: draft.email.trim(),
  }
}
