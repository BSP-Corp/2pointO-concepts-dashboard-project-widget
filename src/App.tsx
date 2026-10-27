import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DataSourceProvider } from '@/lib/data/DataSourceProvider'
import type { DataSource } from '@/lib/data'
import { ConsoleApp } from '@/features/console/ConsoleApp'

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } } })
}

const queryClient = createQueryClient()

// Standalone widget: no router. The selected project is held in ConsoleApp state,
// so the widget never depends on URL params, a record ID or the parent page.
export function App({ source, client = queryClient }: { source: DataSource; client?: QueryClient }) {
  return (
    <DataSourceProvider source={source}>
      <QueryClientProvider client={client}>
        <ConsoleApp />
      </QueryClientProvider>
    </DataSourceProvider>
  )
}
