import { useMemo } from 'react'
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LookupSource } from '@/config/projectForm'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/features/console/toast'
import type { BoqLine, CostingLine, DeliveryNoteInput, DeliveryStatusInput, PlanMilestone, Project, ProjectContact, ProjectKey, PurchaseOrderInput, ReceiveInput, WorkTask } from '@/types/domain'

// Master data changes rarely: keep option lists for the session. Project data is always read live (staleTime 0).
const MASTER_STALE = 10 * 60_000

/** What child reads need: the project ID plus its Accepted_Estimate and reference (see Widget.project_console). */
export const projectKey = (p: Project): ProjectKey => ({ id: p.id, estimateId: p.acceptedEstimate?.id, reference: p.reference || undefined })

/** PO numbers on BOQ lines (BOQ.PO may hold several, comma-separated). */
export const poNumbersOf = (boq: { po: string }[]) => [...new Set(boq.flatMap((b) => b.po.split(/[,;]/).map((s) => s.trim())).filter(Boolean))].sort()

export function useDashboard() {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.dashboard(), queryFn: () => ds.getDashboard(), staleTime: 0 })
}

export function useProjects() {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.list(), queryFn: () => ds.listProjects() })
}

export function useProject(id: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.detail(id), queryFn: () => ds.getProject(id), staleTime: 0, retry: false })
}

export function useProjectDetails(id: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.details(id), queryFn: () => ds.getProjectDetails(id), staleTime: 0, retry: false })
}

/** The raw Project record for the edit form (always read fresh when the form opens). */
export function useProjectRecord(id: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.record(id), queryFn: () => ds.getProjectRecord(id), staleTime: 0, gcTime: 0 })
}

export function useTasks(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.tasks(project.id), queryFn: () => ds.listTasks(project.id), staleTime: 0 })
}

export function useCostingLines(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.costingLines(project.id), queryFn: () => ds.listCostingLines(projectKey(project)), staleTime: 0 })
}

export function useBoq(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.boq(project.id), queryFn: () => ds.listBoq(projectKey(project)), staleTime: 0 })
}

/** BOQ, then the project's POs (and any PO its lines name), then those POs' line items and goods receipts, plus the delivery notes. */
export function useProcurement(project: Project) {
  const ds = useDataSource()
  const boq = useBoq(project)
  const poNumbers = useMemo(() => (boq.data ? poNumbersOf(boq.data) : undefined), [boq.data])
  const orders = useQuery({
    queryKey: [...queryKeys.projects.purchaseOrders(project.id), poNumbers?.join('|') ?? ''],
    queryFn: () => ds.listPurchaseOrders(project.id, poNumbers!),
    enabled: !!poNumbers,
    staleTime: 0,
    // A new PO changes the key: keep showing the current list (and any open dialog) while it reloads.
    placeholderData: keepPreviousData,
  })
  const orderIds = useMemo(() => orders.data?.map((o) => o.id), [orders.data])
  const poLines = useQuery({
    queryKey: [...queryKeys.projects.poLines(project.id), orderIds?.join('|') ?? ''],
    queryFn: () => ds.listPoLines(orderIds!),
    enabled: !!orderIds,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
  const receipts = useQuery({
    queryKey: [...queryKeys.projects.goodsReceipts(project.id), orderIds?.join('|') ?? ''],
    queryFn: () => ds.listGoodsReceipts(orderIds!),
    enabled: !!orderIds,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
  const deliveryNotes = useQuery({ queryKey: queryKeys.projects.deliveryNotes(project.id), queryFn: () => ds.listDeliveryNotes(project.id), staleTime: 0 })
  return { boq, orders, poLines, receipts, deliveryNotes }
}

/** Everything a PO, goods receipt or delivery note changes: BOQ write-backs, PO lines, receipts, notes, activity. */
function useInvalidateProcurement(projectId: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all(
      [
        queryKeys.projects.boq(projectId),
        queryKeys.projects.purchaseOrders(projectId),
        queryKeys.projects.poLines(projectId),
        queryKeys.projects.goodsReceipts(projectId),
        queryKeys.projects.deliveryNotes(projectId),
        [...queryKeys.projects.detail(projectId), 'activity'],
      ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    )
}

/**
 * Save notifications, the same everywhere: one success toast once Creator has confirmed the save; an error toast with
 * Creator's message — unless the caller shows the error inside its own form / panel (`inline`), so it never shows twice.
 */
export interface Notify {
  inline?: boolean
}
const failed = (e: Error, opts?: Notify) => {
  if (!opts?.inline) toast('Not saved', 'error', e.message || 'Zoho Creator did not save the change')
}
const DN_DONE: Record<number, string> = { 1: 'set to Draft', 68: 'marked ready to dispatch', 69: 'marked dispatched', 18: 'marked partially delivered', 67: 'marked delivered', 48: 'cancelled' }

/**
 * Goods receipt (panel: errors inline), then each supplier document into Purchase_Receive.Attachments (multiple files). Once the receipt
 * exists every later problem (put-away, file, site delivery note) is a warning — the receipt is never saved twice.
 */
export function useReceiveGoods(projectId: string, opts: Notify = { inline: true }) {
  const ds = useDataSource()
  const invalidate = useInvalidateProcurement(projectId)
  return useMutation({
    mutationFn: async ({ files = [], ...input }: ReceiveInput & { files?: File[] }) => {
      const res = await ds.receiveGoods(input)
      const failedFiles: string[] = []
      // Attachments allows several files: one upload call per file into the same receipt
      if (res.id) for (const f of files) await ds.uploadReceiptFile(res.id, f).catch((e: Error) => failedFiles.push(`${f.name}: ${e.message}`))
      return { ...res, fileMessage: failedFiles.length ? `Not attached: ${failedFiles.join('; ')}` : '' }
    },
    onSuccess: (res) => {
      toast('Purchase Receive created', 'ok', [res.prNo, res.deliveryNoteNo && `Delivered to site on ${res.deliveryNoteNo}`].filter(Boolean).join(' · '))
      for (const m of [res.warning, res.storageMessage, res.siteMessage, res.fileMessage]) if (m) toast('Check the receipt', 'warn', m)
      return invalidate()
    },
    onError: (e) => failed(e, opts),
  })
}

/** CRM deals without a cost analysis: 100 per call, the next page when the list is scrolled to the bottom */
export function useOpenDeals(search: string, enabled: boolean) {
  const ds = useDataSource()
  return useInfiniteQuery({
    queryKey: ['openDeals', search],
    queryFn: ({ pageParam }) => ds.listOpenDeals(pageParam, search),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.more ? pages.length + 1 : undefined),
    enabled,
    staleTime: 60_000,
    // a new search keeps the current list on screen until its first page arrives
    placeholderData: keepPreviousData,
  })
}

/** Creates the cost analysis (Estimate) of a deal and stores its ID on the deal (Widget.deal_estimate) */
export function useCreateDealEstimate() {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dealId: string) => ds.createDealEstimate(dealId),
    onSuccess: (res) => {
      if (res.warning) toast('Check the deal in CRM', 'warn', res.warning)
      return qc.invalidateQueries({ queryKey: ['openDeals'] })
    },
  })
}

/** Comments, replies and files of one task (Widget.task_collab) — read when its comment row is opened */
export function useTaskCollab(projectId: string, taskId: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.taskCollab(projectId, taskId), queryFn: () => ds.listTaskCollab(taskId), staleTime: 0 })
}

/**
 * A comment / reply and its files, or files on the task itself: Creator makes the rows, then each file is uploaded into its
 * row. Once the comment is saved, a failed upload is a warning (the comment is never posted twice).
 */
export function useTaskCollabSave(projectId: string, taskId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { type: 'note'; comment: string; replyTo: string; files: File[] } | { type: 'files'; files: File[] } | { type: 'delete'; fileId: string }) => {
      if (m.type === 'delete') return ds.deleteTaskFile(taskId, m.fileId).then(() => '')
      const res = await ds.addTaskNote({
        taskId,
        comment: m.type === 'note' ? m.comment : '',
        replyTo: m.type === 'note' ? m.replyTo : '',
        fileNames: m.files.map((f) => f.name),
        filesOnly: m.type === 'files',
      })
      const failedFiles: string[] = []
      for (const [i, f] of m.files.entries()) {
        const fileId = res.fileIds[i]
        if (!fileId) failedFiles.push(`${f.name}: Creator made no file row (add the Task_File form)`)
        else
          await ds.uploadTaskFile(fileId, f).catch(async (e: Error) => {
            failedFiles.push(`${f.name}: ${e.message}`)
            // the empty Task_File row would show as a file that cannot open
            await ds.deleteTaskFile(taskId, fileId).catch(() => undefined)
          })
      }
      return failedFiles.join('; ')
    },
    onSuccess: (failedFiles) => {
      if (failedFiles) toast('Not attached', 'warn', failedFiles)
      return qc.invalidateQueries({ queryKey: queryKeys.projects.taskCollab(projectId, taskId) })
    },
  })
}

/** Vendor payments (form Payment_Made) of the project's purchase orders */
export function usePoPayments(projectId: string, orderIds: string[] | undefined) {
  const ds = useDataSource()
  return useQuery({
    queryKey: [...queryKeys.projects.poPayments(projectId), orderIds?.join('|') ?? ''],
    queryFn: () => ds.listPoPayments(orderIds!),
    enabled: !!orderIds,
    staleTime: 0,
    placeholderData: keepPreviousData,
  })
}

/** Adds or deletes a PO payment in Creator (Widget.po_payment_save); the panel shows errors inline */
export function useSavePoPayment(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (m: { type: 'add'; poId: string; date: string; amount: number; reference: string; note: string } | { type: 'delete'; id: string }) =>
      m.type === 'add' ? ds.addPoPayment(m).then(() => undefined) : ds.deletePoPayment(m.id),
    onSuccess: (_r, m) => {
      toast(m.type === 'add' ? 'Payment saved' : 'Payment deleted', 'ok')
      return qc.invalidateQueries({ queryKey: queryKeys.projects.poPayments(projectId) })
    },
  })
}

/** Sends a PO or a purchase receive to Zoho Books again (Widget.purchase_delivery books_sync) */
export function useRetryBooksSync(projectId: string) {
  const ds = useDataSource()
  const invalidate = useInvalidateProcurement(projectId)
  return useMutation({
    mutationFn: ({ kind, id }: { kind: 'po' | 'pr'; id: string }) => ds.retryBooksSync(kind, id),
    onSuccess: (res) => {
      if (res.booksSynced) toast('Synced to Zoho Books', 'ok', res.no)
      else toast('Not in Zoho Books yet', 'warn', `${res.no} — see Developer_Log in Creator`)
      return invalidate()
    },
    onError: (e) => failed(e),
  })
}

export function useCreateDeliveryNote(projectId: string, opts: Notify = { inline: true }) {
  const ds = useDataSource()
  const invalidate = useInvalidateProcurement(projectId)
  return useMutation({
    // The note first, then each file into its Attachments; once the note is saved a failed upload is a warning
    mutationFn: async ({ files = [], ...input }: DeliveryNoteInput & { files?: File[] }) => {
      const res = await ds.createDeliveryNote(input)
      const failedFiles: string[] = []
      if (res.id) for (const f of files) await ds.uploadDeliveryNoteFile(res.id, f).catch((e: Error) => failedFiles.push(`${f.name}: ${e.message}`))
      return { ...res, failedFiles: failedFiles.join('; ') }
    },
    onSuccess: (res) => {
      if (res.failedFiles) toast('Delivery Note created — file not attached', 'warn', res.failedFiles)
      else toast('Delivery Note created')
      return invalidate()
    },
    onError: (e) => failed(e, opts),
  })
}

export function useUpdateDeliveryNote(projectId: string, opts: Notify = { inline: true }) {
  const ds = useDataSource()
  const invalidate = useInvalidateProcurement(projectId)
  return useMutation({
    mutationFn: (input: DeliveryStatusInput) => ds.updateDeliveryNote(input),
    onSuccess: (_res, input) => {
      toast('Delivery Note updated', 'ok', `Note ${DN_DONE[input.statusIndex] ?? 'updated'}`)
      return invalidate()
    },
    onError: (e) => failed(e, opts),
  })
}

export function usePaymentMilestones(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.milestones(project.id), queryFn: () => ds.listPaymentMilestones(projectKey(project)), staleTime: 0 })
}

/** Project_Budget_Review rows (Estimate_Summary) per category */
export function useBudgetReview(project: Project | undefined) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.budgetReview(project?.id ?? ''), queryFn: () => ds.listBudgetReview(projectKey(project!)), enabled: !!project, staleTime: 0 })
}

/** Meeting_Attendee rows of the project (Present / Absent of each employee) */
export function useAttendees(projectId: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.attendees(projectId), queryFn: () => ds.listAttendees(projectId), staleTime: 0 })
}

/** Saves Present / Absent of one employee of the project */
export function useSaveAttendance(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, attendance }: { userId: string; attendance: string }) => ds.saveAttendance(projectId, userId, attendance),
    onSuccess: () => {
      toast('Attendance saved')
      return Promise.all([qc.invalidateQueries({ queryKey: queryKeys.projects.attendees(projectId) }), qc.invalidateQueries({ queryKey: queryKeys.projects.record(projectId) })])
    },
  })
}

/** Project_Contact rows (2point0 Outsourced Services & Software Contact List) */
export function useOutsourcedContacts(projectId: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.outsourced(projectId), queryFn: () => ds.listOutsourcedContacts(projectId), staleTime: 0 })
}

/** Contact_Persons of the project (Client Side Contact List) */
export function useProjectContacts(projectId: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.contacts(projectId), queryFn: () => ds.listProjectContacts(projectId), staleTime: 0 })
}

/** Adds (id undefined) or edits a client contact of the project */
export function useSaveProjectContact(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Omit<ProjectContact, 'id'> }) => ds.saveProjectContact(projectId, id, data),
    onSuccess: (_r, { id }) => {
      toast(id ? 'Contact updated' : 'Contact added')
      return Promise.all([qc.invalidateQueries({ queryKey: queryKeys.projects.contacts(projectId) }), qc.invalidateQueries({ queryKey: queryKeys.projects.details(projectId) })])
    },
  })
}

/** Uploads the project's PO / email confirmation / letter of intent (PO_Document), then reads the project again */
export function useUploadProjectFile(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: File | { file: File; field: string }) => (input instanceof File ? ds.uploadProjectFile(projectId, input) : ds.uploadProjectFile(projectId, input.file, input.field)),
    onSuccess: (_r, input) => {
      toast(input instanceof File || !/signature/i.test(input.field) ? 'File uploaded' : 'Signature saved')
      return Promise.all([qc.invalidateQueries({ queryKey: queryKeys.projects.record(projectId) }), qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId), exact: true })])
    },
  })
}

/** Adds or edits a Project Registration Task List template item; every project's checklist reads the list again */
export function useSaveTaskListItem() {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (item: { id?: string; name: string; active: boolean }) => ds.saveTaskListItem(item),
    onSuccess: (_r, item) => {
      toast(item.id ? 'Checklist item updated' : 'Checklist item added')
      return qc.invalidateQueries({ queryKey: queryKeys.options('taskList') })
    },
  })
}

export function useRisks(projectId: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.risks(projectId), queryFn: () => ds.listRisks(projectId), staleTime: 0 })
}

/** `fresh`: read the list again whenever the screen using it opens (racks and bays change while the widget is open) */
export function useOptions(source: LookupSource, enabled = true, fresh = false) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.options(source.key), queryFn: () => ds.listOptions(source), staleTime: MASTER_STALE, enabled, refetchOnMount: fresh ? 'always' : true })
}

/** Refreshes everything of one project (header, pipeline, tabs) — the Refresh button and every save. */
export function useRefreshProject(id: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: queryKeys.projects.detail(id) })
}

/** Fields whose change also changes other parts of the project (estimate → costing / BOQ, reference → BOQ match) */
const PROJECT_WIDE = ['Accepted_Estimate', 'Project_Reference']

/**
 * Project saves, reading back as little as possible. A stage move (`stage` = the new status name) shows at once and rolls
 * back if Creator refuses; then only the project record and the activity log are read again. A team change reads the team
 * (project details); other field edits read the record and details; only an estimate / reference change reads every tab.
 */
export function useUpdateProject(id: string, opts: Notify = {}) {
  const ds = useDataSource()
  const qc = useQueryClient()
  const key = queryKeys.projects.detail(id)
  const activity = [...key, 'activity']
  return useMutation({
    mutationFn: ({ data, reason }: { data: Record<string, unknown>; reason?: string; stage?: string }) => ds.updateProject(id, data, reason),
    onMutate: async ({ reason, stage }) => {
      if (!stage) return {}
      await qc.cancelQueries({ queryKey: key, exact: true })
      const prev = qc.getQueryData<Project>(key)
      const now = new Date()
      const change = { at: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 8), status: stage, user: '', reason: reason ?? '' }
      qc.setQueryData<Project>(key, (p) => (p ? { ...p, status: stage, statusHistory: [...p.statusHistory, change] } : p))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      failed(e, opts)
    },
    onSuccess: (_res, { data, stage }) => {
      toast(stage ? `Project moved to ${stage}` : 'Project updated')
      const fields = Object.keys(data)
      if (fields.some((f) => PROJECT_WIDE.includes(f))) return void qc.invalidateQueries({ queryKey: key })
      if (!fields.every((f) => f === 'Project_Team')) void qc.invalidateQueries({ queryKey: key, exact: true })
      if (!stage) void qc.invalidateQueries({ queryKey: queryKeys.projects.details(id) })
      if (fields.some((f) => f !== 'Project_Team')) void qc.invalidateQueries({ queryKey: queryKeys.projects.record(id) })
      void qc.invalidateQueries({ queryKey: activity })
    },
  })
}

/** Task fields that move other tasks (dates, progress, parent, status) — after these the task list is read again */
const TASK_LINKED = ['Task_Start_Date', 'Task_End_Date', 'Duration', 'Precent_Complete', 'Parent_Task', 'Milestone', 'Task_Status', 'Actual_Start_Date', 'Actual_Complete_Date']
/** Milestone fields that move the plan dates — after these the milestones are read again */
const MILESTONE_LINKED = ['Starts_after', 'Starts_After_In', 'Duration', 'Milestone_Name']
/** After a confirmed optimistic edit the screen already shows Creator's value: read the list again only when needed */
const reread = (err: unknown, optimistic: unknown, data: Record<string, unknown>, linked: string[] = []) => !!err || !optimistic || Object.keys(data).some((f) => linked.includes(f))

/**
 * Task edits. `optimistic` (app field → value) updates the screen at once; it rolls back if Creator refuses,
 * then the task list is read again so the screen always ends on Creator's values.
 */
export function useUpdateTask(projectId: string, opts: Notify = {}) {
  const ds = useDataSource()
  const qc = useQueryClient()
  const key = queryKeys.projects.tasks(projectId)
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Record<string, unknown>; optimistic?: Partial<WorkTask> }) => ds.updateTask(projectId, taskId, data),
    onMutate: async ({ taskId, optimistic }) => {
      if (!optimistic) return {}
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WorkTask[]>(key)
      qc.setQueryData<WorkTask[]>(key, (old) => old?.map((t) => (t.id === taskId ? { ...t, ...optimistic } : t)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      failed(e, opts)
    },
    onSuccess: () => toast('Task updated'),
    onSettled: (_r, err, { data, optimistic }) => {
      if (reread(err, optimistic, data, TASK_LINKED)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
    },
  })
}

/** Milestone inline edits (Starts after, Duration, Owner, Flag, Status) — optimistic, rolled back on error. */
/** Adds a milestone to the project (with its own task list) */
export function useCreateMilestone(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; startsAfter: number; startsAfterIn: string; duration: number }) => ds.createMilestone(projectId, input),
    onSuccess: () => {
      toast('Milestone added')
      return Promise.all([qc.invalidateQueries({ queryKey: queryKeys.projects.planMilestones(projectId) }), qc.invalidateQueries({ queryKey: queryKeys.projects.tasks(projectId) })])
    },
  })
}

/** Adds a task to a milestone (Project Execution: to one of its work packages) */
export function useCreateTask(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; parentId?: string; milestoneId?: string; startDate: string; endDate: string }) => ds.createTask(projectId, input),
    onSuccess: () => {
      toast('Task added')
      return qc.invalidateQueries({ queryKey: queryKeys.projects.tasks(projectId) })
    },
  })
}

export function useUpdateMilestone(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  const key = queryKeys.projects.planMilestones(projectId)
  return useMutation({
    mutationFn: ({ milestoneId, data }: { milestoneId: string; data: Record<string, unknown>; optimistic?: Partial<PlanMilestone> }) => ds.updateMilestone(projectId, milestoneId, data),
    onMutate: async ({ milestoneId, optimistic }) => {
      if (!optimistic) return {}
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<PlanMilestone[]>(key)
      qc.setQueryData<PlanMilestone[]>(key, (old) => old?.map((m) => (m.id === milestoneId ? { ...m, ...optimistic } : m)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      failed(e)
    },
    onSuccess: () => toast('Milestone updated'),
    onSettled: (_r, err, { data, optimistic }) => {
      if (reread(err, optimistic, data, MILESTONE_LINKED)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(), refetchType: 'none' })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
    },
  })
}

/** Activity_Stream of the project, or of one record. */
export function useActivity(projectId: string, recordId?: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.activity(projectId, recordId), queryFn: () => ds.listActivity(projectId, recordId), staleTime: 0, enabled })
}

/** Asset line edits from the list (Project Execution + Asset & Network fields) — optimistic, saved to Costing_Lineitem. */
export function useUpdateAssetLine(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  const key = queryKeys.projects.costingLines(projectId)
  return useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: Record<string, unknown>; optimistic?: Partial<CostingLine> }) => ds.updateAssetLine(projectId, lineId, data),
    onMutate: async ({ lineId, optimistic }) => {
      if (!optimistic) return {}
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<CostingLine[]>(key)
      qc.setQueryData<CostingLine[]>(key, (old) => old?.map((l) => (l.id === lineId ? { ...l, ...optimistic } : l)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      failed(e)
    },
    onSuccess: () => toast('Asset updated'),
    onSettled: (_r, err, { data, optimistic }) => {
      if (reread(err, optimistic, data)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
    },
  })
}

export function useCreatePurchaseOrder(projectId: string, opts: Notify = { inline: true }) {
  const ds = useDataSource()
  const invalidate = useInvalidateProcurement(projectId)
  return useMutation({
    mutationFn: (input: PurchaseOrderInput) => ds.createPurchaseOrder(input),
    onSuccess: (res) => {
      toast(res.addedToExisting ? 'Purchase Order updated' : 'Purchase Order created', 'ok', res.poNo)
      return invalidate()
    },
    onError: (e) => failed(e, opts),
  })
}

/** BOQ line edits; `optimistic` updates the list at once and rolls back if Creator refuses. */
export function useUpdateBoq(project: Project) {
  const ds = useDataSource()
  const qc = useQueryClient()
  const key = queryKeys.projects.boq(project.id)
  return useMutation({
    mutationFn: ({ boqId, data }: { boqId: string; data: Record<string, unknown>; optimistic?: Partial<BoqLine> }) => ds.updateBoq(project.id, boqId, data),
    onMutate: async ({ boqId, optimistic }) => {
      if (!optimistic) return {}
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<BoqLine[]>(key)
      qc.setQueryData<BoqLine[]>(key, (old) => old?.map((b) => (b.id === boqId ? { ...b, ...optimistic } : b)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
      failed(e)
    },
    onSuccess: () => toast('Procurement line updated'),
    onSettled: (_r, err, { data, optimistic }) => {
      if (reread(err, optimistic, data)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(project.id), 'activity'] })
    },
  })
}
/** One status for many BOQ lines — saved one by one (Widget.project_task_update); the lines Creator refuses are listed */
export function useBulkBoqStatus(project: Project) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, statusId }: { ids: { id: string; name: string }[]; statusId: string; statusName: string }) => {
      const failedLines: string[] = []
      for (const line of ids) {
        try {
          await ds.updateBoq(project.id, line.id, { Status: statusId })
        } catch (e) {
          failedLines.push(`${line.name}: ${(e as Error).message}`)
        }
      }
      return { done: ids.length - failedLines.length, failedLines }
    },
    onSuccess: ({ done, failedLines }, { statusName }) => {
      if (done) toast(`${done} line${done === 1 ? '' : 's'} set to ${statusName.trim()}`)
      if (failedLines.length) toast('Some lines not changed', 'error', failedLines.join('; '))
    },
    onError: (e) => failed(e),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.boq(project.id) })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(project.id), 'activity'] })
    },
  })
}
export function usePlanMilestones(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.planMilestones(project.id), queryFn: () => ds.listPlanMilestones(project.id), staleTime: 0 })
}

/** Create (riskId undefined) or edit a Project_Risk record, then reload the register and the Home health. */
export function useSaveRisk(projectId: string, opts: Notify = { inline: true }) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ riskId, data }: { riskId?: string; data: Record<string, unknown> }) => ds.saveRisk(projectId, riskId, data),
    onError: (e) => failed(e, opts),
    onSuccess: () => {
      toast('Risk saved')
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
      qc.invalidateQueries({ queryKey: queryKeys.projects.risks(projectId) })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard() })
    },
  })
}
