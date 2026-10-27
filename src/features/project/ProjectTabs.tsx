import { useRef, type KeyboardEvent } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Nav } from '@/features/console/ConsoleApp'
import { CountBadge } from '@/features/console/ui'
import type { useProcurement } from '@/features/projects/api'
import type { CostingLine, PaymentMilestone, PlanMilestone, Project, ProjectDetails, Risk, WorkTask } from '@/types/domain'
import type { BoqRow, MilestoneRow } from './model'
import { workTasks } from './model'
import { ActivityTab } from './tabs/ActivityTab'
import { AssetsTab } from './tabs/AssetsTab'
import { BoqTab } from './tabs/BoqTab'
import { MilestonesTab } from './tabs/MilestonesTab'
import { OverviewTab } from './tabs/OverviewTab'
import { RiskDashboardTab, RiskRegisterTab } from './tabs/RisksTab'
import { TasksTab } from './tabs/TasksTab'

export interface TabContext {
  project: Project
  details: ProjectDetails
  today: string
  queries: {
    tasks: UseQueryResult<WorkTask[]>
    lines: UseQueryResult<CostingLine[]>
    procurement: ReturnType<typeof useProcurement>
    payments: UseQueryResult<PaymentMilestone[]>
    risks: UseQueryResult<Risk[]>
    planMilestones: UseQueryResult<PlanMilestone[]>
  }
  /** BOQ with rate, amount, procured and delivered (undefined while loading) */
  boq?: { rows: BoqRow[]; total: number }
  milestones?: MilestoneRow[]
  onTab: (tab: string) => void
  nav: Nav
}

const TABS = [
  { id: 'overview', label: 'Overview', count: () => undefined, Component: OverviewTab },
  { id: 'boq', label: 'Procurement', count: (c: TabContext) => c.queries.procurement.boq.data?.length, Component: BoqTab },
  { id: 'assets', label: 'Asset Register', count: (c: TabContext) => c.queries.lines.data?.length, Component: AssetsTab },
  { id: 'milestones', label: 'Milestones', count: (c: TabContext) => c.milestones?.length, Component: MilestonesTab },
  { id: 'tasks', label: 'Tasks', count: (c: TabContext) => (c.queries.tasks.data ? workTasks(c.queries.tasks.data).length : undefined), Component: TasksTab },
  { id: 'risks', label: 'Risk Register', count: (c: TabContext) => c.queries.risks.data?.length, Component: RiskRegisterTab },
  { id: 'risk-dashboard', label: 'Risk Dashboard', count: () => undefined, Component: RiskDashboardTab },
  { id: 'activity', label: 'Activity', count: () => undefined, Component: ActivityTab },
] as const

/** Overview, Procurement (BOQ), Asset Register, Milestones, Tasks, Risk Register, Risk Dashboard, Activity — one Project ID; the header never reloads on a switch. */
export function ProjectTabs({ tab, ...ctx }: Omit<TabContext, 'onTab'> & { tab: string; onTab: (t: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  const c: TabContext = ctx
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === active.id)
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null
    if (n === null) return
    e.preventDefault()
    const j = (n + TABS.length) % TABS.length
    ctx.onTab(TABS[j].id)
    refs.current[j]?.focus()
  }
  return (
    <section className="gc-panel gc-panel--flush gc-tabs-card" aria-label="Project modules">
      <div role="tablist" aria-label="Project modules" className="gc-tabs" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`gc-tab-${t.id}`}
            aria-selected={t.id === active.id}
            aria-controls="gc-tabpanel"
            tabIndex={t.id === active.id ? 0 : -1}
            className={`gc-tab ${t.id === active.id ? 'is-on' : ''}`}
            onClick={() => ctx.onTab(t.id)}
          >
            {t.label}
            <CountBadge n={t.count(c)} />
          </button>
        ))}
      </div>
      <div id="gc-tabpanel" role="tabpanel" aria-labelledby={`gc-tab-${active.id}`} className="gc-tabpanel">
        <active.Component {...c} />
      </div>
    </section>
  )
}
