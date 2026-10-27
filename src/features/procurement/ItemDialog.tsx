import { useState, type ReactNode } from 'react'
import { Modal } from '@/features/console/ui'
import { daysBetween, isDeliveredStatus, localToday, wpTag } from '@/features/project/model'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate, formatMoney, formatQty } from '@/lib/utils'
import type { BoqLine, Option } from '@/types/domain'
import type { ScheduleRow } from './ProcurementPage'

const TRANSIT = ['Road', 'Air', 'Sea']

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gc-proc-fact">
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  )
}

/**
 * One procurement item in a popup: Core data, Purchasing, Transit, Receiving · Packages · Payments.
 * PO date, Status, Mode and ETA are fields; Save writes only what changed to the BOQ record (ETA on / after PO date).
 * PO#, ordered and received come from purchase orders and goods receipts — read-only here.
 */
export function ItemDialog({
  row,
  statusOptions,
  statusLoading,
  saving,
  error,
  selected,
  canSelect,
  onToggleSelect,
  onSave,
  onClose,
}: {
  row: ScheduleRow
  statusOptions: Option[]
  statusLoading: boolean
  saving: boolean
  error?: string
  selected: boolean
  canSelect: boolean
  onToggleSelect: () => void
  onSave: (data: Record<string, unknown>, optimistic: Partial<BoqLine>) => void
  onClose: () => void
}) {
  const b = row.line
  const [poDate, setPoDate] = useState(b.poDate)
  const [status, setStatus] = useState(b.statusId)
  const [mode, setMode] = useState(b.modeOfTransit)
  const [eta, setEta] = useState(b.eta)
  const issuedBy = [...new Set(row.orders.map((o) => o.issuedBy).filter(Boolean))].join(', ')
  const etaDays = eta ? daysBetween(localToday(), eta) : null
  const etaBeforePo = !!poDate && !!eta && eta < poDate
  const name = b.sku || b.model || b.description || 'Item'

  const save = () => {
    const data: Record<string, unknown> = {}
    const optimistic: Partial<BoqLine> = {}
    if (poDate !== b.poDate) ((data.PO_Date = poDate ? toCreatorDate(poDate) : ''), (optimistic.poDate = poDate))
    if (status !== b.statusId) ((data.Status = status), (optimistic.statusId = status), (optimistic.status = statusOptions.find((o) => o.id === status)?.label ?? ''))
    if (mode !== b.modeOfTransit) ((data.Mode_of_Transit = mode), (optimistic.modeOfTransit = mode))
    if (eta !== b.eta) ((data.ETA = eta ? toCreatorDate(eta) : ''), (optimistic.eta = eta))
    if (Object.keys(data).length === 0) return onClose()
    onSave(data, optimistic)
  }

  return (
    <Modal title={name} onClose={onClose} wide className="gc-proc-modal">
      <p className="gc-small gc-soft gc-proc-modal__sub">{[b.description, b.vendor, wpTag(b.workPackage)].filter(Boolean).join(' · ')}</p>
      <div className="gc-proc-sections">
        <section className="gc-proc-section gc-proc-section--plum" aria-label="Core data">
          <h3>Core data</h3>
          <dl>
            <Fact label="Vendor">{b.vendor}</Fact>
            <Fact label="Category">{b.category}</Fact>
            <Fact label="Type">{b.type}</Fact>
            <Fact label="Brand">{b.brand}</Fact>
            <Fact label="Model">{b.model}</Fact>
            <Fact label="SKU">{b.sku}</Fact>
            <Fact label="Warranty">{b.warranty}</Fact>
            <Fact label="UOM">{b.uom}</Fact>
          </dl>
        </section>
        <section className="gc-proc-section gc-proc-section--violet" aria-label="Purchasing">
          <h3>Purchasing</h3>
          <dl>
            <Fact label="Required">{formatQty(b.quantity)}</Fact>
            <Fact label="Ordered">{formatQty(row.procured)}</Fact>
            <Fact label="PO #">{b.po}</Fact>
            <Fact label="Issued by">{issuedBy}</Fact>
            <Fact label="PO value">{row.poValue ? formatMoney(row.poValue) : ''}</Fact>
            <Fact label="PO paid">In Zoho Books</Fact>
          </dl>
          <label className="gc-field">
            <span className="gc-label">PO date</span>
            <input type="date" value={poDate} max={eta || undefined} onChange={(e) => setPoDate(e.target.value)} aria-label={`${name} PO date`} />
          </label>
        </section>
        <section className="gc-proc-section gc-proc-section--teal" aria-label="Transit">
          <h3>Transit</h3>
          <label className="gc-field">
            <span className="gc-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={`${name} status`}>
              <option value="">{statusLoading ? 'Loading…' : '-Select-'}</option>
              {b.statusId && !statusOptions.some((o) => o.id === b.statusId) && <option value={b.statusId}>{b.status}</option>}
              {statusOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="gc-field">
            <span className="gc-label">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label={`${name} mode`}>
              <option value="">-Select-</option>
              {TRANSIT.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="gc-field">
            <span className="gc-label">ETA date</span>
            <input type="date" value={eta} min={poDate || undefined} onChange={(e) => setEta(e.target.value)} aria-label={`${name} ETA date`} />
          </label>
          <dl>
            <Fact label="ETA days">{etaDays === null ? '' : isDeliveredStatus(b.status) ? 'Delivered' : etaDays < 0 ? `${-etaDays} days late` : `${etaDays} days`}</Fact>
            <Fact label="Logistics">No field on the BOQ form</Fact>
          </dl>
        </section>
        <section className="gc-proc-section gc-proc-section--amber" aria-label="Receiving">
          <h3>Receiving · package · payments</h3>
          <dl>
            <Fact label="Received">
              {formatQty(row.received)} of {formatQty(row.procured)} ordered
            </Fact>
            <Fact label="At 2.0 warehouse">{b.deliveredToWarehouse ? `${b.deliveredToWarehouse}${b.dateDeliveredToWarehouse ? ` · ${formatDate(b.dateDeliveredToWarehouse)}` : ''}` : ''}</Fact>
            <Fact label="Delivered to customer">{b.deliveredToCustomer ? `${b.deliveredToCustomer}${b.dateDeliveredToCustomer ? ` · ${formatDate(b.dateDeliveredToCustomer)}` : ''}` : ''}</Fact>
            <Fact label="Package">{b.workPackage}</Fact>
            <Fact label="Balance">{row.poValue ? formatMoney(row.poValue) : ''}</Fact>
          </dl>
          <p className="gc-small gc-soft">Received quantities come from goods receipts (Purchase Receive) — not from a status or a date.</p>
        </section>
      </div>
      {(etaBeforePo || error) && (
        <p className="gc-small gc-proc-warn" role="alert">
          {etaBeforePo ? 'ETA must be on or after the PO date' : error}
        </p>
      )}
      <div className="gc-modal__actions gc-proc-modal__actions">
        <button type="button" className="gc-proc-btn gc-proc-btn--ghost" disabled={!canSelect} onClick={onToggleSelect} title={canSelect ? '' : 'Another vendor is selected, or the line has no product'}>
          {selected ? '✓ Selected for PO' : 'Select for PO'}
        </button>
        <span className="gc-proc-toolbar__spacer" />
        <button type="button" className="gc-proc-btn gc-proc-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="gc-proc-btn gc-proc-btn--po" disabled={saving || etaBeforePo} onClick={save}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Modal>
  )
}
