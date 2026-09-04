/**
 * Google Analytics 4, loaded the way S7's Content-Security-Policy allows.
 *
 * **The snippet Google gives you cannot be pasted into this site**, and the
 * failure is silent, which is the only reason this file needs a header this
 * long. That snippet is two `<script>` blocks: one loading `gtag/js` from
 * `googletagmanager.com`, and one *inline* block defining `dataLayer` and
 * calling `gtag('config', …)`. The policy in index.html says `script-src 'self'`.
 * So the browser refuses both — the remote one for its host, the inline one for
 * being inline — and then refuses the measurement beacon as well, because
 * `connect-src` names only this origin and Supabase. Nothing throws. The page
 * renders perfectly. Analytics reports zero users forever.
 *
 * Widening `script-src` to `'unsafe-inline'` would make the paste work and is
 * the one change this file exists to avoid: it re-enables **every** inline
 * script, which is precisely the class of injection S7 is written against, on a
 * site that renders user-authored display names and notes. So the init runs from
 * a module in our own bundle — `'self'`, already allowed — and the only thing
 * granted is the `googletagmanager.com` host and the collection endpoints.
 * `vite.config.ts` widens those three directives, and only when a measurement
 * ID is configured.
 *
 * **`send_page_view: false`, and that is not a preference either.** `config`
 * fires one page view at load and then, on this site, never again: every
 * navigation after the first is React Router changing the URL, not a document
 * load. A 3 500-page catalogue would report one page view per session and never
 * tell you which watch anybody looked at — the entire question analytics is here
 * to answer. The view is sent explicitly instead, from `usePageViews`, on the
 * first render and on every location change after it.
 */

/** The shape gtag.js expects on `window`, and no more of it than is used. */
interface AnalyticsWindow extends Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

/**
 * The measurement ID, or '' when analytics is not configured for this build.
 *
 * A function rather than a constant, and the reason is a bug this shipped with:
 * read once at module scope it cannot be stubbed in a test, so the consent
 * banner could not be tested against a build that has no ID — which is exactly
 * the state that was live. Vite still inlines the value at build time, so this
 * costs nothing in the artefact.
 */
export function measurementId(): string {
  return import.meta.env.VITE_GA_ID ?? ''
}

/**
 * **Whether there is anything to consent to** — and asking this is the whole
 * fix for a defect that reached production.
 *
 * The banner gated on *has this reader answered?* and never on *is analytics
 * configured?*, so the deploy that shipped with `VITE_GA_ID` unset asked every
 * visitor to agree to a Google Analytics that was never going to load. Verified
 * against the live site: banner present, no gtag script, no dataLayer. A
 * consent request for something that is not happening is not a small cosmetic
 * problem — it is the site asking a question it does not mean, which is the
 * opposite of what the banner is for.
 */
export function analyticsConfigured(): boolean {
  return measurementId() !== ''
}

/**
 * `/u/<handle>` is reported as `/u/:handle`, and this is a decision rather than
 * a tidy-up.
 *
 * D45 disallows `/u/` to crawlers, and its rationale is the sentence that
 * matters here: FR-7.3 tells somebody that publishing means *anyone with the
 * link can read it*, and being **listed by Google** is a materially different
 * sentence from the one they agreed to. Sending Google the URL of every profile
 * anybody views is a third sentence again, and nobody agreed to that one either.
 *
 * Dropping the pages from analytics entirely would answer that and lose a real
 * question — *is anybody publishing collections, and does anybody read them?*
 * Collapsing the handle keeps the count and drops the person, so the report says
 * "profiles were viewed 40 times" and cannot say whose. The same applies to
 * `/auth/`, where the URL can carry a provider code.
 *
 * Exported because the rule is worth testing rather than trusting.
 */
export function reportablePath(pathname: string): string {
  if (pathname === '/u' || pathname.startsWith('/u/')) return '/u/:handle'
  if (pathname.startsWith('/auth/')) return '/auth/:step'
  return pathname
}

/**
 * Start gtag.js. Safe to call more than once; the second call does nothing.
 *
 * `document` is a parameter so the test can drive a document it owns rather than
 * asserting against jsdom's global one.
 */
export function startAnalytics(
  id: string = measurementId(),
  doc: Document = document,
): boolean {
  if (id === '') return false

  const scope = window as AnalyticsWindow
  // `dataLayer` is the flag as well as the queue: if it exists, either this ran
  // already or gtag.js is loaded, and re-running would re-queue the config.
  if (scope.dataLayer) return false

  const queue: unknown[] = []
  scope.dataLayer = queue

  /**
   * Google's own snippet pushes `arguments` rather than a rest array, and this
   * copies it deliberately. gtag.js reads the pushed value as an *arguments
   * object*; an array is handled by current builds and is not what the contract
   * says, and this is not a thing worth being clever about in a file whose
   * failure mode is a silent zero.
   */
  function gtag(...args: unknown[]): void {
    void args
    // eslint-disable-next-line prefer-rest-params
    queue.push(arguments)
  }

  scope.gtag = gtag
  gtag('js', new Date())
  gtag('config', id, { send_page_view: false })

  const script = doc.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  doc.head.appendChild(script)

  return true
}

/**
 * One page view. Silently does nothing when analytics never started, which is
 * every test, every dev server and every build with no measurement ID.
 *
 * `page_location` is sent rather than left to gtag because the URL it would read
 * is the one in the address bar at the moment the beacon is assembled, and on a
 * client-side navigation that is a race this code does not need to enter.
 */
export function sendPageView(pathname: string, search = ''): void {
  const scope = window as AnalyticsWindow
  if (!scope.gtag) return

  const path = reportablePath(pathname)
  scope.gtag('event', 'page_view', {
    page_path: `${path}${search}`,
    page_location: `${window.location.origin}${path}${search}`,
    page_title: document.title,
  })
}
