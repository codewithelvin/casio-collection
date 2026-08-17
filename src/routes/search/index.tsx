import { useEffect, useMemo } from 'react'
import { Button, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useCatalog } from '../../catalog/client.ts'
import { buildSearchIndex, searchCatalog } from '../../catalog/search.ts'
import { applyViewState, NO_FILTERS } from '../../catalog/filters.ts'
import { WatchGrid } from '../../ui/WatchGrid'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { ReportMissing } from '../../ui/ReportMissing'
import { FilterBar } from '../../ui/FilterBar'
import { useViewState } from '../../ui/useViewState'
import { resultCount, t } from '../../i18n/strings'

/**
 * FR-2.3 — the full results grid behind the dropdown's *See all*.
 *
 * It carries the same filter bar as a series page, and D26 is what makes that
 * safe: density is measured over the models actually on screen, so a result set
 * spanning four lines shows a movement facet only if the watches that came back
 * happen to carry one. Nothing here had to know that in advance.
 */
export default function SearchRoute() {
  const [params] = useSearchParams()
  const term = params.get('q') ?? ''
  const [view, setView] = useViewState()
  const { data, isPending, isError, refetch } = useCatalog()

  const index = useMemo(() => (data ? buildSearchIndex(data) : null), [data])
  const hits = useMemo(() => (index ? searchCatalog(index, term) : []), [index, term])
  const shown = useMemo(() => applyViewState(hits, view), [hits, view])
  const seriesById = useMemo(
    () => new Map((data?.series ?? []).map((series) => [series.id, series])),
    [data],
  )

  useEffect(() => {
    const previous = document.title
    if (term) document.title = `${term} · ${t('app.name')}`
    return () => {
      document.title = previous
    }
  }, [term])

  if (isPending) return <SkeletonGrid />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  if (!term) {
    return <EmptyState title={t('search.noTerm.title')} body={t('search.noTerm.body')} />
  }

  return (
    <div>
      {/* The heading is the term itself. A page that says "Search results" and
          then makes you look for what you typed has spent its heading on the
          one thing the reader already knows. */}
      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {term}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{resultCount(shown.length)}</Typography.Paragraph>

      {/* FR-9.1 puts the report control in the search empty state, and FR-9.2
          pre-fills it with the term that produced nothing — which is what makes
          this the right place for it rather than an item in a menu. Somebody
          who has just been told the catalogue does not have their watch is the
          only person who wants this control. */}
      {hits.length === 0 ? (
        <EmptyState
          title={t('search.empty.title')}
          body={t('search.empty.body')}
          action={<ReportMissing prefill={term} />}
        />
      ) : (
        <>
          <FilterBar models={hits} state={view} onChange={setView} />
          {shown.length === 0 ? (
            <EmptyState
              title={t('filter.none.title')}
              body={t('filter.none.body')}
              action={
                <Button onClick={() => setView({ ...view, filters: NO_FILTERS })}>
                  {t('filter.clearAllFilters')}
                </Button>
              }
            />
          ) : (
            <WatchGrid models={shown} seriesById={seriesById} />
          )}
        </>
      )}
    </div>
  )
}
