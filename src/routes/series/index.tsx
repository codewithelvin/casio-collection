import { Breadcrumb, Button, Tag, Typography, theme as antdTheme } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { lineBySlug, modelsInSeries, seriesById, useCatalog } from '../../catalog/client.ts'
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

/** FR-1.2 — a responsive grid of every model in the series. */
export default function SeriesRoute() {
  const { line: slug, series: seriesId } = useParams<{ line: string; series: string }>()
  const { token } = antdTheme.useToken()
  const [view, setView] = useViewState()
  const { data, isPending, isError, refetch } = useCatalog()

  if (isPending) return <SkeletonGrid />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  const line = lineBySlug(data, slug)
  const series = seriesById(data, seriesId)

  // The series must exist *and* sit in the line the URL claims. Without the
  // second half, /line/edifice/f-91w would render the Vintage series under an
  // Edifice breadcrumb — a URL that looks authoritative and is wrong.
  if (!line || !series || series.line !== line.id) {
    return <EmptyState title={t('series.notFound.title')} body={t('series.notFound.body')} />
  }

  const models = modelsInSeries(data, series.id)
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
