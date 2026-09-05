import type { Catalog, PublishedModel } from './schema.ts'
import { browsable, compareByRef } from './client.ts'
import { normalise, searchTextBuilder } from './searchText.ts'

/**
 * §7.1 / FR-2 — normalisation and the in-memory matcher.
 *
 * Search runs entirely in the browser against the catalogue already in memory
 * (D3), so there is no index to load, no request per keystroke and no ranking
 * server to disagree with. What is left is one question: **what counts as the
 * same reference**, and the answer is that punctuation does not count at all.
 *
 * A collector types `ga2100`, `GA-2100`, `ga 2100` or `Ga2100` and means one
 * thing (FR-2.2). Every one of those normalises to the same string here, and so
 * does the reference in the catalogue, so the match is an ordinary substring
 * test on a form neither side had to get right.
 */

/**
 * Lowercase, then keep only letters and digits. Hyphens, spaces, slashes and
 * dots all disappear, on both sides of the comparison.
 *
 * This is the whole of FR-2.2 and it is one line, which is worth stating: the
 * alternative — a list of the punctuation Casio uses, or a fuzzy distance —
 * would be more code and would also match things it should not. `GA-2100` and
 * `GA2100` are the same watch; `GA-2100` and `GA-2110` are not, and no amount
 * of edit distance knows the difference.
 */
// Re-exported rather than moved away, because it is half of FR-2.2 and every
// caller and test in this repo asks `search.ts` for it. The definition and the
// paragraph above it now live in `searchText.ts`, beside the one other thing
// that has to spell a watch the same way.
export { normalise } from './searchText.ts'

/**
 * The query, split on whitespace and normalised term by term. Every term has to
 * match (AND), which is what makes `f-91w blue` narrow rather than widen.
 *
 * `ga 2100` therefore matches two ways — as the single compact term `ga2100`
 * and as `ga` plus `2100` — and the second is deliberately the broader of the
 * two: it also reaches `GAX-2100`, which somebody typing a space between the
 * letters and the number plausibly meant.
 */
export function queryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map(normalise)
    .filter((term) => term.length > 0)
}

export interface SearchEntry {
  model: PublishedModel
  /** The normalised reference on its own — the ranking is mostly about this. */
  ref: string
  /**
   * Reference, name, module, series, series aliases, family, line, and the
   * edition with its partner and aliases — each normalised and joined by a
   * space. The separator is load-bearing: terms are normalised to letters and
   * digits only, so a space can never be matched by one, and `F-91W` followed by
   * `Watch` cannot accidentally answer `wwatch`.
   */
  text: string
}

export interface SearchIndex {
  entries: SearchEntry[]
}

/**
 * FR-2.1 — the fields a search sees. Family matching is the one that earns its
 * place: it is what makes *square* return DW-5600, GW-M5610 and GWX-5600 (D32),
 * the word collectors use reaching the codes they mean. A series' `aka` does
 * the same job one level down — *CasiOak*, *F91W*, *Marlin*.
 *
 * **The edition is the same argument a third time, and it is the strongest case
 * of the three** (D62). Nobody looking for the Pac-Man watch knows it is
 * `A168WEPC-7A`; *pacman* is the entire query, and before this it matched
 * nothing at all. The edition's `aka` is what makes it work in practice rather
 * than in principle: `normalise` keeps only ASCII letters and digits, so *Café
 * Kitsuné* indexes as `cafkitsun`, and the alias spelled *Cafe Kitsune* is the
 * only reason typing the name the way a keyboard produces it finds the watch.
 *
 * **Tombstones are not indexed.** A retired entry is reachable forever by its
 * URL (FR-3.6) and counted nowhere else (§6.2), and search is one of the places
 * "nowhere else" means: a duplicate entry surfacing beside the model that
 * replaced it is the exact confusion the tombstone was written to end. The
 * successor still answers the query, because it shares the reference that was
 * typed.
 */
export function buildSearchIndex(catalog: Catalog): SearchIndex {
  // The field list itself now lives in `searchText.ts`, so that the build can
  // compute the same string for §6.2's slim index without importing this module
  // — which reaches `client.ts` and `import.meta.env`, and would throw in Node.
  const textOf = searchTextBuilder(catalog)
  const entries = browsable(catalog.models).map((model) => ({
    model,
    ref: normalise(model.ref),
    text: textOf(model),
  }))

  return { entries }
}

/**
 * Four tiers, and they exist because the dropdown shows eight of them (FR-2.3).
 * With sixty-one models any order looks fine; with five hundred, typing `f-91w`
 * and getting a Databank that happens to sit in a series whose name contains
 * those letters — above the watch itself — is the failure this prevents.
 */
const RANK_EXACT_REF = 0
const RANK_REF_PREFIX = 1
const RANK_REF_CONTAINS = 2
const RANK_OTHER_FIELD = 3

function rank(entry: SearchEntry, compact: string): number {
  if (entry.ref === compact) return RANK_EXACT_REF
  if (entry.ref.startsWith(compact)) return RANK_REF_PREFIX
  if (entry.ref.includes(compact)) return RANK_REF_CONTAINS
  return RANK_OTHER_FIELD
}

/**
 * FR-2.1 — the matcher. Returns models best-match first, capped at `limit` where
 * one is given (the dropdown's eight); the results page passes none and gets
 * everything.
 *
 * An empty or all-punctuation query returns nothing rather than everything.
 * "Everything" is what the grid already shows, and a search field that answers
 * `-` with the whole catalogue reads as broken.
 */
export function searchCatalog(index: SearchIndex, query: string, limit?: number): PublishedModel[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []

  const compact = terms.join('')

  const hits = index.entries
    .filter((entry) => terms.every((term) => entry.text.includes(term)))
    .map((entry) => ({ entry, tier: rank(entry, compact) }))
    .sort((a, b) => a.tier - b.tier || compareByRef(a.entry.model, b.entry.model))
    .map((hit) => hit.entry.model)

  return limit === undefined ? hits : hits.slice(0, limit)
}
