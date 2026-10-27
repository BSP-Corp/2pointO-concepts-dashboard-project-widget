import { useMemo, useState } from 'react'
import { useDashboard } from '@/features/projects/api'
import { AreaChart, BarChart, DonutChart, GanttChart, GaugeChart, LineChart, PipeChart } from '@/features/console/charts'
import type { Nav } from '@/features/console/ConsoleApp'
import { Chip, ErrorPanel, Panel, SectionSkeleton } from '@/features/console/ui'
import { TopBar } from '@/features/console/TopBar'
import { countBy, formatDate, statusKey } from '@/lib/utils'
import type { DashboardProject } from '@/types/domain'
import { localToday, ratio } from '@/features/project/model'
import { ReferenceSearch } from './ReferenceSearch'

/**
 * Status groups (project lifecycle): Completed, DLP / Service and Closed = closed; On Hold; Cancelled;
 * every other stage = active.
 */
const group = (status: string) => {
  const k = statusKey(status)
  return /^(completed|dlp|closed)/.test(k) ? 'Closed' : k === 'on hold' ? 'On Hold' : k === 'cancelled' ? 'Cancelled' : 'Active'
}
/** Health: same rule as the Project Widget — a delayed milestone or an open Critical risk = At Risk. Closed projects are not rated. */
const healthOf = (p: DashboardProject) => (group(p.status) === 'Closed' || group(p.status) === 'Cancelled' ? 'Closed' : p.milestonesDelayed > 0 || p.risksCritical > 0 ? 'At Risk' : 'On Track')
// Dashboard palette: varied hues, no single dominant colour (tokens in console.css → .gc-dash)
const C = { blue: 'var(--gc-d-blue)', pink: 'var(--gc-d-pink)', purple: 'var(--gc-d-purple)', orange: 'var(--gc-d-orange)', yellow: 'var(--gc-d-yellow)', red: 'var(--gc-d-red)', teal: 'var(--gc-d-teal)', grey: 'var(--gc-other)' }
const HEALTH_COLORS: Record<string, string> = { 'On Track': C.blue, 'At Risk': C.orange, Closed: C.grey }
const compact = (n: number) => `AED ${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 }).format(n)}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** The 6 months before this one, this month and the 3 after: ["2026-04", …]. */
const monthWindow = (today: string) => {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - 6 + i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}
const monthLabel = (k: string) => `${MON[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`

/**
 * Home — the Project Search Dashboard. Per the architecture (Dashboard: completion, procurement, issues, days and cost vs
 * quote), each metric has its own visual: completion = half-pie gauges, lifecycle = pipe chart, health / type = pie charts,
 * days = Gantt, task trend = line + area charts, cost vs quote and issues = bar charts, analysis = pivot table.
 */
export function DashboardPage({ nav }: { nav: Nav }) {
  const onOpen = nav.project
  const q = useDashboard()

  const m = useMemo(() => {
    if (!q.data) return undefined
    const today = localToday()
    const ps = q.data.projects
    const sum = (rows: DashboardProject[], f: (p: DashboardProject) => number) => rows.reduce((t, p) => t + f(p), 0)
    const live = ps.filter((p) => group(p.status) === 'Active' || group(p.status) === 'On Hold')
    // Lifecycle pipeline: the static stage order, then On Hold / Cancelled; statuses outside it are listed last
    const order = q.data.stageOrder
    const known = new Set([...order, 'On Hold', 'Cancelled'].map(statusKey))
    const stageCount = (label: string) => ps.filter((p) => statusKey(p.status) === statusKey(label)).length
    const others = countBy(
      ps.filter((p) => !known.has(statusKey(p.status))),
      (p) => p.status,
      'No status',
    )
    const months = monthWindow(today)
    const due = months.map((k) => q.data!.tasksDueByMonth[k] ?? 0)
    const done = months.map((k) => q.data!.tasksDoneByMonth[k] ?? 0)
    const before = (map: Record<string, number>) => Object.entries(map).reduce((t, [k, n]) => t + (k < months[0] ? n : 0), 0)
    const cumulative = (vals: number[], start: number) => vals.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? start) + v], [])
    return {
      ps,
      today,
      tasksTotal: sum(ps, (p) => p.tasksTotal),
      tasksDone: sum(ps, (p) => p.tasksDone),
      linesTotal: sum(ps, (p) => p.linesTotal),
      linesDelivered: sum(ps, (p) => p.linesDelivered),
      health: countBy(ps, healthOf),
      byType: countBy(ps, (p) => p.type),
      pipeline: [...order.map((s) => ({ label: s, value: stageCount(s) })), { label: 'On Hold', value: stageCount('On Hold') }, { label: 'Cancelled', value: stageCount('Cancelled') }, ...others],
      gantt: [...live].sort((a, b) => (a.startDate || '9').localeCompare(b.startDate || '9')),
      months: months.map(monthLabel),
      thisMonth: 6,
      due,
      done,
      dueCum: cumulative(due, before(q.data.tasksDueByMonth)),
      doneCum: cumulative(done, before(q.data.tasksDoneByMonth)),
      cost: [...ps].sort((a, b) => b.value - a.value).slice(0, 8),
      issues: [...live].sort((a, b) => b.tasksOverdue + b.risksOpen - (a.tasksOverdue + a.risksOpen)).slice(0, 8),
    }
  }, [q.data])

  return (
    <main className="gc-main gc-dash">
      <header className="gc-home-head">
        <div>
          <span className="gc-eyebrow">2point0 Concepts · Project Search Dashboard</span>
          <h1 className="gc-display">Home</h1>
        </div>
        <TopBar name={q.data?.user} />
      </header>
      <div className="gc-finders" role="search">
        <ReferenceSearch estimates={q.data?.estimates} loading={q.isLoading} onPick={(e) => nav.costAnalysis(e.id)} />
        <label className="gc-finder" title="Approved projects only — opens the Project Widget">
          <span className="gc-finder__label">Go To</span>
          <select aria-label="Approved project" value="" disabled={!m} onChange={(e) => e.target.value && onOpen(e.target.value)}>
            <option value="">Approved project…</option>
            {m?.ps.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.reference, p.name].filter(Boolean).join(' – ')}
                {p.client ? ` · ${p.client}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.error ? (
        <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
      ) : !m ? (
        <SectionSkeleton label="Loading projects" />
      ) : m.ps.length === 0 ? (
        <NoProjects onRetry={() => q.refetch()} />
      ) : (
        <div className="gc-stack">
          <div className="gc-grid-3">
            <Panel title="Completion">
              <div className="gc-gauges gc-gauges--2">
                <GaugeChart label="Tasks completed" value={m.tasksDone} total={m.tasksTotal} color={C.purple} />
                <GaugeChart label="Assets delivered" value={m.linesDelivered} total={m.linesTotal} color={C.orange} sub={`${m.linesDelivered} of ${m.linesTotal} asset lines`} />
              </div>
            </Panel>
            <Panel title="Project health">
              <DonutChart data={m.health} centerLabel="Projects" colors={m.health.map((h) => HEALTH_COLORS[h.label] ?? C.grey)} />
              <p className="gc-small gc-soft">At Risk = a delayed milestone or an open Critical risk.</p>
            </Panel>
            <Panel title="Type of project">
              <DonutChart data={m.byType} centerLabel="Projects" colors={[C.purple, C.yellow, C.teal, C.pink, C.blue, C.orange]} />
            </Panel>
          </div>
          <Panel title="Project lifecycle pipeline">
            <PipeChart stages={m.pipeline} />
          </Panel>
          <Panel title="Project timelines (days) · active and on hold" actions={<span className="gc-small gc-soft">Start Date → Project Completion Date · fill = tasks completed · click to open</span>}>
            <GanttChart
              today={m.today}
              rows={m.gantt.map((p) => ({
                id: p.id,
                label: p.reference || p.name,
                sub: `${p.projectManager || 'No PM'} · ${p.status || '—'}`,
                start: p.startDate,
                end: p.completionDate,
                progress: (ratio(p.tasksDone, p.tasksTotal) ?? 0) * 100,
                color: healthOf(p) === 'At Risk' ? C.orange : C.purple,
                onClick: () => onOpen(p.id),
              }))}
            />
          </Panel>
          <div className="gc-grid-2">
            <Panel title="Tasks due vs completed per month">
              <LineChart
                labels={m.months}
                highlight={m.thisMonth}
                series={[
                  { key: 'due', label: 'Due', values: m.due, color: C.blue },
                  { key: 'done', label: 'Completed', values: m.done, color: C.pink },
                ]}
              />
            </Panel>
            <Panel title="Cumulative tasks: planned vs completed">
              <AreaChart
                labels={m.months}
                highlight={m.thisMonth}
                series={[
                  { key: 'planned', label: 'Planned (due)', values: m.dueCum, color: C.purple },
                  { key: 'completed', label: 'Completed', values: m.doneCum, color: C.yellow },
                ]}
              />
            </Panel>
            <Panel title="Cost vs quote · top 8 by Project Value (PO)">
              <BarChart
                rows={m.cost.map((p) => ({ label: p.reference || p.name, values: { quote: p.quote, cost: p.budget, po: p.value } }))}
                series={[
                  { key: 'quote', label: 'Quote (estimate sub total)' },
                  { key: 'cost', label: 'Budget cost' },
                  { key: 'po', label: 'Project Value (PO)' },
                ]}
                format={compact}
              />
            </Panel>
            <Panel title="Issues by project · active and on hold">
              <BarChart
                rows={m.issues.map((p) => ({ label: p.reference || p.name, values: { overdue: p.tasksOverdue, risks: p.risksOpen, critical: p.risksCritical } }))}
                series={[
                  { key: 'overdue', label: 'Overdue tasks' },
                  { key: 'risks', label: 'Open risks' },
                  { key: 'critical', label: 'Critical risks' },
                ]}
              />
            </Panel>
            <Panel title="Milestones by project · active and on hold">
              <BarChart
                rows={m.issues.map((p) => ({ label: p.reference || p.name, values: { done: p.milestonesDone, delayed: p.milestonesDelayed, open: Math.max(0, p.milestonesTotal - p.milestonesDone - p.milestonesDelayed) } }))}
                series={[
                  { key: 'done', label: 'Completed' },
                  { key: 'delayed', label: 'Delayed' },
                  { key: 'open', label: 'Open' },
                ]}
              />
            </Panel>
            <Panel title="Employees">
              <DonutChart
                data={[
                  { label: 'On project teams', value: q.data!.usersAssigned },
                  { label: 'Active, not on a team', value: Math.max(0, q.data!.usersActive - q.data!.usersAssigned) },
                  { label: 'Inactive', value: Math.max(0, q.data!.usersTotal - q.data!.usersActive) },
                ]}
                centerLabel="Employees"
                colors={[C.blue, C.pink, C.grey]}
              />
              <p className="gc-small gc-soft">{q.data!.teamAssignments} team assignments</p>
            </Panel>
          </div>
          <Pivot ps={m.ps} />
          <Panel title={`Projects (${m.ps.length})`} actions={<span className="gc-small gc-soft">Click a card to open the Project Widget</span>}>
            <div className="gc-cards">
              {m.ps.map((p) => {
                const h = healthOf(p)
                return (
                  <button key={p.id} type="button" className="gc-card" onClick={() => onOpen(p.id)} aria-label={`Open ${p.reference} ${p.name}`}>
                    <span className="gc-card__top">
                      <span className="gc-card__ref">{p.reference || '—'}</span>
                      <Chip tone={h === 'At Risk' ? 'warning' : h === 'On Track' ? 'info' : undefined}>{h}</Chip>
                    </span>
                    <strong className="gc-card__name">{p.name || '—'}</strong>
                    <span className="gc-small gc-soft">
                      {p.client || '—'} · {compact(p.value)}
                    </span>
                    <span className="gc-small gc-muted">
                      {p.status || '—'} · due {formatDate(p.completionDate)}
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>
        </div>
      )}
    </main>
  )
}

function NoProjects({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="gc-panel gc-notice" role="status">
      <strong>No projects</strong>
      <span className="gc-soft gc-small">Widget.project_dashboard returned no Project records for your user in this environment.</span>
      <button type="button" className="gc-btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

// ── Pivot table: the user picks rows, columns and the value ──
const DIMENSIONS: Record<string, (p: DashboardProject) => string> = {
  'Project manager': (p) => p.projectManager || 'Not assigned',
  'Type of project': (p) => p.type || 'Not set',
  Stage: (p) => p.status || 'No status',
  Client: (p) => p.client || 'Not set',
  Lifecycle: (p) => group(p.status),
  Health: healthOf,
}
const MEASURES: Record<string, { get: (p: DashboardProject) => number; money?: boolean }> = {
  Projects: { get: () => 1 },
  'Project Value (PO)': { get: (p) => p.value, money: true },
  'Budget cost': { get: (p) => p.budget, money: true },
  'Quote (estimate)': { get: (p) => p.quote, money: true },
  'Estimated margin': { get: (p) => p.margin, money: true },
  'Overdue tasks': { get: (p) => p.tasksOverdue },
  'Delayed milestones': { get: (p) => p.milestonesDelayed },
  'Open risks': { get: (p) => p.risksOpen },
}

function Pivot({ ps }: { ps: DashboardProject[] }) {
  const [rowDim, setRowDim] = useState('Project manager')
  const [colDim, setColDim] = useState('Lifecycle')
  const [measure, setMeasure] = useState('Projects')
  const rowOf = DIMENSIONS[rowDim]
  const colOf = DIMENSIONS[colDim]
  const { get, money } = MEASURES[measure]
  const rows = [...new Set(ps.map(rowOf))].sort()
  const cols = [...new Set(ps.map(colOf))].sort()
  const cell = (r: string, c: string) => ps.filter((p) => rowOf(p) === r && colOf(p) === c).reduce((t, p) => t + get(p), 0)
  const rowTotal = (r: string) => ps.filter((p) => rowOf(p) === r).reduce((t, p) => t + get(p), 0)
  const colTotal = (c: string) => ps.filter((p) => colOf(p) === c).reduce((t, p) => t + get(p), 0)
  const grand = ps.reduce((t, p) => t + get(p), 0)
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => cell(r, c))))
  const fmt = (n: number) => (n === 0 ? '·' : money ? compact(n) : String(n))
  const pick = (label: string, value: string, set: (v: string) => void, options: string[]) => (
    <label className="gc-small gc-soft gc-inline-field">
      {label}
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={`Pivot ${label.toLowerCase()}`}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )
  return (
    <Panel
      title="Pivot table"
      flush
      actions={
        <span className="gc-pivot__controls">
          {pick('Rows', rowDim, setRowDim, Object.keys(DIMENSIONS))}
          {pick('Columns', colDim, setColDim, Object.keys(DIMENSIONS))}
          {pick('Value', measure, setMeasure, Object.keys(MEASURES))}
        </span>
      }
    >
      <div className="gc-table-wrap">
        <table className="gc-table gc-pivot" aria-label={`Pivot: ${measure} by ${rowDim} and ${colDim}`}>
          <thead>
            <tr>
              <th scope="col">
                {rowDim} \ {colDim}
              </th>
              {cols.map((c) => (
                <th key={c} scope="col" className="gc-num">
                  {c}
                </th>
              ))}
              <th scope="col" className="gc-num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row" className="gc-wrap">
                  {r}
                </th>
                {cols.map((c) => {
                  const v = cell(r, c)
                  return (
                    <td key={c} className="gc-num gc-pivot__cell" style={{ ['--heat' as string]: String(v / max) }}>
                      {fmt(v)}
                    </td>
                  )
                })}
                <td className="gc-num">
                  <strong>{fmt(rowTotal(r))}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {cols.map((c) => (
                <td key={c} className="gc-num">
                  {fmt(colTotal(c))}
                </td>
              ))}
              <td className="gc-num">{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  )
}
