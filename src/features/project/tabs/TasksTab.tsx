import { useState } from 'react'
import { Empty, ErrorPanel, Panel } from '@/features/console/ui'
import type { WorkTask } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
import { isDone, isTaskList, taskIssues, workTasks } from '../model'
import { TaskDialog } from '../TaskDialog'
import { TaskTree, type TreeContext } from '../TaskTree'

/**
 * Tasks grouped by task list, as Zoho Projects ("Group by: Task List"): task list → tasks → subtasks, with inline
 * Start / Due / Duration / Status / Priority / Completion. Data issues are listed below — never hidden.
 */
export function TasksTab(c: TabContext) {
  const q = c.queries.tasks
  const [open, setOpen] = useState<WorkTask | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" />
  const all = q.data
  const teamIds = new Set(c.details.team.map((m) => m.id))
  const linked = new Set((c.milestones ?? []).flatMap((m) => m.lists.map((l) => l.id)))
  const milestoneOf = new Map((c.milestones ?? []).flatMap((m) => m.lists.map((l) => [l.id, m.milestone.name] as const)))
  const lists = all.filter(isTaskList).sort((a, b) => (milestoneOf.get(a.id) ?? '~').localeCompare(milestoneOf.get(b.id) ?? '~') || a.name.localeCompare(b.name) || a.workPackage.localeCompare(b.workPackage))
  const work = workTasks(all)
  const ctx: TreeContext = { projectId: c.project.id, all, canEdit: c.details.canEdit, order: c.details.taskOrder, today: c.today, showClosed: filter === 'all', onOpen: setOpen, plan: c.queries.planMilestones.data }
  const issues = all.map((t) => ({ t, list: taskIssues(t, all, teamIds, c.milestones ? linked : undefined) })).filter((x) => x.list.length)

  return (
    <div className="gc-stack">
      <Panel
        title={`Tasks (${work.length})`}
        flush
        actions={
          <span className="gc-seg" role="group" aria-label="Show">
            <button type="button" className={filter === 'open' ? 'is-on' : ''} aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>
              All open ({work.filter((t) => !isDone(t)).length})
            </button>
            <button type="button" className={filter === 'all' ? 'is-on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </button>
          </span>
        }
      >
        {lists.length === 0 ? <Empty>No records for this project</Empty> : <TaskTree lists={lists} ctx={ctx} label="Tasks by task list" />}
      </Panel>
      {issues.length > 0 && (
        <Panel title={`Data issues (${issues.length})`}>
          <ul className="gc-rows">
            {issues.map(({ t, list }) => (
              <li key={t.id}>
                <span className="gc-rows__main">
                  <button type="button" className="gc-link" onClick={() => setOpen(t)}>
                    {t.name || '—'}
                  </button>
                  {list.map((i) => (
                    <span key={i} className="gc-small gc-danger">
                      ⚠ {i}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {open && <TaskDialog task={open} all={all} team={c.details.team} projectId={c.project.id} canEdit={c.details.canEdit} order={c.details.taskOrder} plan={c.queries.planMilestones.data} onClose={() => setOpen(null)} />}
    </div>
  )
}
