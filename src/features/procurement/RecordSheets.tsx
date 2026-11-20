import { useState, type ReactNode } from 'react'
import { daysBetween, localToday } from '@/features/project/model'
import { canView, openFile } from '@/features/console/openFile'
import { formatDate, formatMoney, formatQty } from '@/lib/utils'
import type { DeliveryNote, GoodsReceipt, PoLine, PurchaseOrder, ReceiptFile } from '@/types/domain'
import { LocationLabel, LocationTags } from './location'
import { dnTone } from './DeliveryNotePanel'

/**
 * Procurement records as one sheet per tab (Purchase Orders · Purchase Receives · Delivery Notes · In Warehouse): a single
 * grid of boxed cells, one row per item, the same Item · Description · Quantity · Amount columns in every tab and the
 * document number repeated on each of its rows — no stacked sections per document.
 */
function Sheet({ label, head, children, foot }: { label: string; head: ReactNode[]; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="gc-sheet-wrap">
      <table className="gc-sheet-grid" aria-label={label}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  )
}

const Num = ({ children }: { children: ReactNode }) => <td className="gc-num">{children}</td>

function BooksCell({ synced, retrying, onRetry }: { synced: boolean; retrying: boolean; onRetry?: () => void }) {
  if (synced) return <span className="gc-soft">In Books</span>
  return (
    <span className="gc-sheet-books">
      Not in Books
      {onRetry && (
        <button type="button" className="gc-link gc-small" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Syncing…' : 'Retry'}
        </button>
      )}
    </span>
  )
}

type Retry = { retrying?: string | null; onRetry?: (kind: 'po' | 'pr', id: string) => void }

export function PurchaseOrderList({ orders, poLines, currency, retrying, onRetry }: { orders: PurchaseOrder[]; poLines: PoLine[]; currency: string } & Retry) {
  if (!orders.length) return <p className="gc-small gc-soft">No purchase orders yet — pick lines and use Create purchase order.</p>
  const rows = orders.flatMap((o) => {
    const lines = poLines.filter((l) => l.purchaseOrderId === o.id)
    return (lines.length ? lines : [null]).map((l) => ({ o, l }))
  })
  return (
    <Sheet
      label="Purchase orders"
      head={['PO #', 'Date', 'Vendor', 'Status', 'Item', 'Description', 'Quantity', 'Received', `Amount (${currency})`, 'Zoho Books']}
      foot={
        <tr>
          <td colSpan={8}>Total</td>
          <Num>
            {formatMoney(
              orders.reduce((t, o) => t + o.totalCost, 0),
              currency,
            )}
          </Num>
          <td />
        </tr>
      }
    >
      {rows.map(({ o, l }) => (
        <tr key={`${o.id}-${l?.id ?? 'none'}`}>
          <td className="gc-pg-mono">{o.poNo}</td>
          <td>{formatDate(o.date)}</td>
          <td>{o.vendor}</td>
          <td>{o.status || '—'}</td>
          <td>{l?.item || '—'}</td>
          <td className="gc-sheet-wrap-text">{l?.description || '—'}</td>
          <Num>{l ? formatQty(l.quantity) : '—'}</Num>
          <Num>{l ? formatQty(l.quantityReceived) : '—'}</Num>
          <Num>{l ? formatMoney(l.amount, currency) : '—'}</Num>
          <td>
            <BooksCell synced={o.booksSynced} retrying={retrying === o.id} onRetry={onRetry && (() => onRetry('po', o.id))} />
          </td>
        </tr>
      ))}
    </Sheet>
  )
}

export interface FileAccess {
  url: (f: ReceiptFile) => string
  read: (f: ReceiptFile) => Promise<Blob | null>
}

/** The files of a receipt or delivery note: a name opens the file (images in the viewer, PDF / text in a new tab, others download); Print where the browser can print it */
function RecordFiles({ no, list, files: access }: { no: string; list: ReceiptFile[]; files: FileAccess }) {
  const [busy, setBusy] = useState('')
  if (!list.length) return <span className="gc-soft">—</span>
  const run = async (f: (typeof list)[number], print: boolean) => {
    setBusy(f.id + f.name)
    await openFile(() => access.read(f), access.url(f), f.name, print)
    setBusy('')
  }
  return (
    <ul className="gc-sheet-files" aria-label={`Files of ${no}`}>
      {list.map((f) => (
        <li key={f.id + f.name}>
          {f.path ? (
            <>
              <button type="button" className="gc-link" onClick={() => run(f, false)} disabled={busy === f.id + f.name} title={canView(f.name) ? 'Open in a new tab' : 'Download'}>
                {f.name}
              </button>
              {canView(f.name) && (
                <button type="button" className="gc-link gc-small" onClick={() => run(f, true)} disabled={busy === f.id + f.name} aria-label={`Print ${f.name}`}>
                  Print
                </button>
              )}
            </>
          ) : (
            <span className="gc-soft" title="The upload did not finish">
              {f.name} (not uploaded)
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ReceiptList({ receipts, poLines, currency, files, retrying, onRetry }: { receipts: GoodsReceipt[]; poLines: PoLine[]; currency: string; files: FileAccess } & Retry) {
  if (!receipts.length) return <p className="gc-small gc-soft">No goods received yet — use Receive on a line.</p>
  const rateOf = (parentLineId: string) => poLines.find((l) => l.id === parentLineId)?.rate ?? 0
  const descOf = (parentLineId: string) => poLines.find((l) => l.id === parentLineId)?.description ?? ''
  const itemOf = (parentLineId: string) => poLines.find((l) => l.id === parentLineId)?.item ?? ''
  type Line = GoodsReceipt['lines'][number]
  type Row = { g: GoodsReceipt; l: Line | null; qty: number; where: ReactNode; serials: string[] }
  const rows = receipts.flatMap((g) =>
    (g.lines.length ? g.lines : [null]).flatMap((l): Row[] => {
      if (!l) return [{ g, l, qty: 0, where: null, serials: [] }]
      if (l.directToSite || !l.places.length)
        return [
          {
            g,
            l,
            qty: l.quantity,
            where: l.directToSite ? 'Direct to site' : l.locations.length ? l.locations.map((x) => <LocationLabel key={x} label={x} />) : l.warehouse || '—',
            serials: l.serialNos,
          },
        ]
      return l.places.map((x) => ({
        g,
        l,
        qty: x.qty,
        where: x.pallet || x.rack ? <LocationTags rack={x.rack} bay={x.bay} level={x.level} side={x.side} pallet={x.pallet} /> : <LocationLabel label={x.label} />,
        serials: l.units.filter((u) => u.storageId === x.id).map((u) => u.serialNo),
      }))
    }),
  )
  return (
    <Sheet
      label="Purchase receives"
      head={['PR #', 'Date', 'PO #', 'Vendor', 'Item', 'Description', 'Quantity', `Amount (${currency})`, 'Location', 'Serial numbers', 'Supplier DN', 'Files', 'Zoho Books']}
    >
      {rows.map(({ g, l, qty, where, serials }, i) => {
        const first = i === 0 || rows[i - 1].g.id !== g.id
        const dn = /Supplier DN:\s*(.+)/.exec(g.notes)?.[1]?.trim() ?? ''
        return (
          <tr key={`${g.id}-${i}`}>
            <td className="gc-pg-mono">{g.no}</td>
            <td>{formatDate(g.date)}</td>
            <td className="gc-pg-mono">{g.poNo}</td>
            <td>{g.vendor}</td>
            <td>{(l && (l.item || itemOf(l.parentLineId))) || '—'}</td>
            <td className="gc-sheet-wrap-text">{(l && descOf(l.parentLineId)) || '—'}</td>
            <Num>{l ? formatQty(qty) : '—'}</Num>
            <Num>{l && rateOf(l.parentLineId) ? formatMoney(rateOf(l.parentLineId) * qty, currency) : '—'}</Num>
            <td>{where ?? '—'}</td>
            <td className="gc-stock__serials" title={serials.join('\n')}>
              {serials.length ? serials.join(', ') : '—'}
            </td>
            <td>{dn || '—'}</td>
            <td>{first ? <RecordFiles no={g.no} list={g.files} files={files} /> : ''}</td>
            <td>{first ? <BooksCell synced={!!g.booksId} retrying={retrying === g.id} onRetry={onRetry && (() => onRetry('pr', g.id))} /> : ''}</td>
          </tr>
        )
      })}
    </Sheet>
  )
}

export function DeliveryNoteList({ notes, currency, files, onOpen }: { notes: DeliveryNote[]; currency: string; files: FileAccess; onOpen: (id: string) => void }) {
  if (!notes.length) return <p className="gc-small gc-soft">No delivery notes yet — Create delivery note picks from received stock.</p>
  const rows = notes.flatMap((d) => (d.lines.length ? d.lines : [null]).map((l, i) => ({ d, l, i })))
  return (
    <Sheet
      label="Delivery notes"
      head={['DN #', 'Date', 'Status', 'Reference', 'Item', 'Description', 'Quantity', `Amount (${currency})`, 'From (PR · location)', 'Files']}
      foot={
        <tr>
          <td colSpan={7}>Total</td>
          <Num>
            {formatMoney(
              notes.reduce((t, d) => t + d.total, 0),
              currency,
            )}
          </Num>
          <td colSpan={2} />
        </tr>
      }
    >
      {rows.map(({ d, l, i }) => (
        <tr key={`${d.id}-${l?.id ?? i}`}>
          <td>
            <button type="button" className="gc-link gc-pg-mono" onClick={() => onOpen(d.id)}>
              {d.no}
            </button>
          </td>
          <td>{formatDate(d.date)}</td>
          <td className={`gc-sheet-status gc-sheet-status--${dnTone(d.statusIndex)}`}>{d.status || 'Draft'}</td>
          <td>{d.reference || '—'}</td>
          <td>{l?.description.split('\n')[0] || '—'}</td>
          <td className="gc-sheet-wrap-text">{l?.description || '—'}</td>
          <Num>{l ? formatQty(l.quantity) : '—'}</Num>
          <Num>{l ? formatMoney(l.amount, currency) : '—'}</Num>
          <td>
            {l && (l.prNo || l.locations.length) ? (
              <span className="gc-loc-line">
                {l.prNo && <span className="gc-pg-mono">{l.prNo}</span>}
                {l.locations.map((x) => (
                  <LocationLabel key={x} label={x} />
                ))}
              </span>
            ) : (
              '—'
            )}
          </td>
          <td>{i === 0 ? <RecordFiles no={d.no} list={d.files} files={files} /> : ''}</td>
        </tr>
      ))}
    </Sheet>
  )
}

/** Every storage row still holding units, oldest receipt first */
export function InWarehouseList({ poLines, currency }: { poLines: PoLine[]; currency: string }) {
  const rows = poLines.flatMap((l) => l.stockLocations.map((s) => ({ l, s }))).sort((a, b) => (a.s.received || '9').localeCompare(b.s.received || '9'))
  if (!rows.length) return <p className="gc-small gc-soft">Nothing in the warehouse — received stock shows here until it is delivered.</p>
  return (
    <Sheet label="In warehouse" head={['Item', 'Description', 'Quantity', `Amount (${currency})`, 'Warehouse', 'Location', 'Serial numbers', 'PR #', 'Received', 'Days in store']}>
      {rows.map(({ l, s }, i) => (
        <tr key={s.id || `${l.id}-${i}`}>
          <td>{l.item || '—'}</td>
          <td className="gc-sheet-wrap-text">{l.description || '—'}</td>
          <Num>{formatQty(s.qty)}</Num>
          <Num>{l.rate ? formatMoney(l.rate * s.qty, currency) : '—'}</Num>
          <td>{s.warehouse || '—'}</td>
          <td className={s.location || s.pallet ? '' : 'gc-pg-late'}>
            {s.pallet || s.rack ? <LocationTags rack={s.rack} bay={s.bay} level={s.level} side={s.side} pallet={s.pallet} /> : s.location ? <LocationLabel label={s.location} /> : 'Not placed'}
          </td>
          <td className="gc-stock__serials" title={s.serials.join('\n')}>
            {s.serials.length ? s.serials.join(', ') : '—'}
          </td>
          <td className="gc-pg-mono">{s.prNo || '—'}</td>
          <td>{s.received ? formatDate(s.received) : '—'}</td>
          <Num>{s.received ? Math.max(0, daysBetween(s.received, localToday())) : '—'}</Num>
        </tr>
      ))}
    </Sheet>
  )
}
