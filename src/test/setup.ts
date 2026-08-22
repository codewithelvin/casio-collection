import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { catalogArtefactResponse } from './catalogFixture'

/**
 * Testing Library's `findBy*` carries its **own** one-second timeout, separate
 * from vitest's `testTimeout` — so raising that in vite.config.ts (as this
 * project already did, for exactly this reason) does nothing for a query that
 * waits on data.
 *
 * From M2 every screen waits on the catalogue query before it renders anything,
 * which puts a promise resolution and a full AntD re-render inside the second.
 * On an idle machine that is comfortable and on a loaded one it is not, and the
 * symptom is the worst kind of red: three tests failing in a full run and
 * passing when run alone. The fix is to give the wait room, not to make the
 * tests assert less.
 *
 * **Raised from 5 s to 15 s at M3**, after the coverage run — and only the
 * coverage run — started failing the *first* test of two different files while
 * every later test in the same file passed comfortably. That shape is the
 * diagnosis: a cold worker under v8 instrumentation pays for compiling AntD and
 * building a token set before the first assertion, and it was paying more than
 * five seconds. Nothing here waits on an absence, so a longer ceiling makes a
 * genuine failure slower to report and never makes one pass.
 */
configure({ asyncUtilTimeout: 15_000 })

afterEach(() => {
  cleanup()
  localStorage.clear()
  // M4 — the pending intent lives in sessionStorage (§9.4) and it is a *single
  // slot*, so a leftover from one test is not stale data in the next one, it is
  // the value the next one reads. That is precisely the failure the slot's
  // expiry exists to prevent, and leaving it uncleared here would hide it.
  sessionStorage.clear()
  // A test that overrode fetch must not leave that override for the next one.
  vi.unstubAllGlobals()
  // Likewise the Supabase build variables (§14.2): whether they are set is what
  // decides if the account control renders at all, so one test's stub would
  // change what the next test's shell looks like.
  vi.unstubAllEnvs()
})

/**
 * From M2 the shell itself reads the catalogue — the rail carries model counts
 * (FR-1.1) — so *every* component test needs `catalog.json` to resolve, not just
 * the browsing ones. Stubbing it here rather than in each file keeps that from
 * being a thing each new test has to remember, and forgetting it would not fail
 * loudly: the rail would render its loading skeleton and an assertion about a
 * line would simply time out.
 *
 * A test that wants a different answer overrides this with `vi.stubGlobal`,
 * which is what the failure-path tests do.
 */
beforeEach(() => {
  /**
   * §14.2 — **the default state of every test is "no Supabase project".**
   *
   * This has to be stated rather than inherited. `unstubAllEnvs` in the
   * `afterEach` above restores the *ambient* environment, and Vite loads `.env`
   * into it — so on a machine that has followed `supabase/README.md` and written
   * the pair into `.env`, `import.meta.env.VITE_SUPABASE_URL` is a real project
   * and the three tests that assert the not-configured branch fail. They were
   * passing because the machine happened to be empty.
   *
   * CI happened to be empty too: the workflow passes the variables to the build
   * step and not to the test step, so the gate stayed green by luck rather than
   * by design. That is the part worth fixing — a test that describes the state
   * the live site is in until M4's console steps are done must establish that
   * state itself.
   *
   * Empty strings rather than deleted keys, because `supabaseConfig()` treats
   * blank and absent as the same thing and an empty string is visible: a test
   * can assert it, which is what pins this in place.
   */
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // Both legs of §6.2's split, from the one matcher in `catalogFixture` —
      // since the split, the rail on every screen needs the index and every
      // screen showing watches needs the catalogue.
      return (
        catalogArtefactResponse(String(input)) ?? { ok: false, status: 404, json: async () => ({}) }
      )
    }),
  )
})

// jsdom implements neither of these, and AntD's responsive grid and our own
// theme seeding both read them. Without the stub every component test throws
// before it asserts anything, which reads as "the component is broken".
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

/**
 * React Router 7's data router builds a `Request` for every navigation and
 * passes it an AbortSignal. Under vitest's jsdom environment those two come
 * from different places: jsdom defines AbortController/AbortSignal, but not
 * Request, so `Request` is still Node's undici one — and undici validates the
 * signal with an instanceof check against *its* AbortSignal. jsdom's fails it,
 * and every navigation throws before a single assertion runs.
 *
 * Stripping the signal is safe here because nothing in these tests aborts a
 * navigation; undici supplies its own. This is a jsdom seam, not application
 * behaviour, which is why it is fixed once here rather than in each test.
 */
const NativeRequest = globalThis.Request
class RequestWithoutForeignSignal extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init && 'signal' in init) {
      const { signal: _signal, ...rest } = init
      super(input, rest)
    } else {
      super(input, init)
    }
  }
}
globalThis.Request = RequestWithoutForeignSignal as unknown as typeof Request

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
})
