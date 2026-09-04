import { afterEach, describe, expect, it } from 'vitest'
import { reportablePath, sendPageView, startAnalytics } from './gtag'

interface AnalyticsWindow extends Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

const scope = window as AnalyticsWindow

afterEach(() => {
  delete scope.dataLayer
  delete scope.gtag
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((n) => n.remove())
})

describe('startAnalytics', () => {
  it('does nothing at all with no measurement ID', () => {
    expect(startAnalytics('')).toBe(false)
    expect(scope.dataLayer).toBeUndefined()
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull()
  })

  it('loads the tag from googletagmanager with the ID in the query', () => {
    expect(startAnalytics('G-ZPV33WSDLL')).toBe(true)
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="googletagmanager"]')
    expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ZPV33WSDLL')
    expect(script?.async).toBe(true)
  })

  /**
   * The whole reason this module exists rather than a pasted snippet: nothing
   * it writes may be an inline script, because `script-src 'self'` refuses one
   * and the only fix would be `'unsafe-inline'`.
   */
  it('adds no inline script', () => {
    startAnalytics('G-ZPV33WSDLL')
    const inline = [...document.head.querySelectorAll('script')].filter((s) => !s.src)
    expect(inline).toHaveLength(0)
  })

  it('queues js and config before the tag has loaded', () => {
    startAnalytics('G-ZPV33WSDLL')
    const calls = (scope.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
    expect(calls[0]?.[0]).toBe('js')
    expect(calls[0]?.[1]).toBeInstanceOf(Date)
    expect(calls[1]?.[0]).toBe('config')
    expect(calls[1]?.[1]).toBe('G-ZPV33WSDLL')
  })

  /**
   * `config` sends a page view of its own and then never fires again on a client
   * -side navigation, so leaving it on would give one view per session and a
   * duplicate of the first one. `usePageViews` sends every view instead.
   */
  it('turns the automatic page view off, because the router sends them', () => {
    startAnalytics('G-ZPV33WSDLL')
    const config = Array.from((scope.dataLayer ?? [])[1] as ArrayLike<unknown>)
    expect(config[2]).toEqual({ send_page_view: false })
  })

  it('is safe to call twice — the second call re-queues nothing', () => {
    expect(startAnalytics('G-ZPV33WSDLL')).toBe(true)
    expect(startAnalytics('G-ZPV33WSDLL')).toBe(false)
    expect(scope.dataLayer).toHaveLength(2)
    expect(document.head.querySelectorAll('script[src*="googletagmanager"]')).toHaveLength(1)
  })
})

describe('reportablePath (D45)', () => {
  it('collapses a published profile to the shape of one', () => {
    expect(reportablePath('/u/elvin')).toBe('/u/:handle')
    expect(reportablePath('/u/somebody-else')).toBe('/u/:handle')
    expect(reportablePath('/u')).toBe('/u/:handle')
  })

  it('collapses an auth step, which can carry a provider code', () => {
    expect(reportablePath('/auth/callback')).toBe('/auth/:step')
  })

  it('leaves every catalogue path exactly as it is', () => {
    for (const path of ['/', '/line/g-shock/', '/watch/ga-2100-1a1/', '/symbols/', '/editions/']) {
      expect(reportablePath(path)).toBe(path)
    }
  })

  /** `/uno` is not a profile, and a prefix test that thinks so would say it is. */
  it('does not mistake another path beginning with u for a profile', () => {
    expect(reportablePath('/unowned')).toBe('/unowned')
  })
})

describe('sendPageView', () => {
  it('does nothing when analytics never started', () => {
    expect(() => sendPageView('/watch/f-91w-1/')).not.toThrow()
    expect(scope.dataLayer).toBeUndefined()
  })

  it('sends the path and the search string, which are different pages', () => {
    startAnalytics('G-ZPV33WSDLL')
    sendPageView('/search', '?q=casiotron')
    const view = Array.from((scope.dataLayer ?? [])[2] as ArrayLike<unknown>)
    expect(view[0]).toBe('event')
    expect(view[1]).toBe('page_view')
    expect(view[2]).toMatchObject({ page_path: '/search?q=casiotron' })
  })

  it('never sends a handle to Google, even in the full location', () => {
    startAnalytics('G-ZPV33WSDLL')
    sendPageView('/u/elvin')
    const view = Array.from((scope.dataLayer ?? [])[2] as ArrayLike<unknown>)
    expect(JSON.stringify(view[2])).not.toContain('elvin')
    expect(view[2]).toMatchObject({ page_path: '/u/:handle' })
  })
})
