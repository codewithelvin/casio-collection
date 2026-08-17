import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from './session.ts'

/**
 * §9.5 — "a sign-out clears the store, resets the query cache, and returns the
 * user to `/`", split where the specification's sentence has a seam in it.
 *
 * The store does the first part; this hook does the other two, because the
 * query cache and the router both live in React context and the store
 * deliberately does not. Putting them together in a named hook keeps the three
 * steps one thing that cannot be half-remembered at a call site.
 *
 * **Clearing the whole cache and not just the collection keys is deliberate.**
 * It costs one refetch of `catalog.json` — cached by the browser anyway (§12) —
 * and it buys the guarantee that nothing a signed-in user read is still sitting
 * in memory for whoever uses the machine next. An allow-list of keys to drop is
 * a list somebody forgets to add to at M6.
 */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const signOut = useSessionStore((state) => state.signOut)

  return useCallback(async () => {
    try {
      await signOut()
    } catch {
      // The store clears this browser's session in its own `finally`, whatever
      // the network did. A failed request on the way out must not strand
      // someone on a page that needs an account — and it must not skip the
      // cache clear, which is the half that matters on a shared machine.
    }
    queryClient.clear()
    navigate('/')
  }, [signOut, queryClient, navigate])
}
