import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_METHODS,
  SESSION_STORAGE_KEY,
  authCallbackUrl,
  forwardOAuthReturnAtRoot,
  supabaseConfig,
} from './config.ts'

describe('AUTH_METHODS (D20)', () => {
  it('is Google alone at launch', () => {
    expect([...AUTH_METHODS]).toEqual(['google'])
  })

  /**
   * The point of D20 is that the email flow is *built* and withheld by one
   * constant. If `includes('email')` ever stopped type-checking — because the
   * array had been narrowed to a tuple, say — every email branch in the modal
   * would become statically dead code and the flag would quietly become a
   * refactor again. This asserts the shape that keeps it a flag.
   */
  it('can be asked about a method it does not currently list', () => {
    expect(AUTH_METHODS.includes('email')).toBe(false)
  })
})

describe('supabaseConfig (§14.2)', () => {
  it('is null before the project exists, which is a supported state', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(supabaseConfig()).toBeNull()
  })

  it('is null when only one of the pair is set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(supabaseConfig()).toBeNull()
  })

  it('reads both build variables and trims them', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '  https://ref.supabase.co  ')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ' anon.key ')
    expect(supabaseConfig()).toEqual({ url: 'https://ref.supabase.co', anonKey: 'anon.key' })
  })

  /**
   * The suite's default state, asserted here so it cannot drift back.
   *
   * Three tests elsewhere describe what the site does with **no** project — the
   * ownership controls render nothing, the account control is absent, a guarded
   * route says accounts are not switched on yet. All three were reading the
   * ambient environment, and Vite loads `.env` into it, so the moment a real
   * project was written into `.env` all three failed. CI did not catch it,
   * because the workflow hands the variables to the build step and not to the
   * test step — the gate was green by luck rather than by design.
   *
   * `src/test/setup.ts` now stubs both to empty before every test. The empty
   * string is what holds it there: an *unset* variable reads back `undefined`,
   * so this line fails if that stub is ever removed — on a clean machine as
   * well as on a configured one.
   */
  it('is null by default in tests, and that default is stated rather than inherited', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe('')
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBe('')
    expect(supabaseConfig()).toBeNull()
  })
})

describe('authCallbackUrl (§9.1, §9.3)', () => {
  /**
   * This value is typed into two consoles by hand and compared for an exact
   * match at the one moment it is ever used. The test is short because the
   * property is short: it is an absolute URL, it ends at the callback path, and
   * **it carries no query string** — which is what lets the Supabase redirect
   * allow-list hold it literally rather than as a wildcard.
   */
  it('is the bare callback path, with nothing after it', () => {
    const url = authCallbackUrl()
    expect(url).toBe(`${window.location.origin}/auth/callback`)
    expect(url).not.toContain('?')
    expect(url).not.toContain('#')
  })
})

/**
 * The net under a console setting nobody can test from the build (§14.2, and
 * `supabase/README.md`). Supabase discards a `redirectTo` that is not on the
 * allow-list and uses the project's Site URL instead, code and all — so the
 * return can arrive at the root rather than at `/auth/callback`, where the front
 * door renders and the code is dropped unread.
 *
 * What these assert is the seam and not the exchange: the URL the router is
 * about to read, and nothing about sessions. `callback.test.tsx` owns the other
 * half.
 */
describe('forwardOAuthReturnAtRoot', () => {
  const at = (url: string) => window.history.replaceState(null, '', url)

  afterEach(() => at('/'))

  it('moves a code that landed on the root onto the callback path', () => {
    at('/?code=abc123')
    forwardOAuthReturnAtRoot()
    expect(window.location.pathname).toBe('/auth/callback')
    expect(window.location.search).toBe('?code=abc123')
  })

  /**
   * A refusal carries no code, and it is the case most likely to be waved
   * through as "nothing happened". Forwarding it reaches the callback's own
   * failure screen; leaving it renders a front door that says nothing at all.
   */
  it('forwards a provider refusal, which carries no code', () => {
    at('/?error=access_denied&error_description=The+user+cancelled')
    forwardOAuthReturnAtRoot()
    expect(window.location.pathname).toBe('/auth/callback')
    expect(window.location.search).toContain('error=access_denied')
  })

  it('leaves the query string exactly as it arrived, extra parameters and all', () => {
    at('/?code=abc123&state=xyz')
    forwardOAuthReturnAtRoot()
    expect(window.location.search).toBe('?code=abc123&state=xyz')
  })

  it('does nothing to an ordinary visit to the front door', () => {
    at('/')
    forwardOAuthReturnAtRoot()
    expect(window.location.pathname).toBe('/')
  })

  /**
   * Narrow on purpose. The Site-URL fallback always lands on the root, so
   * matching a deeper path would buy nothing and would stand in the way of any
   * later route that wants a `code` parameter of its own.
   */
  it('ignores a code on any path but the root', () => {
    at('/watch/ga-2100-1a1?code=abc123')
    forwardOAuthReturnAtRoot()
    expect(window.location.pathname).toBe('/watch/ga-2100-1a1')
  })

  it('leaves the callback path alone, so it cannot forward to itself', () => {
    at('/auth/callback?code=abc123')
    forwardOAuthReturnAtRoot()
    expect(window.location.pathname).toBe('/auth/callback')
    expect(window.location.search).toBe('?code=abc123')
  })

  /**
   * `replaceState`, not an assignment: no reload, and the spent URL is not left
   * in the history stack for the back button to return to.
   */
  it('replaces the history entry rather than pushing one', () => {
    const push = vi.spyOn(window.history, 'pushState')
    at('/?code=abc123')
    forwardOAuthReturnAtRoot()
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })
})

describe('SESSION_STORAGE_KEY', () => {
  it('is ours, not derived from the project ref', () => {
    // §12's whole trick depends on this: the shell asks whether anyone is
    // signed in with one string read, and it cannot know the project ref
    // without loading the config it is trying not to load.
    expect(SESSION_STORAGE_KEY).toBe('cc.session')
  })
})
