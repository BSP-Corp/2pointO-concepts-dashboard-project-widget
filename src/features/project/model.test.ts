import { describe, expect, it } from 'vitest'
import { seedBoq, seedCostingLines, seedPlanMilestones, seedPoLines, seedPurchaseOrders, seedTasks } from '@/lib/data/seed'
import { toBoqLine, toCostingLine, toPlanMilestone, toPoLine, toPurchaseOrder, toTask } from '@/lib/data/zohoSource'
import type { PlanMilestone, WorkTask } from '@/types/domain'
import {
  buildBoq,
  buildMilestones,
  deliveryByCategory,
  dueText,
  durationOf,
  endFromDuration,
  health,
  isDeliveredStatus,
  milestoneStart,
  priorityTasks,
  progress,
  ratio,
  startsAfterFor,
  milestoneTasks,
  taskIssues,
  teamWithToday,
  workPackageGroups,
  todaysTasks,
} from './model'

const lines = seedCostingLines.filter((r) => (r.Project as { ID: string } | undefined)?.ID === '1001').map(toCostingLine)
const boq = seedBoq.filter((r) => r.Project_Reference === 'PR_26040').map(toBoqLine)
const orders = seedPurchaseOrders.map(toPurchaseOrder)
const poLines = seedPoLines.map(toPoLine)
const task = (p: Partial<WorkTask>): WorkTask => ({
  id: 'x',
  name: 'T',
  type: 'Task',
  taskNo: '',
  duration: 0,
  createdBy: '',
  description: '',
  priority: '',
  percent: 0,
  workHours: 0,
  workPackage: '',
  startDate: '',
  endDate: '',
  actualStart: '',
  actualEnd: '',
  status: null,
  parent: null,
  milestone: null,
  owners: [],
  lineIds: [],
  ...p,
})

describe('BOQ', () => {
  it('prices each line from its approved estimate lines; contract value = BOQ total', () => {
    const { rows, total } = buildBoq(boq, lines, orders, poLines)
    const display = rows.find((r) => r.line.sku === 'LPD-BSU63V12')!
    expect(display.rate).toBeCloseTo(((23000 + 16000 + 15000) * 1.42) / (4.6575 + 3.24 + 3.0375), 6)
    expect(display.amount).toBeCloseTo(display.line.quantity * display.rate!, 6)
    expect(total).toBeCloseTo(
      rows.reduce((s, r) => s + r.amount, 0),
      6,
    )
    expect(display.procured).toBe(10) // PO-00310 line for this product
  })

  it('takes delivered quantities from the Asset Register and keeps category totals consistent', () => {
    const { rows } = buildBoq(boq, lines, orders, poLines)
    for (const c of deliveryByCategory(rows)) expect(c.delivered + c.inTransit + c.notOrdered).toBeCloseTo(c.total, 9)
  })

  it('treats Delivered / Installed (not "Not …") as delivered', () => {
    expect(isDeliveredStatus('Delivered')).toBe(true)
    expect(isDeliveredStatus('Installed')).toBe(true)
    expect(isDeliveredStatus('Not Delivered')).toBe(false)
    expect(isDeliveredStatus('In Transit')).toBe(false)
  })
})

describe('tasks, milestones and progress', () => {
  const today = '2026-06-10'
  // Milestone form: starts with the project (2026-06-01), 5 days → ends 2026-06-05; its tasks point to it (Task.Milestone)
  const plan: PlanMilestone = {
    id: 'm',
    no: 'M1',
    name: 'MS1 | Build',
    status: { id: 's', label: 'Active' },
    owner: null,
    flag: '',
    startsAfterIn: 'Days',
    startsAfter: 0,
    duration: 5,
  }
  const ms = { id: 'm', label: 'MS1 | Build' }
  // Work package root AV01 (group row), a task under it, a task straight under the milestone and its sub-task
  const wp = task({ id: 'l', name: 'AV01 | Lobby', type: 'Work Package', milestone: ms })
  const t1 = task({ id: 'a', type: 'Work Package', parent: { id: 'l', label: 'AV01 | Lobby' }, milestone: ms, percent: 100, actualEnd: '2026-06-04', priority: 'High' })
  const t2 = task({ id: 'b', milestone: ms, percent: 50, startDate: '2026-06-09', endDate: '2026-06-08', priority: 'High', owners: [{ id: 'u9', label: 'Outsider' }] })
  const sub = task({ id: 'c', parent: { id: 'b', label: 'T' }, milestone: ms })
  const all = [wp, t1, t2, sub]

  it('builds Milestone → work packages / tasks → sub-tasks; Delayed when the planned end has passed', () => {
    const [m] = buildMilestones([plan], all, '2026-06-01', today)
    expect(m).toMatchObject({ start: '2026-06-01', end: '2026-06-05', done: 1, state: 'Delayed' })
    expect(m.packages.map((l) => l.id)).toEqual(['l'])
    expect(m.roots.map((l) => l.id)).toEqual(['b'])
    expect(m.tasks.map((t) => t.id).sort()).toEqual(['a', 'b', 'c'])
    expect(Math.round(m.progress)).toBe(33)
    expect(health([m], 0)).toBe('At Risk')
  })

  it('counts milestone dates from the project start (Days / Weeks / Months) and back', () => {
    expect(milestoneStart('2026-01-31', 1, 'Months')).toBe('2026-03-03')
    expect(milestoneStart('2026-06-01', 2, 'Weeks')).toBe('2026-06-15')
    expect(milestoneStart('', 2, 'Weeks')).toBe('')
    expect(startsAfterFor('2026-06-01', '2026-06-15', 'Weeks')).toEqual({ after: 2, unit: 'Weeks' })
    expect(startsAfterFor('2026-06-01', '2026-06-16', 'Weeks')).toEqual({ after: 15, unit: 'Days' })
    expect(startsAfterFor('2026-06-01', '2026-08-01', 'Months')).toEqual({ after: 2, unit: 'Months' })
    expect(endFromDuration('2026-06-01', 5)).toBe('2026-06-05')
    expect(durationOf('2026-06-01', '2026-06-05')).toBe(5)
    expect(durationOf('2026-06-05', '2026-06-01')).toBe(0)
  })

  it('computes task-weighted actual progress and milestone-date planned progress', () => {
    const ms = buildMilestones([plan], all, '2026-06-01', today)
    expect(progress(all, ms, today)).toEqual({ actual: 50, planned: 100 })
    expect(progress([], [], today)).toEqual({ actual: null, planned: null })
  })

  it('lists open high-priority / delayed tasks and today’s tasks (never work package group rows)', () => {
    expect(priorityTasks(all, today).map((t) => t.id)).toEqual(['b'])
    expect(todaysTasks([task({ id: 'r', startDate: today, endDate: today })], today)).toHaveLength(1)
    expect(todaysTasks([task({ id: 'w', type: 'Work Package', startDate: today, endDate: today })], today)).toHaveLength(0)
  })

  it('flags data issues instead of hiding them', () => {
    expect(taskIssues(t2, all, new Set(['u1']))).toEqual(['Due date is before the start date', 'Not on the project team: Outsider'])
    expect(taskIssues(task({ id: 'z' }), all, new Set(), new Set(['m']))).toEqual(['No milestone — set it in the task'])
    expect(taskIssues(task({ id: 'y', milestone: { id: 'other', label: 'X' } }), all, new Set(), new Set(['m']))).toEqual(['Milestone is not in this project'])
  })

  it('tags technicians by Users.Role and marks who is on site today', () => {
    const team = teamWithToday(
      [
        { id: 'u1', name: 'A', role: 'Site Supervisor / Installer', projectRole: '', status: 'Active', rowId: '', roleId: '' },
        { id: 'u2', name: 'B', role: 'Project Manager', projectRole: '', status: 'Active', rowId: '', roleId: '' },
      ],
      [task({ owners: [{ id: 'u1', label: 'A' }] })],
    )
    expect(team).toMatchObject({ technicians: 1, users: 1 })
    expect(team.rows[0]).toMatchObject({ technician: true, onSiteToday: true })
  })

  it('handles empty data and divide-by-zero', () => {
    expect(ratio(1, 0)).toBeNull()
    expect(buildMilestones([], [], '', today)).toEqual([])
    expect(buildBoq([], [], [], []).total).toBe(0)
    expect(dueText('2026-06-15', today, false)).toBe('5 days left')
    expect(dueText('2026-06-01', today, false)).toBe('Overdue by 9 days')
    expect(dueText('2026-06-01', today, true)).toBe('')
  })

  it('groups the seeded tasks by their Milestone; tasks without one fall under "No milestone"', () => {
    const tasks = seedTasks.map(toTask)
    const rows = buildMilestones(seedPlanMilestones.map(toPlanMilestone), tasks, '2026-01-01', today)
    expect(rows.map((r) => r.packages.length)).toEqual([0, 2, 0]) // MS4 Project Execution: AV02, AV04
    expect(rows.map((r) => r.roots.length)).toEqual([2, 0, 2])
    expect(rows[1].tasks.map((t) => t.id).sort()).toEqual(['7103', '7104', '7105', '7108', '7109'])
    expect(milestoneTasks(tasks, null).roots.map((t) => t.id)).toEqual(['7201'])
    expect(workPackageGroups(tasks).map((g) => [g.root.id, g.tasks.length])).toEqual([
      ['7002', 3],
      ['7004', 2],
    ])
  })
})

describe('pipeline stages', () => {
  it('come only from the Status records: Order = stage (by Order), no Order = any-time status', async () => {
    const { createMockSource } = await import('@/lib/data/mockSource')
    const { seedStatuses } = await import('@/lib/data/seed')
    const extra = [
      { ID: '9901', Status_Name: 'Site Survey', Index_field: '901', Modules: ['Project'], Order: '1.5' },
      { ID: '9902', Status_Name: 'Suspended', Index_field: '902', Modules: ['Project'], Order: '' },
      { ID: '9903', Status_Name: 'Not Started', Index_field: '903', Modules: ['Task'], Order: '' },
    ]
    seedStatuses.push(...extra)
    try {
      const d = await createMockSource({ latencyMs: 0, persist: false }).getProjectDetails('1001')
      const stages = d.stages.filter((s) => !s.anytime).map((s) => s.label)
      expect(stages.slice(0, 3)).toEqual(['Registered', 'Site Survey', 'Kick-Off Done'])
      expect(d.stages.filter((s) => s.anytime).map((s) => s.label)).toEqual(['On Hold', 'Cancelled', 'Suspended'])
      expect(d.stages.map((s) => s.label)).not.toContain('Not Started') // not a Project status
    } finally {
      seedStatuses.splice(seedStatuses.length - extra.length, extra.length)
    }
  })
})
