import { useEffect, useRef } from 'react'
import { LineNav } from './LineNav'
import { CloseIcon } from './icons'
import { t } from '../i18n/strings'

/**
 * §8.2's off-canvas rail, below 768 px.
 *
 * **It was AntD's `Drawer` and is now a fixed panel and a mask (§12).** The
 * Drawer is rc-drawer plus a portal plus rc-motion, and it was in the shell — so
 * a phone downloaded and evaluated all of it to have a panel that is closed. The
 * two things the library was genuinely doing for us are done here explicitly and
 * are the two that matter: focus goes into the panel when it opens and comes back
 * when it closes, and Escape closes it.
 *
 * Rendered only while open, which is why there is no `open` prop any more. AntD's
 * Drawer had to stay mounted to animate its own exit; a CSS animation on mount
 * does not, and a closed drawer that is still in the tree is a focus trap waiting
 * for someone to tab into it.
 */
export default function NavDrawer({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)

  /**
   * Focus moves into the panel and returns to whatever opened it.
   *
   * The hamburger is the thing that opened it in every case, and it is still on
   * screen behind the mask — so *returning* focus is not a nicety, it is the
   * difference between closing the drawer and losing your place in the page.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      {/* Not a button, deliberately: it is a surface that dismisses, and giving
          it a role would put a control with no name into the tab order between
          the header and the panel. Escape and the close button are the
          keyboard's two ways out. */}
      <div className="cc-drawer-mask" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className="cc-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.lines')}
        tabIndex={-1}
      >
        <div className="cc-drawer-head">
          <span>{t('nav.lines')}</span>
          <button
            type="button"
            className="cc-icon-button"
            aria-label={t('nav.close')}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        {/*
          The body scrolls and the nav inside it takes its background from
          whatever it is placed in. That matters more than it looks: the rail
          renders in two places and only one of them is elevated — in dark mode
          the drawer is #1f1f1f and the sider is #141414, and a nav that painted
          its own container colour drew a darker slab across the top third of the
          drawer with a hard seam under the last line.
        */}
        <div className="cc-drawer-body">
          <LineNav onNavigate={onClose} />
        </div>
      </div>
    </>
  )
}
