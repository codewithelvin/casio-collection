import { Link } from 'react-router-dom'
import { theme as antdTheme } from 'antd'
import { CollectorAvatar } from './CollectorAvatar'
import type { Collector } from '../collection/api.ts'
import { profilePath } from '../paths.ts'
import { t } from '../i18n/strings'

/**
 * §8.12 — one card in the directory: a picture, a name, a handle, and how many
 * references they own.
 *
 * **One link with one accessible name**, which is §8.7's lesson arriving on a
 * second screen. The whole card is the anchor rather than the name inside it,
 * because a 200 px card with a 60 px hit area is a card that feels broken on a
 * phone — and because two links to the same place in one card is two tab stops
 * and two identical announcements.
 */
export function CollectorCard({ collector }: { collector: Collector }) {
  const { token } = antdTheme.useToken()
  const name = collector.display_name?.trim() || collector.handle

  return (
    <Link
      to={profilePath(collector.handle)}
      className="cc-collector-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        height: '100%',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 10,
        background: token.colorBgContainer,
        color: 'inherit',
      }}
    >
      <CollectorAvatar
        handle={collector.handle}
        displayName={collector.display_name}
        avatar={collector.avatar}
        size={48}
      />
      <span style={{ minWidth: 0 }}>
        {/*
          Truncated in CSS and not with AntD's `ellipsis` prop. D58's profile
          named that prop as 23% of all samples on a grid this size: it appends
          an <em>, reads two rects and removes it, once per element, inside
          React's commit. Three CSS properties do the same job for nothing.
        */}
        <span
          className="cc-truncate"
          style={{ display: 'block', fontWeight: 600, lineHeight: 1.3 }}
        >
          {name}
        </span>
        <span
          className="cc-truncate"
          style={{ display: 'block', fontSize: token.fontSizeSM, color: token.colorTextTertiary }}
        >
          {`@${collector.handle}`}
        </span>
        <span
          style={{ display: 'block', fontSize: token.fontSizeSM, color: token.colorTextSecondary }}
        >
          {`${collector.owned_count} ${t('collectors.watches')}`}
        </span>
      </span>
    </Link>
  )
}
