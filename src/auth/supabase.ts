import type { SupabaseClient } from '@supabase/supabase-js'
import { SESSION_STORAGE_KEY, supabaseConfig } from './config.ts'

/**
 * §12 — **the Supabase client is imported lazily and a guest never downloads
 * it.** That sentence is a bundle rule, and it is the one rule in this file.
 *
 * `import type` above is erased at compile time, so naming the type costs
 * nothing; the only real reference to the package is the dynamic `import()`
 * below, which Rollup gives a chunk of its own. Someone browsing the catalogue
 * pays for none of it — and D40 left M4 seventy-one kilobytes of headroom on the
 * understanding that this is where it would not be spent.
 */

let clientPromise: Promise<SupabaseClient> | null = null

async function createSupabase(): Promise<SupabaseClient> {
  const config = supabaseConfig()
  if (!config) {
    throw new Error(
      'auth: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set (§14.2). ' +
        'Nothing should have called this — check isAuthConfigured() first.',
    )
  }

  const { createClient } = await import('@supabase/supabase-js')

  return createClient(config.url, config.anonKey, {
    auth: {
      // §9.5 — the library persists and refreshes; we do not reimplement it.
      persistSession: true,
      autoRefreshToken: true,
      // Under our own key, so the shell can probe for a session without
      // loading this module at all. See SESSION_STORAGE_KEY.
      storageKey: SESSION_STORAGE_KEY,
      flowType: 'pkce',
      /**
       * **Off, deliberately.** Left on, the client consumes an OAuth `code`
       * from whatever URL happens to be in the address bar the first time it is
       * constructed — which, with a lazily created client, is not reliably the
       * callback route. §9.2 gives that exchange to `/auth/callback` and to
       * nothing else, so it is done explicitly there and can be tested.
       */
      detectSessionInUrl: false,
    },
  })
}

/**
 * One client per page load, memoised on the promise rather than the resolved
 * value — two components asking at once must not each start an import.
 */
export function getSupabase(): Promise<SupabaseClient> {
  clientPromise ??= createSupabase()
  return clientPromise
}

/** Whether the consoles have been wired up yet (§14.2). */
export function isAuthConfigured(): boolean {
  return supabaseConfig() !== null
}

/**
 * §12's whole trick: **a string read, no import.**
 *
 * The shell has to answer "should the header say Sign in, or show an account?"
 * before it is allowed to download an auth library, and those two requirements
 * only fit together if the question can be asked of localStorage directly. A
 * guest gets the right header instantly and downloads nothing; a returning user
 * gets a brief placeholder while the real session is restored.
 *
 * A present key is a *claim*, not proof — it may hold an expired refresh token,
 * and `hydrate()` is what settles it. Optimism in the right direction: the cost
 * of being wrong is a placeholder that resolves to **Sign in** a moment later.
 */
export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) !== null
  } catch {
    // Storage disabled. Nothing can have been persisted, so nobody is signed in.
    return false
  }
}

/**
 * Drops the memoised client. Exists for tests, which need each file to start
 * from nothing; production creates one client and keeps it.
 */
export function resetSupabaseClient(): void {
  clientPromise = null
}
