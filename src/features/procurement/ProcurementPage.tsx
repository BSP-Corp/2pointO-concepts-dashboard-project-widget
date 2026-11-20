import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import type { Nav } from '@/features/console/ConsoleApp'
import { ColumnPicker } from '@/features/console/ColumnPicker'
import { Chip, CountBadge, ErrorPanel, SectionSkeleton } from '@/features/console/ui'
import { ProjectHeader } from '@/features/console/ProjectHeader'
import {
  useBulkBoqStatus,
  useCostingLines,
  usePoPayments,
  useOptions,
  usePlanMilestones,
  useProcurement,
  useProject,
  useProjectDetails,
  useRetryBooksSync,
  useRisks,
  useTasks,
  useUpdateBoq,
} from '@/features/projects/api'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { buildBoq, buildMilestones, health, localToday, wpTag } from '@/features/project/model'
import { isComplete, severityOf } from '@/features/risk/calc'
import { NotFoundError } from '@/lib/data/zohoSource'
import { queryKeys } from '@/lib/query-keys'
import { currencyCode, formatMoney, sortByOrder, storage } from '@/lib/utils'
import type { Project, ProjectDetails } from '@/types/domain'
import { CreateDeliveryNotePanel, DeliveryNoteDetailPanel } from './DeliveryNotePanel'
import { ProcurementGrid } from './ProcurementGrid'
import { PurchaseOrderPanel } from './PurchaseOrderPanel'
import { ReceivePanel } from './ReceivePanel'
import { BulkStatus, StockPanel } from './ProcurementExtras'
import { DeliveryNoteList, InWarehouseList, PurchaseOrderList, ReceiptList } from './RecordSheets'
import { PoPayments } from './PoPayments'
import { CORE, SECTIONS, buildSchedule, type CoreKey, type ScheduleRow, type SectionKey } from './schedule'

const BOQ_STATUSES = { key: 'boqStatuses', report: '', label: '' }
const VENDORS = { key: 'vendors', report: '', label: '' }
const COLUMNS_KEY = '2point0:procurement-columns'

type Panel = { kind: 'po' } | { kind: 'receive'; poId: string; lineId?: string } | { kind: 'dn-new' } | { kind: 'dn'; id: string } | { kind: 'stock'; id: string } | null

/**
 * Procurement Schedule — its own Creator page (Procurement_Schedule?procurement_project_id=<ID>), the working module for
 * purchasing (PPT 4a: the project tab only shows results). Replicates the 2point0 Ops procurement register: frozen core
 * columns, five colour-banded sections with bookmarks that scroll sideways, a Columns menu, box-shaped inline fields, and
 * left side panels for purchase orders, goods receipts and delivery notes. Stock moves only through goods receipt.
 */
export function ProcurementPage({ projectId, nav }: { projectId: string; nav: Nav }) {
  const valid = /^\d{1,25}$/.test(projectId)
  const project = useProject(valid ? projectId : '0')
  const details = useProjectDetails(valid ? projectId : '0')
  const notFound = !valid || project.error instanceof NotFoundError
  const qc = useQueryClient()
  const refreshing = useIsFetching({ queryKey: queryKeys.projects.detail(projectId) }) > 0
  // Everything of the project (schedule, POs, receipts, notes, header) and the lists (bays' free space, vendors…)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) }), qc.invalidateQueries({ queryKey: ['options'] })])
  return (
    <main className="gc-main gc-proc">
      <ProjectHeader
        project={notFound ? undefined : project.data}
        page="Procurement"
        user={details.data?.user}
        onHome={nav.home}
        onProject={notFound ? undefined : () => nav.project(projectId)}
        onRefresh={notFound ? undefined : refresh}
        refreshing={refreshing}
      />
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
        <Register project={project.data} details={details.data} />
      )}
    </main>
  )
}

/** Eye icon on the schedule: Pick and the core (PO) columns */
const PO_COLUMNS = [{ key: 'pick', label: 'Pick' }, ...CORE.map((c) => ({ key: c.key, label: c.label }))]

/** `only`: the sections shown when not all are (unticking hides a section); [] = every section, all ticked */
function loadColumns(): { only: SectionKey[]; core: CoreKey[]; pick: boolean } {
  try {
    const v = JSON.parse(storage.get(COLUMNS_KEY) || 'null') as { only?: unknown; core?: unknown; pick?: unknown } | null
    const only = Array.isArray(v?.only) ? (v!.only as SectionKey[]).filter((k) => SECTIONS.some((s) => s.key === k)) : []
    const core = Array.isArray(v?.core) ? (v!.core as CoreKey[]).filter((k) => CORE.some((c) => c.key === k)) : []
    return { only, core, pick: v?.pick === false }
  } catch {
    return { only: [], core: [], pick: false }
  }
}

function Register({ project, details }: { project: Project; details: ProjectDetails }) {
  const { boq, orders, poLines, receipts, deliveryNotes } = useProcurement(project)
  const payments = usePoPayments(
    project.id,
    useMemo(() => orders.data?.map((o) => o.id), [orders.data]),
  )
  const lines = useCostingLines(project)
  const update = useUpdateBoq(project)
  const bulk = useBulkBoqStatus(project)
  const retry = useRetryBooksSync(project.id)
  const ds = useDataSource()
  const tasks = useTasks(project)
  const planMilestones = usePlanMilestones(project)
  const risks = useRisks(project.id)
  const statuses = useOptions(BOQ_STATUSES)
  const vendors = useOptions(VENDORS)
  const statusOptions = sortByOrder(statuses.data ?? [], details.boqOrder)
  const [groupBy, setGroupBy] = useState<'vendor' | 'package' | 'none'>('vendor')
  const [vendor, setVendor] = useState('')
  const [pkg, setPkg] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [panel, setPanel] = useState<Panel>(null)
  const [only, setOnly] = useState<SectionKey[]>(() => loadColumns().only)
  const [hiddenCore, setHiddenCore] = useState<CoreKey[]>(() => loadColumns().core)
  const [hidePick, setHidePick] = useState(() => loadColumns().pick)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hiddenSections = only.length ? SECTIONS.filter((s) => !only.includes(s.key)).map((s) => s.key) : []
  /** Ticked = shown: all are ticked by default (nothing stored) */
  const shown = only.length ? only : SECTIONS.map((s) => s.key)

  const rows = useMemo(
    () =>
      boq.data && lines.data && orders.data && poLines.data && deliveryNotes.data
        ? buildSchedule(buildBoq(boq.data, lines.data, orders.data, poLines.data).rows, orders.data, poLines.data, deliveryNotes.data)
        : undefined,
    [boq.data, lines.data, orders.data, poLines.data, deliveryNotes.data],
  )

  const saveColumns = (sections: SectionKey[], core: CoreKey[], noPick = hidePick) => {
    setOnly(sections)
    setHiddenCore(core)
    setHidePick(noPick)
    storage.set(COLUMNS_KEY, JSON.stringify({ only: sections, core, pick: !noPick }))
  }

  const error = boq.error ?? lines.error ?? orders.error ?? poLines.error ?? deliveryNotes.error ?? receipts.error
  if (error) return <ErrorPanel error={error} onRetry={() => (boq.refetch(), lines.refetch(), orders.refetch(), poLines.refetch(), deliveryNotes.refetch(), receipts.refetch())} />
  if (!rows || !orders.data || !poLines.data || !deliveryNotes.data) return <SectionSkeleton label="Loading procurement schedule" />

  const counts = {
    order: rows.filter((r) => r.state === 'order').length,
    progress: rows.filter((r) => r.state === 'progress').length,
    received: rows.filter((r) => r.state === 'received').length,
  }
  const vendorNames = [...new Set(rows.map((r) => r.line.vendor).filter(Boolean))].sort()
  const packagesOf = (r: ScheduleRow) =>
    r.line.workPackage
      .split(/[,;]/)
      .map((w) => wpTag(w))
      .filter(Boolean)
  const packageNames = [...new Set(rows.flatMap(packagesOf))].sort()
  const groupOf = groupBy === 'none' ? null : (r: ScheduleRow) => (groupBy === 'vendor' ? r.line.vendor || 'No vendor' : wpTag(r.line.workPackage) || 'No package')
  const visible = rows.filter((r) => (!vendor || r.line.vendor === vendor) && (!pkg || packagesOf(r).includes(pkg))).sort((a, b) => (groupOf ? groupOf(a).localeCompare(groupOf(b)) : 0))
  const vendorKey = (r: ScheduleRow) => r.line.vendorId || r.line.vendor
  const chosen = rows.filter((r) => selected.has(r.line.id))
  const chosenVendor = chosen[0] ? vendorKey(chosen[0]) : ''
  const pickBlock = (r: ScheduleRow) =>
    !r.line.productId
      ? 'No product (SKU) on this BOQ line — it cannot go on a PO'
      : r.left <= 0
        ? 'Fully ordered'
        : !r.line.vendorId
          ? 'No vendor — set the vendor first'
          : chosenVendor && vendorKey(r) !== chosenVendor
            ? 'One vendor per purchase order'
            : ''
  const currency = currencyCode(project.currency)
  const poValue = orders.data.reduce((s, o) => s + o.totalCost, 0)
  const required = rows.reduce((t, r) => t + r.line.quantity, 0)
  const procuredPct = required > 0 ? Math.round((rows.reduce((t, r) => t + Math.min(r.ordered, r.line.quantity), 0) / required) * 100) : 0
  const milestones = tasks.data && planMilestones.data ? buildMilestones(planMilestones.data, tasks.data, project.startDate, localToday()) : undefined
  const criticalOpen = risks.data?.filter((x) => !isComplete(x) && severityOf(x) === 'Critical').length ?? 0
  const healthText = milestones ? health(milestones, criticalOpen) : ''
  const stockRow = panel?.kind === 'stock' ? rows.find((r) => r.line.id === panel.id) : undefined
  const dnOpen = panel?.kind === 'dn' ? deliveryNotes.data.find((d) => d.id === panel.id) : undefined

  return (
    <div className="gc-pg">
      <section className="gc-pg-headcard" aria-label="Project">
        <div className="gc-pg-id">
          <div className="gc-pg-ref">{project.reference || '—'}</div>
          <div className="gc-pg-sub">{[project.name, project.client, project.acceptedEstimate && `Quote ${project.acceptedEstimate.label}`, currency].filter(Boolean).join(' · ')}</div>
          <div className="gc-pg-facts">
            <span>
              PM <strong>{project.projectManager || '—'}</strong>
            </span>
            <span>
              Client PO <strong>{project.clientPoNo || '—'}</strong>
            </span>
            <span>
              Value <strong>{project.projectValuePo ? formatMoney(project.projectValuePo, currency) : '—'}</strong>
            </span>
            {project.status && <Chip>{project.status}</Chip>}
            {healthText && <Chip tone={healthText === 'At Risk' ? 'serious' : 'good'}>Health: {healthText}</Chip>}
          </div>
        </div>
        <dl className="gc-pg-metrics">
          <div>
            <dt>To order</dt>
            <dd>{counts.order}</dd>
            <span>lines without a PO</span>
          </div>
          <div>
            <dt>On order</dt>
            <dd>{counts.progress}</dd>
            <span>{orders.data.length} purchase orders</span>
          </div>
          <div>
            <dt>Fully received</dt>
            <dd>
              {counts.received} / {rows.length}
            </dd>
            <span>lines</span>
          </div>
          <div>
            <dt>PO value committed</dt>
            <dd>{formatMoney(poValue, currency)}</dd>
            <span>sum of PO totals</span>
          </div>
          <div>
            <dt>Procurement</dt>
            <dd>{procuredPct}%</dd>
            <span>of the required quantity on PO</span>
          </div>
          <div>
            <dt>DNs issued</dt>
            <dd>{deliveryNotes.data.filter((d) => d.statusIndex !== 48).length}</dd>
            <span>{deliveryNotes.data.filter((d) => d.statusIndex === 67).length} delivered</span>
          </div>
          <div>
            <dt>BOQ source</dt>
            <dd>
              <span className={`gc-pg-pill gc-pg-pill--${project.acceptedEstimate ? 'moving' : 'action'}`}>
                {project.acceptedEstimate ? `Approved quote ${project.acceptedEstimate.label}` : 'No approved quote'}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="gc-pg-bar">
        <span className="gc-grow" />
        {selected.size > 0 && (
          <span className="gc-pg-picked" role="status">
            {selected.size} picked · {chosen[0]?.line.vendor}
            <button type="button" className="gc-link" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </span>
        )}
        <BulkStatus
          picked={chosen}
          shown={visible}
          statusOptions={statusOptions}
          busy={bulk.isPending}
          onApply={(list, status) => bulk.mutate({ ids: list.map((r) => ({ id: r.line.id, name: r.line.model || r.line.sku || r.line.description })), statusId: status.id, statusName: status.label })}
        />
        <button type="button" className="gc-pg-btn gc-pg-btn--primary" onClick={() => setPanel({ kind: 'po' })}>
          + Create purchase order{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
        <button type="button" className="gc-pg-btn gc-pg-btn--dn" onClick={() => setPanel({ kind: 'dn-new' })}>
          Create delivery note
        </button>
      </div>

      <section className="gc-pg-card" aria-label="Procurement schedule">
        <nav className="gc-pg-nav" aria-label="Procurement sections">
          <label className="gc-pg-select">
            <span>Group by</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} aria-label="Group by">
              <option value="vendor">Vendor</option>
              <option value="package">Work package</option>
              <option value="none">None</option>
            </select>
          </label>
          <label className="gc-pg-select">
            <span>Vendor</span>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} aria-label="Filter by vendor">
              <option value="">All vendors</option>
              {vendorNames.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="gc-pg-select">
            <span>Package</span>
            <select value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Filter by work package">
              <option value="">All packages</option>
              {packageNames.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          <div className="gc-pg-showset" role="group" aria-label="Show sections">
            <span>Show:</span>
            {SECTIONS.map((sec) => (
              <label key={sec.key}>
                <input
                  type="checkbox"
                  className="gc-pg-check"
                  checked={shown.includes(sec.key)}
                  aria-label={`Show ${sec.label}`}
                  onChange={(e) => {
                    const next = e.target.checked ? [...shown, sec.key] : shown.filter((k) => k !== sec.key)
                    // every section ticked, or none left, is the default: all sections show (stored as [])
                    saveColumns(next.length === SECTIONS.length || next.length === 0 ? [] : SECTIONS.filter((x) => next.includes(x.key)).map((x) => x.key), hiddenCore)
                  }}
                />
                {sec.label}
              </label>
            ))}
          </div>
          <span className="gc-grow" />
          <span className="gc-small gc-soft">{visible.length} items · saves on pick / Enter</span>
        </nav>

        {rows.length === 0 ? (
          <div className="gc-empty">No BOQ lines for this project — the schedule comes from the approved Cost Analysis.</div>
        ) : visible.length === 0 ? (
          <div className="gc-empty">No items match this vendor and package.</div>
        ) : (
          <ProcurementGrid
            rows={visible}
            groupOf={groupOf}
            hiddenCore={hiddenCore}
            hiddenSections={hiddenSections}
            hidePick={hidePick}
            columnPicker={
              <ColumnPicker
                label="Show or hide PO columns"
                columns={PO_COLUMNS}
                hidden={[...(hidePick ? ['pick'] : []), ...hiddenCore]}
                onChange={(h) =>
                  saveColumns(
                    hiddenSections,
                    h.filter((k): k is CoreKey => k !== 'pick'),
                    h.includes('pick'),
                  )
                }
              />
            }
            selected={selected}
            pickBlock={pickBlock}
            onPick={(id, on) => setSelected((s) => (on ? new Set([...s, id]) : new Set([...s].filter((x) => x !== id))))}
            statusOptions={statusOptions}
            statusLoading={statuses.isLoading}
            vendors={vendors.data ?? []}
            savingId={update.isPending ? (update.variables?.boqId ?? null) : null}
            onSave={(r, data, optimistic) => update.mutate({ boqId: r.line.id, data, optimistic })}
            onReceive={(r) => {
              const open = r.poLines.find((l) => l.quantity > l.quantityReceived) ?? r.poLines[0]
              if (open) setPanel({ kind: 'receive', poId: open.purchaseOrderId, lineId: open.quantity > open.quantityReceived ? open.id : undefined })
            }}
            onOpenDn={(id) => setPanel({ kind: 'dn', id })}
            onStock={(r) => setPanel({ kind: 'stock', id: r.line.id })}
            currency={currency}
            scrollRef={scrollRef}
          />
        )}
      </section>

      <RecordTabs
        tabs={[
          {
            id: 'po',
            label: 'Purchase Orders',
            count: orders.data.length,
            body: () => (
              <PurchaseOrderList
                orders={orders.data}
                poLines={poLines.data}
                currency={currency}
                retrying={retry.isPending ? (retry.variables?.id ?? null) : null}
                onRetry={(kind, id) => retry.mutate({ kind, id })}
              />
            ),
          },
          {
            id: 'pr',
            label: 'Purchase Receives',
            count: receipts.data?.length ?? 0,
            body: () => (
              <>
                <ReceiptList
                  receipts={receipts.data ?? []}
                  poLines={poLines.data}
                  currency={currency}
                  files={{ url: (f) => ds.receiptFileUrl(f), read: (f) => ds.readReceiptFile(f) }}
                  retrying={retry.isPending ? (retry.variables?.id ?? null) : null}
                  onRetry={(kind, id) => retry.mutate({ kind, id })}
                />
                <p className="gc-small gc-soft gc-pg-howto">
                  Receive on a line: quantity, supplier delivery note number and documents and, per unit, its serial and pallet. Click a file name to open it in a new tab; Print opens it ready to
                  print. Direct to site also creates a delivered delivery note. Stock updates only through goods receipt — not status or date changes.
                </p>
              </>
            ),
          },
          {
            id: 'dn',
            label: 'Delivery Notes',
            count: deliveryNotes.data.length,
            body: () => (
              <DeliveryNoteList
                notes={deliveryNotes.data}
                currency={currency}
                files={{ url: (f) => ds.deliveryNoteFileUrl(f), read: (f) => ds.readDeliveryNoteFile(f) }}
                onOpen={(id) => setPanel({ kind: 'dn', id })}
              />
            ),
          },
          {
            id: 'stock',
            label: 'In Warehouse',
            count: poLines.data.reduce((t, l) => t + l.stockLocations.reduce((u, x) => u + x.qty, 0), 0),
            body: () => <InWarehouseList poLines={poLines.data} currency={currency} />,
          },
          {
            id: 'payments',
            label: 'Payments',
            count: orders.data.length,
            body: () => <PoPayments projectId={project.id} orders={orders.data} payments={payments.data ?? []} currency={currency} loading={payments.isLoading} />,
          },
        ]}
      />

      {panel?.kind === 'stock' && stockRow && <StockPanel row={stockRow} onClose={() => setPanel(null)} />}
      {panel?.kind === 'po' && (
        <PurchaseOrderPanel
          project={project}
          user={details.user}
          rows={rows}
          orders={orders.data}
          preselected={[...selected]}
          onClose={(created) => {
            setPanel(null)
            if (created) setSelected(new Set())
          }}
        />
      )}
      {panel?.kind === 'receive' && (
        <ReceivePanel
          projectId={project.id}
          orders={orders.data.filter((o) => poLines.data!.some((l) => l.purchaseOrderId === o.id))}
          poLines={poLines.data}
          receipts={receipts.data ?? []}
          initialPoId={panel.poId}
          focusLineId={panel.lineId}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'dn-new' && <CreateDeliveryNotePanel project={project} orders={orders.data} poLines={poLines.data} onClose={() => setPanel(null)} />}
      {panel?.kind === 'dn' && dnOpen && <DeliveryNoteDetailPanel key={dnOpen.id + dnOpen.statusIndex} project={project} note={dnOpen} poLines={poLines.data} onClose={() => setPanel(null)} />}
    </div>
  )
}

/** Purchase orders · purchase receives · delivery notes · in warehouse — one list at a time, in the Project page's tab style */
function RecordTabs({ tabs }: { tabs: { id: string; label: string; count: number; body: () => ReactNode }[] }) {
  const [tab, setTab] = useState(tabs[0].id)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const active = tabs.find((t) => t.id === tab) ?? tabs[0]
  const choose = (id: string) => setTab(id)
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active.id)
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null
    if (n === null) return
    e.preventDefault()
    const j = (n + tabs.length) % tabs.length
    choose(tabs[j].id)
    refs.current[j]?.focus()
  }
  return (
    <section className="gc-panel gc-panel--flush gc-tabs-card gc-pg-records" aria-label="Procurement records">
      <div role="tablist" aria-label="Procurement records" className="gc-tabs" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`gc-pg-tab-${t.id}`}
            aria-selected={t.id === active.id}
            aria-controls="gc-pg-tabpanel"
            tabIndex={t.id === active.id ? 0 : -1}
            className={`gc-tab ${t.id === active.id ? 'is-on' : ''}`}
            onClick={() => choose(t.id)}
          >
            {t.label}
            <CountBadge n={t.count} />
          </button>
        ))}
      </div>
      <div id="gc-pg-tabpanel" role="tabpanel" aria-labelledby={`gc-pg-tab-${active.id}`} className="gc-tabpanel" key={active.id}>
        {active.body()}
      </div>
    </section>
  )
}
