import { useState } from 'react'
import { Dropdown, Typography, theme as antdTheme, type MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { clearCachedAvatar, readCachedAvatar } from '../auth/avatar.ts'
import { useSessionStore } from '../auth/session.ts'
import { useSignOut } from '../auth/useSignOut.ts'
import AntdRoot from './AntdRoot'
import { t } from '../i18n/strings'

/**
 * The signed-in half of the header control, split into its own chunk because
 * Dropdown and Menu are the expensive part and at launch almost nobody is
 * signed in (§8.1, D40's reasoning).
 *
 * **The photograph here never comes from Google, and the CSP was not widened to
 * put it here.** Google hands back an `avatar_url` on `lh3.googleusercontent.com`
 * which S7's `img-src 'self' data:` forbids and S8 forbids more broadly —
 * rendering it would mean a request to Google on every page a signed-in user
 * loads, which is the tracking S8 exists to prevent. So the session still never
 * keeps that URL (see `session.ts`), and what this renders is a `data:` URI the
 * `avatar` Edge Function fetched server-side, cached in localStorage at sign-in.
 *
 * Read synchronously at first render, with no import and no network, which is
 * the same trick §12 plays to decide whether the header says *Sign in* at all.
 * **Initials remain the answer whenever there is no picture** — no account
 * photo, storage disabled, the function not deployed — and they are never wrong,
 * only plainer.
 */
/**
 * §12 — the provider comes with the island.
 *
 * `AntdRoot` left `App.tsx` so the entry chunk would stop carrying AntD's theme
 * runtime, and this renders in the header, above every route — so there is no
 * route wrapper to inherit from. Without it the dropdown would be AntD's default
 * blue at AntD's default size, in a header that is neither.
 */
export default function AccountDropdown() {
  return (
    <AntdRoot>
      <Dropdownable />
    </AntdRoot>
  )
}

function Dropdownable() {
  const { token } = antdTheme.useToken()
  const user = useSessionStore((state) => state.user)
  const navigate = useNavigate()
  const signOut = useSignOut()

  // `useState(readCachedAvatar)` rather than an effect: the value is already on
  // this machine, so there is no frame in which the header shows initials and
  // then swaps to a face. An effect would produce exactly that flicker on every
  // load for every signed-in user.
  const [avatar, setAvatar] = useState(readCachedAvatar)

  const label = user?.displayName ?? user?.email ?? t('account.menu')

  const items: MenuProps['items'] = [
    {
      key: 'who',
      type: 'group',
      label: (
        <span>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {t('account.signedInAs')}
          </Typography.Text>
          <Typography.Paragraph
            strong
            ellipsis
            style={{ marginBottom: 0, maxWidth: 200 }}
            // S4 — user-authored text, rendered as text. React escapes by
            // default and the lint rule makes sure nothing here undoes that.
          >
            {label}
          </Typography.Paragraph>
        </span>
      ),
    },
    { type: 'divider' },
    { key: 'collection', label: t('account.myCollection') },
    { key: 'settings', label: t('account.settings') },
    { type: 'divider' },
    { key: 'signout', label: t('account.signOut'), danger: true },
  ]

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'collection') navigate('/collection')
    if (key === 'settings') navigate('/settings')
    if (key === 'signout') void signOut()
  }

  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']} placement="bottomRight">
      <button
        type="button"
        aria-label={t('account.menu')}
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          background: token.colorPrimary,
          color: token.colorWhite,
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
          // The picture fills the button rather than sitting inside it, so the
          // control keeps exactly the 32 px footprint the header is laid out
          // around whether or not there is a photograph.
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {avatar === null ? (
          initials(label)
        ) : (
          <img
            src={avatar}
            alt=""
            width={32}
            height={32}
            // Decorative: the button already carries `aria-label` with the
            // account name, so announcing the picture too would say it twice.
            aria-hidden
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            // A cached data URI that will not decode is a broken image icon in
            // the header until the next sign-in. Falling back to initials costs
            // one render and cannot look wrong.
            onError={() => {
              clearCachedAvatar()
              setAvatar(null)
            }}
          />
        )}
      </button>
    </Dropdown>
  )
}

/**
 * Two letters from a name, one from an email address. Exported so the fallback
 * chain is tested rather than assumed — a display name is optional on every
 * provider and absent is the normal case for magic link (§9.2).
 */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) {
    // An email address: the local part's first character, never the '@'.
    return (words[0] ?? '').charAt(0).toUpperCase() || '?'
  }
  const first = (words[0] ?? '').charAt(0)
  const last = (words[words.length - 1] ?? '').charAt(0)
  return `${first}${last}`.toUpperCase()
}
