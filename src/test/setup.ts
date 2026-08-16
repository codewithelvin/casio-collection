import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { catalogFixtureJson } from './catalogFixture'

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
  // A test that overrode fetch must not leave that override for the next one.
  vi.unstubAllGlobals()
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('catalog.json')) {
        return { ok: true, status: 200, json: async () => catalogFixtureJson() }
      }
      return { ok: false, status: 404, json: async () => ({}) }
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
