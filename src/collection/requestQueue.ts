import type { BrowseModel } from '../catalog/schema.ts'
import type { CatalogRequestRow } from './api.ts'

/**
 * D22's queue, turned from rows into work — the pure half, so it is testable and
 * under D31's floor with the rest of this folder.
 *
 * **The interesting question is not "what did people ask for", it is "which of
 * these is actually missing".** 511 watches are in the catalogue and withheld
 * from every grid, facet, search result and count because they have no
 * photograph (D63). A visitor who searches for one of those finds nothing and
 * reports it as missing — correctly, from where they are standing. A queue that
 * showed the reference and stopped would send somebody to seed an entry that has
 * existed all along, and the seeding tool would refuse it as a duplicate at the
 * end of the walk rather than the start.
 *
 * So each reference is answered against the catalogue in memory, which every
 * screen already has (§6.5), and the answer is one of four different jobs.
 */
export type RequestVerdict =
  /** Not in the catalogue at all. The only verdict that means seeding. */
  | 'missing'
  /** In the catalogue, no photograph, withheld by D63. The job is a photograph. */
  | 'withheld'
  /** In the catalogue and visible. The reporter did not find it — a search or a
   *  naming problem, and a signal about the search rather than the catalogue. */
  | 'catalogued'
  /** A tombstone. The id is permanent (D2) and the entry is deliberately gone. */
  | 'withdrawn'

export interface QueuedRequest {
  /** The reference as the most recent reporter spelled it. */
  ref: string
  /**
   * How many distinct people asked.
   *
   * One row IS one person: `catalog_requests_user_ref_idx` is unique on
   * (user_id, upper(ref)), so the same account cannot appear twice. That is the
   * whole reason this number can be trusted without the queue returning a
   * `user_id` it has no other use for — see 0006.
   */
  askedBy: number
  /** The newest report's timestamp, ISO, straight from the row. */
  latest: string
  /** Non-empty notes, newest first. */
  notes: string[]
  /** Non-empty links, newest first, deduplicated. */
  links: string[]
  verdict: RequestVerdict
  /** Set for every verdict except `missing`, so the page can link to the watch. */
  modelId: string | null
}

/**
 * Uppercase and drop the separators.
 *
 * **This is a normalisation and deliberately not a fuzzy match.** `GA-2100-1A1`,
 * `ga2100 1a1` and `Ga-2100-1a1` are one reference typed three ways, and telling
 * a person otherwise wastes the walk. A *prefix* match is the other thing
 * entirely and is not done here: `A159WA-N1` and `A159W-N1` are different
 * watches whose photographs are byte-identical, which is how this codebase
 * learned that matching by prefix publishes the wrong watch. An unmatched
 * reference reads `missing`, a human looks, and that is the correct cost.
 */
export function normaliseRef(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function verdictFor(model: BrowseModel | undefined): RequestVerdict {
  if (!model) return 'missing'
  if (model.tombstone) return 'withdrawn'
  // The same test `browsable()` applies, and it has to stay the same test. A
  // page that decided withheld-ness for itself would drift from the one the
  // build uses, and drift in the direction of reporting work already done.
  return model.image ? 'catalogued' : 'withheld'
}

/**
 * Group the rows by reference and answer each one against the catalogue.
 *
 * Ordered by how many people asked, then by recency. That is the order the work
 * is worth doing in, and it is the only ordering signal the queue has now that
 * it carries no identities: four people asking for one reference is a stronger
 * claim than one person asking four times, which the unique index makes
 * impossible anyway.
 */
export function groupRequests(
  rows: readonly CatalogRequestRow[],
  models: readonly BrowseModel[],
): QueuedRequest[] {
  const byRef = new Map<string, BrowseModel>()
  for (const model of models) {
    const key = normaliseRef(model.ref)
    // First wins. Two published entries cannot share a normalised reference
    // today; if they ever do, the earlier one is the one the reporter most
    // likely meant and the page is a prompt for a human either way.
    if (!byRef.has(key)) byRef.set(key, model)
  }

  // Newest first on the way in, so "the most recent spelling" and "notes newest
  // first" both fall out of the iteration order rather than needing a second
  // sort. `catalog_request_queue()` already returns this order; sorting here as
  // well means the grouping does not silently depend on it.
  const ordered = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))

  const grouped = new Map<string, QueuedRequest>()
  for (const row of ordered) {
    const key = normaliseRef(row.ref)
    // A row whose reference normalises to nothing — punctuation, an emoji — is
    // still a row somebody filed, and dropping it silently is how a queue
    // reports itself as shorter than it is. It groups under its own raw text.
    const bucket = key === '' ? `raw:${row.ref}` : key

    let entry = grouped.get(bucket)
    if (!entry) {
      const model = byRef.get(key)
      entry = {
        ref: row.ref.trim(),
        askedBy: 0,
        latest: row.created_at,
        notes: [],
        links: [],
        verdict: verdictFor(model),
        modelId: model?.id ?? null,
      }
      grouped.set(bucket, entry)
    }

    entry.askedBy += 1
    const note = row.note?.trim()
    if (note) entry.notes.push(note)
    const link = row.link?.trim()
    if (link && !entry.links.includes(link)) entry.links.push(link)
  }

  return [...grouped.values()].sort(
    (a, b) => b.askedBy - a.askedBy || b.latest.localeCompare(a.latest),
  )
}

/** The four counts the screen leads with, so the shape of the queue is one line. */
export function countByVerdict(queue: readonly QueuedRequest[]): Record<RequestVerdict, number> {
  const counts: Record<RequestVerdict, number> = {
    missing: 0,
    withheld: 0,
    catalogued: 0,
    withdrawn: 0,
  }
  for (const entry of queue) counts[entry.verdict] += 1
  return counts
}
