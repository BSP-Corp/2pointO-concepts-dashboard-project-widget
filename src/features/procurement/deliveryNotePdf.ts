import { COMPANY } from '@/config/zoho'
import { A4, PdfDoc, downloadBlob, textWidth, wrap, type PdfImage } from '@/lib/pdf'
import { formatDate, formatQty } from '@/lib/utils'
import type { DeliveryNote, DeliveryNotePrintInfo, PoLine, Project } from '@/types/domain'

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const M = 40
const RIGHT = A4.width - M
/** Table columns: #, item, from (receipt / storage), qty, amount */
const COLS = { no: M, item: M + 22, from: M + 230, qty: RIGHT - 80, amount: RIGHT }
const LOGO_H = 48
const LOGO_MAX_W = 170

type PrintProject = Pick<Project, 'reference' | 'name' | 'client'>

/**
 * The delivery note as a PDF: company logo with the organization's name and address (Zoho Books), the customer (billing and
 * delivery address, TRN, contact), the note's details, the customer notes, the lines with the receipt and storage they come from, totals, signatures.
 */
export function deliveryNotePdf(note: DeliveryNote, poLines: PoLine[], project?: PrintProject, info?: DeliveryNotePrintInfo | null, logo?: PdfImage | null) {
  const pdf = new PdfDoc()
  let y = M
  const newPageIfNeeded = (need: number) => {
    if (y + need <= A4.height - M) return
    pdf.addPage()
    y = M
    header()
  }
  const header = () => {
    pdf.text(COLS.no, y + 9, '#', 8, true)
    pdf.text(COLS.item, y + 9, 'Item', 8, true)
    pdf.text(COLS.from, y + 9, 'From (receipt / storage)', 8, true)
    pdf.textRight(COLS.qty, y + 9, 'Qty', 8, true)
    pdf.textRight(COLS.amount, y + 9, 'Amount', 8, true)
    pdf.line(M, y + 14, RIGHT, y + 14, 0.8)
    y += 22
  }

  // ── Letterhead: logo on the left, organization name and address on the right ──
  const org = info?.organization
  const orgName = org?.name || COMPANY.name
  let logoBottom = y
  if (logo) {
    const w = Math.min(LOGO_MAX_W, (logo.width / logo.height) * LOGO_H)
    const h = (logo.height / logo.width) * w
    pdf.image(M, y, w, h, logo)
    logoBottom = y + h
  } else {
    pdf.text(M, y + 20, orgName, 20, true)
    logoBottom = y + 26
  }
  const orgLines = [
    ...(org?.address ?? []),
    [org?.phone && `Tel ${org.phone}`, org?.email].filter(Boolean).join('  ·  '),
    org?.website ?? '',
    org?.taxValue ? `${org.taxLabel || 'TRN'}: ${org.taxValue}` : '',
  ].filter(Boolean)
  const blockW = 230
  // Without a logo the name is already printed large on the left
  let oy = y - 1
  if (logo) pdf.textRight(RIGHT, (oy = y + 10), orgName, 11, true)
  for (const line of orgLines.flatMap((l) => wrap(l, blockW, 8.5))) {
    oy += 11
    pdf.textRight(RIGHT, oy, line, 8.5)
  }
  y = Math.max(logoBottom, oy) + 12
  pdf.line(M, y, RIGHT, y, 1)
  y += 22

  // ── Title ──
  pdf.text(M, y, 'DELIVERY NOTE', 18, true)
  pdf.textRight(RIGHT, y - 6, note.no || 'Delivery note', 12, true)
  pdf.textRight(RIGHT, y + 8, [note.date ? formatDate(note.date) : '', `Status: ${note.status || 'Draft'}`].filter(Boolean).join('  ·  '), 9)
  y += 22

  // ── Customer (billing) and delivery address ──
  const c = info?.customer
  const half = (RIGHT - M - 20) / 2
  const box = (x: number, title: string, lines: { text: string; bold?: boolean }[]) => {
    let by = y
    pdf.text(x, by, title.toUpperCase(), 7.5, true)
    by += 13
    for (const l of lines)
      for (const t of wrap(l.text, half, l.bold ? 10 : 8.5, l.bold)) {
        pdf.text(x, by, t, l.bold ? 10 : 8.5, l.bold)
        by += l.bold ? 13 : 11
      }
    return by
  }
  const customerLines = [
    { text: c?.name || project?.client || '-', bold: true },
    ...(c?.attention ? [{ text: `Attn: ${c.attention}` }] : []),
    ...(c?.address ?? []).map((text) => ({ text })),
    ...(c?.trn ? [{ text: `TRN: ${c.trn}` }] : []),
    ...([c?.phone, c?.mobile].filter(Boolean).length ? [{ text: `Tel ${[c?.phone, c?.mobile].filter(Boolean).join(' / ')}` }] : []),
    ...(c?.email ? [{ text: c.email }] : []),
  ]
  const ship = c?.shipAddress.length ? c.shipAddress : (c?.address ?? [])
  const deliverLines = [
    { text: c?.shipAttention || c?.name || project?.client || '-', bold: true },
    ...ship.map((text) => ({ text })),
    ...(project ? [{ text: `Project: ${[info?.projectReference || project.reference, project.name].filter(Boolean).join(' - ')}` }] : []),
  ]
  const end = Math.max(box(M, 'Customer', customerLines), box(M + half + 20, 'Deliver to', deliverLines))
  y = end + 8
  pdf.line(M, y, RIGHT, y, 0.4)
  y += 16

  // ── Note details ──
  const details: [string, string][] = [
    ['Reference', note.reference],
    ['Challan type', note.challanType],
    ['Warehouse', note.warehouse],
    ['Vehicle no.', note.vehicleNo],
    ['Driver', note.driverName],
    ['Received by', note.receivedBy],
    ['Delivered on', note.deliveredDate ? formatDate(note.deliveredDate) : ''],
  ]
  const rows = Math.ceil(details.length / 2)
  details.forEach(([label, value], i) => {
    const x = i < rows ? M : M + 270
    const row = i < rows ? i : i - rows
    pdf.text(x, y + row * 15, label, 8, true)
    pdf.text(x + Math.max(78, textWidth(label, 8, true) + 8), y + row * 15, value || '-', 9)
  })
  y += rows * 15 + 6

  // ── Customer notes (Delivery_Note.Customer_Notes) ──
  const notes = note.notes.trim() ? wrap(note.notes.trim(), RIGHT - M - 16, 9) : ['-']
  newPageIfNeeded(30 + notes.length * 11)
  pdf.text(M, y + 9, 'CUSTOMER NOTES', 7.5, true)
  const top = y + 14
  notes.forEach((t, n) => pdf.text(M + 8, top + 12 + n * 11, t, 9))
  const bottom = top + 12 + (notes.length - 1) * 11 + 7
  pdf.line(M, top, RIGHT, top, 0.4)
  pdf.line(M, bottom, RIGHT, bottom, 0.4)
  pdf.line(M, top, M, bottom, 0.4)
  pdf.line(RIGHT, top, RIGHT, bottom, 0.4)
  y = bottom + 18

  header()
  note.lines.forEach((l, i) => {
    const po = poLines.find((p) => p.id === l.id)
    const item = wrap([po?.item, l.description || po?.description].filter(Boolean).join(' - ') || l.id, COLS.from - COLS.item - 10, 9)
    const from = wrap([l.prNo, ...l.locations].filter(Boolean).join('\n') || '-', COLS.qty - 40 - COLS.from, 8)
    const height = Math.max(item.length * 11, from.length * 10) + 8
    newPageIfNeeded(height)
    pdf.text(COLS.no, y + 9, String(i + 1), 9)
    item.forEach((t, n) => pdf.text(COLS.item, y + 9 + n * 11, t, 9))
    from.forEach((t, n) => pdf.text(COLS.from, y + 9 + n * 10, t, 8))
    pdf.textRight(COLS.qty, y + 9, formatQty(l.quantity), 9)
    pdf.textRight(COLS.amount, y + 9, money(l.amount), 9)
    y += height
    pdf.line(M, y - 3, RIGHT, y - 3, 0.3)
  })
  if (!note.lines.length) {
    pdf.text(COLS.item, y + 9, 'No lines', 9)
    y += 20
  }
  newPageIfNeeded(30)
  pdf.textRight(COLS.qty, y + 12, 'Total', 10, true)
  pdf.textRight(COLS.amount, y + 12, money(note.total), 10, true)
  y += 30

  newPageIfNeeded(70)
  y += 40
  pdf.line(M, y, M + 200, y, 0.6)
  pdf.line(RIGHT - 200, y, RIGHT, y, 0.6)
  pdf.text(M, y + 12, `Delivered by (${orgName})`, 8)
  pdf.text(RIGHT - 200, y + 12, 'Received by (name / signature / stamp)', 8)

  return pdf.toBlob()
}

export function downloadDeliveryNote(note: DeliveryNote, poLines: PoLine[], project?: PrintProject, info?: DeliveryNotePrintInfo | null, logo?: PdfImage | null) {
  downloadBlob(deliveryNotePdf(note, poLines, project, info, logo), `${(note.no || 'delivery-note').replace(/[^\w.-]+/g, '_')}.pdf`)
}
