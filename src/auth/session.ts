import { create } from 'zustand'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { BrowseModel } from '../catalog/schema.ts'
import { authCallbackUrl } from './config.ts'
// Statically imported, unlike `pendingIntent` below: this module has no Zod and
// no dependency at all — it is a localStorage key, a regex and a fetch — so the
// reason that one is lazy does not apply.
import { clearCachedAvatar } from './avatar.ts'
import { getSupabase, hasStoredSession, isAuthConfigured } from './supabase.ts'
/**
 * §12 — **imported inside `signOut` rather than at the top of this file, and the
 * reason is Zod.**
 *
 * `pendingIntent.ts` validates the slot it reads with a Zod schema, built at
 * module scope. This store is reached from `AuthHost`, which is in the shell — so
 * a static import here put all 174 KB unminified of Zod into the entry chunk of
 * every URL on the site, to be able to clear a slot on the way *out*. Every other
 * importer of `pendingIntent` is already behind a lazy boundary.
 *
 * Signing out is the one moment where an extra round trip costs nothing: there is
 * already a request to Supabase in flight above the call site, and the chunk is a
 * few hundred bytes.
 *
 * **Awaited at the call site, and that is not optional.** FR-11.6 says a shared
 * device must not hold the last person's watches, so `signOut()` resolving before
 * the slot is actually gone would make the promise a lie — and `session.test.ts`
 * asserts exactly that, which is how the first version of this was caught.
 *
 * **Not wrapped in `fresh`.** Three `import()`s in the app skip that rule and
 * this is the only one that skips it for being load-bearing rather than
 * speculative: `fresh` answers a missing chunk by reloading the tab, and a
 * reload here would abandon the one statement this function exists to run. The
 * slot would survive into the next page load, where the next person to sign in
 * on a shared device inherits the last one's pending press — and FR-11.6 is
 * worth more than the reload. A failure throws out of `signOut` instead, which
 * is loud and, given the order in the `finally` below, no longer takes the
 * sign-out itself down with it.
 */
const clearPendingIntent = async () => {
  const { clearPendingIntent: clear } = await import('./pendingIntent.ts')
  clear()
}
import { purgeCaches } from '../pwa/offline.ts'

/**
 * §7.2 — the session lives in Zustand, seeded from `getSession()` and kept
 * current by `onAuthStateChange` (§9.5).
 *
 * The one thing here that is not in the specification's two lines is the
 * **`restoring` status**, and it exists because §7.2 and §12 pull in opposite
 * directions. §12 says a guest must never download the auth library; §7.2 says
 * the session is seeded from `getSession()`, which *is* the auth library. Both
 * are satisfiable only if the shell can tell a guest from a returning user
 * before it imports anything — which is what `hasStoredSession()` does with a
 * single localStorage read.
 *
 * So a guest is `guest` on the first paint, downloads nothing, and sees the
 * right header immediately. A returning user is `restoring` for as long as one
 * lazy chunk takes, and the header shows a placeholder rather than a **Sign in**
 * button it would have to take back.
 */
export type SessionStatus =
  /** No Supabase project is configured yet (§14.2). The account control hides. */
  | 'unavailable'
  /** A stored token exists; the client is loading and will settle this. */
  | 'restoring'
  | 'guest'
  | 'authenticated'

export interface AccountUser {
  id: string
  email: string | null
  displayName: string | null
}

interface SignInPrompt {
  open: boolean
  /** §8.9 — the watch that triggered the modal, shown as a thumbnail. */
  model: BrowseModel | null
}

interface SessionState {
  status: SessionStatus
  user: AccountUser | null
  prompt: SignInPrompt

  hydrate: () => Promise<void>
  applySession: (session: Session | null) => void
  promptSignIn: (model?: BrowseModel | null) => void
  dismissSignIn: () => void
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

function initialStatus(): SessionStatus {
  if (!isAuthConfigured()) return 'unavailable'
  return hasStoredSession() ? 'restoring' : 'guest'
}

function initialData(): Pick<SessionState, 'status' | 'user' | 'prompt'> {
  return { status: initialStatus(), user: null, prompt: { open: false, model: null } }
}

/**
 * Google returns a name and a picture; magic link returns neither. Every field
 * is optional and absent renders as itself — the account menu falls back to the
 * email address, and then to a generic label.
 *
 * **The picture is deliberately not kept, and that is still true.** Google
 * serves it from `lh3.googleusercontent.com`, which S7's `img-src 'self' data:`
 * forbids and S8 forbids more broadly: displaying it would put a request to
 * Google on every page a signed-in user loads. Not storing the URL is stronger
 * than not rendering it — a field that is present is a field somebody renders
 * later.
 *
 * A photograph does now reach the header, and it does not arrive through here.
 * `avatar.ts` asks an Edge Function, which fetches the bytes server-side and
 * returns a `data:` URI; the browser never names a Google host and the CSP was
 * not widened. This field staying absent is part of how that stays true.
 *
 * `full_name` is what Google's OIDC claims map to, and it is also what §6.3's
 * sign-up trigger copies into `profiles.display_name`. The same value in two
 * places is fine here because one is a cache of the other and neither is
 * authoritative until M6 lets the user edit it.
 */
function toAccountUser(session: Session): AccountUser {
  const metadata = session.user.user_metadata as Record<string, unknown>
  const text = (key: string): string | null => {
    const value = metadata[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
  }
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    displayName: text('full_name') ?? text('name'),
  }
}

/**
 * §9.5 — one subscription per page load. Guarded because two callers reach it:
 * `hydrate()` on a returning visit, and the callback route straight after an
 * exchange. A second subscription would double every state change.
 */
let listenerAttached = false
export function ensureAuthListener(supabase: SupabaseClient): void {
  if (listenerAttached) return
  listenerAttached = true
  supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.getState().applySession(session)
  })
}

let hydration: Promise<void> | null = null

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialData(),

  /**
   * Settles `restoring`. Runs at most once, and **returns without importing
   * anything when there is nothing to restore** — that early exit is §12's rule
   * expressed as code rather than as a comment.
   */
  hydrate: async () => {
    hydration ??= (async () => {
      if (!isAuthConfigured()) {
        set({ status: 'unavailable', user: null })
        return
      }
      if (!hasStoredSession() && get().status !== 'authenticated') {
        set({ status: 'guest', user: null })
        return
      }
      try {
        const supabase = await getSupabase()
        ensureAuthListener(supabase)
        const { data } = await supabase.auth.getSession()
        get().applySession(data.session)
      } catch {
        // A stored token we cannot exchange is indistinguishable from no token.
        // Browsing does not depend on any of this (D1, D6), so the honest state
        // is signed out rather than an error page over a working catalogue.
        set({ status: 'guest', user: null })
      }
    })()
    return hydration
  },

  applySession: (session) => {
    if (!session) {
      set({ status: 'guest', user: null })
      return
    }
    set({ status: 'authenticated', user: toAccountUser(session), prompt: { open: false, model: null } })
  },

  promptSignIn: (model) => set({ prompt: { open: true, model: model ?? null } }),
  dismissSignIn: () => set({ prompt: { open: false, model: null } }),

  /**
   * §9.3 — a full-page redirect, not a popup. A popup is a second window whose
   * `sessionStorage` is not this one's, which would quietly break §9.4's slot.
   */
  signInWithGoogle: async () => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authCallbackUrl() },
    })
    if (error) throw error
  },

  /** §9.2 — built and tested; reachable only when AUTH_METHODS lists 'email'. */
  signInWithEmail: async (email) => {
    const supabase = await getSupabase()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authCallbackUrl() },
    })
    if (error) throw error
  },

  /**
   * §9.5 — clears the store and returns the user to `/`. Resetting the query
   * cache is the caller's half of it (`useSignOut`), because the cache lives in
   * a React context and this store deliberately does not.
   */
  signOut: async () => {
    try {
      const supabase = await getSupabase()
      await supabase.auth.signOut()
    } finally {
      // Whatever the network did, this browser is signed out. A sign-out that
      // fails silently and leaves the header showing an account is the worst
      // possible outcome on a shared machine.
      // FR-11.6 — a shared device must not hold the last person's watches, and
      // from 2026-08-25 must not hold their face in the header either. This one
      // is a synchronous localStorage removal with no import behind it, so it
      // costs nothing to do here rather than lazily like the slot below.
      purgeCaches()
      clearCachedAvatar()
      // **Before the await, not after it.** `useSignOut` says "the store clears
      // this browser's session in its own finally, whatever the network did",
      // and with this line last that was not quite true: `clearPendingIntent`
      // is a dynamic import, so a deploy that replaced its chunk left the
      // rejection to skip this `set` — signing somebody out of Supabase and
      // leaving the header showing their account. The order costs nothing;
      // `signOut()` still does not resolve until the slot is gone, which is the
      // property `session.test.ts` pins.
      set({ status: 'guest', user: null, prompt: { open: false, model: null } })
      await clearPendingIntent()
    }
  },
}))

/** Tests only — production creates this store once and keeps it. */
export function resetSessionStore(): void {
  hydration = null
  listenerAttached = false
  useSessionStore.setState(initialData())
}
