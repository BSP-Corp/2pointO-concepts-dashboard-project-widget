import { Fragment, useRef, useState, type ReactNode } from 'react'
import { DateInput } from './DateInput'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useBudgetReview,
  useCreateMilestone,
  useOptions,
  useProject,
  useProjectContacts,
  useSaveProjectContact,
  useSaveTaskListItem,
  useUpdateMilestone,
  useUploadProjectFile,
  projectKey,
} from '@/features/projects/api'
import { durationOf, endFromDuration, milestoneStart, startsAfterFor } from '@/features/project/model'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { fromCreatorDate, str } from '@/lib/data/zohoSource'
import { queryKeys } from '@/lib/query-keys'
import { formatDate, formatMoney } from '@/lib/utils'
import type { CreatorRecord, Option, PlanMilestone, ProjectContact } from '@/types/domain'
import { MAX_FILE_MB } from '@/features/procurement/FileAttach'
import { canView, openFile } from './openFile'

const MILESTONE_STATUSES = { key: 'milestoneStatuses', report: '', label: '' }
const USERS = { key: 'users', report: '', label: '' }
const FLAGS = ['Internal', 'External']

/** "…/download?filepath=1794_PO.pdf" or "1794_PO.pdf" → "PO.pdf" */
export const fileNameOf = (path: string) => {
  const raw = /filepath=([^&]+)/.exec(path)?.[1] ?? path.split('/').pop() ?? path
  let name = raw
  try {
    name = decodeURIComponent(raw)
  } catch {
    name = raw
  }
  return name.replace(/^\d{10,}_/, '')
}

/** Project PO_Document: the current file (open / download), and Upload / Replace — saved to the Project at once */
export function PoFileField({
  projectId,
  record,
  label,
  hint,
  required,
  missing,
  field = 'PO_Document',
}: {
  projectId: string
  record: CreatorRecord
  label: string
  hint?: string
  required?: boolean
  missing?: boolean
  /** Project upload field (PO_Document, Warranty_Document) */
  field?: string
}) {
  const ds = useDataSource()
  const upload = useUploadProjectFile(projectId)
  const input = useRef<HTMLInputElement>(null)
  const [tooBig, setTooBig] = useState('')
  const path = str(record[field])
  const name = path ? fileNameOf(path) : ''
  const pick = (file: File | undefined) => {
    setTooBig('')
    if (!file) return
    if (file.size > MAX_FILE_MB * 1024 * 1024) return setTooBig(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_FILE_MB} MB`)
    upload.mutate(field === 'PO_Document' ? file : { file, field })
  }
  return (
    <div className={`gc-field${missing ? ' gc-field--missing' : ''}`}>
      <span className="gc-label" id={`gc-f-${field}`}>
        {label}
        {required && <span className="gc-danger"> *</span>}
      </span>
      <div className="gc-filefield" role="group" aria-labelledby={`gc-f-${field}`}>
        {name ? (
          <button
            type="button"
            className="gc-link gc-filefield__name"
            title={canView(name) ? 'Open in a new tab' : 'Download'}
            onClick={() => openFile(() => ds.readProjectFile(projectId, path, field), ds.projectFileUrl(projectId, path, field), name, false)}
          >
            {name}
          </button>
        ) : (
          <span className="gc-soft gc-small">No file</span>
        )}
        <button type="button" className="gc-btn gc-btn--sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
          {upload.isPending ? 'Uploading…' : name ? 'Replace file' : 'Upload file'}
        </button>
        <input ref={input} type="file" hidden aria-label={`${label} file`} onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      </div>
      {hint && <span className="gc-small gc-soft">{hint}</span>}
      {(tooBig || upload.error) && (
        <span className="gc-small gc-danger" role="alert">
          {tooBig || `Not uploaded: ${upload.error?.message}`}
        </span>
      )}
    </div>
  )
}

const EMPTY_CONTACT: Omit<ProjectContact, 'id'> = { firstName: '', lastName: '', email: '', phone: '', designation: '' }

/** Contact Person — Client Side Contact List (Contact_Persons of the project): add and edit rows */
export function ContactsSection({ projectId, company }: { projectId: string; company: string }) {
  const contacts = useProjectContacts(projectId)
  const save = useSaveProjectContact(projectId)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState(EMPTY_CONTACT)
  const start = (c?: ProjectContact) => {
    save.reset()
    setEditing(c ? c.id : 'new')
    setDraft(c ? { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, designation: c.designation } : EMPTY_CONTACT)
  }
  const submit = () => save.mutate({ id: editing === 'new' ? undefined : editing!, data: draft }, { onSuccess: () => setEditing(null) })
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  const row = (who: string) => (
    <tr className="gc-reg-edit" onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}>
      <td>
        <input className="gc-input-sm" value={draft.firstName} onChange={set('firstName')} placeholder="First Name" aria-label={`${who} first name`} autoFocus />
        <input className="gc-input-sm" value={draft.lastName} onChange={set('lastName')} placeholder="Last Name" aria-label={`${who} last name`} />
      </td>
      <td>
        <input className="gc-input-sm" type="tel" value={draft.phone} onChange={set('phone')} placeholder="Phone" aria-label={`${who} phone`} />
      </td>
      <td>
        <input className="gc-input-sm" type="email" value={draft.email} onChange={set('email')} placeholder="Email" aria-label={`${who} email`} />
      </td>
      <td>
        <input className="gc-input-sm" value={draft.designation} onChange={set('designation')} placeholder="Designation" aria-label={`${who} designation`} />
      </td>
      <td className="gc-reg-actions">
        <button type="button" className="gc-btn gc-btn--sm" onClick={() => setEditing(null)} disabled={save.isPending}>
          Cancel
        </button>
        <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" onClick={submit} disabled={save.isPending || !draft.firstName.trim()}>
          {save.isPending ? 'Saving…' : 'Save contact'}
        </button>
      </td>
    </tr>
  )
  if (contacts.error) return <p className="gc-small gc-danger">Could not read the contacts: {contacts.error.message}</p>
  return (
    <div className="gc-reg">
      <p className="gc-small gc-soft">
        Company: <strong>{company || '—'}</strong>
      </p>
      <div className="gc-table-wrap">
        <table className="gc-table gc-reg-table" aria-label="Client Side Contact List">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Phone</th>
              <th scope="col">Email</th>
              <th scope="col">Designation</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {contacts.isLoading && (
              <tr>
                <td colSpan={5} className="gc-small gc-soft">
                  Loading contacts…
                </td>
              </tr>
            )}
            {(contacts.data ?? []).map((c) =>
              editing === c.id ? (
                <Fragment key={c.id}>{row(`${c.firstName} ${c.lastName}`.trim())}</Fragment>
              ) : (
                <tr key={c.id}>
                  <td>{`${c.firstName} ${c.lastName}`.trim() || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.designation || '—'}</td>
                  <td className="gc-reg-actions">
                    <button type="button" className="gc-btn gc-btn--sm" onClick={() => start(c)} disabled={!!editing} aria-label={`Edit ${`${c.firstName} ${c.lastName}`.trim()}`}>
                      Edit
                    </button>
                  </td>
                </tr>
              ),
            )}
            {contacts.data?.length === 0 && editing !== 'new' && (
              <tr>
                <td colSpan={5} className="gc-small gc-soft">
                  No client contacts yet.
                </td>
              </tr>
            )}
            {editing === 'new' && row('New contact')}
          </tbody>
        </table>
      </div>
      {save.error && (
        <p className="gc-small gc-danger" role="alert">
          {save.error.message}
        </p>
      )}
      {!editing && (
        <button type="button" className="gc-btn gc-btn--sm" onClick={() => start()}>
          + Add contact
        </button>
      )}
    </div>
  )
}

type MsDraft = { name: string; start: string; end: string; duration: string; unit: string; owner: string; status: string; flag: string }

/** Key Milestones & Dates — the project's Milestone records (Key_Milestones_Dates): add and edit. Start Date and End Date are
 * picked here and saved as the Milestone's Starts after (from the project Start Date) and Duration (days, both included). */
export function KeyMilestonesSection({ projectId, projectStart }: { projectId: string; projectStart: string }) {
  const ds = useDataSource()
  const plan = useQuery({ queryKey: queryKeys.projects.planMilestones(projectId), queryFn: () => ds.listPlanMilestones(projectId), staleTime: 0 })
  const update = useUpdateMilestone(projectId)
  const create = useCreateMilestone(projectId)
  const qc = useQueryClient()
  const statuses = useOptions(MILESTONE_STATUSES)
  const users = useOptions(USERS)
  const [editing, setEditing] = useState<string | null>(null)
  const blank: MsDraft = { name: '', start: projectStart, end: projectStart, duration: '1', unit: 'Days', owner: '', status: '', flag: '' }
  const [draft, setDraft] = useState<MsDraft>(blank)
  const [error, setError] = useState('')
  const busy = update.isPending || create.isPending
  const dates = (after: number, unit: string, duration: number) => {
    const s = milestoneStart(projectStart, after, unit)
    return { start: s, end: endFromDuration(s, Math.max(1, duration)) }
  }
  const start = (m?: PlanMilestone) => {
    setError('')
    setEditing(m ? m.id : 'new')
    if (!m) return setDraft(blank)
    const d = dates(m.startsAfter, m.startsAfterIn, m.duration || 1)
    setDraft({ name: m.name, start: d.start, end: d.end, duration: String(m.duration || 1), unit: m.startsAfterIn || 'Days', owner: m.owner?.id ?? '', status: m.status?.id ?? '', flag: m.flag })
  }
  const days = projectStart ? durationOf(draft.start, draft.end) : Number(draft.duration)
  const problem = !draft.name.trim()
    ? 'Enter the milestone name'
    : projectStart && !draft.start
      ? 'Pick the Start Date'
      : projectStart && draft.start < projectStart
        ? `The Start Date cannot be before the project Start Date (${formatDate(projectStart)})`
        : projectStart && !draft.end
          ? 'Pick the End Date'
          : projectStart && draft.end < draft.start
            ? 'The End Date cannot be before the Start Date'
            : !projectStart && !(/^\d+$/.test(draft.duration.trim()) && Number(draft.duration) >= 1)
              ? 'Duration must be 1 day or more'
              : ''
  const submit = async () => {
    if (problem) return setError(problem)
    setError('')
    const when = projectStart ? startsAfterFor(projectStart, draft.start, draft.unit) : null
    try {
      if (editing === 'new') {
        const res = await create.mutateAsync({ name: draft.name.trim(), startsAfter: when?.after ?? 0, startsAfterIn: when?.unit ?? 'Days', duration: days })
        const more = { ...(draft.owner ? { Owner: draft.owner } : {}), ...(draft.status ? { Status: draft.status } : {}), ...(draft.flag ? { Flag: draft.flag } : {}) }
        if (res.id && Object.keys(more).length) await update.mutateAsync({ milestoneId: res.id, data: more })
      } else {
        await update.mutateAsync({
          milestoneId: editing!,
          data: {
            Milestone_Name: draft.name.trim(),
            ...(when ? { Starts_after: when.after, Starts_After_In: when.unit } : {}),
            Duration: days,
            Owner: draft.owner,
            Status: draft.status,
            Flag: draft.flag,
          },
        })
      }
      await qc.invalidateQueries({ queryKey: queryKeys.projects.planMilestones(projectId) })
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const set = (k: keyof MsDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  const setStart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    // Moving the start keeps the length: the end moves with it
    setDraft((d) => ({ ...d, start: v, end: v && d.start && d.end && d.end >= d.start ? endFromDuration(v, durationOf(d.start, d.end)) : d.end && v && d.end >= v ? d.end : v }))
  }
  const row = (who: string, no: string) => (
    <tr className="gc-reg-edit" onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}>
      <td className="gc-soft gc-small">{no}</td>
      <td>
        <input className="gc-input-sm" value={draft.name} onChange={set('name')} placeholder="Key milestone" aria-label={`${who} name`} autoFocus />
      </td>
      <td>
        <DateInput className="gc-input-sm" value={draft.start} min={projectStart || undefined} onChange={setStart} disabled={!projectStart} aria-label={`${who} start date`} />
      </td>
      <td>
        <DateInput className="gc-input-sm" value={draft.end} min={draft.start || projectStart || undefined} onChange={set('end')} disabled={!projectStart} aria-label={`${who} end date`} />
      </td>
      <td className="gc-num">
        {projectStart ? (
          <span aria-label={`${who} duration`}>{days ? `${days} day${days === 1 ? '' : 's'}` : '—'}</span>
        ) : (
          <input className="gc-input-sm gc-reg-num" inputMode="numeric" value={draft.duration} onChange={set('duration')} aria-label={`${who} duration (days)`} />
        )}
      </td>
      <td>
        <select className="gc-input-sm" value={draft.owner} onChange={set('owner')} aria-label={`${who} owner`}>
          <option value="">{users.isLoading ? 'Loading…' : '-Select-'}</option>
          {(users.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select className="gc-input-sm" value={draft.status} onChange={set('status')} aria-label={`${who} status`}>
          <option value="">{statuses.isLoading ? 'Loading…' : '-Select-'}</option>
          {(statuses.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select className="gc-input-sm" value={draft.flag} onChange={set('flag')} aria-label={`${who} flag`}>
          <option value="">-Select-</option>
          {FLAGS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </td>
      <td className="gc-reg-actions">
        <button type="button" className="gc-btn gc-btn--sm" onClick={() => setEditing(null)} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Save milestone'}
        </button>
      </td>
    </tr>
  )
  if (plan.error) return <p className="gc-small gc-danger">Could not read the milestones: {plan.error.message}</p>
  return (
    <div className="gc-reg">
      {!projectStart && <p className="gc-small gc-soft">Set the project Start Date (Project Information) to pick the milestone Start and End Dates.</p>}
      <div className="gc-table-wrap">
        <table className="gc-table gc-reg-table" aria-label="Key Milestones & Dates">
          <thead>
            <tr>
              <th scope="col">No</th>
              <th scope="col">Key Milestone</th>
              <th scope="col">Start Date</th>
              <th scope="col">End Date</th>
              <th scope="col" className="gc-num">
                Duration
              </th>
              <th scope="col">Owner</th>
              <th scope="col">Status</th>
              <th scope="col">Flag</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {plan.isLoading && (
              <tr>
                <td colSpan={9} className="gc-small gc-soft">
                  Loading milestones…
                </td>
              </tr>
            )}
            {(plan.data ?? []).map((m) => {
              if (editing === m.id) return <Fragment key={m.id}>{row(m.name, m.no)}</Fragment>
              const d = dates(m.startsAfter, m.startsAfterIn, m.duration)
              return (
                <tr key={m.id}>
                  <td className="gc-soft gc-small">{m.no || '—'}</td>
                  <td>{m.name || '—'}</td>
                  <td>{d.start ? formatDate(d.start) : '—'}</td>
                  <td>{d.end ? formatDate(d.end) : '—'}</td>
                  <td className="gc-num">{m.duration ? `${m.duration} day${m.duration === 1 ? '' : 's'}` : '—'}</td>
                  <td>{m.owner?.label || '—'}</td>
                  <td>{m.status?.label || '—'}</td>
                  <td>{m.flag || '—'}</td>
                  <td className="gc-reg-actions">
                    <button type="button" className="gc-btn gc-btn--sm" onClick={() => start(m)} disabled={!!editing} aria-label={`Edit ${m.name}`}>
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })}
            {plan.data?.length === 0 && editing !== 'new' && (
              <tr>
                <td colSpan={9} className="gc-small gc-soft">
                  No milestones yet.
                </td>
              </tr>
            )}
            {editing === 'new' && row('New milestone', 'Auto')}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="gc-small gc-danger" role="alert">
          {error}
        </p>
      )}
      {!editing && (
        <button type="button" className="gc-btn gc-btn--sm" onClick={() => start()}>
          + Add milestone
        </button>
      )}
    </div>
  )
}

/** Project Budget [Costs] fields of each category of the Registration form */
const BUDGET_FIELDS: [string, string][] = [
  ['Hardware', 'Hardware'],
  ['Software', 'Software'],
  ['Outsourced Services', 'Outsourced_Services'],
  ['2point0 Services', 'point0_Services'],
  ['Logistics', 'Logistics'],
]
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const pct = (n: number) => `${Math.round(n * 10) / 10}%`

/** Payment Summary — Payment Terms Agreed, and per category: the budget cost and the review (cost, price, profit, margin) */
export function PaymentSummarySection({
  projectId,
  record,
  values,
  part = 'all',
  budgetCell,
}: {
  projectId: string
  record: CreatorRecord
  values: Record<string, unknown>
  /** 'terms' = Payment Terms Agreed only (Payment Summary); 'category' = By category only (Project Budget Review) */
  part?: 'all' | 'terms' | 'category'
  /** Budget Cost cell of a Project budget field (Hardware…) — an input in Project Budget Review */
  budgetCell?: (field: string) => ReactNode
}) {
  const ds = useDataSource()
  const project = useProject(projectId)
  const terms = useQuery({
    queryKey: queryKeys.projects.milestones(projectId),
    queryFn: () => ds.listPaymentMilestones(projectKey(project.data!)),
    enabled: !!project.data,
    staleTime: 0,
  })
  const review = useBudgetReview(project.data)
  const cur = project.data?.currency
  const budget = (field: string) => {
    const v = field in values ? values[field] : record[field]
    return v === '' || v == null ? null : Number(String(v).replace(/[^0-9.-]/g, ''))
  }
  const reviewRows = review.data ?? []
  const categories = [...BUDGET_FIELDS.map(([c]) => c), ...reviewRows.map((r) => r.category).filter((c) => c && !BUDGET_FIELDS.some(([b]) => norm(b) === norm(c)))]
  const rows = categories.map((c) => {
    const field = BUDGET_FIELDS.find(([b]) => norm(b) === norm(c))?.[1]
    return { category: c, field, budget: field ? budget(field) : null, r: reviewRows.find((x) => norm(x.category) === norm(c)) }
  })
  const sum = (f: (x: (typeof rows)[number]) => number | null | undefined) => rows.reduce((s, x) => s + (f(x) ?? 0), 0)
  const termTotal = (terms.data ?? []).reduce((s, t) => s + t.amount, 0)
  const termPct = (terms.data ?? []).reduce((s, t) => s + t.percentage, 0)
  const ordinal = (i: number) => `${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} Milestone`
  return (
    <div className="gc-reg gc-stack">
      {part !== 'category' && (
        <section aria-label="Payment Terms Agreed">
          <h3 className="gc-h3">Payment Terms Agreed</h3>
          {terms.error ? (
            <p className="gc-small gc-danger">Could not read the payment terms: {terms.error.message}</p>
          ) : (
            <div className="gc-table-wrap">
              <table className="gc-table gc-reg-table">
                <thead>
                  <tr>
                    <th scope="col">Milestone</th>
                    <th scope="col">Terms</th>
                    <th scope="col" className="gc-num">
                      %
                    </th>
                    <th scope="col" className="gc-num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!terms.data ? (
                    <tr>
                      <td colSpan={4} className="gc-small gc-soft">
                        Loading payment terms…
                      </td>
                    </tr>
                  ) : terms.data.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="gc-small gc-soft">
                        No payment terms yet — add them in Creator (Payment Terms Agreed).
                      </td>
                    </tr>
                  ) : (
                    terms.data.map((t, i) => (
                      <tr key={t.id}>
                        <td>{t.name || ordinal(i)}</td>
                        <td>{t.terms || '—'}</td>
                        <td className="gc-num">{pct(t.percentage)}</td>
                        <td className="gc-num">{formatMoney(t.amount, cur)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!!terms.data?.length && (
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={2}>
                        Total
                      </th>
                      <td className="gc-num">{pct(termPct)}</td>
                      <td className="gc-num">{formatMoney(termTotal, cur)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      )}
      {part !== 'terms' && (
        <section aria-label="Summary by category">
          <h3 className="gc-h3">By category</h3>
          {review.error && <p className="gc-small gc-danger">Could not read the budget review: {review.error.message}</p>}
          <div className="gc-table-wrap">
            <table className="gc-table gc-reg-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="gc-num">
                    Budget Cost
                  </th>
                  <th scope="col" className="gc-num">
                    % Cost
                  </th>
                  <th scope="col" className="gc-num">
                    Total Cost
                  </th>
                  <th scope="col" className="gc-num">
                    Total Price
                  </th>
                  <th scope="col" className="gc-num">
                    Profit
                  </th>
                  <th scope="col" className="gc-num">
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.category}>
                    <th scope="row">{x.category}</th>
                    <td className="gc-num">{x.field && budgetCell ? budgetCell(x.field) : formatMoney(x.budget, cur)}</td>
                    <td className="gc-num">{x.r ? pct(x.r.costPct) : '—'}</td>
                    <td className="gc-num">{x.r ? formatMoney(x.r.totalCost, cur) : '—'}</td>
                    <td className="gc-num">{x.r ? formatMoney(x.r.totalPrice, cur) : '—'}</td>
                    <td className="gc-num">{x.r ? formatMoney(x.r.profit, cur) : '—'}</td>
                    <td className="gc-num">{x.r ? pct(x.r.margin) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="gc-num">
                    {formatMoney(
                      sum((x) => x.budget),
                      cur,
                    )}
                  </td>
                  <td />
                  <td className="gc-num">
                    {reviewRows.length
                      ? formatMoney(
                          sum((x) => x.r?.totalCost),
                          cur,
                        )
                      : '—'}
                  </td>
                  <td className="gc-num">
                    {reviewRows.length
                      ? formatMoney(
                          sum((x) => x.r?.totalPrice),
                          cur,
                        )
                      : '—'}
                  </td>
                  <td className="gc-num">
                    {reviewRows.length
                      ? formatMoney(
                          sum((x) => x.r?.profit),
                          cur,
                        )
                      : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="gc-small gc-soft">
            Budget Cost is saved on the Project; % Cost, Total Cost, Total Price, Profit and Margin come from the approved estimate (Project Budget Review by category).
          </p>
        </section>
      )}
    </div>
  )
}

export const projectStartOf = (record: CreatorRecord, values: Record<string, unknown>) => {
  const v = 'Start_Date' in values ? str(values.Start_Date) : record.Start_Date ? fromCreatorDate(record.Start_Date) : ''
  return v
}

/**
 * Signature field of the Project form: draw with the mouse, a finger or a pen and save. The drawing is uploaded as a PNG
 * into the Creator Signature field (Creator API v2.1 upload accepts Signature fields); the saved signature is shown.
 */
export function SignatureField({
  projectId,
  record,
  field,
  label,
  required,
  missing,
  hint,
}: {
  projectId: string
  record: CreatorRecord
  field: string
  label: string
  required?: boolean
  missing?: boolean
  hint?: string
}) {
  const ds = useDataSource()
  const upload = useUploadProjectFile(projectId)
  const path = str(record[field])
  const image = useQuery({
    queryKey: ['signature', projectId, field, path],
    queryFn: async () => {
      const blob = await ds.readProjectFile(projectId, path, field)
      if (!blob?.size) throw new Error('Creator returned no image')
      // signatures come untyped: show them as the PNG the pad saved
      return URL.createObjectURL(blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/png' }))
    },
    enabled: !!path,
    staleTime: Infinity,
    retry: 1,
  })
  const [signing, setSigning] = useState(false)
  const [drawn, setDrawn] = useState(false)
  /** The signature just saved, shown at once (Creator's copy replaces it once read back) */
  const [preview, setPreview] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * c.width) / (r.width || 1), y: ((e.clientY - r.top) * c.height) / (r.height || 1) }
  }
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    last.current = point(e)
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return
    const ctx = canvas.current?.getContext('2d')
    const p = point(e)
    if (ctx) {
      ctx.strokeStyle = '#002f73'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(last.current.x, last.current.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    last.current = p
    setDrawn(true)
  }
  const up = () => (last.current = null)
  const clear = () => {
    const c = canvas.current
    if (c && drawn) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setDrawn(false)
  }
  const saveSignature = () => {
    const c = canvas.current
    if (!c || !drawn) return
    const send = (blob: Blob | null) => {
      if (!blob) return
      upload.mutate(
        { file: new File([blob], `${field}.png`, { type: 'image/png' }), field },
        {
          onSuccess: () => {
            setPreview(URL.createObjectURL(blob))
            setSigning(false)
            setDrawn(false)
          },
        },
      )
    }
    if (c.toBlob) c.toBlob(send, 'image/png')
    else send(new Blob([], { type: 'image/png' }))
  }
  return (
    <div className={`gc-field${missing ? ' gc-field--missing' : ''}`} id={`gc-f-${field}`}>
      <span className="gc-label">
        {label}
        {required && <span className="gc-danger"> *</span>}
      </span>
      {signing ? (
        <div className="gc-sigpad">
          <canvas
            ref={canvas}
            width={720}
            height={180}
            className="gc-sigpad__canvas"
            aria-label={`${label}: draw your signature here`}
            role="img"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
          />
          <div className="gc-sigpad__bar">
            <span className="gc-small gc-soft">Sign inside the box</span>
            <button type="button" className="gc-btn gc-btn--sm" onClick={clear} disabled={!drawn || upload.isPending}>
              Clear
            </button>
            <button type="button" className="gc-btn gc-btn--sm" onClick={() => (clear(), setSigning(false))} disabled={upload.isPending}>
              Cancel
            </button>
            <button type="button" className="gc-btn gc-btn--sm gc-btn--primary" onClick={saveSignature} disabled={!drawn || upload.isPending}>
              {upload.isPending ? 'Saving…' : 'Save signature'}
            </button>
          </div>
        </div>
      ) : (
        <div className={`gc-sigbox${path || preview ? ' is-signed' : ''}`}>
          {preview || image.data ? (
            <img src={preview || image.data} alt={`${label} (signed)`} className="gc-sigbox__img" />
          ) : path && image.isLoading ? (
            <span className="gc-soft">Loading signature…</span>
          ) : path ? (
            <span className="gc-small gc-danger" role="alert">
              Signed, but the image could not be loaded{image.error ? `: ${image.error.message}` : ''} — re-save Widget.project_console.
            </span>
          ) : (
            <span>Not signed yet</span>
          )}
          <button type="button" className="gc-btn gc-btn--sm gc-sigbox__action" onClick={() => (upload.reset(), setSigning(true))}>
            {path || preview ? 'Sign again' : 'Sign here'}
          </button>
        </div>
      )}
      {hint && <span className="gc-small gc-soft">{hint}</span>}
      {upload.error && (
        <span className="gc-small gc-danger" role="alert">
          Signature not saved: {upload.error.message}
        </span>
      )}
    </div>
  )
}

/** Shop Drawings: the Solution Architect (from 2point0 Key Personnel), before the status and the signature */
export function ShopDrawingsSection({ architect }: { architect: string }) {
  return (
    <div className="gc-field">
      <span className="gc-label">Solution Architect</span>
      <div className="gc-readbox">{architect || '— set Pre Sales / Solution Architect in 2point0 Key Personnel'}</div>
    </div>
  )
}

/**
 * The Project Registration Task List is a template (form Project_Registration_Task_List): add an item, rename it, or
 * switch it off (Inactive: no longer shown or required on any project). Ticks stay on each project's own multi-select.
 */
export function ChecklistManager({ items }: { items: Option[] }) {
  const save = useSaveTaskListItem()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null)
  const [adding, setAdding] = useState('')
  const busy = save.isPending
  const commit = (item: { id?: string; name: string; active: boolean }, done?: () => void) => {
    const name = item.name.trim()
    if (!name) return
    save.mutate({ ...item, name }, { onSuccess: () => done?.() })
  }
  if (!open)
    return (
      <button type="button" className="gc-link gc-small gc-checkmgr__open" onClick={() => setOpen(true)}>
        Edit checklist items
      </button>
    )
  return (
    <div className="gc-checkmgr" role="region" aria-label="Edit checklist items">
      <div className="gc-checkmgr__head">
        <strong>Checklist items (template for every project)</strong>
        <button type="button" className="gc-link gc-small" onClick={() => (setOpen(false), setEditing(null), save.reset())}>
          Done
        </button>
      </div>
      <ul className="gc-checkmgr__list">
        {items.map((o) => {
          const active = o.active !== false
          return (
            <li key={o.id} className={active ? '' : 'is-off'}>
              {editing?.id === o.id ? (
                <>
                  <input
                    className="gc-input"
                    aria-label="Item name"
                    maxLength={255}
                    value={editing.name}
                    autoFocus
                    onChange={(e) => setEditing({ id: o.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.preventDefault(), commit({ id: o.id, name: editing.name, active }, () => setEditing(null)))
                      if (e.key === 'Escape') (e.stopPropagation(), setEditing(null))
                    }}
                  />
                  <button
                    type="button"
                    className="gc-btn gc-btn--sm gc-btn--primary"
                    disabled={busy || !editing.name.trim()}
                    onClick={() => commit({ id: o.id, name: editing.name, active }, () => setEditing(null))}
                  >
                    Save
                  </button>
                  <button type="button" className="gc-btn gc-btn--sm" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="gc-checkmgr__name">{o.label}</span>
                  {!active && <span className="gc-badge">Inactive</span>}
                  <button type="button" className="gc-link gc-small" aria-label={`Rename ${o.label}`} disabled={busy} onClick={() => setEditing({ id: o.id, name: o.label })}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className="gc-link gc-small"
                    aria-label={`${active ? 'Switch off' : 'Switch on'} ${o.label}`}
                    disabled={busy}
                    onClick={() => commit({ id: o.id, name: o.label, active: !active })}
                  >
                    {active ? 'Switch off' : 'Switch on'}
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <div className="gc-checkmgr__add">
        <input
          className="gc-input"
          aria-label="New checklist item"
          placeholder="New item, e.g. Handover: Confirm handover pack is complete."
          maxLength={255}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.preventDefault(), commit({ name: adding, active: true }, () => setAdding('')))
          }}
        />
        <button type="button" className="gc-btn gc-btn--sm gc-btn--primary" disabled={busy || !adding.trim()} onClick={() => commit({ name: adding, active: true }, () => setAdding(''))}>
          {busy ? 'Saving…' : 'Add item'}
        </button>
      </div>
      {save.error && (
        <span className="gc-small gc-danger" role="alert">
          Not saved: {save.error.message}
        </span>
      )}
    </div>
  )
}
