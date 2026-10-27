import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LookupSource } from '@/config/projectForm'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { queryKeys } from '@/lib/query-keys'
import { toast } from '@/features/console/toast'
import type { BoqLine, CostingLine, PlanMilestone, Project, ProjectKey, PurchaseOrderInput, WorkTask } from '@/types/domain'

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

/** BOQ, then only the POs its lines name, then those POs' line items. */
export function useProcurement(project: Project) {
  const ds = useDataSource()
  const boq = useBoq(project)
  const poNumbers = useMemo(() => (boq.data ? poNumbersOf(boq.data) : undefined), [boq.data])
  const orders = useQuery({
    queryKey: [...queryKeys.projects.purchaseOrders(project.id), poNumbers?.join('|') ?? ''],
    queryFn: () => ds.listPurchaseOrders(poNumbers!),
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
  return { boq, orders, poLines }
}

export function usePaymentMilestones(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.milestones(project.id), queryFn: () => ds.listPaymentMilestones(projectKey(project)), staleTime: 0 })
}

export function useRisks(projectId: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.risks(projectId), queryFn: () => ds.listRisks(projectId), staleTime: 0 })
}

export function useOptions(source: LookupSource, enabled = true) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.options(source.key), queryFn: () => ds.listOptions(source), staleTime: MASTER_STALE, enabled })
}

/** Refreshes everything of one project (header, pipeline, tabs) — the Refresh button and every save. */
export function useRefreshProject(id: string) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: queryKeys.projects.detail(id) })
}

export function useUpdateProject(id: string) {
  const ds = useDataSource()
  const refresh = useRefreshProject(id)
  return useMutation({
    mutationFn: ({ data, reason }: { data: Record<string, unknown>; reason?: string }) => ds.updateProject(id, data, reason),
    onSuccess: () => {
      toast('Project updated')
      return refresh()
    },
  })
}

/**
 * Task edits. `optimistic` (app field → value) updates the screen at once; it rolls back if Creator refuses,
 * then the task list is read again so the screen always ends on Creator's values.
 */
export function useUpdateTask(projectId: string) {
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
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: () => toast('Task updated'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
    },
  })
}

/** Milestone inline edits (Starts after, Duration, Owner, Flag, Status) — optimistic, rolled back on error. */
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
      toast(e.message, 'error')
    },
    onSuccess: () => toast('Milestone updated'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard() })
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
      toast(e.message, 'error')
    },
    onSuccess: () => toast('Asset updated'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
    },
  })
}

export function useCreatePurchaseOrder(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PurchaseOrderInput) => ds.createPurchaseOrder(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.projects.boq(projectId) })
      await qc.invalidateQueries({ queryKey: queryKeys.projects.purchaseOrders(projectId) })
      await qc.invalidateQueries({ queryKey: queryKeys.projects.poLines(projectId) })
    },
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
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSuccess: () => toast('Procurement line updated'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(project.id), 'activity'] })
    },
  })
}
export function usePlanMilestones(project: Project) {
  const ds = useDataSource()
  return useQuery({ queryKey: queryKeys.projects.planMilestones(project.id), queryFn: () => ds.listPlanMilestones(project.id), staleTime: 0 })
}

/** Create (riskId undefined) or edit a Project_Risk record, then reload the register and the Home health. */
export function useSaveRisk(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ riskId, data }: { riskId?: string; data: Record<string, unknown> }) => ds.saveRisk(projectId, riskId, data),
    onSuccess: () => {
      toast('Risk saved')
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
      qc.invalidateQueries({ queryKey: queryKeys.projects.risks(projectId) })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard() })
    },
  })
}

const sameName = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Milestone ↔ task list mapping, as the Task Administrator template (milestone → Milestone_tasklist): a task list of the
 * project belongs to the milestone whose Task_List has the same name. Mapping a task list to a milestone sets that
 * milestone's Task_List to the template task list of that name (and clears it on any other milestone that had it);
 * "" removes the mapping. Saved on the Milestone records.
 */
export function useMapTaskList(projectId: string) {
  const ds = useDataSource()
  const qc = useQueryClient()
  const templates = useOptions({ key: 'taskListTemplates', report: '', label: '' })
  const mutation = useMutation({
    mutationFn: async ({ listName, milestoneId, plan }: { listName: string; milestoneId: string; plan: PlanMilestone[] }) => {
      const current = plan.filter((m) => sameName(m.taskList, listName))
      const template = (templates.data ?? []).find((t) => sameName(t.label, listName))
      if (milestoneId && !template) throw new Error(`“${listName}” is not a task list in the Task Administrator template`)
      for (const m of current) if (m.id !== milestoneId) await ds.updateMilestone(projectId, m.id, { Task_List: '' })
      if (milestoneId && !current.some((m) => m.id === milestoneId)) await ds.updateMilestone(projectId, milestoneId, { Task_List: template!.id })
    },
    onSuccess: () => toast('Milestone mapping saved'),
    onError: (e) => toast(e.message, 'error'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.planMilestones(projectId) })
      qc.invalidateQueries({ queryKey: [...queryKeys.projects.detail(projectId), 'activity'] })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard() })
    },
  })
  return { ...mutation, templates }
}
