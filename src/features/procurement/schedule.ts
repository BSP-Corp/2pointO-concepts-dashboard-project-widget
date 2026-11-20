import { addDays, isNotOrderedStatus, linesForBoq, type BoqRow } from '@/features/project/model'
import type { DeliveryNote, PoLine, PurchaseOrder } from '@/types/domain'

// Procurement schedule model (reference: 2point0 Ops ProcurementColumnSchedule). One row per BOQ line of the approved
// Cost Analysis; quantities come from the PO lines, goods receipts (Quantity_Received) and delivery notes (Already_Delivered).


export interface ScheduleRow extends BoqRow {
  orders: PurchaseOrder[]
  poLines: PoLine[]
  ordered: number
  received: number
  delivered: number
  poValue: number
  /** Ordered quantity still to receive */
  pending: number
  /** BOQ quantity not yet on a PO */
  left: number
  notes: { id: string; no: string; status: string }[]
  state: 'order' | 'progress' | 'received'
}

export function buildSchedule(rows: BoqRow[], orders: PurchaseOrder[], poLines: PoLine[], deliveryNotes: DeliveryNote[]): ScheduleRow[] {
  return rows.map((r) => {
    const lines = linesForBoq(r.line, orders, poLines)
    const poIds = new Set(lines.map((l) => l.purchaseOrderId))
    const lineIds = new Set(lines.map((l) => l.id))
    const ordered = lines.reduce((s, l) => s + l.quantity, 0)
    const received = lines.reduce((s, l) => s + l.quantityReceived, 0)
    const notes = deliveryNotes.filter((d) => d.lines.some((l) => lineIds.has(l.id))).map((d) => ({ id: d.id, no: d.no, status: d.status }))
    // Delivered notes keep no line link once a later note takes the line: count Already_Delivered, not the notes
    const delivered = lines.reduce((s, l) => s + l.alreadyDelivered, 0)
    const state = r.line.quantity > 0 && received >= r.line.quantity - 1e-9 ? 'received' : ordered > 0 ? 'progress' : 'order'
    return {
      ...r,
      orders: orders.filter((o) => poIds.has(o.id) || o.boqIds.includes(r.line.id)),
      poLines: lines,
      ordered,
      received,
      delivered,
      poValue: lines.reduce((s, l) => s + l.amount, 0),
      pending: Math.max(0, ordered - received),
      left: Math.max(0, Math.floor(r.line.quantity - ordered + 1e-9)),
      notes,
      state,
    }
  })
}

// ── Line status rules (same as Widget.project_task_update) ──
/** Warehouse / office locations and delivered: set only by a goods receipt or a delivery note */
export const isReceiptOnlyStatus = (name: string) => /warehouse|office|delivered/i.test(name)
/** Goods on the way: need an ETA and a mode of transit */
export const isTransitLikeStatus = (name: string) => /transit|customs/i.test(name)

/**
 * Status shown for a line: its own stage from the quantities once goods move — Partially Received / Received (goods
 * receipts against the BOQ quantity), Partially Delivered / Delivered (delivery notes) — otherwise the BOQ status. A
 * receipt-only status (a warehouse, delivered) left on a line with nothing received falls back to Ordered.
 */
export function stageStatus(r: ScheduleRow): string {
  const need = r.line.quantity
  if (r.delivered > 0) return need > 0 && r.delivered >= need - 1e-9 ? 'Delivered' : 'Partially Delivered'
  if (r.received > 0) return need > 0 && r.received >= need - 1e-9 ? 'Received' : 'Partially Received'
  if (isReceiptOnlyStatus(r.line.status)) return r.ordered > 0 ? 'Ordered' : 'Not Started'
  return r.line.status
}

/** What a line still lacks: vendor and unit cost to be ordered; ETA and mode of transit while it is on order */
export function missingInfo(r: ScheduleRow): string[] {
  const out: string[] = []
  if (!r.line.vendorId) out.push('vendor')
  if (!(r.unitCost && r.unitCost > 0)) out.push('unit cost')
  if (r.ordered > 0 && r.pending > 0) {
    if (!r.line.eta) out.push('ETA')
    if (!r.line.modeOfTransit) out.push('transit mode')
  }
  return out
}

/** Why a line may not take this status ('' = allowed) */
export function statusBlock(r: ScheduleRow, name: string): string {
  const label = name.trim()
  if (!label || label === r.line.status.trim()) return ''
  if (isReceiptOnlyStatus(label)) return `${label} is set only by goods receipt or a delivery note`
  if (isNotOrderedStatus(label)) return ''
  if (!r.line.vendorId) return 'Set the vendor before moving the line past Not Started'
  if (!(r.unitCost && r.unitCost > 0)) return 'This line has no unit cost (Cost Analysis) — add it before moving past Not Started'
  if (isTransitLikeStatus(label) && !r.line.eta) return `Enter the ETA date before setting ${label}`
  if (isTransitLikeStatus(label) && !r.line.modeOfTransit) return `Enter the mode of transit before setting ${label}`
  return ''
}

/** "Payment terms: 30 days" (written by Widget.project_create_po into Terms & Conditions) → 30 */
export const termsDaysOf = (terms: string): number | null => {
  const m = /payment terms:\s*(\d+)\s*day/i.exec(terms)
  return m ? Number(m[1]) : null
}
export const dueDateOf = (o: PurchaseOrder): string => {
  const days = termsDaysOf(o.terms)
  return o.date && days !== null ? addDays(o.date, days) : ''
}

export type SectionKey = 'purchasing' | 'transit' | 'delivery' | 'payments' | 'packages'
export type CoreKey = 'vendor' | 'category' | 'type' | 'brand' | 'model' | 'sku' | 'description'

/** Frozen core columns; widths shrink on narrow screens, but never below what a typical name needs to wrap by whole words. */
export const CORE: { key: CoreKey; label: string; width: string }[] = [
  { key: 'vendor', label: 'Vendor', width: 'clamp(112px, calc(13vw - 60px), 160px)' },
  { key: 'category', label: 'Category', width: 'clamp(84px, calc(10vw - 40px), 112px)' },
  { key: 'type', label: 'Type', width: 'clamp(76px, calc(9vw - 40px), 104px)' },
  { key: 'brand', label: 'Brand', width: 'clamp(88px, calc(11vw - 50px), 124px)' },
  { key: 'model', label: 'Model', width: 'clamp(124px, calc(15vw - 70px), 160px)' },
  { key: 'sku', label: 'SKU', width: 'clamp(104px, calc(12vw - 60px), 132px)' },
  { key: 'description', label: 'Item Description', width: 'clamp(150px, calc(26vw - 160px), 260px)' },
]
export const PICK_WIDTH = 44

/** Sections in schedule order: title band / label tint from the reference palette, fixed column widths. */
export const SECTIONS: { key: SectionKey; label: string; band: string; ink: string; tint: string; columns: [string, number][] }[] = [
  {
    key: 'purchasing',
    label: 'Purchasing',
    band: '#44174E',
    ink: '#FFFFFF',
    tint: '#F1EAF3',
    columns: [
      ['Req.', 52],
      ['Ordered', 68],
      ['UoM', 60],
      ['PO #', 112],
      ['PO date', 124],
      ['Issued by', 104],
      ['PO value', 128],
    ],
  },
  {
    key: 'transit',
    label: 'Transit',
    band: '#662249',
    ink: '#FFFFFF',
    tint: '#F4E9EE',
    columns: [
      ['Status', 176],
      ['Mode', 100],
      ['ETA days', 76],
      ['ETA date', 124],
    ],
  },
  {
    key: 'delivery',
    label: 'Receiving',
    band: '#A34054',
    ink: '#FFFFFF',
    tint: '#F9ECEF',
    columns: [
      ['Received', 84],
      ['Delivered', 84],
      ['In stock', 84],
      ['WH date', 124],
      ['Site status', 96],
      ['Site date', 124],
      ['Note / DN', 128],
      ['Receive', 88],
    ],
  },
  {
    key: 'payments',
    label: 'Payments',
    band: '#ED9E59',
    ink: '#1B1931',
    tint: '#FFF3E8',
    columns: [
      ['Terms days', 84],
      ['Due date', 112],
      ['Zoho Books', 108],
    ],
  },
  {
    key: 'packages',
    label: 'Packages',
    band: '#E9BCB9',
    ink: '#1B1931',
    tint: '#FCF2F1',
    columns: [
      ['AV codes', 104],
      ['Packages', 240],
      ['Lines', 52],
    ],
  },
]
export const CORE_BAND = { band: '#1B1931', ink: '#FFFFFF', tint: '#EEEDF2' }
const GAP = 8
const PAD = 16
export const sectionWidth = (s: (typeof SECTIONS)[number]) => s.columns.reduce((t, [, w]) => t + w, 0) + GAP * (s.columns.length - 1) + PAD
export const sectionColumns = (s: (typeof SECTIONS)[number]) => s.columns.map(([, w]) => `${w}px`).join(' ')

/** Width of the frozen core band of a scroll box — 0 when it is not sticky (phones scroll everything together). */
export const frozenWidth = (box: HTMLElement) => {
  const el = box.querySelector<HTMLElement>('[data-pg-frozen]')
  return el && getComputedStyle(el).position === 'sticky' ? el.getBoundingClientRect().width : 0
}

/** Scrolls a box sideways — smooth unless reduced motion; lands directly if the browser did not animate it. */
export function scrollBoxTo(box: HTMLElement, left: number, behavior?: ScrollBehavior) {
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const how = behavior ?? (reduce ? 'auto' : 'smooth')
  if (typeof box.scrollTo !== 'function') {
    box.scrollLeft = left
    return
  }
  const start = box.scrollLeft
  box.scrollTo({ left, behavior: how })
  if (how === 'smooth') setTimeout(() => box.scrollLeft === start && Math.abs(start - left) > 1 && (box.scrollLeft = left), 700)
}
