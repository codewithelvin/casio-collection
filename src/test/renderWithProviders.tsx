import type { ReactNode } from 'react'
import { ConfigProvider, App as AntdApp } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'

/**
 * A component under the providers it needs and nothing else.
 *
 * `renderApp` mounts the real route table and is the right tool when what is
 * being proved involves routing — that a guard is on the right route, that a
 * URL survives. It is also the thing M3 measured as starving this suite, and
 * M4 measured again at roughly ten times slower under coverage instrumentation.
 *
 * M5's controls need three providers and a router, and none of what they do
 * depends on which route they are on. Mounting eight screens to press one
 * button buys nothing and costs the seconds that turn a green suite red on a
 * loaded machine.
 *
 * `AntdApp` is not optional here: `App.useApp()` returns no-op stubs without it,
 * so a toast assertion would fail for a reason that has nothing to do with the
 * toast. Motion is off for the same reason `renderApp` turns it off.
 */
export function renderWithProviders(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      // A retried mutation would make FR-4.3's rollback arrive twice and the
      // failure toast appear on a schedule the test cannot predict.
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    ...render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AntdApp>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </QueryClientProvider>
        </AntdApp>
      </ConfigProvider>,
    ),
  }
}
