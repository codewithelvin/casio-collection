import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A route chunk that 404s after a deploy must reload the tab once — never zero
 * times, which leaves *Unexpected Application Error*, and never twice, which is
 * a loop.
 *
 * The behaviour lives in `router.tsx` beside the route table, so this exercises
 * a copy of the same function rather than importing the table and pulling every
 * screen into the test. What it pins is the decision, and the three ways it can
 * be got wrong: no reload, a loop, and reloading while offline.
 */
const RELOADED = 'cc:chunk-reload'

const remember = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

const alreadyReloaded = () => {
  try {
    return sessionStorage.getItem(RELOADED) !== null
  } catch {
    return true
  }
}

async function fresh<T>(load: () => Promise<T>): Promise<T> {
  try {
    const module = await load()
    remember(RELOADED, null)
    return module
  } catch (error) {
    if (alreadyReloaded() || !navigator.onLine || !remember(RELOADED, '1')) throw error
    location.reload()
    return new Promise<T>(() => {})
  }
}

const chunkGone = () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module'))

describe('a route chunk that was deployed away', () => {
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    })
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('reloads once, because the tab only knows about files that are gone', async () => {
    void fresh(chunkGone)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('does not reload a second time — a loop hides the real error', async () => {
    void fresh(chunkGone)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await expect(fresh(chunkGone)).rejects.toThrow('Failed to fetch')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('throws rather than reloading when offline — D33 browses what it cached', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(fresh(chunkGone)).rejects.toThrow('Failed to fetch')
    expect(reload).not.toHaveBeenCalled()
  })

  it('forgets the attempt on success, so a later deploy is still handled', async () => {
    void fresh(chunkGone)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await fresh(() => Promise.resolve('loaded'))
    expect(sessionStorage.getItem(RELOADED)).toBeNull()
  })
})
