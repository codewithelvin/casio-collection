import { Card, Col, Row, Typography, theme as antdTheme } from 'antd'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../catalog/client.ts'
import { ErrorState } from '../../ui/ErrorState'
import { SkeletonGrid } from '../../ui/SkeletonGrid'
import { LINE_ACCENTS } from '../../theme/tokens'
import { t } from '../../i18n/strings'

/**
 * The catalogue front door: the eight lines of D15 in editorial order, each with
 * its real model count.
 *
 * A line with nothing in it says **"Not catalogued yet"** rather than "0".
 * Those are different claims — one is about this catalogue and the other reads
 * as being about Casio — and seven of the eight lines are in that state today.
 * The card still links through, because the line page has a designed empty
 * state that explains it, and a dead card teaches nothing.
 */
export default function HomeRoute() {
  const { token } = antdTheme.useToken()
  const { data, isPending, isError, refetch } = useCatalog()

  if (isPending) return <SkeletonGrid count={8} />
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {t('app.name')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 620 }}>
        {t('home.lead')}
      </Typography.Paragraph>

      <Typography.Title level={4}>{t('home.linesHeading')}</Typography.Title>
      <Row gutter={[16, 16]}>
        {data.lines.map((line) => {
          const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary
          return (
            <Col key={line.id} xs={12} md={8} lg={6}>
              <Link to={`/line/${line.slug}`} style={{ display: 'block', color: 'inherit' }}>
                <Card
                  hoverable
                  styles={{ body: { padding: 16 } }}
                  style={{ height: '100%', borderTop: `3px solid ${accent}` }}
                >
                  <Typography.Text strong style={{ display: 'block' }}>
                    {line.name}
                  </Typography.Text>
                  {line.count > 0 ? (
                    <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {`${line.count} ${t('home.models')}`}
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                      {t('home.unseeded')}
                    </Typography.Text>
                  )}
                </Card>
              </Link>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}
