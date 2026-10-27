import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { defaultDataSource } from './lib/data'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App source={defaultDataSource} />
  </StrictMode>,
)
