import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { USD_RATES, currencyCode } from '@/lib/utils'
import type { Project } from '@/types/domain'
import { TopBar } from './TopBar'

/**
 * The project header, the same on every page of a project (Project and Procurement; not the dashboard), in the Cost Analysis
 * header's style: Home, Back, the page title and PR #; the project's entity and currency (with its USD rate), Refresh, the page's
 * own buttons, the signed-in user and the light / dark switch — pinned to the top while the page scrolls (side panels open below it).
 */
export function ProjectHeader({
  project,
  page,
  user,
  refreshing,
  onRefresh,
  onHome,
  onProject,
  actions,
}: {
  project?: Project
  /** Page title ('' on the Project page itself = Project); Back then returns to the project */
  page?: string
  user?: string
  refreshing?: boolean
  onRefresh?: () => void
  onHome: () => void
  onProject?: () => void
  actions?: ReactNode
}) {
  const bar = useRef<HTMLElement>(null)
  // Side panels start under the pinned header (--gc-apphead-h), so it stays visible while one is open
  useLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--gc-apphead-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    set()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      document.documentElement.style.removeProperty('--gc-apphead-h')
    }
  }, [])
  const code = project ? currencyCode(project.currency) : ''
  const rate = code ? USD_RATES[code] : undefined
  const back = page ? onProject : onHome
  return (
    <header ref={bar} className="gc-topbar--pinned gc-apphead-wrap" aria-label="Project header">
      <div className="gc-apphead">
        <div className="gc-apphead__left">
          <button type="button" className="gc-pill" onClick={onHome} title="Back to the Project Search Dashboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
            Home
          </button>
          <button type="button" className="gc-pill" onClick={back} disabled={!back} title={page ? 'Back to the project' : 'Back to the Project Search Dashboard'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 6-6 6 6 6" />
            </svg>
            Back
          </button>
          <span className="gc-apphead__title" aria-current="page">
            {page || 'Project'}
          </span>
          {project?.reference && <span className="gc-apphead__ref">{project.reference}</span>}
        </div>
        <div className="gc-apphead__right">
          {project && (
            <dl className="gc-apphead__ctx" aria-label="Project entity and currency">
              <div>
                <dt>Entity:</dt>
                <dd>{project.countries.join(', ') || '—'}</dd>
              </div>
              <div className="gc-apphead__cur">
                <div>
                  <dt>Currency:</dt>
                  <dd title={project.currency}>{code || '—'}</dd>
                </div>
                {rate !== undefined && code !== 'USD' && (
                  <div className="gc-apphead__rate" title="Rate used by the Cost Analysis">
                    <dt>USD 1 =</dt>
                    <dd>
                      {code} {rate}
                    </dd>
                  </div>
                )}
              </div>
            </dl>
          )}
          {onRefresh && (
            <button type="button" className="gc-pill" onClick={onRefresh} disabled={refreshing} title="Read the latest data from Creator">
              {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
            </button>
          )}
          {actions}
          <TopBar name={user} />
        </div>
      </div>
    </header>
  )
}
