import { useMemo, useState } from 'react'
import { BarChart } from '@/features/console/charts'
import { Chip, Disclosure, Empty, ErrorPanel, Kpi, Panel } from '@/features/console/ui'
import { formatDate, formatMoney, formatPct, formatQty, sortByOrder } from '@/lib/utils'
import type { TabContext } from '../ProjectTabs'
import { isDeliveredStatus, isNotOrderedStatus, ratio } from '../model'
import { BoqEditDialog } from '../BoqEditDialog'
import { InlineDate } from '../InlineDate'
import { useOptions, useUpdateBoq } from '@/features/projects/api'
import { InlineSelect, InlineText } from '../InlineCells'

import { toCreatorDate } from '@/lib/data/zohoSource'
import type { BoqLine } from '@/types/domain'
import { CreatePoDialog } from '../CreatePoDialog'

const VENDORS = { key: 'vendors', report: '', label: '' }
const BOQ_STATUSES = { key: 'boqStatuses', report: '', label: '' }
const TRANSIT = ['Road', 'Air', 'Sea'].map((m) => ({ id: m, label: m }))

/** BOQ (approved estimate) + procurement: amount = quantity × rate; procured from POs; delivered from the Asset Register. */
export function BoqTab(c: TabContext) {
  const { boq, orders, poLines } = c.queries.procurement
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<BoqLine | null>(null)
  const updateBoq = useUpdateBoq(c.project)
  const vendorOptions = useOptions(VENDORS, c.details.canEdit)
  const boqStatuses = useOptions(BOQ_STATUSES, c.details.canEdit)
  const statusOptions = sortByOrder(boqStatuses.data ?? [], c.details.boqOrder)
  const error = boq.error ?? c.queries.lines.error ?? orders.error ?? poLines.error
  const vendors = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders.data ?? []) m.set(o.vendor || 'Not set', (m.get(o.vendor || 'Not set') ?? 0) + o.totalCost)
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [orders.data])

  if (error) return <ErrorPanel error={error} onRetry={() => (boq.refetch(), c.queries.lines.refetch(), orders.refetch(), poLines.refetch())} />
  if (!c.boq || !orders.data || !poLines.data) return <div className="gc-skeleton" style={{ height: 260 }} aria-busy="true" aria-label="Loading BOQ" />
  const rows = c.boq.rows
  const ordered = poLines.data.reduce((s, l) => s + l.quantity, 0)
  const received = poLines.data.reduce((s, l) => s + l.quantityReceived, 0)
  const poValue = orders.data.reduce((s, o) => s + o.totalCost, 0)

  return (
    <div className="gc-stack">
      <div className="gc-section-head">
        <h2 className="gc-h2">Procurement</h2>
        <button type="button" className="gc-btn gc-btn--primary" onClick={() => c.nav.procurement(c.project.id)} title="Open the Procurement Schedule in its own widget">
          Open Procurement ↗
        </button>
      </div>
      <Panel title="Bill of quantity" flush actions={<span className="gc-small gc-soft">Change a value in the list — it saves to the BOQ record at once · Edit for delivery details</span>}>
        {rows.length === 0 ? (
          <Empty>No records for this project</Empty>
        ) : (
          <div className="gc-table-wrap">
            <table className="gc-table gc-list-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Vendor details</th>
                  <th scope="col" className="gc-num">Qty</th>
                  <th scope="col">Status</th>
                  <th scope="col">Start date</th>
                  <th scope="col">End date</th>
                  <th scope="col">Completion date</th>
                  <th scope="col" title="The BOQ form has no assigned-person field">Assigned person</th>
                  <th scope="col">
                    <span className="gc-sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.line
                  return (
                    <tr key={b.id}>
                      <td className="gc-wrap">
                        <strong>{b.sku || b.model || '—'}</strong>
                        <span className="gc-small gc-soft gc-block">{b.description || '—'}</span>
                        {r.issues.map((i) => (
                          <span key={i} className="gc-small gc-danger gc-block">
                            ⚠ {i}
                          </span>
                        ))}
                      </td>
                      <td className="gc-wrap">
                        <InlineSelect
                          value={b.vendorId}
                          display={b.vendor}
                          options={vendorOptions.data ?? []}
                          loading={vendorOptions.isLoading}
                          label={`${b.sku || b.description} vendor`}
                          disabled={!c.details.canEdit}
                          saving={updateBoq.isPending}
                          onSave={(id) => updateBoq.mutate({ boqId: b.id, data: { Vendors: id }, optimistic: { vendorId: id, vendor: vendorOptions.data?.find((v) => v.id === id)?.label ?? '' } })}
                        />
                        <span className="gc-cell-pair">
                          <InlineText value={b.po} label={`${b.sku || b.description} PO#`} placeholder="PO#" disabled={!c.details.canEdit} saving={updateBoq.isPending} onSave={(v) => updateBoq.mutate({ boqId: b.id, data: { PO: v }, optimistic: { po: v } })} />
                          <InlineSelect
                            value={b.modeOfTransit}
                            display={b.modeOfTransit}
                            options={TRANSIT}
                            label={`${b.sku || b.description} mode of transit`}
                            disabled={!c.details.canEdit}
                            saving={updateBoq.isPending}
                            onSave={(v) => updateBoq.mutate({ boqId: b.id, data: { Mode_of_Transit: v }, optimistic: { modeOfTransit: v } })}
                          />
                        </span>
                      </td>
                      <td className="gc-num">
                        {formatQty(b.quantity)} {b.uom}
                        <span className="gc-small gc-soft gc-block">
                          {formatQty(r.procured)} procured · {formatQty(r.delivered)} delivered
                        </span>
                      </td>
                      <td>
                        <InlineSelect
                          value={b.statusId}
                          display={b.status}
                          tone={isDeliveredStatus(b.status) ? 'good' : isNotOrderedStatus(b.status) ? 'warning' : 'info'}
                          options={statusOptions}
                          loading={boqStatuses.isLoading}
                          label={`${b.sku || b.description} status`}
                          disabled={!c.details.canEdit}
                          saving={updateBoq.isPending}
                          onSave={(id) => updateBoq.mutate({ boqId: b.id, data: { Status: id }, optimistic: { statusId: id, status: statusOptions.find((o) => o.id === id)?.label ?? '' } })}
                        />
                      </td>
                      <td>
                        <InlineDate
                          value={b.poDate}
                          max={b.eta}
                          label={`${b.sku || b.description} start date`}
                          disabled={!c.details.canEdit}
                          saving={updateBoq.isPending}
                          onSave={(d) => updateBoq.mutate({ boqId: b.id, data: { PO_Date: toCreatorDate(d) }, optimistic: { poDate: d } })}
                        />
                      </td>
                      <td>
                        <InlineDate
                          value={b.eta}
                          min={b.poDate}
                          label={`${b.sku || b.description} end date`}
                          disabled={!c.details.canEdit}
                          saving={updateBoq.isPending}
                          onSave={(d) => updateBoq.mutate({ boqId: b.id, data: { ETA: toCreatorDate(d) }, optimistic: { eta: d } })}
                        />
                      </td>
                      <td>
                        <InlineDate
                          value={b.dateDeliveredToCustomer}
                          label={`${b.sku || b.description} completion date`}
                          disabled={!c.details.canEdit}
                          saving={updateBoq.isPending}
                          onSave={(d) => updateBoq.mutate({ boqId: b.id, data: { Date_delivered_to_customer: toCreatorDate(d) }, optimistic: { dateDeliveredToCustomer: d } })}
                        />
                      </td>
                      <td className="gc-muted">—</td>
                      <td>
                        {c.details.canEdit && (
                          <button type="button" className="gc-btn gc-btn--ghost gc-btn--sm" onClick={() => setEditing(b)} aria-label={`Edit ${b.sku || b.description}`}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {updateBoq.error && (
              <p className="gc-small gc-danger gc-pad" role="alert">
                {updateBoq.error.message}
              </p>
            )}
          </div>
        )}
      </Panel>

      <div className="gc-section-head">
        <h2 className="gc-h2">Purchase orders</h2>
        {c.details.canEdit && rows.length > 0 && (
          <button type="button" className="gc-btn gc-btn--primary" onClick={() => setCreating(true)}>
            + Create PO
          </button>
        )}
      </div>
      <div className="gc-kpis">
        <Kpi tone="blue" label="Purchase orders" value={orders.data.length} sub="Named on BOQ lines (PO#)" />
        <Kpi tone="violet" label="PO value" value={formatMoney(poValue)} sub="Sum of PO Total Cost" />
        <Kpi tone="green" label="Quantity received" value={formatPct(ratio(received, ordered))} sub={`${formatQty(received)} of ${formatQty(ordered)}`} />
        <Kpi tone="amber" label="BOQ lines without PO" value={rows.filter((r) => !r.line.po).length} />
      </div>
      <div className="gc-grid-2">
        <Panel title="PO value by vendor">
          {vendors.length ? <BarChart rows={vendors.map((v) => ({ label: v.label, values: { v: v.value } }))} series={[{ key: 'v', label: 'PO value' }]} format={(n) => formatMoney(n)} /> : <Empty>No purchase orders yet</Empty>}
        </Panel>
        <Panel title="Purchase orders">
          {orders.data.length === 0 ? (
            <Empty>No purchase orders for this project’s BOQ</Empty>
          ) : (
            <div className="gc-disclosures">
              {orders.data.map((o) => {
                const own = poLines.data!.filter((l) => l.purchaseOrderId === o.id)
                const q = own.reduce((s, l) => s + l.quantity, 0)
                const r = own.reduce((s, l) => s + l.quantityReceived, 0)
                return (
                  <Disclosure
                    key={o.id}
                    header={
                      <span className="gc-acc__row">
                        <strong>{o.poNo}</strong>
                        <span className="gc-soft">{o.vendor || '—'}</span>
                        <Chip tone={o.booksSynced ? 'good' : 'warning'}>{o.booksSynced ? 'In Zoho Books' : 'Not in Books'}</Chip>
                        <Chip tone={q > 0 && r >= q ? 'good' : undefined}>{q > 0 && r >= q ? 'Received' : r > 0 ? 'Partly received' : 'Open'}</Chip>
                        <span className="gc-num">{formatMoney(o.totalCost)}</span>
                      </span>
                    }
                  >
                    <div className="gc-small gc-soft gc-row-wrap">
                      <span>Date {formatDate(o.date)}</span>
                      <span>Delivery {formatDate(o.deliveryDate)}</span>
                      {o.reference && <span>Ref {o.reference}</span>}
                    </div>
                    <div className="gc-table-wrap">
                      <table className="gc-table gc-table--compact">
                        <thead>
                          <tr>
                            <th scope="col">Item</th>
                            <th scope="col" className="gc-num">Qty</th>
                            <th scope="col" className="gc-num">Rate</th>
                            <th scope="col" className="gc-num">Received</th>
                            <th scope="col" className="gc-num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {own.map((l) => (
                            <tr key={l.id}>
                              <td className="gc-wrap">{l.item || l.description}</td>
                              <td className="gc-num">{formatQty(l.quantity)}</td>
                              <td className="gc-num">{formatMoney(l.rate)}</td>
                              <td className="gc-num">{formatQty(l.quantityReceived)}</td>
                              <td className="gc-num">{formatMoney(l.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Disclosure>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
      {creating && <CreatePoDialog c={c} onClose={() => setCreating(false)} />}
      {editing && <BoqEditDialog project={c.project} line={editing} order={c.details.boqOrder} onClose={() => setEditing(null)} />}
    </div>
  )
}
