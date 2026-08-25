import { Link } from 'react-router-dom'
import type { PublishedLine } from '../catalog/schema.ts'
import { imageSources } from '../catalog/client.ts'
import {
  EDITIONS_GROUND,
  LINE_ACCENTS,
  LINE_GROUNDS,
  LINE_GROUND_OPACITY,
} from '../theme/palette.ts'
import { useUiStore } from './uiStore'
import { useSettled } from './useSettled'
import { editionsTotal, t } from '../i18n/strings'

/**
 * The front door's grid: the seven lines of D15 in editorial order, each with its
 * real model count.
 *
 * **All of the geometry is in `shell.css` now (§12).** It was AntD's
 * `Row`/`Col`/`Card`, and this is the page Lighthouse loads — so those three plus
 * `Typography` and `Skeleton` were what stood between a visitor and the first
 * paint of the site's front door. `.cc-line-grid` is the same two, three and four
 * across that `xs=12 md=8 lg=6` was, as one grid declaration; `.cc-card` is
 * `hoverable` at AntD's own shadow and `borderRadiusLG`.
 *
 * The spans are still its own, not the watch grid's. They agree up to `lg` and
 * deliberately stop there — the watch grid goes to six across at `xl` because a
 * reference code under a photograph stays legible that narrow, and a line name
 * does not.
 */

/**
 * How much of the card the photograph is allowed to stand in, measured from the
 * right edge.
 *
 * **The left 54% is kept clear on purpose and it is the count that needs it.**
 * The name above it is `--cc-text` and could sit over anything; the count is
 * `--cc-text-description`, which clears AA by 0.2 of a ratio point on a plain
 * card (see `LINE_GROUND_OPACITY`). The longest count this catalogue can
 * currently print — `1070 models`, Vintage — measures about 62% of the body of
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
 * has two of those plus a hover state in each. Masking the image knows nothing
 * about any of them.
 */
const GROUND_MASK = 'linear-gradient(to left, #000 0%, #000 45%, transparent 92%)'

/**
 * Every card here holds a real count, because **a line with nothing in it is not
 * published** (D51). This used to read "Not catalogued yet" instead of "0" — a
 * true sentence about a card that should not have been on the page at all, and
 * the client's rule is that a category with nothing in it is worse than no
 * category. It is the same rule §8.4 already applied to a family of one, and the
 * build applies it at the source rather than each grid hiding it separately.
 */
export function LineGrid({
  lines,
  editions,
}: {
  lines: readonly PublishedLine[]
  /**
   * D62 — how many editions there are, or nothing where there are none.
   *
   * **A prop on this grid rather than a card the front door renders beside it,
   * and that is the whole point.** This component's own comment says it owns the
   * one copy of the grid's geometry; a second element in a second wrapper would
   * be a second copy of `grid-template-columns` at three breakpoints, drifting.
   *
   * It also keeps D62's actual argument intact. That decision refused a *second
   * grid* under the first, on the grounds that a row of edition cards would
   * claim equal weight with the seven lines. One tile inside the existing grid
   * is not that: it is the eighth thing in a list of eight, marked as a
   * different kind of thing by having no accent colour and no photograph.
   *
   * The link it replaces was a bare `<a>` under the grid, and on the dark theme
   * it was unreadable — see `color-scheme` in index.css for why, because the
   * cause was not this component and would have come back somewhere else.
   */
  editions?: number | undefined
}) {
  // Read rather than derived from a token, because the number this picks is a
  // contrast ceiling and the two themes fail in opposite directions. There is no
  // single opacity that is honest in both.
  const mode = useUiStore((state) => state.mode)
  /**
   * The grounds are held back until the first paint is out (see `useSettled`).
   * Seven photographs at 180 KB were arriving down the same 1.6 Mbps pipe as the
   * script that draws the cards they sit behind — decoration competing with its
   * own content. The tile is absolutely positioned inside the card body, so
   * adding it a moment later moves nothing.
   */
  const settled = useSettled()

  return (
    <div className="cc-line-grid">
      {lines.map((line) => (
        <Link
          key={line.id}
          to={`/line/${line.slug}`}
          className="cc-card cc-card-accent"
          // The per-line accent as a custom property, so the 3 px stripe is a
          // class and the colour is data (§8.3).
          style={{ ['--cc-accent-line' as string]: LINE_ACCENTS[line.id] }}
        >
          <div className="cc-card-body">
            <CardGround modelId={LINE_GROUNDS[line.id]} settled={settled} mode={mode} />
            {/* Above the ground, and only because a positioned sibling would
                otherwise paint over them — `position: relative` on both, set
                by their classes. `z-index` is deliberately not used: the
                card's own stretched-link pattern lives in this stacking
                context on the watch card, and starting a second numbering
                here would be a thing to keep in step for no gain. */}
            <span className="cc-card-name">{line.name}</span>
            <span className="cc-card-count">{`${line.count} ${t('home.models')}`}</span>
          </div>
        </Link>
      ))}

      {/*
        D62's tile, last and deliberately quieter than the seven.

        **The accent stripe is kept and only its colour changes**, to
        `--cc-border-secondary`. Dropping `cc-card-accent` altogether was the
        first version and it was 3 px shorter than every card beside it, which
        pushed its name and count out of line along the row — the stripe is
        structural here, not decoration.

        It carries a faded watch exactly as the seven do — `EDITIONS_GROUND`,
        through the same `CardGround` — because a tile with an empty right half
        beside seven that have a watch in it reads as the one that failed to
        load. The glyph this first used is the rail's, and it stays the rail's: a
        24 px icon where every neighbour has a photograph is a different
        treatment, not a quieter one.
      */}
      {editions !== undefined && editions > 0 ? (
        <Link
          to="/editions"
          className="cc-card cc-card-accent"
          style={{ ['--cc-accent-line' as string]: 'var(--cc-border-secondary)' }}
        >
          <div className="cc-card-body">
            <CardGround modelId={EDITIONS_GROUND} settled={settled} mode={mode} />
            <span className="cc-card-name">{t('nav.editions')}</span>
            <span className="cc-card-count">{editionsTotal(editions)}</span>
          </div>
        </Link>
      ) : null}
    </div>
  )
}

/**
 * The faded watch behind a card's text — one copy, used by the seven line tiles
 * and by D62's editions tile.
 *
 * **It was inline in the map and is a component now because there are two
 * callers**, and every line of it is a decision that would have been copied: the
 * 54% inset, the mask, the per-theme opacity ceiling and the negative bleed. Two
 * copies of a contrast ceiling is one copy nobody updates.
 *
 * A model with no ground named for it renders nothing at all, and absent is a
 * normal state here for the same reason it is everywhere else in this catalogue:
 * a missing photograph is not a broken card.
 */
function CardGround({
  modelId,
  settled,
  mode,
}: {
  modelId: string | undefined
  settled: boolean
  mode: 'light' | 'dark'
}) {
  const ground = settled && modelId ? imageSources(modelId) : null
  if (!ground) return null

  return (
    /*
      **The tile is a `div` and the photograph is an `img` inside it, and that is
      not a wrapper for the sake of one.** An absolutely positioned *replaced*
      element does not stretch to its insets: with all four set and
      `width: auto`, CSS resolves `auto` to the intrinsic 400 px and then drops
      the end inset as over-constrained. The first build of this looked like a
      broken image — a 400 px watch pinned at 54% and clipped to a
      thumbnail-sized corner. A `div` is not replaced, so its auto size does
      stretch, and `100%` inside it finally means the tile rather than the card.
    */
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        // Negative by the body's own padding, which is what lets the photograph
        // reach the card's edges from inside its padding box — and bleed a
        // little past the top and bottom, so a strap runs off the card rather
        // than stopping on it.
        insetBlock: -16,
        insetInlineEnd: -16,
        insetInlineStart: GROUND_INSET,
        maskImage: GROUND_MASK,
        WebkitMaskImage: GROUND_MASK,
        // The whole card is one link. Nothing in here is a second target, a drag
        // handle, or selectable text.
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <img
        src={ground.src}
        // Decorative, so it has no accessible name — the wrapper is already
        // `aria-hidden`. The card has exactly one accessible name, the link's,
        // and a second would make every line read as two things to a screen
        // reader.
        alt=""
        // Eight of these on the front door is the one place in the product where
        // an image is decoration rather than content, so it yields to
        // everything: below the fold it is not fetched at all, and the ones
        // above it queue last.
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        style={{
          width: '100%',
          height: '100%',
          // `contain`, not `cover`. Cover would crop a watch case down its
          // middle in a narrow column, which reads as a damaged image rather
          // than a cropped one — and unlike a landscape, a watch has nothing to
          // spare at its edges.
          objectFit: 'contain',
          objectPosition: 'center',
          opacity: LINE_GROUND_OPACITY[mode],
        }}
      />
    </div>
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
  return (
    <div className="cc-line-grid" aria-busy="true" aria-label={t('state.loading')}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="cc-card cc-card-accent"
          // The accent stripe in grey. It is 3 px on the real card, so leaving
          // it off here would put the skeleton 2 px short of what replaces it —
          // and the accent is precisely the thing not known until the catalogue
          // names the line, so a placeholder is the honest mark.
          style={{ ['--cc-accent-line' as string]: 'var(--cc-fill-secondary)' }}
        >
          <div className="cc-card-body">
            {/* Two bars for the name's two reserved lines and one for the count,
                at the widths the real text lands near. */}
            <div className="cc-skeleton-bar" style={{ width: '70%' }} />
            <div className="cc-skeleton-bar" style={{ width: '45%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
