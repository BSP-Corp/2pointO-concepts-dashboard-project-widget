// Zoho Creator Widget SDK (v2) data source — runs only inside Creator (SDK loaded in index.html).
// No direct record CRUD: every read/update calls a Creator custom function through its Custom API (docs/CUSTOM_FUNCTIONS.md).
import { fileBlob } from '@/features/console/openFile'
import { CREATOR_FILES, CUSTOM_APIS, FIELDS, REPORTS, TASK_FILE_FIELD, ZOHO_APP, type CustomApiKey } from '@/config/zoho'
import type { LookupSource } from '@/config/projectForm'
import type {
  ActivityEntry,
  BoqLine,
  CostingLine,
  CreatorRecord,
  Dashboard,
  DeliveryNote,
  GoodsReceipt,
  PlanMilestone,
  ProjectContact,
  MeetingAttendee,
  OutsourcedContact,
  BudgetReviewRow,
  ProjectDetails,
  StatusChange,
  TimelineEvent,
  WorkTask,
  PaymentMilestone,
  PoLine,
  Project,
  ProjectKey,
  PurchaseOrder,
  Ref,
  Risk,
} from '@/types/domain'
import { NotConfiguredError, type DataSource } from './types'

interface CreatorResponse<T> {
  code?: number
  data?: T
  result?: unknown
  message?: string
  record_cursor?: string
}

type Cfg = Record<string, unknown>

interface CreatorSdk {
  DATA: {
    invokeCustomApi(cfg: Cfg): Promise<CreatorResponse<unknown>>
  }
  /** Widget SDK v2 file API: upload into an upload-file field of a record */
  FILE?: {
    uploadFile(cfg: { app_name?: string; report_name: string; id: string; field_name: string; file: File }): Promise<CreatorResponse<unknown>>
    /** Content of an upload-file field (Blob) */
    readFile?(cfg: { app_name?: string; report_name: string; id: string; field_name: string; file_url?: string }): Promise<unknown>
  }
  UTIL: {
    getInitParams?(): Promise<{ scope?: string; appLinkName?: string; envUrlFragment?: string }>
    getQueryParams?(): Promise<Record<string, unknown>>
    getWidgetParams?(): Promise<Record<string, unknown>>
    navigateParentUrl?(url: string): void
    navigateParentURL?(cfg: { action: 'open'; url: string; window: 'same' | 'new' }): void
  }
}

declare global {
  interface Window {
    ZOHO?: { CREATOR?: CreatorSdk }
  }
}

export function isInsideCreator(): boolean {
  return typeof window !== 'undefined' && !!window.ZOHO?.CREATOR?.DATA && window.self !== window.top
}

// ── value helpers (Creator returns numbers/currency as strings, lookups as {ID, display_value}) ──
export const str = (v: unknown): string => {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    // API v2.1 lookups/addresses: {ID, zc_display_value}; older shapes: {ID, display_value}.
    const o = v as { zc_display_value?: unknown; display_value?: unknown }
    if (o.zc_display_value !== undefined) return String(o.zc_display_value ?? '')
    if (o.display_value !== undefined) return String(o.display_value ?? '')
    return ''
  }
  return String(v)
}
export const num = (v: unknown): number => {
  const n = Number(String(str(v) || '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const bool = (v: unknown): boolean => v === true || String(v).toLowerCase() === 'true'
export const ref = (v: unknown): Ref | null => {
  if (v && typeof v === 'object' && 'ID' in (v as object)) return { id: String((v as { ID: unknown }).ID), label: str(v) }
  return null
}
const refs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : [])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Creator date format "dd-MMM-yyyy" (application setting) → ISO "yyyy-mm-dd". */
export const fromCreatorDate = (v: unknown): string => {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(str(v))
  if (!m) return str(v)
  const month = String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')
  return `${m[3]}-${month}-${m[1]}`
}
export const toCreatorDate = (iso: string): string => {
  const [y, mo, d] = iso.split('-')
  return y && mo && d ? `${d}-${MONTHS[Number(mo) - 1]}-${y}` : iso
}
const isId = (s?: string): s is string => !!s && /^\d+$/.test(s)

// ── record mappers ──
/** Project.Status_History lines → oldest first. Unknown lines are kept as the status text. */
export function parseStatusHistory(v: unknown): StatusChange[] {
  return str(v)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [stamp = '', status = '', user = '', ...rest] = l.split('|').map((x) => x.trim())
      const [d = '', time = ''] = stamp.split(/\s+/)
      const at = fromCreatorDate(d)
      return /^\d{4}-\d{2}-\d{2}$/.test(at) ? { at, time, status, user, reason: rest.join(' | ') } : { at: '', time: '', status: l, user: '', reason: '' }
    })
}

export function toProject(r: CreatorRecord): Project {
  const f = FIELDS.project
  return {
    id: String(r.ID),
    reference: str(r[f.reference]),
    name: str(r[f.name]),
    client: str(r[f.client]),
    status: str(r[f.status]),
    type: str(r[f.type]),
    countries: refs(r[f.country]),
    currency: str(r[f.currency]),
    city: str(r[f.city]),
    state: str(r[f.state]),
    address: str(r[f.address]),
    description: str(r[f.description]),
    startDate: fromCreatorDate(r[f.startDate]),
    completionDate: fromCreatorDate(r[f.completionDate]),
    actualCompletionDate: fromCreatorDate(r[f.actualCompletionDate]),
    projectManager: str(r[f.projectManager]),
    clientPoNo: str(r[f.clientPoNo]),
    projectValuePo: num(r[f.projectValuePo]),
    acceptedEstimate: ref(r[f.acceptedEstimate]),
    projectNo: str(r.Project_No),
    statusHistory: parseStatusHistory(r.Status_History),
    datePoReceived: fromCreatorDate(r[f.datePoReceived]),
    estimateValueSubTotal: num(r[f.estimateValueSubTotal]),
    salesOrderNo: str(r[f.salesOrderNo]),
    budget: {
      hardware: num(r[f.hardware]),
      software: num(r[f.software]),
      outsourcedServices: num(r[f.outsourcedServices]),
      logistics: num(r[f.logistics]),
      point0Services: num(r[f.point0Services]),
      estimatedMargin: num(r[f.estimatedMargin]),
      totalBudgetCost: num(r[f.totalBudgetCost]),
    },
  }
}

export function toCostingLine(r: CreatorRecord): CostingLine {
  const f = FIELDS.costingLine
  const s = (k: keyof typeof f) => str(r[f[k]])
  return {
    id: String(r.ID),
    workPackage: s('workPackage').trim(),
    vendor: s('vendor'),
    category: s('category'),
    type: s('type'),
    brand: s('brand'),
    sku: s('sku'),
    model: s('model'),
    description: s('description'),
    uom: s('uom'),
    quantity: num(r[f.quantity]),
    totalCost: num(r[f.totalCost]),
    totalPrice: num(r[f.totalPrice]),
    totalProfit: num(r[f.totalProfit]),
    deliveryStatus: s('deliveryStatus'),
    installationStatus: s('installationStatus'),
    notes: s('notes'),
    serialNumber: s('serialNumber'),
    macControl: s('macControl'),
    macDante: s('macDante'),
    warrantyStart: fromCreatorDate(r[f.warrantyStart]),
    warrantyEnd: fromCreatorDate(r[f.warrantyEnd]),
    provision: s('provision'),
    outletGop: s('outletGop'),
    networked: bool(r[f.networked]),
    switchRef: s('switchRef'),
    portNo: s('portNo'),
    poe: s('poe'),
    vlan: s('vlan'),
    ipAddress: s('ipAddress'),
    subnetMask: s('subnetMask'),
    hostName: s('hostName'),
    gateway: s('gateway'),
    dns1: s('dns1'),
    dns2: s('dns2'),
  }
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? str((x as { ID?: unknown }).ID) : String(x))).filter(Boolean) : [])
const refList = (v: unknown): Ref[] => (Array.isArray(v) ? v.map(ref).filter((r): r is Ref => !!r) : [])

export function toBoqLine(r: CreatorRecord): BoqLine {
  const f = FIELDS.boq
  const s = (k: keyof typeof f) => str(r[f[k]])
  return {
    id: String(r.ID),
    workPackage: s('workPackage'),
    vendor: s('vendor'),
    vendorId: ref(r[f.vendor])?.id ?? '',
    category: s('category'),
    type: s('type'),
    brand: s('brand'),
    sku: s('sku'),
    productId: ref(r[f.sku])?.id ?? '',
    model: s('model'),
    description: s('description'),
    uom: s('uom'),
    quantity: num(r[f.quantity]),
    warranty: s('warranty'),
    status: s('status'),
    statusId: ref(r[f.status])?.id ?? '',
    poDate: fromCreatorDate(r[f.poDate]),
    po: s('po').trim(),
    modeOfTransit: s('modeOfTransit'),
    eta: fromCreatorDate(r[f.eta]),
    deliveredToWarehouse: s('deliveredToWarehouse'),
    dateDeliveredToWarehouse: fromCreatorDate(r[f.dateDeliveredToWarehouse]),
    deliveredToCustomer: s('deliveredToCustomer'),
    dateDeliveredToCustomer: fromCreatorDate(r[f.dateDeliveredToCustomer]),
    lineIds: ids(r.Costing_Lineitem),
  }
}

export function toPurchaseOrder(r: CreatorRecord): PurchaseOrder {
  const f = FIELDS.purchaseOrder
  return {
    id: String(r.ID),
    poNo: str(r[f.poNo]).trim(),
    vendor: str(r[f.vendor]),
    date: fromCreatorDate(r[f.date]),
    reference: str(r[f.reference]),
    deliveryDate: fromCreatorDate(r[f.deliveryDate]),
    subTotal: num(r[f.subTotal]),
    discount: num(r[f.discount]),
    totalCost: num(r[f.totalCost]),
    boqIds: ids(r.BOQ),
    booksSynced: bool(r.Books_Synced) || !!str(r.Books_ID),
    issuedBy: str(r.Issued_By),
    status: str(r.PO_Status),
    vendorId: str(r.Vendor_ID),
    countryId: str(r.Country_ID),
    warehouseId: str(r.Warehouse_ID),
    terms: str(r.Terms_Conditions),
    notes: str(r.Notes),
    prAllReceived: bool(r.PR_All_Received),
  }
}

export function toPoLine(r: CreatorRecord): PoLine {
  const f = FIELDS.poLine
  return {
    id: String(r.ID),
    division: str(r.Division),
    purchaseOrderId: ref(r[f.purchaseOrder])?.id ?? '',
    itemId: ref(r[f.item])?.id ?? '',
    item: str(r[f.item]),
    description: str(r[f.description]),
    quantity: num(r[f.quantity]),
    rate: num(r[f.rate]),
    amount: num(r[f.amount]),
    quantityReceived: num(r[f.quantityReceived]),
    quantityToBeReceived: num(r[f.quantityToBeReceived]),
    received: bool(r[f.received]),
    boqId: ref(r.BOQ)?.id ?? str(r.BOQ),
    lineId: ref(r.Estimate_Line_ID)?.id ?? str(r.Estimate_Line_ID),
    alreadyDelivered: num(r.Already_Delivered),
    qtyToDeliver: num(r.Qty_to_Deliver),
    wpId: str(r.WP_ID),
    storeWarehouse: str(r.Store_Warehouse),
    reservedQty: num(r.Reserved_Qty),
    stockLocations: (Array.isArray(r.Stock_Locations) ? (r.Stock_Locations as Record<string, unknown>[]) : []).map((x) => ({
      id: str(x.ID),
      label: str(x.Label),
      qty: num(x.Qty),
      prNo: str(x.PR_No),
      warehouse: str(x.Warehouse),
      location: str(x.Location),
      serials: Array.isArray(x.Serials) ? (x.Serials as unknown[]).map(str).filter(Boolean) : [],
      received: fromCreatorDate(x.Received),
      status: str(x.Status),
      rack: str(x.Rack),
      bay: str(x.Bay),
      level: str(x.Level),
      side: str(x.Side),
      pallet: str(x.Pallet),
    })),
    warrantyMonths: num(r.Warranty_Months),
    deliveryNote: (() => {
      const dn = r.Delivery_Note as Record<string, unknown> | undefined
      const id = ref(dn)?.id
      return id ? { id, no: str(dn?.zc_display_value ?? dn?.display_value), status: str(dn?.Status) } : null
    })(),
  }
}

export function toDeliveryNote(r: CreatorRecord): DeliveryNote {
  const st = (r.Status ?? {}) as Record<string, unknown>
  return {
    id: String(r.ID),
    no: str(r.DN_No),
    date: fromCreatorDate(r.DN_Date),
    status: str(r.Status),
    statusIndex: num(st.Index) || 1,
    reference: str(r.Reference),
    challanType: str(r.Challan_Type),
    warehouse: str(r.Warehouse),
    vehicleNo: str(r.Vehicle_No),
    driverName: str(r.Driver_Name),
    receivedBy: str(r.Received_By),
    deliveredDate: fromCreatorDate(r.Delivered_Date),
    notes: str(r.Customer_Notes),
    total: num(r.Total),
    booksId: str(r.Books_ID),
    files: attachmentsOf(r.Attachments).map((path) => ({ id: String(r.ID), path, name: path.replace(/^.*[?&]filepath=/, '').replace(/^\d+_/, '') || 'File' })),
    lines: (Array.isArray(r.Lines) ? (r.Lines as Record<string, unknown>[]) : []).map((l) => ({
      id: str(l.ID),
      quantity: num(l.Qty_to_Deliver),
      amount: num(l.DN_Amount),
      description: str(l.Item_Description),
      prNo: str(l.PR_No),
      locations: Array.isArray(l.Locations) ? (l.Locations as unknown[]).map(str).filter(Boolean) : [],
    })),
  }
}

export function toGoodsReceipt(r: CreatorRecord): GoodsReceipt {
  const dn = (r.Delivery_Note && typeof r.Delivery_Note === 'object' ? r.Delivery_Note : null) as Record<string, unknown> | null
  return {
    id: String(r.ID),
    no: str(r.PR_No),
    date: fromCreatorDate(r.Receive_Date),
    purchaseOrderId: ref(r.Purchase_Order)?.id ?? '',
    poNo: str(r.Purchase_Order),
    vendor: str(r.Vendor),
    notes: str(r.Notes),
    booksId: str(r.Books_ID),
    files: attachmentsOf(r.Attachments).map((path) => ({ id: String(r.ID), path, name: path.replace(/^.*[?&]filepath=/, '').replace(/^\d+_/, '') || 'File' })),
    deliveryNote:
      dn && str(dn.ID)
        ? { id: str(dn.ID), no: str(dn.DN_No), date: fromCreatorDate(dn.DN_Date), status: str(dn.Status), deliveredDate: fromCreatorDate(dn.Delivered_Date), receivedBy: str(dn.Received_By) }
        : null,
    lines: (Array.isArray(r.Lines) ? (r.Lines as Record<string, unknown>[]) : []).map((l) => ({
      id: str(l.ID),
      parentLineId: str(l.Parent_Line_ID),
      item: str(l.Item),
      quantity: num(l.Quantity_Received),
      warehouse: str(l.Store_Warehouse),
      rack: str(l.Store_Rack),
      segment: str(l.Store_Segment),
      position: str(l.Position),
      positionNote: str(l.Position_Note),
      serials: num(l.Serials),
      serialNos: Array.isArray(l.Serial_Nos) ? (l.Serial_Nos as unknown[]).map(str).filter(Boolean) : [],
      locations: Array.isArray(l.Locations) ? (l.Locations as unknown[]).map(str).filter(Boolean) : [],
      places: (Array.isArray(l.Places) ? (l.Places as Record<string, unknown>[]) : []).map((x) => ({
        id: str(x.ID),
        label: str(x.Label),
        qty: num(x.Qty),
        rack: str(x.Rack),
        bay: str(x.Bay),
        level: str(x.Level),
        side: str(x.Side),
        pallet: str(x.Pallet),
      })),
      units: (Array.isArray(l.Serial_Units) ? (l.Serial_Units as Record<string, unknown>[]) : []).map((u) => ({
        serialNo: str(u.Serial_No),
        mac: str(u.MAC),
        status: str(u.Status),
        storageId: str(u.Storage_ID),
      })),
      directToSite: bool(l.Direct_To_Site),
    })),
  }
}

export function toMilestone(r: CreatorRecord): PaymentMilestone {
  const f = FIELDS.paymentMilestone
  return { id: String(r.ID), name: str(r[f.name]), amount: num(r[f.amount]), percentage: num(r[f.percentage]), terms: str(r[f.terms]) }
}

export function toRisk(r: CreatorRecord): Risk {
  return {
    id: String(r.ID),
    projectReference: str(r.Project_Name),
    riskNo: str(r.Risk_ID),
    description: str(r.Risk_Description),
    cause: richTextToPlain(str(r.Cause)).replace(/\s+/g, ' ').trim(),
    causeHtml: str(r.Cause),
    probability: str(r.Probability),
    impact: str(r.Impact),
    storedSeverity: str(r.Risk_Severity),
    storedScore: num(r.Risk_Score),
    owner: str(r.Risk_Owner),
    ownerId: ref(r.Risk_Owner)?.id ?? '',
    department: str(r.Department),
    departmentId: ref(r.Department)?.id ?? '',
    priority: str(r.Priority),
    status: str(r.Risk_Status),
    statusId: ref(r.Risk_Status)?.id ?? '',
  }
}

/** Rich text (Creator HTML) → plain text with line breaks. */
export function richTextToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Plain text → rich text for the Cause field (escaped, line breaks kept). */
export function plainToRichText(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc ? esc.split(/\r?\n/).join('<br>') : ''
}

export function toActivity(r: CreatorRecord): ActivityEntry {
  const [d = '', time = ''] = str(r.Changed_On).split(/\s+/)
  return {
    id: String(r.ID),
    module: str(r.Module),
    recordId: str(r.Record_ID),
    recordName: str(r.Record_Name),
    action: str(r.Action),
    field: str(r.Field_Name),
    oldValue: str(r.Old_Value),
    newValue: str(r.New_Value),
    by: str(r.Changed_By),
    at: fromCreatorDate(d),
    time,
  }
}

export function toBudgetReview(r: CreatorRecord): BudgetReviewRow {
  return { id: String(r.ID), category: str(r.Description), costPct: num(r.Cost), totalCost: num(r.Total_Cost), totalPrice: num(r.Total_price), profit: num(r.PROFIT), margin: num(r.MARGIN) }
}

export function toAttendee(r: CreatorRecord): MeetingAttendee {
  return { id: String(r.ID), userId: str(r.User_ID), userName: str(r.User_Name), attendance: str(r.Attendance) }
}
export function toOutsourced(r: CreatorRecord): OutsourcedContact {
  return {
    id: String(r.ID),
    name: [str(r.First_Name), str(r.Last_Name)].filter(Boolean).join(' '),
    type: str(r.Contact_Type),
    company: str(r.Company),
    email: str(r.Email),
    phone: str(r.Phone_Number),
    scope: str(r.Scope_of_Work),
    value: num(r.Sub_Contract_Value_Agreed),
  }
}
export function toContact(r: CreatorRecord): ProjectContact {
  return { id: String(r.ID), firstName: str(r.First_Name), lastName: str(r.Last_Name), email: str(r.Email), phone: str(r.Mobile), designation: str(r.Designation) }
}

export function toPlanMilestone(r: CreatorRecord): PlanMilestone {
  return {
    id: String(r.ID),
    no: str(r.Milestone_No),
    name: str(r.Milestone_Name),
    status: ref(r.Status),
    owner: ref(r.Owner),
    flag: str(r.Flag),
    startsAfterIn: str(r.Starts_After_In),
    startsAfter: num(r.Starts_after),
    duration: num(r.Duration),
  }
}

export function toTask(r: CreatorRecord): WorkTask {
  return {
    id: String(r.ID),
    name: str(r.Task_Name),
    type: str(r.Type_field),
    taskNo: str(r.Task_No),
    duration: num(r.Duration),
    createdBy: str(r.Added_User),
    description: str(r.Task_Description),
    priority: str(r.Priority),
    percent: num(r.Precent_Complete),
    workHours: num(r.Work_Hours),
    workPackage: str(r.Work_Package).trim(),
    startDate: fromCreatorDate(r.Task_Start_Date),
    endDate: fromCreatorDate(r.Task_End_Date),
    actualStart: fromCreatorDate(r.Actual_Start_Date),
    actualEnd: fromCreatorDate(r.Actual_Complete_Date),
    status: ref(r.Task_Status),
    parent: ref(r.Parent_Task),
    milestone: ref(r.Milestone),
    owners: refList(r.Owners),
    lineIds: ids(r.Work_Packages),
  }
}

export function toDetails(o: Record<string, unknown>): ProjectDetails {
  const c = (o.customer ?? {}) as Record<string, unknown>
  const w = (o.owner ?? {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  return {
    customer: c.ID ? { id: str(c.ID), name: str(c.Customer_Name), email: str(c.Email), phone: str(c.Phone_Number), mobile: str(c.Mobile), address: str(c.Address) } : null,
    contacts: list(o.contacts).map((x) => ({ id: str(x.ID), name: str(x.Name), email: str(x.Email), phone: str(x.Work_Phone), mobile: str(x.Mobile), designation: str(x.Designation) })),
    owner: w.ID ? { id: str(w.ID), name: str(w.Name), role: str(w.Role), email: str(w.Email) } : null,
    team: list(o.team).map((x) => ({ id: str(x.ID), name: str(x.Name), role: str(x.Role), projectRole: str(x.Project_Role), status: str(x.Status), rowId: str(x.Row_ID), roleId: str(x.Role_ID) })),
    stages: list(o.stages).map((x) => ({ id: str(x.ID), label: str(x.Status_Name), anytime: bool(x.anytime) })),
    taskOrder: Array.isArray(o.task_order) ? (o.task_order as unknown[]).map(str) : [],
    boqOrder: Array.isArray(o.boq_order) ? (o.boq_order as unknown[]).map(str) : [],
    // Everyone who can open the Project Widget page may edit (Creator's page permissions decide who gets in)
    canEdit: true,
    isAdmin: bool(o.is_admin),
    editReason: str(o.edit_reason),
    crmDealId: str(o.crm_deal_id),
    user: str(o.user),
  }
}

const monthMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, num(n)])) : {})

const EVENT_TYPES = ['milestone', 'task', 'po', 'dn', 'status'] as const
export function toTimelineEvent(e: Record<string, unknown>): TimelineEvent {
  const type = EVENT_TYPES.find((t) => t === str(e.type)) ?? 'task'
  return {
    type,
    name: str(e.name),
    date: fromCreatorDate(e.date),
    start: e.start ? fromCreatorDate(e.start) : undefined,
    no: e.no ? str(e.no) : undefined,
    by: str(e.by),
    status: str(e.status),
    vendor: e.vendor ? str(e.vendor) : undefined,
    total: e.total !== undefined ? num(e.total) : undefined,
    done: e.done === true || e.done === 'true',
  }
}

export function toDashboard(o: Record<string, unknown>): Dashboard {
  const rows = Array.isArray(o.records) ? (o.records as Record<string, unknown>[]) : []
  return {
    projects: rows.map((r) => ({
      id: str(r.ID),
      reference: str(r.Project_Reference),
      name: str(r.Project_Name),
      type: str(r.Type_of_Project),
      client: str(r.Client_Name),
      status: str(r.Project_Status),
      projectManager: str(r.Project_Manager),
      completionDate: fromCreatorDate(r.Project_Completion_Date),
      startDate: fromCreatorDate(r.Start_Date),
      value: num(r.Project_Value_PO),
      budget: num(r.Total_Budget_Cost),
      margin: num(r.Estimated_Margin),
      quote: num(r.Estimate_Value_Sub_Total),
      tasksTotal: num(r.tasks_total),
      tasksDone: num(r.tasks_done),
      tasksOverdue: num(r.tasks_overdue),
      tasksInProgress: num(r.tasks_in_progress),
      milestonesTotal: num(r.milestones_total),
      milestonesDone: num(r.milestones_done),
      milestonesDelayed: num(r.milestones_delayed),
      risksOpen: num(r.risks_open),
      risksCritical: num(r.risks_critical),
      linesTotal: num(r.lines_total),
      linesDelivered: num(r.lines_delivered),
      events: (Array.isArray(r.events) ? (r.events as Record<string, unknown>[]) : []).map(toTimelineEvent).filter((e) => e.date),
      statusHistory: parseStatusHistory(r.Status_History),
    })),
    stageOrder: Array.isArray(o.stage_order) ? (o.stage_order as unknown[]).map(str) : [],
    anytimeOrder: Array.isArray(o.anytime_order) ? (o.anytime_order as unknown[]).map(str) : [],
    tasksDueByMonth: monthMap(o.tasks_due_by_month),
    tasksDoneByMonth: monthMap(o.tasks_done_by_month),
    estimates: (Array.isArray(o.estimates) ? (o.estimates as Record<string, unknown>[]) : []).map((e) => ({
      id: str(e.ID),
      quoteNo: str(e.Quote_No),
      version: str(e.Version),
      reference: str(e.Project_Reference),
      status: str(e.Status),
      customer: str(e.Customer_Name),
      owner: str(e.Deal_Owner),
      dealStage: str(e.Deal_Stage),
      country: str(e.Country_Name),
      date: fromCreatorDate(e.Date_field),
      total: num(e.Total),
      projectId: str(e.project_id),
    })),
    user: str(o.user),
    usersTotal: num(o.users_total),
    usersActive: num(o.users_active),
    usersAssigned: num(o.users_assigned),
    teamAssignments: num(o.team_assignments),
  }
}

const errorText = (e: unknown): string => {
  if (e instanceof Error) return e.message
  const o = e as { responseText?: string; message?: string; description?: string } | undefined
  return String(o?.responseText ?? o?.message ?? o?.description ?? (typeof e === 'object' ? JSON.stringify(e) : e))
}

/** Custom API answer → the function's map. Creator wraps it as {code:3000, result:{…}}; result can be a JSON string. */
export function unwrapCustomApi(res: unknown): Record<string, unknown> {
  const r = (res ?? {}) as Record<string, unknown>
  let o: unknown = r.result !== undefined ? r.result : r.data !== undefined ? r.data : r
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o)
    } catch {
      o = { status: 'error', message: o }
    }
  }
  return (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
}

/** Purchase_Receive.Attachments: a list (Multiple files on), one path, or a comma list — one filepath each */
const attachmentsOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? str((x as Record<string, unknown>).filepath ?? (x as Record<string, unknown>).value ?? '') : str(x))) : str(v).split(/,(?=\s*\S)/))
    .map((x) => x.trim())
    .filter(Boolean)
const records = (body: Record<string, unknown>) => (Array.isArray(body.records) ? (body.records as CreatorRecord[]) : [])

/** Thrown when Creator answers NOT_FOUND (deleted project, wrong ID). */
export class NotFoundError extends Error {}

export function createZohoSource(sdk: CreatorSdk = window.ZOHO!.CREATOR!): DataSource {
  const safeDecode = (v: string) => {
    try {
      return decodeURIComponent(v)
    } catch {
      return v
    }
  }
  /** A file / image / signature value may come as a path, a download URL or an <img src="…"> tag: the URL inside it */
  const srcOf = (path: string) => path.match(/src\s*=\s*["']?([^"'\s>]+)/)?.[1] ?? path.trim()
  /** The stored file name (filepath=…), or '' when the value has none (signatures can be downloaded without it) */
  const fileNameOf = (path: string) => {
    const src = srcOf(path)
    const m = src.match(/[?&]filepath=([^"'&\s>]+)/)
    if (m) return safeDecode(m[1]!)
    return /[/<\s]/.test(src) ? '' : safeDecode(src)
  }
  /** The file's value as Creator's API gives it (/api/v2/<owner>/<app>/report/<report>/<id>/<field>/download?filepath=…) — what readFile takes */
  const apiFilePath = (report: string, id: string, field: string, path: string) => {
    if (/\/api\/v2\//.test(srcOf(path))) return srcOf(path)
    const file = fileNameOf(path)
    const app = CREATOR_FILES.base.replace(/^.*\/file\//, '')
    return `/api/v2/${app}/report/${report}/${id}/${field}/download?filepath=${encodeURIComponent(safeDecode(file))}`
  }
  /** The file itself: Creator readFile first; else Widget.project_console downloads it through the Creator API (works in a
   * development environment too, where plain file links find nothing) */
  const readCreatorFile = async (report: string, id: string, field: string, path: string) => {
    if (!path) return null
    const name = fileNameOf(path)
    if (sdk.FILE?.readFile) {
      const res = await sdk.FILE.readFile({
        ...(ZOHO_APP.appName ? { app_name: ZOHO_APP.appName } : {}),
        report_name: report,
        id,
        field_name: field,
        file_url: apiFilePath(report, id, field, path),
      }).catch(() => null)
      const blob = fileBlob(res, name)
      if (blob) return blob
    }
    const [row] = records(await call('projectConsole', { action: 'file', report, field, id, filepath: name }))
    const content = str(row?.Content).replace(/\s/g, '')
    return content ? fileBlob(`data:application/octet-stream;base64,${content}`, name) : null
  }
  const fileUrl = (report: string, id: string, field: string, path: string) => {
    const file = path.replace(/^.*[?&]filepath=/, '')
    return file ? `${CREATOR_FILES.base}/${report}/${encodeURIComponent(id)}/${field}/download?filepath=${encodeURIComponent(safeDecode(file))}` : ''
  }
  /** Calls a custom function through its Custom API — same call shape as the Cost Analysis widget. */
  async function call(apiKey: CustomApiKey, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const api = CUSTOM_APIS[apiKey]
    const action = String(params.action ?? params.source ?? apiKey)
    const value = JSON.stringify(params)
    let res: unknown
    try {
      const cfg = api.method === 'GET' ? { query_params: `${api.param}=${encodeURIComponent(value)}` } : { payload: { [api.param]: value } }
      res = await sdk.DATA.invokeCustomApi({ api_name: api.name, http_method: api.method, ...cfg })
    } catch (e) {
      console.error('[project-console]', api.fn, action, { params, error: e })
      throw new Error(`${api.name} (${action}): ${errorText(e)}`)
    }
    const body = unwrapCustomApi(res)
    if (body.status === 'success') return body
    console.error('[project-console]', api.fn, action, { params, response: res })
    if (body.code === 'NOT_FOUND') throw new NotFoundError(str(body.message) || 'Not found')
    // The function in Creator is older than the widget: say exactly what to update.
    if (/^Unknown action/i.test(str(body.message)))
      throw new Error(`${api.fn} in Creator does not support "${action}" yet — paste docs/creator/${api.fn}.dg into the function, save, then re-save the Custom API ${api.name}.`)
    throw new Error(str(body.message) || `${api.fn} (${action}): ${str(body.code) || 'unexpected response'}`)
  }
  const keyParams = (action: string, key: ProjectKey) => ({ action, project_id: key.id, estimate_id: key.estimateId ?? '', reference: key.reference ?? '' })
  const getRecord = async (id: string) => {
    const [row] = records(await call('projectConsole', { action: 'projects', project_id: id }))
    if (!row) throw new NotFoundError('Project not found')
    return row
  }

  return {
    kind: 'zoho',
    async getContext() {
      const p = (await sdk.UTIL.getInitParams?.().catch(() => undefined)) ?? {}
      const env = /environment\/([^/]+)/.exec(p.envUrlFragment ?? '')?.[1]
      return { scope: p.scope, app: p.appLinkName, environment: env ?? 'production' }
    },
    async getPageParams() {
      const out: Record<string, string> = {}
      for (const get of [sdk.UTIL.getWidgetParams, sdk.UTIL.getQueryParams]) {
        const p = (await get?.call(sdk.UTIL).catch(() => undefined)) ?? {}
        for (const [k, v] of Object.entries(p)) if (v != null && v !== '') out[k] = String(v)
      }
      return out
    },
    navigate(hash) {
      if (sdk.UTIL.navigateParentUrl) sdk.UTIL.navigateParentUrl(hash)
      else sdk.UTIL.navigateParentURL?.({ action: 'open', url: hash, window: 'same' })
    },
    async getDashboard() {
      return toDashboard(await call('projectDashboard', { action: 'dashboard' }))
    },
    async listProjects() {
      return records(await call('projectConsole', { action: 'projects' })).map(toProject)
    },
    async getProject(id) {
      return toProject(await getRecord(id))
    },
    async getProjectDetails(id) {
      return toDetails(await call('projectDetails', { project_id: id }))
    },
    getProjectRecord: getRecord,
    async updateProject(id, data, reason) {
      await call('projectUpdate', { project_id: id, data, reason: reason ?? '' })
    },
    async listCostingLines(key) {
      return records(await call('projectConsole', keyParams('costing_lines', key))).map(toCostingLine)
    },
    async listBoq(key) {
      return records(await call('projectConsole', keyParams('boq', key))).map(toBoqLine)
    },
    async listPurchaseOrders(projectId, poNumbers) {
      const unique = [...new Set(poNumbers.filter(Boolean))]
      return records(await call('projectConsole', { action: 'purchase_orders', project_id: projectId, po_numbers: unique })).map(toPurchaseOrder)
    },
    async listDeliveryNotes(projectId) {
      return records(await call('projectConsole', { action: 'delivery_notes', project_id: projectId })).map(toDeliveryNote)
    },
    async listGoodsReceipts(purchaseOrderIds) {
      const list = [...new Set(purchaseOrderIds.filter(isId))]
      return list.length ? records(await call('projectConsole', { action: 'purchase_receives', po_ids: list })).map(toGoodsReceipt) : []
    },
    async listOpenDeals(page, search) {
      const body = await call('dealEstimate', { action: 'list', page, search })
      const deal = (d: Record<string, unknown>) => ({
        id: str(d.id),
        name: str(d.name),
        account: str(d.account),
        stage: str(d.stage),
        reference: str(d.reference),
        amount: num(d.amount),
        closing: str(d.closing),
        ...(str(d.quote_id) ? { quoteId: str(d.quote_id) } : {}),
      })
      const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []).map(deal)
      return { deals: list(body.deals), more: bool(body.more), existing: list(body.existing) }
    },
    async createDealEstimate(dealId) {
      const body = await call('dealEstimate', { action: 'create', deal_id: dealId })
      return { id: str(body.id), existing: bool(body.existing), warning: str(body.Warning) }
    },
    async listTaskCollab(taskId) {
      const body = await call('taskCollab', { action: 'list', task_id: taskId })
      const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
      return {
        notes: list(body.notes).map((n) => ({ id: str(n.ID), comment: str(n.Comment), author: str(n.Author), addedTime: str(n.Added_Time), replyTo: str(n.Reply_To) })),
        files: list(body.files).map((f) => ({ id: str(f.ID), name: str(f.File_Name) || 'File', path: str(f.File), noteId: str(f.Note) })),
      }
    },
    async addTaskNote({ taskId, comment, replyTo, fileNames, filesOnly }) {
      const body = await call('taskCollab', { action: filesOnly ? 'add_files' : 'add_note', task_id: taskId, comment, reply_to: replyTo, files: fileNames })
      return { id: str(body.id), fileIds: (Array.isArray(body.File_IDs) ? body.File_IDs : []).map((x) => String(x)) }
    },
    async uploadTaskFile(fileId, file) {
      if (!sdk.FILE?.uploadFile) throw new Error('This Creator page has no file upload API (widget SDK v2 needed)')
      const res = await sdk.FILE.uploadFile({ ...(ZOHO_APP.appName ? { app_name: ZOHO_APP.appName } : {}), report_name: REPORTS.taskFiles, id: fileId, field_name: TASK_FILE_FIELD, file })
      const code = (res as { code?: unknown } | undefined)?.code
      if (code !== undefined && Number(code) !== 3000) throw new Error(`Creator did not store the file (${errorText(res)})`)
    },
    async deleteTaskFile(taskId, fileId) {
      await call('taskCollab', { action: 'delete_file', task_id: taskId, file_id: fileId })
    },
    async readTaskFile({ id, path }) {
      return readCreatorFile(REPORTS.taskFiles, id, TASK_FILE_FIELD, path)
    },
    taskFileUrl({ id, path }) {
      return fileUrl(REPORTS.taskFiles, id, TASK_FILE_FIELD, path)
    },
    async listPoPayments(purchaseOrderIds) {
      const list = [...new Set(purchaseOrderIds.filter(isId))]
      return list.length
        ? records(await call('projectConsole', { action: 'po_payments', po_ids: list })).map((r) => ({
            id: String(r.ID),
            purchaseOrderId: str(r.Purchase_Order),
            date: fromCreatorDate(r.Payment_Date),
            amount: num(r.Amount),
            reference: str(r.Reference_No),
            note: str(r.Payment_Note),
            booksNo: str(r.Books_No),
          }))
        : []
    },
    async addPoPayment(input) {
      const body = await call('poPaymentSave', { action: 'add', po_id: input.poId, date: toCreatorDate(input.date), amount: input.amount.toFixed(2), reference: input.reference, note: input.note })
      return { id: str(body.id) }
    },
    async deletePoPayment(paymentId) {
      await call('poPaymentSave', { action: 'delete', payment_id: paymentId })
    },
    async receiveGoods(input) {
      const body = await call('purchaseReceive', {
        po_id: input.poId,
        receive_date: input.date ? toCreatorDate(input.date) : '',
        supplier_dn: input.supplierDn,
        notes: input.notes,
        site_received_by: input.siteReceivedBy,
        lines: input.lines.map((l) => ({
          line_id: l.lineId,
          quantity: l.quantity,
          warehouse_id: l.warehouseId,
          places: l.places.map((x) => ({ rack_id: x.rackId, segment_id: x.segmentId, position: x.position, position_note: x.positionNote, quantity: x.quantity })),
          serials: l.serials.map((u) => ({
            serial_no: u.serialNo,
            mac: u.mac,
            warranty_months: u.warrantyMonths ?? '',
            warranty_start: u.warrantyStart ? toCreatorDate(u.warrantyStart) : '',
            place: u.place ?? '',
          })),
        })),
      })
      return {
        id: str(body.id),
        prNo: str(body.PR_No),
        booksSynced: bool(body.Books_Synced),
        booksMessage: str(body.Books_Message),
        storageMessage: str(body.Storage_Message),
        warning: str(body.Warning),
        deliveryNoteNo: str(body.Delivery_Note_No),
        siteMessage: str(body.Site_Message),
      }
    },
    async uploadReceiptFile(receiptId, file) {
      if (!sdk.FILE?.uploadFile) throw new Error('This Creator page has no file upload API (widget SDK v2 needed)')
      const res = await sdk.FILE.uploadFile({ ...(ZOHO_APP.appName ? { app_name: ZOHO_APP.appName } : {}), report_name: REPORTS.purchaseReceives, id: receiptId, field_name: 'Attachments', file })
      const code = (res as { code?: unknown } | undefined)?.code
      if (code !== undefined && Number(code) !== 3000) throw new Error(`Creator did not store the file (${errorText(res)})`)
    },
    receiptFileUrl({ id, path }) {
      return fileUrl(REPORTS.purchaseReceives, id, 'Attachments', path)
    },
    async readReceiptFile({ id, path }) {
      return readCreatorFile(REPORTS.purchaseReceives, id, 'Attachments', path)
    },
    async retryBooksSync(kind, id) {
      const body = await call('purchaseDelivery', { action: 'books_sync', kind, id })
      return { no: str(body.No), booksSynced: bool(body.Books_Synced) }
    },
    async createDeliveryNote(input) {
      const body = await call('purchaseDelivery', {
        action: 'create',
        project_id: input.projectId,
        dn_date: input.date ? toCreatorDate(input.date) : '',
        challan_type: input.challanType,
        warehouse_id: input.warehouseId,
        reference: input.reference,
        notes: input.notes,
        source_of_supply: input.sourceOfSupply ?? '',
        lines: input.lines.map((l) => ({ line_id: l.lineId, quantity: l.quantity, division: l.division ?? '' })),
      })
      return { id: str(body.id), dnNo: str(body.DN_No) }
    },
    async uploadDeliveryNoteFile(dnId, file) {
      if (!sdk.FILE?.uploadFile) throw new Error('This Creator page has no file upload API (widget SDK v2 needed)')
      const res = await sdk.FILE.uploadFile({ ...(ZOHO_APP.appName ? { app_name: ZOHO_APP.appName } : {}), report_name: REPORTS.deliveryNotes, id: dnId, field_name: 'Attachments', file })
      const code = (res as { code?: unknown } | undefined)?.code
      if (code !== undefined && Number(code) !== 3000) throw new Error(`Creator did not store the file (${errorText(res)})`)
    },
    deliveryNoteFileUrl({ id, path }) {
      return fileUrl(REPORTS.deliveryNotes, id, 'Attachments', path)
    },
    async readDeliveryNoteFile({ id, path }) {
      return readCreatorFile(REPORTS.deliveryNotes, id, 'Attachments', path)
    },
    async updateDeliveryNote(input) {
      const body = await call('purchaseDelivery', {
        action: 'status',
        dn_id: input.dnId,
        status_index: input.statusIndex,
        delivered_date: input.deliveredDate ? toCreatorDate(input.deliveredDate) : '',
        received_by: input.receivedBy,
        vehicle_no: input.vehicleNo,
        driver_name: input.driverName,
      })
      return { status: str(body.Status), booksSynced: bool(body.Books_Synced) }
    },
    async deliveryNotePrint(dnId) {
      const body = await call('purchaseDelivery', { action: 'print', dn_id: dnId })
      const o = (body.Organization ?? {}) as Record<string, unknown>
      const c = (body.Customer ?? {}) as Record<string, unknown>
      const lines = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
      return {
        organization: { name: str(o.Name), address: lines(o.Address), phone: str(o.Phone), email: str(o.Email), website: str(o.Website), taxLabel: str(o.Tax_Label), taxValue: str(o.Tax_Value) },
        customer: str(c.Name)
          ? {
              name: str(c.Name),
              attention: str(c.Attention),
              address: lines(c.Address),
              shipAttention: str(c.Ship_Attention),
              shipAddress: lines(c.Ship_Address),
              trn: str(c.TRN),
              phone: str(c.Phone),
              mobile: str(c.Mobile),
              email: str(c.Email),
            }
          : null,
        projectReference: str(body.Project_Reference),
      }
    },
    async listPoLines(purchaseOrderIds) {
      const list = [...new Set(purchaseOrderIds.filter(isId))]
      return list.length ? records(await call('projectConsole', { action: 'po_lines', po_ids: list })).map(toPoLine) : []
    },
    async listPaymentMilestones(key) {
      return records(await call('projectConsole', keyParams('milestones', key))).map(toMilestone)
    },
    async listBudgetReview(key) {
      return records(await call('projectConsole', keyParams('budget_review', key))).map(toBudgetReview)
    },
    async listAttendees(projectId) {
      return records(await call('projectConsole', { action: 'attendees', project_id: projectId })).map(toAttendee)
    },
    async saveAttendance(projectId, userId, attendance) {
      const body = await call('projectTaskUpdate', { project_id: projectId, action: 'save_attendance', data: { User_ID: userId, Attendance: attendance } })
      return { id: str(body.id) }
    },
    async listOutsourcedContacts(projectId) {
      return records(await call('projectConsole', { action: 'outsourced', project_id: projectId })).map(toOutsourced)
    },
    async listProjectContacts(projectId) {
      return records(await call('projectConsole', { action: 'contacts', project_id: projectId })).map(toContact)
    },
    async saveProjectContact(projectId, contactId, data) {
      const body = await call('projectTaskUpdate', {
        project_id: projectId,
        action: 'save_contact',
        contact_id: contactId ?? '',
        data: { First_Name: data.firstName, Last_Name: data.lastName, Email: data.email, Mobile: data.phone, Designation: data.designation },
      })
      return { id: str(body.id) }
    },
    async uploadProjectFile(projectId, file, field = 'PO_Document') {
      if (!sdk.FILE?.uploadFile) throw new Error('This Creator page has no file upload API (widget SDK v2 needed)')
      const res = await sdk.FILE.uploadFile({ ...(ZOHO_APP.appName ? { app_name: ZOHO_APP.appName } : {}), report_name: REPORTS.projects, id: projectId, field_name: field, file })
      const code = (res as { code?: unknown } | undefined)?.code
      if (code !== undefined && Number(code) !== 3000) throw new Error(`Creator did not store the file (${errorText(res)})`)
    },
    projectFileUrl(projectId, path, field = 'PO_Document') {
      return fileUrl(REPORTS.projects, projectId, field, path)
    },
    async readProjectFile(projectId, path, field = 'PO_Document') {
      return readCreatorFile(REPORTS.projects, projectId, field, path)
    },
    async saveTaskListItem(item) {
      const r = await call('projectUpdate', { action: 'task_list_item', data: { ID: item.id ?? '', Task_Name: item.name, Status: item.active ? 'Active' : 'Inactive' } })
      return { id: str((r as Record<string, unknown>).id) }
    },
    async listTasks(projectId) {
      return records(await call('projectConsole', { action: 'tasks', project_id: projectId })).map(toTask)
    },
    async listRisks(projectId) {
      return records(await call('projectConsole', { action: 'risks', project_id: projectId })).map(toRisk)
    },
    async listPlanMilestones(projectId) {
      return records(await call('projectConsole', { action: 'plan_milestones', project_id: projectId })).map(toPlanMilestone)
    },
    async saveRisk(projectId, riskId, data) {
      const r = await call('projectRiskSave', { project_id: projectId, risk_id: riskId ?? '', data })
      return { id: str((r as Record<string, unknown>).ID) }
    },
    async listActivity(projectId, recordId) {
      try {
        // one log record per project (subform rows, oldest first) plus older one-change records: newest first
        return records(await call('projectConsole', { action: 'activity', project_id: projectId, record_id: recordId ?? '' }))
          .map(toActivity)
          .sort((a, b) => `${b.at} ${b.time}`.localeCompare(`${a.at} ${a.time}`))
      } catch (e) {
        // Older project_console (no Activity_Stream form yet): a set-up notice, not an error
        if (/does not support "activity"/.test(errorText(e))) throw new NotConfiguredError('The Activity Stream')
        throw e
      }
    },
    async updateMilestone(projectId, milestoneId, data) {
      await call('projectTaskUpdate', { project_id: projectId, milestone_id: milestoneId, data })
    },
    async updateBoq(projectId, boqId, data) {
      await call('projectTaskUpdate', { project_id: projectId, boq_id: boqId, data })
    },
    async updateTask(projectId, taskId, data) {
      await call('projectTaskUpdate', { project_id: projectId, task_id: taskId, data })
    },
    async createMilestone(projectId, input) {
      const body = await call('projectTaskUpdate', {
        project_id: projectId,
        action: 'create_milestone',
        data: { Milestone_Name: input.name, Starts_after: input.startsAfter, Starts_After_In: input.startsAfterIn, Duration: input.duration },
      })
      return { id: str(body.id) }
    },
    async createTask(projectId, input) {
      const body = await call('projectTaskUpdate', {
        project_id: projectId,
        action: 'create_task',
        parent_id: input.parentId ?? '',
        milestone_id: input.milestoneId ?? '',
        data: {
          Task_Name: input.name,
          Task_Start_Date: input.startDate ? toCreatorDate(input.startDate) : '',
          Task_End_Date: input.endDate ? toCreatorDate(input.endDate) : '',
        },
      })
      return { id: str(body.id) }
    },
    async updateAssetLine(projectId, lineId, data) {
      await call('projectTaskUpdate', { project_id: projectId, line_id: lineId, data })
    },
    async createPurchaseOrder(input) {
      const body = await call('projectCreatePo', {
        project_id: input.projectId,
        vendor_id: input.vendorId,
        country_id: input.countryId,
        date: input.date ? toCreatorDate(input.date) : '',
        delivery_date: input.deliveryDate ? toCreatorDate(input.deliveryDate) : '',
        reference: input.reference,
        notes: input.notes,
        terms: input.terms ?? '',
        terms_days: input.termsDays ?? '',
        warehouse_id: input.warehouseId ?? '',
        po_id: input.poId ?? '',
        discount: input.discount,
        mode_of_transit: input.modeOfTransit ?? '',
        eta: input.eta ? toCreatorDate(input.eta) : '',
        lines: input.lines.map((l) => ({
          boq_id: l.boqId,
          product_id: l.productId,
          line_id: l.lineId ?? '',
          description: l.description,
          quantity: l.quantity,
          rate: l.rate,
          tax_id: l.taxId,
          division: l.division,
        })),
      })
      return { id: str(body.id), poNo: str(body.PO_No), booksSynced: bool(body.Books_Synced), booksMessage: str(body.Books_Message), addedToExisting: bool(body.Added_To_Existing) }
    },
    async listOptions(source: LookupSource) {
      return records(await call('projectOptions', { source: source.key }))
        .map((r) => ({
          id: String(r.ID),
          label: str(r.label),
          ...(r.email !== undefined ? { email: str(r.email), phone: str(r.phone), division: str(r.division) } : {}),
          ...(r.parent !== undefined ? { parent: str(r.parent) } : {}),
          ...(r.free !== undefined ? { free: num(r.free) } : {}),
          ...(r.capacity !== undefined ? { capacity: num(r.capacity), bay: str(r.bay), level: str(r.level), side: str(r.side), pallet: str(r.pallet), path: str(r.path) } : {}),
          ...(r.active !== undefined ? { active: bool(r.active) } : {}),
          ...(r.index !== undefined ? { index: num(r.index) } : {}),
          ...(r.order !== undefined ? { order: num(r.order) } : {}),
        }))
        .filter((o) => o.label)
        .sort((a, b) => (source.key === 'vendors' ? a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }) : 0))
    },
  }
}
