import { ConfigProvider, App as AntdApp } from 'antd'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { themeConfig } from './theme/tokens'
import { useUiStore } from './ui/uiStore'

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

export default function App() {
  const mode = useUiStore((state) => state.mode)

  return (
    <ConfigProvider theme={themeConfig(mode)}>
      {/* AntD's App wires message/notification/Modal to the theme context.
          With the React 19 patch imported in main.tsx, the static APIs work
          too — this is what makes them pick up the current algorithm. */}
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  )
}
