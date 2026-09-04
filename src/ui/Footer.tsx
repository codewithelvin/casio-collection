import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { InfoIcon } from './icons'
import { t } from '../i18n/strings'
import { useUiStore } from './uiStore'

/**
 * D39 renames the repository to `casio-vault` and this line was written against
 * that name — but **the rename has not been done**, so the link 404s on the live
 * site. An audit found it; a visitor would have found it too.
 *
 * It points at the repository that exists. The day the rename happens, GitHub
 * redirects the old name indefinitely, so this keeps working either way — which
 * is exactly why D39 says the rename has to be a deliberate act rather than
 * something noticed when it breaks.
 */
const REPO_URL = 'https://github.com/codewithelvin/casio-collection'

/**
 * FR-10.3 — **one line on screen, and everything else behind an "i".**
 *
 * The footer used to print all of it: the D11 non-affiliation notice, the image
 * attribution, the source link, the catalogue version, the closing line. The
 * client has asked for the closing line alone, with the rest in a disclosure —
 * and that is the second time this footer has been argued down, so the argument
 * is kept rather than quietly overwritten:
 *
 *   * §8.11 wanted the disclaimer as **legible body text and not small print**,
 *     because the name starts with Casio's, the mark is their bezel (D34) and
 *     the colour is their corporate blue. Together those read as an official
 *     Casio property, which is precisely what D11 says this is not.
 *   * The client then asked for the whole footer at small-print sizes, so the
 *     notice went to 12 px and kept the *hierarchy* §8.11 was reaching for.
 *   * Now it is behind a press. What is left of §8.11 is that the notice is
 *     still **first** in the panel, still in the normal text colour rather than
 *     the quiet one, and still a step larger than the metadata under it.
 *
 * **The sentence has not left the site, and that is the part that matters for
 * D11.** FR-10.4 puts it in the `<meta name="description">` and the Open Graph
 * description in `index.html`, so it is what a search result and a pasted link
 * say about this site before anybody arrives — which is the moment the "is this
 * official?" question actually gets asked. The footer copy is the second place
 * it appears, not the only one. If a lawyer ever asks, the answer is this
 * paragraph, the meta tags, and the client's call — not an oversight.
 *
 * The disclosure is hand-rolled rather than AntD's `Popover` because this
 * renders in the shell, and §12 took Ant Design out of the shell entirely: a
 * popover from the library would put the theme runtime back into the first load
 * of every URL on the site to draw a box that is usually closed. What the
 * library would do for us is done here explicitly — Escape closes it, a press
 * outside closes it, and the panel follows the button in the DOM so tabbing
 * reaches its links without any focus management at all.
 */
export function Footer({ catalogVersion }: { catalogVersion?: string | null }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const consent = useUiStore((state) => state.consent)
  const openConsentPrompt = useUiStore((state) => state.openConsentPrompt)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    // `pointerdown` rather than `click`: a press that lands on the page should
    // dismiss the panel *before* whatever it landed on reacts, or a link under
    // an open panel navigates and leaves the panel open on the next page.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && wrapper.current?.contains(target)) return
      setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // A separator glyph rather than a string: it is punctuation between items,
  // it is hidden from assistive technology, and there is nothing in it for a
  // second locale to translate. D12's rule is about user-facing *text*, which is
  // why this is written as an expression and not as JSX text.
  const separator = (
    <span aria-hidden="true" style={{ opacity: 0.5 }}>
      {'·'}
    </span>
  )

  return (
    <footer className="cc-footer">
      <div ref={wrapper} className="cc-footer-inner">
        <p className="cc-footer-made">
          <span>{t('footer.madeBy')}</span>
          <button
            type="button"
            className="cc-footer-info"
            aria-label={t('footer.about')}
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            <InfoIcon />
          </button>
        </p>

        {/* Rendered only while open — a closed panel left in the tree is a set
            of links in the tab order of every page that nobody can see — and
            **after the button in the DOM although it draws above it**. The panel
            is positioned, so its place in the markup costs nothing visually and
            buys the one thing that cannot be styled in: pressing the button and
            then tabbing walks straight into the panel's link, rather than out of
            the footer and backwards. */}
        {open ? (
          <div className="cc-footer-panel" role="dialog" aria-label={t('footer.about')}>
            <p className="cc-footer-notice">{t('footer.disclaimer')}</p>
            {/* **The attribution is its own paragraph now, and the panel is why.**
                It used to share the metadata row with the link and the version,
                separated by middle dots, and that reads correctly across a
                960 px footer. At 360 px it wraps three times and the dot lands
                at the *start* of a line, where it stops being punctuation
                between two items and starts looking like a bullet in front of
                one. A sentence and a list of links are two different things; the
                narrow measure is what made that visible. */}
            <p className="cc-quiet cc-footer-meta">{t('footer.attribution')}</p>
            {/* The one link in this panel that goes somewhere on this site, so
                it gets a line of its own rather than a place in the metadata row
                below — that row is a source link and a version number, which are
                facts about the build rather than somewhere to go.

                **It closes the panel on the way out.** The dismiss handler is a
                `pointerdown` listener that ignores presses inside the wrapper,
                and this link is inside it — so without this the reader lands on
                the glossary with the footer disclosure still hanging open behind
                them. The external link below has the same shape and does not
                need it: it opens a new tab and leaves this page as it was. */}
            <p className="cc-quiet cc-footer-meta">
              <Link to="/symbols" onClick={() => setOpen(false)}>
                {t('nav.symbols')}
              </Link>
            </p>
            {/* D68 — the way back to the analytics question, and the reason it
                is *here* rather than in /settings is that /settings needs a
                session: a signed-out reader who accepted would have had no way
                to change their mind at all, and a consent that is harder to
                withdraw than it was to give is not one. It states the current
                answer rather than just offering the control, so the panel says
                what is happening without anybody having to press anything. */}
            <p className="cc-quiet cc-footer-meta">
              <button
                type="button"
                className="cc-footer-link"
                onClick={() => {
                  setOpen(false)
                  openConsentPrompt()
                }}
              >
                {t('consent.change')}
              </button>
              {separator}
              <span>{consent === 'granted' ? t('consent.state.granted') : t('consent.state.denied')}</span>
            </p>
            <p className="cc-quiet cc-footer-meta">
              <a href={REPO_URL} rel="noreferrer noopener" target="_blank">
                {t('footer.source')}
              </a>
              {/* The catalogue version renders only once there is one. A zero or
                  an em-dash here would be inventing a fact about data that does
                  not exist yet (principle 4). */}
              {catalogVersion ? (
                <>
                  {separator}
                  <span>
                    {t('footer.catalogVersion')} {catalogVersion}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        ) : null}
      </div>
    </footer>
  )
}
