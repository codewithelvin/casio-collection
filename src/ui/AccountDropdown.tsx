import { Dropdown, Typography, theme as antdTheme, type MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../auth/session.ts'
import { useSignOut } from '../auth/useSignOut.ts'
import AntdRoot from './AntdRoot'
import { t } from '../i18n/strings'

/**
 * The signed-in half of the header control, split into its own chunk because
 * Dropdown and Menu are the expensive part and at launch almost nobody is
 * signed in (§8.1, D40's reasoning).
 *
 * **There is no photograph in here, and that is a constraint rather than an
 * omission.** Google hands back an `avatar_url` on `lh3.googleusercontent.com`,
 * and S7's `img-src 'self' data:` forbids it while S8 forbids any third-party
 * asset outright. Rendering it would mean a request to Google on every page a
 * signed-in user loads, which is the tracking S8 exists to prevent — so the
 * session never keeps the URL at all. Initials in the accent colour say the
 * same thing and stay same-origin.
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
        }}
      >
        {initials(label)}
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
