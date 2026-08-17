import { useEffect, useRef, useState } from 'react'
import { App, Button, Spin, Typography } from 'antd'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getSupabase } from '../../auth/supabase.ts'
import { ensureAuthListener, useSessionStore } from '../../auth/session.ts'
import { takePendingIntent } from '../../auth/pendingIntent.ts'
import { putCollectionItem, type CollectionStatus } from '../../collection/api.ts'
import { collectionKey } from '../../collection/mutations.ts'
import { catalogQueryOptions, modelById } from '../../catalog/client.ts'
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
  const queryClient = useQueryClient()
  const { message } = App.useApp()
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
        // §9.4 step 4 — apply the press that was interrupted, before leaving.
        // Doing it here rather than on the destination page means the watch is
        // already marked when the page it is on renders, so nothing flickers
        // from unmarked to marked in front of the person who pressed it.
        if (intent?.kind === 'collection') {
          await applyPendingMark(queryClient, data.session.user.id, intent.modelId, intent.status, message)
        }

        // `replace`, so the back button goes to the watch they were looking at
        // rather than to a callback URL whose code has already been spent.
        navigate(intent?.returnTo ?? '/', { replace: true })
      } catch {
        setFailed(true)
      }
    })()
  }, [searchParams, navigate, applySession, queryClient, message])

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

/**
 * §9.4 step 4 — **the half of the pending intent that M4 could not build**,
 * because `collection_items` did not exist and neither did the button that
 * writes one.
 *
 * D6 is the decision this pays for. Browsing needs no account and every write
 * needs a session, so a guest who presses *Owned One* is sent away to Google
 * mid-gesture; the promise made in exchange is that the press survives. This is
 * where it is kept.
 *
 * **A failed write does not fail the return.** They are signed in, they are
 * about to land on the watch they pressed, and the button there is one press
 * away — where turning a successful sign-in into an error page would lose them
 * the sign-in as well as the press. Quiet is the right failure here precisely
 * because the recovery is visible and immediate.
 */
async function applyPendingMark(
  queryClient: QueryClient,
  userId: string,
  modelId: string,
  status: CollectionStatus,
  message: ReturnType<typeof App.useApp>['message'],
): Promise<void> {
  try {
    await putCollectionItem(userId, modelId, status)
  } catch {
    return
  }

  // Nothing has read these rows yet — the query is disabled without a session —
  // but the write must not be racing a fetch that started the moment the store
  // said `authenticated`.
  await queryClient.invalidateQueries({ queryKey: collectionKey(userId) })

  // §9.4: "confirms with a toast **naming the watch**". A toast saying *marked*
  // with no reference in it is a toast about nothing — after a redirect out to
  // Google and back, the entire point is to show that the site remembered which
  // watch. The shell has already started this fetch, so awaiting it joins the
  // request in flight rather than making a second one; the id is the fallback
  // for the case where the catalogue itself could not be loaded.
  let ref = modelId
  try {
    ref = modelById(await queryClient.ensureQueryData(catalogQueryOptions), modelId)?.ref ?? modelId
  } catch {
    // Keep the id. A confirmation carrying a raw id is worse copy and true; no
    // confirmation at all would be a press that looks lost when it was not.
  }
  void message.success(`${ref} · ${t('owned.restored')}`)
}
