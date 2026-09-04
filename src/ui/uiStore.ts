import { create } from 'zustand'
import { THEME_STORAGE_KEY, type ThemeMode } from '../theme/palette.ts'
import { readConsent, writeConsent, type Consent } from '../analytics/consent.ts'

/**
 * §8.3 — seeded from prefers-color-scheme, overridable by the toggle, and the
 * override persists. A stored value always wins: someone who has chosen dark
 * has said something the OS setting should not keep undoing.
 */
function initialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private mode, or storage disabled. The OS preference is a fine answer.
  }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

/**
 * §12 — **the shell is painted by CSS custom properties, and this is what picks
 * which set of them applies.**
 *
 * Since the shell stopped rendering with Ant Design it has no access to a token
 * object; its colours come from `[data-theme]` on the document element, defined
 * by the `<style>` block `vite.config.ts` injects. Something has to set that
 * attribute, and *when* is the whole subtlety: an effect runs after the browser
 * has painted, so a dark-mode visitor would get one frame of white header on
 * every page load. Called at module scope below — before React's first render —
 * and again from the toggle, it is set before anything is painted at all.
 *
 * Guarded for jsdom and for anything else without a document, so importing the
 * store in a unit test does not need a DOM.
 */
function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset['theme'] = mode
}

/** FR-9.3 — an unsent report that survived a sign-in, waiting to be reopened. */
export interface RequestDraft {
  ref: string
  link?: string | undefined
  note?: string | undefined
}

interface UiState {
  mode: ThemeMode
  drawerOpen: boolean
  /**
   * Deliberately **in memory and not in storage.**
   *
   * §9.4's slot is the thing that survives the round trip; this is only the
   * hand-off from the callback route to the form, inside one page load, after
   * the slot has already been consumed. Persisting it would be a second
   * mechanism for the problem the slot exists to solve — and §9.4 is explicit
   * that two mechanisms for one problem is how the second one rots.
   */
  requestDraft: RequestDraft | null
  /**
   * D68 — the analytics choice, seeded from storage before the first render so
   * the banner does not appear for a frame to somebody who answered it months
   * ago. `null` is *not yet asked*.
   */
  consent: Consent
  /**
   * Whether to show the banner to somebody who **has** already answered — the
   * footer's *Analytics* control sets it, and it is what makes withdrawing a
   * consent as easy as giving it was. Deliberately separate from `consent`
   * itself: reopening the question must not first erase the answer, or a reader
   * who opens it out of curiosity and navigates away has silently been reset to
   * unasked.
   */
  consentPromptOpen: boolean
  toggleTheme: () => void
  setDrawerOpen: (open: boolean) => void
  setRequestDraft: (draft: RequestDraft | null) => void
  setConsent: (value: Exclude<Consent, null>) => void
  openConsentPrompt: () => void
  closeConsentPrompt: () => void
}

/** The mode the store opens on, resolved once and applied to the document
 *  before React renders anything. */
const startingMode = initialMode()
applyTheme(startingMode)

/** §7.2 — drawer and theme live here. Filters and search do not: they live in the URL. */
export const useUiStore = create<UiState>((set, get) => ({
  mode: startingMode,
  drawerOpen: false,
  toggleTheme: () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    applyTheme(next)
    set({ mode: next })
  },
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  requestDraft: null,
  setRequestDraft: (requestDraft) => set({ requestDraft }),

  // D68. Read once at store creation, for the same reason the theme is: a
  // banner that appears and then vanishes is worse than one that never appeared.
  consent: readConsent(),
  consentPromptOpen: false,
  setConsent: (value) => {
    // The write may fail — private mode, storage disabled — and the choice still
    // holds for this page load. What is lost is only remembering it next time,
    // which is not a reason to refuse the answer now.
    writeConsent(value)
    set({ consent: value, consentPromptOpen: false })
  },
  openConsentPrompt: () => set({ consentPromptOpen: true }),
  closeConsentPrompt: () => set({ consentPromptOpen: false }),
}))
