import { useState } from 'react'
import { Disclosure, ErrorPanel, Modal } from '@/features/console/ui'
import { useActivity, useOptions, useUpdateTask } from '@/features/projects/api'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate, sortByOrder } from '@/lib/utils'
import { descendants, durationOf, rootOf, wpTag } from './model'
import { ActivityList } from './tabs/ActivityTab'
import type { PlanMilestone, TeamMember, WorkTask } from '@/types/domain'
import { MilestoneMap } from './MilestoneMap'

export const TASK_STATUSES = { key: 'taskStatuses', report: '', label: '' }

/** Task popup: details + edit. Closing returns to the same tab, project and accordion state. */
export function TaskDialog({ task, all, team, projectId, canEdit, order, plan, onClose }: { task: WorkTask; all: WorkTask[]; team: TeamMember[]; projectId: string; canEdit: boolean; order: string[]; plan?: PlanMilestone[]; onClose: () => void }) {
  const statuses = useOptions(TASK_STATUSES, canEdit)
  const update = useUpdateTask(projectId)
  const [start, setStart] = useState(task.startDate)
  const [end, setEnd] = useState(task.endDate)
  const [status, setStatus] = useState(task.status?.id ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [percent, setPercent] = useState(String(task.percent))
  const [owners, setOwners] = useState(task.owners.map((o) => o.id))
  const [name, setName] = useState(task.name)
  const [description, setDescription] = useState(task.description)
  const [parent, setParent] = useState(task.parent?.id ?? '')
  const [hours, setHours] = useState(task.workHours ? String(task.workHours) : '')
  // Parent: a task list or another task of this project (never itself or one of its own subtasks)
  const own = new Set([task.id, ...descendants(all, task.id).map((t) => t.id)])
  const parents = all.filter((t) => !own.has(t.id)).map((t) => ({ t, list: rootOf(all, t) }))
  const statusOptions = sortByOrder(statuses.data ?? [], order)
  const subtasks = all.filter((t) => t.parent?.id === task.id)
  const outsiders = task.owners.filter((o) => !team.some((m) => m.id === o.id))

  const save = () => {
    const data: Record<string, unknown> = {}
    if (start !== task.startDate) data.Task_Start_Date = start ? toCreatorDate(start) : ''
    if (end !== task.endDate) data.Task_End_Date = end ? toCreatorDate(end) : ''
    if ((start !== task.startDate || end !== task.endDate) && durationOf(start, end)) data.Duration = durationOf(start, end)
    if (status !== (task.status?.id ?? '')) data.Task_Status = status
    if (priority !== task.priority) data.Priority = priority
    if (Number(percent) !== task.percent) data.Precent_Complete = Number(percent)
    if (owners.join() !== task.owners.map((o) => o.id).join()) data.Owners = owners
    if (name.trim() && name.trim() !== task.name) data.Task_Name = name.trim()
    if (description !== task.description) data.Task_Description = description
    if (parent !== (task.parent?.id ?? '')) data.Parent_Task = parent
    if (hours !== (task.workHours ? String(task.workHours) : '')) data.Work_Hours = hours
    if (Object.keys(data).length === 0) return onClose()
    update.mutate({ taskId: task.id, data }, { onSuccess: onClose })
  }

  return (
    <Modal title={task.name || 'Task'} onClose={onClose} wide>
      <dl className="gc-dl">
        <div>
          <dt>Type</dt>
          <dd>{task.type || '—'}</dd>
        </div>
        <div>
          <dt>Task list</dt>
          <dd>{task.parent ? rootOf(all, task).name : 'This is a task list'}</dd>
        </div>
        <div>
          <dt>Work package</dt>
          <dd>{task.workPackage || '—'}</dd>
        </div>
        <div>
          <dt>Actual start / complete</dt>
          <dd>
            {formatDate(task.actualStart)} / {formatDate(task.actualEnd)}
          </dd>
        </div>
        <div className="gc-dl__wide">
          <dt>Task description</dt>
          <dd className="gc-wrap">{task.description || '—'}</dd>
        </div>
        <div>
          <dt>Attachments</dt>
          <dd className="gc-soft">— (the Task form has no attachment field)</dd>
        </div>
        <div>
          <dt>Instructions</dt>
          <dd className="gc-soft">— (the Task form has no instructions field)</dd>
        </div>
      </dl>
      {outsiders.length > 0 && <p className="gc-small gc-danger">⚠ Not on the project team: {outsiders.map((o) => o.label).join(', ')}</p>}
      {!canEdit && <p className="gc-small gc-soft">View only — you are not allowed to change this project's tasks.</p>}
      <fieldset className="gc-fieldset gc-po-grid" disabled={!canEdit}>
        <legend className="gc-h2">{canEdit ? 'Edit' : 'Details'}</legend>
        <label className="gc-field gc-po-grid__wide">
          <span className="gc-label">Task name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="gc-field gc-po-grid__wide">
          <span className="gc-label">Task description</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {!task.parent && plan && (
          <div className="gc-field">
            <span className="gc-label">Milestone of this task list (saved at once)</span>
            <MilestoneMap list={task} plan={plan} projectId={projectId} disabled={!canEdit} />
          </div>
        )}
        {task.parent && (
          <label className="gc-field">
            <span className="gc-label">Parent (task list or task)</span>
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              {parents.map(({ t, list }) => (
                <option key={t.id} value={t.id}>
                  {t.parent ? `${list.name} › ${t.name}` : t.name}
                  {t.workPackage ? ` · ${wpTag(t.workPackage)}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="gc-field">
          <span className="gc-label">Work hours</span>
          <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Start date</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Due date</span>
          <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">-Select-</option>
            {task.status && !statuses.data?.some((s) => s.id === task.status!.id) && <option value={task.status.id}>{task.status.label}</option>}
            {statusOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">-Select-</option>
            {['Low', 'Medium', 'High'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">% complete</span>
          <input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} />
        </label>
        <div className="gc-field gc-po-grid__wide">
          <span className="gc-label">Task owners / people working on it (Owners — project team members)</span>
          <div className="gc-checklist">
            {team.length === 0 && <span className="gc-soft gc-small">No one is on the Project Team yet — add members to the project's "Project Team" grid in Creator, then assign them here.</span>}
            {[...team.map((m) => ({ id: m.id, name: m.name, outside: false })), ...outsiders.map((o) => ({ id: o.id, name: o.label, outside: true }))].map((m) => (
              <label key={m.id} className={`gc-check ${m.outside ? 'gc-danger' : ''}`}>
                <input type="checkbox" checked={owners.includes(m.id)} onChange={(e) => setOwners((o) => (e.target.checked ? [...o, m.id] : o.filter((x) => x !== m.id)))} />
                {m.name}
                {m.outside && ' (not on team — remove)'}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {subtasks.length > 0 && (
        <div>
          <span className="gc-label">Subtasks</span>
          <ul className="gc-list">
            {subtasks.map((s) => (
              <li key={s.id}>
                {s.name} · {formatDate(s.endDate)} · {s.percent}%
              </li>
            ))}
          </ul>
        </div>
      )}
      {update.error && (
        <p className="gc-small gc-danger" role="alert">
          {update.error.message}
        </p>
      )}
      <div className="gc-modal__actions">
        <button type="button" className="gc-btn" onClick={onClose}>
          Close
        </button>
        {canEdit && (
          <button type="button" className="gc-btn gc-btn--primary" disabled={update.isPending || (!!start && !!end && end < start)} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <Disclosure header={<strong>Activity stream</strong>}>
        <TaskActivity projectId={projectId} taskId={task.id} />
      </Disclosure>
    </Modal>
  )
}

/** This task's own Activity_Stream (loaded when the section is opened). */
function TaskActivity({ projectId, taskId }: { projectId: string; taskId: string }) {
  const q = useActivity(projectId, taskId)
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <div className="gc-skeleton" style={{ height: 60 }} aria-busy="true" />
  return q.data.length ? <ActivityList rows={q.data} showRecord={false} /> : <p className="gc-small gc-soft">No changes recorded yet.</p>
}
