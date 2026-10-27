import { createMockSource } from './mockSource'
import { createZohoSource, isInsideCreator } from './zohoSource'
import type { DataSource } from './types'

export type { DataSource } from './types'

function pickSource(): DataSource {
  const mode = import.meta.env.VITE_DATA_SOURCE ?? 'auto'
  if (mode === 'zoho' || (mode === 'auto' && isInsideCreator())) return createZohoSource()
  return createMockSource()
}

/** Single app-wide data source. Tests inject their own via DataSourceProvider. */
export const defaultDataSource: DataSource = pickSource()
