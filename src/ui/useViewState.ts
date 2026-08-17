import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DEFAULT_SORT,
  SORTS,
  parseViewState,
  writeViewState,
  type SortKey,
  type ViewState,
} from '../catalog/filters.ts'

/**
 * FR-1.6 / §7.2 — **the URL owns the filters, the sort and the search term, and
 * nothing duplicates them.** There is no store behind this hook and no local
 * copy inside a grid: a second home for this state is a second answer to "what
 * is on screen", and the first time they disagree it is a link that opens the
 * wrong view.
 *
 * The write is a `replace`, not a push. Ticking four year boxes would otherwise
 * bury the page a reader arrived from under four history entries, and *Back*
 * would walk them out one filter at a time.
 */
export function useViewState(
  /**
   * FR-6.2 — **which sorts this screen offers, and which one its bare URL
   * means.** The catalogue's three by default; `/collection` passes its four,
   * because *date added* is a fact about a row rather than about a watch. The
   * screen declaring its own vocabulary is what stops `?sort=added` parsing on
   * a series page into an order that quietly means reference A–Z.
   */
  sorts: readonly SortKey[] = SORTS,
  defaultSort: SortKey = DEFAULT_SORT,
): [ViewState, (next: ViewState) => void] {
  const [params, setParams] = useSearchParams()

  const state = useMemo(() => parseViewState(params, sorts, defaultSort), [params, sorts, defaultSort])

  const setState = useCallback(
    (next: ViewState) => setParams(writeViewState(params, next, defaultSort), { replace: true }),
    [params, setParams, defaultSort],
  )

  return [state, setState]
}
