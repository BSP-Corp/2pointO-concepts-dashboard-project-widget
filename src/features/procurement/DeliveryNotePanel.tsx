import { useMemo, useState } from 'react'
import { DateInput } from '@/features/console/DateInput'
import { DIVISIONS } from '@/config/zoho'
import { SidePanel } from '@/features/console/ui'
import { useCreateDeliveryNote, useOptions, useUpdateDeliveryNote } from '@/features/projects/api'
import { localToday } from '@/features/project/model'
import { formatDate, formatMoney, formatQty } from '@/lib/utils'
import { DN_STATUS, type DeliveryNote, type PoLine, type Project, type PurchaseOrder } from '@/types/domain'
import { toast } from '@/features/console/toast'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { loadLogo } from '@/lib/logo'
import { downloadDeliveryNote } from './deliveryNotePdf'
import { FileAttach, fileProblems } from './FileAttach'
import { LocationLabel, LocationTags } from './location'

const WAREHOUSES = { key: 'warehouses', report: '', label: '' }
const DN_STATUSES = { key: 'dnStatuses', report: '', label: '' }
/** Used until the Status records are read: Draft, Ready to Dispatch, Dispatched, Partially Delivered, Delivered, Cancelled */
const DEFAULT_STATUSES = [
  { index: DN_STATUS.draft, label: 'Draft' },
  { index: DN_STATUS.ready, label: 'Ready to Dispatch' },
  { index: DN_STATUS.dispatched, label: 'Dispatched' },
  { index: DN_STATUS.partial, label: 'Partially Delivered' },
  { index: DN_STATUS.delivered, label: 'Delivered' },
  { index: DN_STATUS.cancelled, label: 'Cancelled' },
]
const CHALLAN_TYPES = ['Others', 'Supply on Approval', 'Job Work']
/** Delivery_Note picklists: Source_of_Supply_UAE (emirates) and Source_of_Supply_SAR (GCC countries) */
const EMIRATES = ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras al-Khaimah', 'Sharjah', 'Umm al-Quwain']
const GCC = ['Bahrain', 'Kuwait', 'Oman', 'Qatar', 'Saudi Arabia', 'United Arab Emirates']

/** Received − delivered − on other open notes (a note holds a copy of the line; Delivery.Open_Reserved) */
const available = (l: PoLine) => Math.max(0, l.quantityReceived - l.alreadyDelivered - l.reservedQty)
/** Older notes linked the PO line itself: such a line is taken while that note is open */
const onOpenNote = (l: PoLine) => l.reservedQty === 0 && !!l.deliveryNote && !/^(delivered|cancelled)$/i.test(l.deliveryNote.status)

/** Delivery note status → muted tone */
export const dnTone = (index: number) =>
  index === DN_STATUS.delivered ? 'done' : index === DN_STATUS.cancelled ? 'idle' : index === DN_STATUS.dispatched || index === DN_STATUS.partial ? 'moving' : 'action'

/**
 * Create delivery note (challan) — fixed panel from the left. Only received stock is eligible: received − already
 * delivered − on other open notes. Save → Widget.purchase_delivery (create): a Draft Delivery_Note with a copy of each picked
 * line (Qty to deliver, DN amount), customer and source of supply from the project — as Creator.Create_Delivery_Challan.
 * Source of supply comes from the customer's Place of Supply unless one is picked here.
 */
export function CreateDeliveryNotePanel({ project, orders, poLines, onClose }: { project: Project; orders: PurchaseOrder[]; poLines: PoLine[]; onClose: () => void }) {
  const create = useCreateDeliveryNote(project.id)
  const warehouses = useOptions(WAREHOUSES)
  const eligible = useMemo(() => poLines.filter((l) => available(l) > 0 && !onOpenNote(l)), [poLines])
  const blocked = useMemo(() => poLines.filter((l) => l.quantityReceived > 0 && (available(l) <= 0 || onOpenNote(l))), [poLines])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [date, setDate] = useState(localToday())
  const [challanType, setChallanType] = useState('Others')
  const [warehouseId, setWarehouseId] = useState('')
  // The project reference (from the project, else its estimate / deal) — Widget.purchase_delivery uses the same when empty
  const [reference, setReference] = useState(project.reference)
  const [notes, setNotes] = useState('')
  const [sourceOfSupply, setSourceOfSupply] = useState('')
  const [files, setFiles] = useState<File[]>([])
  // Reporting tag per line: the PO line's tag by default (customers carry no tag); the note's tag can be applied to all
  const [divisions, setDivisions] = useState<Record<string, string>>(() => Object.fromEntries(eligible.map((l) => [l.id, (DIVISIONS as readonly string[]).includes(l.division) ? l.division : ''])))
  const [tag, setTag] = useState('')
  const applyTag = () => setDivisions((s) => Object.fromEntries(Object.keys(s).map((k) => [k, tag])))
  const poNo = (l: PoLine) => orders.find((o) => o.id === l.purchaseOrderId)?.poNo ?? ''
  const chosen = eligible.filter((l) => picked[l.id] !== undefined)
  const problems = [
    chosen.length === 0 && 'Tick at least one received line',
    ...chosen.map((l) => {
      const q = Number(picked[l.id])
      if (!Number.isInteger(q) || q <= 0) return `${l.description || l.item}: quantity must be a whole number above 0`
      if (q > available(l)) return `${l.description || l.item}: only ${available(l)} received and not yet delivered`
      if (!divisions[l.id]) return `${l.description || l.item}: select the reporting tag`
      return false
    }),
    ...fileProblems(files, 'Attach the delivery note file (at least one file)'),
  ].filter((x): x is string => !!x)
  const total = chosen.reduce((s, l) => s + Number(picked[l.id] || 0) * l.rate, 0)
  const save = () =>
    create.mutate(
      {
        projectId: project.id,
        date,
        challanType,
        warehouseId,
        reference,
        notes,
        sourceOfSupply,
        lines: chosen.map((l) => ({ lineId: l.id, quantity: Number(picked[l.id]), division: divisions[l.id] })),
        files,
      },
      {
        onSuccess: () => onClose(),
      },
    )

  return (
    <SidePanel
      title="Create delivery note"
      side="left"
      className="gc-side--po"
      busy={create.isPending}
      onClose={onClose}
      subtitle={`${project.reference} · ${project.client || 'customer'} · only received stock can be delivered`}
      footer={
        <>
          <span className="gc-small gc-soft">Value {formatMoney(total, project.currency)}</span>
          <span className="gc-grow" />
          <button type="button" className="gc-pg-btn" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button type="button" className="gc-pg-btn gc-pg-btn--primary" disabled={problems.length > 0 || create.isPending} title={problems[0] ?? ''} onClick={save}>
            {create.isPending ? 'Creating…' : 'Create delivery note'}
          </button>
        </>
      }
    >
      <div className="gc-po-form">
        <label className="gc-field">
          <span className="gc-label">DN number</span>
          <input value="Assigned on save" readOnly className="gc-input--readonly" />
        </label>
        <label className="gc-field">
          <span className="gc-label">DN date</span>
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Challan type</span>
          <select value={challanType} onChange={(e) => setChallanType(e.target.value)}>
            {CHALLAN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">From warehouse</span>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">{warehouses.isLoading ? 'Loading…' : '-Select-'}</option>
            {(warehouses.data ?? [])
              .filter((w) => w.active !== false)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Source of supply</span>
          <select value={sourceOfSupply} onChange={(e) => setSourceOfSupply(e.target.value)} title="Empty = the customer's Place of Supply">
            <option value="">From the customer</option>
            <optgroup label="Emirate (UAE customers)">
              {EMIRATES.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </optgroup>
            <optgroup label="GCC country">
              {GCC.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Reference#</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Project reference" />
        </label>
        <label className="gc-field gc-po-form__wide">
          <span className="gc-label">Customer notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <FileAttach label="Delivery note files" inputLabel="Delivery note files" files={files} onChange={setFiles} required />
      </div>
      <section className="gc-side__section" aria-label="Received stock">
        <div className="gc-po-tag">
          <label className="gc-field">
            <span className="gc-label">Reporting tag (Division)</span>
            <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Reporting tag of the note">
              <option value="">-Select-</option>
              {DIVISIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <button type="button" className="gc-pg-btn" disabled={!tag} onClick={applyTag} title="Give every line this reporting tag">
            Apply to all lines
          </button>
          <span className="gc-small gc-soft">Each line starts with its purchase order line's tag; set it here for all lines or on each line.</span>
        </div>
        <h3 className="gc-side__h">
          Received stock <span className="gc-muted">· {chosen.length} ticked</span>
        </h3>
        {eligible.length === 0 ? (
          <p className="gc-empty">Nothing to deliver — receive goods against a purchase order first.</p>
        ) : (
          <table className="gc-po-table" aria-label="Lines to deliver">
            <colgroup>
              <col style={{ width: 32 }} />
              <col />
              <col style={{ width: 92 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 132 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span className="gc-sr">Pick</span>
                </th>
                <th scope="col">Item</th>
                <th scope="col">PO #</th>
                <th scope="col" className="gc-num">
                  Available
                </th>
                <th scope="col">Qty to deliver</th>
                <th scope="col">Reporting tag</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((l) => {
                const on = picked[l.id] !== undefined
                return (
                  <tr key={l.id} className={on ? 'is-on' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="gc-pg-check"
                        checked={on}
                        aria-label={`Deliver ${l.item || l.description}`}
                        onChange={(e) => setPicked((s) => (e.target.checked ? { ...s, [l.id]: String(available(l)) } : Object.fromEntries(Object.entries(s).filter(([k]) => k !== l.id))))}
                      />
                    </td>
                    <td className="gc-po-item" title={l.description}>
                      <strong>{l.item || l.description}</strong>
                      <span>
                        {l.description}
                        {l.storeWarehouse && !l.stockLocations.length ? ` · ${l.storeWarehouse}` : ''}
                      </span>
                      {l.stockLocations.length > 0 && (
                        <div className="gc-dn-stock" aria-label={`Stock of ${l.item || l.description}`}>
                          {l.stockLocations.map((s, i) => (
                            <div key={i} className="gc-dn-stock__row" title={`Stored by ${s.prNo || 'the purchase receive'}`}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                                <circle cx="12" cy="9.5" r="2.5" />
                              </svg>
                              {s.warehouse && <b className="gc-dn-stock__wh">{s.warehouse}</b>}
                              {s.pallet || s.rack ? <LocationTags rack={s.rack} bay={s.bay} level={s.level} side={s.side} pallet={s.pallet} /> : <b>{s.label}</b>}
                              <b className="gc-dn-stock__qty">
                                {formatQty(s.qty)} in stock{s.prNo ? ` · ${s.prNo}` : ''}
                              </b>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="gc-po-wrap">{poNo(l)}</td>
                    <td className="gc-num">{formatQty(available(l))}</td>
                    <td>
                      <input
                        className="gc-po-input"
                        type="number"
                        min={1}
                        max={available(l)}
                        step={1}
                        disabled={!on}
                        value={picked[l.id] ?? ''}
                        onChange={(e) => setPicked((s) => ({ ...s, [l.id]: e.target.value }))}
                        aria-label={`Qty to deliver — ${l.item || l.description}`}
                      />
                    </td>
                    <td>
                      <select
                        className="gc-po-input"
                        disabled={!on}
                        value={divisions[l.id] ?? ''}
                        onChange={(e) => setDivisions((s) => ({ ...s, [l.id]: e.target.value }))}
                        aria-label={`Reporting tag of ${l.item || l.description}`}
                      >
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
        )}
        {blocked.length > 0 && (
          <p className="gc-small gc-soft">
            Not available:{' '}
            {blocked.map((l) => `${l.item || l.description} (${onOpenNote(l) || l.reservedQty > 0 ? `on ${l.deliveryNote?.no || 'an open delivery note'}` : 'fully delivered'})`).join(' · ')}
          </p>
        )}
      </section>
      {problems.length > 0 && chosen.length > 0 && (
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
    </SidePanel>
  )
}

/**
 * One delivery note: its lines and its status — any Delivery Note status, in the Status form's Order (Draft, Ready to
 * Dispatch, Dispatched, Partially Delivered, Delivered, Cancelled), also after it is delivered or cancelled. Delivered needs
 * who received the goods and the date; Cancelled releases the lines (a cancelled note opens again only while its stock is
 * free). Save → Widget.purchase_delivery (status), as the "Update DL on Success" workflow; then the challan is sent to Zoho Books.
 */
export function DeliveryNoteDetailPanel({ project, note, poLines, onClose }: { project: Project; note: DeliveryNote; poLines: PoLine[]; onClose: () => void }) {
  const projectId = project.id
  const ds = useDataSource()
  const [preparing, setPreparing] = useState(false)
  // Organization address (Zoho Books) and customer details are read when the PDF is made, so it always prints the latest
  const downloadPdf = async () => {
    setPreparing(true)
    try {
      const [info, logo] = await Promise.all([
        ds.deliveryNotePrint(note.id).catch((e: Error) => {
          toast('PDF printed without company details', 'warn', e.message)
          return null
        }),
        loadLogo(),
      ])
      downloadDeliveryNote(note, poLines, project, info, logo)
    } finally {
      setPreparing(false)
    }
  }
  const download = (
    <button type="button" className="gc-pg-btn" onClick={downloadPdf} disabled={preparing} title="Download this delivery note as a PDF">
      {preparing ? 'Preparing…' : '⤓ Download'}
    </button>
  )
  const update = useUpdateDeliveryNote(projectId)
  const statusList = useOptions(DN_STATUSES)
  const statuses = useMemo(() => {
    const read = (statusList.data ?? []).filter((o) => o.index).map((o) => ({ index: o.index!, label: o.label, order: o.order || 0 }))
    if (!read.length) return DEFAULT_STATUSES
    return read.sort((x, y) => (x.order || 99) - (y.order || 99) || x.index - y.index)
  }, [statusList.data])
  const current = note.statusIndex || DN_STATUS.draft
  const [target, setTarget] = useState(current)
  const [receivedBy, setReceivedBy] = useState(note.receivedBy)
  const [deliveredDate, setDeliveredDate] = useState(note.deliveredDate || localToday())
  const [vehicleNo, setVehicleNo] = useState(note.vehicleNo)
  const [driverName, setDriverName] = useState(note.driverName)
  const lineOf = (id: string) => poLines.find((l) => l.id === id)
  const toDelivered = target === DN_STATUS.delivered
  const changed = target !== current || vehicleNo !== note.vehicleNo || driverName !== note.driverName || (toDelivered && (receivedBy !== note.receivedBy || deliveredDate !== note.deliveredDate))
  const problem = !changed
    ? 'Nothing changed'
    : toDelivered && !receivedBy.trim()
      ? 'Enter who received the goods'
      : toDelivered && deliveredDate > localToday()
        ? 'Delivered date cannot be in the future'
        : current === DN_STATUS.cancelled && target !== current && note.lines.length === 0
          ? 'This cancelled note has no lines left — create a new delivery note'
          : ''
  const save = () =>
    update.mutate({ dnId: note.id, statusIndex: target, deliveredDate, receivedBy, vehicleNo, driverName }, { onSuccess: () => (target === DN_STATUS.cancelled ? onClose() : undefined) })
  const labelOf = (index: number) => statuses.find((x) => x.index === index)?.label ?? note.status

  return (
    <SidePanel
      title={note.no || 'Delivery note'}
      side="left"
      busy={update.isPending}
      onClose={onClose}
      subtitle={
        <>
          <span className={`gc-pg-pill gc-pg-pill--${dnTone(current)}`}>{note.status || 'Draft'}</span> {formatDate(note.date)} · {note.challanType || 'Others'}
          {note.reference ? ` · ${note.reference}` : ''}
        </>
      }
      footer={
        <>
          {download}
          <span className="gc-grow" />
          {target === DN_STATUS.cancelled && target !== current && <span className="gc-small">Cancel {note.no}? Its stock is released.</span>}
          <button type="button" className="gc-pg-btn" onClick={onClose} disabled={update.isPending}>
            Close
          </button>
          <button
            type="button"
            className={`gc-pg-btn ${target === DN_STATUS.cancelled && target !== current ? 'gc-pg-btn--warn' : 'gc-pg-btn--primary'}`}
            disabled={!!problem || update.isPending}
            title={problem}
            onClick={save}
          >
            {update.isPending ? 'Saving…' : target !== current ? `Set ${labelOf(target)}` : 'Save'}
          </button>
        </>
      }
    >
      <div className="gc-po-form">
        <label className="gc-field">
          <span className="gc-label">
            Status<span className="gc-danger"> *</span>
          </span>
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Delivery note status">
            {!statuses.some((x) => x.index === current) && <option value={current}>{note.status || 'Draft'}</option>}
            {statuses.map((x) => (
              <option key={x.index} value={x.index}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="gc-po-table" aria-label="Delivery note lines">
        <colgroup>
          <col />
          <col style={{ width: 150 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 100 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">From (receipt / storage)</th>
            <th scope="col" className="gc-num">
              Qty
            </th>
            <th scope="col" className="gc-num">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {note.lines.length === 0 ? (
            <tr>
              <td colSpan={4} className="gc-soft">
                No lines (released on cancel).
              </td>
            </tr>
          ) : (
            note.lines.map((l) => (
              <tr key={l.id}>
                <td className="gc-po-item">
                  <strong>{lineOf(l.id)?.item || lineOf(l.id)?.description || l.id}</strong>
                  <span>{lineOf(l.id)?.description}</span>
                </td>
                <td className="gc-po-item gc-dn-from">
                  <strong>{l.prNo || '—'}</strong>
                  {l.locations.map((loc) => (
                    <span key={loc}>
                      <LocationLabel label={loc} />
                    </span>
                  ))}
                </td>
                <td className="gc-num">{formatQty(l.quantity)}</td>
                <td className="gc-num">{formatMoney(l.amount, project.currency)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="gc-po-form">
        <label className="gc-field">
          <span className="gc-label">Vehicle no.</span>
          <input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Driver name</span>
          <input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Received by{toDelivered && <span className="gc-danger"> *</span>}</span>
          <input value={receivedBy} disabled={!toDelivered} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name at site (for Delivered)" />
        </label>
        <label className="gc-field">
          <span className="gc-label">Delivered date</span>
          <DateInput value={deliveredDate} disabled={!toDelivered} max={localToday()} onChange={(e) => setDeliveredDate(e.target.value)} />
        </label>
      </div>
      <p className="gc-small gc-soft">
        {note.booksId ? 'In Zoho Books.' : 'Sent to Zoho Books when the status moves on (not for cancelled notes).'} Signed DN and attachments are added on the record in Creator.
      </p>
      {update.error && (
        <p className="gc-po-error" role="alert">
          {update.error.message}
        </p>
      )}
    </SidePanel>
  )
}
