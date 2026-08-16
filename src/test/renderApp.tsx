import { ConfigProvider, App as AntdApp } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { routes } from '../router'
import { themeConfig } from '../theme/tokens'
import { useUiStore } from '../ui/uiStore'

/**
 * Mounts the real route table in a memory router at a given URL, inside the
 * same providers App.tsx uses. Tests that drive a hand-written route list prove
 * only that the list in the test is consistent with itself.
 *
 * One deliberate difference from App.tsx: **animation is off**. AntD's Drawer
 * and Modal open over a transition, and under jsdom that transition is real
 * wall-clock time competing with every other test file for one machine's cores.
 * The drawer test failed on a loaded machine and passed on an idle one, which is
 * the worst kind of red — a gate that blocks a deploy for a reason that is not
 * about the code. Turning motion off removes the wait rather than raising the
 * timeout above it; what the test is asserting is that the drawer opens, never
 * how long it takes to slide.
 */
export function renderApp(initialEntry = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  function Harness() {
    const mode = useUiStore((state) => state.mode)
    const base = themeConfig(mode)
    return (
      <ConfigProvider theme={{ ...base, token: { ...base.token, motion: false } }}>
        <AntdApp>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </AntdApp>
      </ConfigProvider>
    )
  }

  return { router, ...render(<Harness />) }
}
