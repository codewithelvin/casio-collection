import { useEffect, type ReactNode } from 'react'
import { useSessionStore } from './session.ts'
import { EmptyState } from '../ui/EmptyState'
import { t } from '../i18n/strings'

/**
 * §7.3 — "a required route with no session renders the sign-in modal over a
 * blurred shell, **not a redirect** — so the URL survives and the user lands
 * where they meant to".
 *
 * The redirect is the thing being refused, and it is worth saying why, because
 * a redirect is what every framework's example does. Bouncing to `/signin`
 * throws away the address someone typed or was sent, and then has to reconstruct
 * it from a query parameter that is one more thing to get wrong — the same
 * open-redirect shape §9.4 keeps out of the OAuth callback. Staying put means
 * there is nothing to reconstruct: the router never moved.
 *
 * What is blurred is the page's own content, which at this milestone is a
 * placeholder and from M6 is the collection screen. It reads as *this is yours
 * and it is behind one step*, rather than as an error.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSessionStore((state) => state.status)
  const promptSignIn = useSessionStore((state) => state.promptSignIn)

  useEffect(() => {
    // Opening it on arrival is the point: the modal *is* the page for a guest.
    // `unavailable` deliberately does not, because there is nothing to open.
    if (status === 'guest') promptSignIn()
  }, [status, promptSignIn])

  if (status === 'authenticated') return <>{children}</>

  if (status === 'restoring') {
    // A returning visitor mid-restore. Blurred and silent rather than told to
    // sign in — they may well already be signed in, and a page that accuses
    // them of not being is worse than one that waits half a second.
    return <Veiled>{children}</Veiled>
  }

  const unavailable = status === 'unavailable'

  return (
    // The minimum height is the panel's, not the page's. What is underneath is
    // a placeholder at this milestone and a full collection screen from M6, and
    // an absolutely positioned panel taller than a short page would hang off
    // the bottom of it.
    <div style={{ position: 'relative', minHeight: 320 }}>
      <Veiled>{children}</Veiled>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <EmptyState
            title={unavailable ? t('auth.unavailable.title') : t('auth.required.title')}
            body={unavailable ? t('auth.unavailable.body') : t('auth.required.body')}
            action={
              unavailable ? undefined : (
                <button
                  type="button"
                  className="cc-button cc-button-primary"
                  onClick={() => promptSignIn()}
                >
                  {t('account.signIn')}
                </button>
              )
            }
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Hidden from assistive technology as well as blurred. A screen reader that
 * announced the page underneath would be reading out a collection its user
 * cannot see and has not been given — the panel over it says everything there
 * is to say.
 */
function Veiled({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      style={{
        filter: 'blur(6px)',
        opacity: 0.4,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}
