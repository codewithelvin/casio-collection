import { Card, Col, Row, Skeleton, Typography, theme as antdTheme } from 'antd'
import { Link } from 'react-router-dom'
import type { PublishedLine } from '../catalog/schema.ts'
import { imageSources } from '../catalog/client.ts'
import { LINE_ACCENTS, LINE_GROUNDS, LINE_GROUND_OPACITY } from '../theme/tokens'
import { useUiStore } from './uiStore'
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
 * How much of the card the photograph is allowed to stand in, measured from the
 * right edge.
 *
 * **The left 54% is kept clear on purpose and it is the count that needs it.**
 * The name above it is `colorText` and could sit over anything; the count is
 * `colorTextDescription`, which clears AA by 0.2 of a ratio point on a plain
 * card (see `LINE_GROUND_OPACITY`). The longest count this catalogue can
 * currently print — `1016 models`, Vintage — measures about 62% of the body of
 * the narrowest card in the grid, a half-width column on a 360 px phone. That
 * does not fit in 54%, so the last word of it still crosses into the tile; what
 * this buys is that the *tile* is where the fade begins, not where the
 * photograph is already at full strength. Together with the ceiling on opacity
 * the worst case stays above 4.5:1 rather than relying on this alone.
 *
 * It is also what makes the ghost read as one: a watch that stopped politely at
 * the text would look like a small picture beside a label. This one is a ground.
 */
const GROUND_INSET = '54%'

/**
 * The photograph fades out towards the text rather than ending at a line.
 *
 * A hard edge down the middle of a card is a seam, and at these opacities a seam
 * is the only part of the treatment anybody would notice. The mask is on the
 * image itself and not painted over it as a scrim, which matters more than it
 * looks: a scrim would have to be the card's own background colour, and the card
 * has four of those — light, dark, and `hoverable`'s lift in each. Masking the
 * image knows nothing about any of them.
 */
const GROUND_MASK = 'linear-gradient(to left, #000 0%, #000 45%, transparent 92%)'

/**
 * Every card here holds a real count, because **a line with nothing in it is not
 * published** (D51). This used to read "Not catalogued yet" instead of "0" — a
 * true sentence about a card that should not have been on the page at all, and
 * the client's rule is that a category with nothing in it is worse than no
 * category. It is the same rule §8.4 already applied to a family of one, and the
 * build applies at the source rather than each grid hiding it separately.
 */
export function LineGrid({ lines }: { lines: readonly PublishedLine[] }) {
  const { token } = antdTheme.useToken()
  // Read rather than derived from a token, because the number this picks is a
  // contrast ceiling and the two themes fail in opposite directions. There is no
  // single opacity that is honest in both.
  const mode = useUiStore((state) => state.mode)

  return (
    <Row gutter={LINE_GUTTER}>
      {lines.map((line) => {
        const accent = LINE_ACCENTS[line.id] ?? token.colorPrimary
        // A line with no ground named for it renders exactly as it did before —
        // absent is a normal state here for the same reason it is everywhere
        // else in this catalogue, and a missing photograph is not a broken card.
        const ground = imageSources(LINE_GROUNDS[line.id])
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
                styles={{ body: { padding: 16, minHeight: BODY_HEIGHT, position: 'relative' } }}
                // `overflow: hidden` is what the rounded corner is made of once
                // there is something behind the text: the photograph is inset to
                // the border box and would otherwise square off the two corners
                // on its side. The box-shadow `hoverable` adds is painted outside
                // the border box and is not clipped by this.
                style={{ height: '100%', borderTop: `3px solid ${accent}`, overflow: 'hidden' }}
              >
                {ground ? (
                  /*
                    **The tile is a `div` and the photograph is an `img` inside
                    it, and that is not a wrapper for the sake of one.** An
                    absolutely positioned *replaced* element does not stretch to
                    its insets: with all four set and `width: auto`, CSS resolves
                    `auto` to the intrinsic 400 px and then drops the end inset
                    as over-constrained. The first build of this looked like a
                    broken image — a 400 px watch pinned at 54% and clipped to a
                    thumbnail-sized corner. A `div` is not replaced, so its auto
                    size does stretch, and `100%` inside it finally means the
                    tile rather than the card.
                  */
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      // Negative by the body's own padding, which is what lets
                      // the photograph reach the card's edges from inside its
                      // padding box — and bleed a little past the top and bottom,
                      // so a strap runs off the card rather than stopping on it.
                      insetBlock: -16,
                      insetInlineEnd: -16,
                      insetInlineStart: GROUND_INSET,
                      maskImage: GROUND_MASK,
                      WebkitMaskImage: GROUND_MASK,
                      // The whole card is one link. Nothing in here is a second
                      // target, a drag handle, or selectable text.
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  >
                    <img
                      src={ground.src}
                      // Decorative, so it has no accessible name — the wrapper is
                      // already `aria-hidden`. The card has exactly one
                      // accessible name, the stretched link's, and a second would
                      // make every line read as two things to a screen reader.
                      alt=""
                      // Seven of these on the front door is the one place in the
                      // product where an image is decoration rather than content,
                      // so it yields to everything: below the fold it is not
                      // fetched at all, and the ones above it queue last.
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      style={{
                        width: '100%',
                        height: '100%',
                        // `contain`, not `cover`. Cover would crop a watch case
                        // down its middle in a narrow column, which reads as a
                        // damaged image rather than a cropped one — and unlike a
                        // landscape, a watch has nothing to spare at its edges.
                        objectFit: 'contain',
                        objectPosition: 'center',
                        opacity: LINE_GROUND_OPACITY[mode],
                      }}
                    />
                  </div>
                ) : null}
                {/* Above the ground, and only because a positioned sibling would
                    otherwise paint over them. `zIndex` is deliberately not used:
                    the card's own stretched-link pattern lives in this stacking
                    context on the watch card, and starting a second numbering
                    here would be a thing to keep in step for no gain. */}
                <Typography.Text strong style={{ display: 'block', position: 'relative' }}>
                  {line.name}
                </Typography.Text>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: token.fontSizeSM, position: 'relative' }}
                >
                  {`${line.count} ${t('home.models')}`}
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
