import { useLocation } from 'react-router-dom'
import { t } from '../i18n/strings'
import { useUiStore } from './uiStore'
import { analyticsConfigured, sendPageView, startAnalytics } from '../analytics/gtag'

/**
 * D68 — the analytics consent banner.
 *
 * **Hand-rolled rather than an AntD `Alert` or `Modal`, for the same reason the
 * footer's disclosure is** (§12): this renders in the shell, on every URL, and a
 * component from the library would put Ant Design's theme runtime back into the
 * first load of the whole site to draw a bar that most visits see once.
 *
 * **It does not trap focus and it does not cover the page.** A consent banner
 * that blocks the content until it is answered is asking for a click rather than
 * for a decision, and it is the pattern that makes *Accept* the fastest way to
 * read the page. This one sits at the bottom, the site works around it, and both
 * answers are one press. It is a `region` rather than a `dialog` for the same
 * reason — a dialog announces something the reader must deal with first.
 *
 * **Accepting starts analytics in this page load, not the next one.** The gate
 * is checked at boot in `main.tsx`, so without this the visit that granted
 * consent would be the one visit never counted. It also sends the current page
 * view by hand, because `startAnalytics` deliberately turns the automatic one
 * off and `usePageViews` has already fired for this location.
 */
export function ConsentBanner() {
  const { pathname, search } = useLocation()
  const consent = useUiStore((state) => state.consent)
  const promptOpen = useUiStore((state) => state.consentPromptOpen)
  const setConsent = useUiStore((state) => state.setConsent)
  const closePrompt = useUiStore((state) => state.closeConsentPrompt)

  /**
   * **Nothing to consent to, so nothing is asked** — and this was missing when
   * consent first shipped, which put a live banner in front of every visitor
   * asking them to agree to a Google Analytics that was not configured and
   * never loaded. Verified against the live site rather than reasoned about:
   * banner present, no gtag script, no dataLayer.
   *
   * The gate below answers *has this reader decided?* and cannot answer *is
   * there a decision to make?* — a fork of this repository, a preview build and
   * every local `npm run build` are all in that state, and each of them would
   * have shown the same meaningless question.
   */
  if (!analyticsConfigured()) return null

  // Unasked, or asked again from the footer. Note that a reader who has already
  // answered sees nothing here, on any page, ever — the banner is not a fixture.
  if (consent !== null && !promptOpen) return null

  const accept = () => {
    setConsent('granted')
    startAnalytics()
    sendPageView(pathname, search)
  }

  // Declining after having accepted cannot un-send what was already sent, and
  // this does not pretend otherwise. What it does is stop the tag being loaded
  // on every page from here on — `startAnalytics` is never called again, and the
  // next page load boots with the gate shut.
  const decline = () => setConsent('denied')

  return (
    <section className="cc-consent" role="region" aria-label={t('consent.label')}>
      <div className="cc-consent-inner">
        <div className="cc-consent-copy">
          <p className="cc-consent-title">{t('consent.title')}</p>
          <p className="cc-consent-body">{t('consent.body')}</p>
          <p className="cc-consent-body cc-quiet">{t('consent.privacy')}</p>
        </div>

        {/* Decline first in the DOM, so it is what a keyboard reaches first and
            what a screen reader hears first. The two are identical to look at:
            the moment one of them is quieter than the other, the quiet one is
            the one being discouraged. */}
        <div className="cc-consent-actions">
          <button type="button" className="cc-consent-button" onClick={decline}>
            {t('consent.decline')}
          </button>
          <button type="button" className="cc-consent-button" onClick={accept}>
            {t('consent.accept')}
          </button>
          {/* Only when reopened from the footer: a way out that changes nothing.
              It does not exist on the first ask, because there a dismissal would
              be a third answer and the whole point is that there are two. */}
          {promptOpen && consent !== null ? (
            <button type="button" className="cc-consent-close" onClick={closePrompt}>
              {t('consent.close')}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
