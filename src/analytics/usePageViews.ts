import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { sendPageView } from './gtag'

/**
 * A page view per route, because on this site a route is what a page is.
 *
 * `gtag('config')` sends one view at document load and nothing afterwards, and
 * every navigation here after the first is React Router swapping a component
 * behind a pushState. Without this, a session that browsed forty watches would
 * report as one view of whatever URL it happened to land on — see `gtag.ts` for
 * why `send_page_view` is off at the source rather than deduplicated here.
 *
 * **It lives in the shell rather than in each route** for the same reason the
 * auth guard does: a rule that every new screen has to remember to apply is a
 * rule a screen will one day forget, and the failure is silent in exactly the
 * way this whole file is written against.
 *
 * `search` is in the dependency list because `/search?q=casiotron` and
 * `/search?q=f-91w` are different pages to a reader and to a report. The hash is
 * not: nothing here routes on it.
 *
 * **The title is read when the effect runs, and on a watch page that can be a
 * beat early.** A route sets `document.title` from data it may still be
 * fetching, so the first view of an uncached watch can carry the previous
 * title. `page_path` and `page_location` are always right, which is what the
 * reports are keyed on; correcting the title would mean waiting on data before
 * reporting a view, and a late view is worse than an imprecise label.
 */
export function usePageViews(): void {
  const { pathname, search } = useLocation()

  useEffect(() => {
    sendPageView(pathname, search)
  }, [pathname, search])
}
