import { useRouteError } from 'react-router-dom'
import { ErrorState } from './ErrorState'

/**
 * FR-10.1 — what a visitor sees when something in the router throws.
 *
 * It is `ErrorState` and nothing else, for the reason that component's header
 * gives: the underlying message names a file path and a schema, which tells a
 * visitor nothing and tells a scraper something. The one useful thing on offer
 * is **try again**, and here that is a reload rather than a re-render, because
 * by far the most likely reason to be on this screen is a stale tab asking for
 * chunks a deploy has replaced (`chunkReload.ts`). A retry that re-rendered the
 * same page in the same tab would ask for the same missing file.
 *
 * `chunkReload.ts` already reloads once, on its own, without anybody seeing
 * this. Getting here therefore means either that it declined — offline, or a
 * reload that failed the same way — or that this is an ordinary application
 * error and not a deploy at all. Both are served by the same button; the first
 * is worth a second press by a human, and the second is worth one anyway.
 *
 * **Statically imported by `router.tsx`, unlike everything else it renders.**
 * This is the screen for "a chunk would not load", so it cannot be in a chunk.
 */
export function RouteError() {
  const error = useRouteError()

  // The only trace there is. This site has no error reporting (§17 rules out
  // the third-party script that would be needed), so the browser console is
  // where a visitor's report can be reconciled with what actually threw — which
  // is exactly how the account-menu failure was diagnosed.
  console.error('Route error:', error)

  return <ErrorState onRetry={() => location.reload()} />
}
