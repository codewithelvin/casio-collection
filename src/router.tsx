import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { AppShell } from './ui/AppShell'

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
    children: [
      { index: true, lazy: async () => ({ Component: (await import('./routes/home')).default }) },
      {
        path: 'line/:line',
        lazy: async () => ({ Component: (await import('./routes/line')).default }),
      },
      {
        path: 'line/:line/:series',
        lazy: async () => ({ Component: (await import('./routes/series')).default }),
      },
      {
        path: 'watch/:modelId',
        lazy: async () => ({ Component: (await import('./routes/watch')).default }),
      },
      {
        path: 'search',
        lazy: async () => ({ Component: (await import('./routes/search')).default }),
      },
      {
        path: 'collection',
        lazy: async () => ({ Component: (await import('./routes/collection')).default }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('./routes/settings')).default }),
      },
      {
        path: 'u/:handle',
        lazy: async () => ({ Component: (await import('./routes/profile')).default }),
      },
      {
        path: 'auth/callback',
        lazy: async () => ({ Component: (await import('./routes/auth')).default }),
      },
      {
        path: '*',
        lazy: async () => ({ Component: (await import('./routes/notFound')).default }),
      },
    ],
  },
]

/**
 * `basename` comes from BASE_URL, never a literal. It read `/casio-collection/`
 * until D39 moved the site to the root of casiovault.com, and this line did not
 * have to change — which is the only proof that writing it this way was right.
 */
export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
