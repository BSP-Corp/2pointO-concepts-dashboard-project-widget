import { Fragment, useState } from 'react'
import { DateInput } from '@/features/console/DateInput'
import { Chip, Empty, ErrorPanel, Panel, Progress, Section } from '@/features/console/ui'
import { useCreateMilestone, useCreateTask, useOptions, useUpdateMilestone } from '@/features/projects/api'
import { formatMoney } from '@/lib/utils'
import type { PlanMilestone, WorkTask } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
import { InlineDate } from '../InlineDate'
import { InlineNumber, InlineSelect, InlineStartsAfter } from '../InlineCells'
import { TaskDialog } from '../TaskDialog'
import { TaskTree, type TreeContext } from '../TaskTree'
import { billingTotal, daysBetween, durationOf, startsAfterFor, milestoneTasks, type MilestoneRow, type MilestoneState } from '../model'

const MILESTONE_STATUSES = { key: 'milestoneStatuses', report: '', label: '' }
const USERS = { key: 'users', report: '', label: '' }
const FLAGS = ['Internal', 'External'].map((f) => ({ id: f, label: f }))
const TONE: Record<MilestoneState, 'good' | 'serious' | 'info' | undefined> = { Completed: 'good', Delayed: 'serious', 'In Progress': 'info', 'Not Started': undefined }

/** "(77 days to go)" / "(28 days ago)" next to the end date, as Zoho Projects. */
function DaysTo({ end, today, done }: { end: string; today: string; done: boolean }) {
  if (!end || done) return null
  const d = daysBetween(today, end)
  return (
    <span className={`gc-small gc-block ${d < 0 ? 'gc-danger' : 'gc-good'}`}>
      {d === 0 ? '(due today)' : d > 0 ? `(${d} day${d === 1 ? '' : 's'} to go)` : `(${-d} day${d === -1 ? '' : 's'} ago)`}
    </span>
  )
}

/**
 * Milestones (Milestone form) as Zoho Projects: Project → Milestones → tasks (work packages group theirs) → sub-tasks.
 * Planned start = project Start Date + Starts after; end = start + Duration (days, both included). Start after, Start,
 * End, Duration, Owner, Flag and Status edit in place and save to the Milestone record; a milestone expands into its tasks.
 */
export function MilestonesTab(c: TabContext) {
  const { tasks, payments } = c.queries
  const plan = c.queries.planMilestones
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [open, setOpen] = useState<WorkTask | null>(null)
  const [adding, setAdding] = useState(false)
  if (plan.error) return <ErrorPanel error={plan.error} onRetry={() => plan.refetch()} />
  if (tasks.error) return <ErrorPanel error={tasks.error} onRetry={() => tasks.refetch()} />
  if (!c.milestones || !tasks.data) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading milestones" />
  const all = tasks.data
  // Tasks of projects created before the Milestone & Task redesign have no Milestone yet
  const noMilestone = milestoneTasks(all, null)
  const ctx: TreeContext = { projectId: c.project.id, all, canEdit: c.details.canEdit, order: c.details.taskOrder, today: c.today, onOpen: setOpen, plan: c.queries.planMilestones.data }
  const toggle = (id: string) => setExpanded((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))

  return (
    <div className="gc-stack">
      <Panel
        title={`Milestones (${c.milestones.length})`}
        flush
        actions={
          c.details.canEdit && (
            <button type="button" className="gc-btn gc-btn--sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              + Add milestone
            </button>
          )
        }
      >
        {adding && <AddMilestone projectId={c.project.id} onDone={() => setAdding(false)} />}
        {c.milestones.length === 0 ? (
          <Empty>No records for this project</Empty>
        ) : (
          <div className="gc-table-wrap">
            <table className="gc-table gc-zlist" aria-label="Milestones">
              <thead>
                <tr>
                  <th scope="col">Milestone name</th>
                  <th scope="col">%</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Starts after</th>
                  <th scope="col">Start date</th>
                  <th scope="col">End date</th>
                  <th scope="col" className="gc-num">
                    Duration
                  </th>
                  <th scope="col">Tasks</th>
                  <th scope="col">Flag</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {c.milestones.map((m) => (
                  <Fragment key={m.milestone.id}>
                    <MilestoneLine row={m} c={c} expanded={expanded.has(m.milestone.id)} onToggle={() => toggle(m.milestone.id)} />
                    {expanded.has(m.milestone.id) && (
                      <tr className="gc-zlist__detail">
                        <td colSpan={10}>
                          {m.packages.length === 0 && m.roots.length === 0 ? (
                            <p className="gc-small gc-soft gc-pad">No tasks in this milestone yet.</p>
                          ) : (
                            <TaskTree packages={m.packages} roots={m.roots} ctx={ctx} label={`Tasks of ${m.milestone.name}`} nested />
                          )}
                          {c.details.canEdit && <AddTask row={m} projectId={c.project.id} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {(noMilestone.packages.length > 0 || noMilestone.roots.length > 0) && (
        <Panel title={`No milestone (${noMilestone.tasks.length})`} flush actions={<span className="gc-small gc-soft">Tasks from before the milestone set-up — open a task to set its milestone</span>}>
          <TaskTree packages={noMilestone.packages} roots={noMilestone.roots} ctx={ctx} label="Tasks without a milestone" />
        </Panel>
      )}
      <Panel title="Billing milestones (Payment Terms)" flush>
        <Section query={payments} isEmpty={(d) => d.length === 0}>
          {(rows) => {
            const total = billingTotal(rows)
            return (
              <div className="gc-table-wrap">
                <table className="gc-table">
                  <thead>
                    <tr>
                      <th scope="col">Milestone</th>
                      <th scope="col" className="gc-num">
                        Billing %
                      </th>
                      <th scope="col" className="gc-num">
                        Amount
                      </th>
                      <th scope="col">Terms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name || '—'}</td>
                        <td className="gc-num">{r.percentage}%</td>
                        <td className="gc-num">{formatMoney(r.amount, c.project.currency)}</td>
                        <td className="gc-wrap gc-soft">{r.terms || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td className={`gc-num ${Math.round(total * 100) / 100 !== 100 ? 'gc-danger' : ''}`}>{Math.round(total * 100) / 100}%</td>
                      <td className="gc-num">
                        {formatMoney(
                          rows.reduce((s, r) => s + r.amount, 0),
                          c.project.currency,
                        )}
                      </td>
                      <td className="gc-small">{Math.round(total * 100) / 100 !== 100 ? <span className="gc-danger">⚠ Billing percentages must add up to 100%</span> : '✓ Adds up to 100%'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          }}
        </Section>
      </Panel>
      {open && (
        <TaskDialog
          task={open}
          all={all}
          team={c.details.team}
          projectId={c.project.id}
          canEdit={c.details.canEdit}
          order={c.details.taskOrder}
          plan={c.queries.planMilestones.data}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

function MilestoneLine({ row, c, expanded, onToggle }: { row: MilestoneRow; c: TabContext; expanded: boolean; onToggle: () => void }) {
  const m = row.milestone
  const edit = c.details.canEdit
  const update = useUpdateMilestone(c.project.id)
  const statuses = useOptions(MILESTONE_STATUSES, edit)
  const users = useOptions(USERS, edit)
  const saving = update.isPending
  const save = (data: Record<string, unknown>, optimistic: Partial<PlanMilestone>) => update.mutate({ milestoneId: m.id, data, optimistic })
  const projectStart = c.project.startDate
  const noStart = 'Set the project Start Date first — milestone dates count from it'
  const done = row.state === 'Completed'
  return (
    <tr className={`gc-zlist__row ${expanded ? 'is-open' : ''}`}>
      <td className="gc-wrap">
        <span className="gc-tree__name">
          <button type="button" className="gc-tree__toggle" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${m.name}`} onClick={onToggle}>
            <span className={`gc-chev ${expanded ? 'is-open' : ''}`} aria-hidden="true">
              ›
            </span>
          </button>
          <span>
            <strong>{m.name || '—'}</strong>
            <span className="gc-small gc-soft gc-block">
              {m.no}
              {row.packages.length > 0 && ` · Work packages (${row.packages.length})`}
            </span>
          </span>
        </span>
      </td>
      <td className="gc-num">{Math.round(row.progress)}%</td>
      <td>
        <InlineSelect
          value={m.owner?.id ?? ''}
          display={m.owner?.label ?? ''}
          options={users.data ?? []}
          loading={users.isLoading}
          label={`${m.name} owner`}
          disabled={!edit}
          saving={saving}
          onSave={(id) => save({ Owner: id }, { owner: id ? { id, label: users.data?.find((u) => u.id === id)?.label ?? '' } : null })}
        />
      </td>
      <td>
        <InlineStartsAfter
          after={m.startsAfter}
          unit={m.startsAfterIn}
          label={`${m.name} starts after`}
          disabled={!edit}
          saving={saving}
          onSave={(after, unit) => save({ Starts_after: after, Starts_After_In: unit }, { startsAfter: after, startsAfterIn: unit })}
        />
      </td>
      <td title={projectStart ? undefined : noStart}>
        <InlineDate
          value={row.start}
          min={projectStart}
          label={`${m.name} start date`}
          disabled={!edit || !projectStart}
          saving={saving}
          onSave={(v) => {
            const s = startsAfterFor(projectStart, v, m.startsAfterIn)
            save({ Starts_after: s.after, Starts_After_In: s.unit }, { startsAfter: s.after, startsAfterIn: s.unit })
          }}
        />
      </td>
      <td title={projectStart ? undefined : noStart}>
        <InlineDate
          value={row.end}
          min={row.start}
          label={`${m.name} end date`}
          disabled={!edit || !projectStart}
          saving={saving}
          onSave={(v) => save({ Duration: durationOf(row.start, v) }, { duration: durationOf(row.start, v) })}
        />
        <DaysTo end={row.end} today={c.today} done={done} />
      </td>
      <td className="gc-num">
        <InlineNumber
          value={m.duration || ''}
          suffix={m.duration === 1 ? ' day' : ' days'}
          min={1}
          label={`${m.name} duration`}
          disabled={!edit}
          saving={saving}
          onSave={(v) => save({ Duration: v }, { duration: v === '' ? 0 : v })}
        />
      </td>
      <td className="gc-cell-progress">
        <Progress value={row.tasks.length ? (row.done / row.tasks.length) * 100 : 0} label={`${m.name}: ${row.done} of ${row.tasks.length} tasks closed`} />
        <span className="gc-small gc-soft">
          {row.done}/{row.tasks.length}
        </span>
      </td>
      <td>
        <InlineSelect value={m.flag} display={m.flag} options={FLAGS} label={`${m.name} flag`} disabled={!edit} saving={saving} onSave={(v) => save({ Flag: v }, { flag: v })} />
      </td>
      <td>
        <InlineSelect
          value={m.status?.id ?? ''}
          display={m.status?.label ?? ''}
          tone={/complete|closed/i.test(m.status?.label ?? '') ? 'good' : 'info'}
          options={statuses.data ?? []}
          loading={statuses.isLoading}
          label={`${m.name} status`}
          disabled={!edit}
          saving={saving}
          onSave={(id) => save({ Status: id }, { status: id ? { id, label: statuses.data?.find((o) => o.id === id)?.label ?? '' } : null })}
        />
        {row.state === 'Delayed' && (
          <span className="gc-block">
            <Chip tone={TONE.Delayed}>Delayed</Chip>
          </span>
        )}
      </td>
    </tr>
  )
}

const UNITS = ['Days', 'Weeks', 'Months']

/** + Add milestone: a milestone of this project (Milestone form) with its own task list */
function AddMilestone({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const create = useCreateMilestone(projectId)
  const [name, setName] = useState('')
  const [after, setAfter] = useState('0')
  const [unit, setUnit] = useState('Days')
  const [duration, setDuration] = useState('1')
  const problem = !name.trim() ? 'Enter the milestone name' : !/^\d+$/.test(after) ? 'Starts after must be a whole number' : !/^[1-9]\d*$/.test(duration) ? 'Duration must be 1 day or more' : ''
  return (
    <form
      className="gc-add-row"
      aria-label="Add milestone"
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem) create.mutate({ name: name.trim(), startsAfter: Number(after), startsAfterIn: unit, duration: Number(duration) }, { onSuccess: onDone })
      }}
    >
      <label className="gc-field">
        <span className="gc-label">Milestone name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="gc-field">
        <span className="gc-label">Starts after</span>
        <input type="number" min={0} step={1} value={after} onChange={(e) => setAfter(e.target.value)} />
      </label>
      <label className="gc-field">
        <span className="gc-label">In</span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      <label className="gc-field">
        <span className="gc-label">Duration (days)</span>
        <input type="number" min={1} step={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
      </label>
      <button type="button" className="gc-btn gc-btn--sm" onClick={onDone} disabled={create.isPending}>
        Cancel
      </button>
      <button type="submit" className="gc-btn gc-btn--primary gc-btn--sm" disabled={!!problem || create.isPending} title={problem}>
        {create.isPending ? 'Adding…' : 'Add milestone'}
      </button>
      {create.error && (
        <span className="gc-small gc-danger" role="alert">
          {create.error.message}
        </span>
      )}
    </form>
  )
}

/** + Add task: straight under the milestone (milestone only), or under one of its work packages (the server copies its milestone) */
function AddTask({ row, projectId }: { row: MilestoneRow; projectId: string }) {
  const create = useCreateTask(projectId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pkg, setPkg] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const problem = !name.trim() ? 'Enter the task name' : start && end && end < start ? 'Due date must be on or after the start date' : ''
  if (!open)
    return (
      <button type="button" className="gc-btn gc-btn--sm gc-add-task" onClick={() => setOpen(true)}>
        + Add task
      </button>
    )
  return (
    <form
      className="gc-add-row"
      aria-label={`Add task to ${row.milestone.name}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (problem) return
        create.mutate(
          { name: name.trim(), startDate: start, endDate: end, ...(pkg ? { parentId: pkg } : { milestoneId: row.milestone.id }) },
          { onSuccess: () => (setName(''), setStart(''), setEnd(''), setOpen(false)) },
        )
      }}
    >
      {row.packages.length > 0 && (
        <label className="gc-field">
          <span className="gc-label">Add under</span>
          <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="">The milestone</option>
            {row.packages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name.trim() || l.workPackage}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="gc-field">
        <span className="gc-label">Task name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="gc-field">
        <span className="gc-label">Start date</span>
        <DateInput value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="gc-field">
        <span className="gc-label">Due date</span>
        <DateInput value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <button type="button" className="gc-btn gc-btn--sm" onClick={() => setOpen(false)} disabled={create.isPending}>
        Cancel
      </button>
      <button type="submit" className="gc-btn gc-btn--primary gc-btn--sm" disabled={!!problem || create.isPending} title={problem}>
        {create.isPending ? 'Adding…' : 'Add task'}
      </button>
      {create.error && (
        <span className="gc-small gc-danger" role="alert">
          {create.error.message}
        </span>
      )}
    </form>
  )
}
