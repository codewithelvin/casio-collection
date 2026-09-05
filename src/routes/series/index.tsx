import { Breadcrumb, Button, Tag, Typography, theme as antdTheme } from 'antd'
import { Link, useParams } from 'react-router-dom'
import {
  browsableSorted,
  lineBySlug,
  seriesById,
  useCatalogIndex,
  useSeriesModels,
} from '../../catalog/client.ts'
import { applyViewState, NO_FILTERS } from '../../catalog/filters.ts'
import { WatchGrid } from '../../ui/WatchGrid'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { FilterBar } from '../../ui/FilterBar'
import { useViewState } from '../../ui/useViewState'
import { LINE_ACCENTS } from '../../theme/palette.ts'
import { linePath } from '../../paths.ts'
import { t } from '../../i18n/strings'

/**
 * FR-1.2 — a responsive grid of every model in the series.
 *
 * §6.2's split, first screen moved. It reads **two small files instead of one
 * big one**: the index for the shape — which line this is, what the series is
 * called, its aliases — and `catalog/series/<id>.json` for the watches. The
 * index is already in the cache because the rail on this very page read it, so
 * in practice this screen costs 4 KB where it used to cost 149.6 KB.
 *
 * The two queries are deliberately not chained. `useSeriesModels` takes the id
 * straight from the URL rather than waiting to confirm the series exists, so
 * both requests are in flight together; a series that turns out not to exist
 * costs one wasted 404, which is cheaper than making every real series wait for
 * a round trip it did not need.
 */
export default function SeriesRoute() {
  const { line: slug, series: seriesId } = useParams<{ line: string; series: string }>()
  const { token } = antdTheme.useToken()
  const [view, setView] = useViewState()
  const index = useCatalogIndex()
  const file = useSeriesModels(seriesId)

  if (index.isPending || file.isPending) return <SkeletonGrid />
  if (index.isError || !index.data || file.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void index.refetch()
          void file.refetch()
        }}
      />
    )
  }

  const line = lineBySlug(index.data, slug)
  const series = seriesById(index.data, seriesId)

  // The series must exist *and* sit in the line the URL claims. Without the
  // second half, /line/edifice/f-91w would render the Vintage series under an
  // Edifice breadcrumb — a URL that looks authoritative and is wrong.
  //
  // `file.data` being null is the third way to get here and it is a 404 on the
  // series file, which means the URL names a series this catalogue does not
  // have — the same answer, reached from the other artefact.
  if (!line || !series || series.line !== line.id || !file.data) {
    return <EmptyState title={t('series.notFound.title')} body={t('series.notFound.body')} />
  }

  const models = browsableSorted(file.data.models)
  const shown = applyViewState(models, view)
  const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: <Link to="/">{t('home.linesHeading')}</Link> },
          { title: <Link to={linePath(line.slug)}>{line.name}</Link> },
          { title: series.name },
        ]}
      />

      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {series.name}
      </Typography.Title>

      <div style={{ marginBottom: 16 }}>
        {/* The count follows the filters. A heading that keeps saying eighteen
            while six cards are on screen is the page arguing with itself. */}
        <Typography.Text type="secondary">{`${shown.length} ${t('home.models')}`}</Typography.Text>
        {/* FR-2.1 makes these searchable; showing them here is how a reader
            learns that "Marlin" or "Napoleon Dynamite" is a word this site
            knows. Absent on most series, which is normal. */}
        {series.aka?.map((alias) => (
          <Tag key={alias} style={{ marginInlineStart: 8 }}>
            {alias}
          </Tag>
        ))}
      </div>

      {models.length === 0 ? (
        <EmptyState title={t('grid.empty')} />
      ) : (
        <>
          <FilterBar models={models} state={view} onChange={setView} />
          {/* FR-1.5 — a combination matching nothing is a designed state that
              names what is responsible. The chips above are that naming, and
              the button here is the one press out of it. */}
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
            <WatchGrid models={shown} accent={accent} />
          )}
        </>
      )}
    </div>
  )
}
