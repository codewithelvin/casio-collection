import { Card, Typography, theme as antdTheme } from 'antd'
import { Link } from 'react-router-dom'
import type { PublishedModel } from '../catalog/schema.ts'
import { imageSources } from '../catalog/client.ts'
import { LINE_ACCENTS } from '../theme/tokens'

/**
 * §8.6 — the watch card.
 *
 * **The typographic tile is a primary state, not a fallback.** Most of what
 * collectors own is discontinued and has no usable photograph, so a grid that is
 * entirely typographic is the normal case rather than the degraded one — and as
 * of M1c it is *the* case, since none of the sixty-one references carries an
 * image. That is the harshest of §8.6's three mixes and it is what ships today,
 * which is the good way round: the layout that has to survive no photographs is
 * the one being looked at every day.
 *
 * So it is designed rather than patched. The line accent tints the tile, the
 * reference is set large in the mono face that draws digits and hyphens to be
 * read as data, and the series sits beneath it. Never a broken-image icon, never
 * a grey box, never a silhouette pretending to be a watch.
 *
 * The reference is **not repeated** below a typographic tile. §8.6's diagram
 * puts the code under the image because the image cannot say it; a tile that has
 * just said it in 28 px does not need a second, smaller copy underneath.
 */
export function WatchCard({
  model,
  seriesName,
  accent,
}: {
  model: PublishedModel
  seriesName?: string | undefined
  accent?: string | undefined
}) {
  const { token } = antdTheme.useToken()
  const sources = imageSources(model.image)
  const lineAccent = accent ?? LINE_ACCENTS[model.line] ?? token.colorPrimary

  // Name and year are both optional and absent is normal (D27), so this line
  // renders whatever exists and disappears entirely when neither does.
  const meta = [model.name, model.year].filter(Boolean).join(' · ')

  const cover = sources ? (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      alt={model.ref}
      loading="lazy"
      decoding="async"
      // NFR-7 — explicit geometry so the grid does not reflow as images arrive.
      width={400}
      height={400}
      style={{ aspectRatio: '1 / 1', objectFit: 'contain', width: '100%', padding: 12 }}
    />
  ) : (
    <div
      style={{
        aspectRatio: '1 / 1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: 12,
        textAlign: 'center',
        // The accent as a soft ground. §8.3 keeps these colours from behind text
        // at full strength, so contrast stays AA in both themes with no dark
        // variant per line — a 8% tint is a ground, not a fill.
        background: `${lineAccent}14`,
      }}
    >
      <span
        style={{
          fontFamily: token.fontFamilyCode,
          fontSize: 'clamp(16px, 4.2vw, 28px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          color: token.colorText,
          wordBreak: 'break-word',
        }}
      >
        {model.ref}
      </span>
      {seriesName ? (
        <span style={{ fontSize: token.fontSizeSM, color: token.colorTextTertiary }}>
          {seriesName}
        </span>
      ) : null}
    </div>
  )

  return (
    <Link
      to={`/watch/${model.id}`}
      aria-label={model.ref}
      style={{ display: 'block', height: '100%', color: 'inherit' }}
    >
      <Card
        hoverable
        cover={cover}
        styles={{ body: { padding: 12 } }}
        style={{ height: '100%', borderTop: `3px solid ${lineAccent}` }}
      >
        {sources ? (
          <Typography.Text
            strong
            style={{ fontFamily: token.fontFamilyCode, display: 'block' }}
            ellipsis={{ tooltip: model.ref }}
          >
            {model.ref}
          </Typography.Text>
        ) : null}
        {meta ? (
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {meta}
          </Typography.Text>
        ) : null}

        {/* §8.6 puts the Owned One button here and FR-3.3 specifies it. It is
            deliberately absent until M5 builds ownership on top of M4's auth: a
            primary action that does nothing is worse than no action, and it is
            the one button this whole product is about. */}
      </Card>
    </Link>
  )
}
