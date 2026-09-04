/**
 * D68 — consent, and it is a **gate rather than a signal.**
 *
 * Google's own answer to this is Consent Mode: load gtag.js immediately, declare
 * `analytics_storage: denied`, and let it send cookieless pings that Google
 * models into estimated traffic. That is more data for the property, and it is
 * still a request to Google carrying an IP address and a page URL from somebody
 * who has not agreed to anything. This site already took the harder position
 * once — D45 keeps published collections out of Google because *being listed is
 * a materially different sentence from the one they agreed to* — and the same
 * argument answers this one the same way.
 *
 * So: **until consent is granted, gtag.js is never fetched.** No script, no
 * cookie, no beacon, no contact with Google at all. That is a sentence that can
 * be written on the banner and be true, which the Consent Mode version is not.
 *
 * **Declining is as cheap as accepting**, and that is a requirement rather than
 * a courtesy — consent that is easier to give than to refuse is not consent.
 * Two buttons, same size, same weight, neither pre-selected, and dismissing the
 * banner is not a third answer.
 *
 * Storing the answer needs no consent of its own: a record of what somebody
 * chose is strictly necessary to honour the choice, and the alternative is
 * asking them again on every page.
 */

export const CONSENT_STORAGE_KEY = 'cc-analytics-consent'

/** `null` is *not yet asked*, and is the state the banner exists for. */
export type Consent = 'granted' | 'denied' | null

/**
 * Read the stored choice.
 *
 * Anything that is not one of the two known answers reads as **unasked** rather
 * than as consent — a corrupted value, a key some other tool wrote, or a
 * half-finished migration must never resolve to *granted*. Storage that throws
 * (private mode, storage disabled, an embedded webview) is the same answer for
 * the same reason.
 */
export function readConsent(): Consent {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    return null
  }
}

/**
 * Record a choice. Returns whether it could actually be stored, because a
 * choice that cannot be remembered is one the reader will be asked to make
 * again, and the caller may want to say so rather than pretend.
 *
 * A grant that cannot be persisted still counts for this page load: the gate is
 * in memory, the storage is only what carries it to the next visit.
 */
export function writeConsent(value: Exclude<Consent, null>): boolean {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

/** Forget the choice, so the next read is *unasked* and the banner returns. */
export function clearConsent(): boolean {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

/**
 * The one question the rest of the app asks. Written as a function rather than
 * read inline so that *no analytics without this returning true* is a single
 * line to find and a single line to test.
 */
export function analyticsAllowed(): boolean {
  return readConsent() === 'granted'
}
