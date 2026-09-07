import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchIsAdmin } from './api.ts'
import { isAuthConfigured } from '../auth/supabase.ts'
import { useSessionStore } from '../auth/session.ts'

/**
 * Is the signed-in caller the one account D79 named?
 *
 * **This exists so the key is shared by construction rather than by two files
 * remembering the same string.** The header asks (to decide whether to draw a
 * menu row) and `/admin/requests` asks (to decide whether to render at all), and
 * with one hook react-query answers both from a single request per session
 * instead of one each. Two `useQuery(['is-admin'])` call sites would have worked
 * until somebody typed `['isAdmin']` in the third one.
 *
 * **It is a cosmetic answer and nothing rests on it.** Every read this gates is
 * enforced in the database by `is_admin()` reading `auth.uid()` server-side, so
 * a caller who edits this in devtools gets a menu row that leads to a page that
 * fetches nothing. What is here decides what is *drawn*; never what is allowed.
 *
 * `false` for every kind of no — no session, no project (§14.2), the function
 * not deployed — because all of them mean the same thing to a menu.
 */
export function useIsAdmin(): UseQueryResult<boolean, Error> {
  const status = useSessionStore((state) => state.status)

  return useQuery({
    queryKey: ['is-admin'] as const,
    queryFn: fetchIsAdmin,
    // Not worth a round trip before there is a session to ask about, and a guest
    // is not the admin — which is an answer, not a missing one.
    enabled: isAuthConfigured() && status === 'authenticated',
    // Long, because this changes when somebody runs SQL by hand and never in the
    // course of using the site. A sign-out clears the cache with everything else.
    staleTime: 30 * 60_000,
    retry: false,
  })
}
