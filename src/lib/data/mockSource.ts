// Demo data source for running outside Creator. Holds Creator-shaped records (seed.ts), reuses the Zoho mappers and
// applies the same rules as the Deluge functions, so every screen behaves the same on demo and live data.
import { ADDRESS_PARTS, LOOKUPS, PROJECT_FORM, type LookupSource } from '@/config/projectForm'
import { FIELDS, PAGES } from '@/config/zoho'
import type { CreatorRecord, Option, ProjectKey } from '@/types/domain'
import { buildMilestones, isDone, isTaskList, lineDelivered, localToday } from '@/features/project/model'
import { isComplete, riskScore, riskSeverity, severityOf } from '@/features/risk/calc'
import type { DataSource } from './types'
import * as seed from './seed'
import { NotFoundError, fromCreatorDate, str, toActivity, toBoqLine, toCostingLine, toDashboard, toDetails, toMilestone, toPlanMilestone, toPoLine, toProject, toPurchaseOrder, toRisk, toTask } from './zohoSource'

interface MockDb {
  projects: CreatorRecord[]
  costingLines: CreatorRecord[]
  boq: CreatorRecord[]
  purchaseOrders: CreatorRecord[]
  poLines: CreatorRecord[]
  milestones: CreatorRecord[]
  tasks: CreatorRecord[]
  risks: CreatorRecord[]
  planMilestones: CreatorRecord[]
  activity: CreatorRecord[]
}

// v4: Project pipeline statuses, tasks and team (DS 8).
const STORAGE_KEY = '2point0-pm:mockdb:v6'

const freshDb = (): MockDb =>
  structuredClone({
    projects: seed.seedProjects,
    costingLines: seed.seedCostingLines,
    boq: seed.seedBoq,
    purchaseOrders: seed.seedPurchaseOrders,
    poLines: seed.seedPoLines,
    milestones: seed.seedMilestones,
    tasks: seed.seedTasks,
    risks: seed.seedRisks,
    planMilestones: seed.seedPlanMilestones,
    activity: [] as CreatorRecord[],
  })

function loadDb(persist: boolean): MockDb {
  if (!persist) return freshDb()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MockDb
  } catch {
    /* storage unavailable — use the seed */
  }
  return freshDb()
}

const OPTION_ROWS: Record<string, [CreatorRecord[], string]> = {
  [LOOKUPS.customers.key]: [seed.seedCustomers, 'Customer_Name'],
  [LOOKUPS.statuses.key]: [seed.seedStatuses, 'Status_Name'],
  [LOOKUPS.countries.key]: [seed.seedCountries, 'Country_Name'],
  [LOOKUPS.currencies.key]: [seed.seedCurrencies, 'Currency_Name'],
  [LOOKUPS.users.key]: [seed.seedUsers, 'Name'],
  [LOOKUPS.estimates.key]: [seed.seedEstimates, 'Quote_No'],
  [LOOKUPS.taskList.key]: [seed.seedTaskList, 'Task_Name'],
  taskStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('Task')), 'Status_Name'],
  installStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('Installation')), 'Status_Name'],
  boqStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('BOQ')), 'Status_Name'],
  milestoneStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('Milestone')), 'Status_Name'],
  projectStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('Project')), 'Status_Name'],
  riskStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('Project Risk')), 'Status_Name'],
  departments: [seed.seedDepartments, 'Name'],
  taskListTemplates: [seed.seedTaskListTemplates, 'Task_Name'],
  warehouses: [seed.seedWarehouses, 'Warehouse_Name'],
  vendors: [seed.seedVendors, 'Vendor_Name'],
  taxes: [seed.seedTaxes, 'Tax_Name'],
}
const options = (key: string): Option[] => {
  if (!OPTION_ROWS[key]) throw new Error(`Unknown action: ${key}`)
  const [rows, label] = OPTION_ROWS[key]
  return rows.map((r) => ({ id: String(r.ID), label: str(r[label]), ...(key === 'vendors' ? { email: str(r.Email), phone: str(r.Phone_Number) } : {}) }))
}
const lookupId = (v: unknown) => (v && typeof v === 'object' && 'ID' in (v as object) ? String((v as { ID: unknown }).ID) : '')
const statusName = (id: string) => str(seed.seedStatuses.find((s) => s.ID === id)?.Status_Name)
const statusRef = (id: string) => (id ? { ID: id, display_value: str(seed.seedStatuses.find((s) => s.ID === id)?.Status_Name) } : '')

const monthCount = (isoDates: string[]) => isoDates.filter(Boolean).reduce<Record<string, number>>((m, d) => ((m[d.slice(0, 7)] = (m[d.slice(0, 7)] ?? 0) + 1), m), {})
const toCreatorDateMock = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}-${MONTHS3[Number(m) - 1]}-${y}`
}
const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const seedDay = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS3[d.getMonth()]}-${d.getFullYear()}`
/** Activity_Stream demo: one record per changed field, like Widget.activity_add. */
const shown = (v: unknown): string => (Array.isArray(v) ? v.map(shown).filter(Boolean).join(', ') : v && typeof v === 'object' ? str(v) : v === undefined || v === null ? '' : String(v))
const LABELS: Record<string, string> = {
  Task_Start_Date: 'Start date', Task_End_Date: 'Due date', Task_Status: 'Status', Precent_Complete: 'Completion %', Owners: 'Owners', Task_Name: 'Task name', Parent_Task: 'Parent task',
  Starts_after: 'Starts after', Starts_After_In: 'Starts after in', Duration: 'Duration', Owner: 'Owner', Flag: 'Flag', Status: 'Status', Task_List: 'Task list',
  PO_Date: 'PO date', ETA: 'ETA', Vendors: 'Vendor', Project_Status: 'Status', Start_Date: 'Start date', Project_Completion_Date: 'Completion date',
}

export interface MockSourceOptions {
  latencyMs?: number
  persist?: boolean
  /** Demo user may edit (Widget.project_details can_edit) */
  canEdit?: boolean
  isAdmin?: boolean
}

export function createMockSource({ latencyMs = 150, persist = true, canEdit = true, isAdmin = false }: MockSourceOptions = {}): DataSource & {
  reset(): void
  /** Reads per method — lets tests check lazy, non-duplicated loading. */
  calls: Record<string, number>
} {
  let db = loadDb(persist)
  const calls: Record<string, number> = {}
  const save = () => {
    if (!persist) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    } catch {
      /* ignore */
    }
  }
  const delay = <T,>(name: string, value: () => T): Promise<T> => {
    calls[name] = (calls[name] ?? 0) + 1
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(structuredClone(value()))
        } catch (e) {
          reject(e)
        }
      }, latencyMs),
    )
  }
  const findProject = (id: string) => {
    const p = db.projects.find((x) => String(x.ID) === id)
    if (!p) throw new NotFoundError('Project not found')
    return p
  }
  const byKey = (rows: CreatorRecord[], key: ProjectKey, projectField: string, estimateField: string, referenceField?: string) =>
    rows.filter(
      (r) =>
        lookupId(r[projectField]) === key.id ||
        (!!key.estimateId && lookupId(r[estimateField]) === key.estimateId) ||
        (!!referenceField && !!key.reference && r[referenceField] === key.reference),
    )
  /** Logs the fields of `rec` named in `data` that change, then applies `apply` (Widget.activity_add). */
  const logged = (projectId: string, module: string, rec: CreatorRecord, name: () => string, data: Record<string, unknown>, apply: () => void) => {
    const keys = Object.keys(data)
    const before = Object.fromEntries(keys.map((k) => [k, shown(rec[k])]))
    apply()
    const now = new Date()
    const stamp = `${seedDay(now)} ${now.toTimeString().slice(0, 8)}`
    for (const k of keys) {
      const after = shown(rec[k])
      if (after === before[k]) continue
      db.activity.unshift({ ID: `A${Date.now()}${db.activity.length}`, Project: { ID: projectId, display_value: '' }, Module: module, Record_ID: String(rec.ID), Record_Name: name(), Action: 'updated', Field_Name: LABELS[k] ?? k.replace(/_/g, ' '), Old_Value: before[k], New_Value: after, Changed_By: 'Demo User', Changed_On: stamp })
    }
  }
  const teamIds = (p: CreatorRecord) => ((p.Pro as CreatorRecord[] | undefined) ?? []).map((r) => lookupId(r.Team_Member))
  const linesOf = (p: CreatorRecord) => byKey(db.costingLines, { id: String(p.ID), estimateId: lookupId(p.Accepted_Estimate) }, FIELDS.costingLine.project, FIELDS.costingLine.estimate)

  /** Edit-form values (IDs, address objects) back into Creator's read shape. */
  const toStored = (name: string, value: unknown): unknown => {
    const field = PROJECT_FORM.flatMap((s) => s.columns.flat()).find((f) => f.name === name)
    if (!field) return value
    const label = (id: string) => options(field.source!.key).find((o) => o.id === id)?.label ?? id
    if (field.kind === 'lookup') return value ? { ID: String(value), display_value: label(String(value)) } : ''
    if (field.kind === 'multilookup') return (value as string[]).map((id) => ({ ID: id, display_value: label(id) }))
    if (field.kind === 'address') {
      const a = value as Record<string, string>
      return { ...a, display_value: ADDRESS_PARTS.map((p) => a[p.key]).filter(Boolean).join(', ') }
    }
    return value
  }

  return {
    kind: 'mock',
    calls,
    reset() {
      db = freshDb()
      save()
    },
    getContext: () => Promise.resolve({ environment: 'demo data' }),
    async getPageParams() {
      return Object.fromEntries([...new URLSearchParams(window.location.search).entries()].filter(([, v]) => v))
    },
    navigate(hash) {
      // Outside Creator: "#Page:Project_Widget?project_id=1" → ?project_id=1 (same for Procurement_Schedule) ; "#Page:Home" → no parameters.
      const [page, query = ''] = hash.replace(/^#Page:/, '').split('?')
      const url = page === PAGES.project || page === PAGES.procurement ? `?${query}` : page === PAGES.home ? window.location.pathname : null
      if (url === null) return console.info('[demo] would open', hash)
      window.history.pushState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    getDashboard: () =>
      delay('getDashboard', () => {
        const today = localToday()
        return toDashboard({
          records: db.projects.map((p) => {
            const all = db.tasks.filter((t) => lookupId(t.Project_Name) === String(p.ID)).map(toTask)
            const work = all.filter((t) => !isTaskList(t))
            const lines = linesOf(p).map(toCostingLine)
            const plan = db.planMilestones.filter((m) => lookupId(m.Project) === String(p.ID)).map(toPlanMilestone)
            const ms = buildMilestones(plan, all, fromCreatorDate(p.Start_Date), today)
            const risks = db.risks.filter((r) => lookupId(r.Project_Name) === String(p.ID)).map(toRisk)
            // Same counts as Widget.project_dashboard
            return {
              ...p,
              tasks_total: work.length,
              tasks_done: work.filter(isDone).length,
              tasks_overdue: work.filter((t) => !isDone(t) && !!t.endDate && t.endDate < today).length,
              tasks_in_progress: work.filter((t) => !isDone(t) && t.percent > 0).length,
              milestones_total: ms.length,
              milestones_done: ms.filter((m) => /complete|closed/i.test(m.milestone.status?.label ?? '')).length,
              milestones_delayed: ms.filter((m) => !/complete|closed/i.test(m.milestone.status?.label ?? '') && !!m.end && m.end < today).length,
              risks_open: risks.filter((r) => !isComplete(r)).length,
              risks_critical: risks.filter((r) => !isComplete(r) && severityOf(r) === 'Critical').length,
              lines_total: lines.length,
              lines_delivered: lines.filter(lineDelivered).length,
            }
          }),
          stage_order: seed.seedStatusOrder.project,
          tasks_due_by_month: monthCount(db.tasks.filter((t) => lookupId(t.Parent_Task)).map((t) => fromCreatorDate(t.Task_End_Date))),
          tasks_done_by_month: monthCount(db.tasks.filter((t) => lookupId(t.Parent_Task)).map((t) => fromCreatorDate(t.Actual_Complete_Date))),
          estimates: seed.seedEstimates.map((e) => ({ ...e, project_id: str(db.projects.find((p) => lookupId(p.Accepted_Estimate) === e.ID)?.ID) })),
          user: 'Demo User',
          users_total: seed.seedUsers.length,
          users_active: seed.seedUsers.filter((u) => u.Status === 'Active').length,
          users_assigned: new Set(db.projects.flatMap(teamIds)).size,
          team_assignments: db.projects.flatMap(teamIds).length,
        })
      }),
    listProjects: () => delay('listProjects', () => db.projects.map(toProject)),
    getProject: (id) => delay('getProject', () => toProject(findProject(id))),
    getProjectRecord: (id) => delay('getProjectRecord', () => findProject(id)),
    getProjectDetails: (id) =>
      delay('getProjectDetails', () => {
        const p = findProject(id)
        const cust = seed.seedCustomers.find((c) => c.ID === lookupId(p.Client_Name))
        const billing = (cust?.Billing_Address2 ?? {}) as Record<string, string>
        return toDetails({
          customer: cust ? { ...cust, Address: [billing.address_line_1, billing.district_city].filter(Boolean).join(', ') } : {},
          contacts: seed.seedContacts.filter((c) => lookupId(c.Customers) === lookupId(p.Client_Name)),
          owner: seed.seedUsers.find((u) => u.ID === lookupId(p.Project_Manager)) ?? {},
          team: ((p.Pro as CreatorRecord[] | undefined) ?? []).map((r) => ({ ...seed.seedUsers.find((x) => x.ID === lookupId(r.Team_Member)), Project_Role: str(r.Project_Role) })),
          stages: [
            ...seed.seedStatusOrder.project.map((n) => ({ ID: str(seed.seedStatuses.find((x) => x.Status_Name === n && (x.Modules as string[]).includes('Project'))?.ID), Status_Name: n, anytime: false })),
            ...seed.seedStatusOrder.anytime.map((n) => ({ ID: str(seed.seedStatuses.find((x) => x.Status_Name === n)?.ID), Status_Name: n, anytime: true })),
          ],
          task_order: seed.seedStatusOrder.task,
          boq_order: seed.seedStatusOrder.boq,
          can_edit: canEdit,
          is_admin: isAdmin,
          edit_reason: canEdit ? '' : 'Read only: you are not this project\'s Project Manager or on its Project Team.',
          user: 'Demo User',
        })
      }),
    updateProject(id, data, reason) {
      return delay('updateProject', () => {
        const p = findProject(id)
        let newStatus = ''
        if ('Project_Status' in data) {
          // Same rules as Widget.project_update (static order of Widget.status_order)
          newStatus = statusName(String(data.Project_Status))
          const stages = seed.seedStatusOrder.project
          const to = stages.indexOf(newStatus)
          const from = stages.indexOf(str(p.Project_Status))
          if (!newStatus || (to < 0 && !seed.seedStatusOrder.anytime.includes(newStatus))) throw new Error('The selected status is not a project stage')
          if (to >= 0 && from >= 0 && to > from + 1 && !isAdmin) throw new Error('Stages cannot be skipped — move to the next stage')
          if (to >= 0 && from >= 0 && to < from && !reason?.trim()) throw new Error('A reason is required to move the project back')
        }
        const start = 'Start_Date' in data ? String(data.Start_Date) : str(p.Start_Date)
        const end = 'Project_Completion_Date' in data ? String(data.Project_Completion_Date) : str(p.Project_Completion_Date)
        if (start && end && fromCreatorDate(end) < fromCreatorDate(start)) throw new Error('Project Completion Date must be on or after the Start Date')
        logged(id, 'Project', p, () => str(p.Project_Reference), data, () => {
          for (const [k, v] of Object.entries(data)) p[k] = k === 'Project_Status' ? statusRef(String(v)) : toStored(k, v)
        })
        if (newStatus) {
          const d = new Date()
          const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const stamp = `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()} ${d.toTimeString().slice(0, 8)}`
          const line = `${stamp} | ${newStatus} | Demo User | ${(reason ?? '').replace(/[\r\n|]/g, ' ').trim()}`
          p.Status_History = str(p.Status_History) ? `${str(p.Status_History)}\n${line}` : line
        }
        save()
      })
    },
    listCostingLines: (key) => delay('listCostingLines', () => byKey(db.costingLines, key, FIELDS.costingLine.project, FIELDS.costingLine.estimate).map(toCostingLine)),
    listBoq: (key) => delay('listBoq', () => byKey(db.boq, key, FIELDS.boq.project, FIELDS.boq.acceptedEstimate, FIELDS.boq.reference).map(toBoqLine)),
    listPurchaseOrders: (poNumbers) => delay('listPurchaseOrders', () => db.purchaseOrders.filter((r) => poNumbers.includes(str(r.PO_No))).map(toPurchaseOrder)),
    listPoLines: (ids) => delay('listPoLines', () => db.poLines.filter((r) => ids.includes(lookupId(r.Purchase_Order))).map(toPoLine)),
    listPaymentMilestones: (key) => delay('listPaymentMilestones', () => byKey(db.milestones, key, FIELDS.paymentMilestone.project, FIELDS.paymentMilestone.estimate).map(toMilestone)),
    listTasks: (projectId) => delay('listTasks', () => db.tasks.filter((t) => lookupId(t.Project_Name) === projectId).map(toTask)),
    listRisks: (projectId) => delay('listRisks', () => db.risks.filter((r) => lookupId(r.Project_Name) === projectId).map(toRisk)),
    listPlanMilestones: (projectId) => delay('listPlanMilestones', () => db.planMilestones.filter((r) => lookupId(r.Project) === projectId).map(toPlanMilestone)),
    saveRisk(projectId, riskId, data) {
      return delay('saveRisk', () => {
        const p = findProject(projectId)
        let r = riskId ? db.risks.find((x) => x.ID === riskId && lookupId(x.Project_Name) === projectId) : undefined
        if (riskId && !r) throw new NotFoundError('Risk not found in this project')
        // Same rules as Widget.project_risk_save
        const probability = 'Probability' in data ? str(data.Probability) : str(r?.Probability)
        const impact = 'Impact' in data ? str(data.Impact) : str(r?.Impact)
        const errors: string[] = []
        if (!riskScore(probability, 'Negligible')) errors.push('Select a Probability')
        if (!riskScore('Very Low', impact)) errors.push('Select an Impact')
        const statusId = str(data.Risk_Status)
        if (statusId && !(seed.seedStatuses.find((s) => s.ID === statusId)?.Modules as string[] | undefined)?.includes('Project Risk')) errors.push('Risk Status is not a Project Risk status')
        if (errors.length) throw new Error(errors.join('. '))
        if (!r) {
          const next = Math.max(0, ...db.risks.filter((x) => lookupId(x.Project_Name) === projectId).map((x) => Number(/^R - (\d+)$/.exec(str(x.Risk_ID))?.[1] ?? 0))) + 1
          r = { ID: String(5000 + db.risks.length + 1 + Math.floor(Math.random() * 1000)), Project_Name: { ID: projectId, display_value: str(p.Project_Reference) }, Risk_ID: `R - ${next}` }
          db.risks.push(r)
        }
        const lookup = (rows: CreatorRecord[], id: string, label: string) => (id ? { ID: id, display_value: str(rows.find((x) => x.ID === id)?.[label]) } : '')
        for (const [k, v] of Object.entries(data)) {
          if (k === 'Risk_Status') r[k] = statusRef(str(v))
          else if (k === 'Risk_Owner') r[k] = lookup(seed.seedUsers, str(v), 'Name')
          else if (k === 'Department') r[k] = lookup(seed.seedDepartments, str(v), 'Name')
          else if (k === 'Risk_ID') r[k] = str(v).trim() || r[k]
          else r[k] = v
        }
        r.Probability = probability
        r.Impact = impact
        r.Risk_Score = String(riskScore(probability, impact))
        r.Risk_Severity = riskSeverity(probability, impact)
        save()
        return { id: String(r.ID) }
      })
    },
    updateMilestone(projectId, milestoneId, data) {
      return delay('updateMilestone', () => {
        findProject(projectId)
        const m = db.planMilestones.find((x) => x.ID === milestoneId && lookupId(x.Project) === projectId)
        if (!m) throw new NotFoundError('Milestone not found in this project')
        // Same rules as Widget.project_task_update (milestone_id)
        for (const k of ['Starts_after', 'Duration']) if (k in data && str(data[k]) !== '' && !/^\d+$/.test(str(data[k]))) throw new Error(`${LABELS[k]} must be a whole number`)
        if ('Starts_After_In' in data && str(data.Starts_After_In) && !['Days', 'Weeks', 'Months'].includes(str(data.Starts_After_In))) throw new Error('Starts after in must be Days, Weeks or Months')
        logged(projectId, 'Milestone', m, () => str(m.Milestone_Name), data, () => {
          for (const [k, v] of Object.entries(data)) {
            if (k === 'Status') m[k] = statusRef(str(v))
            else if (k === 'Owner') m[k] = v ? { ID: str(v), display_value: str(seed.seedUsers.find((u) => u.ID === v)?.Name) } : ''
            else if (k === 'Task_List') {
              const t = seed.seedTaskListTemplates.find((x) => x.ID === v)
              if (v && !t) throw new Error('Task list not found in the Task Administrator template')
              m[k] = t ? { ID: str(v), display_value: str(t.Task_Name) } : ''
            }
            else m[k] = v
          }
        })
        save()
      })
    },
    listActivity: (projectId, recordId) =>
      delay('listActivity', () => db.activity.filter((a) => lookupId(a.Project) === projectId && (!recordId || a.Record_ID === recordId)).map(toActivity)),
    updateBoq(projectId, boqId, data) {
      return delay('updateBoq', () => {
        const p = findProject(projectId)
        const b = db.boq.find((x) => x.ID === boqId)
        const inProject = !!b && (lookupId(b.Project) === projectId || lookupId(b.Estimate1) === lookupId(p.Accepted_Estimate) || (!!str(p.Project_Reference) && b.Project_Reference === p.Project_Reference))
        if (!b || !inProject) throw new NotFoundError('BOQ line not found in this project')
        const po = 'PO_Date' in data ? String(data.PO_Date) : str(b.PO_Date)
        const eta = 'ETA' in data ? String(data.ETA) : str(b.ETA)
        if (po && eta && fromCreatorDate(eta) < fromCreatorDate(po)) throw new Error('ETA must be on or after the PO date')
        logged(projectId, 'BOQ', b, () => str(b.Model) || str(b.Description), data, () => {
          for (const [k, v] of Object.entries(data))
            b[k] = k === 'Status' ? statusRef(String(v)) : k === 'Vendors' ? (v ? { ID: String(v), display_value: str(seed.seedVendors.find((x) => x.ID === v)?.Vendor_Name) } : '') : v
        })
        save()
      })
    },
    updateTask(projectId, taskId, data) {
      return delay('updateTask', () => {
        const p = findProject(projectId)
        const t = db.tasks.find((x) => x.ID === taskId && lookupId(x.Project_Name) === projectId)
        if (!t) throw new NotFoundError('Task not found in this project')
        const start = 'Task_Start_Date' in data ? String(data.Task_Start_Date) : str(t.Task_Start_Date)
        const end = 'Task_End_Date' in data ? String(data.Task_End_Date) : str(t.Task_End_Date)
        if (start && end && fromCreatorDate(end) < fromCreatorDate(start)) throw new Error('Due date must be on or after the start date')
        if ('Owners' in data && (data.Owners as string[]).some((o) => !teamIds(p).includes(o))) throw new Error('Assignees must be members of the project team')
        logged(projectId, 'Task', t, () => str(t.Task_Name), data, () => {
          for (const [k, v] of Object.entries(data)) {
            if (k === 'Task_Status') t[k] = statusRef(String(v))
            else if (k === 'Parent_Task') t[k] = v ? { ID: String(v), display_value: str(db.tasks.find((x) => x.ID === v)?.Task_Name) } : ''
            else if (k === 'Owners') t[k] = (v as string[]).map((uid) => ({ ID: uid, display_value: str(seed.seedUsers.find((u) => u.ID === uid)?.Name) }))
            else t[k] = v
          }
        })
        save()
      })
    },
    updateAssetLine(projectId, lineId, data) {
      return delay('updateAssetLine', () => {
        const line = linesOf(findProject(projectId)).find((l) => l.ID === lineId)
        if (!line) throw new NotFoundError('Asset line not found in this project')
        // Same as Widget.project_task_update (line_id): Project Execution + Asset & Network fields only
        logged(projectId, 'Asset', line, () => str(line.Model) || str(line.Item_Description), data, () => {
          for (const [k, v] of Object.entries(data)) line[k] = k === 'Installation_Status' || k === 'Delivery_Status' ? statusRef(String(v)) : k === 'Networked' ? v === true || v === 'true' : v
        })
        save()
      })
    },
    createPurchaseOrder(input) {
      return delay('createPurchaseOrder', () => {
        const p = findProject(input.projectId)
        const errors: string[] = []
        if (!input.vendorId) errors.push('Select a vendor')
        if (!input.countryId) errors.push('Select a country')
        if (!input.lines.length) errors.push('Add at least one BOQ line')
        for (const l of input.lines) {
          const b = db.boq.find((x) => x.ID === l.boqId)
          if (!b) continue
          const ordered = db.poLines
            .filter((pl) => lookupId(pl.Item_Name) === l.productId && (((db.purchaseOrders.find((o) => o.ID === lookupId(pl.Purchase_Order))?.BOQ as string[]) ?? []).includes(l.boqId)))
            .reduce((s, pl) => s + Number(pl.Quantity), 0)
          if (l.quantity <= 0) errors.push(`${str(b.Description)}: quantity must be above 0`)
          else if (ordered + l.quantity > Number(b.Quantity)) errors.push(`${str(b.Description)}: ordered ${ordered} + ${l.quantity} exceeds BOQ quantity ${b.Quantity}`)
        }
        if (errors.length) throw new Error(errors.join('; '))
        // Same numbering as the Purchase_Order workflow: PO-00001, PO-00002, …
        const last = db.purchaseOrders.map((o) => Number(/^PO-(\d+)$/.exec(str(o.PO_No))?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0)
        const poNo = `PO-${String(last + 1).padStart(5, '0')}`
        const id = String(Date.now())
        const sub = input.lines.reduce((s, l) => s + l.quantity * l.rate, 0)
        db.purchaseOrders.push({
          ID: id,
          PO_No: poNo,
          Vendor_Name: { ID: input.vendorId, display_value: options('vendors').find((v) => v.id === input.vendorId)?.label },
          Date_field: input.date,
          Delivery_Date: input.deliveryDate,
          Reference: input.reference || str(p.Project_Reference),
          BOQ: [...new Set(input.lines.map((l) => l.boqId))],
          Issued_By: 'Demo User',
          Warehouse: input.warehouseId ? { ID: input.warehouseId, display_value: str(seed.seedWarehouses.find((w) => w.ID === input.warehouseId)?.Warehouse_Name) } : '',
          Terms_Conditions: input.termsDays ? `Payment terms: ${input.termsDays} days` : '',
          Sub_Total: String(sub),
          Discount: String(input.discount),
          Total_Cost: String(sub - (sub * input.discount) / 100),
          Books_Synced: false,
        })
        input.lines.forEach((l, i) =>
          db.poLines.push({
            ID: `${id}${i}`,
            Purchase_Order: { ID: id, display_value: poNo },
            Item_Name: { ID: l.productId, display_value: l.description },
            Item_Description: l.description,
            Quantity: String(l.quantity),
            Rate: String(l.rate),
            Amount: String(l.quantity * l.rate),
            Quantity_Received: '0',
            Quantity_to_be_Received: String(l.quantity),
          }),
        )
        for (const l of input.lines) {
          const b = db.boq.find((x) => x.ID === l.boqId)
          if (!b) continue
          // Same write-back as Widget.project_create_po: PO#, PO date (first PO) and the "Ordered" status
          if (!str(b.PO)) b.PO_Date = input.date ? toCreatorDateMock(input.date) : b.PO_Date
          b.PO = str(b.PO) ? `${str(b.PO)}, ${poNo}` : poNo
          const ordered = seed.seedStatuses.find((x) => (x.Modules as string[]).includes('BOQ') && /^ordered/i.test(str(x.Status_Name).trim()))
          if (ordered) b.Status = statusRef(String(ordered.ID))
        }
        save()
        return { id, poNo, booksSynced: false, booksMessage: 'Demo data — nothing is sent to Zoho Books.' }
      })
    },
    listOptions: (source: LookupSource) => delay(`listOptions:${source.key}`, () => options(source.key).sort((a, b) => a.label.localeCompare(b.label))),
  }
}
