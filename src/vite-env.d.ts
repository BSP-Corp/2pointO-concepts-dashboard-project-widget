/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'auto' | 'mock' | 'zoho'
  readonly VITE_ZOHO_APP_NAME?: string
  readonly VITE_ZOHO_OWNER?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
