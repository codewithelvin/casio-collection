import { Suspense, lazy } from 'react'
import { UserIcon } from './icons'
import { useSessionStore } from '../auth/session.ts'
import { t } from '../i18n/strings'

/**
 * §8.1 — the account control in the header. From M0 until M4 this was a
 * comment saying a **Sign in** button that opens nothing is worse than no
 * button; M4 is the milestone that gave it something to open.
 *
 * Three of its four states cost nothing: `unavailable` renders nothing at all,
 * `guest` is one button, and `restoring` is a plain div. Only the signed-in
 * state needs Dropdown, Menu and Avatar, and it loads them when it needs them —
 * the same argument D40 used to settle O10, applied to the least common state
 * rather than the most common one.
 *
 * §12 — the three cheap states are now cheap in the way that counts. They were
 * an AntD `Button` and a token read, which put AntD in the entry chunk for the
 * overwhelmingly common case of a visitor who is not signed in and never
 * touches this control. `AccountDropdown` is where Ant Design starts, and it
 * brings its own `AntdRoot`.
 */
const AccountDropdown = lazy(() => import('./AccountDropdown.tsx'))

/**
 * §8.2's two shapes, and **no `compact` prop any more.**
 *
 * The shell used to pass one, computed from `Grid.useBreakpoint()`: an icon on a
 * phone, *Sign in* with words on a desktop. §12 took that decision out of
 * JavaScript, so the button now always carries both the glyph and the word and
 * `.cc-account-label` hides the word below 768 px. The `aria-label` is on it at
 * every width, which is what keeps the control named "Sign in" to a screen
 * reader on the layout where the word is not drawn.
 */
export function AccountMenu() {
  const status = useSessionStore((state) => state.status)
  const promptSignIn = useSessionStore((state) => state.promptSignIn)

  // §14.2 — no Supabase project yet. The catalogue is the whole site until
  // there is one, and it works without an account by design (D6).
  if (status === 'unavailable') return null

  if (status === 'restoring') {
    /**
     * A returning visitor whose token is being exchanged. This deliberately is
     * **not** a Sign in button: showing one and then replacing it with an
     * avatar half a second later tells someone they are signed out when they
     * are not, and the one thing worse than a slow header is a lying one.
     */
    return (
      <div
        aria-label={t('account.restoring')}
        aria-busy="true"
        role="status"
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'var(--cc-fill-secondary)',
        }}
      />
    )
  }

  if (status === 'guest') {
    return (
      <button
        type="button"
        className="cc-account-button"
        aria-label={t('account.signIn')}
        onClick={() => promptSignIn()}
      >
        <UserIcon />
        <span className="cc-account-label">{t('account.signIn')}</span>
      </button>
    )
  }

  return (
    <Suspense
      fallback={<div style={{ width: 32, height: 32, flexShrink: 0 }} aria-hidden="true" />}
    >
      <AccountDropdown />
    </Suspense>
  )
}
