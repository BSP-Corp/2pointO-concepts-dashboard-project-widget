import { useCallback, useEffect, useState } from 'react'
import { COST_ANALYSIS_PAGE, PAGES } from '@/config/zoho'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { useTheme } from '@/lib/theme'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProcurementPage } from '@/features/procurement/ProcurementPage'
import { ProjectPage } from '@/features/project/ProjectPage'
import { Toaster } from './toast'
import { ThemeContext } from './TopBar'
import './console.css'

export type Route = { page: 'home' } | { page: 'project'; projectId: string } | { page: 'procurement'; projectId: string }

export interface Nav {
  home: () => void
  project: (id: string) => void
  procurement: (id: string) => void
  /** An estimate without an approved project opens in the Cost Analysis widget only. */
  costAnalysis: (estimateId: string) => void
}

/**
 * One widget, three Creator pages. The page parameters decide what shows:
 *  - Home (no parameter)                          → Project Search Dashboard
 *  - Project_Widget?project_id=<ID>               → Project Widget
 *  - Procurement_Schedule?procurement_project_id= → Procurement Schedule
 * The selection lives in the page URL, so a refresh keeps the page and the project.
 */
export function ConsoleApp() {
  const ds = useDataSource()
  const [route, setRoute] = useState<Route | null>(null)
  const [theme, toggleTheme] = useTheme()

  const resolve = useCallback(async () => {
    const params = await ds.getPageParams().catch(() => ({}) as Record<string, string>)
    const procurement = params[PAGES.procurementParam]
    const project = params[PAGES.projectParam]
    setRoute(procurement !== undefined ? { page: 'procurement', projectId: procurement } : project !== undefined ? { page: 'project', projectId: project } : { page: 'home' })
  }, [ds])

  useEffect(() => {
    resolve()
    window.addEventListener('popstate', resolve)
    return () => window.removeEventListener('popstate', resolve)
  }, [resolve])

  const nav: Nav = {
    home: () => ds.navigate(`#Page:${PAGES.home}`),
    project: (id) => ds.navigate(`#Page:${PAGES.project}?${PAGES.projectParam}=${encodeURIComponent(id)}`),
    procurement: (id) => ds.navigate(`#Page:${PAGES.procurement}?${PAGES.procurementParam}=${encodeURIComponent(id)}`),
    costAnalysis: (estimateId) => ds.navigate(`#Page:${COST_ANALYSIS_PAGE.name}?quo_id=${encodeURIComponent(estimateId)}&act_ion=create`),
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle: toggleTheme }}>
      <div className="gc-app">
        {!route ? (
          <div className="gc-main">
            <div className="gc-skeleton" style={{ height: 280 }} aria-busy="true" aria-label="Loading" />
          </div>
        ) : route.page === 'home' ? (
          <DashboardPage nav={nav} />
        ) : route.page === 'project' ? (
          <ProjectPage key={route.projectId} projectId={route.projectId} nav={nav} />
        ) : (
          <ProcurementPage key={route.projectId} projectId={route.projectId} nav={nav} />
        )}
        <Toaster />
      </div>
    </ThemeContext.Provider>
  )
}
