import { useEffect, useMemo, useState } from 'react'
import { LOOKUPS } from '@/config/projectForm'
import { Modal } from '@/features/console/ui'
import { useCreatePurchaseOrder, useOptions } from '@/features/projects/api'
import { localToday, wpTag } from '@/features/project/model'
import { formatMoney, formatQty } from '@/lib/utils'
import type { Project } from '@/types/domain'
import type { ScheduleRow } from './ProcurementPage'

const VENDORS = { key: 'vendors', report: '', label: '' }
const TAXES = { key: 'taxes', report: '', label: '' }
const WAREHOUSES = { key: 'warehouses', report: '', label: '' }
const VAT = 0.05

interface Line {
  quantity: string
  rate: string
  taxId: string
}

/**
 * Create purchase order (Procurement · Intended design 05): the ticked lines of one vendor, with model, description,
 * package, required qty and unit cost (approved Cost Analysis) already filled. Order qty may be less than what is left
 * (partial POs). Save → Widget.project_create_po: the PO is created in Zoho Creator first; only when it is complete is it
 * sent to Zoho Books (ZohoBooks.Purchase_Order_Creator_books_Sync); PO#, date and status are written back to the lines.
 */
export function CreatePoDrawer({ project, user, rows, onClose }: { project: Project; user: string; rows: ScheduleRow[]; onClose: (created: boolean) => void; onBack?: () => void }) {
  const vendors = useOptions(VENDORS)
  const countries = useOptions(LOOKUPS.countries)
  const taxes = useOptions(TAXES)
  const warehouses = useOptions(WAREHOUSES)
  const create = useCreatePurchaseOrder(project.id)
  const vendorId = rows[0]?.line.vendorId ?? ''
  const vendor = vendors.data?.find((v) => v.id === vendorId)
  const items = useMemo(() => rows.map((r) => ({ r, left: Math.max(0, Math.floor(r.line.quantity - r.procured)) })), [rows])
  const [date, setDate] = useState(localToday())
  const [termsDays, setTermsDays] = useState('30')
  const [warehouseId, setWarehouseId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [countryId, setCountryId] = useState('')
  const [reference, setReference] = useState(project.reference)
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(items.map(({ r, left }) => [r.line.id, { quantity: String(left), rate: r.unitCost === null ? '' : String(Math.round(r.unitCost * 100) / 100), taxId: '' }])),
  )
  const [done, setDone] = useState<{ poNo: string; booksSynced: boolean; booksMessage?: string } | null>(null)
  // default VAT tax once the taxes list arrives
  useEffect(() => {
    const vat = taxes.data?.find((t) => /vat/i.test(t.label)) ?? taxes.data?.[0]
    if (vat) setLines((s) => Object.fromEntries(Object.entries(s).map(([k, l]) => [k, l.taxId ? l : { ...l, taxId: vat.id }])))
  }, [taxes.data])

  const set = (id: string, patch: Partial<Line>) => setLines((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  const name = (r: ScheduleRow) => r.line.model || r.line.sku || r.line.description || 'Item'
  const problems = [
    !vendorId && 'The selected lines have no vendor on the BOQ',
    !countryId && 'Select the entity (country) — it decides the Zoho Books organisation',
    ...items.map(({ r, left }) => {
      const l = lines[r.line.id]
      const q = Number(l.quantity)
      if (!r.line.productId) return `${name(r)}: no product (SKU)`
      if (!Number.isInteger(q) || q <= 0) return `${name(r)}: order qty must be a whole number above 0`
      if (q > left) return `${name(r)}: only ${left} left to order`
      if (l.rate === '' || Number(l.rate) < 0) return `${name(r)}: enter the unit cost`
      return false
    }),
  ].filter((x): x is string => !!x)
  const lineTotal = (id: string) => Number(lines[id].quantity || 0) * Number(lines[id].rate || 0)
  const subTotal = items.reduce((s, { r }) => s + lineTotal(r.line.id), 0)
  const vat = items.reduce((s, { r }) => s + (lines[r.line.id].taxId ? lineTotal(r.line.id) * VAT : 0), 0)

  const save = () =>
    create.mutate(
      {
        projectId: project.id,
        vendorId,
        countryId,
        date,
        deliveryDate,
        reference,
        notes,
        discount: 0,
        termsDays: termsDays ? Number(termsDays) : undefined,
        warehouseId,
        lines: items.map(({ r }) => ({
          boqId: r.line.id,
          productId: r.line.productId,
          lineId: r.assets[0]?.id,
          description: r.line.description || r.line.model,
          quantity: Number(lines[r.line.id].quantity),
          rate: Number(lines[r.line.id].rate),
          taxId: lines[r.line.id].taxId,
        })),
      },
      { onSuccess: (res) => setDone(res) },
    )

  return (
    <Modal title="Create purchase order" wide className="gc-proc-modal" onClose={() => !create.isPending && onClose(!!done)}>
      <p className="gc-proc-modal__sub">
        <span className="gc-pill gc-pill--teal">Vendor: {vendor?.label || rows[0]?.line.vendor || '—'}</span>{' '}
        <span className="gc-small gc-soft">
          {project.reference} · {rows.length} line{rows.length === 1 ? '' : 's'} selected · saved in Zoho Creator, then sent to Zoho Books
        </span>
      </p>

      {done ? (
        <div className="gc-proc-po-body">
          <div className="gc-po-result" role="status">
            <p>
              <span className="gc-po-step gc-po-step--ok">1</span> <strong>{done.poNo}</strong> was created in Zoho Creator, and PO#, date and status were written to {rows.length} line
              {rows.length === 1 ? '' : 's'}.
            </p>
            <p>
              <span className={`gc-po-step ${done.booksSynced ? 'gc-po-step--ok' : 'gc-po-step--warn'}`}>2</span>{' '}
              {done.booksSynced ? <>Synced to Zoho Books.</> : <>Not synced to Zoho Books yet. {done.booksMessage || 'Open the PO in Creator to send it again once the Books setup is fixed.'}</>}
            </p>
          </div>
        </div>
      ) : (
        <div className="gc-proc-po-body">
          <div className="gc-po-form">
            <label className="gc-field">
              <span className="gc-label">PO number</span>
              <input value="Assigned on save (PO-#####)" readOnly className="gc-input--readonly" aria-readonly="true" />
            </label>
            <label className="gc-field">
              <span className="gc-label">PO date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="gc-field">
              <span className="gc-label">Issued by</span>
              <input value={user} readOnly className="gc-input--readonly" aria-readonly="true" />
            </label>
            <label className="gc-field">
              <span className="gc-label">Terms days</span>
              <input type="number" min={0} step={1} value={termsDays} onChange={(e) => setTermsDays(e.target.value)} />
            </label>
            <label className="gc-field">
              <span className="gc-label">Ship to</span>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{warehouses.isLoading ? 'Loading…' : '— Warehouse —'}</option>
                {warehouses.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="gc-field">
              <span className="gc-label">Delivery required by</span>
              <input type="date" value={deliveryDate} min={date} onChange={(e) => setDeliveryDate(e.target.value)} />
            </label>
            <label className="gc-field">
              <span className="gc-label">
                Entity (country)<span className="gc-danger"> *</span>
              </span>
              <select value={countryId} onChange={(e) => setCountryId(e.target.value)} aria-required="true">
                <option value="">{countries.isLoading ? 'Loading…' : '-Select-'}</option>
                {countries.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="gc-field">
              <span className="gc-label">Vendor contact</span>
              <input value={vendor?.phone || '—'} readOnly className="gc-input--readonly" aria-readonly="true" />
            </label>
            <label className="gc-field">
              <span className="gc-label">Vendor email</span>
              <input value={vendor?.email || '—'} readOnly className="gc-input--readonly" aria-readonly="true" />
            </label>
            <label className="gc-field">
              <span className="gc-label">Reference#</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <label className="gc-field gc-po-form__wide">
              <span className="gc-label">Notes to vendor</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div className="gc-proc-po-lines">
            <table className="gc-table gc-table--compact" aria-label="Purchase order lines">
              <thead>
                <tr>
                  <th scope="col">Vendor / model</th>
                  <th scope="col">Description</th>
                  <th scope="col">Package</th>
                  <th scope="col" className="gc-num">
                    Req qty
                  </th>
                  <th scope="col">Order qty</th>
                  <th scope="col">Unit cost</th>
                  <th scope="col">VAT</th>
                  <th scope="col" className="gc-num">
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map(({ r, left }) => (
                  <tr key={r.line.id}>
                    <td className="gc-wrap">
                      <strong>{name(r)}</strong>
                      <span className="gc-small gc-soft gc-block">{r.line.sku}</span>
                    </td>
                    <td className="gc-proc-desc" title={r.line.description}>
                      {r.line.description || '—'}
                    </td>
                    <td>{wpTag(r.line.workPackage) || '—'}</td>
                    <td className="gc-num">
                      {formatQty(r.line.quantity)}
                      {r.procured > 0 && <span className="gc-small gc-soft gc-block">{formatQty(r.procured)} on POs</span>}
                    </td>
                    <td>
                      <input
                        className="gc-input-sm"
                        type="number"
                        min={1}
                        max={left}
                        step={1}
                        value={lines[r.line.id].quantity}
                        onChange={(e) => set(r.line.id, { quantity: e.target.value })}
                        aria-label={`Order qty of ${name(r)}`}
                      />
                    </td>
                    <td>
                      <input
                        className="gc-input-sm"
                        type="number"
                        min={0}
                        step="0.01"
                        value={lines[r.line.id].rate}
                        onChange={(e) => set(r.line.id, { rate: e.target.value })}
                        aria-label={`Unit cost of ${name(r)}`}
                      />
                    </td>
                    <td>
                      <select className="gc-input-sm" value={lines[r.line.id].taxId} onChange={(e) => set(r.line.id, { taxId: e.target.value })} aria-label={`VAT of ${name(r)}`}>
                        <option value="">None</option>
                        {taxes.data?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="gc-num">{formatMoney(lineTotal(r.line.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.length > 0 && (
            <ul className="gc-small gc-danger gc-po-problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {create.error && (
            <p className="gc-small gc-danger" role="alert">
              {create.error.message}
            </p>
          )}
        </div>
      )}

      <footer className="gc-proc-po-foot">
        {!done && (
          <dl className="gc-po-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(subTotal)}</dd>
            </div>
            <div>
              <dt>VAT 5%</dt>
              <dd>{formatMoney(vat)}</dd>
            </div>
            <div className="gc-po-totals__total">
              <dt>Total{project.currency ? ` (${project.currency})` : ''}</dt>
              <dd>{formatMoney(subTotal + vat)}</dd>
            </div>
          </dl>
        )}
        <div className="gc-modal__actions">
          {done ? (
            <button type="button" className="gc-proc-btn gc-proc-btn--po" onClick={() => onClose(true)}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="gc-proc-btn gc-proc-btn--po" disabled={problems.length > 0 || create.isPending} onClick={save}>
                {create.isPending ? 'Saving in Creator, then Books…' : 'Save purchase order'}
              </button>
              <button type="button" className="gc-proc-btn gc-proc-btn--ghost" onClick={() => onClose(false)} disabled={create.isPending}>
                Cancel
              </button>
            </>
          )}
        </div>
      </footer>
    </Modal>
  )
}
