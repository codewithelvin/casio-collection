import { Breadcrumb, Tag, Typography, theme as antdTheme } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { lineBySlug, modelsInSeries, seriesById, useCatalog } from '../../catalog/client.ts'
import { WatchGrid } from '../../ui/WatchGrid'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { LINE_ACCENTS } from '../../theme/tokens'
import { t } from '../../i18n/strings'

/** FR-1.2 — a responsive grid of every model in the series. */
export default function SeriesRoute() {
  const { line: slug, series: seriesId } = useParams<{ line: string; series: string }>()
  const { token } = antdTheme.useToken()
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
  const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[
          { title: <Link to="/">{t('home.linesHeading')}</Link> },
          { title: <Link to={`/line/${line.slug}`}>{line.name}</Link> },
          { title: series.name },
        ]}
      />

      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {series.name}
      </Typography.Title>

      <div style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">{`${models.length} ${t('home.models')}`}</Typography.Text>
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
        <WatchGrid models={models} accent={accent} />
      )}
    </div>
  )
}
