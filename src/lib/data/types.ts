import type { LookupSource } from '@/config/projectForm'
import type {
  ActivityEntry,
  BoqLine,
  CostingLine,
  Dashboard,
  PlanMilestone,
  ProjectDetails,
  PurchaseOrderInput,
  WorkTask,
  CreatorRecord,
  Option,
  PaymentMilestone,
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
  listPurchaseOrders(poNumbers: string[]): Promise<PurchaseOrder[]>
  listPoLines(purchaseOrderIds: string[]): Promise<PoLine[]>
  listPaymentMilestones(key: ProjectKey): Promise<PaymentMilestone[]>
  listTasks(projectId: string): Promise<WorkTask[]>
  /** Project_Risk records of the project */
  listRisks(projectId: string): Promise<Risk[]>
  /** Milestone form records of the project */
  listPlanMilestones(projectId: string): Promise<PlanMilestone[]>
  /** BOQ line edits (PO date, ETA, status, PO#, transit, delivered flags and dates) */
  updateBoq(projectId: string, boqId: string, data: Record<string, unknown>): Promise<void>
  /** Widget.project_task_update (milestone_id): Starts_after, Starts_After_In, Duration, Owner, Flag, Status */
  updateMilestone(projectId: string, milestoneId: string, data: Record<string, unknown>): Promise<void>
  /** Activity_Stream of the project (newest first); recordId narrows it to one record */
  listActivity(projectId: string, recordId?: string): Promise<ActivityEntry[]>
  /** Widget.project_risk_save: create (riskId undefined) or edit a Project_Risk record; score / severity calculated there */
  saveRisk(projectId: string, riskId: string | undefined, data: Record<string, unknown>): Promise<{ id: string }>
  updateTask(projectId: string, taskId: string, data: Record<string, unknown>): Promise<void>
  updateAssetLine(projectId: string, lineId: string, data: Record<string, unknown>): Promise<void>
  createPurchaseOrder(input: PurchaseOrderInput): Promise<{ id: string; poNo: string; booksSynced: boolean; booksMessage?: string }>
  listOptions(source: LookupSource): Promise<Option[]>
}
