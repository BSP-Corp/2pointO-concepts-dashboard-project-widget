import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Nav } from '@/features/console/ConsoleApp'
import { ErrorPanel, SectionSkeleton } from '@/features/console/ui'
import { TopBar } from '@/features/console/TopBar'
import { useCostingLines, useOptions, useProcurement, useProject, useProjectDetails, useUpdateBoq } from '@/features/projects/api'
import { buildBoq, daysBetween, isDeliveredStatus, isNotOrderedStatus, localToday, wpTag, type BoqRow } from '@/features/project/model'
import { NotFoundError } from '@/lib/data/zohoSource'
import { formatDate, formatMoney, formatQty, sortByOrder } from '@/lib/utils'
import type { PoLine, Project, ProjectDetails, PurchaseOrder } from '@/types/domain'
import { CreatePoDrawer } from './CreatePoDrawer'
import { ItemDialog } from './ItemDialog'

const BOQ_STATUSES = { key: 'boqStatuses', report: '', label: '' }
type Tab = 'all' | 'order' | 'progress' | 'received'
const ROW_H = 46

/** One schedule row: the BOQ line plus what its POs say (ordered, received, value, issued by). */
export interface ScheduleRow extends BoqRow {
  orders: PurchaseOrder[]
  poLines: PoLine[]
  received: number
  poValue: number
}

function buildSchedule(rows: BoqRow[], orders: PurchaseOrder[], poLines: PoLine[]): ScheduleRow[] {
  return rows.map((r) => {
    const mine = orders.filter((o) => o.boqIds.includes(r.line.id))
    const ids = new Set(mine.map((o) => o.id))
    const lines = r.line.productId ? poLines.filter((l) => ids.has(l.purchaseOrderId) && l.itemId === r.line.productId) : []
    return { ...r, orders: mine, poLines: lines, received: lines.reduce((s, l) => s + l.quantityReceived, 0), poValue: lines.reduce((s, l) => s + l.amount, 0) }
  })
}

/** Status → soft colour (never blue / red): delivered green, transit teal, ordered violet, not ordered amber. */
export const statusTone = (status: string) => (isDeliveredStatus(status) ? 'green' : isNotOrderedStatus(status) ? 'amber' : /order/i.test(status) ? 'violet' : 'teal')

/** Rows that fit the window without scrolling the page; recalculated on resize. */
function useRowsPerPage() {
  const calc = () => Math.max(4, Math.min(25, Math.floor(((typeof window === 'undefined' ? 800 : window.innerHeight) - 360) / ROW_H)))
  const [n, setN] = useState(calc)
  useEffect(() => {
    const on = () => setN(calc())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}

/**
 * Procurement Schedule — its own Creator page (Procurement_Schedule?procurement_project_id=<ID>), opened from the Project
 * Widget's Procurement button. A compact list (one row per BOQ item from the approved Cost Analysis) that fits the screen
 * — no page scrolling, no wide table; a row opens its details and fields (Purchasing · Transit · Receiving) in a popup.
 * Tick lines of one vendor → Create purchase order (Creator first, then Zoho Books). Stock moves only through goods receipt.
 */
export function ProcurementPage({ projectId, nav }: { projectId: string; nav: Nav }) {
  const valid = /^\d{1,25}$/.test(projectId)
  const project = useProject(valid ? projectId : '0')
  const details = useProjectDetails(valid ? projectId : '0')
  const notFound = !valid || project.error instanceof NotFoundError
  return (
    <main className="gc-main gc-proc">
      <nav className="gc-topbar" aria-label="Breadcrumb">
        <ol className="gc-crumbs">
          <li>
            <button type="button" className="gc-link" onClick={nav.home}>
              Project Search
            </button>
          </li>
          {!notFound && (
            <li>
              <button type="button" className="gc-link" onClick={() => nav.project(projectId)}>
                {project.data?.reference || '…'}
              </button>
            </li>
          )}
          <li aria-current="page">Procurement Schedule</li>
        </ol>
        <div className="gc-topbar__actions">
          {!notFound && (
            <button type="button" className="gc-btn" onClick={() => nav.project(projectId)}>
              ← Back to project
            </button>
          )}
          <button type="button" className="gc-btn" onClick={nav.home}>
            ⌂ Home
          </button>
          <TopBar name={details.data?.user} />
        </div>
      </nav>
      {notFound ? (
        <div className="gc-panel gc-notice gc-notfound" role="alert">
          <strong>Project not found</strong>
          <button type="button" className="gc-btn gc-btn--primary" onClick={nav.home}>
            ← Back to Project Search
          </button>
        </div>
      ) : project.error ? (
        <ErrorPanel error={project.error} onRetry={() => project.refetch()} />
      ) : !project.data || !details.data ? (
        <SectionSkeleton label="Loading procurement" />
      ) : (
        <Schedule project={project.data} details={details.data} />
      )}
    </main>
  )
}

function Schedule({ project, details }: { project: Project; details: ProjectDetails }) {
  const { boq, orders, poLines } = useProcurement(project)
  const lines = useCostingLines(project)
  const update = useUpdateBoq(project)
  const statuses = useOptions(BOQ_STATUSES)
  const statusOptions = sortByOrder(statuses.data ?? [], details.boqOrder)
  const [tab, setTab] = useState<Tab>('all')
  const [groupBy, setGroupBy] = useState<'vendor' | 'model' | 'package' | 'none'>('vendor')
  const [vendor, setVendor] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const perPage = useRowsPerPage()
  const today = localToday()

  const rows = useMemo(
    () => (boq.data && lines.data && orders.data && poLines.data ? buildSchedule(buildBoq(boq.data, lines.data, orders.data, poLines.data).rows, orders.data, poLines.data) : undefined),
    [boq.data, lines.data, orders.data, poLines.data],
  )
  useEffect(() => setPage(0), [tab, vendor, groupBy, perPage])
  const error = boq.error ?? lines.error ?? orders.error ?? poLines.error
  if (error) return <ErrorPanel error={error} onRetry={() => (boq.refetch(), lines.refetch(), orders.refetch(), poLines.refetch())} />
  if (!rows || !orders.data) return <SectionSkeleton label="Loading procurement schedule" />

  const state = (r: ScheduleRow): Tab => (r.line.quantity > 0 && r.received >= r.line.quantity ? 'received' : r.procured > 0 ? 'progress' : 'order')
  const counts = { all: rows.length, order: rows.filter((r) => state(r) === 'order').length, progress: rows.filter((r) => state(r) === 'progress').length, received: rows.filter((r) => state(r) === 'received').length }
  const vendors = [...new Set(rows.map((r) => r.line.vendor).filter(Boolean))].sort()
  const key = (r: ScheduleRow) => (groupBy === 'vendor' ? r.line.vendor || 'No vendor' : groupBy === 'model' ? r.line.model || r.line.sku || 'No model' : groupBy === 'package' ? wpTag(r.line.workPackage) || 'No package' : '')
  const visible = rows.filter((r) => (tab === 'all' || state(r) === tab) && (!vendor || r.line.vendor === vendor)).sort((a, b) => key(a).localeCompare(key(b)))
  const pages = Math.max(1, Math.ceil(visible.length / perPage))
  const shown = visible.slice(page * perPage, page * perPage + perPage)
  const vendorKey = (r: ScheduleRow) => r.line.vendorId || r.line.vendor
  const chosen = rows.filter((r) => selected.has(r.line.id))
  const chosenVendor = chosen[0] ? vendorKey(chosen[0]) : ''
  const poValue = orders.data.reduce((s, o) => s + o.totalCost, 0)
  const withPo = rows.filter((r) => r.procured > 0).length
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])))
  const name = (r: ScheduleRow) => r.line.sku || r.line.model || r.line.description || 'Item'
  const open = rows.find((r) => r.line.id === openId)
  const tabs: [Tab, string, string][] = [
    ['all', 'All', 'violet'],
    ['order', 'To order', 'amber'],
    ['progress', 'In progress', 'teal'],
    ['received', 'Received', 'green'],
  ]

  return (
    <div className="gc-proc-page">
      <section className="gc-proc-hero" aria-label="Procurement">
        <div className="gc-proc-hero__id">
          <span className="gc-proc-hero__eyebrow">Procurement · one schedule, purchasing to payment</span>
          <h1 className="gc-proc-hero__title">
            {project.reference || '—'} <span>{project.name}</span>
          </h1>
          <span className="gc-small gc-soft">
            {[project.client, project.currency].filter(Boolean).join(' · ') || '—'}
            {project.acceptedEstimate && <span className="gc-pill gc-pill--slate">Approved quote {project.acceptedEstimate.label}</span>}
          </span>
        </div>
        <dl className="gc-proc-kpis">
          <div className="gc-proc-kpi gc-proc-kpi--violet">
            <dt>POs raised</dt>
            <dd>
              {withPo} / {rows.length}
            </dd>
            <span>{orders.data.length} purchase orders</span>
          </div>
          <div className="gc-proc-kpi gc-proc-kpi--teal">
            <dt>PO value</dt>
            <dd>{formatMoney(poValue)}</dd>
            <span>Sum of PO totals</span>
          </div>
          <div className="gc-proc-kpi gc-proc-kpi--amber">
            <dt>Balance due</dt>
            <dd>{formatMoney(poValue)}</dd>
            <span>Payments are in Zoho Books</span>
          </div>
          <div className="gc-proc-kpi gc-proc-kpi--pink">
            <dt>DNs issued</dt>
            <dd>—</dd>
            <span>No Delivery Note form yet</span>
          </div>
        </dl>
      </section>

      <section className="gc-proc-card" aria-label="Procurement schedule">
        <div className="gc-proc-toolbar">
          <div className="gc-proc-tabs" role="tablist" aria-label="Schedule">
            {tabs.map(([id, label, tone]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`gc-proc-tab gc-proc-tab--${tone} ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
                {label} {counts[id]}
              </button>
            ))}
          </div>
          <label className="gc-proc-select">
            <span>Group</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} aria-label="Group by">
              <option value="vendor">Vendor</option>
              <option value="model">Model</option>
              <option value="package">Package</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="gc-proc-select">
            <span>Vendor</span>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Filter by vendor">
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <span className="gc-proc-toolbar__spacer" />
          {selected.size > 0 && (
            <span className="gc-small gc-soft">
              {selected.size} selected ·{' '}
              <button type="button" className="gc-link gc-small" onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </span>
          )}
          <button type="button" className="gc-proc-btn gc-proc-btn--po" disabled={chosen.length === 0} onClick={() => setCreating(true)} title={chosen.length ? 'Raise one PO for the ticked lines' : 'Tick lines of one vendor first'}>
            + Create purchase order
          </button>
          <button type="button" className="gc-proc-btn gc-proc-btn--dn" disabled title="Delivery notes need a Delivery Note form in Creator (not in the app yet)">
            Create delivery note
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="gc-empty">No BOQ lines for this project — the schedule comes from the approved Cost Analysis.</div>
        ) : (
          <table className="gc-proc-list" aria-label="Procurement schedule">
            <colgroup>
              <col className="gc-proc-col-check" />
              <col className="gc-proc-col-item" />
              <col className="gc-proc-col-vendor" />
              <col className="gc-proc-col-qty" />
              <col className="gc-proc-col-status" />
              <col className="gc-proc-col-eta" />
              <col className="gc-proc-col-po" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span className="gc-sr">Select</span>
                </th>
                <th scope="col">Item</th>
                <th scope="col">Vendor · package</th>
                <th scope="col">Req · ordered · received</th>
                <th scope="col">Status</th>
                <th scope="col">ETA</th>
                <th scope="col">PO</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const b = r.line
                const group = key(r)
                const newGroup = groupBy !== 'none' && (i === 0 || key(shown[i - 1]) !== group)
                const otherVendor = !!chosenVendor && vendorKey(r) !== chosenVendor
                const eta = b.eta ? daysBetween(today, b.eta) : null
                const late = eta !== null && eta < 0 && !isDeliveredStatus(b.status)
                const pct = (n: number) => `${b.quantity > 0 ? Math.min(100, (n / b.quantity) * 100) : 0}%`
                return (
                  <Fragment key={b.id}>
                    {newGroup && (
                      <tr className="gc-proc-groupline">
                        <th colSpan={7} scope="rowgroup">
                          {group} <span>· {visible.filter((x) => key(x) === group).length}</span>
                        </th>
                      </tr>
                    )}
                    <tr className={`gc-proc-row ${selected.has(b.id) ? 'is-selected' : ''}`} onClick={() => setOpenId(b.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="gc-proc-check"
                          checked={selected.has(b.id)}
                          disabled={(otherVendor && !selected.has(b.id)) || !b.productId}
                          title={!b.productId ? 'No product (SKU) on this BOQ line — it cannot go on a PO' : otherVendor ? 'One vendor per purchase order' : 'Select for a purchase order'}
                          aria-label={`Select ${name(r)}`}
                          onChange={() => toggle(b.id)}
                        />
                      </td>
                      <td>
                        <button type="button" className="gc-proc-item" aria-label={`Details of ${name(r)}`} onClick={(e) => (e.stopPropagation(), setOpenId(b.id))}>
                          <strong>{name(r)}</strong>
                          <span>{b.description || b.model || '—'}</span>
                        </button>
                      </td>
                      <td className="gc-proc-ellipsis">
                        {b.vendor || '—'}
                        <span className="gc-proc-sub">{wpTag(b.workPackage) || '—'}</span>
                      </td>
                      <td>
                        <span className="gc-proc-qty">
                          {formatQty(b.quantity)} · {formatQty(r.procured)} · {formatQty(r.received)}
                        </span>
                        <span className="gc-proc-bar" title={`Ordered ${formatQty(r.procured)} · received ${formatQty(r.received)} of ${formatQty(b.quantity)}`}>
                          <i className="gc-proc-bar__ordered" style={{ width: pct(r.procured) }} />
                          <i className="gc-proc-bar__received" style={{ width: pct(r.received) }} />
                        </span>
                      </td>
                      <td>
                        <span className={`gc-pill gc-pill--${statusTone(b.status)}`}>{b.status || 'No status'}</span>
                      </td>
                      <td className={late ? 'gc-proc-late' : ''}>
                        {b.eta ? formatDate(b.eta) : '—'}
                        {eta !== null && !isDeliveredStatus(b.status) && <span className="gc-proc-sub">{eta < 0 ? `${-eta} days late` : `in ${eta} days`}</span>}
                      </td>
                      <td className="gc-proc-ellipsis">
                        {b.po || '—'}
                        {r.poValue > 0 && <span className="gc-proc-sub">{formatMoney(r.poValue)}</span>}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="gc-proc-foot">
          <span className="gc-small gc-soft">Click an item for its details and fields · stock moves only through goods receipt, never by a status or date</span>
          {pages > 1 && (
            <span className="gc-proc-pager">
              <button type="button" className="gc-proc-btn gc-proc-btn--ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                ‹
              </button>
              <span className="gc-small">
                {page * perPage + 1}–{Math.min(visible.length, (page + 1) * perPage)} of {visible.length}
              </span>
              <button type="button" className="gc-proc-btn gc-proc-btn--ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                ›
              </button>
            </span>
          )}
        </div>
      </section>

      {open && (
        <ItemDialog
          row={open}
          statusOptions={statusOptions}
          statusLoading={statuses.isLoading}
          saving={update.isPending}
          error={update.error?.message}
          selected={selected.has(open.line.id)}
          canSelect={!!open.line.productId && (!chosenVendor || vendorKey(open) === chosenVendor || selected.has(open.line.id))}
          onToggleSelect={() => toggle(open.line.id)}
          onSave={(data, optimistic) => update.mutate({ boqId: open.line.id, data, optimistic }, { onSuccess: () => setOpenId(null) })}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <CreatePoDrawer
          project={project}
          user={details.user}
          rows={chosen}
          onClose={(created) => {
            setCreating(false)
            if (created) setSelected(new Set())
          }}
        />
      )}
    </div>
  )
}
