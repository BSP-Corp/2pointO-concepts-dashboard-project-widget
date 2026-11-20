import { Fragment, useState } from 'react'
import { DateInput } from '@/features/console/DateInput'
import { useSavePoPayment } from '@/features/projects/api'
import { localToday } from '@/features/project/model'
import { formatDate } from '@/lib/utils'
import type { PoPayment, PurchaseOrder } from '@/types/domain'
import { dueDateOf, termsDaysOf } from './schedule'

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
const fmt = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
const FILTERS = ['All', 'Unpaid', 'Partial', 'Overdue'] as const
type Filter = (typeof FILTERS)[number]

interface Payable {
  po: PurchaseOrder
  terms: number | null
  due: string
  total: number
  paid: number
  balance: number
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue'
  ledger: PoPayment[]
}

/** One row per PO: total, paid (Payment_Made), balance, due date from the PO terms, and its status */
export function payablesOf(orders: PurchaseOrder[], payments: PoPayment[], today = localToday()): Payable[] {
  return orders
    .map((po) => {
      const ledger = payments.filter((p) => p.purchaseOrderId === po.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      const total = round2(po.totalCost)
      const paid = round2(ledger.reduce((t, p) => t + p.amount, 0))
      const balance = round2(total - paid)
      const due = dueDateOf(po)
      const overdue = !!due && due < today
      const status: Payable['status'] = balance > 0 && overdue ? 'Overdue' : paid === 0 ? 'Unpaid' : paid < total ? 'Partial' : 'Paid'
      return { po, terms: termsDaysOf(po.terms), due, total, paid, balance, status, ledger }
    })
    .sort((a, b) => b.po.date.localeCompare(a.po.date) || b.po.poNo.localeCompare(a.po.poNo, undefined, { numeric: true }))
}

/**
 * Payments of the project's purchase orders, as the 2point0 Ops Payments view: All / Unpaid / Partial / Overdue sub-tabs,
 * one row per PO, and a vendor's payment ledger with + Add payment. Saved in Creator (Payment_Made) only — not Zoho Books.
 */
export function PoPayments({ projectId, orders, payments, currency, loading }: { projectId: string; orders: PurchaseOrder[]; payments: PoPayment[]; currency: string; loading?: boolean }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [expanded, setExpanded] = useState<string[]>([])
  const rows = payablesOf(orders, payments)
  const visible = rows.filter((r) => filter === 'All' || r.status === filter)
  const totals = visible.reduce((t, r) => ({ total: round2(t.total + r.total), paid: round2(t.paid + r.paid), balance: round2(t.balance + r.balance) }), { total: 0, paid: 0, balance: 0 })
  const toggle = (id: string) => setExpanded((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <section className="gc-pay" aria-label="Payments">
      <div className="gc-pay__bar">
        <div className="gc-pay__filters" role="tablist" aria-label="Payment status">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} className={`gc-pay__pill ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <span className="gc-pay__hint">
          {visible.length} PO{visible.length !== 1 ? 's' : ''} · expand a vendor to view its ledger
        </span>
      </div>
      <div className="gc-pay__box">
        <table className="gc-pay__table" aria-label="PO payments">
          <thead>
            <tr>
              {['Vendor', 'PO #', 'PO date', `PO total (${currency})`, 'Terms (days)', 'Due date', 'Paid', 'Balance', 'Status'].map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Fragment key={r.po.id}>
                <tr className="gc-pay__row">
                  <td>
                    <button type="button" className="gc-pay__vendor" aria-expanded={expanded.includes(r.po.id)} onClick={() => toggle(r.po.id)}>
                      <span aria-hidden="true">{expanded.includes(r.po.id) ? '▾' : '▸'}</span>
                      {r.po.vendor || '—'}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="gc-pay__po" onClick={() => toggle(r.po.id)}>
                      {r.po.poNo}
                    </button>
                  </td>
                  <td>{r.po.date ? formatDate(r.po.date) : '—'}</td>
                  <td className="gc-pay__num">{fmt(r.total)}</td>
                  <td className="gc-pay__center">{r.terms ?? '—'}</td>
                  <td>{r.due ? formatDate(r.due) : '—'}</td>
                  <td className="gc-pay__num">{fmt(r.paid)}</td>
                  <td className="gc-pay__num gc-pay__strong">{fmt(r.balance)}</td>
                  <td>
                    <span className={`gc-pay__status gc-pay__status--${r.status.toLowerCase()}`}>{r.status}</span>
                  </td>
                </tr>
                <tr hidden={!expanded.includes(r.po.id)}>
                  <td colSpan={9} className="gc-pay__ledgercell">
                    {expanded.includes(r.po.id) && <Ledger projectId={projectId} row={r} currency={currency} />}
                  </td>
                </tr>
              </Fragment>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={9} className="gc-pay__empty">
                  {loading ? 'Loading payments…' : `No ${filter === 'All' ? '' : `${filter.toLowerCase()} `}POs on this view.`}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total ({currency})</td>
              <td className="gc-pay__num">{fmt(totals.total)}</td>
              <td colSpan={2} />
              <td className="gc-pay__num">{fmt(totals.paid)}</td>
              <td className="gc-pay__num">{fmt(totals.balance)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function Ledger({ projectId, row, currency }: { projectId: string; row: Payable; currency: string }) {
  const save = useSavePoPayment(projectId)
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(localToday)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const busy = save.isPending
  const fail = (e: Error) => setError(e.message || 'Payment not saved. Your entries have been kept.')
  const add = () => {
    setError('')
    save.mutate(
      { type: 'add', poId: row.po.id, date, amount: Number(amount), reference: reference.trim(), note: note.trim() },
      { onSuccess: () => (setAmount(''), setReference(''), setNote(''), setAdding(false)), onError: fail },
    )
  }
  const remove = (id: string) => {
    setError('')
    save.mutate({ type: 'delete', id }, { onSuccess: () => setConfirm(''), onError: fail })
  }
  return (
    <section className="gc-pay__ledger" aria-label={`Payment ledger ${row.po.poNo}`}>
      <div className="gc-pay__ledgerhead">
        <h3>Payment ledger</h3>
        <button
          type="button"
          className="gc-pay__add"
          disabled={busy || row.balance <= 0}
          title={row.balance <= 0 ? 'This PO has no outstanding balance.' : undefined}
          onClick={() => setAdding((a) => !a)}
        >
          + Add payment
        </button>
      </div>
      <div className="gc-pay__ledgerbox">
        <table className="gc-pay__ledgertable">
          <thead>
            <tr>
              <th>Date</th>
              <th className="gc-pay__num">Amount ({currency})</th>
              <th>Reference</th>
              <th>Note</th>
              <th>
                <span className="gc-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {row.ledger.map((p) => (
              <tr key={p.id}>
                <td>{p.date ? formatDate(p.date) : 'Not recorded'}</td>
                <td className="gc-pay__num">{fmt(p.amount)}</td>
                <td>{p.reference || '—'}</td>
                <td>{p.note || '—'}</td>
                <td className="gc-pay__actions">
                  {p.booksNo ? (
                    <span className="gc-pay__muted" title="Already in Zoho Books">
                      {p.booksNo}
                    </span>
                  ) : confirm === p.id ? (
                    <span className="gc-pay__confirm">
                      <span>Delete payment?</span>
                      <button type="button" disabled={busy} onClick={() => remove(p.id)} className="gc-pay__danger">
                        Confirm delete
                      </button>
                      <button type="button" disabled={busy} onClick={() => setConfirm('')} className="gc-pay__textbtn">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={busy} className="gc-pay__textbtn gc-pay__muted" onClick={() => (setConfirm(p.id), setError(''))}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!row.ledger.length && (
              <tr>
                <td colSpan={5} className="gc-pay__muted">
                  No payments recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {adding && (
        <form
          className="gc-pay__form"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <label>
            Date
            <DateInput required value={date} max={localToday()} disabled={busy} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Amount ({currency})
            <input type="number" min="0.01" max={row.balance} step="0.01" required disabled={busy} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Reference
            <input value={reference} disabled={busy} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label>
            Note
            <input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="gc-pay__formfoot">
            <span className="gc-pay__muted">
              Balance {currency} {fmt(row.balance)}
            </span>
            <button type="button" disabled={busy} onClick={() => setAdding(false)} className="gc-pay__textbtn">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="gc-pay__save">
              {busy ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="gc-pay__error">
          {error}
        </p>
      )}
    </section>
  )
}
