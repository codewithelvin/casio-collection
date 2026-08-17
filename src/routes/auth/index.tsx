import { useEffect, useRef, useState } from 'react'
import { Button, Spin, Typography } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getSupabase } from '../../auth/supabase.ts'
import { ensureAuthListener, useSessionStore } from '../../auth/session.ts'
import { takePendingIntent } from '../../auth/pendingIntent.ts'
import { EmptyState } from '../../ui/EmptyState'
import { t } from '../../i18n/strings'

/**
 * §9.2 / §9.4 — the authenticated return, and **the only place in the app that
 * exchanges an OAuth code for a session.**
 *
 * The client is created with `detectSessionInUrl: false` precisely so that this
 * is true. Left on, the library would consume whatever `?code=` happened to be
 * in the address bar the first time it was constructed — and with a lazily
 * created client (§12) that moment is not reliably this route. Doing it by hand
 * costs six lines and makes the flow something a test can drive.
 *
 * Then §9.4's single slot: read it, clear it, go where it says. At M4 a
 * `collection` intent's *action* is not applied, because `collection_items`
 * arrives with M5 — and no such intent can exist yet either, since the button
 * that writes one is M5's too. What works today is the half that matters most
 * on its own: **you come back to the page you left.**
 */
export default function AuthCallbackRoute() {
  const [failed, setFailed] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const applySession = useSessionStore((state) => state.applySession)
  const promptSignIn = useSessionStore((state) => state.promptSignIn)

  /**
   * An authorisation code is single-use, so this must run once and not once per
   * mount. StrictMode double-invokes effects in development, and the second
   * exchange would fail against a code the first one already spent — turning a
   * successful sign-in into an error page on the developer's machine only.
   */
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      // The provider reports refusals in the query string, not by failing the
      // redirect. Someone who pressed "Cancel" on Google's consent screen
      // arrives here with error=access_denied and no code at all.
      const providerError = searchParams.get('error') ?? searchParams.get('error_description')
      const code = searchParams.get('code')
      if (providerError !== null || code === null) {
        setFailed(true)
        return
      }

      try {
        const supabase = await getSupabase()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error || !data.session) {
          setFailed(true)
          return
        }
        ensureAuthListener(supabase)
        applySession(data.session)

        const intent = takePendingIntent()
        // `replace`, so the back button goes to the watch they were looking at
        // rather than to a callback URL whose code has already been spent.
        navigate(intent?.returnTo ?? '/', { replace: true })
      } catch {
        setFailed(true)
      }
    })()
  }, [searchParams, navigate, applySession])

  if (failed) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <EmptyState
          title={t('auth.callback.failed.title')}
          body={t('auth.callback.failed.body')}
          action={
            <>
              <Button type="primary" onClick={() => promptSignIn()}>
                {t('auth.error.retry')}
              </Button>{' '}
              <Link to="/">
                <Button>{t('auth.callback.home')}</Button>
              </Link>
            </>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <Spin />
      <Typography.Text type="secondary">{t('auth.callback.working')}</Typography.Text>
    </div>
  )
}
