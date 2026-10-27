import { useMemo, useState } from 'react'
import { LOOKUPS } from '@/config/projectForm'
import { Modal } from '@/features/console/ui'
import { useCreatePurchaseOrder, useOptions } from '@/features/projects/api'
import { formatMoney, formatQty } from '@/lib/utils'
import type { TabContext } from './ProjectTabs'
import { localToday } from './model'

const VENDORS = { key: 'vendors', report: '', label: '' }
const TAXES = { key: 'taxes', report: '', label: '' }

interface Line {
  selected: boolean
  quantity: string
  rate: string
  taxId: string
}

/**
 * Create PO: Widget.project_create_po inserts the Purchase_Order + PO_Line_Items (PO number as the form's workflow)
 * and pushes it to Zoho Books with the existing ZohoBooks.Purchase_Order_Creator_books_Sync.
 * PO line quantities are whole numbers (PO_Line_Items.Quantity is a Number field) and never exceed what is left to order.
 */
export function CreatePoDialog({ c, onClose }: { c: TabContext; onClose: () => void }) {
  const vendors = useOptions(VENDORS)
  const countries = useOptions(LOOKUPS.countries)
  const taxes = useOptions(TAXES)
  const create = useCreatePurchaseOrder(c.project.id)
  const rows = useMemo(() => (c.boq?.rows ?? []).map((r) => ({ r, left: Math.max(0, Math.floor(r.line.quantity - r.procured)) })).filter((x) => x.r.line.productId), [c.boq])
  const [vendorId, setVendorId] = useState('')
  const [countryId, setCountryId] = useState('')
  const [date, setDate] = useState(localToday())
  const [deliveryDate, setDeliveryDate] = useState('')
  const [reference, setReference] = useState(c.project.reference)
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('0')
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(rows.map(({ r, left }) => [r.line.id, { selected: false, quantity: String(left), rate: r.unitCost === null ? '' : String(Math.round(r.unitCost * 100) / 100), taxId: '' }])),
  )
  const [done, setDone] = useState<{ poNo: string; booksSynced: boolean } | null>(null)

  const chosen = rows.filter(({ r }) => lines[r.line.id]?.selected)
  const problems = [
    !vendorId && 'Select a vendor',
    !countryId && 'Select a country (Books organisation)',
    chosen.length === 0 && 'Select at least one BOQ line',
    ...chosen.map(({ r, left }) => {
      const l = lines[r.line.id]
      const q = Number(l.quantity)
      if (!Number.isInteger(q) || q <= 0) return `${r.line.description || r.line.sku}: quantity must be a whole number above 0`
      if (q > left) return `${r.line.description || r.line.sku}: only ${left} left to order`
      if (l.rate === '' || Number(l.rate) < 0) return `${r.line.description || r.line.sku}: enter a rate`
      return false
    }),
  ].filter((x): x is string => !!x)
  const subTotal = chosen.reduce((s, { r }) => s + Number(lines[r.line.id].quantity) * Number(lines[r.line.id].rate || 0), 0)
  const set = (id: string, patch: Partial<Line>) => setLines((s) => ({ ...s, [id]: { ...s[id], ...patch } }))

  const submit = () =>
    create.mutate(
      {
        projectId: c.project.id,
        vendorId,
        countryId,
        date,
        deliveryDate,
        reference,
        notes,
        discount: Number(discount) || 0,
        lines: chosen.map(({ r }) => ({
          boqId: r.line.id,
          productId: r.line.productId,
          description: r.line.description,
          quantity: Number(lines[r.line.id].quantity),
          rate: Number(lines[r.line.id].rate),
          taxId: lines[r.line.id].taxId,
        })),
      },
      { onSuccess: (res) => setDone(res) },
    )

  if (done)
    return (
      <Modal title="Purchase order created" onClose={onClose}>
        <p>
          <strong>{done.poNo}</strong> was created in Creator.{' '}
          {done.booksSynced ? 'It was also created in Zoho Books.' : 'Zoho Books did not return a PO ID — check the vendor and product Books IDs (Developer Log).'}
        </p>
        <div className="gc-modal__actions">
          <button type="button" className="gc-btn gc-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title="Create purchase order" onClose={onClose} wide>
      <div className="gc-po-grid">
        <label className="gc-field">
          <span className="gc-label">Vendor *</span>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">{vendors.isLoading ? 'Loading…' : '-Select-'}</option>
            {vendors.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Country *</span>
          <select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
            <option value="">{countries.isLoading ? 'Loading…' : '-Select-'}</option>
            {countries.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">PO date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Delivery date</span>
          <input type="date" value={deliveryDate} min={date} onChange={(e) => setDeliveryDate(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Reference#</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Discount %</span>
          <input type="number" min="0" max="100" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </label>
        <label className="gc-field gc-po-grid__wide">
          <span className="gc-label">Notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="gc-table-wrap">
        <table className="gc-table gc-table--compact">
          <thead>
            <tr>
              <th scope="col">
                <span className="gc-sr">Select</span>
              </th>
              <th scope="col">BOQ item</th>
              <th scope="col" className="gc-num">BOQ qty</th>
              <th scope="col" className="gc-num">Left to order</th>
              <th scope="col" className="gc-num">PO qty</th>
              <th scope="col" className="gc-num">Rate</th>
              <th scope="col">Tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, left }) => {
              const l = lines[r.line.id]
              return (
                <tr key={r.line.id}>
                  <td>
                    <input type="checkbox" aria-label={`Order ${r.line.description}`} checked={l.selected} disabled={left === 0} onChange={(e) => set(r.line.id, { selected: e.target.checked })} />
                  </td>
                  <td className="gc-wrap">
                    <strong>{r.line.sku || '—'}</strong> <span className="gc-soft">{r.line.description}</span>
                  </td>
                  <td className="gc-num">{formatQty(r.line.quantity)}</td>
                  <td className="gc-num">{left}</td>
                  <td className="gc-num">
                    <input className="gc-input-sm" type="number" min="1" step="1" max={left} value={l.quantity} disabled={!l.selected} onChange={(e) => set(r.line.id, { quantity: e.target.value })} aria-label="PO quantity" />
                  </td>
                  <td className="gc-num">
                    <input className="gc-input-sm" type="number" min="0" step="0.01" value={l.rate} disabled={!l.selected} onChange={(e) => set(r.line.id, { rate: e.target.value })} aria-label="Rate" />
                  </td>
                  <td>
                    <select value={l.taxId} disabled={!l.selected} onChange={(e) => set(r.line.id, { taxId: e.target.value })} aria-label="Tax">
                      <option value="">No tax</option>
                      {taxes.data?.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="gc-po-foot">
        <span>
          Sub total <b>{formatMoney(subTotal)}</b> · Total <b>{formatMoney(subTotal - (subTotal * (Number(discount) || 0)) / 100)}</b>
        </span>
        {(create.error || problems.length > 0) && (
          <span className="gc-small gc-danger" role="alert">
            {create.error?.message ?? problems[0]}
          </span>
        )}
      </div>
      <div className="gc-modal__actions">
        <button type="button" className="gc-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="gc-btn gc-btn--primary" disabled={problems.length > 0 || create.isPending} onClick={submit}>
          {create.isPending ? 'Creating…' : 'Create PO'}
        </button>
      </div>
    </Modal>
  )
}
