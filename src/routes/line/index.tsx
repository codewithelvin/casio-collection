import { useMemo } from 'react'
import { Breadcrumb, Typography, theme as antdTheme } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { lineBySlug, modelsInSeries, seriesInLine, useCatalog } from '../../catalog/client.ts'
import type { PublishedSeries } from '../../catalog/schema.ts'
import { WatchGrid } from '../../ui/WatchGrid'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { LINE_ACCENTS } from '../../theme/tokens'
import { t } from '../../i18n/strings'

/**
 * FR-1.2 — a line without a series shows **every model in the line, grouped by
 * series with a sticky sub-heading**.
 *
 * The groups are ordered by size and then by name, rather than alphabetically
 * throughout. That is an editorial call and worth defending: forty-three of the
 * forty-four series seeded so far hold exactly one reference, so a plain
 * alphabetical order opens this page with twenty single-card sections before
 * reaching the one series that has eighteen. Largest-first shows the reader what
 * the line actually contains. Within a group the order is FR-1.4's default,
 * reference A→Z.
 */
export default function LineRoute() {
  const { line: slug } = useParams<{ line: string }>()
  const { token } = antdTheme.useToken()
  const { data, isPending, isError, refetch } = useCatalog()

  const line = data ? lineBySlug(data, slug) : undefined

  const groups = useMemo(() => {
    if (!data || !line) return []
    return seriesInLine(data, line.id)
      .map((series: PublishedSeries) => ({ series, models: modelsInSeries(data, series.id) }))
      .filter((group) => group.models.length > 0)
      .sort(
        (a, b) => b.models.length - a.models.length || a.series.name.localeCompare(b.series.name),
      )
  }, [data, line])

  if (isPending) return <SkeletonGrid />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  if (!line) {
    return <EmptyState title={t('line.notFound.title')} body={t('line.notFound.body')} />
  }

  const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 8 }}
        items={[{ title: <Link to="/">{t('home.linesHeading')}</Link> }, { title: line.name }]}
      />
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {line.name}
      </Typography.Title>

      {groups.length === 0 ? (
        <EmptyState title={t('line.empty.title')} body={t('line.empty.body')} />
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            {`${line.count} ${t('home.models')}`}
          </Typography.Paragraph>

          {groups.map(({ series, models }) => (
            <section key={series.id} style={{ marginBottom: 32 }}>
              {/* §8.5's sticky sub-heading. `top` clears the 64 px header, which
                  is itself sticky — without the offset the heading parks itself
                  underneath the header and is never seen. */}
              <div
                style={{
                  position: 'sticky',
                  top: 64,
                  zIndex: 5,
                  padding: '8px 0',
                  marginBottom: 8,
                  background: token.colorBgLayout,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Link to={`/line/${line.slug}/${series.id}`} style={{ color: 'inherit' }}>
                  <Typography.Text strong>{series.name}</Typography.Text>
                </Link>
                <Typography.Text
                  type="secondary"
                  style={{ marginInlineStart: 8, fontSize: token.fontSizeSM }}
                >
                  {String(models.length)}
                </Typography.Text>
              </div>

              <WatchGrid models={models} accent={accent} />
            </section>
          ))}
        </>
      )}
    </div>
  )
}
