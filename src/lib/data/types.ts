import type { LookupSource } from '@/config/projectForm'
import type {
  ActivityEntry,
  BoqLine,
  CostingLine,
  DeliveryNotePrintInfo,
  Dashboard,
  PlanMilestone,
  OpenDeal,
  PoPayment,
  ReceiptFile,
  TaskFile,
  TaskNote,
  ProjectDetails,
  PurchaseOrderInput,
  DeliveryNote,
  DeliveryNoteInput,
  DeliveryStatusInput,
  GoodsReceipt,
  ReceiveInput,
  WorkTask,
  CreatorRecord,
  Option,
  PaymentMilestone,
  ProjectContact,
  MeetingAttendee,
  OutsourcedContact,
  BudgetReviewRow,
  PoLine,
  Project,
  ProjectKey,
  PurchaseOrder,
  Risk,
} from '@/types/domain'

/** Thrown when a report the widget reads does not exist yet (e.g. the new Risk_Register form). */
export class NotConfiguredError extends Error {
  constructor(public readonly what: string) {
    super(`${what} is not set up in Creator yet`)
    this.name = 'NotConfiguredError'
  }
}

/**
 * Backend-agnostic contract, implemented by the mock source and the Zoho Widget SDK source.
 * Every child read is scoped to one project: nothing loads records of other projects.
 */
export interface DataSource {
  readonly kind: 'mock' | 'zoho'
  /** Creator account, application and environment (Widget SDK init params). */
  getContext(): Promise<{ scope?: string; app?: string; environment?: string }>
  /** Page parameters of the Creator page hosting the widget (project_id on Project_Widget). */
  getPageParams(): Promise<Record<string, string>>
  /** Opens a Creator page / record in the parent window (Home, Project_Widget, Cost_Analysis_Page). */
  navigate(hash: string): void
  getDashboard(): Promise<Dashboard>
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project>
  getProjectDetails(id: string): Promise<ProjectDetails>
  /** The full Project record keyed by field link names, for the edit form. */
  getProjectRecord(id: string): Promise<CreatorRecord>
  /** Saves only the given fields (link name → Creator value); reason = why the status moves back. */
  updateProject(id: string, data: Record<string, unknown>, reason?: string): Promise<void>
  listCostingLines(key: ProjectKey): Promise<CostingLine[]>
  listBoq(key: ProjectKey): Promise<BoqLine[]>
  /** POs of the project (Project_reference) plus any PO named on its BOQ lines */
  listPurchaseOrders(projectId: string, poNumbers: string[]): Promise<PurchaseOrder[]>
  listPoLines(purchaseOrderIds: string[]): Promise<PoLine[]>
  /** Delivery_Note records of the project with their lines */
  listDeliveryNotes(projectId: string): Promise<DeliveryNote[]>
  /** Purchase_Receive records of the given POs */
  listGoodsReceipts(purchaseOrderIds: string[]): Promise<GoodsReceipt[]>
  /** Widget.purchase_receive: Purchase_Receive + line copies, parent totals, warehouse occupancy, Books */
  receiveGoods(input: ReceiveInput): Promise<ReceiveResult>
  /** Adds one file to Purchase_Receive.Attachments (multiple-files field: one upload call per file, as Zoho's Upload File API) */
  uploadReceiptFile(receiptId: string, file: File): Promise<void>
  /** Download link of one file of Purchase_Receive.Attachments ('' when it cannot be linked) */
  receiptFileUrl(file: ReceiptFile): string
  /** The file's content, to preview or print it in a new tab (null when Creator cannot hand it to the widget) */
  readReceiptFile(file: ReceiptFile): Promise<Blob | null>
  /** Payment_Made records of the given POs (Widget.project_console po_payments) */
  listPoPayments(purchaseOrderIds: string[]): Promise<PoPayment[]>
  /** Widget.po_payment_save: records a payment against a PO in Creator (form Payment_Made) */
  addPoPayment(input: { poId: string; date: string; amount: number; reference: string; note: string }): Promise<{ id: string }>
  /** Widget.po_payment_save: removes a payment not yet in Zoho Books */
  deletePoPayment(paymentId: string): Promise<void>
  /** Widget.deal_estimate (list): CRM deals with no cost analysis, 100 per page, newest first; `search` matches every value shown; `existing` = matching deals that already have a cost analysis (first page) */
  listOpenDeals(page: number, search: string): Promise<{ deals: OpenDeal[]; more: boolean; existing?: OpenDeal[] }>
  /** Widget.deal_estimate (create): new Estimate for the deal (as Estimate.Create_Quotation), Deal.Quote_ID = its ID */
  createDealEstimate(dealId: string): Promise<{ id: string; existing: boolean; warning: string }>
  /** Widget.task_collab (list): the comments, replies and files of a task */
  listTaskCollab(taskId: string): Promise<{ notes: TaskNote[]; files: TaskFile[] }>
  /** Widget.task_collab (add_note / add_files): a comment (or reply) and / or files; returns the Task_File row IDs to upload into */
  addTaskNote(input: { taskId: string; comment: string; replyTo: string; fileNames: string[]; filesOnly?: boolean }): Promise<{ id: string; fileIds: string[] }>
  /** Uploads a file into its Task_File row (File field) */
  uploadTaskFile(fileId: string, file: File): Promise<void>
  /** Widget.task_collab (delete_file) */
  deleteTaskFile(taskId: string, fileId: string): Promise<void>
  /** The file's content to open in a new tab (null when Creator cannot hand it to the widget) */
  readTaskFile(file: TaskFile): Promise<Blob | null>
  /** Download link of a task file ('' when it cannot be linked) */
  taskFileUrl(file: TaskFile): string
  /** Widget.purchase_delivery (books_sync): sends a PO or a purchase receive to Zoho Books again */
  retryBooksSync(kind: 'po' | 'pr', id: string): Promise<{ no: string; booksSynced: boolean }>
  /** Widget.purchase_delivery (create): Draft Delivery_Note with the picked received lines */
  createDeliveryNote(input: DeliveryNoteInput): Promise<{ id: string; dnNo: string }>
  /** Uploads one file into the delivery note's Attachments (report All_Delivery_Notes) */
  uploadDeliveryNoteFile(dnId: string, file: File): Promise<void>
  deliveryNoteFileUrl(file: ReceiptFile): string
  readDeliveryNoteFile(file: ReceiptFile): Promise<Blob | null>
  /** Widget.purchase_delivery (status): Ready / Dispatched / Delivered / Cancelled, then Books */
  updateDeliveryNote(input: DeliveryStatusInput): Promise<{ status: string; booksSynced: boolean }>
  /** Widget.purchase_delivery (print): organization address (Zoho Books) and customer details for the PDF */
  deliveryNotePrint(dnId: string): Promise<DeliveryNotePrintInfo>
  listPaymentMilestones(key: ProjectKey): Promise<PaymentMilestone[]>
  /** Project_Budget_Review rows (Estimate_Summary): cost, price, profit and margin per category */
  listBudgetReview(key: ProjectKey): Promise<BudgetReviewRow[]>
  /** Contact_Persons of the project (Client Side Contact List) */
  listProjectContacts(projectId: string): Promise<ProjectContact[]>
  /** Widget.project_task_update (save_contact): add (contactId undefined) or edit a Contact_Persons row of the project */
  saveProjectContact(projectId: string, contactId: string | undefined, data: Omit<ProjectContact, 'id'>): Promise<{ id: string }>
  /** Widget.project_console (attendees): Meeting_Attendee rows of the project */
  listAttendees(projectId: string): Promise<MeetingAttendee[]>
  /** Widget.project_task_update (save_attendance): Present / Absent of one employee — adds the attendee row when there is none */
  saveAttendance(projectId: string, userId: string, attendance: string): Promise<{ id: string }>
  /** Widget.project_console (outsourced): Project_Contact rows of the project */
  listOutsourcedContacts(projectId: string): Promise<OutsourcedContact[]>
  /** Uploads into a Project upload / signature field (report All_Projects): PO_Document by default; a signature is a PNG */
  uploadProjectFile(projectId: string, file: File, field?: string): Promise<void>
  projectFileUrl(projectId: string, path: string, field?: string): string
  readProjectFile(projectId: string, path: string, field?: string): Promise<Blob | null>
  /** Widget.project_update (task_list_item): adds or edits a Project_Registration_Task_List template item */
  saveTaskListItem(item: { id?: string; name: string; active: boolean }): Promise<{ id: string }>
  listTasks(projectId: string): Promise<WorkTask[]>
  /** Project_Risk records of the project */
  listRisks(projectId: string): Promise<Risk[]>
  /** Milestone form records of the project */
  listPlanMilestones(projectId: string): Promise<PlanMilestone[]>
  /** BOQ line edits (PO date, ETA, status, PO#, transit, delivered flags and dates) */
  updateBoq(projectId: string, boqId: string, data: Record<string, unknown>): Promise<void>
  /** Widget.project_task_update (milestone_id): Milestone_Name, Starts_after, Starts_After_In, Duration, Owner, Flag, Status */
  updateMilestone(projectId: string, milestoneId: string, data: Record<string, unknown>): Promise<void>
  /** Activity_Stream of the project (newest first); recordId narrows it to one record */
  listActivity(projectId: string, recordId?: string): Promise<ActivityEntry[]>
  /** Widget.project_risk_save: create (riskId undefined) or edit a Project_Risk record; score / severity calculated there */
  saveRisk(projectId: string, riskId: string | undefined, data: Record<string, unknown>): Promise<{ id: string }>
  updateTask(projectId: string, taskId: string, data: Record<string, unknown>): Promise<void>
  /** A milestone added to the project (Milestone form) and its own task list (a root Task named like it) */
  createMilestone(projectId: string, input: { name: string; startsAfter: number; startsAfterIn: string; duration: number }): Promise<{ id: string }>
  /** A task under a task list: parentId = the list (Project Execution: the work package's list); else milestoneId = its list */
  createTask(projectId: string, input: { name: string; parentId?: string; milestoneId?: string; startDate: string; endDate: string }): Promise<{ id: string }>
  updateAssetLine(projectId: string, lineId: string, data: Record<string, unknown>): Promise<void>
  createPurchaseOrder(input: PurchaseOrderInput): Promise<{ id: string; poNo: string; booksSynced: boolean; booksMessage?: string; addedToExisting?: boolean }>
  listOptions(source: LookupSource): Promise<Option[]>
}

export interface ReceiveResult {
  id: string
  prNo: string
  booksSynced: boolean
  booksMessage?: string
  storageMessage?: string
  /** Saved, but a later step failed: check the receipt before receiving again */
  warning?: string
  /** Direct to site: the delivered delivery note created for it, or why it could not be */
  deliveryNoteNo?: string
  siteMessage?: string
}
