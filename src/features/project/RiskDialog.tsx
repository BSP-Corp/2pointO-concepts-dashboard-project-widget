import { useMemo, useState } from 'react'
import { Chip, Modal, SEVERITY_TONE } from '@/features/console/ui'
import { useOptions, useSaveRisk } from '@/features/projects/api'
import { PRIORITIES, riskScore, riskSeverity } from '@/features/risk/calc'
import { plainToRichText, richTextToPlain } from '@/lib/data/zohoSource'
import type { Project, Risk } from '@/types/domain'

// Project_Risk picklist values, in the order of the Creator form (2Point0concepts.ds)
const PROBABILITY_VALUES = ['Very Low', 'Low', 'Medium', 'High', 'Very High']
const IMPACT_VALUES = ['Negligible', 'Minor', 'Moderate', 'Significant', 'Severe']
const RISK_STATUSES = { key: 'riskStatuses', report: '', label: '' }
const DEPARTMENTS = { key: 'departments', report: '', label: '' }
const USERS = { key: 'users', report: '', label: '' }

type Field = 'Risk_ID' | 'Risk_Description' | 'Cause' | 'Probability' | 'Impact' | 'Priority' | 'Risk_Status' | 'Risk_Owner' | 'Department'

/**
 * Project_Risk form (Risk Register): Submit on add, Update on edit (the Creator form's actions), Cancel on both.
 * Project_Name is this project. Risk Score and Risk Severity are calculated from Probability × Impact (workbook formulas)
 * and saved by Widget.project_risk_save.
 */
export function RiskDialog({ project, risk, onClose }: { project: Project; risk?: Risk; onClose: () => void }) {
  const save = useSaveRisk(project.id)
  const statuses = useOptions(RISK_STATUSES)
  const users = useOptions(USERS)
  const departments = useOptions(DEPARTMENTS)
  const initial = useMemo<Record<Field, string>>(
    () => ({
      Risk_ID: risk?.riskNo ?? '',
      Risk_Description: risk?.description ?? '',
      Cause: richTextToPlain(risk?.causeHtml ?? ''),
      Probability: risk?.probability ?? '',
      Impact: risk?.impact ?? '',
      Priority: risk?.priority ?? '',
      Risk_Status: risk?.statusId ?? '',
      Risk_Owner: risk?.ownerId ?? '',
      Department: risk?.departmentId ?? '',
    }),
    [risk],
  )
  const [v, setV] = useState(initial)
  const [tried, setTried] = useState(false)
  const set = (k: Field) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }))
  const score = riskScore(v.Probability, v.Impact)
  const severity = riskSeverity(v.Probability, v.Impact)
  const missing = [!v.Probability && 'Probability', !v.Impact && 'Impact'].filter(Boolean) as string[]
  const changed = (Object.keys(initial) as Field[]).filter((k) => v[k] !== initial[k])

  const submit = () => {
    setTried(true)
    if (missing.length) return
    if (risk && changed.length === 0) return onClose()
    const fields = risk ? changed : (Object.keys(initial) as Field[]).filter((k) => v[k] !== '')
    const data = Object.fromEntries(fields.map((k) => [k, k === 'Cause' ? plainToRichText(v.Cause) : v[k].trim()]))
    save.mutate({ riskId: risk?.id, data }, { onSuccess: onClose })
  }

  const lookup = (k: Field, label: string, q: ReturnType<typeof useOptions>, current: string, empty = '-Select-') => (
    <label className="gc-field">
      <span className="gc-label">{label}</span>
      <select value={v[k]} onChange={set(k)}>
        <option value="">{q.isLoading ? 'Loading…' : empty}</option>
        {initial[k] && !(q.data ?? []).some((o) => o.id === initial[k]) && <option value={initial[k]}>{current}</option>}
        {(q.data ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {q.error && <span className="gc-small gc-danger">{q.error.message}</span>}
    </label>
  )
  const picklist = (k: Field, label: string, values: readonly string[], required = false) => (
    <label className="gc-field">
      <span className="gc-label">
        {label}
        {required && <span className="gc-danger"> *</span>}
      </span>
      <select value={v[k]} onChange={set(k)} aria-required={required || undefined} aria-invalid={tried && required && !v[k] ? true : undefined}>
        <option value="">-Select-</option>
        {values.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  )

  return (
    <Modal title={risk ? `Edit risk · ${risk.riskNo || risk.description || 'Risk'}` : 'Add risk'} onClose={onClose} wide>
      <form
        className="gc-risk-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="gc-po-grid">
          <label className="gc-field">
            <span className="gc-label">
              Project Name<span className="gc-danger"> *</span>
            </span>
            <input value={project.reference || project.name} readOnly aria-readonly="true" className="gc-input--readonly" />
          </label>
          <label className="gc-field">
            <span className="gc-label">Risk ID</span>
            <input value={v.Risk_ID} onChange={set('Risk_ID')} placeholder={risk ? '' : 'Automatic: R - n'} />
          </label>
          {picklist('Priority', 'Priority', PRIORITIES)}
          <label className="gc-field gc-po-grid__wide">
            <span className="gc-label">Risk Description</span>
            <textarea rows={2} value={v.Risk_Description} onChange={set('Risk_Description')} />
          </label>
          <label className="gc-field gc-po-grid__wide">
            <span className="gc-label">Cause</span>
            <textarea rows={3} value={v.Cause} onChange={set('Cause')} />
          </label>
          {picklist('Probability', 'Probability', PROBABILITY_VALUES, true)}
          {picklist('Impact', 'Impact', IMPACT_VALUES, true)}
          <div className="gc-field">
            <span className="gc-label">Risk Score / Risk Severity</span>
            <span className="gc-risk-calc" aria-live="polite">
              <strong className="gc-num">{score || '—'}</strong>
              <span className="gc-soft">/ 25</span>
              {severity ? <Chip tone={SEVERITY_TONE[severity]}>{severity}</Chip> : <span className="gc-small gc-soft">Select Probability and Impact</span>}
            </span>
          </div>
          {lookup('Risk_Status', 'Risk Status', statuses, risk?.status ?? '')}
          {lookup('Risk_Owner', 'Risk Owner', users, risk?.owner ?? '')}
          {lookup('Department', 'Department', departments, risk?.department ?? '')}
        </div>
        {((tried && missing.length > 0) || save.error) && (
          <p className="gc-small gc-danger" role="alert">
            {tried && missing.length ? `Select ${missing.join(' and ')}` : save.error!.message}
          </p>
        )}
        <div className="gc-modal__actions">
          <button type="button" className="gc-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="gc-btn gc-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : risk ? 'Update' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
