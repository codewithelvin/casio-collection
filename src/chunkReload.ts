/**
 * **A chunk that will not load means the deploy moved under this tab.**
 *
 * §12 split this application into a shell and forty-odd dynamic imports against
 * hashed filenames, and a deploy replaces every one of those files. A tab that
 * was open across one asks for `AccountDropdown-_NJEQ997.js`, gets a 404 from
 * Pages, and React Router shows *Unexpected Application Error! Failed to fetch
 * dynamically imported module*. It is not recoverable by clicking anything: the
 * page in memory only knows about files that no longer exist.
 *
 * Reloading is the fix, because the reload fetches the current `index.html` and
 * with it the current hashes. That it *works* is worth writing down, because
 * Pages serves the shell with `Cache-Control: max-age=600` and a stale shell is
 * how this whole failure starts: a reload navigation uses the `reload` cache
 * mode, which revalidates rather than reading the ten-minute-fresh copy, and the
 * service worker's navigation handler passes that request straight through
 * (`scripts/sw.ts`, network first). Nothing here has to bust a cache by hand.
 *
 * **This lived in `router.tsx` and covered the route table only**, which is how
 * the account menu — a shell control, present on every URL — went on producing
 * the error the function was written to stop. It is a module of its own so that
 * every `import()` that can 404 is wrapped in the same decision, and so
 * `chunkReload.test.ts` exercises the function the site runs instead of a copy
 * of it that can drift.
 *
 * Three guards keep it honest:
 *
 *   * **Once per session.** A reload that fails the same way must surface the
 *     real error rather than spin. The flag is cleared on the next success, so a
 *     later deploy is still handled.
 *   * **Only when online.** Offline, a missing chunk is D33's territory — the app
 *     browses what it cached and says so — and reloading would throw away a
 *     working page to fetch something unreachable.
 *   * **Once per tab.** `themed()` asks for two chunks at once and a stale tab
 *     fails both. Without the in-memory flag the loser of that race throws while
 *     the winner reloads, and the error page paints for the moment before the tab
 *     goes away — the exact screen this exists to prevent, shown briefly instead
 *     of permanently.
 */
export const RELOADED = 'cc:chunk-reload'

/** The tab is on its way out. Nothing asked after this should resolve. */
let reloading = false

/** The page is going away; never resolve, so nothing renders an error first. */
const never = <T>() => new Promise<T>(() => {})

const remember = (value: string | null) => {
  // Private modes throw on sessionStorage. A browser that will not remember the
  // attempt gets the plain error rather than a reload loop.
  try {
    if (value === null) sessionStorage.removeItem(RELOADED)
    else sessionStorage.setItem(RELOADED, value)
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

export async function fresh<T>(load: () => Promise<T>): Promise<T> {
  if (reloading) return never<T>()
  try {
    const module = await load()
    remember(null)
    return module
  } catch (error) {
    if (reloading) return never<T>()
    if (alreadyReloaded() || !navigator.onLine || !remember('1')) throw error
    reloading = true
    location.reload()
    return never<T>()
  }
}

/**
 * Tests only. `reloading` is per page load in production — the reload is what
 * clears it — so a test that wants the state of a *subsequent* load calls this,
 * which is the one thing a reload does that clearing sessionStorage does not.
 */
export function resetChunkReload(): void {
  reloading = false
}
