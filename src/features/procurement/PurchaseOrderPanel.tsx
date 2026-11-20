import { useEffect, useMemo, useState } from 'react'
import { DateInput } from '@/features/console/DateInput'
import { LOOKUPS } from '@/config/projectForm'
import { DIVISIONS } from '@/config/zoho'
import { SidePanel } from '@/features/console/ui'
import { useCreatePurchaseOrder, useOptions } from '@/features/projects/api'
import { localToday, wpTag } from '@/features/project/model'
import { formatMoney, formatQty } from '@/lib/utils'
import type { Project, PurchaseOrder } from '@/types/domain'
import type { ScheduleRow } from './schedule'

const VENDORS = { key: 'vendors', report: '', label: '' }
const TAXES = { key: 'taxes', report: '', label: '' }
const WAREHOUSES = { key: 'warehouses', report: '', label: '' }
const VAT = 0.05

interface Line {
  on: boolean
  quantity: string
  rate: string
  taxId: string
  /** Reporting tag (Division) of the line */
  division: string
}
const TRANSIT = ['Road', 'Air', 'Sea']

const vendorKey = (r: ScheduleRow) => r.line.vendorId || r.line.vendor

/**
 * Create purchase order — a fixed panel from the left. It lists every BOQ line that still has quantity to order; the
 * first tick sets the vendor (lines of other vendors are locked) and the PO is built from the ticked lines only. New PO
 * or add to an existing PO of that vendor. Save → Widget.project_create_po: Purchase_Order + PO_Line_Items (with BOQ,
 * Estimate_Line_ID, product, qty, rate, tax) submitted to Creator through its REST API, so the Purchase Order workflows
 * (PO number, Zoho Books, BOQ write-back) run there — the widget only creates the record.
 */
export function PurchaseOrderPanel({
  project,
  user,
  rows,
  orders,
  preselected,
  onClose,
}: {
  project: Project
  user: string
  rows: ScheduleRow[]
  orders: PurchaseOrder[]
  preselected: string[]
  onClose: (created: boolean) => void
}) {
  const vendors = useOptions(VENDORS)
  const countries = useOptions(LOOKUPS.countries)
  const taxes = useOptions(TAXES)
  const warehouses = useOptions(WAREHOUSES)
  const create = useCreatePurchaseOrder(project.id)
  const orderable = useMemo(() => rows.filter((r) => r.left > 0 && r.line.productId).sort((a, b) => (a.line.vendor || '~').localeCompare(b.line.vendor || '~')), [rows])
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      orderable.map((r) => [
        r.line.id,
        { on: preselected.includes(r.line.id), quantity: String(r.left), rate: r.unitCost === null ? '' : String(Math.round(r.unitCost * 100) / 100), taxId: '', division: '' },
      ]),
    ),
  )
  // Vendor first: only its lines are listed (and can be ticked); ticked rows from the schedule pick it in advance
  const vendorChoices = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; count: number }>()
    for (const r of orderable) {
      if (!r.line.vendorId) continue
      const k = vendorKey(r)
      const v = seen.get(k) ?? { key: k, label: r.line.vendor || 'Vendor', count: 0 }
      seen.set(k, { ...v, count: v.count + 1 })
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [orderable])
  const noVendor = orderable.filter((r) => !r.line.vendorId).length
  const [lockedVendor, setLockedVendor] = useState(() => {
    const first = orderable.find((r) => preselected.includes(r.line.id) && r.line.vendorId)
    return first ? vendorKey(first) : ''
  })
  const vendorRows = orderable.filter((r) => !!lockedVendor && vendorKey(r) === lockedVendor)
  const picked = vendorRows.filter((r) => lines[r.line.id]?.on)
  const vendorId = vendorRows[0]?.line.vendorId ?? ''
  const chooseVendor = (k: string) => {
    setLockedVendor(k)
    // lines of another vendor are never carried over
    setLines((s) => Object.fromEntries(Object.entries(s).map(([id, l]) => [id, { ...l, on: l.on && vendorKey(orderable.find((r) => r.line.id === id)!) === k }])))
  }
  const vendor = vendors.data?.find((v) => v.id === vendorId)
  const vendorOrders = orders.filter((o) => vendorId && o.vendorId === vendorId)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [existingId, setExistingId] = useState('')
  const existing = vendorOrders.find((o) => o.id === existingId)
  const [date, setDate] = useState(localToday())
  const [termsDays, setTermsDays] = useState('30')
  const [warehouseId, setWarehouseId] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [countryId, setCountryId] = useState('')
  const [reference, setReference] = useState(project.reference)
  const [notes, setNotes] = useState('')
  const [tag, setTag] = useState('')
  const [modeOfTransit, setModeOfTransit] = useState('')
  const [eta, setEta] = useState('')
  const vendorTag = (DIVISIONS as readonly string[]).includes(vendor?.division ?? '') ? vendor!.division! : ''
  // The vendor's reporting tag is the default of the order and of every line without one
  useEffect(() => {
    setTag(vendorTag)
    if (vendorTag) setLines((s) => Object.fromEntries(Object.entries(s).map(([k, l]) => [k, l.division ? l : { ...l, division: vendorTag }])))
  }, [vendorTag])
  const applyTag = () => setLines((s) => Object.fromEntries(Object.entries(s).map(([k, l]) => [k, { ...l, division: tag }])))

  // Defaults once the lists arrive: VAT on every line, the project's country as the entity
  useEffect(() => {
    const vat = taxes.data?.find((t) => /vat/i.test(t.label)) ?? taxes.data?.[0]
    if (vat) setLines((s) => Object.fromEntries(Object.entries(s).map(([k, l]) => [k, l.taxId ? l : { ...l, taxId: vat.id }])))
  }, [taxes.data])
  useEffect(() => {
    if (countryId || !countries.data) return
    const match = countries.data.find((c) => project.countries.includes(c.label))
    if (match) setCountryId(match.id)
  }, [countries.data, countryId, project.countries])
  // A different vendor (or none) clears the existing-PO choice
  useEffect(() => {
    if (!vendorOrders.some((o) => o.id === existingId)) setExistingId('')
    if (!vendorOrders.length) setMode('new')
  }, [lockedVendor]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, patch: Partial<Line>) => setLines((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  const name = (r: ScheduleRow) => r.line.model || r.line.sku || r.line.description || 'Item'
  const lineTotal = (id: string) => Number(lines[id].quantity || 0) * Number(lines[id].rate || 0)
  const subTotal = picked.reduce((s, r) => s + lineTotal(r.line.id), 0)
  const vat = picked.reduce((s, r) => s + (lines[r.line.id].taxId ? lineTotal(r.line.id) * VAT : 0), 0)
  const problems = [
    !lockedVendor && 'Select the vendor',
    !!lockedVendor && picked.length === 0 && 'Tick at least one line',
    mode === 'existing' && !existing && 'Select the purchase order to add to',
    mode === 'new' && !countryId && 'Select the entity (country) — it decides the Zoho Books organisation',
    !modeOfTransit && 'Select the mode of transit',
    !eta && 'Enter the ETA',
    !!eta && eta < date && 'ETA cannot be before the PO date',
    ...picked.map((r) => {
      const l = lines[r.line.id]
      const q = Number(l.quantity)
      if (!Number.isInteger(q) || q <= 0) return `${name(r)}: order qty must be a whole number above 0`
      if (q > r.left) return `${name(r)}: only ${r.left} left to order`
      if (l.rate === '' || Number(l.rate) < 0) return `${name(r)}: enter the unit cost`
      if (!l.division) return `${name(r)}: select the reporting tag`
      return false
    }),
  ].filter((x): x is string => !!x)

  const save = () =>
    create.mutate(
      {
        projectId: project.id,
        vendorId,
        countryId: mode === 'existing' ? (existing?.countryId ?? '') : countryId,
        date,
        deliveryDate,
        reference,
        notes,
        discount: 0,
        termsDays: termsDays ? Number(termsDays) : undefined,
        warehouseId,
        poId: mode === 'existing' ? existingId : undefined,
        modeOfTransit,
        eta,
        lines: picked.map((r) => ({
          boqId: r.line.id,
          productId: r.line.productId,
          lineId: r.assets[0]?.id,
          description: r.line.description || r.line.model,
          quantity: Number(lines[r.line.id].quantity),
          rate: Number(lines[r.line.id].rate),
          taxId: lines[r.line.id].taxId,
          division: lines[r.line.id].division,
        })),
      },
      {
        // One short confirmation once Creator has saved it; the panel closes (Creator workflows do the rest)
        onSuccess: () => onClose(true),
      },
    )

  const footer = (
    <>
      <dl className="gc-po-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(subTotal, project.currency)}</dd>
        </div>
        <div>
          <dt>VAT 5%</dt>
          <dd>{formatMoney(vat, project.currency)}</dd>
        </div>
        <div className="gc-po-totals__total">
          <dt>Total</dt>
          <dd>{formatMoney(subTotal + vat, project.currency)}</dd>
        </div>
      </dl>
      <span className="gc-grow" />
      <button type="button" className="gc-pg-btn" onClick={() => onClose(false)} disabled={create.isPending}>
        Cancel
      </button>
      <button type="button" className="gc-pg-btn gc-pg-btn--primary" disabled={problems.length > 0 || create.isPending} onClick={save} title={problems[0] ?? ''}>
        {create.isPending ? 'Submitting to Creator…' : mode === 'existing' ? 'Add to purchase order' : 'Save purchase order'}
      </button>
    </>
  )

  return (
    <SidePanel
      title="Create purchase order"
      side="left"
      busy={create.isPending}
      onClose={() => onClose(false)}
      className="gc-side--po"
      subtitle={
        <>
          {project.reference} · {lockedVendor ? <strong>{vendor?.label || vendorRows[0]?.line.vendor}</strong> : 'select the vendor'} · submitted to Zoho Creator; its workflows do the rest
        </>
      }
      footer={footer}
    >
      <>
        <section className="gc-side__section" aria-label="Order lines">
          <label className="gc-field gc-po-vendor">
            <span className="gc-label">
              Vendor<span className="gc-danger"> *</span>
            </span>
            <select value={lockedVendor} onChange={(e) => chooseVendor(e.target.value)} aria-label="Vendor">
              <option value="">{vendorChoices.length ? 'Select the vendor…' : 'No vendor has lines left to order'}</option>
              {vendorChoices.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label} · {v.count} line{v.count === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            {noVendor > 0 && <span className="gc-small gc-soft">{noVendor} line(s) without a vendor on the BOQ are not listed — set their vendor in the schedule.</span>}
          </label>
          {lockedVendor && (
            <div className="gc-po-tag">
              <label className="gc-field">
                <span className="gc-label">
                  Reporting tag (Division)<span className="gc-danger"> *</span>
                </span>
                <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Reporting tag of the order">
                  <option value="">-Select-</option>
                  {DIVISIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="gc-pg-btn" disabled={!tag} onClick={applyTag} title="Give every line this reporting tag">
                Apply to all lines
              </button>
              <span className="gc-small gc-soft">
                {vendorTag ? `From the vendor (${vendorTag}); change it on a line if needed.` : 'The vendor has no reporting tag — select it here and apply to all, or on each line.'}
              </span>
            </div>
          )}
          <h3 className="gc-side__h">
            Lines to order{' '}
            {lockedVendor && (
              <span className="gc-muted">
                · {picked.length} of {vendorRows.length} ticked
              </span>
            )}
          </h3>
          {orderable.length === 0 ? (
            <p className="gc-empty">Every BOQ line with a product is fully ordered.</p>
          ) : !lockedVendor ? (
            <p className="gc-empty">Select a vendor to list its lines.</p>
          ) : (
            <div className="gc-po-lines">
              <table className="gc-po-table" aria-label="Purchase order lines">
                <colgroup>
                  <col style={{ width: 32 }} />
                  <col />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 76 }} />
                  <col style={{ width: 96 }} />
                  <col style={{ width: 112 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 132 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="gc-sr">Pick</span>
                    </th>
                    <th scope="col">Vendor / model</th>
                    <th scope="col">Package</th>
                    <th scope="col" className="gc-num">
                      Left
                    </th>
                    <th scope="col">Order qty</th>
                    <th scope="col">Unit cost</th>
                    <th scope="col">VAT</th>
                    <th scope="col" className="gc-num">
                      Line total
                    </th>
                    <th scope="col">Reporting tag</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorRows.map((r) => {
                    const l = lines[r.line.id]
                    return (
                      <tr key={r.line.id} className={l.on ? 'is-on' : ''}>
                        <td>
                          <input type="checkbox" className="gc-pg-check" checked={l.on} aria-label={`Order ${name(r)}`} onChange={(e) => set(r.line.id, { on: e.target.checked })} />
                        </td>
                        <td className="gc-po-item" title={`${r.line.vendor} · ${r.line.description}`}>
                          <strong>{name(r)}</strong>
                          <span>{r.line.vendor || 'No vendor'}</span>
                        </td>
                        <td className="gc-po-wrap">{wpTag(r.line.workPackage) || '—'}</td>
                        <td className="gc-num">{formatQty(r.left)}</td>
                        <td>
                          <input
                            className="gc-po-input"
                            type="number"
                            min={1}
                            max={r.left}
                            step={1}
                            disabled={!l.on}
                            value={l.quantity}
                            onChange={(e) => set(r.line.id, { quantity: e.target.value })}
                            aria-label={`Order qty of ${name(r)}`}
                          />
                        </td>
                        <td>
                          <input
                            className="gc-po-input"
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={!l.on}
                            value={l.rate}
                            onChange={(e) => set(r.line.id, { rate: e.target.value })}
                            aria-label={`Unit cost of ${name(r)}`}
                          />
                        </td>
                        <td>
                          <select className="gc-po-input" disabled={!l.on} value={l.taxId} onChange={(e) => set(r.line.id, { taxId: e.target.value })} aria-label={`VAT of ${name(r)}`}>
                            <option value="">None</option>
                            {taxes.data?.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="gc-num">{l.on ? formatMoney(lineTotal(r.line.id), project.currency) : '—'}</td>
                        <td>
                          <select className="gc-po-input" disabled={!l.on} value={l.division} onChange={(e) => set(r.line.id, { division: e.target.value })} aria-label={`Reporting tag of ${name(r)}`}>
                            <option value="">-Select-</option>
                            {DIVISIONS.map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="gc-side__section" aria-label="Purchase order">
          <div className="gc-seg" role="radiogroup" aria-label="Purchase order">
            <button type="button" role="radio" aria-checked={mode === 'new'} className={mode === 'new' ? 'is-on' : ''} onClick={() => setMode('new')}>
              New PO number
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'existing'}
              className={mode === 'existing' ? 'is-on' : ''}
              disabled={!vendorOrders.length}
              title={vendorOrders.length ? '' : 'No purchase order of this vendor yet'}
              onClick={() => setMode('existing')}
            >
              Add to existing PO
            </button>
          </div>
          {mode === 'existing' ? (
            <div className="gc-po-form">
              <label className="gc-field">
                <span className="gc-label">Purchase order</span>
                <select value={existingId} onChange={(e) => setExistingId(e.target.value)} aria-label="Existing purchase order">
                  <option value="">-Select-</option>
                  {vendorOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.poNo} · {formatMoney(o.totalCost, project.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gc-field">
                <span className="gc-label">Vendor email</span>
                <input value={vendor?.email || '—'} readOnly className="gc-input--readonly" />
              </label>
              <p className="gc-small gc-soft gc-po-form__wide">The lines are added to {existing?.poNo || 'the selected PO'}; the PO is updated in Creator, so its on-edit workflows run again.</p>
            </div>
          ) : (
            <div className="gc-po-form">
              <label className="gc-field">
                <span className="gc-label">PO number</span>
                <input value="Assigned on save (PO-#####)" readOnly className="gc-input--readonly" />
              </label>
              <label className="gc-field">
                <span className="gc-label">PO date</span>
                <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="gc-field">
                <span className="gc-label">Issued by</span>
                <input value={user} readOnly className="gc-input--readonly" />
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
                <DateInput value={deliveryDate} min={date} onChange={(e) => setDeliveryDate(e.target.value)} />
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
                <span className="gc-label">Reference#</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
              <label className="gc-field">
                <span className="gc-label">Vendor contact</span>
                <input value={vendor?.phone || '—'} readOnly className="gc-input--readonly" />
              </label>
              <label className="gc-field">
                <span className="gc-label">Vendor email</span>
                <input value={vendor?.email || '—'} readOnly className="gc-input--readonly" />
              </label>
              <label className="gc-field gc-po-form__wide">
                <span className="gc-label">Notes to vendor</span>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
          )}
        </section>

        <section className="gc-side__section" aria-label="In transit">
          <h3 className="gc-side__h">In transit</h3>
          <div className="gc-po-form">
            <label className="gc-field">
              <span className="gc-label">
                Mode of transit<span className="gc-danger"> *</span>
              </span>
              <select value={modeOfTransit} onChange={(e) => setModeOfTransit(e.target.value)} aria-required="true">
                <option value="">-Select-</option>
                {TRANSIT.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="gc-field">
              <span className="gc-label">
                ETA<span className="gc-danger"> *</span>
              </span>
              <DateInput value={eta} min={date} onChange={(e) => setEta(e.target.value)} aria-required="true" />
            </label>
            <p className="gc-small gc-soft gc-po-form__wide">Saved on the ordered BOQ lines (Transit section of the schedule).</p>
          </div>
        </section>
        {problems.length > 0 && picked.length > 0 && (
          <ul className="gc-po-problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {create.error && (
          <p className="gc-po-error" role="alert">
            {create.error.message}
          </p>
        )}
      </>
    </SidePanel>
  )
}
