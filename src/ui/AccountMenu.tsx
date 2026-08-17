import { Suspense, lazy } from 'react'
import { Button, theme as antdTheme } from 'antd'
import UserOutlined from '@ant-design/icons/UserOutlined'
import { useSessionStore } from '../auth/session.ts'
import { t } from '../i18n/strings'

/**
 * §8.1 — the account control in the header. From M0 until now this was a
 * comment saying a **Sign in** button that opens nothing is worse than no
 * button; M4 is the milestone that gives it something to open.
 *
 * Three of its four states cost nothing: `unavailable` renders nothing at all,
 * `guest` is one Button the shell already imports, and `restoring` is a plain
 * div. Only the signed-in state needs Dropdown, Menu and Avatar, and it loads
 * them when it needs them — the same argument D40 used to settle O10, applied
 * to the least common state rather than the most common one.
 */
const AccountDropdown = lazy(() => import('./AccountDropdown.tsx'))

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { token } = antdTheme.useToken()
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
          background: token.colorFillSecondary,
        }}
      />
    )
  }

  if (status === 'guest') {
    return compact ? (
      <Button
        type="text"
        aria-label={t('account.signIn')}
        icon={<UserOutlined />}
        onClick={() => promptSignIn()}
        style={{ width: 44, height: 44, flexShrink: 0 }}
      />
    ) : (
      <Button onClick={() => promptSignIn()} style={{ flexShrink: 0 }}>
        {t('account.signIn')}
      </Button>
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
