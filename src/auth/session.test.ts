import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_STORAGE_KEY } from './config.ts'
import { resetSupabaseClient } from './supabase.ts'
import { INTENT_KEY, writePendingIntent } from './pendingIntent.ts'
import { resetSessionStore, useSessionStore } from './session.ts'

/**
 * The store decides what the header says about you, and it never throws when it
 * is wrong — it just shows the wrong thing to the wrong person. That is why D31
 * puts it behind the same 90% floor as the catalogue's pure functions.
 *
 * The test that matters most here is the quiet one: **a guest must not download
 * the auth library.** It is a bundle rule (§12) with no visible symptom, so
 * nothing would ever notice it breaking except an assertion that `createClient`
 * was not called.
 */

const { auth, createClient } = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithOAuth: vi.fn(async (): Promise<{ data: object; error: Error | null }> => ({
      data: {},
      error: null,
    })),
    signInWithOtp: vi.fn(async (): Promise<{ data: object; error: Error | null }> => ({
      data: {},
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    exchangeCodeForSession: vi.fn(),
  }
  return { auth, createClient: vi.fn(() => ({ auth })) }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))

const SESSION = {
  access_token: 'token',
  user: {
    id: 'user-1',
    email: 'collector@example.com',
    user_metadata: {
      full_name: 'Elvin Huseynov',
      avatar_url: 'https://lh3.googleusercontent.com/a/whatever',
    },
  },
}

function configure() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon.key')
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  resetSupabaseClient()
  resetSessionStore()
})

describe('the first paint', () => {
  it('is unavailable when no project is configured (§14.2)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSessionStore()
    expect(useSessionStore.getState().status).toBe('unavailable')
  })

  it('is guest immediately when there is no stored token', () => {
    configure()
    resetSessionStore()
    expect(useSessionStore.getState().status).toBe('guest')
  })

  it('is restoring when a token is in storage', () => {
    configure()
    localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
    resetSessionStore()
    expect(useSessionStore.getState().status).toBe('restoring')
  })
})

describe('hydrate (§12 — a guest downloads nothing)', () => {
  it('does not load the Supabase client for a visitor with no token', async () => {
    configure()
    resetSessionStore()

    await useSessionStore.getState().hydrate()

    expect(createClient).not.toHaveBeenCalled()
    expect(useSessionStore.getState().status).toBe('guest')
  })

  it('does not load it when there is no project either', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    resetSessionStore()

    await useSessionStore.getState().hydrate()

    expect(createClient).not.toHaveBeenCalled()
    expect(useSessionStore.getState().status).toBe('unavailable')
  })

  it('restores a real session and maps the user', async () => {
    configure()
    localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
    resetSessionStore()
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })

    await useSessionStore.getState().hydrate()

    const state = useSessionStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.user).toEqual({
      id: 'user-1',
      email: 'collector@example.com',
      displayName: 'Elvin Huseynov',
    })
  })

  /**
   * S7 forbids `img-src` from another origin and S8 forbids third-party assets
   * outright, so Google's avatar can never be rendered. Not keeping the URL is
   * stronger than not rendering it — a field that is present is a field
   * somebody renders later.
   */
  it('does not keep the Google avatar URL (S7, S8)', async () => {
    configure()
    localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
    resetSessionStore()
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })

    await useSessionStore.getState().hydrate()

    expect(JSON.stringify(useSessionStore.getState().user)).not.toContain('googleusercontent')
  })

  it('falls back to guest when a stored token cannot be exchanged', async () => {
    configure()
    localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"stale"}')
    resetSessionStore()
    auth.getSession.mockRejectedValue(new Error('network'))

    await useSessionStore.getState().hydrate()

    // Browsing does not depend on any of this (D1, D6), so the honest answer is
    // signed out rather than an error page over a working catalogue.
    expect(useSessionStore.getState().status).toBe('guest')
  })

  it('runs once however many components ask', async () => {
    configure()
    localStorage.setItem(SESSION_STORAGE_KEY, '{"access_token":"x"}')
    resetSessionStore()
    auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })

    const { hydrate } = useSessionStore.getState()
    await Promise.all([hydrate(), hydrate(), hydrate()])

    expect(createClient).toHaveBeenCalledTimes(1)
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1)
  })
})

describe('signing in', () => {
  beforeEach(() => {
    configure()
    resetSessionStore()
  })

  it('sends Google the exact callback URL, with no query on it (§9.1)', async () => {
    await useSessionStore.getState().signInWithGoogle()

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('surfaces a provider error rather than pretending it worked', async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: new Error('provider down') })
    await expect(useSessionStore.getState().signInWithGoogle()).rejects.toThrow('provider down')
  })

  it('sends a magic link to the same callback (§9.2)', async () => {
    await useSessionStore.getState().signInWithEmail('collector@example.com')

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'collector@example.com',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
  })
})

describe('signing out (§9.5)', () => {
  beforeEach(() => {
    configure()
    resetSessionStore()
  })

  it('clears the user, the status and the pending slot', async () => {
    useSessionStore.getState().applySession(SESSION as never)
    writePendingIntent({ kind: 'return', returnTo: '/collection' })

    await useSessionStore.getState().signOut()

    expect(useSessionStore.getState().status).toBe('guest')
    expect(useSessionStore.getState().user).toBeNull()
    expect(sessionStorage.getItem(INTENT_KEY)).toBeNull()
  })

  /**
   * A sign-out that fails on the network and leaves the header showing an
   * account is the worst outcome on a shared machine — worse than an error.
   */
  it('signs the browser out even when the request fails', async () => {
    useSessionStore.getState().applySession(SESSION as never)
    auth.signOut.mockRejectedValueOnce(new Error('offline'))

    await expect(useSessionStore.getState().signOut()).rejects.toThrow('offline')
    expect(useSessionStore.getState().status).toBe('guest')
  })
})

describe('the sign-in prompt', () => {
  it('opens with the watch that triggered it and closes empty (§8.9)', () => {
    configure()
    resetSessionStore()
    const model = { id: 'f-91w-1', ref: 'F-91W-1' } as never

    useSessionStore.getState().promptSignIn(model)
    expect(useSessionStore.getState().prompt).toEqual({ open: true, model })

    useSessionStore.getState().dismissSignIn()
    expect(useSessionStore.getState().prompt).toEqual({ open: false, model: null })
  })

  it('closes itself when a session arrives', () => {
    configure()
    resetSessionStore()
    useSessionStore.getState().promptSignIn()
    useSessionStore.getState().applySession(SESSION as never)
    expect(useSessionStore.getState().prompt.open).toBe(false)
  })

  it('applying a null session is a sign-out', () => {
    configure()
    resetSessionStore()
    useSessionStore.getState().applySession(SESSION as never)
    useSessionStore.getState().applySession(null)
    expect(useSessionStore.getState().status).toBe('guest')
  })
})
