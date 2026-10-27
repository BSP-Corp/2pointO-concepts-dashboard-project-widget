// Domain model of the project console, aligned with the 2Point0concepts.ds forms.
// Names here are app-level; the mapping to Creator field link names lives in src/config/zoho.ts.

/** A lookup value as Creator returns it: record ID + its display value. */
export interface Ref {
  id: string
  label: string
}

/** A Creator record as returned by the Widget SDK (field link name → value). Used by the edit form. */
export type CreatorRecord = Record<string, unknown> & { ID: string }

export interface ProjectBudget {
  hardware: number
  software: number
  outsourcedServices: number
  logistics: number
  point0Services: number
  estimatedMargin: number
  totalBudgetCost: number
}

/** form Project */
export interface Project {
  id: string
  reference: string
  name: string
  client: string
  status: string
  type: string
  countries: string[]
  currency: string
  city: string
  state: string
  address: string
  description: string
  startDate: string // ISO yyyy-mm-dd ('' when empty)
  completionDate: string
  actualCompletionDate: string
  projectManager: string
  clientPoNo: string
  projectValuePo: number
  /** Accepted_Estimate → Estimate record; links the project to its cost lines, BOQ and the Cost Analysis page. */
  acceptedEstimate: Ref | null
  projectNo: string
  /** Project.Status_History, oldest first */
  statusHistory: StatusChange[]
  datePoReceived: string
  estimateValueSubTotal: number
  salesOrderNo: string
  budget: ProjectBudget
}

/** What child queries need to find a project's records (they link via Project, Accepted_Estimate or reference). */
export interface ProjectKey {
  id: string
  estimateId?: string
  reference?: string
}

/** form Costing_Lineitem — cost line + asset & network register (Excel: PM Tracker & Asset Register). */
export interface CostingLine {
  id: string
  workPackage: string
  vendor: string
  category: string
  type: string
  brand: string
  sku: string
  model: string
  description: string
  uom: string
  quantity: number
  totalCost: number
  totalPrice: number
  totalProfit: number
  deliveryStatus: string
  installationStatus: string
  notes: string
  serialNumber: string
  macControl: string
  macDante: string
  warrantyStart: string
  warrantyEnd: string
  provision: string
  outletGop: string
  networked: boolean
  switchRef: string
  portNo: string
  poe: string
  vlan: string
  ipAddress: string
  subnetMask: string
  hostName: string
  gateway: string
  dns1: string
  dns2: string
}

/** form BOQ */
export interface BoqLine {
  id: string
  workPackage: string
  vendor: string
  /** Vendors lookup (record ID) */
  vendorId: string
  category: string
  type: string
  brand: string
  sku: string
  model: string
  description: string
  uom: string
  quantity: number
  warranty: string
  status: string
  statusId: string
  /** Product record of the BOQ SKU (PO line Item_Name). */
  productId: string
  /** Approved estimate lines (Costing_Lineitem IDs) behind this BOQ row. */
  lineIds: string[]
  poDate: string
  po: string
  modeOfTransit: string
  eta: string
  deliveredToWarehouse: string // "Yes" | "No" | ''
  dateDeliveredToWarehouse: string
  deliveredToCustomer: string
  dateDeliveredToCustomer: string
}

/** form Purchase_Order */
export interface PurchaseOrder {
  id: string
  poNo: string
  vendor: string
  date: string
  reference: string
  deliveryDate: string
  subTotal: number
  discount: number
  totalCost: number
  boqIds: string[]
  booksSynced: boolean
  /** Added_User — who raised the PO */
  issuedBy: string
  status: string
}

/** form PO_Line_Items */
export interface PoLine {
  id: string
  purchaseOrderId: string
  itemId: string
  item: string
  description: string
  quantity: number
  rate: number
  amount: number
  quantityReceived: number
  quantityToBeReceived: number
  received: boolean
}

/** form Payment_Milestone */
export interface PaymentMilestone {
  id: string
  name: string
  amount: number
  percentage: number
  terms: string
}

/** form Project_Risk (Risk Register). Severity / score are always recomputed from Probability × Impact. */
export interface Risk {
  id: string
  /** Project_Name lookup → Project (display Project_Reference) */
  projectReference: string
  riskNo: string
  description: string
  /** Plain text of the Cause rich-text field */
  cause: string
  /** Cause as stored (rich text HTML) */
  causeHtml: string
  probability: string
  impact: string
  /** Stored values on the record (shown flagged when they differ from the calculation) */
  storedSeverity: string
  storedScore: number
  owner: string
  ownerId: string
  department: string
  departmentId: string
  priority: string
  status: string
  statusId: string
}

/** form Milestone (Project lookup): planned milestone of the project */
export interface PlanMilestone {
  id: string
  no: string
  name: string
  status: Ref | null
  owner: Ref | null
  flag: string
  /** "Days" | "Weeks" | "Months" */
  startsAfterIn: string
  startsAfter: number
  /** Milestone.Duration in days */
  duration: number
  /** Task_List → Administration_Milestone_project_Template (display Task_Name) = the name of its task list (root Task) */
  taskList: string
  /** Task_List record ID (Administration_Milestone_project_Template) */
  taskListId: string
}

/** One line of Project.Status_History: "dd-MMM-yyyy HH:mm:ss | Status | User | Reason" */
export interface StatusChange {
  at: string // ISO date
  time: string
  status: string
  user: string
  reason: string
}

/** One option of a lookup in the edit form. */
export interface Option {
  id: string
  label: string
  /** Vendors only: contact email / phone */
  email?: string
  phone?: string
}

/**
 * form Task — Type_field "Task" or "Work Package"; linked to the project by Project_Name.
 * Hierarchy (Tasks.Create_Project_Tasks): a Task without Parent_Task is a task list; its children are tasks, theirs subtasks.
 */
export interface WorkTask {
  id: string
  name: string
  type: 'Task' | 'Work Package' | string
  taskNo: string
  /** Duration in days (start and due date included) */
  duration: number
  /** Added_User */
  createdBy: string
  description: string
  priority: string
  percent: number
  workHours: number
  workPackage: string
  startDate: string
  endDate: string
  actualStart: string
  actualEnd: string
  status: Ref | null
  parent: Ref | null
  owners: Ref[]
  lineIds: string[]
}

export interface TeamMember {
  id: string
  name: string
  /** Users.Role */
  role: string
  /** Project Team grid → Roles.Role */
  projectRole: string
  status: string
}

/** Widget.project_details */
export interface ProjectDetails {
  customer: { id: string; name: string; email: string; phone: string; mobile: string; address: string } | null
  contacts: { id: string; name: string; email: string; phone: string; mobile: string; designation: string }[]
  owner: { id: string; name: string; role: string; email: string } | null
  team: TeamMember[]
  /** Pipeline in the static order (Widget.status_order); id = Status record ("" when none has that name) */
  stages: (Ref & { anytime: boolean })[]
  /** Static task / BOQ status orders */
  taskOrder: string[]
  boqOrder: string[]
  canEdit: boolean
  isAdmin: boolean
  /** Why the user may only view (empty when canEdit) */
  editReason: string
  /** Logged-in user's name */
  user: string
}

/** Widget.project_dashboard — one row per project (aggregate counts). */
export interface DashboardProject {
  id: string
  reference: string
  name: string
  type: string
  client: string
  status: string
  projectManager: string
  completionDate: string
  value: number
  budget: number
  margin: number
  /** Estimate_Value_Sub_Total — the quoted value */
  quote: number
  startDate: string
  tasksTotal: number
  tasksDone: number
  tasksOverdue: number
  tasksInProgress: number
  milestonesTotal: number
  milestonesDone: number
  milestonesDelayed: number
  risksOpen: number
  risksCritical: number
  linesTotal: number
  linesDelivered: number
}

/** "Go To" entry: latest estimate version; projectId when an approved project exists for it. */
export interface GoToEstimate {
  id: string
  quoteNo: string
  version: string
  reference: string
  status: string
  customer: string
  owner: string
  dealStage: string
  country: string
  date: string
  total: number
  projectId: string
}

export interface Dashboard {
  projects: DashboardProject[]
  /** Project lifecycle stages in the static order (Widget.status_order) */
  stageOrder: string[]
  /** Tasks due / completed per month ("yyyy-MM"), all projects */
  tasksDueByMonth: Record<string, number>
  tasksDoneByMonth: Record<string, number>
  estimates: GoToEstimate[]
  /** Logged-in user's name */
  user: string
  usersTotal: number
  usersActive: number
  usersAssigned: number
  teamAssignments: number
}

export interface PurchaseOrderInput {
  projectId: string
  vendorId: string
  countryId: string
  date: string // ISO
  deliveryDate: string
  reference: string
  notes: string
  discount: number
  /** Payment terms in days (written into Terms & Conditions) */
  termsDays?: number
  /** Ship-to: Warehouse record */
  warehouseId?: string
  terms?: string
  /** lineId = the approved Cost Analysis line (PO_Line_Items.Estimate_Line_ID) */
  lines: { boqId: string; productId: string; lineId?: string; description: string; quantity: number; rate: number; taxId: string }[]
}

/** Activity_Stream record: one changed field (or "created") of a Project / Milestone / Task / BOQ / Risk record. */
export interface ActivityEntry {
  id: string
  module: string
  recordId: string
  recordName: string
  action: string
  field: string
  oldValue: string
  newValue: string
  by: string
  /** ISO date */
  at: string
  /** HH:mm:ss */
  time: string
}
