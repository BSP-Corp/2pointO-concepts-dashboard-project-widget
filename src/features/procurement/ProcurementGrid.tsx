import { Fragment, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { InlineSelect } from '@/features/project/InlineCells'
import { InlineDate } from '@/features/project/InlineDate'
import { daysBetween, isDeliveredStatus, isNotOrderedStatus, localToday, wpTag } from '@/features/project/model'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate, formatQty } from '@/lib/utils'
import type { BoqLine, Option } from '@/types/domain'
import { toast } from '@/features/console/toast'
import {
  CORE,
  CORE_BAND,
  PICK_WIDTH,
  SECTIONS,
  dueDateOf,
  isReceiptOnlyStatus,
  missingInfo,
  sectionColumns,
  sectionWidth,
  stageStatus,
  statusBlock,
  termsDaysOf,
  type CoreKey,
  type ScheduleRow,
  type SectionKey,
} from './schedule'

const TRANSIT: Option[] = ['Road', 'Air', 'Sea'].map((m) => ({ id: m, label: m }))
const amount = (n: number) => (n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

/** Status → muted tone (done green, moving violet, action amber, idle slate). */
export const statusTone = (status: string) => (isDeliveredStatus(status) ? 'done' : isNotOrderedStatus(status) ? 'action' : /order/i.test(status) ? 'idle' : 'moving')

export interface GridProps {
  rows: ScheduleRow[]
  groupOf: ((r: ScheduleRow) => string) | null
  hiddenCore: CoreKey[]
  hiddenSections: SectionKey[]
  /** Pick column hidden (eye icon) */
  hidePick: boolean
  /** Eye icon (show / hide Pick and the core columns), shown in the Core data band */
  columnPicker?: ReactNode
  selected: Set<string>
  pickBlock: (r: ScheduleRow) => string
  onPick: (id: string, on: boolean) => void
  statusOptions: Option[]
  statusLoading: boolean
  vendors: Option[]
  savingId: string | null
  onSave: (r: ScheduleRow, data: Record<string, unknown>, optimistic: Partial<BoqLine>) => void
  onReceive: (r: ScheduleRow) => void
  onOpenDn: (id: string) => void
  /** Stock panel of the line (where its received units are) */
  onStock: (r: ScheduleRow) => void
  currency: string
  scrollRef: RefObject<HTMLDivElement>
}

const gridFor = (core: typeof CORE, hidden: SectionKey[], pick: number): CSSProperties => ({
  gridTemplateColumns: [...(pick ? [`${pick}px`] : []), ...core.map((c) => `var(--pg-core-${c.key})`), ...SECTIONS.filter((s) => !hidden.includes(s.key)).map((s) => `${sectionWidth(s)}px`)].join(' '),
})
const coreLeft = (core: typeof CORE, i: number, pick: number) =>
  i === 0
    ? `${pick}px`
    : `calc(${pick}px + ${core
        .slice(0, i)
        .map((c) => `var(--pg-core-${c.key})`)
        .join(' + ')})`

/**
 * Procurement column schedule: frozen Core data (pick + 7 identity columns) and five colour-banded sections that scroll
 * horizontally. Editable values are bordered boxes of a fixed width: a click opens the editor in the same box, a pick /
 * Enter / click-away saves to the BOQ record and the box shows the saved value again — the layout never moves.
 */
export function ProcurementGrid(p: GridProps) {
  const core = CORE.filter((c) => !p.hiddenCore.includes(c.key))
  const pick = p.hidePick ? 0 : PICK_WIDTH
  const frozen = core.length + (pick ? 1 : 0)
  const style = { ...Object.fromEntries(CORE.map((c) => [`--pg-core-${c.key}`, c.width])), ...gridFor(core, p.hiddenSections, pick) } as CSSProperties
  const show = (key: SectionKey) => (p.hiddenSections.includes(key) ? { display: 'none' } : undefined)
  return (
    <div ref={p.scrollRef} className="gc-pg-scroll" role="region" aria-label="Procurement columns — scroll sideways" tabIndex={0} style={style}>
      <div role="table" aria-label="Procurement schedule" className="gc-pg-table">
        <div role="rowgroup" className="gc-pg-head" style={gridFor(core, p.hiddenSections, pick)}>
          <div role="row" className="gc-pg-contents">
            {frozen > 0 && (
              <div role="columnheader" className="gc-pg-band gc-pg-band--core" data-pg-frozen="" style={{ gridColumn: `span ${frozen}`, background: CORE_BAND.band, color: CORE_BAND.ink }}>
                {p.columnPicker}
                <span className="gc-pg-band__text" title="Core data">
                  Core data
                </span>
              </div>
            )}
            {SECTIONS.map((s) => (
              <div
                key={s.key}
                role="columnheader"
                className="gc-pg-band"
                data-pg-section={s.key}
                style={{ background: s.band, color: s.ink, ...show(s.key) }}
                aria-label={s.key === 'purchasing' || s.key === 'payments' ? `${s.label} (${p.currency})` : s.label}
              >
                {s.label}
              </div>
            ))}
          </div>
          <div role="row" className="gc-pg-contents">
            {!p.hidePick && (
              <div role="columnheader" className="gc-pg-label gc-pg-sticky gc-pg-pick" style={{ left: 0, background: CORE_BAND.tint }}>
                Pick
              </div>
            )}
            {core.map((c, i) => (
              <div
                key={c.key}
                role="columnheader"
                className={`gc-pg-label gc-pg-sticky ${i === core.length - 1 ? 'gc-pg-edge' : ''}`}
                style={{ left: coreLeft(core, i, pick), background: CORE_BAND.tint }}
                title={c.label}
              >
                {c.label}
              </div>
            ))}
            {SECTIONS.map((s) => (
              <div key={s.key} role="columnheader" className="gc-pg-labels" style={{ gridTemplateColumns: sectionColumns(s), background: s.tint, ...show(s.key) }}>
                {s.columns.map(([label]) => (
                  <span key={label} title={label}>
                    {label}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup">
          {p.rows.map((r, i) => {
            const group = p.groupOf?.(r)
            const newGroup = p.groupOf && (i === 0 || p.groupOf(p.rows[i - 1]) !== group)
            return (
              <Fragment key={r.line.id}>
                {newGroup && (
                  <div role="row" className="gc-pg-group">
                    <span role="cell" className="gc-pg-group__label">
                      {group} <span>· {p.rows.filter((x) => p.groupOf!(x) === group).length}</span>
                    </span>
                  </div>
                )}
                <Row {...p} r={r} core={core} />
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Row({ r, core, ...p }: GridProps & { r: ScheduleRow; core: typeof CORE }) {
  const b = r.line
  const name = b.model || b.sku || b.description || 'Item'
  const block = p.pickBlock(r)
  const saving = p.savingId === b.id
  const save = (data: Record<string, unknown>, optimistic: Partial<BoqLine>) => p.onSave(r, data, optimistic)
  const date = (field: string, key: keyof BoqLine) => (iso: string) => save({ [field]: iso ? toCreatorDate(iso) : '' }, { [key]: iso })
  const values: Record<CoreKey, string> = { vendor: b.vendor, category: b.category, type: b.type, brand: b.brand, model: b.model, sku: b.sku, description: b.description }
  const show = (key: SectionKey) => (p.hiddenSections.includes(key) ? { display: 'none' } : undefined)
  const eta = b.eta && !isDeliveredStatus(b.status) ? daysBetween(localToday(), b.eta) : null
  const order = r.orders[0]
  const siteStatus = r.delivered <= 0 ? 'Pending' : r.delivered < b.quantity ? 'Partial' : 'Delivered'
  const codes = [
    ...new Set(
      b.workPackage
        .split(/[,;]/)
        .map((w) => wpTag(w))
        .filter(Boolean),
    ),
  ]
  const packages = [...new Set(r.assets.map((a) => a.workPackage).filter(Boolean))]
  const inStock = r.poLines.reduce((t, l) => t + l.stockLocations.reduce((u, x) => u + x.qty, 0), 0)
  const cells: Record<SectionKey, ReactNode> = {
    purchasing: (
      <>
        <Ro mono box title={`${formatQty(b.quantity)} ${b.uom} required`}>
          {formatQty(b.quantity)}
        </Ro>
        <Ro mono title="Ordered on purchase orders">
          {formatQty(r.ordered)}
        </Ro>
        <Ro>{b.uom}</Ro>
        <Ro mono title={r.orders.map((o) => o.poNo).join(', ') || 'No PO yet — use Create purchase order'}>
          {r.orders[0]?.poNo ? `${r.orders[0].poNo}${r.orders.length > 1 ? ` +${r.orders.length - 1}` : ''}` : ''}
        </Ro>
        <Box>
          <InlineDate value={b.poDate} max={b.eta || undefined} label={`PO date of ${name}`} saving={saving} onSave={date('PO_Date', 'poDate')} />
        </Box>
        <Ro title={order?.issuedBy}>{order?.issuedBy}</Ro>
        <Ro mono right title={`PO value (${p.currency})`}>
          {r.poValue ? `${p.currency} ${amount(r.poValue)}` : ''}
        </Ro>
      </>
    ),
    transit: (
      <>
        <Box>
          <InlineSelect
            value={b.statusId}
            display={stageStatus(r)}
            tone={`pg-${statusTone(stageStatus(r))}`}
            options={p.statusOptions.filter((o) => o.id === b.statusId || !isReceiptOnlyStatus(o.label))}
            loading={p.statusLoading}
            label={`Status of ${name}`}
            saving={saving}
            onSave={(id) => {
              const label = p.statusOptions.find((o) => o.id === id)?.label ?? ''
              const block = statusBlock(r, label)
              if (block) return toast(block, 'error')
              save({ Status: id }, { statusId: id, status: label })
            }}
          />
        </Box>
        <Box>
          <InlineSelect
            value={b.modeOfTransit}
            display={b.modeOfTransit}
            options={TRANSIT}
            label={`Mode of transit of ${name}`}
            saving={saving}
            onSave={(v) => save({ Mode_of_Transit: v }, { modeOfTransit: v })}
          />
        </Box>
        <Ro mono right className={eta !== null && eta < 0 ? 'gc-pg-late' : ''} title={eta === null ? '' : eta < 0 ? `${-eta} days late` : `${eta} days to ETA`}>
          {eta === null ? '' : eta < 0 ? `${eta}` : `${eta}`}
        </Ro>
        <Box>
          <InlineDate value={b.eta} min={b.poDate || undefined} label={`ETA date of ${name}`} saving={saving} onSave={date('ETA', 'eta')} />
        </Box>
      </>
    ),
    delivery: (
      <>
        {r.ordered > 0 ? (
          <button
            type="button"
            className={`gc-pg-qty ${r.pending <= 0 ? 'is-full' : ''}`}
            onClick={() => p.onReceive(r)}
            aria-label={`Received ${formatQty(r.received)} of ${formatQty(r.ordered)} — ${name}`}
            title="Goods receipts of this line"
          >
            {formatQty(r.received)} / {formatQty(r.ordered)}
          </button>
        ) : (
          <Ro />
        )}
        <Ro mono box title="Delivered to site / received">
          {r.received > 0 ? `${formatQty(r.delivered)} / ${formatQty(r.received)}` : ''}
        </Ro>
        {r.received > 0 ? (
          <button
            type="button"
            className="gc-pg-qty"
            onClick={() => p.onStock(r)}
            title="Where this line's received units are (warehouse, location, serials, GRN)"
            aria-label={`Stock of ${name}: ${formatQty(inStock)}`}
          >
            {formatQty(inStock)}
          </button>
        ) : (
          <Ro />
        )}
        <Box>
          <InlineDate value={b.dateDeliveredToWarehouse} label={`Warehouse date of ${name}`} saving={saving} onSave={date('Date_delivered_to_warehouse', 'dateDeliveredToWarehouse')} />
        </Box>
        <Ro className={`gc-pg-site gc-pg-site--${siteStatus.toLowerCase()}`}>{r.ordered > 0 ? siteStatus : ''}</Ro>
        <Box>
          <InlineDate value={b.dateDeliveredToCustomer} label={`Site date of ${name}`} saving={saving} onSave={date('Date_delivered_to_customer', 'dateDeliveredToCustomer')} />
        </Box>
        <span className="gc-pg-cell" title={r.notes.map((n) => `${n.no} (${n.status})`).join(', ')}>
          {r.notes[0] ? (
            <button type="button" className="gc-pg-link" onClick={() => p.onOpenDn(r.notes[0].id)}>
              {r.notes[0].no}
              {r.notes.length > 1 ? ` +${r.notes.length - 1}` : ''}
            </button>
          ) : (
            <span className="gc-muted">—</span>
          )}
        </span>
        <span className="gc-pg-cell">
          <button
            type="button"
            className="gc-pg-receive"
            disabled={r.pending <= 0}
            onClick={() => p.onReceive(r)}
            title={r.ordered <= 0 ? 'Raise a PO first' : r.pending <= 0 ? 'Fully received' : `Receive goods — ${formatQty(r.pending)} pending`}
            aria-label={`Receive ${name}`}
          >
            Receive
          </button>
        </span>
      </>
    ),
    payments: (
      <>
        <Ro mono right>
          {order ? (termsDaysOf(order.terms) ?? '') : ''}
        </Ro>
        <Ro mono>{order && dueDateOf(order) ? formatDate(dueDateOf(order)) : ''}</Ro>
        <span className="gc-pg-cell" title="Payments are recorded in Zoho Books">
          {order ? (
            <span className={`gc-pg-pill gc-pg-pill--${r.orders.every((o) => o.booksSynced) ? 'done' : 'action'}`}>{r.orders.every((o) => o.booksSynced) ? 'Synced' : 'Not synced'}</span>
          ) : (
            <span className="gc-muted">—</span>
          )}
        </span>
      </>
    ),
    packages: (
      <>
        <Ro mono className="gc-pg-codes" title={b.workPackage}>
          {codes.join(', ')}
        </Ro>
        <Ro title={packages.join('\n')}>{packages.join(' · ')}</Ro>
        <Ro mono right>
          {r.assets.length || ''}
        </Ro>
      </>
    ),
  }
  const missing = missingInfo(r)
  return (
    <div role="row" className={`gc-pg-row ${p.selected.has(b.id) ? 'is-picked' : ''}`} style={gridFor(core, p.hiddenSections, p.hidePick ? 0 : PICK_WIDTH)} aria-label={`${b.vendor} ${name}`}>
      {!p.hidePick && (
        <div role="cell" className="gc-pg-sticky gc-pg-pick gc-pg-corecell" style={{ left: 0 }} title={block}>
          <input
            type="checkbox"
            className="gc-pg-check"
            checked={p.selected.has(b.id)}
            disabled={!!block && !p.selected.has(b.id)}
            aria-label={`Pick ${name} for a purchase order`}
            onChange={(e) => p.onPick(b.id, e.target.checked)}
          />
        </div>
      )}
      {core.map((c, i) => (
        <div
          key={c.key}
          role="cell"
          aria-label={c.label}
          className={`gc-pg-sticky gc-pg-corecell ${i === core.length - 1 ? 'gc-pg-edge' : ''} ${c.key === 'model' ? 'gc-pg-model' : ''}`}
          style={{ left: coreLeft(core, i, p.hidePick ? 0 : PICK_WIDTH) }}
        >
          {c.key === 'vendor' && r.ordered === 0 ? (
            <Box>
              <InlineSelect
                value={b.vendorId}
                display={b.vendor}
                options={p.vendors}
                label={`Vendor of ${name}`}
                saving={saving}
                onSave={(id) => save({ Vendors: id }, { vendorId: id, vendor: p.vendors.find((v) => v.id === id)?.label ?? '' })}
              />
            </Box>
          ) : (
            <>
              <span className="gc-pg-text" title={values[c.key] || '—'}>
                {values[c.key] || <span className="gc-muted">—</span>}
              </span>
              {c.key === 'model' && missing.length > 0 && <MissingInfo name={name} missing={missing} />}
            </>
          )}
        </div>
      ))}
      {SECTIONS.map((s) => (
        <div key={s.key} role="cell" aria-label={s.label} className="gc-pg-cells" style={{ gridTemplateColumns: sectionColumns(s), ...show(s.key) }}>
          {cells[s.key]}
        </div>
      ))}
    </div>
  )
}

/** Read-only value: one value per cell, never wraps (full text in the tooltip). */
function Ro({ children, mono, right, box, title, className = '' }: { children?: ReactNode; mono?: boolean; right?: boolean; box?: boolean; title?: string; className?: string }) {
  const empty = children === undefined || children === null || children === ''
  return (
    <span
      className={`gc-pg-cell ${mono ? 'gc-pg-mono' : ''} ${right ? 'gc-pg-right' : ''} ${box ? 'gc-pg-robox' : ''} ${className}`}
      title={title ?? (typeof children === 'string' ? children : undefined)}
    >
      {empty ? <span className="gc-muted">—</span> : children}
    </span>
  )
}

/** Editable value: the bordered, fixed-size box that holds the click-to-edit control. */
const Box = ({ children }: { children: ReactNode }) => <span className="gc-pg-box">{children}</span>

/** Where each missing value is filled in (missingInfo keys) */
const MISSING_WHERE: Record<string, { label: string; where: string }> = {
  vendor: { label: 'Vendor', where: 'Vendor column' },
  'unit cost': { label: 'Unit cost', where: 'approved Cost Analysis' },
  ETA: { label: 'ETA', where: 'Transit section' },
  'transit mode': { label: 'Mode of transit', where: 'Transit section' },
}

/** The i on a line with missing values: just the symbol; hover (or focus) shows the required details still missing */
function MissingInfo({ name, missing }: { name: string; missing: string[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setAt({ left: Math.max(8, Math.min(r.left + r.width / 2 - 14, window.innerWidth - 260)), top: r.bottom + 7 })
  }
  return (
    <>
      <span
        className="gc-pg-info"
        role="img"
        tabIndex={0}
        aria-label={`Missing on ${name}: ${missing.join(', ')}`}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setAt(null)}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={() => setAt(null)}
      >
        i
      </span>
      {at &&
        createPortal(
          <div className="gc-pg-infotip" role="tooltip" style={{ left: at.left, top: at.top }}>
            <span className="gc-pg-infotip__title">Missing</span>
            <ul>
              {missing.map((m) => (
                <li key={m}>
                  {MISSING_WHERE[m]?.label ?? m}
                  <span className="gc-pg-infotip__where"> · {MISSING_WHERE[m]?.where ?? 'schedule'}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  )
}
