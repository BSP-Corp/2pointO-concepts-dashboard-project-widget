import { createContext, useContext, type ReactNode } from 'react'
import type { DataSource } from './types'

const DataSourceContext = createContext<DataSource | null>(null)

export function DataSourceProvider({ source, children }: { source: DataSource; children: ReactNode }) {
  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>
}

export function useDataSource(): DataSource {
  const ds = useContext(DataSourceContext)
  if (!ds) throw new Error('useDataSource must be used inside <DataSourceProvider>')
  return ds
}
