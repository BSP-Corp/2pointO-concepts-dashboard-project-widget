import { useMemo, useState } from 'react'
import { Modal } from '@/features/console/ui'
import { useOptions, useUpdateBoq } from '@/features/projects/api'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { sortByOrder } from '@/lib/utils'
import type { BoqLine, Project } from '@/types/domain'

const BOQ_STATUSES = { key: 'boqStatuses', report: '', label: '' }

/** Edit one BOQ line (BOQ form "Purchase Information" fields). Saves only what changed. */
export function BoqEditDialog({ project, line, order, onClose }: { project: Project; line: BoqLine; order: string[]; onClose: () => void }) {
  const statuses = useOptions(BOQ_STATUSES)
  const update = useUpdateBoq(project)
  const initial = useMemo(
    () => ({
      Status: line.statusId,
      PO: line.po,
      PO_Date: line.poDate,
      Mode_of_Transit: line.modeOfTransit,
      ETA: line.eta,
      Delivered_to_2_0_Warehouse: line.deliveredToWarehouse,
      Date_delivered_to_warehouse: line.dateDeliveredToWarehouse,
      Delivered_to_Customer: line.deliveredToCustomer,
      Date_delivered_to_customer: line.dateDeliveredToCustomer,
    }),
    [line],
  )
  const [v, setV] = useState(initial)
  const set = (k: keyof typeof initial, value: string) => setV((s) => ({ ...s, [k]: value }))
  const options = sortByOrder(statuses.data ?? [], order)
  const dates = new Set(['PO_Date', 'ETA', 'Date_delivered_to_warehouse', 'Date_delivered_to_customer'])
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).filter((k) => v[k] !== initial[k])
  const etaBeforePo = !!v.PO_Date && !!v.ETA && v.ETA < v.PO_Date
  const save = () => {
    if (changed.length === 0) return onClose()
    const data = Object.fromEntries(changed.map((k) => [k, dates.has(k) ? (v[k] ? toCreatorDate(v[k]) : '') : v[k]]))
    update.mutate({ boqId: line.id, data }, { onSuccess: onClose })
  }

  return (
    <Modal title={`Edit · ${line.sku || line.description || 'BOQ line'}`} onClose={onClose} wide>
      <p className="gc-small gc-soft gc-wrap">
        {[line.vendor, line.category, line.brand, line.model].filter(Boolean).join(' · ')} · Qty {line.quantity} {line.uom}
      </p>
      <div className="gc-po-grid">
        <label className="gc-field">
          <span className="gc-label">Status</span>
          <select value={v.Status} onChange={(e) => set('Status', e.target.value)}>
            <option value="">{statuses.isLoading ? 'Loading…' : '-Select-'}</option>
            {line.statusId && !options.some((o) => o.id === line.statusId) && <option value={line.statusId}>{line.status}</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {statuses.error && <span className="gc-small gc-danger">{statuses.error.message}</span>}
        </label>
        <label className="gc-field">
          <span className="gc-label">PO#</span>
          <input value={v.PO} onChange={(e) => set('PO', e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Mode of Transit</span>
          <select value={v.Mode_of_Transit} onChange={(e) => set('Mode_of_Transit', e.target.value)}>
            <option value="">-Select-</option>
            {['Road', 'Air', 'Sea'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Start date (PO Date)</span>
          <input type="date" value={v.PO_Date} onChange={(e) => set('PO_Date', e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">End date (ETA)</span>
          <input type="date" value={v.ETA} min={v.PO_Date || undefined} onChange={(e) => set('ETA', e.target.value)} />
        </label>
        <span />
        <label className="gc-field">
          <span className="gc-label">Delivered to 2.0 Warehouse</span>
          <select value={v.Delivered_to_2_0_Warehouse} onChange={(e) => set('Delivered_to_2_0_Warehouse', e.target.value)}>
            <option value="">-Select-</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Warehouse date</span>
          <input type="date" value={v.Date_delivered_to_warehouse} onChange={(e) => set('Date_delivered_to_warehouse', e.target.value)} />
        </label>
        <span />
        <label className="gc-field">
          <span className="gc-label">Delivered to Customer</span>
          <select value={v.Delivered_to_Customer} onChange={(e) => set('Delivered_to_Customer', e.target.value)}>
            <option value="">-Select-</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Completion date (delivered to customer)</span>
          <input type="date" value={v.Date_delivered_to_customer} onChange={(e) => set('Date_delivered_to_customer', e.target.value)} />
        </label>
      </div>
      {(etaBeforePo || update.error) && (
        <p className="gc-small gc-danger" role="alert">
          {etaBeforePo ? 'ETA must be on or after the PO date' : update.error!.message}
        </p>
      )}
      <div className="gc-modal__actions">
        <button type="button" className="gc-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="gc-btn gc-btn--primary" disabled={update.isPending || etaBeforePo} onClick={save}>
          {update.isPending ? 'Saving…' : changed.length ? 'Save changes' : 'Close'}
        </button>
      </div>
    </Modal>
  )
}
