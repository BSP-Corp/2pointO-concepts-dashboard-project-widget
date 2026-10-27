import { useState } from 'react'
import { Disclosure, Modal } from '@/features/console/ui'
import { useUpdateProject } from '@/features/projects/api'
import { formatDate, statusKey } from '@/lib/utils'
import type { Project, ProjectDetails, StatusChange } from '@/types/domain'

/**
 * Project status lifecycle. Stages = the static order of Widget.status_order (via Widget.project_details), the same list
 * Widget.project_update enforces: next stage only, back with a reason, skipping for admins, On Hold / Cancelled at any stage.
 * Dates come from Project.Status_History (every status change is appended there).
 */
export function Pipeline({ project, details }: { project: Project; details: ProjectDetails }) {
  const update = useUpdateProject(project.id)
  const [dialog, setDialog] = useState<{ id: string; label: string; back: boolean } | null>(null)
  const [reason, setReason] = useState('')
  const stages = details.stages.filter((s) => !s.anytime)
  const anytime = details.stages.filter((s) => s.anytime)
  const history = project.statusHistory
  const same = (a: string, b: string) => statusKey(a) === statusKey(b)
  const onHold = anytime.find((s) => same(s.label, project.status))
  // On Hold / Cancelled: the pipeline position is the last lifecycle stage reached before it
  const lastStage = [...history].reverse().find((h) => stages.some((s) => same(s.label, h.status)))
  const current = stages.findIndex((s) => same(s.label, onHold ? (lastStage?.status ?? '') : project.status))
  const reached = (label: string): StatusChange | undefined => [...history].reverse().find((h) => same(h.status, label))
  const next = current >= 0 ? stages[current + 1] : stages[0]
  const prev = current > 0 ? stages[current - 1] : undefined
  const resume = onHold && current >= 0 ? stages[current] : undefined

  const move = (id: string, why?: string) => update.mutate({ data: { Project_Status: id }, reason: why }, { onSuccess: () => (setDialog(null), setReason('')) })
  const missing = (s?: { id: string; label: string }) => (s && !s.id ? `No Status record named "${s.label}" (Status form, Modules = Project)` : undefined)

  return (
    <section className="gc-panel" aria-label="Project pipeline">
      <div className="gc-panel__head">
        <h2 className="gc-h2">Project status</h2>
        <span className="gc-small gc-soft">
          {onHold
            ? `${onHold.label}${lastStage ? ` · was at ${lastStage.status}` : ''}`
            : current >= 0
              ? `Stage ${current + 1} of ${stages.length}${reached(stages[current].label) ? ` · since ${formatDate(reached(stages[current].label)!.at)}` : ''}`
              : `Current status “${project.status || '—'}” is not a lifecycle stage`}
        </span>
      </div>
      <ol className="gc-pipeline" aria-label="Lifecycle stages">
        {stages.map((s, i) => {
          const state = current < 0 ? 'todo' : i < current ? 'done' : i === current ? (onHold ? 'hold' : 'now') : 'todo'
          const h = reached(s.label)
          return (
            <li key={s.label} className={`gc-stage gc-stage--${state}`} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="gc-stage__dot">{state === 'done' ? '✓' : i + 1}</span>
              <span className="gc-stage__name">{s.label}</span>
              <span className="gc-stage__date">{h ? formatDate(h.at) : state === 'done' ? 'Completed' : state === 'now' ? 'Current' : state === 'hold' ? onHold!.label : '—'}</span>
            </li>
          )
        })}
      </ol>

      {details.canEdit && stages.length > 0 && (
        <div className="gc-pipeline__actions">
          {resume ? (
            <button type="button" className="gc-btn gc-btn--primary" disabled={update.isPending || !resume.id} title={missing(resume)} onClick={() => move(resume.id, `Resumed from ${onHold!.label}`)}>
              Resume at {resume.label}
            </button>
          ) : (
            next && (
              <button type="button" className="gc-btn gc-btn--primary" disabled={update.isPending || !next.id} title={missing(next)} onClick={() => move(next.id)}>
                Move to {next.label} →
              </button>
            )
          )}
          {prev && !onHold && (
            <button type="button" className="gc-btn" disabled={update.isPending || !prev.id} title={missing(prev)} onClick={() => setDialog({ ...prev, back: true })}>
              ← Move back to {prev.label}
            </button>
          )}
          {anytime
            .filter((s) => !same(s.label, project.status))
            .map((s) => (
              <button key={s.label} type="button" className="gc-btn gc-btn--ghost" disabled={update.isPending || !s.id} title={missing(s)} onClick={() => setDialog({ ...s, back: false })}>
                {s.label}
              </button>
            ))}
          {details.isAdmin && (
            <label className="gc-small gc-soft gc-inline-field">
              Admin: set stage
              <select value="" onChange={(e) => e.target.value && move(e.target.value, 'Admin stage change')} aria-label="Set stage">
                <option value="">Select…</option>
                {stages
                  .filter((s, i) => s.id && i !== current)
                  .map((s) => (
                    <option key={s.label} value={s.id}>
                      {stages.indexOf(s) + 1}. {s.label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {update.error && !dialog && (
            <span className="gc-small gc-danger" role="alert">
              {update.error.message}
            </span>
          )}
        </div>
      )}

      <Disclosure header={<span className="gc-acc__row"><strong>Status history</strong><span className="gc-soft">{history.length} change{history.length === 1 ? '' : 's'}</span></span>}>
        {history.length === 0 ? (
          <p className="gc-small gc-soft">No status changes recorded yet (Status_History is filled from the next change).</p>
        ) : (
          <ol className="gc-history">
            {history.map((h, i) => (
              <li key={i}>
                <span className="gc-history__no">{i + 1}</span>
                <span className="gc-history__main">
                  <strong>{h.status}</strong>
                  <span className="gc-small gc-soft">
                    {h.at ? `${formatDate(h.at)} ${h.time}` : '—'}
                    {h.user ? ` · ${h.user}` : ''}
                  </span>
                  {h.reason && <span className="gc-small gc-wrap">Reason: {h.reason}</span>}
                </span>
                {i === history.length - 1 && same(h.status, project.status) && <span className="gc-chip gc-chip--info">Current</span>}
              </li>
            ))}
          </ol>
        )}
      </Disclosure>

      {dialog && (
        <Modal title={dialog.back ? `Move back to ${dialog.label}` : `Set ${dialog.label}`} onClose={() => setDialog(null)}>
          <label className="gc-field">
            <span className="gc-label">Reason{dialog.back ? ' (required)' : ''}</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {update.error && (
            <span className="gc-small gc-danger" role="alert">
              {update.error.message}
            </span>
          )}
          <div className="gc-modal__actions">
            <button type="button" className="gc-btn" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button type="button" className="gc-btn gc-btn--primary" disabled={(dialog.back && !reason.trim()) || update.isPending} onClick={() => move(dialog.id, reason.trim())}>
              {dialog.back ? 'Move back' : `Set ${dialog.label}`}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
