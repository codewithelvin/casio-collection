import { useMemo } from 'react'
import { Col, Row, Tabs, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/client.ts'
import {
  COLLECTION_SORTS,
  DEFAULT_COLLECTION_SORT,
  hasActiveFilters,
  type ViewState,
} from '../../catalog/filters.ts'
import type { Catalog, PublishedSeries } from '../../catalog/schema.ts'
import { useCollection } from '../../collection/mutations.ts'
import type { CollectionItem, CollectionStatus } from '../../collection/api.ts'
import {
  entriesWithStatus,
  joinCollection,
  modelsOf,
  viewEntries,
  type CollectionEntry,
} from '../../collection/join.ts'
import { FilterBar } from '../../ui/FilterBar'
import { WatchCard } from '../../ui/WatchCard'
import { UnlistedCard } from '../../ui/UnlistedCard'
import { GRID_GUTTER, GRID_SPANS } from '../../ui/WatchGrid'
import { EmptyState } from '../../ui/EmptyState'
import { ErrorState } from '../../ui/ErrorState'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { useViewState } from '../../ui/useViewState'
import { t } from '../../i18n/strings'

/**
 * §3.6 / §8.8 — **My Collection.**
 *
 * §6.5's three steps and nothing more: the catalogue is already in memory from
 * browsing (D1, D3), the rows are one request, and the join happens here in the
 * browser because D1 made a SQL join impossible on purpose. Both tabs read the
 * same rows and the same catalogue; the only difference between them is a
 * status.
 *
 * The grid and the filter bar are §3.1's, reused rather than reimplemented —
 * §8.8 is explicit that there should be one grid in the codebase and one set of
 * behaviours to learn. What this screen adds is a fourth sort (FR-6.2), a
 * status split, and FR-6.5's card for a row the catalogue can no longer explain.
 *
 * §8.8's three `Statistic` tiles and FR-6.6's export are **M10's** — the
 * milestone table puts the stats strip and the JSON/CSV export there, and the
 * counts a reader needs to see now are in the tab labels where FR-6.1 puts them.
 */
export default function CollectionRoute() {
  const catalog = useCatalog()
  const collection = useCollection()

  // FR-6.2's fourth order, declared by the screen rather than assumed by the
  // hook — `?sort=added` means nothing on a series page and must not parse there.
  const [state, setState] = useViewState(COLLECTION_SORTS, DEFAULT_COLLECTION_SORT)

  const entries = useMemo(
    () =>
      catalog.data && collection.data ? joinCollection(catalog.data, collection.data) : undefined,
    [catalog.data, collection.data],
  )

  if (catalog.isPending || collection.isPending) return <SkeletonGrid />

  if (catalog.isError || !catalog.data) {
    return <ErrorState onRetry={() => void catalog.refetch()} />
  }
  if (collection.isError || !entries) {
    return <ErrorState onRetry={() => void collection.refetch()} />
  }

  const owned = entriesWithStatus(entries, 'owned')
  const wishlist = entriesWithStatus(entries, 'wishlist')

  // FR-6.4 — the first run. Asserted on the whole collection rather than per
  // tab, because somebody with nothing anywhere needs a way in, not two empty
  // tabs to choose between.
  if (entries.length === 0) {
    return (
      <EmptyState
        title={t('collection.empty.title')}
        body={t('collection.empty.body')}
        action={<Link to="/">{t('collection.empty.browse')}</Link>}
      />
    )
  }

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t('route.collection.title')}
      </Typography.Title>

      <Tabs
        // FR-6.1 — the count is in the label. It counts what is *held*, never
        // what survived the filters: a tab reading "Owned (3)" over a grid of
        // three when eleven are owned would make the filter look like a loss.
        items={[
          {
            key: 'owned',
            label: `${t('collection.tab.owned')} (${owned.length})`,
            children: (
              <CollectionTab
                catalog={catalog.data}
                entries={owned}
                status="owned"
                state={state}
                onChange={setState}
              />
            ),
          },
          {
            key: 'wishlist',
            label: `${t('collection.tab.wishlist')} (${wishlist.length})`,
            children: (
              <CollectionTab
                catalog={catalog.data}
                entries={wishlist}
                status="wishlist"
                state={state}
                onChange={setState}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

function CollectionTab({
  catalog,
  entries,
  status,
  state,
  onChange,
}: {
  catalog: Catalog
  entries: CollectionEntry[]
  status: CollectionStatus
  state: ViewState
  onChange: (next: ViewState) => void
}) {
  const seriesById = useMemo(
    () => new Map<string, PublishedSeries>(catalog.series.map((series) => [series.id, series])),
    [catalog.series],
  )

  const active = hasActiveFilters(state.filters)
  const shown = viewEntries(entries, state.filters, active, state.sort)

  if (entries.length === 0) {
    return (
      <EmptyState
        title={t(status === 'owned' ? 'collection.empty.title' : 'collection.emptyWishlist.title')}
        body={t(status === 'owned' ? 'collection.empty.body' : 'collection.emptyWishlist.body')}
      />
    )
  }

  return (
    <>
      {/* FR-6.2 — "scoped to what the user holds". The bar is built from the
          models in this tab, before filtering, so D26's density rule answers a
          question about *their* watches. */}
      <FilterBar
        models={modelsOf(entries)}
        state={state}
        onChange={onChange}
        sorts={COLLECTION_SORTS}
      />

      {shown.length === 0 ? (
        <EmptyState title={t('filter.none.title')} body={t('filter.none.body')} />
      ) : (
        <Row gutter={GRID_GUTTER}>
          {shown.map((entry) => (
            <Col key={entry.item.model_id} {...GRID_SPANS}>
              {entry.model ? (
                <WatchCard model={entry.model} seriesName={seriesById.get(entry.model.series)?.name} />
              ) : (
                // FR-6.5 — never silently dropped. See UnlistedCard.
                <UnlistedCard item={entry.item as CollectionItem} />
              )}
            </Col>
          ))}
        </Row>
      )}
    </>
  )
}
