import { create } from 'zustand'
import type { ThemeMode } from '../theme/tokens'

const STORAGE_KEY = 'cc.theme'

/**
 * §8.3 — seeded from prefers-color-scheme, overridable by the toggle, and the
 * override persists. A stored value always wins: someone who has chosen dark
 * has said something the OS setting should not keep undoing.
 */
function initialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private mode, or storage disabled. The OS preference is a fine answer.
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

interface UiState {
  mode: ThemeMode
  drawerOpen: boolean
  toggleTheme: () => void
  setDrawerOpen: (open: boolean) => void
}

/** §7.2 — drawer and theme live here. Filters and search do not: they live in the URL. */
export const useUiStore = create<UiState>((set, get) => ({
  mode: initialMode(),
  drawerOpen: false,
  toggleTheme: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    set({ mode: next })
  },
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}))
