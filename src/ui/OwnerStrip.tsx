import { Link } from 'react-router-dom'
import { Typography, theme as antdTheme } from 'antd'
import { useWatchOwners } from '../collection/collectors.ts'
import { CollectorAvatar } from './CollectorAvatar'
import { collectorsOwningPath, profilePath } from '../paths.ts'
import { t } from '../i18n/strings'

/**
 * FR-3.8 / FR-3.9 / §8.12 — who owns this watch, and then how many.
 *
 * **Two numbers that are not the same kind of thing**, which is the whole of
 * D72. The names are listed collectors: no floor at all, because each of them
 * turned on two switches to be findable and the fact is one they published —
 * what changes here is only the direction it is reached from. The count is
 * everybody, public and private, and it appears only from five upward, because a
 * small aggregate beside a directory that lists everybody visible is arithmetic
 * a stranger can do about somebody's private collection.
 *
 * **Everything here is decoration and fails to nothing.** A paused free project
 * (D23), an offline phone, a rate limit and a slow answer all render the same
 * thing: no names, no number, no error, no retry and no spinner. D1's promise is
 * that browsing works when the database does not, and a watch page reporting a
 * failed fetch of a decoration is that promise broken over a nicety.
 *
 * The height is reserved in CSS whether or not anything arrives (NFR-7), so the
 * specification table above it never moves under the reader's eye.
 */
export function OwnerStrip({ modelId }: { modelId: string }) {
  const { token } = antdTheme.useToken()
  const { data } = useWatchOwners(modelId)

  const owners = data?.owners ?? []
  const owned = data?.ownedCount ?? null

  // Nothing known and nothing to say. The container still holds its height, so
  // this is an empty row rather than an absent one.
  if (owners.length === 0 && owned === null) return <div className="cc-owner-strip" />

  return (
    <div className="cc-owner-strip">
      {owners.map((owner) => (
        <Link
          key={owner.handle}
          to={profilePath(owner.handle)}
          title={owner.display_name ?? undefined}
        >
          <CollectorAvatar
            handle={owner.handle}
            displayName={owner.display_name}
            avatar={owner.avatar}
            size={32}
          />
          <span className="cc-truncate" style={{ maxWidth: 120, fontSize: token.fontSizeSM }}>
            {owner.display_name?.trim() || owner.handle}
          </span>
        </Link>
      ))}

      {/*
        FR-12.8's destination. It appears whenever the strip is full, because
        `listed_owners` stops at eight and cannot say whether there is a ninth —
        so the link says "see who else" rather than claiming a number it does not
        have. A count that might be zero is worse than an invitation.
      */}
      {owners.length >= 8 ? (
        <Link to={collectorsOwningPath(modelId)}>
          <span style={{ fontSize: token.fontSizeSM }}>{t('owners.more')}</span>
        </Link>
      ) : null}

      {owned !== null ? (
        <Typography.Text
          type="secondary"
          style={{ fontSize: token.fontSizeSM, marginInlineStart: owners.length > 0 ? 8 : 0 }}
        >
          {`${owned} ${t('owners.count')}`}
        </Typography.Text>
      ) : null}
    </div>
  )
}
