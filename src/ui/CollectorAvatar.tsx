import { useState } from 'react'
import { theme as antdTheme } from 'antd'
import { initials } from './initials'

/**
 * D71 — the picture beside a name, wherever one appears: the directory, the
 * owner strip on a watch page, and the header of a public profile.
 *
 * It renders the stored `data:` URI or the person's initials, and it is the same
 * component in all three places so that a face and a fallback are never two
 * different shapes at two different sizes.
 *
 * **The colour behind initials is derived from the handle**, so the same person
 * is the same colour on every page. That is not decoration: on a directory of
 * two dozen mostly-initialled cards, a stable colour is the only thing making
 * one of them recognisable at a glance.
 */
export function CollectorAvatar({
  handle,
  displayName,
  avatar,
  size,
}: {
  handle: string
  displayName?: string | null | undefined
  avatar?: string | null | undefined
  size: number
}) {
  const { token } = antdTheme.useToken()
  // A picture that will not decode is a broken-image icon on somebody's profile.
  // Falling back costs one render and cannot look wrong.
  const [broken, setBroken] = useState(false)

  const label = displayName?.trim() || handle
  const showPicture = typeof avatar === 'string' && avatar !== '' && !broken

  return (
    <span
      // Decorative in every place it is used: each one already renders the name
      // as text beside it, so announcing the picture too says it twice.
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        overflow: 'hidden',
        background: showPicture ? token.colorFillSecondary : avatarColour(handle),
        color: token.colorWhite,
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      {showPicture ? (
        <img
          src={avatar as string}
          alt=""
          width={size}
          height={size}
          // NFR-7 — the dimensions are on the element, not only in the style, so
          // the box has its size before the data URI decodes.
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setBroken(true)}
        />
      ) : (
        initials(label)
      )}
    </span>
  )
}

/**
 * A stable hue per handle. Exported so the property that matters is tested
 * rather than assumed: **the same input always gives the same colour**, which is
 * what makes it recognition rather than noise.
 *
 * Fixed saturation and lightness because a hash over all three produces
 * unreadable pairs — white initials on pale yellow — and the one job this colour
 * has is to sit behind two white letters at 4.5:1 (NFR-8).
 */
export function avatarColour(handle: string): string {
  let hash = 0
  for (let index = 0; index < handle.length; index += 1) {
    hash = (hash * 31 + handle.charCodeAt(index)) % 360
  }
  return `hsl(${hash} 45% 38%)`
}
