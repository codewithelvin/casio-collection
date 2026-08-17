import { Suspense, lazy, useEffect, useState } from 'react'
import { useSessionStore } from './session.ts'

/**
 * The sign-in modal is imported **only once someone asks for it**.
 *
 * Modal, Divider, Input and Alert are between them a meaningful slice of AntD,
 * and the overwhelmingly common visit at launch is a guest who browses and
 * never signs in. D40 settled O10 by placing AntD components with the code that
 * uses them rather than in a shared eager chunk, and this is the same argument
 * one level up: a dialogue nobody opened should not be in the first load.
 *
 * It stays mounted once it has been opened, so closing it fades out rather than
 * vanishing. Unmounting on close would also throw away the modal's own state
 * mid-animation, which reads as a flicker.
 */
const SignInModal = lazy(() => import('./SignInModal.tsx'))

export function AuthHost() {
  const status = useSessionStore((state) => state.status)
  const promptOpen = useSessionStore((state) => state.prompt.open)
  const hydrate = useSessionStore((state) => state.hydrate)
  const [everOpened, setEverOpened] = useState(false)

  /**
   * §9.5 / §12 — the session is restored here and nowhere else, and only when
   * there is something to restore. `restoring` is set by the store's initial
   * read of localStorage, so a guest never reaches this branch and never
   * downloads the auth library.
   */
  useEffect(() => {
    if (status === 'restoring') void hydrate()
  }, [status, hydrate])

  useEffect(() => {
    if (promptOpen) setEverOpened(true)
  }, [promptOpen])

  if (!everOpened) return null

  return (
    <Suspense fallback={null}>
      <SignInModal />
    </Suspense>
  )
}
