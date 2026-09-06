import { Link } from 'react-router-dom'
import { Typography, theme as antdTheme } from 'antd'
import { CollectorAvatar } from './CollectorAvatar'
import {
  ageFromBirthYear,
  buildLinkUrl,
  linkLabel,
  type LinkPlatform,
  type ProfileLink,
} from '../collection/profileFields.ts'
import { COLLECTORS } from '../paths.ts'
import { t } from '../i18n/strings'

/**
 * §8.10 / D70 / D71 — the header of a public profile.
 *
 * **Absent renders as absent.** A profile that fills in nothing looks exactly
 * like the page did before M11: no headings with nothing under them, no
 * placeholders, no *Not set*. That is Principle 4 (*unknown renders as itself*)
 * on a screen where most people will fill in one field out of five.
 *
 * Two rules the markup carries rather than the copy:
 *
 *   * **About and location are plain text** — escaped by React, line breaks
 *     preserved by `white-space`, and nothing parsed. FR-5.3 wrote that rule for
 *     a note and the reason is identical here: this is user-authored text on a
 *     public page.
 *   * **A link's `href` is built by this site, never typed by its owner** (S10,
 *     D70). What is stored is a platform and a handle; `buildLinkUrl` composes
 *     the address and `rel="nofollow ugc noopener"` says what it is.
 */
export function ProfileHeader({
  handle,
  displayName,
  avatar,
  about,
  location,
  birthYear,
  ownedCount,
  links,
  isListed,
}: {
  handle: string
  displayName: string | null
  avatar: string | null
  about: string | null
  location: string | null
  birthYear: number | null
  ownedCount: number
  links: ProfileLink[]
  isListed: boolean
}) {
  const { token } = antdTheme.useToken()
  const age = ageFromBirthYear(birthYear, new Date())

  // Built as one expression rather than as JSX text: the middle dots are
  // punctuation between values, not a sentence for D12 to hold.
  const facts = [
    location?.trim() || null,
    age === null ? null : `${t('profile.age')} ${age}`,
    `${ownedCount} ${t('collectors.watches')}`,
  ].filter((fact): fact is string => fact !== null)

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <CollectorAvatar handle={handle} displayName={displayName} avatar={avatar} size={64} />
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {displayName?.trim() || `@${handle}`}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {facts.join(' · ')}
          </Typography.Text>
        </div>
      </div>

      {about?.trim() ? (
        <Typography.Paragraph
          style={{ marginTop: 12, marginBottom: 0, whiteSpace: 'pre-wrap', maxWidth: 640 }}
        >
          {about}
        </Typography.Paragraph>
      ) : null}

      {links.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          {links.map((link) => (
            <a
              key={link.platform}
              href={buildLinkUrl(link.platform as LinkPlatform, link.handle)}
              target="_blank"
              // `nofollow ugc` because this is somebody else's link on our
              // domain, and `noopener` because a new tab that can reach back
              // into this one is the oldest hole in target="_blank".
              rel="nofollow ugc noopener noreferrer"
              style={{ fontSize: token.fontSizeSM }}
            >
              {`${t(`platform.${link.platform}`)} · ${linkLabel(link.platform as LinkPlatform, link.handle)}`}
            </a>
          ))}
        </div>
      ) : null}

      {/*
        D69 — the way back, but only for somebody who is on the page it goes to.
        Offering it on a published-but-unlisted profile would be an invitation
        into a directory its owner chose not to be in, printed on their own page.
      */}
      {isListed ? (
        <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
          <Link to={COLLECTORS} style={{ fontSize: token.fontSizeSM }}>
            {t('profile.browseCollectors')}
          </Link>
        </Typography.Paragraph>
      ) : null}
    </div>
  )
}
