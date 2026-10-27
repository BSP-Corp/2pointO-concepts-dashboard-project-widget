import { useState } from 'react'
import { Progress } from '@/features/console/ui'
import { useOptions, useUpdateTask } from '@/features/projects/api'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate, sortByOrder } from '@/lib/utils'
import type { PlanMilestone, WorkTask } from '@/types/domain'
import { MilestoneMap } from './MilestoneMap'
import { InlineDate } from './InlineDate'
import { InlineNumber, InlineSelect, InlineText } from './InlineCells'
import { childrenOf, descendants, durationOf, endFromDuration, isDelayed, isDone, wpTag } from './model'
import { TASK_STATUSES } from './TaskDialog'

const PRIORITIES = ['High', 'Medium', 'Low'].map((p) => ({ id: p, label: p }))
const PRIORITY_TONE: Record<string, 'critical' | 'warning' | 'good' | undefined> = { High: 'critical', Medium: 'warning', Low: 'good' }

export interface TreeContext {
  projectId: string
  all: WorkTask[]
  canEdit: boolean
  order: string[]
  today: string
  showClosed: boolean
  onOpen: (t: WorkTask) => void
  /** Milestone records — task lists show (and change) their milestone */
  plan?: PlanMilestone[]
}

/**
 * Zoho Projects-style task list: one group per task list (root Task) → tasks → subtasks. Start, Due, Duration, Status,
 * Priority and Completion % edit in place; the name opens the task popup (with its Save button).
 * Duration = days from start to due, both included: changing one of the three keeps the others consistent.
 */
export function TaskTree({ lists, ctx, label }: { lists: WorkTask[]; ctx: TreeContext; label: string }) {
  const statuses = useOptions(TASK_STATUSES, ctx.canEdit)
  const statusOptions = sortByOrder(statuses.data ?? [], ctx.order)
  return (
    <div className="gc-table-wrap">
      <table className="gc-table gc-tree" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Task name</th>
            <th scope="col">Owner</th>
            <th scope="col">Status</th>
            <th scope="col">Tags</th>
            <th scope="col">Start date</th>
            <th scope="col">Due date</th>
            <th scope="col" className="gc-num">
              Duration
            </th>
            <th scope="col">Priority</th>
            <th scope="col">Completion</th>
          </tr>
        </thead>
        {lists.map((l) => (
          <ListGroup key={l.id} list={l} ctx={ctx} statusOptions={statusOptions} statusLoading={statuses.isLoading} />
        ))}
      </table>
    </div>
  )
}

function ListGroup({ list, ctx, statusOptions, statusLoading }: { list: WorkTask; ctx: TreeContext; statusOptions: { id: string; label: string }[]; statusLoading: boolean }) {
  const [open, setOpen] = useState(true)
  const under = descendants(ctx.all, list.id)
  const closed = under.filter(isDone).length
  const rows = flatten(ctx.all, list.id, 1, ctx.showClosed)
  return (
    <tbody className="gc-tree__group">
      <Row t={list} depth={0} ctx={ctx} statusOptions={statusOptions} statusLoading={statusLoading} group={{ open, toggle: () => setOpen((o) => !o), count: under.length, closed }} />
      {open &&
        (rows.length === 0 ? (
          <tr>
            <td colSpan={9} className="gc-small gc-soft gc-tree__empty">
              {under.length ? 'All tasks closed' : 'No tasks in this task list'}
            </td>
          </tr>
        ) : (
          rows.map(({ t, depth }) => <Row key={t.id} t={t} depth={depth} ctx={ctx} statusOptions={statusOptions} statusLoading={statusLoading} />)
        ))}
    </tbody>
  )
}

/** Tasks then their subtasks, depth-first (closed ones hidden unless showClosed). */
function flatten(all: WorkTask[], parentId: string, depth: number, showClosed: boolean, seen = new Set<string>()): { t: WorkTask; depth: number }[] {
  return childrenOf(all, parentId)
    .filter((t) => !seen.has(t.id))
    .sort((a, b) => (a.startDate || '9').localeCompare(b.startDate || '9') || a.name.localeCompare(b.name))
    .flatMap((t) => {
      seen.add(t.id)
      const kids = flatten(all, t.id, depth + 1, showClosed, seen)
      return showClosed || !isDone(t) || kids.length ? [{ t, depth }, ...kids] : []
    })
}

function Row({ t, depth, ctx, statusOptions, statusLoading, group }: { t: WorkTask; depth: number; ctx: TreeContext; statusOptions: { id: string; label: string }[]; statusLoading: boolean; group?: { open: boolean; toggle: () => void; count: number; closed: number } }) {
  const update = useUpdateTask(ctx.projectId)
  const edit = ctx.canEdit
  const saving = update.isPending
  const save = (data: Record<string, unknown>, optimistic: Partial<WorkTask>) => update.mutate({ taskId: t.id, data, optimistic })
  const duration = t.duration || durationOf(t.startDate, t.endDate)
  const late = isDelayed(t, ctx.today)
  const subtasks = childrenOf(ctx.all, t.id).length

  const onStart = (v: string) => {
    // Keep the duration: the due date moves with the start (as Zoho Projects)
    const end = duration > 0 ? endFromDuration(v, duration) : t.endDate
    save({ Task_Start_Date: toCreatorDate(v), ...(end !== t.endDate ? { Task_End_Date: end ? toCreatorDate(end) : '' } : {}), ...(duration > 0 ? { Duration: duration } : {}) }, { startDate: v, endDate: end, duration })
  }
  const onEnd = (v: string) => {
    const d = durationOf(t.startDate, v)
    save({ Task_End_Date: toCreatorDate(v), ...(d ? { Duration: d } : {}) }, { endDate: v, duration: d || t.duration })
  }
  const onDuration = (v: number | '') => {
    const d = v === '' ? 0 : v
    const end = t.startDate && d > 0 ? endFromDuration(t.startDate, d) : t.endDate
    save({ Duration: v, ...(end !== t.endDate ? { Task_End_Date: end ? toCreatorDate(end) : '' } : {}) }, { duration: d, endDate: end })
  }

  return (
    <tr className={`${group ? 'gc-tree__list' : ''} ${isDone(t) ? 'is-done' : ''}`}>
      <td className="gc-wrap">
        <span className="gc-tree__name" style={{ paddingLeft: depth * 22 }}>
          {group ? (
            <button type="button" className="gc-tree__toggle" aria-expanded={group.open} aria-label={`${group.open ? 'Collapse' : 'Expand'} ${t.name}`} onClick={group.toggle}>
              <span className={`gc-chev ${group.open ? 'is-open' : ''}`} aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <span className={`gc-tree__dot ${subtasks ? 'has-kids' : ''}`} aria-hidden="true" />
          )}
          {edit ? (
            <InlineText value={t.name} label={`${t.name} task name`} wide saving={saving} onSave={(v) => v && save({ Task_Name: v }, { name: v })} />
          ) : (
            <span className="gc-tree__title">{t.name || '—'}</span>
          )}
          <button type="button" className="gc-icon-btn gc-icon-btn--sm" onClick={() => ctx.onOpen(t)} aria-label={`Open ${t.name}`} title="Open details (description, owners, hours, activity)">
            ⤢
          </button>
          {group && (
            <span className="gc-tree__count" title={`${group.closed} of ${group.count} closed`}>
              {group.count}
            </span>
          )}
          {!group && subtasks > 0 && <span className="gc-small gc-muted">· {subtasks} subtask{subtasks === 1 ? '' : 's'}</span>}
        </span>
        {group && ctx.plan && <MilestoneMap list={t} plan={ctx.plan} projectId={ctx.projectId} disabled={!edit} />}
        {late && <span className="gc-small gc-warn-text gc-block">Overdue</span>}
        {t.startDate && t.endDate && t.endDate < t.startDate && <span className="gc-small gc-danger gc-block">⚠ Due date is before the start date</span>}
        {update.error && <span className="gc-small gc-danger gc-block">{update.error.message}</span>}
      </td>
      <td className="gc-wrap gc-small">{t.owners.map((o) => o.label).join(', ') || <span className="gc-muted">Unassigned</span>}</td>
      <td>
        <InlineSelect
          value={t.status?.id ?? ''}
          display={t.status?.label ?? ''}
          tone={isDone(t) ? 'good' : late ? 'serious' : 'info'}
          options={statusOptions}
          loading={statusLoading}
          label={`${t.name} status`}
          disabled={!edit}
          saving={saving}
          onSave={(id) => save({ Task_Status: id }, { status: id ? { id, label: statusOptions.find((o) => o.id === id)?.label ?? '' } : null })}
        />
      </td>
      <td>{t.workPackage ? <span className="gc-tag" title={t.workPackage}>{wpTag(t.workPackage)}</span> : <span className="gc-muted">—</span>}</td>
      <td>
        <InlineDate value={t.startDate} max={duration > 0 ? undefined : t.endDate} label={`${t.name} start date`} disabled={!edit} saving={saving} onSave={onStart} />
      </td>
      <td className={late ? 'gc-danger' : ''}>
        <InlineDate value={t.endDate} min={t.startDate} label={`${t.name} due date`} disabled={!edit} saving={saving} onSave={onEnd} />
      </td>
      <td className="gc-num">
        <InlineNumber value={duration || ''} suffix={duration === 1 ? ' day' : ' days'} min={1} label={`${t.name} duration`} disabled={!edit} saving={saving} onSave={onDuration} />
      </td>
      <td>
        <InlineSelect
          value={t.priority}
          display={t.priority}
          tone={PRIORITY_TONE[t.priority]}
          options={PRIORITIES}
          label={`${t.name} priority`}
          disabled={!edit}
          saving={saving}
          onSave={(v) => save({ Priority: v }, { priority: v })}
        />
      </td>
      <td className="gc-cell-progress">
        {group ? (
          <>
            <Progress value={group.count ? (group.closed / group.count) * 100 : 0} label={`${t.name}: ${group.closed} of ${group.count} closed`} />
            <span className="gc-small gc-soft">
              {group.closed}/{group.count}
            </span>
          </>
        ) : (
          <>
            <Progress value={isDone(t) ? 100 : t.percent} label={`${t.name} completion`} />
            <InlineNumber value={isDone(t) ? 100 : t.percent} suffix="%" min={0} max={100} label={`${t.name} completion %`} disabled={!edit} saving={saving} onSave={(v) => save({ Precent_Complete: v === '' ? 0 : v }, { percent: v === '' ? 0 : v })} />
          </>
        )}
      </td>
    </tr>
  )
}

export const fmtRange = (a: string, b: string) => (a || b ? `${formatDate(a)} – ${formatDate(b)}` : '—')
