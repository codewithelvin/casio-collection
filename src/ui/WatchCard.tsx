import { Card, Typography, theme as antdTheme } from 'antd'
import { Link } from 'react-router-dom'
import type { PublishedModel } from '../catalog/schema.ts'
import { imageSources } from '../catalog/client.ts'
import { OwnershipControls } from './OwnershipControls'
import { prefetchOnIntent } from './prefetch'
import { LINE_ACCENTS } from '../theme/palette.ts'

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
/**
 * The caption block, at its tallest: a reference line (14 px at AntD's 1.571
 * line-height) over a name-and-year line (12 px at 1.667), plus 12 px of
 * padding top and bottom. Every card reserves it whether it fills it or not.
 *
 * M5's controls sit below this and are the same height on every card, so they
 * add a constant rather than a variable — which is the property that matters.
 * The reason this number exists at all is that the *caption* was variable.
 */
const CAPTION_HEIGHT = 22 + 20 + 24

export function WatchCard({
  model,
  seriesName,
  accent,
  /**
   * §8.10 — on `/u/<handle>` the ownership controls are removed **at the
   * component level, not hidden with CSS**. A prop that stops them being
   * rendered is a different thing from a class that stops them being seen: the
   * second is still in the DOM, still focusable, and still pressable by anyone
   * who opens the inspector on somebody else's collection.
   */
  readOnly = false,
}: {
  model: PublishedModel
  seriesName?: string | undefined
  accent?: string | undefined
  readOnly?: boolean
}) {
  const { token } = antdTheme.useToken()
  const sources = imageSources(model.image)
  const lineAccent = accent ?? LINE_ACCENTS[model.line] ?? token.colorPrimary

  // Name and year are both optional and absent is normal (D27), so this line
  // renders whatever exists and disappears entirely when neither does.
  //
  // **The series joins it only on a photographed card**, and the condition is
  // the point rather than a special case: the typographic tile already sets the
  // series under the reference, so adding it here would print it twice on the
  // same card. On a photographed one there was nowhere for it to go at all —
  // which was invisible while every cross-series grid (search, the collection,
  // a profile, an edition) happened to be looking at unphotographed watches, and
  // is exactly the context those grids exist to supply. `seriesName` is only
  // passed by callers whose models do not share a series; a line or series grid
  // passes nothing and this line is unchanged there.
  const meta = [sources ? seriesName : undefined, model.name, model.year]
    .filter(Boolean)
    .join(' · ')

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
      // `height: auto` is load-bearing and its absence is invisible on a desktop
      // grid. The `height` attribute above resolves to a used height of 400 px,
      // which **wins over `aspect-ratio`** — so in a 170 px column on a phone the
      // cover stayed 400 px tall and letterboxed the watch inside half a screen
      // of empty card. Letting the height be computed puts the ratio back in
      // charge; the attributes still do their NFR-7 job of reserving the space
      // before the file arrives.
      style={{
        aspectRatio: '1 / 1',
        objectFit: 'contain',
        width: '100%',
        height: 'auto',
        padding: 12,
      }}
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
    <Card
      hoverable
      cover={cover}
      // §8.6 — a photograph card and a typographic card are **the same
      // height**, and until M3 that was only true by luck. A photograph card
      // captions two lines (the reference, then the name and year) where a
      // typographic one captions at most one, because the tile has already
      // set the reference in 28 px. One card a line taller than its
      // neighbours stretches the whole grid row and leaves the others with a
      // gap under them. Reserving the caption's height makes the geometry a
      // constant instead of a consequence of which watches got photographed.
      styles={{ body: { padding: 12, minHeight: CAPTION_HEIGHT } }}
      // `position: relative` is what the stretched link below is measured
      // against. See the comment on it — this line is half of that mechanism.
      style={{ height: '100%', borderTop: `3px solid ${lineAccent}`, position: 'relative' }}
    >
      {/*
        **The whole card is a link, and it is this one absolutely positioned
        anchor rather than a wrapper.**

        Until M5 the card was `<Link><Card/></Link>`, which was right while the
        card was pure content. FR-4.1 puts a button on it, and a `<button>`
        inside an `<a>` is invalid HTML that browsers are entitled to reparent —
        and is a keyboard trap regardless, because the press and the navigation
        are the same gesture.

        Stretching one link over the card instead keeps exactly one link with
        exactly one accessible name, leaves the controls as ordinary siblings,
        and needs no `preventDefault` on the way out of them. The controls sit
        above it in the stacking order; everything else sits under it and is
        therefore clickable as "open this watch".
      */}
      <Link
        to={`/watch/${model.id}`}
        aria-label={model.ref}
        // The watch route is lazily imported and React Router's `lazy` blocks the
        // navigation with no pending UI, so the first press of a session sat for
        // ~194 ms fetching the chunk with nothing on screen to say so. Warming it
        // on hover, touch or focus makes that press free.
        {...prefetchOnIntent}
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />

      {/**
       * **Truncated in CSS, and AntD's `ellipsis` prop is deliberately not
       * used.** This is a performance decision, not a styling one, and it was
       * found by profiling rather than by reading the docs.
       *
       * Any `ellipsis` prop — `true` as much as `{ tooltip }` — makes AntD run
       * this, once per element, inside a layout effect:
       *
       *     const em = document.createElement('em')
       *     el.appendChild(em)
       *     const a = el.getBoundingClientRect()
       *     const b = em.getBoundingClientRect()
       *     el.removeChild(em)
       *
       * Append, read, read, remove — per card. Every one forces a synchronous
       * layout of the whole document, which is textbook layout thrashing. A CPU
       * profile of one back navigation at a 4× throttle put
       * `getBoundingClientRect` at **23% of all samples**, called from React's
       * commit phase, and it was the single largest cost on the page — larger
       * than every image on it.
       *
       * Three CSS properties do the same job with no measurement and no DOM
       * churn. `title` keeps the full reference available as a native tooltip for
       * nothing, and the card's stretched link already carries
       * `aria-label={model.ref}` for anyone not using a pointer.
       */}
      {sources ? (
        <Typography.Text
          strong
          title={model.ref}
          style={{
            fontFamily: token.fontFamilyCode,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {model.ref}
        </Typography.Text>
      ) : null}
      {meta ? (
        // Truncated in CSS for the reason the reference above it is, and for a
        // second one: `CAPTION_HEIGHT` reserves this line once, and a caption
        // now carrying a series *and* a name *and* a year is long enough to
        // wrap on a narrow column — which would make one card taller than its
        // neighbours and stretch the whole grid row, the exact geometry that
        // constant exists to hold still.
        <Typography.Text
          type="secondary"
          title={meta}
          style={{
            fontSize: token.fontSizeSM,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meta}
        </Typography.Text>
      ) : null}

      {/* §8.6 and FR-4.1 — Owned One on every card in the grid, not only on the
          detail page. That is the whole shape of the product: browse a series,
          press the ones you have, never open a page you did not want. */}
      {readOnly ? null : (
        <div style={{ position: 'relative', zIndex: 2, marginTop: 10 }}>
          <OwnershipControls model={model} size="small" />
        </div>
      )}
    </Card>
  )
}
