import { useMemo } from 'react'
import { Empty, ErrorPanel, Kpi, Panel } from '@/features/console/ui'
import { buildSchedule } from '@/features/procurement/schedule'
import { formatDate, formatMoney, formatQty } from '@/lib/utils'
import type { TabContext } from '../ProjectTabs'
import { isDeliveredStatus, isNotOrderedStatus, wpTag } from '../model'

const tone = (status: string) => (isDeliveredStatus(status) ? 'done' : isNotOrderedStatus(status) ? 'action' : /order/i.test(status) ? 'idle' : 'moving')

/**
 * Procurement results of the project (PPT 4a / 4b): read-only, one value per cell. Purchase orders, goods receipts and
 * delivery notes are worked in the Procurement module (its own page) — "Open Procurement" goes there.
 */
export function BoqTab(c: TabContext) {
  const { boq, orders, poLines, deliveryNotes } = c.queries.procurement
  const rows = useMemo(
    () => (c.boq && orders.data && poLines.data && deliveryNotes.data ? buildSchedule(c.boq.rows, orders.data, poLines.data, deliveryNotes.data) : undefined),
    [c.boq, orders.data, poLines.data, deliveryNotes.data],
  )
  const error = boq.error ?? c.queries.lines.error ?? orders.error ?? poLines.error ?? deliveryNotes.error
  if (error) return <ErrorPanel error={error} onRetry={() => (boq.refetch(), c.queries.lines.refetch(), orders.refetch(), poLines.refetch(), deliveryNotes.refetch())} />
  if (!rows || !orders.data || !deliveryNotes.data) return <div className="gc-skeleton" style={{ height: 260 }} aria-busy="true" aria-label="Loading procurement" />
  const poValue = orders.data.reduce((s, o) => s + o.totalCost, 0)

  return (
    <div className="gc-stack">
      <div className="gc-section-head">
        <span className="gc-small gc-soft">Read-only results · purchase orders, receipts and delivery notes are managed in Procurement</span>
        <button type="button" className="gc-btn gc-btn--primary" onClick={() => c.nav.procurement(c.project.id)}>
          Open Procurement →
        </button>
      </div>
      <div className="gc-kpis gc-kpis--flat">
        <Kpi tone="violet" label="Lines on a PO" value={`${rows.filter((r) => r.ordered > 0).length} / ${rows.length}`} sub={`${orders.data.length} purchase orders`} />
        <Kpi tone="blue" label="PO value" value={formatMoney(poValue, c.project.currency)} />
        <Kpi tone="green" label="Fully received" value={`${rows.filter((r) => r.state === 'received').length} / ${rows.length}`} />
        <Kpi
          tone="amber"
          label="Delivery notes"
          value={deliveryNotes.data.filter((d) => d.statusIndex !== 48).length}
          sub={`${deliveryNotes.data.filter((d) => d.statusIndex === 67).length} delivered`}
        />
      </div>
      <Panel title="Bill of quantity" flush>
        {rows.length === 0 ? (
          <Empty>No records for this project</Empty>
        ) : (
          <div className="gc-table-wrap">
            <table className="gc-table gc-ro-table" aria-label="Bill of quantity">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Description</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Package</th>
                  <th scope="col" className="gc-num">
                    Req.
                  </th>
                  <th scope="col" className="gc-num">
                    Ordered
                  </th>
                  <th scope="col" className="gc-num">
                    Received
                  </th>
                  <th scope="col" className="gc-num">
                    Delivered
                  </th>
                  <th scope="col">PO #</th>
                  <th scope="col">Status</th>
                  <th scope="col">ETA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.line
                  return (
                    <tr key={b.id}>
                      <td className="gc-mono" title={b.sku}>
                        {b.model || b.sku || '—'}
                      </td>
                      <td title={b.description}>{b.description || '—'}</td>
                      <td>{b.vendor || '—'}</td>
                      <td className="gc-mono">{wpTag(b.workPackage) || '—'}</td>
                      <td className="gc-num">{formatQty(b.quantity)}</td>
                      <td className="gc-num">{formatQty(r.ordered)}</td>
                      <td className="gc-num">{formatQty(r.received)}</td>
                      <td className="gc-num">{formatQty(r.delivered)}</td>
                      <td className="gc-mono" title={r.orders.map((o) => o.poNo).join(', ')}>
                        {r.orders[0]?.poNo ? `${r.orders[0].poNo}${r.orders.length > 1 ? ` +${r.orders.length - 1}` : ''}` : '—'}
                      </td>
                      <td>
                        <span className={`gc-pg-pill gc-pg-pill--${tone(b.status)}`}>{b.status || 'No status'}</span>
                      </td>
                      <td>{b.eta ? formatDate(b.eta) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
