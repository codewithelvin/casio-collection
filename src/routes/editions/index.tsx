import { Card, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useCatalogIndex } from '../../catalog/client.ts'
import { ErrorState } from '../../ui/ErrorState'
import { EmptyState } from '../../ui/EmptyState'
import { LineGridSkeleton } from '../../ui/LineGrid'
import { editionPath } from '../../paths.ts'
import { editionCount, t } from '../../i18n/strings'

/**
 * D62 — the editions index: every collaboration and limited release that holds a
 * catalogued reference.
 *
 * **It reads the index, not the catalogue**, for the same reason the front door
 * does: this page renders a name, a partner and a count per edition and names no
 * reference, so waiting on 2 872 models to draw eight cards would be the exact
 * cost §6.2's split exists to remove.
 *
 * Every card here holds a real count, because an edition nothing is in is not
 * published (`buildCatalog`). That is the line rule and the family rule a third
 * time, and it is what lets this page have no "not catalogued yet" state: an
 * edition somebody has researched but not yet seeded references for is a warning
 * on the build, not a card with a zero on it.
 */
export default function EditionsRoute() {
  const { data, isPending, isError, refetch } = useCatalogIndex()

  if (isPending) return <LineGridSkeleton count={6} />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>
        {t('editions.heading')}
      </Typography.Title>
      {/* Capped, because this is a paragraph of prose rather than a label and a
          measure that runs the width of a desktop grid is a measure nobody
          finishes. */}
      <Typography.Paragraph type="secondary" style={{ maxWidth: 640 }}>
        {t('editions.lead')}
      </Typography.Paragraph>

      {data.editions.length === 0 ? (
        <EmptyState title={t('edition.empty.title')} body={t('edition.empty.body')} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {data.editions.map((edition) => (
            <Link key={edition.id} to={editionPath(edition.slug)}>
              <Card hoverable size="small" style={{ height: '100%' }}>
                <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4 }}>
                  {edition.name}
                </Typography.Title>
                {/* The partner is the fact that makes an edition an edition, so
                    it is shown before the count rather than after it. Absent on
                    an anniversary release, and the row disappears with it (D27)
                    rather than rendering a label with nothing after it. */}
                {edition.partner ? (
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
                    {`${t('edition.withPartner')} ${edition.partner}`}
                  </Typography.Paragraph>
                ) : null}
                <Typography.Text type="secondary">{editionCount(edition.count)}</Typography.Text>
                {edition.year ? <Tag style={{ marginInlineStart: 8 }}>{edition.year}</Tag> : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
