import { useEffect, useRef, useState } from 'react'
import { EditProjectForm } from '@/features/console/EditProjectForm'
import { Modal } from '@/features/console/ui'
import { useUpdateProject } from '@/features/projects/api'
import { formatDate, formatPct, statusKey } from '@/lib/utils'
import type { Project, ProjectDetails, StatusChange } from '@/types/domain'
import { KICKOFF_STAGE } from './kickoff'

/**
 * Project status lifecycle as a compact stepper inside the header (PPT 2a / 2b / 2c / 3a). Stages = the static order of
 * Widget.status_order (via Widget.project_details), the same list Widget.project_update enforces. The primary action
 * (next stage / resume), a click on a stage's dot, and Move back, On Hold, Cancelled or Admin set stage (behind "More") open
 * a pop-up: the reason (required to move back), or — for Kick-Off Done — the Project Registration form, which must be
 * complete before the project can move on. Dates come from Project.Status_History.
 */
export function Pipeline({ project, details, progress }: { project: Project; details: ProjectDetails; progress?: { actual: number | null; planned: number | null } }) {
  const update = useUpdateProject(project.id, { inline: true })
  const [pending, setPending] = useState<{ id: string; label: string; back: boolean } | null>(null)
  const [kickoff, setKickoff] = useState<{ id: string; label: string } | null>(null)
  const [reason, setReason] = useState('')
  const [menu, setMenu] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [menu])

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
  const since = current >= 0 ? reached(stages[current].label) : undefined

  const move = (id: string, why?: string) =>
    update.mutate({ data: { Project_Status: id }, reason: why, stage: details.stages.find((s) => s.id === id)?.label }, { onSuccess: () => (setPending(null), setReason('')) })
  const missing = (s?: { id: string; label: string }) => (s && !s.id ? `No Status record named "${s.label}" (Status form, Modules = Project)` : undefined)
  const kickIndex = stages.findIndex((s) => same(s.label, KICKOFF_STAGE))
  // Reaching Kick-Off Done (or past it) from before it needs the Registration form complete
  const crossesKickoff = (id: string) => {
    const to = stages.findIndex((s) => s.id === id)
    return kickIndex >= 0 && !onHold && to >= kickIndex && current < kickIndex
  }
  const choose = (p: { id: string; label: string; back: boolean }) => {
    setMenu(false)
    update.reset()
    if (!p.back && crossesKickoff(p.id)) return setKickoff({ id: p.id, label: p.label })
    setPending(p)
    setReason('')
  }
  /** What a click on a stage's dot does ('' = nothing: the current stage, or skipping stages without admin rights) */
  const dotAction = (i: number) => (!canMove || current < 0 || !stages[i].id || i === current || onHold ? '' : i < current ? 'back' : i === current + 1 || details.isAdmin ? 'forward' : '')
  const canMove = details.canEdit && stages.length > 0
  const secondary = canMove && (!!(prev && !onHold) || anytime.some((s) => !same(s.label, project.status)) || details.isAdmin)

  return (
    <div className="gc-stepper" aria-label="Project status">
      <div className="gc-stepper__top">
        <span className="gc-stepper__where">
          {onHold ? (
            <>
              <strong>{onHold.label}</strong>
              {lastStage ? ` · was at ${lastStage.status}` : ''}
            </>
          ) : current >= 0 ? (
            <>
              Stage {current + 1} of {stages.length} · <strong>{stages[current].label}</strong>
              {since ? ` · since ${formatDate(since.at)}` : ''}
            </>
          ) : (
            `Current status “${project.status || '—'}” is not a lifecycle stage (Status form: give it an Order, Modules = Project)`
          )}
        </span>
        {progress && (
          <span className="gc-stepper__progress" title="Task completion against the plan for today">
            Progress <strong>{formatPct(progress.actual === null ? null : progress.actual / 100)}</strong>
            <span className="gc-soft"> · planned {formatPct(progress.planned === null ? null : progress.planned / 100)}</span>
          </span>
        )}
        <span className="gc-grow" />
        {canMove &&
          (resume ? (
            <button
              type="button"
              className="gc-btn gc-btn--primary gc-btn--sm"
              disabled={update.isPending || !resume.id}
              title={missing(resume)}
              onClick={() => move(resume.id, `Resumed from ${onHold!.label}`)}
            >
              Resume at {resume.label}
            </button>
          ) : (
            next && (
              <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" disabled={update.isPending || !next.id} title={missing(next)} onClick={() => choose({ ...next, back: false })}>
                Move to {next.label} →
              </button>
            )
          ))}
        <div className="gc-menu" ref={menuRef}>
          <button type="button" className="gc-btn gc-btn--sm" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            More ▾
          </button>
          {menu && (
            <div className="gc-menu__list" role="menu">
              {secondary && prev && !onHold && (
                <button type="button" role="menuitem" disabled={!prev.id} title={missing(prev)} onClick={() => choose({ ...prev, back: true })}>
                  ← Move back to {prev.label}
                </button>
              )}
              {secondary &&
                anytime
                  .filter((s) => !same(s.label, project.status))
                  .map((s) => (
                    <button key={s.label} type="button" role="menuitem" disabled={!s.id} title={missing(s)} onClick={() => choose({ ...s, back: false })}>
                      {s.label}
                    </button>
                  ))}
              {canMove && details.isAdmin && (
                <label className="gc-menu__field">
                  Admin: set stage
                  <select
                    value=""
                    onChange={(e) => {
                      const to = stages.find((s) => s.id === e.target.value)
                      if (to) choose({ ...to, back: stages.indexOf(to) < current })
                    }}
                    aria-label="Set stage"
                  >
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
              <button type="button" role="menuitem" onClick={() => (setMenu(false), setHistoryOpen((o) => !o))}>
                {historyOpen ? 'Hide' : 'Show'} status history ({history.length})
              </button>
            </div>
          )}
        </div>
      </div>

      <ol className="gc-lc-steps" aria-label="Lifecycle stages">
        {stages.map((s, i) => {
          const state = current < 0 ? 'todo' : i < current ? 'done' : i === current ? (onHold ? 'hold' : 'now') : 'todo'
          const h = reached(s.label)
          const action = dotAction(i)
          const tip = `${i + 1}. ${s.label}${h ? ` · ${formatDate(h.at)}` : ''}`
          return (
            <li key={s.label} className={`gc-lc-step gc-lc-step--${state}`} aria-current={state === 'now' ? 'step' : undefined} title={tip}>
              {action ? (
                <button
                  type="button"
                  className="gc-lc-step__dot gc-lc-step__dot--btn"
                  disabled={update.isPending}
                  aria-label={action === 'back' ? `Move back to ${s.label}` : `Move to ${s.label}`}
                  title={action === 'back' ? `${tip} — move back here` : `${tip} — move to this stage`}
                  onClick={() => choose({ id: s.id, label: s.label, back: action === 'back' })}
                />
              ) : (
                <span className="gc-lc-step__dot" aria-hidden="true" />
              )}
              <span className="gc-lc-step__name">{s.label}</span>
            </li>
          )
        })}
      </ol>

      {pending && (
        <Modal title={pending.back ? `Move back to ${pending.label}` : `Move to ${pending.label}`} onClose={() => !update.isPending && setPending(null)}>
          <form
            className="gc-status-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (!(pending.back && !reason.trim())) move(pending.id, reason.trim())
            }}
          >
            <p className="gc-small gc-soft">
              {project.reference} · now {project.status || '—'} → {pending.label}
            </p>
            <label className="gc-field">
              <span className="gc-label">Reason{pending.back ? <span className="gc-danger"> *</span> : ' (optional)'}</span>
              <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            {update.error && (
              <p className="gc-small gc-danger" role="alert">
                {update.error.message}
              </p>
            )}
            <div className="gc-status-form__foot">
              <button type="button" className="gc-btn" onClick={() => setPending(null)} disabled={update.isPending}>
                Cancel
              </button>
              <button type="submit" className="gc-btn gc-btn--primary" disabled={(pending.back && !reason.trim()) || update.isPending}>
                {update.isPending ? 'Saving…' : pending.back ? 'Move back' : `Move to ${pending.label}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {kickoff && (
        <EditProjectForm
          projectId={project.id}
          title={project.name || project.reference}
          kickoff={{ stage: kickoff.label, move: () => update.mutateAsync({ data: { Project_Status: kickoff.id }, stage: kickoff.label }) }}
          onClose={() => setKickoff(null)}
          onSaved={() => setKickoff(null)}
        />
      )}
      {update.error && !pending && !kickoff && (
        <span className="gc-small gc-danger" role="alert">
          {update.error.message}
        </span>
      )}

      {historyOpen &&
        (history.length === 0 ? (
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
        ))}
    </div>
  )
}
