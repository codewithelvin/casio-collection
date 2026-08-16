import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
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
