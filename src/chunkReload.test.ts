import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RELOADED, fresh, resetChunkReload } from './chunkReload.ts'

/**
 * A chunk that 404s after a deploy must reload the tab once — never zero times,
 * which leaves *Unexpected Application Error*, and never twice, which is a loop.
 *
 * **This used to hold a copy of the function**, on the grounds that the original
 * lived in `router.tsx` beside the route table and importing that table would
 * pull every screen into the test. The copy passed for two milestones while the
 * real failure — the account menu, which is not a route — went unwrapped on the
 * live site, so the function is now a module of its own and this imports it.
 *
 * `resetChunkReload()` stands for a page load: the in-memory "already going
 * away" flag is what a reload clears, and `sessionStorage` is what it does not.
 */
const chunkGone = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'))

/** Resolves if `fresh` decided to hang, rejects if it let the error through. */
const settledWithin = (promise: Promise<unknown>) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(resolve, 20, 'pending'))])

describe('a chunk that was deployed away', () => {
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    resetChunkReload()
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
    resetChunkReload()
  })

  it('reloads once, because the tab only knows about files that are gone', async () => {
    void fresh(chunkGone)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  /**
   * `themed()` asks for a screen and `AntdRoot` together and a stale tab fails
   * both. The second failure must not throw: the tab is already reloading, and
   * an error thrown into `Promise.all` paints the error page for the moment
   * before it goes away — the screen this whole module exists to prevent, shown
   * briefly instead of permanently.
   */
  it('hangs rather than throwing while the reload it already started lands', async () => {
    void fresh(chunkGone)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))

    await expect(settledWithin(fresh(chunkGone))).resolves.toBe('pending')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('throws on the next page load rather than reloading again — a loop hides the real error', async () => {
    void fresh(chunkGone)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))

    // The reload happened: new page, same session, so the flag is still set.
    resetChunkReload()

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
    resetChunkReload()

    await fresh(() => Promise.resolve('loaded'))
    expect(sessionStorage.getItem(RELOADED)).toBeNull()
  })

  it('returns what it loaded when nothing is wrong, which is every other call', async () => {
    await expect(fresh(() => Promise.resolve({ default: 'Screen' }))).resolves.toEqual({
      default: 'Screen',
    })
    expect(reload).not.toHaveBeenCalled()
  })
})
