import { useMemo, useState } from 'react'
import { BarChart, DonutChart, type BarRow } from '@/features/console/charts'
import { Chip, Empty, ErrorPanel, Kpi, Panel, SEVERITY_TONE } from '@/features/console/ui'
import { IMPACTS, PRIORITIES, PROBABILITIES, SEVERITIES, isComplete, riskSeverity, scoreOf, severityOf, storedMismatch, summarizeRisks } from '@/features/risk/calc'
import { countBy } from '@/lib/utils'
import type { Risk } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
import { RiskDialog } from '../RiskDialog'
import { InlineSelect, InlineText } from '../InlineCells'
import { useOptions, useSaveRisk } from '@/features/projects/api'

/** Counts of one field per group (department / owner), for grouped bars — like the workbook's breakdown charts. */
function breakdown(rows: Risk[], group: (r: Risk) => string, field: (r: Risk) => string, keys: readonly string[]): BarRow[] {
  const by = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const g = group(r) || 'Not set'
    const values = by.get(g) ?? Object.fromEntries(keys.map((k) => [k, 0]))
    const k = field(r)
    if (k in values) values[k]++
    by.set(g, values)
  }
  return [...by].map(([label, values]) => ({ label, values }))
}
const series = (keys: readonly string[]) => keys.map((k) => ({ key: k, label: k }))

/** Loading / error / empty states shared by both risk tabs. */
function useRiskData(c: TabContext) {
  const q = c.queries.risks
  const s = useMemo(() => (q.data ? summarizeRisks(q.data) : undefined), [q.data])
  return { q, s }
}

/**
 * Risk Register: every Project_Risk record of this project. "+ Add risk" opens the compact form (Submit); Edit opens it
 * with the record (Update). Score / severity are calculated from Probability × Impact, as the workbook's formulas.
 */
export function RiskRegisterTab(c: TabContext) {
  const { q, s } = useRiskData(c)
  const [editing, setEditing] = useState<Risk | 'new' | null>(null)
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data || !s) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading risks" />
  const rows = q.data
  const canEdit = c.details.canEdit
  const add = canEdit && (
    <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" onClick={() => setEditing('new')}>
      + Add risk
    </button>
  )
  const dialog = editing && <RiskDialog project={c.project} risk={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
  if (rows.length === 0)
    return (
      <div className="gc-stack">
        <Panel title="Risk register" actions={add}>
          <Empty>No records for this project</Empty>
        </Panel>
        {dialog}
      </div>
    )
  return (
    <div className="gc-stack">
      <div className="gc-kpis">
        <Kpi tone="blue" label="Total risks" value={s.total} />
        <Kpi tone="amber" label="Active risks" value={s.active} sub="Status not Complete" />
        <Kpi tone="green" label="Completed risks" value={s.completed} />
        <Kpi tone="violet" label="Average risk score" value={s.averageScore ? `${s.averageScore} / 25` : '—'} sub="Open risks · Probability × Impact" />
      </div>
      <Panel title={`Risk register (${rows.length})`} flush actions={add}>
        <div className="gc-table-wrap">
          <table className="gc-table gc-list-table">
            <thead>
              <tr>
                <th scope="col">Risk</th>
                <th scope="col">Department</th>
                <th scope="col">Probability / Impact</th>
                <th scope="col">Severity</th>
                <th scope="col" className="gc-num">
                  Score
                </th>
                <th scope="col">Owner</th>
                <th scope="col">Priority</th>
                <th scope="col">Status</th>
                {canEdit && (
                  <th scope="col">
                    <span className="gc-sr">Edit</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)) || scoreOf(b) - scoreOf(a))
                .map((r) => (
                  <RiskRow key={r.id} r={r} c={c} onEdit={() => setEditing(r)} />
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {dialog}
    </div>
  )
}

/**
 * Risk Dashboard (workbook "Risk Dashboard" sheet): Total, Active (status not Complete), Completed and the Average Risk
 * Score of the open risks (/ 25); breakdowns by status, priority, severity, impact, department and owner.
 */
export function RiskDashboardTab(c: TabContext) {
  const { q, s } = useRiskData(c)
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data || !s) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading risks" />
  const rows = q.data
  if (rows.length === 0) return <Empty>No records for this project</Empty>
  return (
    <div className="gc-stack">
      <div className="gc-kpis">
        <Kpi tone="blue" label="Total risks" value={s.total} />
        <Kpi tone="amber" label="Active risks" value={s.active} sub="Status not Complete" />
        <Kpi tone="green" label="Completed risks" value={s.completed} />
        <Kpi tone="violet" label="Average risk score" value={s.averageScore ? `${s.averageScore} / 25` : '—'} sub="Open risks · Probability × Impact" />
      </div>
      <div className="gc-grid-2">
        <Panel title="Risks by status">
          <DonutChart data={countBy(rows, (r) => r.status, 'No status')} centerLabel="Risks" />
        </Panel>
        <Panel title="Risks by priority">
          <DonutChart data={countBy(rows, (r) => r.priority, 'No priority')} centerLabel="Risks" />
        </Panel>
        <Panel title="Risks breakdown by severity">
          <BarChart rows={SEVERITIES.map((k) => ({ label: k, values: { n: rows.filter((r) => severityOf(r) === k).length } }))} series={[{ key: 'n', label: 'Risks' }]} />
        </Panel>
        <Panel title="Risk breakdown by impact">
          <BarChart rows={[...IMPACTS].reverse().map((k) => ({ label: k, values: { n: rows.filter((r) => r.impact === k).length } }))} series={[{ key: 'n', label: 'Risks' }]} />
        </Panel>
        <Panel title="Risk severity among departments">
          <BarChart rows={breakdown(rows, (r) => r.department, severityOf, SEVERITIES)} series={series(SEVERITIES)} />
        </Panel>
        <Panel title="Risks by priority across departments">
          <BarChart rows={breakdown(rows, (r) => r.department, (r) => r.priority, PRIORITIES)} series={series(PRIORITIES)} />
        </Panel>
        <Panel title="Risk severity by risk owner">
          <BarChart rows={breakdown(rows, (r) => r.owner, severityOf, SEVERITIES)} series={series(SEVERITIES)} />
        </Panel>
        <Panel title="Risk status by risk owner">
          {(() => {
            const statuses = [...new Set(rows.map((r) => r.status || 'No status'))]
            return <BarChart rows={breakdown(rows, (r) => r.owner, (r) => r.status || 'No status', statuses)} series={series(statuses)} />
          })()}
        </Panel>
      </div>
      <Panel title="Probability × impact (number of risks)">
        <div className="gc-table-wrap">
          <table className="gc-matrix">
            <caption className="gc-sr">Number of risks by probability (rows) and impact (columns)</caption>
            <thead>
              <tr>
                <td />
                {IMPACTS.map((i) => (
                  <th key={i} scope="col">
                    {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROBABILITIES.map((p) => (
                <tr key={p}>
                  <th scope="row">{p}</th>
                  {IMPACTS.map((i) => {
                    const n = s.heat[p][i]
                    return (
                      <td key={i} className={`gc-matrix__cell gc-sev--${SEVERITY_TONE[riskSeverity(p, i)]}`} title={`${p} × ${i}: ${n} risk(s)`}>
                        <span className="gc-matrix__n">{n || ''}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

    </div>
  )
}

const RISK_STATUSES = { key: 'riskStatuses', report: '', label: '' }
const USERS = { key: 'users', report: '', label: '' }
const DEPARTMENTS = { key: 'departments', report: '', label: '' }
const opts = (values: readonly string[]) => values.map((v) => ({ id: v, label: v }))

/** One register row: Description, Department, Probability, Impact, Owner, Priority and Status save to the Project_Risk record
 *  straight from the list (Widget.project_risk_save recalculates Risk Score / Severity). Edit opens the full form. */
function RiskRow({ r, c, onEdit }: { r: Risk; c: TabContext; onEdit: () => void }) {
  const edit = c.details.canEdit
  const save = useSaveRisk(c.project.id)
  const statuses = useOptions(RISK_STATUSES, edit)
  const users = useOptions(USERS, edit)
  const departments = useOptions(DEPARTMENTS, edit)
  const set = (data: Record<string, unknown>) => save.mutate({ riskId: r.id, data })
  const sev = severityOf(r)
  const name = r.riskNo || r.description
  return (
    <tr>
      <td className="gc-wrap">
        <span className="gc-small gc-soft gc-block">{r.riskNo || '—'}</span>
        <InlineText value={r.description} label={`${name} description`} wide disabled={!edit} saving={save.isPending} onSave={(v) => set({ Risk_Description: v })} />
        {r.cause && <span className="gc-small gc-soft gc-block">Cause: {r.cause}</span>}
        {storedMismatch(r) && (
          <span className="gc-small gc-danger gc-block">
            ⚠ Stored severity / score ({r.storedSeverity || '—'} / {r.storedScore || '—'}) differ from Probability × Impact — change any value to recalculate
          </span>
        )}
        {!isComplete(r) && !r.owner && <span className="gc-small gc-danger gc-block">⚠ Open risk without an owner</span>}
        {save.error && <span className="gc-small gc-danger gc-block">{save.error.message}</span>}
      </td>
      <td>
        <InlineSelect value={r.departmentId} display={r.department} options={departments.data ?? []} loading={departments.isLoading} label={`${name} department`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Department: v })} />
      </td>
      <td>
        <span className="gc-cell-stack">
          <InlineSelect value={r.probability} display={r.probability} options={opts([...PROBABILITIES].reverse())} allowEmpty={false} label={`${name} probability`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Probability: v })} />
          <InlineSelect value={r.impact} display={r.impact} options={opts(IMPACTS)} allowEmpty={false} label={`${name} impact`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Impact: v })} />
        </span>
      </td>
      <td>{sev ? <Chip tone={SEVERITY_TONE[sev]}>{sev}</Chip> : '—'}</td>
      <td className="gc-num">{scoreOf(r) || '—'}</td>
      <td>
        <InlineSelect value={r.ownerId} display={r.owner} options={users.data ?? []} loading={users.isLoading} label={`${name} owner`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Risk_Owner: v })} />
      </td>
      <td>
        <InlineSelect value={r.priority} display={r.priority} options={opts(PRIORITIES)} label={`${name} priority`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Priority: v })} />
      </td>
      <td>
        <InlineSelect value={r.statusId} display={r.status} tone={isComplete(r) ? 'good' : 'info'} options={statuses.data ?? []} loading={statuses.isLoading} label={`${name} status`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Risk_Status: v })} />
      </td>
      {edit && (
        <td>
          <button type="button" className="gc-btn gc-btn--ghost gc-btn--sm" onClick={onEdit} aria-label={`Edit ${name}`}>
            Edit
          </button>
        </td>
      )}
    </tr>
  )
}
