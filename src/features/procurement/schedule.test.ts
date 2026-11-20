import { describe, expect, it } from 'vitest'
import type { BoqLine } from '@/types/domain'
import { partsOf } from './location'
import { isReceiptOnlyStatus, missingInfo, stageStatus, statusBlock, type ScheduleRow } from './schedule'

const line = (b: Partial<BoqLine>): BoqLine => ({
  id: 'b1', workPackage: '', vendor: 'Uniguest', vendorId: 'v1', category: '', type: '', brand: '', sku: 'NTB', model: 'NTB', description: '', uom: '',
  quantity: 3, warranty: '', status: 'Order Pending ⚠️', statusId: 's1', productId: 'p1', lineIds: [], poDate: '', po: '', modeOfTransit: '', eta: '',
  deliveredToWarehouse: '', dateDeliveredToWarehouse: '', deliveredToCustomer: '', dateDeliveredToCustomer: '', ...b,
})
const row = (b: Partial<BoqLine> = {}, r: Partial<ScheduleRow> = {}): ScheduleRow =>
  ({ line: line(b), rate: 10, unitCost: 8, amount: 30, procured: 0, delivered: 0, inTransit: 0, assets: [], issues: [], orders: [], poLines: [], ordered: 0, received: 0, poValue: 0, pending: 0, left: 3, notes: [], state: 'order', ...r }) as ScheduleRow

describe('procurement line status rules (19-Oct)', () => {
  it('keeps Warehouse / On Site statuses for goods receipt and delivery notes', () => {
    for (const s of ['2.0 Dubai Warehouse 📍', '2.0 Riyadh Office 📍', 'Delivered to Client  ✅', 'Partially Delivered 🚧']) {
      expect(isReceiptOnlyStatus(s)).toBe(true)
      expect(statusBlock(row(), s)).toMatch(/set only by goods receipt/)
    }
    expect(isReceiptOnlyStatus('In Transit 🚛')).toBe(false)
  })

  it('needs vendor and unit cost to move past Not Started', () => {
    expect(statusBlock(row({ vendorId: '' }), 'Ordered  ⏳')).toMatch(/Set the vendor/)
    expect(statusBlock(row({}, { unitCost: null }), 'In Production ⚙️')).toMatch(/no unit cost/)
    expect(statusBlock(row({ vendorId: '' }), 'Not Ordered 🚩')).toBe('')
    expect(statusBlock(row(), 'Ordered  ⏳')).toBe('')
  })

  it('needs ETA and mode of transit for In Transit / In Customs', () => {
    expect(statusBlock(row(), 'In Transit 🚛')).toMatch(/ETA date/)
    expect(statusBlock(row({ eta: '2026-11-20' }), 'In Customs 🚨')).toMatch(/mode of transit/)
    expect(statusBlock(row({ eta: '2026-11-20', modeOfTransit: 'Sea' }), 'In Transit 🚛')).toBe('')
  })

  it('lists what a line still needs: vendor and cost always, ETA and mode while on order', () => {
    expect(missingInfo(row({ vendorId: '' }, { unitCost: 0 }))).toEqual(['vendor', 'unit cost'])
    expect(missingInfo(row({}, { ordered: 3, pending: 3 }))).toEqual(['ETA', 'transit mode'])
    expect(missingInfo(row({}, { ordered: 3, pending: 0 }))).toEqual([])
  })
})

describe('line status follows the stage of its goods (4 Nov)', () => {
  it('3 ordered, 2 received shows Partially Received — not the warehouse status', () => {
    expect(stageStatus(row({ status: '2.0 Dubai Warehouse 📍' }, { ordered: 3, received: 2 }))).toBe('Partially Received')
    expect(stageStatus(row({ status: '2.0 Dubai Warehouse 📍' }, { ordered: 3, received: 3 }))).toBe('Received')
    expect(stageStatus(row({}, { ordered: 3, received: 3, delivered: 1 }))).toBe('Partially Delivered')
    expect(stageStatus(row({}, { ordered: 3, received: 3, delivered: 3 }))).toBe('Delivered')
  })

  it('keeps the BOQ status until goods move, and drops a stale receipt status', () => {
    expect(stageStatus(row({ status: 'In Transit 🚛' }, { ordered: 3 }))).toBe('In Transit 🚛')
    expect(stageStatus(row({ status: '2.0 Dubai Warehouse 📍' }, { ordered: 3 }))).toBe('Ordered')
  })
})

describe('warehouse location labels', () => {
  it('reads rack, bay, level, side and pallet from a stored label', () => {
    expect(partsOf('2.0 Warehouse · R1-A-L2-Left · P04 · 3')).toEqual({ rack: '1', bay: 'A', level: '2', side: 'Left', pallet: 'P04', rest: '2.0 Warehouse · 3' })
    expect(partsOf('Not placed · 2')).toEqual({ pallet: undefined, rest: 'Not placed · 2' })
  })
})
