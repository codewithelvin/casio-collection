import { useState } from 'react'
import { Dropdown, Typography, theme as antdTheme, type MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { clearCachedAvatar, readCachedAvatar } from '../auth/avatar.ts'
import { useSessionStore } from '../auth/session.ts'
import { useSignOut } from '../auth/useSignOut.ts'
// A hook and a type, and nothing that renders. `admin.ts` was made its own
// module so this import cannot drag a screen's worth of AntD into the header —
// the `CollectorAvatar` fault, which arrived disguised as two flaky tests (§13).
import { useIsAdmin } from '../collection/admin.ts'
import AntdRoot from './AntdRoot'
import { initials } from './initials'
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
  const isAdmin = useIsAdmin().data === true

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
    /**
     * D79's queue, for the one account that may read it.
     *
     * **The route is unlinked from every page and this row is not a
     * contradiction of that.** Nothing in the site's markup points at it — no
     * footer, no nav, no sitemap, no prerendered page — so a crawler cannot
     * reach it and D66's gate has nothing to reconcile. This lives inside a menu
     * that only renders for a signed-in session, and only once the *database*
     * has said yes. A guest never downloads this chunk at all (§12).
     *
     * Spreading an empty array is how a menu omits a row. A `false` inside
     * `items` is not a valid entry — it type-checks against `MenuProps` about as
     * well as it renders, which is to say it becomes a runtime surprise instead
     * of a compile error.
     */
    ...(isAdmin ? [{ key: 'requests', label: t('account.requests') }] : []),
    { type: 'divider' },
    { key: 'signout', label: t('account.signOut'), danger: true },
  ]

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'collection') navigate('/collection')
    if (key === 'settings') navigate('/settings')
    if (key === 'requests') navigate('/admin/requests')
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
 * Two letters from a name, one from an email address. **Moved to `initials.ts`
 * by D71** and re-exported here so every existing import site is unchanged: the
 * function grew a second caller in `CollectorAvatar`, and importing it from this
 * module would have pulled the account dropdown — `Dropdown`, `Menu`, `Avatar`
 * and the avatar cache — into the directory, the owner strip and the public
 * profile, all of which §12 keeps it out of.
 *
 * Exported at all so the fallback chain is tested rather than assumed: a display
 * name is optional on every provider and absent is the normal case for magic
 * link (§9.2).
 */
export { initials }
