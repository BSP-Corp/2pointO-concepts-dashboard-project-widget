import { describe, expect, it } from 'vitest'
import { seedBoq, seedCostingLines, seedPlanMilestones, seedPoLines, seedPurchaseOrders, seedTasks } from '@/lib/data/seed'
import { toBoqLine, toCostingLine, toPlanMilestone, toPoLine, toPurchaseOrder, toTask } from '@/lib/data/zohoSource'
import type { PlanMilestone, WorkTask } from '@/types/domain'
import { buildBoq, buildMilestones, deliveryByCategory, dueText, durationOf, endFromDuration, health, isDeliveredStatus, milestoneStart, priorityTasks, progress, ratio, startsAfterFor, taskIssues, teamWithToday, todaysTasks } from './model'

const lines = seedCostingLines.filter((r) => (r.Project as { ID: string } | undefined)?.ID === '1001').map(toCostingLine)
const boq = seedBoq.filter((r) => r.Project_Reference === 'PR_26040').map(toBoqLine)
const orders = seedPurchaseOrders.map(toPurchaseOrder)
const poLines = seedPoLines.map(toPoLine)
const task = (p: Partial<WorkTask>): WorkTask => ({ id: 'x', name: 'T', type: 'Task', taskNo: '', duration: 0, createdBy: '', description: '', priority: '', percent: 0, workHours: 0, workPackage: '', startDate: '', endDate: '', actualStart: '', actualEnd: '', status: null, parent: null, owners: [], lineIds: [], ...p })

describe('BOQ', () => {
  it('prices each line from its approved estimate lines; contract value = BOQ total', () => {
    const { rows, total } = buildBoq(boq, lines, orders, poLines)
    const display = rows.find((r) => r.line.sku === 'LPD-BSU63V12')!
    expect(display.rate).toBeCloseTo((23000 + 16000 + 15000) * 1.42 / (4.6575 + 3.24 + 3.0375), 6)
    expect(display.amount).toBeCloseTo(display.line.quantity * display.rate!, 6)
    expect(total).toBeCloseTo(rows.reduce((s, r) => s + r.amount, 0), 6)
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
  // Milestone form: starts with the project (2026-06-01), 5 days → ends 2026-06-05; its task list is the root Task "TL | Build"
  const plan: PlanMilestone = { id: 'm', no: 'M1', name: 'MS1 | Build', status: { id: 's', label: 'Active' }, owner: null, flag: '', startsAfterIn: 'Days', startsAfter: 0, duration: 5, taskList: 'TL | Build', taskListId: 't1' }
  const list = task({ id: 'l', name: 'TL | Build' })
  const t1 = task({ id: 'a', parent: { id: 'l', label: 'TL | Build' }, percent: 100, actualEnd: '2026-06-04', priority: 'High' })
  const t2 = task({ id: 'b', parent: { id: 'l', label: 'TL | Build' }, percent: 50, startDate: '2026-06-09', endDate: '2026-06-08', priority: 'High', owners: [{ id: 'u9', label: 'Outsider' }] })
  const sub = task({ id: 'c', parent: { id: 'b', label: 'T' } })
  const all = [list, t1, t2, sub]

  it('builds Milestone → task list → tasks → subtasks; Delayed when the planned end has passed', () => {
    const [m] = buildMilestones([plan], all, '2026-06-01', today)
    expect(m).toMatchObject({ start: '2026-06-01', end: '2026-06-05', done: 1, state: 'Delayed' })
    expect(m.lists.map((l) => l.id)).toEqual(['l'])
    expect(m.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c'])
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

  it('lists open high-priority / delayed tasks and today’s tasks (never task lists)', () => {
    expect(priorityTasks(all, today).map((t) => t.id)).toEqual(['b'])
    expect(todaysTasks([task({ id: 'c', parent: { id: 'l', label: '' }, startDate: today, endDate: today })], today)).toHaveLength(1)
    expect(todaysTasks([task({ id: 'r', startDate: today, endDate: today })], today)).toHaveLength(0)
  })

  it('flags data issues instead of hiding them', () => {
    expect(taskIssues(t2, all, new Set(['u1']))).toEqual(['Due date is before the start date', 'Not on the project team: Outsider'])
    expect(taskIssues(task({ id: 'z' }), all, new Set(), new Set(['l']))).toEqual(['Task list is not linked to a milestone'])
  })

  it('tags technicians by Users.Role and marks who is on site today', () => {
    const team = teamWithToday(
      [
        { id: 'u1', name: 'A', role: 'Site Supervisor / Installer', projectRole: '', status: 'Active' },
        { id: 'u2', name: 'B', role: 'Project Manager', projectRole: '', status: 'Active' },
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

  it('links every seeded milestone to its task list(s)', () => {
    const tasks = seedTasks.map(toTask)
    const rows = buildMilestones(seedPlanMilestones.map(toPlanMilestone), tasks, '2026-01-01', today)
    expect(rows.map((r) => r.lists.length)).toEqual([1, 2, 1]) // Project Execution exists per work package (AV02, AV04)
  })
})
