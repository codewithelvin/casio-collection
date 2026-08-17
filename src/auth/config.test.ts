import { describe, expect, it, vi } from 'vitest'
import { AUTH_METHODS, SESSION_STORAGE_KEY, authCallbackUrl, supabaseConfig } from './config.ts'

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

describe('SESSION_STORAGE_KEY', () => {
  it('is ours, not derived from the project ref', () => {
    // §12's whole trick depends on this: the shell asks whether anyone is
    // signed in with one string read, and it cannot know the project ref
    // without loading the config it is trying not to load.
    expect(SESSION_STORAGE_KEY).toBe('cc.session')
  })
})
