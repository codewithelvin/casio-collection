import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // §7.2 — the catalogue artefacts are immutable per version (§6.2), so
      // there is nothing to revalidate. Supabase queries override this.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

/**
 * §12 — **what is left after Ant Design moved down.**
 *
 * This was `ConfigProvider` over `AntdApp` over the query client over the
 * router, and the top two are now `ui/AntdRoot` — imported by each screen that
 * renders AntD rather than by the whole application. The reason is measured: at
 * 232 KB gzipped the entry chunk took 1 469 ms to evaluate on Lighthouse's
 * mobile profile and nothing appeared until it had, and AntD's theme runtime was
 * the largest part of it that the shell did not need.
 *
 * What remains is the query client — the rail reads the catalogue index through
 * it on every URL — and the router.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
