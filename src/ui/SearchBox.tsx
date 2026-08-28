import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { catalogQueryOptions } from '../catalog/client.ts'
import { SearchIcon } from './icons'
import { fresh } from '../chunkReload.ts'
import { t } from '../i18n/strings'

/**
 * §8.2 / FR-2 — the header's search control, and **only the part of it that is
 * cheap enough to be in the shell.**
 *
 * The combo box lives in `SearchField` and is imported when it is wanted. What
 * is left here is the state that decides whether it is wanted: the phone's
 * expand-and-collapse, FR-2.5's `/`, and the three intents that warm both the
 * chunk and the catalogue before a finger arrives.
 *
 * This split is worth the two files. Before it, every URL on the site paid for
 * rc-select, rc-virtual-list, rc-field-form and AntD's Input — 367 KB of the
 * entry chunk, measured — plus the whole 102 KB catalogue, so that a phone could
 * draw a magnifying glass.
 *
 * **The two layouts are now one component and a media query (§12).** It took a
 * `collapsedToIcon` prop from the shell, which the shell got from
 * `Grid.useBreakpoint()`; below 768 px the control is a button that expands and
 * above it a field that is always there. Both are in the markup and `shell.css`
 * picks — so the header has its shape before any of this has evaluated. `open`
 * below is *the phone's* state; on a desktop the field is on screen either way
 * and the flag only decides whether to focus it.
 */
const SearchField = lazy(() => fresh(() => import('./SearchField.tsx')))

export function SearchBox() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  /**
   * Why a counter and not a boolean: `/` has to focus a field that is already on
   * screen (the desktop header) as well as one it has just opened (the phone).
   * A boolean can only say "focus" once — pressing `/`, clicking into the page
   * and pressing `/` again would set it to a value it already held and run no
   * effect. The number moves every time.
   */
  const [focusNonce, setFocusNonce] = useState(0)

  /**
   * FR-2.5 — `/` focuses the field from anywhere. The guard matters more than
   * the shortcut: without it, typing a slash into the note editor or a filter
   * box would yank focus to the header mid-sentence.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      event.preventDefault()
      setOpen(true)
      setFocusNonce((nonce) => nonce + 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /**
   * §8.2 — on a phone the field is an icon that expands, and **it has to
   * collapse again**. It did at M0 with an `onBlur`; M3 gave it a dropdown and
   * the handler did not survive the rewrite, so the expanded field sat across
   * the header covering the mark and the theme toggle until the page was
   * reloaded.
   *
   * The delay is the whole difficulty: clicking a result blurs the input, and
   * collapsing on that blur unmounts the dropdown before the click lands on it.
   * So the collapse is queued and anything that means "still using this" —
   * selecting a result, focusing again — cancels it.
   */
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelCollapse = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = null
  }
  const collapseSoon = () => {
    cancelCollapse()
    collapseTimer.current = setTimeout(() => setOpen(false), 200)
  }
  useEffect(() => cancelCollapse, [])

  /**
   * The same three intents `prefetch.ts` warms the watch route on, for the same
   * reason and against two costs instead of one: the field's chunk and the
   * catalogue it searches. A pointer arrives before a click, a touch before a
   * tap completes, and a tab stop before a keystroke — so by the time there is a
   * term to match, both are usually already here.
   *
   * Failure is silent, and deliberately **not** `fresh` — the same exception
   * `prefetch.ts` makes, for the same reason. Everything here is speculative: it
   * runs when a pointer crosses the control, so reloading the page on a failure
   * would throw away whatever somebody was reading because they moved the mouse
   * near the search box. If the chunk really is gone, the `lazy()` above is
   * wrapped and handles it at the moment it is genuinely wanted.
   */
  const warm = () => {
    void import('./SearchField.tsx').catch(() => undefined)
    void queryClient.prefetchQuery(catalogQueryOptions).catch(() => undefined)
  }

  return (
    <div className="cc-search" data-open={open}>
      {/*
        **The trigger, and it is a trigger on both layouts — which is the
        correction that made §12 actually pay.**

        The first attempt rendered the real field here and let `shell.css` hide
        it below 768 px, on the theory that CSS deciding the layout was the whole
        point. It is, for *layout* — but `display: none` is not a decision React
        can see, so the field mounted at every width, its chunk loaded at every
        width, and the front door downloaded 190 KB of Ant Design to draw a
        magnifying glass it then hid. Measured in the Lighthouse waterfall:
        ContextIsolator at 62 KB, three more AntD chunks at 34, 28 and 22.

        So the control that is always in the markup is this button, at the size
        the field will be, and the field replaces it when somebody wants it.
        `shell.css` still decides which *shape* the button is — 44 px of icon on a
        phone, a full-width field on a desktop — so the header still has its
        geometry before any script runs. What it no longer decides is whether
        Ant Design is downloaded.

        Warmed on the three intents from `prefetch.ts`, so in practice the chunk
        is here before the click completes.
      */}
      <button
        type="button"
        className="cc-search-trigger"
        aria-label={t('search.open')}
        aria-expanded={open}
        onPointerEnter={warm}
        onTouchStart={warm}
        onFocus={warm}
        onClick={() => {
          setOpen(true)
          setFocusNonce((nonce) => nonce + 1)
        }}
      >
        <SearchIcon />
        {/* Shown only on the desktop shape, where the button is a field and an
            empty one would read as broken. */}
        <span className="cc-search-hint">{t('search.placeholder')}</span>
      </button>

      {open ? (
        <div className="cc-search-field">
          {/*
            The fallback is sized, not empty. A `null` here would collapse the
            header's centre column until the chunk resolved and then push the
            theme toggle and the account control sideways — a layout shift in the
            one region of the page that is on screen for every visit. The bar is
            the trigger's own height, so nothing moves in either direction.
          */}
          <Suspense
            fallback={
              <div
                className="cc-skeleton-bar cc-search-placeholder"
                aria-label={t('state.loading')}
              />
            }
          >
            <SearchField
              autoFocus
              focusNonce={focusNonce}
              onBlur={collapseSoon}
              onStay={cancelCollapse}
              onClose={() => {
                cancelCollapse()
                setOpen(false)
              }}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}
