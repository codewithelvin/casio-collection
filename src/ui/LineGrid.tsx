import { Card, Col, Row, Skeleton, Typography, theme as antdTheme } from 'antd'
import { Link } from 'react-router-dom'
import type { PublishedLine } from '../catalog/schema.ts'
import { LINE_ACCENTS } from '../theme/tokens'
import { t } from '../i18n/strings'

/**
 * The front door's grid: the seven lines of D15 in editorial order, each with its
 * real model count.
 *
 * Its own spans, not the watch grid's. They agree up to `lg` and deliberately
 * stop there — the watch grid goes to six across at `xl` because a reference code
 * under a photograph stays legible that narrow, and a line name does not.
 */
export const LINE_SPANS = { xs: 12, md: 8, lg: 6 } as const
export const LINE_GUTTER: [number, number] = [16, 16]

/**
 * The card body at its tallest: three line boxes of 24 px — **two reserved for
 * the name whether it uses them or not**, one for the count — plus 16 px of
 * padding top and bottom.
 *
 * The same reasoning as §8.6's caption on the watch card, for the same reason it
 * was needed there. `Vintage / Casio Collection` wraps to two lines in a
 * half-width column at 360 px and `G-SHOCK` does not, so before this the first
 * row of the grid on a phone had a 24 px step in it. Reserving the space makes
 * the geometry a constant instead of a consequence of how long Casio's name for
 * a line happens to be.
 *
 * All three boxes are 24 because 24 is the base 16 px at AntD's 1.5 and **the
 * count does not get a shorter one**: `fontSizeSM` changes the glyphs, not the
 * inherited line-height, so a 14 px count still sits in a 24 px box. Reserving
 * 22 for it left the first row 2 px taller than the rest — the same fault one
 * order of magnitude down.
 */
const BODY_HEIGHT = 24 * 3 + 32

/**
 * A line with nothing in it says **"Not catalogued yet"** rather than "0". Those
 * are different claims — one is about this catalogue and the other reads as being
 * about Casio. The card still links through, because the line page has a designed
 * empty state that explains it, and a dead card teaches nothing.
 */
export function LineGrid({ lines }: { lines: readonly PublishedLine[] }) {
  const { token } = antdTheme.useToken()

  return (
    <Row gutter={LINE_GUTTER}>
      {lines.map((line) => {
        const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary
        return (
          <Col key={line.id} {...LINE_SPANS}>
            {/*
              `height: 100%` on the card is only a claim about its parent, and
              until this line the parent was this anchor at its content height —
              so the card sat as tall as its text inside a column stretched to
              the tallest card in the row, and left a gap under itself. The
              column stretches (it is a flex item of `.ant-row`), the anchor now
              passes that height through, and the card can finally fill it.
            */}
            <Link
              to={`/line/${line.slug}`}
              style={{ display: 'block', height: '100%', color: 'inherit' }}
            >
              <Card
                hoverable
                styles={{ body: { padding: 16, minHeight: BODY_HEIGHT } }}
                style={{ height: '100%', borderTop: `3px solid ${accent}` }}
              >
                <Typography.Text strong style={{ display: 'block' }}>
                  {line.name}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {line.count > 0 ? `${line.count} ${t('home.models')}` : t('home.unseeded')}
                </Typography.Text>
              </Card>
            </Link>
          </Col>
        )
      })}
    </Row>
  )
}

/**
 * §8.5 — the same geometry while loading, so nothing moves when the data
 * arrives. It is a separate skeleton from the watch grid's because the two grids
 * are not the same shape: a line card has no image tile, and the watch grid's
 * skeleton put a square one on the front door and then collapsed 400 px of it
 * the moment the catalogue landed. A skeleton that jumps is worse than none —
 * it is the exact failure the skeleton exists to prevent, performed on purpose.
 */
export function LineGridSkeleton({ count = 7 }: { count?: number }) {
  const { token } = antdTheme.useToken()

  return (
    <Row gutter={LINE_GUTTER} aria-busy aria-label={t('state.loading')}>
      {Array.from({ length: count }, (_, index) => (
        <Col key={index} {...LINE_SPANS}>
          <Card
            // The accent stripe in grey. It is 3 px on the real card, so leaving
            // it off here would put the skeleton 2 px short of what replaces it —
            // and the accent is precisely the thing not known until the
            // catalogue names the line, so a placeholder is the honest mark.
            style={{ borderTop: `3px solid ${token.colorFillSecondary}` }}
            styles={{ body: { padding: 16, minHeight: BODY_HEIGHT } }}
            className="cc-line-skeleton"
          >
            <Skeleton active title={false} paragraph={{ rows: 2, width: ['70%', '45%'] }} />
          </Card>
        </Col>
      ))}
    </Row>
  )
}
