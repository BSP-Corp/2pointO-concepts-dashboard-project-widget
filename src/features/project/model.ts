// Every figure of the Project Widget is computed here, once, from raw Creator values. The header, the Overview and the
// tabs all read these results, so a number shown in two places always agrees (contract value = BOQ total, delivered
// assets = Asset Register, open risks = Risks tab). Rounding happens only when values are displayed.
import { TECHNICIAN_ROLES } from '@/config/zoho'
import type { BoqLine, CostingLine, PaymentMilestone, PlanMilestone, PoLine, PurchaseOrder, Ref, TeamMember, WorkTask } from '@/types/domain'

// ── dates (ISO yyyy-mm-dd, compared as strings) ──
/** Today in the viewer's own time zone. */
export const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
/** "X days left" / "Overdue by X days" / "Due today"; '' without an end date or once closed. */
export function dueText(endDate: string, today: string, closed: boolean): string {
  if (!endDate || closed) return ''
  const d = daysBetween(today, endDate)
  return d > 0 ? `${d} day${d === 1 ? '' : 's'} left` : d === 0 ? 'Due today' : `Overdue by ${-d} day${d === -1 ? '' : 's'}`
}
/** null instead of NaN / Infinity, so the UI shows "—". */
export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null)

// ── asset status (Status records) — same rule as Widget.project_dashboard ──
// Delivered = "Delivered to Client" / "Delivered" / "Installed" (never "Not …" or "Partially …").
// Not yet ordered = "Not Ordered" / "Order Pending" / no status. Everything else is ordered and on its way (production,
// shipping, customs, 2.0 warehouse / office, partially delivered).
const norm = (s: string) => s.trim().toLowerCase()
export const isDeliveredStatus = (name: string) => {
  const n = norm(name)
  return !n.startsWith('not') && !n.includes('partial') && (n.includes('delivered to client') || /^delivered\b/.test(n) || n.includes('install'))
}
export const isNotOrderedStatus = (name: string) => !norm(name) || /not ordered|order pending/.test(norm(name))
export const isTransitStatus = (name: string) => !isDeliveredStatus(name) && !isNotOrderedStatus(name)
export const lineDelivered = (l: CostingLine) => isDeliveredStatus(l.deliveryStatus) || isDeliveredStatus(l.installationStatus)
export const lineInTransit = (l: CostingLine) => !lineDelivered(l) && isTransitStatus(l.deliveryStatus)

// ── BOQ (amount from the approved estimate lines, procured from POs, delivered from the Asset Register) ──
export interface BoqRow {
  line: BoqLine
  rate: number | null
  /** Unit COST from the approved Cost Analysis lines (Total_Cost ÷ quantity) — what a vendor PO is priced at */
  unitCost: number | null
  amount: number
  procured: number
  delivered: number
  inTransit: number
  assets: CostingLine[]
  issues: string[]
}

/**
 * PO lines of a BOQ line: by PO_Line_Items.BOQ when the line has it (POs raised from the widget), else — older lines —
 * by product on a PO that lists the BOQ line.
 */
export function linesForBoq(b: BoqLine, orders: PurchaseOrder[], poLines: PoLine[]): PoLine[] {
  const orderIds = new Set(orders.filter((o) => o.boqIds.includes(b.id)).map((o) => o.id))
  return poLines.filter((l) => (l.boqId ? l.boqId === b.id : !!b.productId && orderIds.has(l.purchaseOrderId) && l.itemId === b.productId))
}

export function buildBoq(boq: BoqLine[], lines: CostingLine[], orders: PurchaseOrder[], poLines: PoLine[]): { rows: BoqRow[]; total: number } {
  const byId = new Map(lines.map((l) => [l.id, l]))
  const rows = boq.map((b) => {
    const assets = b.lineIds.map((id) => byId.get(id)).filter((l): l is CostingLine => !!l)
    const price = assets.reduce((s, l) => s + l.totalPrice, 0)
    const qty = assets.reduce((s, l) => s + l.quantity, 0)
    const rate = qty > 0 ? price / qty : null
    const unitCost = qty > 0 ? assets.reduce((s, l) => s + l.totalCost, 0) / qty : null
    const amount = rate === null ? 0 : b.quantity * rate
    // A BOQ line without a product cannot be put on a PO or matched to older PO lines (flagged below).
    const procured = linesForBoq(b, orders, poLines).reduce((s, l) => s + l.quantity, 0)
    const delivered = assets.filter(lineDelivered).reduce((s, l) => s + l.quantity, 0)
    const inTransit = assets.filter(lineInTransit).reduce((s, l) => s + l.quantity, 0)
    const issues: string[] = []
    if (rate === null) issues.push('No approved estimate line — rate unknown')
    if (!b.productId) issues.push('No product (SKU) — procured quantity cannot be matched to PO lines')
    if (procured > b.quantity + 1e-9) issues.push(`Procured ${procured} exceeds BOQ quantity ${b.quantity}`)
    if (delivered > b.quantity + 1e-9) issues.push(`Delivered ${delivered} exceeds BOQ quantity ${b.quantity}`)
    return { line: b, rate, unitCost, amount, procured, delivered, inTransit, assets, issues }
  })
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) }
}

/** Assets delivered to site per BOQ category: delivered + in transit + not yet ordered = BOQ quantity. */
export function deliveryByCategory(rows: BoqRow[]) {
  const m = new Map<string, { category: string; total: number; delivered: number; inTransit: number }>()
  for (const r of rows) {
    const k = r.line.category || 'Uncategorised'
    const c = m.get(k) ?? { category: k, total: 0, delivered: 0, inTransit: 0 }
    c.total += r.line.quantity
    c.delivered += Math.min(r.delivered, r.line.quantity)
    c.inTransit += Math.min(r.inTransit, Math.max(0, r.line.quantity - r.delivered))
    m.set(k, c)
  }
  return [...m.values()].map((c) => ({ ...c, notOrdered: Math.max(0, c.total - c.delivered - c.inTransit) }))
}

/** Asset lines that no BOQ row references (data issue, shown flagged — never hidden). */
export const unlinkedAssets = (lines: CostingLine[], boq: BoqLine[]) => {
  const linked = new Set(boq.flatMap((b) => b.lineIds))
  return lines.filter((l) => !linked.has(l.id))
}

// ── tasks & milestones ──
// Milestone & Task redesign (Creator): every Task has a Milestone lookup; a Work Package root (Type "Work Package", no
// Parent_Task, e.g. "AV01 | Area_System Name") groups its tasks; sub-tasks sit under their Parent_Task. No task list rows.
/** A work package root: the group row of its tasks (not a task itself) */
export const isPackageRoot = (t: WorkTask) => !t.parent && /work package/i.test(t.type)
/** Group rows (work package roots) are not counted as tasks */
export const isTaskList = isPackageRoot
const closedStatus = (t: WorkTask) => /complete|closed/i.test(t.status?.label ?? '')
export const isDone = (t: WorkTask) => !!t.actualEnd || t.percent >= 100 || closedStatus(t)
export const isDelayed = (t: WorkTask, today: string) => !isDone(t) && !!t.endDate && (t.actualEnd || today) > t.endDate
export const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
/** Work tasks = every task except the work package group rows. */
export const workTasks = (tasks: WorkTask[]) => tasks.filter((t) => !isTaskList(t))
export const childrenOf = (tasks: WorkTask[], id: string) => tasks.filter((t) => t.parent?.id === id)
export function descendants(tasks: WorkTask[], id: string): WorkTask[] {
  const out: WorkTask[] = []
  const walk = (pid: string, seen: Set<string>) => {
    for (const c of childrenOf(tasks, pid)) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
      walk(c.id, seen)
    }
  }
  walk(id, new Set([id]))
  return out
}
/** The top task (no parent) a task sits under. */
export function rootOf(tasks: WorkTask[], t: WorkTask): WorkTask {
  let cur = t
  const seen = new Set<string>()
  while (cur.parent && !seen.has(cur.id)) {
    seen.add(cur.id)
    const up = tasks.find((x) => x.id === cur.parent!.id)
    if (!up) break
    cur = up
  }
  return cur
}

/**
 * Tasks of one milestone (groupTasksByMilestone of the redesign): roots = its tasks without a parent, or whose parent is in
 * another milestone; work package roots become groups, the other roots show straight under the milestone. `tasks` = every
 * task shown under it (roots and their sub-tasks), without the work package group rows.
 */
export function milestoneTasks(tasks: WorkTask[], milestoneId: string | null) {
  const own = tasks.filter((t) => (milestoneId ? t.milestone?.id === milestoneId : !t.milestone && !t.parent))
  const ids = new Set(own.map((t) => t.id))
  const roots = own.filter((t) => !t.parent || !ids.has(t.parent.id) || !milestoneId)
  const packages = roots.filter(isPackageRoot)
  const direct = roots.filter((t) => !isPackageRoot(t))
  const seen = new Set<string>()
  const under: WorkTask[] = []
  for (const r of roots) for (const t of [r, ...descendants(tasks, r.id)]) if (!seen.has(t.id) && !isPackageRoot(t)) (seen.add(t.id), under.push(t))
  return { packages, roots: direct, tasks: under }
}

/** Work package groups across the project (Execution → Asset): each work package root with its tasks and sub-tasks */
export function workPackageGroups(tasks: WorkTask[]) {
  return tasks
    .filter(isPackageRoot)
    .sort((a, b) => wpTag(a.workPackage || a.name).localeCompare(wpTag(b.workPackage || b.name)) || a.name.localeCompare(b.name))
    .map((root) => ({ root, tasks: descendants(tasks, root.id) }))
}

/** Short work package tag: "AV02: [DS-01 …]" → "AV02". */
export const wpTag = (wp: string) => wp.split(/[:|[]/)[0].trim()

// ── dates of a schedule row: Duration counts both the start and the due day ──
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const endFromDuration = (start: string, duration: number) => (start && duration > 0 ? addDays(start, duration - 1) : '')
export const durationOf = (start: string, end: string) => (start && end && end >= start ? daysBetween(start, end) + 1 : 0)

/** Milestone planned start = project Start Date + Starts after (Days / Weeks / Months); '' without a project start. */
export function milestoneStart(projectStart: string, after: number, unit: string): string {
  if (!projectStart) return ''
  const d = new Date(`${projectStart}T00:00:00Z`)
  if (/month/i.test(unit)) d.setUTCMonth(d.getUTCMonth() + after)
  else d.setUTCDate(d.getUTCDate() + after * (/week/i.test(unit) ? 7 : 1))
  return d.toISOString().slice(0, 10)
}
/** Starts after for a chosen start date: keeps Weeks / Months when the date fits them exactly, else Days. */
export function startsAfterFor(projectStart: string, start: string, unit: string): { after: number; unit: string } {
  const days = daysBetween(projectStart, start)
  if (/month/i.test(unit)) {
    const a = new Date(`${projectStart}T00:00:00Z`)
    const b = new Date(`${start}T00:00:00Z`)
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth()
    if (milestoneStart(projectStart, months, 'Months') === start && months >= 0) return { after: months, unit: 'Months' }
  }
  if (/week/i.test(unit) && days % 7 === 0) return { after: days / 7, unit: 'Weeks' }
  return { after: days, unit: 'Days' }
}

export type MilestoneState = 'Completed' | 'Delayed' | 'In Progress' | 'Not Started'
export interface MilestoneRow {
  milestone: PlanMilestone
  start: string
  end: string
  /** Work package roots of this milestone (Project Execution: AV-01, AV-02…), their tasks under them */
  packages: WorkTask[]
  /** Tasks straight under the milestone (sub-tasks under them) */
  roots: WorkTask[]
  /** Every task under the milestone (roots, work package tasks, sub-tasks) */
  tasks: WorkTask[]
  done: number
  /** % of its tasks done (closed ÷ total), as Zoho Projects */
  progress: number
  state: MilestoneState
}
const milestoneClosed = (m: PlanMilestone) => /complete|closed/i.test(m.status?.label ?? '')

/** The Project Execution milestone */
export const isExecution = (m: PlanMilestone) => /project execution/i.test(m.name)

export function buildMilestones(plan: PlanMilestone[], tasks: WorkTask[], projectStart: string, today: string): MilestoneRow[] {
  return plan.map((m) => {
    const start = milestoneStart(projectStart, m.startsAfter, m.startsAfterIn)
    const end = endFromDuration(start, Math.max(1, m.duration))
    const { packages, roots, tasks: under } = milestoneTasks(tasks, m.id)
    const done = under.filter(isDone).length
    const progress = under.length ? (done / under.length) * 100 : milestoneClosed(m) ? 100 : 0
    const completed = milestoneClosed(m) || (under.length > 0 && done === under.length)
    const state: MilestoneState = completed ? 'Completed' : !!end && end < today ? 'Delayed' : progress > 0 || (!!start && start <= today) ? 'In Progress' : 'Not Started'
    return { milestone: m, start, end, packages, roots, tasks: under, done, progress, state }
  })
}

/**
 * Overall progress — TASK-WEIGHTED: the average % complete of all tasks (a completed task counts 100%).
 * Planned progress — from milestone plan dates: each milestone's elapsed share of its start→end window today, averaged.
 */
export function progress(tasks: WorkTask[], milestones: MilestoneRow[], today: string) {
  const work = workTasks(tasks)
  const actual = work.length ? work.reduce((s, t) => s + (isDone(t) ? 100 : Math.min(100, t.percent)), 0) / work.length : null
  const ms = milestones.filter((m) => m.start && m.end)
  const planned = ms.length
    ? (ms.reduce((s, m) => {
        const span = daysBetween(m.start, m.end)
        const elapsed = daysBetween(m.start, today)
        return s + (span <= 0 ? (today >= m.end ? 1 : 0) : Math.min(1, Math.max(0, elapsed / span)))
      }, 0) /
        ms.length) *
      100
    : null
  return { actual, planned }
}

/** Top 5 open tasks that are High priority or delayed — by priority, then due date. */
export const priorityTasks = (tasks: WorkTask[], today: string) =>
  tasks
    .filter((t) => !isTaskList(t) && !isDone(t) && (t.priority === 'High' || isDelayed(t, today)))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || (a.endDate || '9').localeCompare(b.endDate || '9'))
    .slice(0, 5)

/** Open tasks scheduled today (start ≤ today ≤ due) — the Task form has dates, not times. */
export const todaysTasks = (tasks: WorkTask[], today: string) =>
  tasks
    .filter((t) => !isTaskList(t) && !isDone(t) && !!t.startDate && t.startDate <= today && (!t.endDate || t.endDate >= today))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || a.name.localeCompare(b.name))

// ── team ──
export const isTechnician = (m: Pick<TeamMember, 'role'>) => TECHNICIAN_ROLES.includes(m.role)
export function teamWithToday(team: TeamMember[], today: WorkTask[]) {
  const onSite = new Set(today.flatMap((t) => t.owners.map((o) => o.id)))
  const rows = team.map((m) => ({ ...m, technician: isTechnician(m), onSiteToday: onSite.has(m.id) }))
  return { rows, technicians: rows.filter((r) => r.technician).length, users: rows.filter((r) => !r.technician).length }
}

/** Task data issues: shown flagged, never hidden. `linkedLists` = IDs of task lists that belong to a milestone. */
export function taskIssues(t: WorkTask, all: WorkTask[], teamIds: Set<string>, milestoneIds?: Set<string>): string[] {
  const issues: string[] = []
  if (t.startDate && t.endDate && t.endDate < t.startDate) issues.push('Due date is before the start date')
  if (t.parent && !all.some((x) => x.id === t.parent!.id)) issues.push('Parent task is not in this project')
  if (milestoneIds && !t.parent && !t.milestone) issues.push('No milestone — set it in the task')
  if (milestoneIds && t.milestone && !milestoneIds.has(t.milestone.id)) issues.push('Milestone is not in this project')
  const outside = t.owners.filter((o) => !teamIds.has(o.id)).map((o) => o.label)
  if (outside.length) issues.push(`Not on the project team: ${outside.join(', ')}`)
  return issues
}

// ── health (proposed rule — no health logic exists in the app): At Risk if a milestone is delayed or a critical risk is open ──
export const health = (milestones: MilestoneRow[], criticalOpenRisks: number) => (milestones.some((m) => m.state === 'Delayed') || criticalOpenRisks > 0 ? 'At Risk' : 'On Track')

// ── payment milestones (billing) ──
export const billingTotal = (rows: PaymentMilestone[]) => rows.reduce((s, r) => s + r.percentage, 0)

// ── pipeline ──
export function stageIndex(stages: Ref[], status: string) {
  return stages.findIndex((s) => s.label === status)
}
