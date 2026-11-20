// Demo data source for running outside Creator. Holds Creator-shaped records (seed.ts), reuses the Zoho mappers and
// applies the same rules as the Deluge functions, so every screen behaves the same on demo and live data.
import { ADDRESS_PARTS, LOOKUPS, PROJECT_FORM, type LookupSource } from '@/config/projectForm'
import { DIVISIONS, FIELDS, PAGES } from '@/config/zoho'
import { KICKOFF_STAGE, kickoffMissing } from '@/features/project/kickoff'
import type { CreatorRecord, Option, ProjectKey, TeamRowInput } from '@/types/domain'
import { buildMilestones, isDone, isTaskList, lineDelivered, localToday } from '@/features/project/model'
import { isComplete, riskScore, riskSeverity, severityOf } from '@/features/risk/calc'
import type { DataSource } from './types'
import * as seed from './seed'
import {
  NotFoundError,
  fromCreatorDate,
  str,
  toActivity,
  toBoqLine,
  toCostingLine,
  toDashboard,
  toDeliveryNote,
  toDetails,
  toGoodsReceipt,
  toMilestone,
  toBudgetReview,
  toContact,
  toAttendee,
  toOutsourced,
  toPlanMilestone,
  toPoLine,
  toProject,
  toPurchaseOrder,
  toRisk,
  toTask,
} from './zohoSource'

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
  goodsReceipts: CreatorRecord[]
  deliveryNotes: CreatorRecord[]
  /** Payment_Made rows (vendor payments against POs) */
  payments: CreatorRecord[]
  /** Task_Note / Task_File rows (task comments and files) */
  taskNotes?: CreatorRecord[]
  /** CRM Deal → new Estimate ID (Deals.Quote_ID) */
  dealQuotes?: Record<string, string>
  taskFiles?: CreatorRecord[]
  /** GRN serial numbers already received (unique across receipts) */
  serials: string[]
  /** Contact_Persons of projects (Client Side Contact List) */
  contacts?: CreatorRecord[]
  /** Estimate_Summary rows (Project_Budget_Review) */
  budgetReview?: CreatorRecord[]
  /** Meeting_Attendee rows */
  attendees?: CreatorRecord[]
  /** Project_Contact rows (outsourced services & software) */
  outsourced?: CreatorRecord[]
}

/** Demo client contacts and budget review of project 1001 (as the Project Registration Form sample) */
const demoContacts = (): CreatorRecord[] =>
  [
    ['Samia', 'Aqeel', 'samia.aqeel@client.example', '0556007598', 'Branch Manager'],
    ['Ahmed', 'Alaleeli', 'ahmed.alaleeli@client.example', '0508032284', 'IT Lead'],
  ].map(([First_Name, Last_Name, Email, Mobile, Designation], i) => ({ ID: `c${i + 1}`, Project: { ID: '1001', display_value: 'PR_26040' }, First_Name, Last_Name, Email, Mobile, Designation }))
const demoOutsourced = (): CreatorRecord[] => [
  {
    ID: 'oc1',
    Project: { ID: '1001', display_value: 'PR_26040' },
    First_Name: 'Imran',
    Last_Name: 'Shaikh',
    Contact_Type: 'Outsourced Service',
    Company: 'Gulf Cabling LLC',
    Email: 'imran@gulfcabling.example',
    Phone_Number: '+971501234567',
    Scope_of_Work: 'Cabling and containment',
    Sub_Contract_Value_Agreed: 10998,
  },
]
const demoBudgetReview = (): CreatorRecord[] =>
  [
    ['Hardware', 164633, 201000],
    ['Software', 4113, 5200],
    ['Outsourced Services', 10998, 14500],
    ['2point0 Services', 19977, 31000],
    ['Logistics', 15845, 18300],
  ].map(([Description, Total_Cost, Total_price], i) => ({
    ID: `bs${i + 1}`,
    Project: { ID: '1001', display_value: 'PR_26040' },
    Description,
    Total_Cost,
    Total_price,
    PROFIT: Number(Total_price) - Number(Total_Cost),
    MARGIN: Math.round(((Number(Total_price) - Number(Total_Cost)) / Number(Total_price)) * 1000) / 10,
    Cost: Math.round((Number(Total_Cost) / 215566) * 1000) / 10,
  }))

// v4: Project pipeline statuses, tasks and team (DS 8).
// v7: goods receipts, delivery notes, PO line BOQ / delivery fields (DS 11).
// v8: received serial numbers, bay position (DS 12).
const STORAGE_KEY = '2point0-pm:mockdb:v9'
/** Demo uploads (kept in memory only — gone after a reload) */
const demoFiles = new Map<string, Blob>()

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
    goodsReceipts: seed.seedGoodsReceipts,
    deliveryNotes: seed.seedDeliveryNotes,
    payments: seed.seedPayments,
    serials: [] as string[],
  })

function loadDb(persist: boolean): MockDb {
  if (!persist) return freshDb()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MockDb>
      return { ...(saved as MockDb), payments: saved.payments ?? structuredClone(seed.seedPayments) }
    }
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
  projectRoles: [seed.seedRoles, 'Role'],
  warehouses: [seed.seedWarehouses, 'Warehouse_Name'],
  racks: [seed.seedRacks, 'Rack_Code'],
  segments: [seed.seedSegments, 'Segment_Code'],
  dnStatuses: [seed.seedStatuses.filter((s) => (s.Modules as string[]).includes('Delivery Note')), 'Status_Name'],
  vendors: [seed.seedVendors, 'Vendor_Name'],
  taxes: [seed.seedTaxes, 'Tax_Name'],
}
const options = (key: string): Option[] => {
  if (!OPTION_ROWS[key]) throw new Error(`Unknown action: ${key}`)
  const [rows, label] = OPTION_ROWS[key]
  return rows.map((r) => ({
    id: String(r.ID),
    label: str(r[label]),
    ...(key === 'vendors' ? { email: str(r.Email), phone: str(r.Phone_Number), division: str(r.Division) } : {}),
    ...(key === 'warehouses' ? { active: r.Active === true } : {}),
    ...(key === 'taskList' ? { active: r.Status !== 'Inactive' } : {}),
    ...(key === 'racks' ? { parent: lookupId(r.Warehouse) } : {}),
    ...(key === 'segments'
      ? {
          parent: lookupId(r.Rack),
          free: Number(r.Capacity ?? 0) - Number(r.Occupied_Qty ?? 0),
          capacity: Number(r.Capacity ?? 0),
          bay: str(r.Bay_Letter),
          level: str(r.Level),
          side: str(r.Side),
          pallet: str(r.Segment_Code),
          path: str(r.Location_Path),
          label: [str(r.Location_Path), str(r.Segment_Code)].filter(Boolean).join(' · '),
        }
      : {}),
    ...(key === 'dnStatuses' ? { index: Number(r.Index_field), order: Number(r.Order ?? 0) } : {}),
  }))
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
  Task_Start_Date: 'Start date',
  Task_End_Date: 'Due date',
  Task_Status: 'Status',
  Precent_Complete: 'Completion %',
  Owners: 'Owners',
  Task_Name: 'Task name',
  Parent_Task: 'Parent task',
  Starts_after: 'Starts after',
  Starts_After_In: 'Starts after in',
  Duration: 'Duration',
  Owner: 'Owner',
  Flag: 'Flag',
  Status: 'Status',
  Milestone: 'Milestone',
  Pro: 'Project team',
  PO_Date: 'PO date',
  ETA: 'ETA',
  Vendors: 'Vendor',
  Project_Status: 'Status',
  Start_Date: 'Start date',
  Project_Completion_Date: 'Completion date',
}

/** Project record as Widget.project_console returns it: linked rows as <grid>_Count */
const withRowCounts = (p: CreatorRecord): CreatorRecord => ({
  ...p,
  ...Object.fromEntries(
    ['Meeting_Attendees', 'Pro', 'Projects_contacts', 'Payment_Terms_Agreed'].map((g) => [`${g}_Count`, Array.isArray(p[g]) ? (p[g] as unknown[]).length : Number(p[`${g}_Count`] ?? 0)]),
  ),
})

/** Same as Widget.deal_estimate: every value the dropdown shows — name, PR #, account, stage, and the amount for a number */
const matchesDeal = (d: CreatorRecord, q: string) => {
  const amount = /^(aed|sar|usd|bhd|omr|qar|kwd)?[\d.,\s]+$/i.test(q) ? q.replace(/[^\d.]/g, '') : ''
  return [d.Deal_Name, d.Project_Reference, d.Account, d.Stage].some((v) => str(v).toLowerCase().includes(q)) || (!!amount && Number(amount) === Number(d.Amount))
}

export interface MockSourceOptions {
  latencyMs?: number
  persist?: boolean
  /** Demo user may edit (Widget.project_details can_edit) */
  canEdit?: boolean
  isAdmin?: boolean
}

/** As Widget.status_order: Status records of the Project module with an Order above 0, by Order — no names in code. */
function projectStages(): string[] {
  return seed.seedStatuses
    .filter((x) => (x.Modules as string[]).includes('Project') && Number(x.Order) > 0)
    .sort((a, b) => Number(a.Order) - Number(b.Order))
    .map((x) => str(x.Status_Name))
}
/** As Widget.status_order: Project statuses without an Order (can be set at any time — On Hold, Cancelled …), by Index. */
function anytimeStatuses(): string[] {
  return seed.seedStatuses
    .filter((x) => (x.Modules as string[]).includes('Project') && !(Number(x.Order) > 0))
    .sort((a, b) => Number(a.Index_field) - Number(b.Index_field))
    .map((x) => str(x.Status_Name))
}

export function createMockSource({ latencyMs = 150, persist = true, canEdit = true, isAdmin = false }: MockSourceOptions = {}): DataSource & {
  reset(): void
  /** Reads per method — lets tests check lazy, non-duplicated loading. */
  calls: Record<string, number>
} {
  let db = loadDb(persist)
  const READ_ONLY = 'Read only: you cannot edit this project.'
  const calls: Record<string, number> = {}
  const save = () => {
    if (!persist) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    } catch {
      /* ignore */
    }
  }
  const delay = <T>(name: string, value: () => T): Promise<T> => {
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
        lookupId(r[projectField]) === key.id || (!!key.estimateId && lookupId(r[estimateField]) === key.estimateId) || (!!referenceField && !!key.reference && r[referenceField] === key.reference),
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
      db.activity.unshift({
        ID: `A${Date.now()}${db.activity.length}`,
        Project: { ID: projectId, display_value: '' },
        Module: module,
        Record_ID: String(rec.ID),
        Record_Name: name(),
        Action: 'updated',
        Field_Name: LABELS[k] ?? k.replace(/_/g, ' '),
        Old_Value: before[k],
        New_Value: after,
        Changed_By: 'Demo User',
        Changed_On: stamp,
      })
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
      return {
        ...a,
        display_value: ADDRESS_PARTS.map((p) => a[p.key])
          .filter(Boolean)
          .join(', '),
      }
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
              // Timeline events, as Widget.project_dashboard
              events: [
                ...ms.map((m) => ({
                  type: 'milestone',
                  name: m.milestone.name,
                  no: m.milestone.no,
                  by: m.milestone.owner?.label ?? '',
                  status: m.milestone.status?.label ?? '',
                  done: /complete|closed/i.test(m.milestone.status?.label ?? ''),
                  start: m.start ? toCreatorDateMock(m.start) : '',
                  date: m.end ? toCreatorDateMock(m.end) : '',
                })),
                ...work
                  .filter((t) => t.actualEnd)
                  .map((t) => ({ type: 'task', name: t.name, date: toCreatorDateMock(t.actualEnd), by: t.owners.map((o) => o.label).join(', '), status: t.status?.label ?? '' })),
                ...db.purchaseOrders
                  .filter((o) => lookupId(o.Project_reference) === String(p.ID))
                  .map((o) => ({
                    type: 'po',
                    name: str(o.PO_No),
                    date: str(o.Date_field),
                    by: str(o.Issued_By),
                    vendor: str(o.Vendor_Name),
                    total: Number(o.Total_Cost ?? 0),
                    status: str(o.PO_Status),
                  })),
                ...db.deliveryNotes
                  .filter((d) => lookupId(d.Project) === String(p.ID))
                  .map((d) => ({ type: 'dn', name: str(d.DN_No), date: str(d.Delivered_Date) || str(d.DN_Date), by: str(d.Received_By), total: Number(d.Total ?? 0), status: str(d.Status) })),
              ],
            }
          }),
          stage_order: projectStages(),
          anytime_order: anytimeStatuses(),
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
    getProjectRecord: (id) => delay('getProjectRecord', () => withRowCounts(findProject(id))),
    getProjectDetails: (id) =>
      delay('getProjectDetails', () => {
        const p = findProject(id)
        const cust = seed.seedCustomers.find((c) => c.ID === lookupId(p.Client_Name))
        const billing = (cust?.Billing_Address2 ?? {}) as Record<string, string>
        return toDetails({
          customer: cust ? { ...cust, Address: [billing.address_line_1, billing.district_city].filter(Boolean).join(', ') } : {},
          contacts: seed.seedContacts.filter((c) => lookupId(c.Customers) === lookupId(p.Client_Name)),
          owner: seed.seedUsers.find((u) => u.ID === lookupId(p.Project_Manager)) ?? {},
          team: ((p.Pro as CreatorRecord[] | undefined) ?? []).map((r) => ({
            ...seed.seedUsers.find((x) => x.ID === lookupId(r.Team_Member)),
            Project_Role: str(r.Project_Role),
            Row_ID: r.ID,
            Role_ID: lookupId(r.Project_Role),
          })),
          stages: [
            ...projectStages().map((n) => ({
              ID: str(seed.seedStatuses.find((x) => x.Status_Name === n && (x.Modules as string[]).includes('Project'))?.ID),
              Status_Name: n,
              anytime: false,
            })),
            ...anytimeStatuses().map((n) => ({ ID: str(seed.seedStatuses.find((x) => x.Status_Name === n && (x.Modules as string[]).includes('Project'))?.ID), Status_Name: n, anytime: true })),
          ],
          task_order: seed.seedStatusOrder.task,
          boq_order: seed.seedStatusOrder.boq,
          can_edit: canEdit,
          is_admin: isAdmin,
          edit_reason: canEdit ? '' : READ_ONLY,
          crm_deal_id: str(seed.seedEstimates.find((e) => e.ID === lookupId(p.Accepted_Estimate))?.Deals),
          user: 'Demo User',
        })
      }),
    updateProject(id, data, reason) {
      return delay('updateProject', () => {
        const p = findProject(id)
        let newStatus = ''
        if ('Project_Status' in data) {
          // Same rules as Widget.project_update (Status form Order, via Widget.status_order)
          newStatus = statusName(String(data.Project_Status))
          const stages = projectStages()
          const to = stages.indexOf(newStatus)
          const from = stages.indexOf(str(p.Project_Status))
          if (!newStatus || (to < 0 && !anytimeStatuses().includes(newStatus))) throw new Error('The selected status is not a project stage')
          if (to >= 0 && from >= 0 && to > from + 1 && !isAdmin) throw new Error('Stages cannot be skipped — move to the next stage')
          if (to >= 0 && from >= 0 && to < from && !reason?.trim()) throw new Error('A reason is required to move the project back')
          // Same as Widget.project_update: Kick-Off Done needs the Project Registration form complete
          const kick = stages.indexOf(KICKOFF_STAGE)
          if (kick >= 0 && to >= kick && from < kick && !anytimeStatuses().includes(str(p.Project_Status))) {
            const gaps = kickoffMissing(
              withRowCounts(p),
              {},
              seed.seedTaskList.filter((r) => r.Status !== 'Inactive').map((r) => String(r.ID)),
            )
            if (gaps.length) throw new Error(`Complete the Project Registration form before Kick-Off Done. Missing: ${gaps.map((g) => g.label).join(', ')}`)
          }
        }
        if ('Project_Team' in data) {
          // Same checks as Widget.project_update: the whole team is sent; rows left out are removed
          const rows = data.Project_Team as TeamRowInput[]
          const seen = new Set<string>()
          for (const r of rows) {
            if (!r.member_id) throw new Error('Choose a team member on every row')
            if (seen.has(r.member_id)) throw new Error('A team member is listed twice')
            if (!seed.seedUsers.some((u) => u.ID === r.member_id)) throw new Error('Team member not found')
            if (r.role_id && !seed.seedRoles.some((x) => x.ID === r.role_id)) throw new Error('Project role not found')
            seen.add(r.member_id)
          }
          const old = (p.Pro as CreatorRecord[] | undefined) ?? []
          const name = (list: CreatorRecord[], id: string, field: string) => str(list.find((x) => x.ID === id)?.[field])
          const team = rows.map((r, i) => ({
            ID: old.some((o) => o.ID === r.row_id) ? r.row_id : `T${Date.now()}${i}`,
            Team_Member: { ID: r.member_id, display_value: name(seed.seedUsers, r.member_id, 'Name') },
            Project_Role: r.role_id ? { ID: r.role_id, display_value: name(seed.seedRoles, r.role_id, 'Role') } : '',
            display_value: [name(seed.seedUsers, r.member_id, 'Name'), r.role_id && `(${name(seed.seedRoles, r.role_id, 'Role')})`].filter(Boolean).join(' '),
          }))
          logged(
            id,
            'Project',
            p,
            () => str(p.Project_Reference),
            { Pro: team },
            () => (p.Pro = team),
          )
          data = { ...data }
          delete data.Project_Team
        }
        const start = 'Start_Date' in data ? String(data.Start_Date) : str(p.Start_Date)
        const end = 'Project_Completion_Date' in data ? String(data.Project_Completion_Date) : str(p.Project_Completion_Date)
        if (start && end && fromCreatorDate(end) < fromCreatorDate(start)) throw new Error('Project Completion Date must be on or after the Start Date')
        logged(
          id,
          'Project',
          p,
          () => str(p.Project_Reference),
          data,
          () => {
            for (const [k, v] of Object.entries(data)) p[k] = k === 'Project_Status' ? statusRef(String(v)) : toStored(k, v)
          },
        )
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
    listPurchaseOrders: (projectId, poNumbers) =>
      delay('listPurchaseOrders', () => db.purchaseOrders.filter((r) => lookupId(r.Project_reference) === projectId || poNumbers.includes(str(r.PO_No))).map(toPurchaseOrder)),
    listPoLines: (ids) =>
      delay('listPoLines', () =>
        db.poLines
          .filter((r) => ids.includes(lookupId(r.Purchase_Order)) && r.is_PR !== true)
          // Like Widget.project_console: the storage of each receipt of the line
          .map((r) => ({
            ...r,
            Stock_Locations: db.goodsReceipts.flatMap((g) =>
              ((g.Lines as CreatorRecord[] | undefined) ?? [])
                .filter((x) => x.Parent_Line_ID === r.ID && x.Direct_To_Site !== true)
                .flatMap((x, n) =>
                  (
                    (x.Places as Record<string, unknown>[] | undefined) ?? [
                      { Rack: x.Store_Rack, Segment: x.Store_Segment, Position: x.Position, Position_Note: x.Position_Note, Qty: x.Quantity_Received } as Record<string, unknown>,
                    ]
                  ).map((pl, k) => ({
                    ID: `${str(x.ID)}-${n}-${k}`,
                    Label: [str(x.Store_Warehouse), str(pl.Path) || str(pl.Rack), str(pl.Segment), str(pl.Position), str(pl.Position_Note)].filter(Boolean).join(' · ') || 'Not placed yet',
                    Qty: Number(pl.Qty),
                    PR_No: str(g.PR_No),
                    Warehouse: str(x.Store_Warehouse),
                    Location: [str(pl.Rack), str(pl.Segment), str(pl.Position)].filter(Boolean).join(' · '),
                    Serials: (pl.Serials as string[] | undefined) ?? [],
                    Received: str(g.Receive_Date),
                    Status: str(pl.Segment) ? 'In Stock' : 'Pending Put-away',
                    Rack: str(pl.Rack),
                    Bay: str(pl.Bay),
                    Level: str(pl.Level),
                    Side: str(pl.Side),
                    Pallet: str(pl.Segment),
                  })),
                ),
            ),
          }))
          .map(toPoLine),
      ),
    listDeliveryNotes: (projectId) =>
      delay('listDeliveryNotes', () =>
        db.deliveryNotes
          .filter((r) => lookupId(r.Project) === projectId)
          .map(toDeliveryNote)
          .reverse(),
      ),
    listGoodsReceipts: (ids) =>
      delay('listGoodsReceipts', () =>
        db.goodsReceipts
          .filter((r) => ids.includes(lookupId(r.Purchase_Order)))
          .map(toGoodsReceipt)
          .reverse(),
      ),
    listOpenDeals: (page, search) =>
      delay('listOpenDeals', () => {
        const q = search.trim().toLowerCase()
        const all = seed.seedOpenDeals.filter((d) => !db.dealQuotes?.[str(d.ID)] && (!q || matchesDeal(d, q)))
        const rows = all.slice((page - 1) * 100, page * 100)
        const deal = (d: CreatorRecord) => ({
          id: str(d.ID),
          name: str(d.Deal_Name),
          account: str(d.Account),
          stage: str(d.Stage),
          reference: str(d.Project_Reference),
          amount: Number(d.Amount) || 0,
          closing: str(d.Closing_Date),
        })
        const done = q && page === 1 ? seed.seedOpenDeals.filter((d) => db.dealQuotes?.[str(d.ID)] && matchesDeal(d, q)).slice(0, 10) : []
        return {
          deals: rows.map(deal),
          more: all.length > page * 100,
          existing: done.map((d) => ({ ...deal(d), quoteId: db.dealQuotes![str(d.ID)] })),
        }
      }),
    createDealEstimate: (dealId) =>
      delay('createDealEstimate', () => {
        const deal = seed.seedOpenDeals.find((d) => str(d.ID) === dealId)
        if (!deal) throw new NotFoundError('Deal not found in CRM')
        db.dealQuotes = db.dealQuotes ?? {}
        const existing = db.dealQuotes[dealId]
        if (existing) return { id: existing, existing: true, warning: '' }
        const id = `9${Date.now()}`
        db.dealQuotes[dealId] = id
        save()
        return { id, existing: false, warning: '' }
      }),
    listTaskCollab: (taskId) =>
      delay('listTaskCollab', () => ({
        notes: (db.taskNotes ?? [])
          .filter((n) => n.Task === taskId)
          .map((n) => ({ id: String(n.ID), comment: str(n.Comment), author: str(n.Author), addedTime: str(n.Added_Time), replyTo: str(n.Reply_To) })),
        files: (db.taskFiles ?? []).filter((f) => f.Task === taskId).map((f) => ({ id: String(f.ID), name: str(f.File_Name), path: str(f.File), noteId: str(f.Task_Note) })),
      })),
    addTaskNote({ taskId, comment, replyTo, fileNames, filesOnly }) {
      return delay('addTaskNote', () => {
        // Same rules as Widget.task_collab
        if (!db.tasks.some((t) => t.ID === taskId)) throw new NotFoundError('Task not found')
        if (!filesOnly && !comment.trim() && !fileNames.length) throw new Error('Write a comment or attach a file')
        if (filesOnly && !fileNames.length) throw new Error('Choose at least one file')
        if (fileNames.length > 10) throw new Error('Attach at most 10 files at a time')
        if (replyTo && !(db.taskNotes ?? []).some((n) => n.ID === replyTo && n.Task === taskId)) throw new Error('The comment you reply to no longer exists')
        const stamp = Date.now()
        const id = filesOnly ? '' : `n${stamp}`
        const d = new Date(stamp)
        const time = `${String(d.getDate()).padStart(2, '0')}-${MONTHS3[d.getMonth()]}-${d.getFullYear()} ${d.toTimeString().slice(0, 8)}`
        db.taskNotes = db.taskNotes ?? []
        db.taskFiles = db.taskFiles ?? []
        if (id) db.taskNotes.push({ ID: id, Task: taskId, Reply_To: replyTo, Comment: comment.trim(), Author: 'Demo User', Added_Time: time })
        const fileIds = fileNames.map((n, k) => {
          const fid = `f${stamp}${k}`
          db.taskFiles!.push({ ID: fid, Task: taskId, Task_Note: id, File_Name: n, File: '' })
          return fid
        })
        save()
        return { id, fileIds }
      })
    },
    uploadTaskFile(fileId, file) {
      return delay('uploadTaskFile', () => {
        const row = (db.taskFiles ?? []).find((f) => f.ID === fileId)
        if (!row) throw new Error('Task file row not found')
        row.File = `/demo/${file.name}`
        demoFiles.set(fileId, file)
        save()
      })
    },
    deleteTaskFile(taskId, fileId) {
      return delay('deleteTaskFile', () => {
        const i = (db.taskFiles ?? []).findIndex((f) => f.ID === fileId && f.Task === taskId)
        if (i < 0) throw new Error('File not found')
        db.taskFiles!.splice(i, 1)
        save()
      })
    },
    readTaskFile: ({ id }) => Promise.resolve(demoFiles.get(id) ?? null),
    taskFileUrl: () => '',
    listPoPayments: (ids) =>
      delay('listPoPayments', () =>
        db.payments
          .filter((r) => ids.includes(str(r.Purchase_Order)))
          .map((r) => ({
            id: String(r.ID),
            purchaseOrderId: str(r.Purchase_Order),
            date: str(r.Payment_Date),
            amount: Number(r.Amount) || 0,
            reference: str(r.Reference_No),
            note: str(r.Payment_Note),
            booksNo: '',
          }))
          .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
      ),
    addPoPayment(input) {
      return delay('addPoPayment', () => {
        // Same rules as Widget.po_payment_save
        const po = db.purchaseOrders.find((o) => o.ID === input.poId)
        if (!po) throw new Error('Choose an existing purchase order of this project.')
        if (!input.date) throw new Error('Enter a valid payment date.')
        if (!(input.amount > 0) || Math.round(input.amount * 100) !== input.amount * 100) throw new Error('Enter a positive amount with no more than two decimal places.')
        const paid = db.payments.filter((r) => str(r.Purchase_Order) === input.poId).reduce((t, r) => t + (Number(r.Amount) || 0), 0)
        const balance = Math.round(((Number(po.Total_Cost) || 0) - paid) * 100) / 100
        if (input.amount > balance) throw new Error(`Payment exceeds the remaining balance of ${balance.toFixed(2)}.`)
        const id = String(Date.now())
        db.payments.push({ ID: id, Purchase_Order: input.poId, Payment_Date: input.date, Amount: input.amount, Reference_No: input.reference, Payment_Note: input.note })
        save()
        return { id }
      })
    },
    deletePoPayment(paymentId) {
      return delay('deletePoPayment', () => {
        const i = db.payments.findIndex((r) => r.ID === paymentId)
        if (i < 0) throw new Error('Payment not found.')
        db.payments.splice(i, 1)
        save()
      })
    },
    receiveGoods(input) {
      return delay('receiveGoods', () => {
        // Same rules as Widget.purchase_receive
        const po = db.purchaseOrders.find((o) => o.ID === input.poId)
        const errors: string[] = []
        if (!po) errors.push('Purchase order not found')
        if (!input.lines.length) errors.push('Enter a received quantity for at least one line')
        if (input.date && input.date > localToday()) errors.push('Receipt date cannot be in the future')
        for (const l of input.lines) {
          const line = db.poLines.find((x) => x.ID === l.lineId)
          const name = str(line?.Item_Description) || 'Line'
          if (!line || lookupId(line.Purchase_Order) !== input.poId) errors.push(`${name} is not on this purchase order`)
          else {
            const pending = Number(line.Quantity) - Number(line.Quantity_Received ?? 0)
            if (!(l.quantity > 0)) errors.push(`${name}: quantity must be above 0`)
            else if (l.quantity > pending) errors.push(`${name}: ${l.quantity} is more than the ${pending} still to receive`)
          }
          for (const pl of l.warehouseId ? l.places : []) {
            const rack = seed.seedRacks.find((r) => r.ID === pl.rackId)
            if (pl.rackId && lookupId(rack?.Warehouse) !== l.warehouseId) errors.push(`Rack ${str(rack?.Rack_Code)} is not in the selected warehouse`)
            const seg = seed.seedSegments.find((r) => r.ID === pl.segmentId)
            if (!(pl.quantity > 0)) errors.push(`${name}: every location needs a quantity above 0`)
            const free = Number(seg?.Capacity ?? 0) - Number(seg?.Occupied_Qty ?? 0)
            if (pl.segmentId && lookupId(seg?.Rack) !== pl.rackId) errors.push(`Bay ${str(seg?.Segment_Code)} is not in the selected rack`)
            else if (seg && !(Number(seg.Capacity ?? 0) > 0)) errors.push(`${str(seg.Segment_Code)} has no capacity set — set Capacity on the pallet (Bay) first`)
            else if (seg && pl.quantity > free) errors.push(`${str(seg.Segment_Code)} has only ${free} free. This location needs ${pl.quantity}`)
            if (pl.segmentId && input.lines.flatMap((x) => x.places).filter((x) => x.segmentId === pl.segmentId).length > 1)
              errors.push(`${str(seg?.Segment_Code)} is used for more than one location — one bay per location`)
            if (pl.position && !pl.segmentId) errors.push(`${name}: select the bay (segment) for the position ${pl.position}`)
            if (pl.position === 'Other' && !pl.positionNote.trim()) errors.push(`${name}: describe the Other position (position note)`)
          }
          const placed = l.places.reduce((s, x) => s + x.quantity, 0)
          if (l.warehouseId && l.places.length && placed !== l.quantity) errors.push(`${name}: the locations add up to ${placed} but ${l.quantity} are received`)
          // Serials, as Widget.purchase_receive / "Validation on edit": unique everywhere, all units or none
          const filled = l.serials.map((u) => u.serialNo.trim()).filter(Boolean)
          if (l.serials.length > l.quantity) errors.push(`${name}: ${l.serials.length} serial rows for ${l.quantity} units received`)
          else if (filled.length && filled.length !== l.quantity) errors.push(`${name}: enter a serial for every unit received (${filled.length} of ${l.quantity})`)
          for (const sn of filled) {
            if (input.lines.flatMap((x) => x.serials.map((u) => u.serialNo.trim().toUpperCase())).filter((x) => x === sn.toUpperCase()).length > 1) errors.push(`Serial ${sn} is entered twice`)
            else if (db.serials.includes(sn)) errors.push(`Serial ${sn} already exists in another receive`)
          }
        }
        const toSite = input.lines.filter((l) => !l.warehouseId)
        if (toSite.length && !input.siteReceivedBy.trim()) errors.push('Direct to site: enter who received the goods at site')
        if (errors.length) throw new Error([...new Set(errors)].join('; '))
        input.lines.forEach((l) => l.serials.forEach((u) => u.serialNo.trim() && db.serials.push(u.serialNo.trim())))
        const last = db.goodsReceipts.map((r) => Number(/(\d+)$/.exec(str(r.PR_No))?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0)
        const prNo = `PR-${String(last + 1).padStart(5, '0')}`
        const id = String(Date.now())
        const wh = (wid: string) => str(seed.seedWarehouses.find((w) => w.ID === wid)?.Warehouse_Name)
        db.goodsReceipts.push({
          ID: id,
          PR_No: prNo,
          Purchase_Order: { ID: input.poId, display_value: str(po!.PO_No) },
          Vendor: str(po!.Vendor_Name),
          Receive_Date: toCreatorDateMock(input.date || localToday()),
          Notes: [input.supplierDn && `Supplier DN: ${input.supplierDn}`, input.notes].filter(Boolean).join('\n'),
          Books_ID: '',
          Lines: input.lines.map((l, i) => {
            const rackCode = (id: string) => str(seed.seedRacks.find((r) => r.ID === id)?.Rack_Code)
            const pallet = (id: string) => seed.seedSegments.find((r) => r.ID === id)
            const bayCode = (id: string) => str(pallet(id)?.Segment_Code)
            const first = l.places[0]
            const places = (l.places.length ? l.places : [{ rackId: '', segmentId: '', position: '', positionNote: '', quantity: l.quantity }]).map((pl, k) => ({
              ID: `${id}${i}-${k}`,
              Rack: rackCode(pl.rackId),
              Segment: bayCode(pl.segmentId),
              Pallet: bayCode(pl.segmentId),
              Label: [str(pallet(pl.segmentId)?.Location_Path), bayCode(pl.segmentId), pl.position].filter(Boolean).join(' · ') || 'Not placed',
              Bay: str(pallet(pl.segmentId)?.Bay_Letter),
              Level: str(pallet(pl.segmentId)?.Level),
              Side: str(pallet(pl.segmentId)?.Side),
              Path: str(pallet(pl.segmentId)?.Location_Path),
              Position: pl.position,
              Position_Note: pl.positionNote,
              Qty: String(pl.quantity),
              Serials: l.serials
                .filter((u, n) => (u.place ?? 0) === k && n < l.quantity)
                .map((u) => u.serialNo.trim())
                .filter(Boolean),
            }))
            return {
              ID: `${id}${i}`,
              Parent_Line_ID: l.lineId,
              Item: str(db.poLines.find((x) => x.ID === l.lineId)?.Item_Description),
              Quantity_Received: String(l.quantity),
              Store_Warehouse: wh(l.warehouseId),
              Store_Rack: first ? rackCode(first.rackId) : '',
              Store_Segment: first ? bayCode(first.segmentId) : '',
              Position: first?.position ?? '',
              Position_Note: first?.positionNote ?? '',
              Places: places,
              Locations: l.warehouseId ? places.map((pl) => `${[pl.Path, pl.Segment, pl.Position].filter(Boolean).join(' · ') || 'Not placed'} · ${pl.Qty}`) : [],
              Serials: String(l.serials.filter((u) => u.serialNo.trim()).length),
              Serial_Nos: l.serials.map((u) => u.serialNo.trim()).filter(Boolean),
              Serial_Units: l.serials
                .filter((u) => u.serialNo.trim())
                .map((u) => ({ Serial_No: u.serialNo.trim(), MAC: u.mac, Status: l.warehouseId ? 'Available' : 'Delivered', Storage_ID: l.warehouseId ? `${id}${i}-${u.place ?? 0}` : '' })),
              Direct_To_Site: !l.warehouseId,
            }
          }),
        })
        // Parent totals, Received flags, PR_All_Received and the BOQ "at 2.0 warehouse" write-back
        for (const l of input.lines) {
          const line = db.poLines.find((x) => x.ID === l.lineId)!
          line.Quantity_Received = String(Number(line.Quantity_Received ?? 0) + l.quantity)
          line.Quantity_to_be_Received = String(Number(line.Quantity) - Number(line.Quantity_Received))
          line.Received = Number(line.Quantity_to_be_Received) <= 0
          if (l.warehouseId) line.Store_Warehouse = { ID: l.warehouseId, display_value: wh(l.warehouseId) }
          for (const pl of l.warehouseId ? l.places : []) {
            const seg = seed.seedSegments.find((r) => r.ID === pl.segmentId)
            if (seg) {
              seg.Occupied_Qty = String(Number(seg.Occupied_Qty ?? 0) + pl.quantity)
              seg.Free_Qty = String(Number(seg.Capacity ?? 0) - Number(seg.Occupied_Qty))
            }
          }
          const boqId = str(line.BOQ)
          const open = db.poLines.filter((x) => str(x.BOQ) === boqId && x.Received !== true)
          const b = db.boq.find((x) => x.ID === boqId)
          if (b && !open.length) {
            b.Delivered_to_2_0_Warehouse = 'Yes'
            b.Date_delivered_to_warehouse = toCreatorDateMock(input.date || localToday())
          }
        }
        const own = db.poLines.filter((x) => lookupId(x.Purchase_Order) === input.poId)
        po!.PR_All_Received = own.length > 0 && own.every((x) => x.Received === true)
        save()
        return { id, prNo, booksSynced: false, booksMessage: 'Demo data — nothing is sent to Zoho Books.', toSite }
      }).then(async ({ toSite, ...result }) => {
        // Direct to site, like Widget.purchase_receive: a delivered delivery note takes the units out again
        if (!toSite.length) return result
        const po = db.purchaseOrders.find((o) => o.ID === input.poId)!
        const dn = await this.createDeliveryNote({
          projectId: lookupId(po.Project_reference),
          date: input.date || localToday(),
          challanType: 'Others',
          warehouseId: '',
          reference: '',
          notes: `Delivered direct to site on receipt ${result.prNo}`,
          lines: toSite.map((l) => ({ lineId: l.lineId, quantity: l.quantity })),
        })
        await this.updateDeliveryNote({ dnId: dn.id, statusIndex: 67, deliveredDate: input.date || localToday(), receivedBy: input.siteReceivedBy, vehicleNo: '', driverName: '' })
        const g = db.goodsReceipts.find((r) => r.ID === result.id)
        const note = db.deliveryNotes.find((r) => r.ID === dn.id)
        if (g && note) g.Delivery_Note = { ID: dn.id, DN_No: dn.dnNo, DN_Date: note.DN_Date, Status: 'Delivered', Delivered_Date: note.Delivered_Date, Received_By: input.siteReceivedBy }
        save()
        return { ...result, deliveryNoteNo: dn.dnNo }
      })
    },
    uploadReceiptFile(receiptId, file) {
      return delay('uploadReceiptFile', () => {
        const g = db.goodsReceipts.find((r) => r.ID === receiptId)
        if (!g) throw new Error('Purchase receive not found')
        const list = Array.isArray(g.Attachments) ? (g.Attachments as string[]) : g.Attachments ? [str(g.Attachments)] : []
        if (list.length >= 10) throw new Error('The record already contains the maximum number of allowed uploads')
        const path = `${Date.now()}${list.length}_${file.name}`
        g.Attachments = [...list, path]
        demoFiles.set(`${receiptId}|${path}`, file)
        save()
      })
    },
    receiptFileUrl: () => '',
    readReceiptFile: ({ id, path }) => Promise.resolve(demoFiles.get(`${id}|${path}`) ?? null),
    retryBooksSync(kind, id) {
      return delay('retryBooksSync', () => {
        const rec = kind === 'po' ? db.purchaseOrders.find((r) => r.ID === id) : db.goodsReceipts.find((r) => r.ID === id)
        if (!rec) throw new Error(kind === 'po' ? 'Purchase order not found' : 'Purchase receive not found')
        return { no: str(kind === 'po' ? rec.PO_No : rec.PR_No), booksSynced: false }
      })
    },
    createDeliveryNote(input) {
      return delay('createDeliveryNote', () => {
        // Same rules as Widget.purchase_delivery (create)
        findProject(input.projectId)
        const errors: string[] = []
        if (!input.lines.length) errors.push('Select at least one received line')
        for (const l of input.lines) {
          const line = db.poLines.find((x) => x.ID === l.lineId)
          const name = str(line?.Item_Description) || 'Line'
          const po = db.purchaseOrders.find((o) => o.ID === lookupId(line?.Purchase_Order))
          const available = Number(line?.Quantity_Received ?? 0) - Number(line?.Already_Delivered ?? 0)
          const dn = line?.Delivery_Note as Record<string, unknown> | undefined
          const openDn = !!dn && !['Delivered', 'Cancelled'].includes(str(dn.Status))
          if (!line || !po) errors.push(`${name} is not on a purchase order`)
          else if (lookupId(po.Project_reference) !== input.projectId) errors.push(`${name} belongs to another project`)
          else if (openDn) errors.push(`${name} is already on an open delivery note`)
          else if (!(l.quantity > 0)) errors.push(`${name}: quantity must be above 0`)
          else if (l.quantity > available) errors.push(`${name}: ${l.quantity} is more than the ${available} received and not yet delivered`)
        }
        if (errors.length) throw new Error(errors.join('; '))
        const last = db.deliveryNotes.map((r) => Number(/(\d+)$/.exec(str(r.DN_No))?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0)
        const dnNo = `DC-${String(last + 1).padStart(5, '0')}`
        const id = String(Date.now())
        const lines = input.lines.map((l) => {
          const line = db.poLines.find((x) => x.ID === l.lineId)!
          line.Delivery_Note = { ID: id, zc_display_value: dnNo, Status: 'Draft' }
          line.Qty_to_Deliver = String(l.quantity)
          line.Available_Qty = String(Number(line.Quantity_Received ?? 0) - Number(line.Already_Delivered ?? 0))
          // Selling price of the accepted cost line, like Creator.Create_Delivery_Challan (Costing_Lineitem.Unit_Price)
          const cost = db.costingLines.find((c) => c.ID === str(line.Estimate_Line_ID))
          const sell = cost && Number(cost.Quantity) > 0 ? Number(cost.Total_Price ?? 0) / Number(cost.Quantity) : 0
          const amount = Math.round(l.quantity * sell * 100) / 100
          line.DN_Amount = String(amount)
          // Like Widget.project_console: the receipt the stock came from and where it is stored
          const receipt = [...db.goodsReceipts].reverse().find((g) => ((g.Lines as CreatorRecord[] | undefined) ?? []).some((x) => x.Parent_Line_ID === l.lineId))
          const stored = ((receipt?.Lines as CreatorRecord[] | undefined) ?? []).filter((x) => x.Parent_Line_ID === l.lineId)
          const place = (x: CreatorRecord) =>
            [str(x.Store_Warehouse), str(x.Store_Rack), [str(x.Store_Segment), str(x.Position), str(x.Position_Note) && `(${str(x.Position_Note)})`].filter(Boolean).join(' · ')]
              .filter(Boolean)
              .join(' · ')
          return {
            ID: l.lineId,
            Division: l.division || str(line.Division),
            Qty_to_Deliver: String(l.quantity),
            DN_Amount: String(amount),
            Item_Description: str(line.Item_Description),
            PR_No: str(receipt?.PR_No),
            Locations: stored.map(place).filter(Boolean),
          }
        })
        const pos = [...new Set(input.lines.map((l) => str((db.poLines.find((x) => x.ID === l.lineId)!.Purchase_Order as Record<string, unknown>).display_value)))]
        db.deliveryNotes.push({
          ID: id,
          Project: { ID: input.projectId, display_value: '' },
          DN_No: dnNo,
          DN_Date: toCreatorDateMock(input.date || localToday()),
          Status: { ID: '951', zc_display_value: 'Draft', Index: '1' },
          Reference: input.reference || pos.join(', '),
          Challan_Type: input.challanType || 'Others',
          Warehouse: input.warehouseId ? { ID: input.warehouseId, display_value: str(seed.seedWarehouses.find((w) => w.ID === input.warehouseId)?.Warehouse_Name) } : '',
          Customer_Notes: input.notes,
          Total: String(lines.reduce((t, l) => t + Number(l.DN_Amount), 0)),
          Books_ID: '',
          Lines: lines,
        })
        save()
        return { id, dnNo }
      })
    },
    uploadDeliveryNoteFile(dnId, file) {
      return delay('uploadDeliveryNoteFile', () => {
        const d = db.deliveryNotes.find((r) => r.ID === dnId)
        if (!d) throw new Error('Delivery note not found')
        const list = Array.isArray(d.Attachments) ? (d.Attachments as string[]) : []
        if (list.length >= 10) throw new Error('The record already contains the maximum number of allowed uploads')
        const path = `${Date.now()}${list.length}_${file.name}`
        d.Attachments = [...list, path]
        demoFiles.set(`${dnId}|${path}`, file)
        save()
      })
    },
    deliveryNoteFileUrl: () => '',
    readDeliveryNoteFile: ({ id, path }) => Promise.resolve(demoFiles.get(`${id}|${path}`) ?? null),
    deliveryNotePrint(dnId) {
      return delay('deliveryNotePrint', () => {
        const dn = db.deliveryNotes.find((d) => d.ID === dnId)
        if (!dn) throw new NotFoundError('Delivery note not found')
        const project = db.projects.find((p) => p.ID === lookupId(dn.Project))
        const c = seed.seedCustomers.find((x) => x.ID === lookupId(project?.Client_Name))
        const bill = (c?.Billing_Address2 ?? {}) as Record<string, unknown>
        return {
          // Demo data: in Creator the name and address come from the Zoho Books organization of the note's country
          organization: { name: '2Point0concepts', address: ['Organization address from Zoho Books (demo data)'], phone: '', email: '', website: '', taxLabel: 'TRN', taxValue: '' },
          customer: c
            ? {
                name: str(c.Customer_Name),
                attention: '',
                address: [str(bill.address_line_1), str(bill.district_city)].filter(Boolean),
                shipAttention: '',
                shipAddress: [],
                trn: '',
                phone: str(c.Phone_Number),
                mobile: '',
                email: str(c.Email),
              }
            : null,
          projectReference: str(project?.Project_Reference),
        }
      })
    },
    updateDeliveryNote(input) {
      return delay('updateDeliveryNote', () => {
        // Same rules as Widget.purchase_delivery (status) and the "Update DL on Success" workflow
        const dn = db.deliveryNotes.find((d) => d.ID === input.dnId)
        if (!dn) throw new NotFoundError('Delivery note not found')
        const current = Number((dn.Status as Record<string, unknown>).Index)
        const target = seed.seedStatuses.find((x) => (x.Modules as string[]).includes('Delivery Note') && Number(x.Index_field) === input.statusIndex)
        const errors: string[] = []
        const linked = db.poLines.filter((x) => lookupId(x.Delivery_Note) === input.dnId)
        if (current === 48 && input.statusIndex !== 48 && !linked.length) errors.push('This cancelled note has no lines left — create a new delivery note')
        if (!target) errors.push('Unknown delivery note status')
        if (input.statusIndex === 67 && !input.receivedBy.trim()) errors.push('Enter who received the goods')
        if (input.statusIndex === 67 && input.deliveredDate > localToday()) errors.push('Delivered date cannot be in the future')
        if (errors.length) throw new Error(errors.join('; '))
        const name = str(target!.Status_Name)
        dn.Status = { ID: target!.ID, zc_display_value: name, Index: String(input.statusIndex) }
        if (input.vehicleNo) dn.Vehicle_No = input.vehicleNo
        if (input.driverName) dn.Driver_Name = input.driverName
        const lines = db.poLines.filter((x) => lookupId(x.Delivery_Note) === input.dnId)
        // Leaving Delivered takes the delivered quantity back (Delivery.Recalc_Parent_Delivered)
        if (current === 67 && input.statusIndex !== 67)
          for (const line of lines) {
            line.Already_Delivered = String(Math.max(0, Number(line.Already_Delivered ?? 0) - Number(line.Qty_to_Deliver ?? 0)))
            line.Available_Qty = String(Number(line.Quantity_Received ?? 0) - Number(line.Already_Delivered))
          }
        if (input.statusIndex === 67 && current !== 67) {
          dn.Delivered_Date = toCreatorDateMock(input.deliveredDate || localToday())
          dn.Received_By = input.receivedBy
          for (const line of lines) {
            line.Already_Delivered = String(Number(line.Already_Delivered ?? 0) + Number(line.Qty_to_Deliver ?? 0))
            line.Available_Qty = String(Number(line.Quantity_Received ?? 0) - Number(line.Already_Delivered))
            const boqId = str(line.BOQ)
            const all = db.poLines.filter((x) => str(x.BOQ) === boqId)
            const ordered = all.reduce((t, x) => t + Number(x.Quantity), 0)
            const delivered = all.reduce((t, x) => t + Number(x.Already_Delivered ?? 0), 0)
            const b = db.boq.find((x) => x.ID === boqId)
            if (b && ordered > 0 && delivered >= ordered) {
              b.Delivered_to_Customer = 'Yes'
              b.Date_delivered_to_customer = dn.Delivered_Date
            }
          }
        }
        if (input.statusIndex === 48) {
          for (const line of lines) {
            line.Delivery_Note = ''
            line.Qty_to_Deliver = '0'
            line.DN_Amount = '0'
          }
          dn.Lines = []
        }
        for (const line of lines) if (line.Delivery_Note) (line.Delivery_Note as Record<string, unknown>).Status = name
        save()
        return { status: name, booksSynced: false }
      })
    },
    listBudgetReview: (key) =>
      delay('listBudgetReview', () => {
        db.budgetReview = db.budgetReview ?? demoBudgetReview()
        return db.budgetReview.filter((r) => lookupId(r.Project) === key.id).map(toBudgetReview)
      }),
    listAttendees: (projectId) =>
      delay('listAttendees', () => {
        db.attendees = db.attendees ?? []
        return db.attendees
          .filter((r) => lookupId(r.Project) === projectId)
          .map((r) => toAttendee({ ID: r.ID, User_ID: lookupId(r.Employee_Name), User_Name: seed.seedUsers.find((u) => u.ID === lookupId(r.Employee_Name))?.Name, Attendance: r.Attendance }))
      }),
    saveAttendance(projectId, userId, attendance) {
      return delay('saveAttendance', () => {
        // Same rules as Widget.project_task_update (save_attendance)
        const p = findProject(projectId)
        if (!seed.seedUsers.some((u) => u.ID === userId)) throw new Error('Choose the employee first')
        if (!['Present', 'Absent', ''].includes(attendance)) throw new Error('Attendance must be Present or Absent')
        db.attendees = db.attendees ?? []
        let row = db.attendees.find((r) => lookupId(r.Project) === projectId && lookupId(r.Employee_Name) === userId)
        if (!row) {
          row = { ID: `ma${Date.now()}${db.attendees.length}`, Project: { ID: p.ID, display_value: str(p.Project_Name) }, Employee_Name: { ID: userId, display_value: '' } }
          db.attendees.push(row)
        }
        row.Attendance = attendance
        // the Project's Meeting_Attendees grid is the other side of Meeting_Attendee.Project (bidirectional)
        p.Meeting_Attendees = db.attendees.filter((r) => lookupId(r.Project) === projectId).map((r) => ({ ID: r.ID }))
        return { id: String(row.ID) }
      })
    },
    listOutsourcedContacts: (projectId) =>
      delay('listOutsourcedContacts', () => {
        db.outsourced = db.outsourced ?? demoOutsourced()
        return db.outsourced.filter((r) => lookupId(r.Project) === projectId).map(toOutsourced)
      }),
    listProjectContacts: (projectId) =>
      delay('listProjectContacts', () => {
        db.contacts = db.contacts ?? demoContacts()
        return db.contacts.filter((r) => lookupId(r.Project) === projectId).map(toContact)
      }),
    saveProjectContact(projectId, contactId, data) {
      return delay('saveProjectContact', () => {
        // Same rules as Widget.project_task_update (save_contact)
        const p = findProject(projectId)
        db.contacts = db.contacts ?? demoContacts()
        const errors = [!data.firstName.trim() && 'Enter the first name', data.email.trim() && !/@.+\./.test(data.email) && 'Enter a valid email'].filter(Boolean)
        if (errors.length) throw new Error(errors.join('. '))
        let row = contactId ? db.contacts.find((r) => r.ID === contactId && lookupId(r.Project) === projectId) : undefined
        if (contactId && !row) throw new NotFoundError('Contact not found in this project')
        if (!row) {
          row = { ID: `c${Date.now()}`, Project: { ID: p.ID, display_value: str(p.Project_Reference) } }
          db.contacts.push(row)
        }
        Object.assign(row, { First_Name: data.firstName.trim(), Last_Name: data.lastName.trim(), Email: data.email.trim(), Mobile: data.phone.trim(), Designation: data.designation.trim() })
        save()
        return { id: String(row.ID) }
      })
    },
    uploadProjectFile(projectId, file, field = 'PO_Document') {
      return delay('uploadProjectFile', () => {
        const p = findProject(projectId)
        const path = `${Date.now()}_${file.name}`
        p[field] = path
        demoFiles.set(`${projectId}|${path}`, file)
        save()
      })
    },
    projectFileUrl: () => '',
    readProjectFile: (projectId, path) => Promise.resolve(demoFiles.get(`${projectId}|${path}`) ?? null),
    saveTaskListItem: (item) =>
      delay('saveTaskListItem', () => {
        const name = item.name.trim()
        if (!name) throw new Error('Task Name is required')
        if (name.length > 255) throw new Error('Task Name is longer than 255 characters')
        if (seed.seedTaskList.some((r) => r.Task_Name === name && String(r.ID) !== item.id)) throw new Error('This item is already in the list')
        const status = item.active ? 'Active' : 'Inactive'
        const row = item.id ? seed.seedTaskList.find((r) => String(r.ID) === item.id) : undefined
        if (item.id && !row) throw new Error('Checklist item not found')
        if (row) Object.assign(row, { Task_Name: name, Status: status })
        else seed.seedTaskList.push({ ID: String(Math.max(3099, ...seed.seedTaskList.map((r) => Number(r.ID))) + 1), Task_Name: name, Status: status })
        return { id: String(row?.ID ?? seed.seedTaskList.at(-1)!.ID) }
      }),
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
          const next = Math.max(0, ...db.risks.filter((x) => lookupId(x.Project_Name) === projectId).map((x) => Number(/^(?:R - |RSK-\d{2}-)(\d+)$/.exec(str(x.Risk_ID))?.[1] ?? 0))) + 1
          r = {
            ID: String(5000 + db.risks.length + 1 + Math.floor(Math.random() * 1000)),
            Project_Name: { ID: projectId, display_value: str(p.Project_Reference) },
            Risk_ID: `RSK-${String(new Date().getFullYear()).slice(2)}-${String(next).padStart(5, '0')}`,
          }
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
        if ('Milestone_Name' in data && !str(data.Milestone_Name).trim()) throw new Error('Enter the milestone name')
        m.Parent_Project = m.Parent_Project || { ID: projectId, display_value: '' }
        if ('Starts_After_In' in data && str(data.Starts_After_In) && !['Days', 'Weeks', 'Months'].includes(str(data.Starts_After_In))) throw new Error('Starts after in must be Days, Weeks or Months')
        logged(
          projectId,
          'Milestone',
          m,
          () => str(m.Milestone_Name),
          data,
          () => {
            for (const [k, v] of Object.entries(data)) {
              if (k === 'Status') m[k] = statusRef(str(v))
              else if (k === 'Owner') m[k] = v ? { ID: str(v), display_value: str(seed.seedUsers.find((u) => u.ID === v)?.Name) } : ''
              else m[k] = v
            }
          },
        )
        save()
      })
    },
    listActivity: (projectId, recordId) => delay('listActivity', () => db.activity.filter((a) => lookupId(a.Project) === projectId && (!recordId || a.Record_ID === recordId)).map(toActivity)),
    updateBoq(projectId, boqId, data) {
      return delay('updateBoq', () => {
        const p = findProject(projectId)
        const b = db.boq.find((x) => x.ID === boqId)
        const inProject =
          !!b && (lookupId(b.Project) === projectId || lookupId(b.Estimate1) === lookupId(p.Accepted_Estimate) || (!!str(p.Project_Reference) && b.Project_Reference === p.Project_Reference))
        if (!b || !inProject) throw new NotFoundError('BOQ line not found in this project')
        const po = 'PO_Date' in data ? String(data.PO_Date) : str(b.PO_Date)
        const eta = 'ETA' in data ? String(data.ETA) : str(b.ETA)
        if (po && eta && fromCreatorDate(eta) < fromCreatorDate(po)) throw new Error('ETA must be on or after the PO date')
        logged(
          projectId,
          'BOQ',
          b,
          () => str(b.Model) || str(b.Description),
          data,
          () => {
            for (const [k, v] of Object.entries(data))
              b[k] = k === 'Status' ? statusRef(String(v)) : k === 'Vendors' ? (v ? { ID: String(v), display_value: str(seed.seedVendors.find((x) => x.ID === v)?.Vendor_Name) } : '') : v
          },
        )
        save()
      })
    },
    updateTask(projectId, taskId, data) {
      return delay('updateTask', () => {
        findProject(projectId)
        const t = db.tasks.find((x) => x.ID === taskId && lookupId(x.Project_Name) === projectId)
        if (!t) throw new NotFoundError('Task not found in this project')
        const start = 'Task_Start_Date' in data ? String(data.Task_Start_Date) : str(t.Task_Start_Date)
        const end = 'Task_End_Date' in data ? String(data.Task_End_Date) : str(t.Task_End_Date)
        if (start && end && fromCreatorDate(end) < fromCreatorDate(start)) throw new Error('Due date must be on or after the start date')
        if ('Owners' in data && (data.Owners as string[]).some((o) => !seed.seedUsers.some((u) => u.ID === o))) throw new Error('Assignees must be users of the app (Users form)')
        logged(
          projectId,
          'Task',
          t,
          () => str(t.Task_Name),
          data,
          () => {
            for (const [k, v] of Object.entries(data)) {
              if (k === 'Task_Status') t[k] = statusRef(String(v))
              else if (k === 'Parent_Task') t[k] = v ? { ID: String(v), display_value: str(db.tasks.find((x) => x.ID === v)?.Task_Name) } : ''
              else if (k === 'Milestone') {
                const ms = db.planMilestones.find((x) => x.ID === v && lookupId(x.Project) === projectId)
                t[k] = ms ? { ID: String(v), display_value: str(ms.Milestone_Name) } : ''
              } else if (k === 'Owners') t[k] = (v as string[]).map((uid) => ({ ID: uid, display_value: str(seed.seedUsers.find((u) => u.ID === uid)?.Name) }))
              else t[k] = v
            }
          },
        )
        save()
      })
    },
    createMilestone(projectId, input) {
      return delay('createMilestone', () => {
        const p = findProject(projectId)
        if (!input.name.trim()) throw new Error('Enter the milestone name')
        if (!['Days', 'Weeks', 'Months'].includes(input.startsAfterIn)) throw new Error('Starts after in must be Days, Weeks or Months')
        const id = String(Date.now())
        const no = db.planMilestones.length + 1
        db.planMilestones.push({
          ID: id,
          Project: { ID: p.ID, display_value: str(p.Project_Reference) },
          Milestone_No: `MIL-26-${String(no).padStart(5, '0')}`,
          Milestone_Name: input.name.trim(),
          Parent_Project: { ID: p.ID, display_value: str(p.Project_Reference) },
          Status: seed.st('Active'),
          Owner: '',
          Flag: 'Internal',
          Starts_After_In: input.startsAfterIn,
          Starts_after: String(input.startsAfter),
          Duration: String(input.duration),
        })
        save()
        return { id }
      })
    },
    createTask(projectId, input) {
      return delay('createTask', () => {
        const p = findProject(projectId)
        if (!input.name.trim()) throw new Error('Enter the task name')
        if (input.startDate && input.endDate && input.endDate < input.startDate) throw new Error('Due date must be on or after the start date')
        // Same as Widget.project_task_update (add task): under a work package / task → its milestone; else the milestone only
        const parent = input.parentId ? db.tasks.find((t) => t.ID === input.parentId && lookupId(t.Project_Name) === projectId) : undefined
        if (input.parentId && !parent) throw new NotFoundError('Parent task not found in this project')
        const ms = parent ? null : db.planMilestones.find((x) => x.ID === input.milestoneId && lookupId(x.Project) === projectId)
        if (!parent && !ms) throw new NotFoundError('Milestone not found in this project')
        const milestone = parent ? parent.Milestone || '' : { ID: String(ms!.ID), display_value: str(ms!.Milestone_Name) }
        const id = `${Date.now()}`
        const days = input.startDate && input.endDate ? Math.round((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000) + 1 : 0
        db.tasks.push({
          ID: id,
          Project_Name: { ID: p.ID, display_value: '' },
          Task_No: `T-${id}`,
          Task_Name: input.name.trim(),
          Type_field: (parent && str(parent.Type_field)) || 'Task',
          Parent_Task: parent ? { ID: String(parent.ID), display_value: str(parent.Task_Name) } : '',
          Milestone: milestone,
          Work_Package: parent ? str(parent.Work_Package) : '',
          Task_Start_Date: input.startDate ? toCreatorDateMock(input.startDate) : '',
          Task_End_Date: input.endDate ? toCreatorDateMock(input.endDate) : '',
          Duration: days ? String(days) : '',
          Priority: 'Medium',
          Precent_Complete: '0',
          Task_Status: seed.st('Not Started'),
          Owners: [],
        })
        save()
        return { id }
      })
    },
    updateAssetLine(projectId, lineId, data) {
      return delay('updateAssetLine', () => {
        const line = linesOf(findProject(projectId)).find((l) => l.ID === lineId)
        if (!line) throw new NotFoundError('Asset line not found in this project')
        // Same as Widget.project_task_update (line_id): Project Execution + Asset & Network fields only
        logged(
          projectId,
          'Asset',
          line,
          () => str(line.Model) || str(line.Item_Description),
          data,
          () => {
            for (const [k, v] of Object.entries(data)) line[k] = k === 'Installation_Status' || k === 'Delivery_Status' ? statusRef(String(v)) : k === 'Networked' ? v === true || v === 'true' : v
          },
        )
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
        if (input.lines.some((l) => !(DIVISIONS as readonly string[]).includes(l.division))) errors.push('Select the reporting tag (Division) of every line')
        if (input.modeOfTransit && !['Road', 'Air', 'Sea'].includes(input.modeOfTransit)) errors.push('Mode of transit must be Road, Air or Sea')
        for (const l of input.lines) {
          const b = db.boq.find((x) => x.ID === l.boqId)
          if (!b) continue
          const ordered = db.poLines
            .filter(
              (pl) => pl.is_PR !== true && lookupId(pl.Item_Name) === l.productId && ((db.purchaseOrders.find((o) => o.ID === lookupId(pl.Purchase_Order))?.BOQ as string[]) ?? []).includes(l.boqId),
            )
            .reduce((s, pl) => s + Number(pl.Quantity), 0)
          if (l.quantity <= 0) errors.push(`${str(b.Description)}: quantity must be above 0`)
          else if (ordered + l.quantity > Number(b.Quantity)) errors.push(`${str(b.Description)}: ordered ${ordered} + ${l.quantity} exceeds BOQ quantity ${b.Quantity}`)
        }
        const existing = input.poId ? db.purchaseOrders.find((o) => o.ID === input.poId) : undefined
        if (input.poId && !existing) errors.push('The selected purchase order no longer exists')
        else if (existing && lookupId(existing.Project_reference) !== input.projectId) errors.push('The selected purchase order belongs to another project')
        else if (existing && lookupId(existing.Vendor_Name) !== input.vendorId) errors.push('The selected purchase order is for another vendor')
        if (errors.length) throw new Error(errors.join('; '))
        // Same numbering as the Purchase_Order workflow: PO-00001, PO-00002, …
        const last = db.purchaseOrders.map((o) => Number(/^PO-(\d+)$/.exec(str(o.PO_No))?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0)
        const poNo = existing ? str(existing.PO_No) : `PO-${String(last + 1).padStart(5, '0')}`
        const id = existing ? String(existing.ID) : String(Date.now())
        const sub = input.lines.reduce((s, l) => s + l.quantity * l.rate, 0)
        if (existing) {
          const total = Number(existing.Sub_Total) + sub
          existing.Sub_Total = String(total)
          existing.Total_Cost = String(total - (total * Number(existing.Discount ?? 0)) / 100)
          existing.BOQ = [...new Set([...((existing.BOQ as string[]) ?? []), ...input.lines.map((l) => l.boqId)])]
          existing.PR_All_Received = false
        } else
          db.purchaseOrders.push({
            ID: id,
            PO_No: poNo,
            Project_reference: { ID: p.ID, display_value: str(p.Project_Reference) },
            Vendor_Name: { ID: input.vendorId, display_value: options('vendors').find((v) => v.id === input.vendorId)?.label },
            Vendor_ID: input.vendorId,
            Country_ID: input.countryId,
            Warehouse_ID: input.warehouseId ?? '',
            Notes: input.notes,
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
        const stamp = Date.now()
        input.lines.forEach((l, i) =>
          db.poLines.push({
            ID: `${stamp}${i}`,
            BOQ: l.boqId,
            Estimate_Line_ID: l.lineId ?? '',
            Already_Delivered: '0',
            Purchase_Order: { ID: id, display_value: poNo },
            Item_Name: { ID: l.productId, display_value: l.description },
            Item_Description: l.description,
            Quantity: String(l.quantity),
            Rate: String(l.rate),
            Amount: String(l.quantity * l.rate),
            Quantity_Received: '0',
            Quantity_to_be_Received: String(l.quantity),
            Division: l.division,
          }),
        )
        for (const l of input.lines) {
          const b = db.boq.find((x) => x.ID === l.boqId)
          if (!b) continue
          // Same write-back as Widget.project_create_po: PO#, PO date (first PO) and the "Ordered" status
          if (!str(b.PO)) b.PO_Date = input.date ? toCreatorDateMock(input.date) : b.PO_Date
          b.PO = str(b.PO) ? `${str(b.PO)}, ${poNo}` : poNo
          const eta = input.eta || (existing ? '' : input.deliveryDate)
          if (eta) b.ETA = toCreatorDateMock(eta)
          if (input.modeOfTransit) b.Mode_of_Transit = input.modeOfTransit
          const ordered = seed.seedStatuses.find((x) => (x.Modules as string[]).includes('BOQ') && /^ordered/i.test(str(x.Status_Name).trim()))
          if (ordered) b.Status = statusRef(String(ordered.ID))
        }
        save()
        return { id, poNo, booksSynced: false, booksMessage: 'Demo data — nothing is sent to Zoho Books.', addedToExisting: !!existing }
      })
    },
    listOptions: (source: LookupSource) => delay(`listOptions:${source.key}`, () => options(source.key).sort((a, b) => a.label.localeCompare(b.label))),
  }
}
