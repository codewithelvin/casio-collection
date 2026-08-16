import { Card, Col, Row, Skeleton } from 'antd'
import { t } from '../i18n/strings'
import { GRID_GUTTER, GRID_SPANS } from './WatchGrid'

/**
 * §8.5 — cards render into a skeleton of **the same geometry** while loading, so
 * nothing moves when the data arrives. It imports the real spans rather than
 * repeating them: two copies of a column span are two things to keep in step,
 * and the symptom of them drifting is a layout jump at exactly the moment the
 * page is supposed to feel settled.
 *
 * The square block matches the card's `aspect-ratio: 1` tile, not a generic
 * rectangle, for the same reason.
 */
export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <Row gutter={GRID_GUTTER} aria-busy aria-label={t('state.loading')}>
      {Array.from({ length: count }, (_, index) => (
        <Col key={index} {...GRID_SPANS}>
          <Card
            styles={{ body: { padding: 12 } }}
            cover={<div style={{ aspectRatio: '1 / 1' }} />}
            style={{ height: '100%' }}
          >
            <Skeleton active title={false} paragraph={{ rows: 2, width: ['80%', '55%'] }} />
          </Card>
        </Col>
      ))}
    </Row>
  )
}
