import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { parseViewState, writeViewState, type ViewState } from '../catalog/filters.ts'

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
export function useViewState(): [ViewState, (next: ViewState) => void] {
  const [params, setParams] = useSearchParams()

  const state = useMemo(() => parseViewState(params), [params])

  const setState = useCallback(
    (next: ViewState) => setParams(writeViewState(params, next), { replace: true }),
    [params, setParams],
  )

  return [state, setState]
}
