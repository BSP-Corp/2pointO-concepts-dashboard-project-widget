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
  /** Vendors / Country / Warehouse record IDs (add to an existing PO of the same vendor) */
  vendorId: string
  countryId: string
  warehouseId: string
  terms: string
  notes: string
  /** Purchase_Order.PR_All_Received — every line received */
  prAllReceived: boolean
}

/** form PO_Line_Items */
export interface PoLine {
  id: string
  /** Reporting tag (PO_Line_Items.Division) */
  division: string
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
  /** BOQ lookup of the line ('' on lines raised before the field existed) */
  boqId: string
  /** Estimate_Line_ID → Costing_Lineitem */
  lineId: string
  /** Delivery note quantities: delivered on closed DNs, on the open DN */
  alreadyDelivered: number
  qtyToDeliver: number
  wpId: string
  /** Store_Warehouse name of the last put-away */
  storeWarehouse: string
  /** Delivery_Note the line is on (open or the last delivered one) */
  deliveryNote: { id: string; no: string; status: string } | null
  /** Quantity on open delivery notes (Delivery.Open_Reserved — DN items are copies of the line) */
  reservedQty: number
  /** Where the received units still in stock are (Storage rows of its Purchase Receives): warehouse · rack · bay · position */
  stockLocations: StockPlace[]
  /** Default vendor warranty of the product, in months (Product.Warranty is in years) */
  warrantyMonths: number
}

/** One Storage row of a received line still holding stock */
export interface StockPlace {
  /** Storage record ('' on older data) */
  id: string
  label: string
  qty: number
  /** Purchase Receive number (Books number when synced) */
  prNo: string
  warehouse: string
  /** Rack · bay · position */
  location: string
  serials: string[]
  /** Receive date (ISO) */
  received: string
  status: string
  /** Pallet position parts (form Bay): rack code, bay letter, level, side, pallet code */
  rack: string
  bay: string
  level: string
  side: string
  pallet: string
}

/** One storage row of a receipt line: its pallet position and quantity */
export interface ReceiptPlace {
  id: string
  label: string
  qty: number
  rack: string
  bay: string
  level: string
  side: string
  pallet: string
}

/** form Delivery_Note — Status index: Draft 1, Ready 68, Dispatched 69, Partially Delivered 18, Delivered 67, Cancelled 48 */
export interface DeliveryNote {
  id: string
  no: string
  date: string
  status: string
  statusIndex: number
  reference: string
  challanType: string
  warehouse: string
  vehicleNo: string
  driverName: string
  receivedBy: string
  deliveredDate: string
  notes: string
  total: number
  booksId: string
  /** Delivery_Note.Attachments: the note's files */
  files: ReceiptFile[]
  /** Lines; prNo / locations = the Purchase Receive the stock came from and its storage (warehouse · rack · bay) */
  lines: { id: string; quantity: number; amount: number; description: string; prNo: string; locations: string[] }[]
}

/** form Purchase_Receive with its received line copies (PO_Line_Items is_PR) */
export interface GoodsReceipt {
  id: string
  no: string
  date: string
  purchaseOrderId: string
  poNo: string
  vendor: string
  notes: string
  booksId: string
  /** Purchase_Receive.Attachments — a File upload field with Multiple files on (up to 10): one entry per file */
  files: ReceiptFile[]
  /** Purchase_Receive.Delivery_Note: the delivery note that took this receipt's goods */
  deliveryNote: { id: string; no: string; date: string; status: string; deliveredDate: string; receivedBy: string } | null
  lines: {
    id: string
    parentLineId: string
    item: string
    quantity: number
    warehouse: string
    rack: string
    segment: string
    position: string
    positionNote: string
    serials: number
    serialNos: string[]
    /** Location_Label of each storage row (one per put-away split) */
    locations: string[]
    /** Storage rows with their pallet position */
    places: ReceiptPlace[]
    /** GRN_Serial rows: serial and the storage row it sits in */
    units: { serialNo: string; mac: string; status: string; storageId: string }[]
    directToSite: boolean
  }[]
}

/** Exact place inside a bay (Storage.Position) */
export const POSITIONS = ['Centre', 'Left', 'Right', 'Top', 'Other'] as const
/** One received unit: its GRN_Serial row */
export interface ReceivedUnit {
  serialNo: string
  mac: string
  /** Vendor warranty (GRN_Serial.Warranty_Months / Warranty_Start; Warranty_End = start + months) */
  warrantyMonths?: string
  warrantyStart?: string
  /** Index of the put-away split the unit is stored in */
  place?: number
}

/** One put-away split of a received line: its bay and quantity */
export interface ReceivePlace {
  rackId: string
  /** Bay record (form Bay) */
  segmentId: string
  position: string
  positionNote: string
  quantity: number
}

/** A Zoho CRM deal without a cost analysis yet (Deals.Quote_ID empty) */
export interface OpenDeal {
  id: string
  name: string
  account: string
  stage: string
  reference: string
  amount: number
  closing: string
  /** Search results only: the cost analysis (Estimate ID) this deal already has */
  quoteId?: string
}

/** form Payment_Made: one payment to the vendor against a purchase order */
export interface PoPayment {
  id: string
  purchaseOrderId: string
  date: string
  amount: number
  reference: string
  note: string
  /** Payment_Made_Books_No — set once Zoho Books has it ('' while it lives in Creator only) */
  booksNo: string
}

/** form Task_Note: a comment on a task, or a reply to one (Reply_To) */
export interface TaskNote {
  id: string
  comment: string
  author: string
  /** "dd-MMM-yyyy HH:mm:ss" as Creator returns it */
  addedTime: string
  replyTo: string
}

/** form Task_File: a file of a task ('' noteId) or attached to one of its comments */
export interface TaskFile {
  id: string
  name: string
  /** Upload-file field value ('' while the upload has not finished) */
  path: string
  noteId: string
}

/** One file of Purchase_Receive.Attachments */
export interface ReceiptFile {
  /** The receipt's record ID (downloads go through the receipt record) */
  id: string
  name: string
  /** filepath of the file in the field */
  path: string
}

export interface ReceiveInput {
  poId: string
  date: string // ISO
  supplierDn: string
  notes: string
  /** Direct to site: who received the goods at site (the delivered delivery note needs it) */
  siteReceivedBy: string
  lines: {
    lineId: string
    quantity: number
    warehouseId: string
    /** Put-away splits (warehouse only) — their quantities add up to the quantity received */
    places: ReceivePlace[]
    /** One per unit received (blank serials allowed only when the whole line has none) */
    serials: ReceivedUnit[]
  }[]
}

export interface DeliveryNoteInput {
  projectId: string
  date: string // ISO
  challanType: string
  warehouseId: string
  reference: string
  notes: string
  /** Emirate / GCC country picked when the customer's Place of Supply does not give one ('' = from the customer) */
  sourceOfSupply?: string
  /** division = the line's reporting tag (PO_Line_Items.Division of the note's line) */
  lines: { lineId: string; quantity: number; division?: string }[]
}

export const DN_STATUS = { draft: 1, ready: 68, dispatched: 69, partial: 18, delivered: 67, cancelled: 48 } as const

/** Header of a printed delivery note: the selling organization (Zoho Books, by the note's country) and the customer */
export interface DeliveryNotePrintInfo {
  organization: { name: string; address: string[]; phone: string; email: string; website: string; taxLabel: string; taxValue: string }
  customer: { name: string; attention: string; address: string[]; shipAttention: string; shipAddress: string[]; trn: string; phone: string; mobile: string; email: string } | null
  projectReference: string
}

export interface DeliveryStatusInput {
  dnId: string
  statusIndex: number
  deliveredDate: string // ISO
  receivedBy: string
  vehicleNo: string
  driverName: string
}

/** form Payment_Milestone */
export interface PaymentMilestone {
  id: string
  name: string
  amount: number
  percentage: number
  terms: string
}

/** form Contact_Persons — a client-side contact of the project (Project.Contact_Persons, "Client Side Contact List") */
/** Meeting_Attendee row of the project (2point0 Meeting Attendees): one employee and whether they were present */
export interface MeetingAttendee {
  id: string
  userId: string
  userName: string
  /** 'Present' | 'Absent' | '' */
  attendance: string
}

/** Project_Contact row (2point0 Outsourced Services & Software Contact List) */
export interface OutsourcedContact {
  id: string
  name: string
  type: string
  company: string
  email: string
  phone: string
  scope: string
  value: number
}

export interface ProjectContact {
  id: string
  firstName: string
  lastName: string
  email: string
  /** Mobile (phone number field) */
  phone: string
  designation: string
}

/** form Estimate_Summary — one category of the project's budget review (Project.Project_Budget_Review) */
export interface BudgetReviewRow {
  id: string
  category: string
  /** %Cost */
  costPct: number
  totalCost: number
  totalPrice: number
  profit: number
  /** % */
  margin: number
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
  /** Vendors only: contact email / phone, and the vendor's reporting tag (Division) */
  email?: string
  phone?: string
  division?: string
  /** Racks: warehouse ID; segments: rack ID */
  parent?: string
  /** Segments: free quantity */
  free?: number
  /** Segments (pallet positions, form Bay): capacity, bay letter, level, side, pallet code, Location_Path */
  capacity?: number
  bay?: string
  level?: string
  side?: string
  pallet?: string
  path?: string
  /** Warehouses: Active */
  active?: boolean
  /** Delivery note statuses: Index_field */
  index?: number
  /** Delivery note statuses: Status.Order (display order) */
  order?: number
}

/**
 * form Task — Type_field "Task" or "Work Package"; linked to the project by Project_Name and to its Milestone (lookup).
 * Hierarchy (Milestone & Task redesign): Milestone → its tasks; a Work Package root (Type "Work Package", no Parent_Task)
 * groups its tasks, and sub-tasks sit under their Parent_Task.
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
  /** Task.Milestone → Milestone (display Milestone_Name); null on projects created before the redesign */
  milestone: Ref | null
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
  /** Project Team grid row ID and Roles ID — used when the team is edited */
  rowId: string
  roleId: string
}

/** One row sent to Widget.project_update as data.Project_Team (the whole team: rows left out are removed) */
export interface TeamRowInput {
  row_id: string
  member_id: string
  role_id: string
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
  /** Zoho CRM Deal of the project (Accepted Estimate → Deals); empty when none is linked */
  crmDealId: string
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
  /** Dated project events for the Timelines Gantt (Widget.project_dashboard) */
  events: TimelineEvent[]
  /** Project.Status_History, oldest first */
  statusHistory: StatusChange[]
}

/**
 * One dated event of a project on the dashboard timeline: a milestone (planned start → end), a completed task, a purchase
 * order, a delivery note or a status change. `by` = owner / issued by / received by / changed by.
 */
export interface TimelineEvent {
  type: 'milestone' | 'task' | 'po' | 'dn' | 'status'
  name: string
  date: string // ISO
  start?: string // ISO — milestones
  no?: string
  by: string
  status: string
  vendor?: string
  total?: number
  done?: boolean
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
  /** Project statuses without an Order (On Hold, Cancelled …), from the Status records */
  anytimeOrder: string[]
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
  /** Add the lines to this existing PO (same project and vendor) instead of raising a new one */
  poId?: string
  /** In transit: written on the BOQ lines of the PO (Mode_of_Transit; ETA, else the delivery date) */
  modeOfTransit?: string
  eta?: string
  /** lineId = the approved Cost Analysis line (PO_Line_Items.Estimate_Line_ID); division = the line's reporting tag */
  lines: { boqId: string; productId: string; lineId?: string; description: string; quantity: number; rate: number; taxId: string; division: string }[]
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
