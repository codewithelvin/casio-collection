import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { RequireSession } from './auth/RequireSession'
// A named function in `config.ts`, not an inline block: it is the counterpart of
// `authCallbackUrl()` and belongs beside it, and it needs tests of its own.
import { forwardOAuthReturnAtRoot } from './auth/config.ts'
// A route chunk that will not load means the deploy moved under this tab, and
// the tab has to reload to learn the new hashes. The function was written here,
// for the route table; it moved to a module of its own once it became clear the
// route table is not where the reports were coming from. See its header.
import { fresh } from './chunkReload.ts'
// Statically imported, and that is the one thing this import cannot be. It is
// what renders when a chunk fails to load, so fetching it at that moment is
// asking the network for the apology as well as the thing it apologises for.
import { RouteError } from './ui/RouteError'

/**
 * §12 — **every screen that renders Ant Design says so here, by being wrapped.**
 *
 * `AntdRoot` used to be the top of `App.tsx`, which put `ConfigProvider` and
 * `AntdApp` — and through them AntD's theme runtime, `rc-field-form` and the
 * message/notification/Modal holders — in the entry chunk of all 3 000-odd URLs
 * on this site. Wrapping per route instead means the providers land beside the
 * route chunk that needs them, and the two screens that need none of it (the
 * front door, and the 404) load none of it.
 *
 * It is applied here rather than inside each screen for the same reason
 * `guarded` is: a rule each new route has to remember to apply is a rule a route
 * will one day forget. The failure mode is quieter than the auth one but it is
 * the same shape — an AntD component outside a provider renders in AntD's
 * default theme, which on this site is the wrong blue at the wrong base size.
 *
 * **The import is dynamic and awaited beside the screen, not at the top of this
 * file.** `router.tsx` is in the entry chunk, so a static `import AntdRoot` here
 * would put Ant Design straight back into the first load and undo the whole
 * exercise — which is a mistake worth leaving a comment about, because the file
 * gives no other hint. `Promise.all` is the other half: awaiting the two in
 * sequence would make every first navigation to a themed route pay two network
 * round trips instead of one.
 *
 * **Both sides are wrapped.** `AntdRoot` is a hashed chunk like any other and a
 * deploy 404s it exactly as readily as the screen beside it; wrapping only the
 * screen meant a stale tab reloaded for nine routes and threw for the same nine
 * whenever the provider happened to lose the race.
 */
async function themed(
  load: () => Promise<{ default: ComponentType }>,
): Promise<{ Component: ComponentType }> {
  const [{ default: Screen }, { default: AntdRoot }] = await Promise.all([
    fresh(load),
    fresh(() => import('./ui/AntdRoot')),
  ])
  return {
    Component: () => (
      <AntdRoot>
        <Screen />
      </AntdRoot>
    ),
  }
}

/**
 * §7.3's *Auth* column, made real (M4).
 *
 * It belongs in the route table rather than inside each screen for the same
 * reason the table is exported rather than inlined: a rule each new route has
 * to remember to apply is a rule a route will one day forget, and the failure
 * mode is a private page rendering for a stranger. Here, adding a route without
 * deciding which column it is in is not possible.
 *
 * The guard wraps the screen **after** its lazy import resolves, so a guest
 * still downloads nothing until they navigate.
 */
async function guarded(
  load: () => Promise<{ default: ComponentType }>,
): Promise<{ Component: ComponentType }> {
  const [{ default: Screen }, { default: AntdRoot }] = await Promise.all([
    fresh(load),
    fresh(() => import('./ui/AntdRoot')),
  ])
  return {
    // The provider goes **outside** the guard, because the guard renders an
    // `EmptyState` and a sign-in button of its own and those have to be themed
    // too — a guest who lands on /collection sees the guard, never the screen.
    Component: () => (
      <AntdRoot>
        <RequireSession>
          <Screen />
        </RequireSession>
      </AntdRoot>
    ),
  }
}

/**
 * §7.3 — the route table. Every route is lazily imported so only the shell and
 * the current route are in the first load (§12), which is most of how D28's
 * 380 KB budget is met.
 *
 * The table is exported separately from the browser router that consumes it so
 * tests can mount it in a memory router at any URL. Proving that /watch/:id
 * resolves and that an unknown path renders the 404 only means something if the
 * test drives the same table production does.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    /**
     * FR-10.1 — **the last resort, and until now there was none.**
     *
     * With no `errorElement` anywhere, React Router renders its own developer
     * page: *Unexpected Application Error!* over a stack trace, under a 💿 and
     * the words "Hey developer 👋 — you can provide a way better UX than this".
     * A visitor was shown that, which is both the worst version of the failure
     * and an invitation addressed to the wrong person.
     *
     * It goes on the **root** route rather than on each child because the error
     * that prompted it was not thrown by a child: the account control is in the
     * header, so it throws from inside `AppShell` itself and a child's boundary
     * would never see it. A route's own `errorElement` does catch its element,
     * which is why this one is here and covers everything below it too.
     *
     * What it can offer is a reload — see `chunkReload.ts` for why that is the
     * right and usually the only useful action.
     */
    errorElement: <RouteError />,
    children: [
      // **The front door is not `themed`, and that is the point of §12.** It
      // renders a heading, a paragraph and seven cards, all of them plain
      // elements — so the page Lighthouse loads and most first visits land on
      // pulls no Ant Design at all.
      {
        index: true,
        lazy: async () => ({ Component: (await fresh(() => import('./routes/home'))).default }),
      },
      { path: 'line/:line', lazy: () => themed(() => import('./routes/line')) },
      { path: 'line/:line/:series', lazy: () => themed(() => import('./routes/series')) },
      // D62 — the second way through the catalogue. Nested under one segment
      // rather than given a singular sibling (`/edition/:id`), because an
      // edition page's parent genuinely is the list of editions — unlike a
      // series, whose parent is its line and not "all series".
      { path: 'editions', lazy: () => themed(() => import('./routes/editions')) },
      { path: 'editions/:edition', lazy: () => themed(() => import('./routes/edition')) },
      { path: 'watch/:modelId', lazy: () => themed(() => import('./routes/watch')) },
      // **Not `themed`, for the same reason the front door is not.** The symbol
      // glossary is a heading, a jump list and forty rows of text over
      // `symbols.css`; it renders no Ant Design and reads no catalogue, so
      // wrapping it would put the theme runtime behind a document that is
      // finished the moment its chunk lands.
      {
        path: 'symbols',
        lazy: async () => ({ Component: (await fresh(() => import('./routes/symbols'))).default }),
      },
      { path: 'search', lazy: () => themed(() => import('./routes/search')) },
      // The two rows §7.3 marks "required". `guarded` supplies the provider
      // itself, for the reason written above it.
      // No `fresh` at these two call sites any more; `guarded` applies it, as
      // `themed` always did. Two routes remembering by hand a rule the other
      // eleven get from their wrapper is how the rule stops being true.
      { path: 'collection', lazy: () => guarded(() => import('./routes/collection')) },
      { path: 'settings', lazy: () => guarded(() => import('./routes/settings')) },
      { path: 'u/:handle', lazy: () => themed(() => import('./routes/profile')) },
      { path: 'auth/callback', lazy: () => themed(() => import('./routes/auth')) },
      { path: '*', lazy: () => themed(() => import('./routes/notFound')) },
    ],
  },
]

/**
 * Before the router reads the address bar, not after.
 *
 * `createBrowserRouter` captures `window.location` as it is constructed, so a
 * `?code=` that arrives at the root has to be moved onto the callback path at
 * module scope — one statement earlier and the front door has already been
 * chosen. See `forwardOAuthReturnAtRoot` for what it is a net under; on every
 * ordinary URL it reads two properties and returns.
 */
forwardOAuthReturnAtRoot()

/**
 * `basename` comes from BASE_URL, never a literal. It read `/casio-collection/`
 * until D39 moved the site to the root of casiovault.com, and this line did not
 * have to change — which is the only proof that writing it this way was right.
 */
export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
