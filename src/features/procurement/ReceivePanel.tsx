import { FileAttach, fileProblems } from './FileAttach'
import { DateInput } from '@/features/console/DateInput'
import { Fragment, useMemo, useState } from 'react'
import { SidePanel } from '@/features/console/ui'
import { useOptions, useReceiveGoods } from '@/features/projects/api'
import { localToday } from '@/features/project/model'
import { formatDate, formatQty } from '@/lib/utils'
import { POSITIONS, type GoodsReceipt, type PoLine, type PurchaseOrder, type ReceivedUnit } from '@/types/domain'
import { LocationLabel, LocationTags, RackPicker } from './location'

const WAREHOUSES = { key: 'warehouses', report: '', label: '' }
const RACKS = { key: 'racks', report: '', label: '' }
const SEGMENTS = { key: 'segments', report: '', label: '' }
const SITE = 'site'

/** Where one received unit goes: rack, pallet and exact position (picked on the unit's serial row) */
interface UnitLoc {
  rackId: string
  segmentId: string
  position: string
  note: string
}
/** One put-away split of a line (one Storage row): the units that share a location */
interface Place extends UnitLoc {
  qty: string
}
const NO_LOC: UnitLoc = { rackId: '', segmentId: '', position: '', note: '' }
/** Warranty end = start + months − 1 day, as the Purchase Receive form (29 Oct 2026 + 12 → 28 Oct 2027) */
const addMonths = (iso: string, months: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last)))
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

/**
 * Receive goods (Purchase Receive) — a fixed panel from the left for one purchase order. Only lines with units still pending
 * are listed (a later receipt shows only what is left). Per line: the quantity received now (≤ pending) and one row per
 * received unit with its serial number, MAC address, warranty and location — rack (Warehouse_Racks), pallet (Bay: bay, level,
 * side) and exact position, picked on the unit's own row (row 1's location applies to the units not given their own). Units
 * sharing a location become one Storage row; each serial points to its row (GRN_Serial.Storage). Pallets
 * are picked on the rack's colour bands (bay + level, Right / Left). Direct to site: no put-away; the receipt also creates a
 * delivered delivery note (Books stock in and out again), so who received it at site is needed. The supplier's delivery note
 * photo / scan goes into Purchase_Receive.Attachments. Same rules as the Purchase Receive form: one pallet per location,
 * pallet capacity, serials for all units of a line or none, no serial twice. Save → Widget.purchase_receive.
 */
export function ReceivePanel({
  projectId,
  orders,
  poLines,
  receipts,
  initialPoId,
  focusLineId,
  onClose,
}: {
  projectId: string
  orders: PurchaseOrder[]
  poLines: PoLine[]
  receipts: GoodsReceipt[]
  initialPoId: string
  focusLineId?: string
  onClose: () => void
}) {
  const receive = useReceiveGoods(projectId)
  const warehouses = useOptions(WAREHOUSES, true, true)
  const racks = useOptions(RACKS, true, true)
  const segments = useOptions(SEGMENTS, true, true)
  const [poId, setPoId] = useState(initialPoId)
  const po = orders.find((o) => o.id === poId)
  const pendingOf = (l: PoLine) => Math.max(0, l.quantity - l.quantityReceived)
  const all = useMemo(() => poLines.filter((l) => l.purchaseOrderId === poId), [poLines, poId])
  const lines = all.filter((l) => pendingOf(l) > 0)
  const done = all.length - lines.length
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(poLines.filter((l) => l.purchaseOrderId === initialPoId).map((l) => [l.id, !focusLineId || l.id === focusLineId ? String(pendingOf(l)) : '0'])),
  )
  const [date, setDate] = useState(localToday())
  const [supplierDn, setSupplierDn] = useState('')
  const [notes, setNotes] = useState('')
  const [siteReceivedBy, setSiteReceivedBy] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [picking, setPicking] = useState('')
  const [warehouseId, setWarehouseId] = useState(po?.warehouseId ?? '')
  const [loc, setLoc] = useState<Record<string, (UnitLoc | undefined)[]>>({})
  const [units, setUnits] = useState<Record<string, ReceivedUnit[]>>({})
  const [paste, setPaste] = useState<Record<string, string>>({})
  const history = receipts.filter((r) => r.purchaseOrderId === poId)
  const activeWarehouses = (warehouses.data ?? []).filter((w) => w.active !== false)
  const inWarehouse = !!warehouseId && warehouseId !== SITE
  /** The location column shows until direct to site is chosen; its controls work once a warehouse is selected */
  const showLoc = warehouseId !== SITE
  const rackOptions = (racks.data ?? []).filter((r) => r.parent === warehouseId)
  const segmentsOf = (rackId: string) => (segments.data ?? []).filter((s) => s.parent === rackId && s.active !== false)
  const warehouseName = activeWarehouses.find((w) => w.id === warehouseId)?.label ?? 'this warehouse'

  const choosePo = (id: string) => {
    setPoId(id)
    setQty(Object.fromEntries(poLines.filter((l) => l.purchaseOrderId === id).map((l) => [l.id, String(pendingOf(l))])))
    setWarehouseId(orders.find((o) => o.id === id)?.warehouseId ?? '')
    setLoc({})
    setUnits({})
  }
  const count = (l: PoLine) => Number(qty[l.id] || 0)
  const unitCount = (l: PoLine) => (Number.isInteger(count(l)) && count(l) > 0 ? Math.min(count(l), pendingOf(l)) : 0)
  /** A unit's own location; units without one follow unit 1 */
  const ownLoc = (l: PoLine, i: number) => (inWarehouse ? loc[l.id]?.[i] : undefined)
  const locOf = (l: PoLine, i: number): UnitLoc => ownLoc(l, i) ?? ownLoc(l, 0) ?? NO_LOC
  const setLocOf = (l: PoLine, i: number, p: Partial<UnitLoc>) =>
    setLoc((s) => {
      const rows = [...(s[l.id] ?? [])]
      rows[i] = { ...locOf(l, i), ...p }
      return { ...s, [l.id]: rows }
    })
  /** Storage rows of a line: units with the same rack, pallet and position share one row; index = each unit's row */
  const putAway = (l: PoLine): { places: Place[]; index: number[] } => {
    if (!inWarehouse) return { places: [], index: [] }
    const keys: string[] = []
    const places: Place[] = []
    const index: number[] = []
    for (let i = 0; i < unitCount(l); i++) {
      const x = locOf(l, i)
      const k = [x.rackId, x.segmentId, x.position, x.position === 'Other' ? x.note.trim() : ''].join('|')
      let at = keys.indexOf(k)
      if (at < 0) {
        at = keys.push(k) - 1
        places.push({ ...x, qty: '0' })
      }
      places[at] = { ...places[at], qty: String(Number(places[at].qty) + 1) }
      index.push(at)
    }
    return {
      places: places.length ? places : [{ ...NO_LOC, qty: String(count(l)) }],
      index,
    }
  }
  const placesOf = (l: PoLine) => putAway(l).places
  /** One row per unit received now (rows beyond the quantity are dropped); warranty defaults: product months, receipt date */
  const unitsOf = (l: PoLine): Required<ReceivedUnit>[] => {
    const index = putAway(l).index
    return Array.from({ length: unitCount(l) }, (_, i) => {
      const u = units[l.id]?.[i]
      return {
        serialNo: u?.serialNo ?? '',
        mac: u?.mac ?? '',
        warrantyMonths: u?.warrantyMonths ?? (l.warrantyMonths ? String(l.warrantyMonths) : ''),
        warrantyStart: u?.warrantyStart ?? date,
        place: index[i] ?? 0,
      }
    })
  }
  /** The paste box and the serial rows are one list: editing either updates the other */
  const keepPicked = (_l: PoLine, list: Required<ReceivedUnit>[]): ReceivedUnit[] => list.map(({ place: _at, ...u }) => u)
  const setUnit = (l: PoLine, i: number, u: Partial<ReceivedUnit>) => {
    const list = keepPicked(l, unitsOf(l))
    list[i] = { ...list[i], ...u }
    setUnits((s) => ({ ...s, [l.id]: list }))
    if (u.serialNo !== undefined)
      setPaste((s) => ({
        ...s,
        [l.id]: list
          .map((x) => x.serialNo)
          .join('\n')
          .replace(/\n+$/, ''),
      }))
  }
  const pasteSerials = (l: PoLine, text: string) => {
    setPaste((s) => ({ ...s, [l.id]: text }))
    const serials = text.split(/\r?\n/).map((x) => x.trim())
    setUnits((s) => ({
      ...s,
      [l.id]: keepPicked(l, unitsOf(l)).map((u, i) => ({
        ...u,
        serialNo: serials[i] ?? '',
      })),
    }))
  }
  const applyToAll = (l: PoLine) => {
    const [first, ...rest] = keepPicked(l, unitsOf(l))
    setUnits((s) => ({
      ...s,
      [l.id]: [
        first,
        ...rest.map((u) => ({
          ...u,
          warrantyMonths: first.warrantyMonths,
          warrantyStart: first.warrantyStart,
        })),
      ],
    }))
  }
  const name = (l: PoLine) => l.item || l.description
  const bayOf = (id: string) => (segments.data ?? []).find((s) => s.id === id)
  const rackCodeOf = (id: string) => rackOptions.find((x) => x.id === id)?.label ?? ''
  /** Rack · bay · level · side · pallet of a location, for the chips */
  const partsOfPlace = (p: UnitLoc) => {
    const b = bayOf(p.segmentId)
    return {
      rack: rackCodeOf(p.rackId),
      bay: b?.bay,
      level: b?.level,
      side: b?.side,
      pallet: b?.pallet || (b ? b.label : undefined),
    }
  }

  const entered = lines.filter((l) => count(l) > 0)
  const allSerials = entered.flatMap((l) => unitsOf(l).map((u) => u.serialNo.trim().toUpperCase())).filter(Boolean)
  const problems = [
    !po && 'Select the purchase order',
    entered.length === 0 && 'Enter a received quantity for at least one line',
    date > localToday() && 'Receipt date cannot be in the future',
    !warehouseId && 'Select the warehouse the goods go into (or direct to site)',
    warehouseId === SITE && !siteReceivedBy.trim() && 'Direct to site: enter who received the goods at site',
    ...fileProblems(files, 'Attach the supplier delivery note (at least one file)'),
    ...lines.map((l) => {
      const q = count(l)
      if (!Number.isInteger(q) || q < 0) return `${name(l)}: whole numbers only`
      if (q > pendingOf(l)) return `${name(l)}: only ${pendingOf(l)} still to receive (ordered ${l.quantity}, received ${l.quantityReceived})`
      return false
    }),
    ...entered.flatMap((l) => {
      const rows = placesOf(l)
      const filled = unitsOf(l).filter((u) => u.serialNo.trim()).length
      const badWarranty = unitsOf(l).some((u) => u.warrantyMonths.trim() !== '' && !/^\d+$/.test(u.warrantyMonths.trim()))
      const allBays = entered.flatMap((x) => placesOf(x).map((r) => r.segmentId)).filter(Boolean)
      return [
        badWarranty && `${name(l)}: vendor warranty must be whole months`,
        ...rows.flatMap((p, i) => {
          const seg = bayOf(p.segmentId)
          const q = Number(p.qty)
          const at = rows.length > 1 ? ` (location ${i + 1})` : ''
          return [
            seg && seg.capacity !== undefined && !(seg.capacity > 0) && `${name(l)}${at}: pallet ${seg.pallet || seg.label} has no capacity set`,
            seg &&
              seg.free !== undefined &&
              q > seg.free &&
              `${name(l)}: pallet ${seg.pallet || seg.label} has only ${seg.free} free but ${q} units are on it — pick another pallet for the other units`,
            p.segmentId && allBays.filter((b) => b === p.segmentId).length > 1 && `Pallet ${seg?.pallet || seg?.label || ''} is used for more than one line or position — one per pallet`,
            p.position && !p.segmentId && `${name(l)}${at}: select the pallet for the position ${p.position}`,
            p.position === 'Other' && !p.note.trim() && `${name(l)}${at}: describe the Other position`,
          ]
        }),
        filled > 0 && filled !== count(l) && `${name(l)}: enter a serial for every unit received (${filled} of ${count(l)}) — or none`,
      ]
    }),
    allSerials.length !== new Set(allSerials).size && `Serial ${allSerials.find((s, i) => allSerials.indexOf(s) !== i)} is entered twice`,
  ].filter((x): x is string => !!x)
  const save = () => {
    receive.mutate(
      {
        poId,
        date,
        supplierDn,
        notes,
        siteReceivedBy: warehouseId === SITE ? siteReceivedBy.trim() : '',
        files,
        lines: entered.map((l) => ({
          lineId: l.id,
          quantity: count(l),
          warehouseId: inWarehouse ? warehouseId : '',
          places: placesOf(l).map((p) => ({
            rackId: p.rackId,
            segmentId: p.segmentId,
            position: p.position,
            positionNote: p.position === 'Other' ? p.note.trim() : '',
            quantity: Number(p.qty),
          })),
          serials: unitsOf(l).map((u) => ({
            serialNo: u.serialNo.trim(),
            mac: u.mac.trim(),
            warrantyMonths: u.warrantyMonths.trim(),
            warrantyStart: u.warrantyStart,
            place: inWarehouse ? u.place : undefined,
          })),
        })),
      },
      {
        onSuccess: () => onClose(),
      },
    )
  }

  return (
    <SidePanel
      title="Receive goods"
      side="left"
      busy={receive.isPending}
      onClose={onClose}
      className="gc-side--po gc-side--rcv"
      subtitle={po ? `${po.poNo} · ${po.vendor}` : 'Purchase order'}
      footer={
        <>
          <span className="gc-small gc-soft">Stock updates only through goods receipt.</span>
          <span className="gc-grow" />
          <button type="button" className="gc-pg-btn" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </button>
          <button type="button" className="gc-pg-btn gc-pg-btn--primary" disabled={problems.length > 0 || receive.isPending} title={problems[0] ?? ''} onClick={save}>
            {receive.isPending ? 'Saving receipt…' : 'Save receipt'}
          </button>
        </>
      }
    >
      <div className="gc-po-form">
        <label className="gc-field">
          <span className="gc-label">Purchase order</span>
          <select value={poId} onChange={(e) => choosePo(e.target.value)} aria-label="Purchase order">
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.poNo} · {o.vendor}
              </option>
            ))}
          </select>
        </label>
        <label className="gc-field">
          <span className="gc-label">Receipt date</span>
          <DateInput value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="gc-field">
          <span className="gc-label">Supplier DN #</span>
          <input value={supplierDn} onChange={(e) => setSupplierDn(e.target.value)} placeholder="Vendor's delivery note" />
        </label>
        <label className="gc-field">
          <span className="gc-label">
            Warehouse<span className="gc-danger"> *</span>
          </span>
          <select value={warehouseId} onChange={(e) => (setWarehouseId(e.target.value), setLoc({}))} aria-label="Warehouse">
            <option value="">{warehouses.isLoading ? 'Loading…' : '-Select-'}</option>
            <option value={SITE}>Direct to site (no warehouse)</option>
            {activeWarehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        {warehouseId === SITE && (
          <label className="gc-field">
            <span className="gc-label">
              Received at site by<span className="gc-danger"> *</span>
            </span>
            <input value={siteReceivedBy} onChange={(e) => setSiteReceivedBy(e.target.value)} placeholder="Client's name" />
          </label>
        )}
        <FileAttach label="Supplier documents" inputLabel="Supplier delivery note files" files={files} onChange={setFiles} required />
        <label className="gc-field gc-po-form__wide">
          <span className="gc-label">Notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <section className="gc-side__section" aria-label="Lines to receive">
        <h3 className="gc-side__h">Pending lines {done > 0 && <span className="gc-muted">· {done} fully received</span>}</h3>
        {lines.length === 0 ? (
          <p className="gc-empty">Every line of this purchase order is fully received.</p>
        ) : (
          <table className="gc-po-table" aria-label="Lines to receive">
            <colgroup>
              <col />
              <col style={{ width: 72 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 96 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="gc-num">
                  Ordered
                </th>
                <th scope="col" className="gc-num">
                  Received
                </th>
                <th scope="col" className="gc-num">
                  Pending
                </th>
                <th scope="col">Receive now</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={count(l) > 0 ? 'is-on' : ''}>
                  <td className="gc-po-item" title={l.description}>
                    <strong>{name(l)}</strong>
                    <span>{l.description}</span>
                  </td>
                  <td className="gc-num">{formatQty(l.quantity)}</td>
                  <td className="gc-num">{formatQty(l.quantityReceived)}</td>
                  <td className="gc-num">{formatQty(pendingOf(l))}</td>
                  <td>
                    <input
                      className="gc-po-input"
                      type="number"
                      min={0}
                      max={pendingOf(l)}
                      step={1}
                      value={qty[l.id] ?? '0'}
                      onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))}
                      aria-label={`Receive now — ${name(l)}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {inWarehouse && racks.isSuccess && rackOptions.length === 0 && entered.length > 0 && (
        <p className="gc-po-note" role="status">
          No racks are set up for {warehouseName}. Add them in Creator → Warehouse Racks (Warehouse = {warehouseName}, Active), then{' '}
          <button type="button" className="gc-link" onClick={() => (racks.refetch(), segments.refetch())} disabled={racks.isFetching}>
            {racks.isFetching ? 'reading racks…' : 'read the racks again'}
          </button>
          . You can still save — the stock is kept as “Not placed”.
        </p>
      )}
      {inWarehouse && (racks.isError || segments.isError) && (
        <p className="gc-po-error" role="alert">
          Racks or bays could not be read: {(racks.error ?? segments.error)?.message}{' '}
          <button type="button" className="gc-link" onClick={() => (racks.refetch(), segments.refetch())}>
            Try again
          </button>
        </p>
      )}
      {entered.map((l) => {
        const list = unitsOf(l)
        const otherLines = entered
          .filter((x) => x.id !== l.id)
          .flatMap((x) => placesOf(x).map((r) => r.segmentId))
          .filter(Boolean)
        return (
          <section key={l.id} className="gc-side__section gc-rcv" aria-label={`Put-away and units — ${name(l)}`}>
            <h3 className="gc-side__h">
              {name(l)}{' '}
              <span className="gc-muted">
                · {list.length} unit{list.length === 1 ? '' : 's'} received now · {pendingOf(l) - list.length} stay pending
              </span>
            </h3>
            {!inWarehouse && warehouseId === SITE && (
              <p className="gc-small gc-soft">Direct to site — no put-away; a delivered delivery note is created with the receipt, so Zoho Books stock goes in and out again.</p>
            )}
            <details className="gc-rcv__paste">
              <summary>Paste serials</summary>
              <textarea
                rows={3}
                value={paste[l.id] ?? ''}
                onChange={(e) => pasteSerials(l, e.target.value)}
                placeholder="One serial per line — fills the rows in order"
                aria-label={`Paste serials — ${name(l)}`}
              />
            </details>
            <div className="gc-rcv__scroll">
              <table className="gc-po-table gc-rcv__units" aria-label={`Units of ${name(l)}`}>
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col />
                  <col style={{ width: '16%' }} />
                  {showLoc && <col style={{ width: 104 }} />}
                  {showLoc && <col style={{ width: 196 }} />}
                  {showLoc && <col style={{ width: 124 }} />}
                  <col style={{ width: 96 }} />
                  <col style={{ width: 150 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Serial number</th>
                    <th scope="col">MAC address</th>
                    {showLoc && <th scope="col">Rack</th>}
                    {showLoc && (
                      <th scope="col" title="Bay · Level · Side · Pallet">
                        Pallet <span className="gc-rcv__sub">bay · level · side</span>
                      </th>
                    )}
                    {showLoc && <th scope="col">Position</th>}
                    <th scope="col">
                      Warranty (months)
                      {list.length > 1 && (
                        <button type="button" className="gc-link gc-rcv__sub" onClick={() => applyToAll(l)} title="Copy row 1's warranty to every unit">
                          Apply to all
                        </button>
                      )}
                    </th>
                    <th scope="col" title="Warranty end = start + months − 1 day">
                      Warranty start / end
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((u, i) => {
                    const x = locOf(l, i)
                    const key = `${l.id}-${i}`
                    const at = `${i + 1} — ${name(l)}`
                    return (
                      <Fragment key={i}>
                        <tr className={picking === key ? 'is-picking' : ''}>
                          <td className="gc-num">{i + 1}</td>
                          <td>
                            <input
                              className="gc-po-input"
                              value={u.serialNo}
                              data-serial={`${l.id}-${i}`}
                              onChange={(e) => setUnit(l, i, { serialNo: e.target.value })}
                              onKeyDown={(e) => {
                                // scanner friendly: Enter moves to the next unit's serial
                                if (e.key !== 'Enter') return
                                e.preventDefault()
                                document.querySelector<HTMLInputElement>(`[data-serial="${l.id}-${i + 1}"]`)?.focus()
                              }}
                              aria-label={`Serial ${i + 1} — ${name(l)}`}
                            />
                          </td>
                          <td>
                            <input className="gc-po-input" value={u.mac} onChange={(e) => setUnit(l, i, { mac: e.target.value })} aria-label={`MAC ${i + 1} — ${name(l)}`} />
                          </td>
                          {showLoc && (
                            <td>
                              <select
                                className="gc-po-input"
                                value={x.rackId}
                                disabled={!inWarehouse || !rackOptions.length}
                                title={inWarehouse ? '' : 'Select the warehouse first'}
                                onChange={(e) => (setLocOf(l, i, { rackId: e.target.value, segmentId: '', position: '' }), setPicking(e.target.value ? key : ''))}
                                aria-label={`Rack ${at}`}
                              >
                                <option value="">{racks.isLoading ? '…' : 'Select'}</option>
                                {rackOptions.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          {showLoc && (
                            <td className="gc-rcv__loc">
                              <button
                                type="button"
                                className={`gc-rcv__pallet ${picking === key ? 'is-on' : ''} ${x.segmentId ? 'is-set' : ''}`}
                                disabled={!x.rackId}
                                onClick={() => setPicking(picking === key ? '' : key)}
                                aria-expanded={picking === key}
                                aria-label={`Pallet ${at}`}
                                title={x.segmentId ? 'Change the pallet' : 'Pick the pallet'}
                              >
                                {x.segmentId ? <LocationTags {...partsOfPlace(x)} rack={undefined} compact /> : <span>{x.rackId ? 'Pick pallet ▾' : '—'}</span>}
                              </button>
                              {i > 0 && !ownLoc(l, i) && x.rackId && <span className="gc-rcv__same">Same as #1</span>}
                            </td>
                          )}
                          {showLoc && (
                            <td>
                              <select className="gc-po-input" value={x.position} disabled={!x.segmentId} onChange={(e) => setLocOf(l, i, { position: e.target.value })} aria-label={`Position ${at}`}>
                                <option value="">Select</option>
                                {POSITIONS.map((p) => (
                                  <option key={p}>{p}</option>
                                ))}
                              </select>
                              {x.position === 'Other' && (
                                <input
                                  className="gc-po-input gc-rcv__note"
                                  value={x.note}
                                  onChange={(e) => setLocOf(l, i, { note: e.target.value })}
                                  placeholder="Describe"
                                  aria-label={`Position note ${at}`}
                                />
                              )}
                            </td>
                          )}
                          <td>
                            <input
                              className="gc-po-input"
                              type="number"
                              min={0}
                              step={1}
                              value={u.warrantyMonths}
                              onChange={(e) => setUnit(l, i, { warrantyMonths: e.target.value })}
                              aria-label={`Warranty months ${i + 1} — ${name(l)}`}
                            />
                          </td>
                          <td>
                            <DateInput
                              className="gc-po-input"

                              value={u.warrantyStart}
                              onChange={(e) => setUnit(l, i, { warrantyStart: e.target.value })}
                              aria-label={`Warranty start ${i + 1} — ${name(l)}`}
                            />
                            <span className="gc-small gc-soft gc-rcv__end" aria-label={`Warranty end ${i + 1} — ${name(l)}`}>
                              {u.warrantyStart && /^\d+$/.test(u.warrantyMonths.trim()) ? `to ${formatDate(addMonths(u.warrantyStart, Number(u.warrantyMonths)))}` : '—'}
                            </span>
                          </td>
                        </tr>
                        {inWarehouse && picking === key && x.rackId && (
                          <tr className="gc-rcv__picker">
                            <td colSpan={showLoc ? 8 : 5}>
                              <RackPicker
                                rackCode={rackCodeOf(x.rackId)}
                                pallets={segmentsOf(x.rackId)}
                                value={x.segmentId}
                                need={1}
                                taken={otherLines}
                                onPick={(id) => (setLocOf(l, i, { segmentId: id }), setPicking(''))}
                                label={`Pallet for unit ${at}`}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="gc-small gc-soft">
              {showLoc && !inWarehouse && 'Select the warehouse above to pick each unit’s rack and pallet. '}
              {inWarehouse && 'Rack, pallet and position of row 1 apply to every unit that has not been given its own. '}
              Type the serials in the rows or paste them above — both are the same list. Serials: for every unit of this line, or none (they can be added later in the Purchase Receive).
            </p>
          </section>
        )
      })}

      {problems.length > 0 && entered.length > 0 && (
        <ul className="gc-po-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {receive.error && (
        <p className="gc-po-error" role="alert">
          {receive.error.message}
        </p>
      )}
      <section className="gc-side__section" aria-label="Earlier receipts">
        <h3 className="gc-side__h">Earlier receipts</h3>
        {history.length === 0 ? (
          <p className="gc-small gc-soft">No goods received on this PO yet.</p>
        ) : (
          <ul className="gc-po-history">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{h.no}</strong> · {formatDate(h.date)} · {formatQty(h.lines.reduce((s, l) => s + l.quantity, 0))} units · {h.lines.reduce((s, l) => s + l.serials, 0)} serials
                <span className={`gc-pg-pill gc-pg-pill--${h.booksId ? 'done' : 'action'}`}>{h.booksId ? 'Books' : 'Not in Books'}</span>
                {h.lines.map((l) => (
                  <div key={l.id} className="gc-small">
                    <span className="gc-soft">
                      {l.item || 'Line'} · {formatQty(l.quantity)} →{' '}
                    </span>
                    {l.directToSite ? (
                      <span className="gc-soft">direct to site</span>
                    ) : l.places.length ? (
                      l.places.map((x) => (
                        <span key={x.id} className="gc-loc-line">
                          <LocationTags rack={x.rack} bay={x.bay} level={x.level} side={x.side} pallet={x.pallet} /> <span className="gc-soft">×{formatQty(x.qty)}</span>
                        </span>
                      ))
                    ) : l.locations.length ? (
                      l.locations.map((x) => <LocationLabel key={x} label={x} />)
                    ) : (
                      <span className="gc-soft">{l.warehouse || 'Not placed'}</span>
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </SidePanel>
  )
}
