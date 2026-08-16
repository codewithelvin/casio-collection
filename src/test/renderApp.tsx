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
 */
export function renderApp(initialEntry = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  function Harness() {
    const mode = useUiStore((state) => state.mode)
    return (
      <ConfigProvider theme={themeConfig(mode)}>
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
