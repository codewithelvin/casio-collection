import { useEffect, useState } from 'react'
import { create } from 'zustand'

/**
 * D33 / FR-11 — **the browser's half of "you can look offline, you cannot
 * change anything offline".**
 *
 * The service worker itself is generated at build time (`scripts/sw.ts`). This
 * is everything the app needs to know about it: whether there is a newer build
 * waiting, whether the network is there, and how to throw the whole thing away
 * when somebody signs out.
 */

const SW_PATH = `${import.meta.env.BASE_URL}sw.js`

interface PwaState {
  /** FR-11.2 — a newer build is installed and waiting to be let in. */
  updateReady: boolean
  applyUpdate: () => void
  setUpdateReady: (ready: boolean) => void
}

export const usePwaStore = create<PwaState>((set) => ({
  updateReady: false,
  setUpdateReady: (updateReady) => set({ updateReady }),
  applyUpdate: () => {
    void navigator.serviceWorker?.getRegistration().then((registration) => {
      registration?.waiting?.postMessage('SKIP_WAITING')
      // The new worker takes over and `controllerchange` reloads. Reloading
      // here instead would race it and reload into the old one.
    })
  },
}))

/**
 * FR-11.1 / FR-11.2 — registered after load, so the install never competes with
 * the first paint for bandwidth (NFR-1).
 *
 * **Not registered in development.** A cached shell on `localhost` is how an
 * afternoon disappears into wondering why an edit had no effect, and the thing
 * being tested here is a production build anyway.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(SW_PATH)
      .then((registration) => {
        if (registration.waiting) usePwaStore.getState().setUpdateReady(true)

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            // `controller` is null on the very first install — there is no old
            // page to interrupt, so that is not an update and must not prompt.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              usePwaStore.getState().setUpdateReady(true)
            }
          })
        })
      })
      .catch(() => {
        // A failed registration costs the offline features and nothing else.
        // The site works; there is nothing to tell anybody.
      })

    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  })
}

/**
 * FR-11.6 — "signing out purges every cache, including the collection. A shared
 * device must not hold the last person's watches."
 *
 * Both halves: the worker's caches, and the offline copy of the collection this
 * module keeps in localStorage. Awaited nowhere, because sign-out must not wait
 * on it — but it is issued before the session is cleared, so the message
 * reaches a worker that is still controlling this page.
 */
export function purgeCaches(): void {
  navigator.serviceWorker?.controller?.postMessage('PURGE')
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(OFFLINE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Storage disabled: there is nothing cached to purge.
  }
}

/**
 * FR-11.7 — "offline state is shown once, calmly, in the header — not as a
 * toast on every action."
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}

/* ------------------------------------------------------------------------- *
 * FR-11.4 — the collection, readable offline.
 * ------------------------------------------------------------------------- */

const OFFLINE_PREFIX = 'cc.offline.'

/**
 * **FR-11.3 and FR-11.4 pull against each other, and this is where they are
 * reconciled.**
 *
 * FR-11.3 says every request to Supabase is network-only and nothing about a
 * collection is served from a stale cache. FR-11.4 says the collection is
 * readable offline. Both are right, and they are about different layers: the
 * *service worker* never answers for Supabase, so a request either reaches the
 * server or fails honestly. What is kept here is the **application's own last
 * known copy**, written after a successful fetch and read only when the fetch
 * cannot happen at all.
 *
 * The distinction is not academic. A cache that answers transparently makes
 * stale data indistinguishable from fresh; this makes it a state the app knows
 * it is in — which is what lets FR-11.5 disable the ownership controls and say
 * why, rather than accepting a press against data it cannot trust.
 */
export function rememberCollection(userId: string, rows: unknown): void {
  try {
    localStorage.setItem(`${OFFLINE_PREFIX}${userId}`, JSON.stringify(rows))
  } catch {
    // Quota, or storage disabled. Offline reading is a courtesy, not a promise.
  }
}

export function recallCollection<T>(userId: string): T | undefined {
  try {
    const raw = localStorage.getItem(`${OFFLINE_PREFIX}${userId}`)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}
