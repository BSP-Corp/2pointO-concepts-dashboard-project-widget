import { useEffect, useRef, useState } from 'react'
import { SidePanel } from '@/features/console/ui'
import { daysBetween, localToday } from '@/features/project/model'
import { formatDate, formatQty } from '@/lib/utils'
import type { Option, StockPlace } from '@/types/domain'
import { LocationLabel, LocationTags } from './location'
import { isReceiptOnlyStatus, statusBlock, type ScheduleRow } from './schedule'

const itemName = (r: ScheduleRow) => r.line.model || r.line.sku || r.line.description || 'Item'

/** Days a unit has been in the store: from its receive date until today */
const daysIn = (s: StockPlace) => (s.received ? Math.max(0, daysBetween(s.received, localToday())) : null)

function StockTable({ places, withItem }: { places: { item?: string; place: StockPlace }[]; withItem?: boolean }) {
  return (
    <table className="gc-po-table gc-stock" aria-label="Stock">
      <thead>
        <tr>
          {withItem && <th scope="col">Item</th>}
          <th scope="col" className="gc-num">
            Qty
          </th>
          <th scope="col">Warehouse</th>
          <th scope="col">Location</th>
          <th scope="col">Serials</th>
          <th scope="col">GRN</th>
          <th scope="col">Received</th>
          <th scope="col" className="gc-num">
            Days in store
          </th>
        </tr>
      </thead>
      <tbody>
        {places.map(({ item, place: s }, i) => (
          <tr key={s.id || i}>
            {withItem && <td className="gc-po-wrap">{item}</td>}
            <td className="gc-num">{formatQty(s.qty)}</td>
            <td>{s.warehouse || '—'}</td>
            <td className={s.location ? '' : 'gc-pg-late'}>
              {s.pallet || s.rack ? <LocationTags rack={s.rack} bay={s.bay} level={s.level} side={s.side} pallet={s.pallet} /> : s.location ? <LocationLabel label={s.location} /> : 'Not placed'}
            </td>
            <td className="gc-stock__serials" title={s.serials.join('\n')}>
              {s.serials.length ? s.serials.join(', ') : '—'}
            </td>
            <td className="gc-pg-mono">{s.prNo || '—'}</td>
            <td>{s.received ? formatDate(s.received) : '—'}</td>
            <td className="gc-num">{daysIn(s) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Stock of one BOQ line: each storage row of its receipts still holding units */
export function StockPanel({ row, onClose }: { row: ScheduleRow; onClose: () => void }) {
  const places = row.poLines.flatMap((l) => l.stockLocations.map((place) => ({ place })))
  const total = places.reduce((t, x) => t + x.place.qty, 0)
  return (
    <SidePanel title={`Stock — ${itemName(row)}`} side="left" onClose={onClose} subtitle={`${formatQty(total)} in stock · received ${formatQty(row.received)} · delivered ${formatQty(row.delivered)}`}>
      {places.length === 0 ? <p className="gc-empty">No units of this line are in a warehouse (not received, delivered, or received direct to site).</p> : <StockTable places={places} />}
    </SidePanel>
  )
}

/**
 * Bulk status: one status for the picked lines, or for every line shown (tab / vendor / package filters). Lines the
 * status rules refuse are skipped and listed; Warehouse / On Site statuses are not offered (goods receipt only).
 */
export function BulkStatus({
  picked,
  shown,
  statusOptions,
  busy,
  onApply,
}: {
  picked: ScheduleRow[]
  shown: ScheduleRow[]
  statusOptions: Option[]
  busy: boolean
  onApply: (rows: ScheduleRow[], status: Option) => void
}) {
  const [open, setOpen] = useState(false)
  const [statusId, setStatusId] = useState('')
  const [scope, setScope] = useState<'picked' | 'shown'>(picked.length ? 'picked' : 'shown')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => (document.removeEventListener('mousedown', away), document.removeEventListener('keydown', esc))
  }, [open])
  useEffect(() => setScope(picked.length ? 'picked' : 'shown'), [picked.length])
  const options = statusOptions.filter((o) => !isReceiptOnlyStatus(o.label))
  const status = options.find((o) => o.id === statusId)
  const target = scope === 'picked' ? picked : shown
  const allowed = status ? target.filter((r) => r.line.statusId !== status.id && !statusBlock(r, status.label)) : []
  const refused = status ? target.filter((r) => r.line.statusId !== status.id && statusBlock(r, status.label)) : []
  return (
    <div className="gc-pg-cols" ref={box}>
      <button type="button" className="gc-pg-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? 'Updating…' : 'Bulk status ▾'}
      </button>
      {open && (
        <div className="gc-pg-cols__menu gc-bulk" role="group" aria-label="Bulk status">
          <label className="gc-field">
            <span className="gc-label">Status</span>
            <select value={statusId} onChange={(e) => setStatusId(e.target.value)} aria-label="Status for the lines">
              <option value="">-Select-</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="gc-bulk__scope">
            <legend className="gc-label">Lines</legend>
            <label>
              <input type="radio" name="bulk-scope" checked={scope === 'picked'} disabled={!picked.length} onChange={() => setScope('picked')} /> Picked lines ({picked.length})
            </label>
            <label>
              <input type="radio" name="bulk-scope" checked={scope === 'shown'} onChange={() => setScope('shown')} /> All lines shown ({shown.length})
            </label>
          </fieldset>
          {status && (
            <p className="gc-small gc-soft">
              {allowed.length} line{allowed.length === 1 ? '' : 's'} will change.
              {refused.length > 0 && ` ${refused.length} skipped: ${refused.map((r) => `${itemName(r)} (${statusBlock(r, status.label)})`).join('; ')}`}
            </p>
          )}
          <p className="gc-small gc-soft">Warehouse and On Site statuses are set only by goods receipt.</p>
          <div className="gc-bulk__foot">
            <button type="button" className="gc-pg-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="gc-pg-btn gc-pg-btn--primary"
              disabled={!status || !allowed.length || busy}
              onClick={() => {
                onApply(allowed, status!)
                setOpen(false)
              }}
            >
              Apply to {allowed.length}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
