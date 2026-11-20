import { useMemo, useState } from 'react'
import { BarChart, DonutChart, type BarRow } from '@/features/console/charts'
import { Chip, Disclosure, Empty, ErrorPanel, Kpi, Panel, SEVERITY_TONE } from '@/features/console/ui'
import { IMPACTS, PRIORITIES, PROBABILITIES, SEVERITIES, isComplete, riskScore, riskSeverity, scoreOf, severityOf, storedMismatch, summarizeRisks } from '@/features/risk/calc'
import { plainToRichText } from '@/lib/data/zohoSource'
import { countBy } from '@/lib/utils'
import type { Risk } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
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
 * Risks (PPT 7a / 7b / 7c): one tab — the workbook's dashboard figures on top, then the register. Every field saves from
 * the list; "+ Add risk" opens an inline row (no pop-up). Score / severity are calculated from Probability × Impact.
 */
export function RisksTab(c: TabContext) {
  const { q, s } = useRiskData(c)
  const [adding, setAdding] = useState(false)
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data || !s) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading risks" />
  const rows = q.data
  const canEdit = c.details.canEdit
  return (
    <div className="gc-stack">
      <div className="gc-kpis gc-kpis--flat">
        <Kpi tone="blue" label="Total risks" value={s.total} />
        <Kpi tone="amber" label="Active risks" value={s.active} sub="Status not Complete" />
        <Kpi tone="green" label="Completed risks" value={s.completed} />
        <Kpi tone="violet" label="Average risk score" value={s.averageScore ? `${s.averageScore} / 25` : '—'} sub="Open risks · Probability × Impact" />
      </div>
      <Panel
        title={`Risk register (${rows.length})`}
        flush
        actions={
          canEdit && (
            <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" disabled={adding} onClick={() => setAdding(true)}>
              + Add risk
            </button>
          )
        }
      >
        {rows.length === 0 && !adding ? (
          <Empty>No records for this project</Empty>
        ) : (
          <div className="gc-table-wrap">
            <table className="gc-table gc-list-table gc-risk-table">
              <colgroup>
                <col style={{ width: 84 }} />
                <col style={{ minWidth: 220 }} />
                <col style={{ minWidth: 160 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Risk ID</th>
                  <th scope="col">Description</th>
                  <th scope="col">Cause</th>
                  <th scope="col">Department</th>
                  <th scope="col">Probability</th>
                  <th scope="col">Impact</th>
                  <th scope="col">Severity</th>
                  <th scope="col" className="gc-num">
                    Score
                  </th>
                  <th scope="col">Owner</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {adding && <NewRiskRow c={c} onDone={() => setAdding(false)} />}
                {[...rows]
                  .sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)) || scoreOf(b) - scoreOf(a))
                  .map((r) => (
                    <RiskRow key={r.id} r={r} c={c} />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {rows.length > 0 && (
        <Disclosure header={<strong>Risk dashboard</strong>} defaultOpen>
          <RiskDashboard rows={rows} heat={s.heat} />
        </Disclosure>
      )}
    </div>
  )
}

/** Workbook "Risk Dashboard" breakdowns: status, priority, severity, impact, department and owner, and the P × I matrix. */
function RiskDashboard({ rows, heat }: { rows: Risk[]; heat: Record<string, Record<string, number>> }) {
  return (
    <div className="gc-stack">
      <div className="gc-grid-2">
        <Panel title="Risks by status">
          <DonutChart data={countBy(rows, (r) => r.status, 'No status')} centerLabel="Risks" />
        </Panel>
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
                      const n = heat[p][i]
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
        <Panel title="Risks breakdown by severity">
          <BarChart rows={SEVERITIES.map((k) => ({ label: k, values: { n: rows.filter((r) => severityOf(r) === k).length } }))} series={[{ key: 'n', label: 'Risks' }]} />
        </Panel>
        <Panel title="Risks by priority">
          <DonutChart data={countBy(rows, (r) => r.priority, 'No priority')} centerLabel="Risks" />
        </Panel>
        <Panel title="Risk severity among departments">
          <BarChart rows={breakdown(rows, (r) => r.department, severityOf, SEVERITIES)} series={series(SEVERITIES)} />
        </Panel>
        <Panel title="Risk severity by risk owner">
          <BarChart rows={breakdown(rows, (r) => r.owner, severityOf, SEVERITIES)} series={series(SEVERITIES)} />
        </Panel>
      </div>
    </div>
  )
}

const RISK_STATUSES = { key: 'riskStatuses', report: '', label: '' }
const USERS = { key: 'users', report: '', label: '' }
const DEPARTMENTS = { key: 'departments', report: '', label: '' }
const opts = (values: readonly string[]) => values.map((v) => ({ id: v, label: v }))

/** One register row — every field saves to the Project_Risk record from the list (Widget.project_risk_save recalculates
 *  Risk Score / Severity). One value per cell. */
function RiskRow({ r, c }: { r: Risk; c: TabContext }) {
  const edit = c.details.canEdit
  const save = useSaveRisk(c.project.id)
  const statuses = useOptions(RISK_STATUSES, edit)
  const users = useOptions(USERS, edit)
  const departments = useOptions(DEPARTMENTS, edit)
  const set = (data: Record<string, unknown>) => save.mutate({ riskId: r.id, data })
  const sev = severityOf(r)
  const name = r.riskNo || r.description
  const issue = storedMismatch(r)
    ? `Stored severity / score (${r.storedSeverity || '—'} / ${r.storedScore || '—'}) differ from Probability × Impact — change any value to recalculate`
    : !isComplete(r) && !r.owner
      ? 'Open risk without an owner'
      : ''
  return (
    <tr className={issue ? 'gc-row-flag' : undefined}>
      <td>
        <InlineText value={r.riskNo} label={`${name} risk ID`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Risk_ID: v })} />
      </td>
      <td className="gc-wrap">
        <InlineText value={r.description} label={`${name} description`} wide disabled={!edit} saving={save.isPending} onSave={(v) => set({ Risk_Description: v })} />
        {issue && (
          <span className="gc-small gc-danger gc-block" title={issue}>
            ⚠ {issue}
          </span>
        )}
        {save.error && <span className="gc-small gc-danger gc-block">{save.error.message}</span>}
      </td>
      <td className="gc-wrap">
        <InlineText value={r.cause} label={`${name} cause`} wide disabled={!edit} saving={save.isPending} onSave={(v) => set({ Cause: plainToRichText(v) })} />
      </td>
      <td>
        <InlineSelect
          value={r.departmentId}
          display={r.department}
          options={departments.data ?? []}
          loading={departments.isLoading}
          label={`${name} department`}
          disabled={!edit}
          saving={save.isPending}
          onSave={(v) => set({ Department: v })}
        />
      </td>
      <td>
        <InlineSelect
          value={r.probability}
          display={r.probability}
          options={opts([...PROBABILITIES].reverse())}
          allowEmpty={false}
          label={`${name} probability`}
          disabled={!edit}
          saving={save.isPending}
          onSave={(v) => set({ Probability: v })}
        />
      </td>
      <td>
        <InlineSelect
          value={r.impact}
          display={r.impact}
          options={opts(IMPACTS)}
          allowEmpty={false}
          label={`${name} impact`}
          disabled={!edit}
          saving={save.isPending}
          onSave={(v) => set({ Impact: v })}
        />
      </td>
      <td>{sev ? <Chip tone={SEVERITY_TONE[sev]}>{sev}</Chip> : '—'}</td>
      <td className="gc-num">{scoreOf(r) || '—'}</td>
      <td>
        <InlineSelect
          value={r.ownerId}
          display={r.owner}
          options={users.data ?? []}
          loading={users.isLoading}
          label={`${name} owner`}
          disabled={!edit}
          saving={save.isPending}
          onSave={(v) => set({ Risk_Owner: v })}
        />
      </td>
      <td>
        <InlineSelect value={r.priority} display={r.priority} options={opts(PRIORITIES)} label={`${name} priority`} disabled={!edit} saving={save.isPending} onSave={(v) => set({ Priority: v })} />
      </td>
      <td>
        <InlineSelect
          value={r.statusId}
          display={r.status}
          tone={isComplete(r) ? 'good' : 'info'}
          options={statuses.data ?? []}
          loading={statuses.isLoading}
          label={`${name} status`}
          disabled={!edit}
          saving={save.isPending}
          onSave={(v) => set({ Risk_Status: v })}
        />
      </td>
    </tr>
  )
}

/** Inline add row (PPT 7a): the Project_Risk fields in the register's own columns; Save submits, Cancel / Esc drops it. */
function NewRiskRow({ c, onDone }: { c: TabContext; onDone: () => void }) {
  const save = useSaveRisk(c.project.id)
  const statuses = useOptions(RISK_STATUSES)
  const users = useOptions(USERS)
  const departments = useOptions(DEPARTMENTS)
  const [v, setV] = useState({ Risk_ID: '', Risk_Description: '', Cause: '', Department: '', Probability: '', Impact: '', Risk_Owner: '', Priority: '', Risk_Status: '' })
  const [tried, setTried] = useState(false)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }))
  const missing = [!v.Risk_Description.trim() && 'Description', !v.Probability && 'Probability', !v.Impact && 'Impact'].filter(Boolean) as string[]
  const submit = () => {
    setTried(true)
    if (missing.length) return
    const data = Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x.trim() !== '')
        .map(([k, x]) => [k, k === 'Cause' ? plainToRichText(x) : x.trim()]),
    )
    save.mutate({ data }, { onSuccess: onDone })
  }
  const sev = riskSeverity(v.Probability, v.Impact)
  const select = (k: keyof typeof v, label: string, options: { id: string; label: string }[], loading = false) => (
    <select className="gc-input-sm" value={v[k]} onChange={set(k)} aria-label={`New risk ${label}`} aria-invalid={tried && missing.includes(label) ? true : undefined}>
      <option value="">{loading ? 'Loading…' : '-Select-'}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
  return (
    <>
      <tr className="gc-risk-new" onKeyDown={(e) => e.key === 'Escape' && onDone()}>
        <td>
          <span className="gc-risk-autono" aria-label="New risk ID" title="Numbered automatically when saved (Autogenerate: Risk)">
            Auto-generated
          </span>
        </td>
        <td>
          <input
            autoFocus
            className="gc-input-sm"
            value={v.Risk_Description}
            onChange={set('Risk_Description')}
            placeholder="Describe the risk"
            aria-label="New risk Description"
            aria-invalid={tried && !v.Risk_Description.trim() ? true : undefined}
          />
        </td>
        <td>
          <input className="gc-input-sm" value={v.Cause} onChange={set('Cause')} placeholder="Cause" aria-label="New risk cause" />
        </td>
        <td>{select('Department', 'Department', departments.data ?? [], departments.isLoading)}</td>
        <td>{select('Probability', 'Probability', opts([...PROBABILITIES].reverse()))}</td>
        <td>{select('Impact', 'Impact', opts(IMPACTS))}</td>
        <td>{sev ? <Chip tone={SEVERITY_TONE[sev]}>{sev}</Chip> : '—'}</td>
        <td className="gc-num">{riskScore(v.Probability, v.Impact) || '—'}</td>
        <td>{select('Risk_Owner', 'Owner', users.data ?? [], users.isLoading)}</td>
        <td>{select('Priority', 'Priority', opts(PRIORITIES))}</td>
        <td>{select('Risk_Status', 'Status', statuses.data ?? [], statuses.isLoading)}</td>
      </tr>
      <tr className="gc-risk-new gc-risk-new__bar">
        <td colSpan={11}>
          <span className="gc-small gc-soft">
            {tried && missing.length ? <span className="gc-danger">Required: {missing.join(', ')}</span> : 'Score and severity are calculated from Probability × Impact.'}
          </span>
          {save.error && <span className="gc-small gc-danger"> {save.error.message}</span>}
          <span className="gc-grow" />
          <button type="button" className="gc-btn gc-btn--sm" onClick={onDone} disabled={save.isPending}>
            Cancel
          </button>
          <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save risk'}
          </button>
        </td>
      </tr>
    </>
  )
}
