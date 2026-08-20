import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './offline.ts'

/**
 * **The reload decision, which is the whole of `controllerchange`.**
 *
 * `scripts/sw.ts` calls `clients.claim()` on activate, so the worker takes
 * control of the page that registered it. That fires `controllerchange` on a
 * first visit as well as on an update, and the two need opposite answers: an
 * update has to reload to stop running code a deploy has replaced, and a first
 * install must not, because there is nothing to replace and the reload costs a
 * first-time visitor the entire load a second time.
 *
 * It shipped without the distinction and every first visit loaded twice —
 * Lighthouse read it as a redirect chain worth 780 ms on desktop and 3 780 ms on
 * mobile. The three cases below are the three ways this can be wrong: never
 * reloading, reloading when it should not, and reloading twice.
 *
 * `registerServiceWorker` is imported rather than copied. It reads `controller`
 * at `load` and the bug was that it read nothing at all, so a test against a
 * copy of the logic would have been a test of the copy.
 */

interface FakeContainer extends EventTarget {
  controller: unknown
  register: ReturnType<typeof vi.fn>
  getRegistration: ReturnType<typeof vi.fn>
}

/** Enough of a registration for the `updatefound` path to attach and do nothing. */
const registration = () => ({
  waiting: null,
  installing: null,
  addEventListener: vi.fn(),
})

function install(controller: unknown): FakeContainer {
  const container = new EventTarget() as FakeContainer
  container.controller = controller
  container.register = vi.fn(async () => registration())
  container.getRegistration = vi.fn(async () => registration())
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  })
  return container
}

describe('the service worker taking control of the page', () => {
  let reload: ReturnType<typeof vi.fn>
  let onLoad: (() => void) | undefined

  beforeEach(() => {
    // Registration is skipped outside a production build, so every test here
    // would pass vacuously without this — including the ones asserting a reload.
    vi.stubEnv('PROD', true)
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
      configurable: true,
    })

    // **The `load` handler is captured, not dispatched.** `window` outlives a
    // test, so registering for real and firing the event left the previous
    // test's handler attached — and it ran again against this test's container,
    // reporting two reloads where the code performs one. Which is a fault in the
    // test and would read exactly like the fault it is here to catch.
    onLoad = undefined
    const addEventListener = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'load') {
        onLoad = listener as () => void
        return
      }
      addEventListener(type, listener, options)
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
    vi.restoreAllMocks()
  })

  it('does not reload the first install — clients.claim() is not an update', () => {
    const container = install(null)

    registerServiceWorker()
    onLoad?.()
    expect(container.register).toHaveBeenCalledWith('/sw.js')

    // The worker activates and claims this page: no controller, then one.
    container.controller = {}
    container.dispatchEvent(new Event('controllerchange'))

    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when a new worker takes over from an old one', () => {
    const container = install({})

    registerServiceWorker()
    onLoad?.()
    container.controller = {}
    container.dispatchEvent(new Event('controllerchange'))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads once however many times control changes — twice is a loop', () => {
    const container = install({})

    registerServiceWorker()
    onLoad?.()
    container.dispatchEvent(new Event('controllerchange'))
    container.dispatchEvent(new Event('controllerchange'))

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
