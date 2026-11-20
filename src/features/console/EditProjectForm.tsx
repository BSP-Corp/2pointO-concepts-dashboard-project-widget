import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { DateInput } from './DateInput'
import { createPortal } from 'react-dom'
import { lockBackground } from './ui'
import { ChecklistManager, ContactsSection, KeyMilestonesSection, PaymentSummarySection, PoFileField, ShopDrawingsSection, SignatureField, projectStartOf } from './RegistrationSections'
import { useQueries } from '@tanstack/react-query'
import { ADDRESS_PARTS, PROJECT_FORM, type FormField, type LookupSource } from '@/config/projectForm'
import { useAttendees, useProjectRecord, useSaveAttendance, useUpdateProject } from '@/features/projects/api'
import { fieldReady, kickoffMissing, kickoffRequired } from '@/features/project/kickoff'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { fromCreatorDate, ref, str, toCreatorDate } from '@/lib/data/zohoSource'
import { queryKeys } from '@/lib/query-keys'
import type { CreatorRecord, Option } from '@/types/domain'

type Value = string | string[] | Record<string, string>
type Values = Record<string, Value>

const FIELDS = PROJECT_FORM.flatMap((s) => s.columns.flat())
const EDITABLE = FIELDS.filter((f) => !f.readOnly && !['file', 'signature', 'grid'].includes(f.kind))

/** Creator record value → form control value. */
function toFormValue(f: FormField, v: unknown): Value {
  switch (f.kind) {
    case 'date':
      return v ? fromCreatorDate(v) : ''
    case 'currency':
      return v === null || v === undefined || v === '' ? '' : String(v).replace(/[^0-9.-]/g, '')
    case 'lookup':
      return ref(v)?.id ?? ''
    case 'multilookup':
      return Array.isArray(v) ? v.map((x) => ref(x)?.id ?? '').filter(Boolean) : []
    case 'address': {
      const a = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
      return Object.fromEntries(ADDRESS_PARTS.map((p) => [p.key, str(a[p.key])]))
    }
    default:
      return str(v)
  }
}

/** Form control value → Creator write payload value. */
function toCreatorValue(f: FormField, v: Value): unknown {
  if (f.kind === 'date') return v ? toCreatorDate(v as string) : ''
  return v
}

const same = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b)

/** Sections closed when the form opens (opened from their header, the section list or Expand all) */
const DEFAULT_CLOSED: string[] = []

/** Current lookup values that are not among the options (e.g. an estimate outside Estimate_Accepted) stay selectable. */
function currentOptions(record: CreatorRecord): Record<string, Option[]> {
  const out: Record<string, Option[]> = {}
  for (const f of FIELDS) {
    if (f.kind === 'lookup') {
      const r = ref(record[f.name])
      if (r) out[f.name] = [r]
    }
    if (f.kind === 'multilookup' && Array.isArray(record[f.name])) out[f.name] = (record[f.name] as unknown[]).map(ref).filter((r): r is Option => !!r)
  }
  return out
}

/**
 * Full-screen edit form for the Project record, built from the .ds field list (config/projectForm.ts) and
 * pre-populated with the record's current values, in the sections of the Project Registration Form (PDF). Only changed
 * fields are sent, so values maintained manually elsewhere are never overwritten. The PO file uploads at once; Contact
 * Person and Key Milestones & Dates rows save on their own Save; Payment Summary is read-only; signatures and the other
 * grids are shown, managed in Creator.
 */
export function EditProjectForm({
  projectId,
  title,
  onClose,
  onSaved,
  kickoff,
}: {
  projectId: string
  title: string
  onClose: () => void
  onSaved: () => void
  /** Opened to move the project to Kick-Off Done: every required field of the Registration form must be filled first */
  kickoff?: { stage: string; move: () => Promise<unknown> }
}) {
  const record = useProjectRecord(projectId)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
    return lockBackground()
  }, [])

  return createPortal(
    <div className="gc-sheet" role="dialog" aria-modal="true" aria-labelledby="gc-edit-title">
      {record.data ? (
        <FormBody record={record.data} projectId={projectId} title={title} headingRef={headingRef} onClose={onClose} onSaved={onSaved} kickoff={kickoff} />
      ) : (
        <>
          <div className="gc-sheet__bar">
            <button type="button" className="gc-btn gc-btn--ghost" onClick={onClose}>
              ← Back to project
            </button>
            <h1 id="gc-edit-title" className="gc-h1" tabIndex={-1} ref={headingRef}>
              {kickoff ? `${kickoff.stage}: Project Registration — ${title}` : `Edit ${title}`}
            </h1>
          </div>
          <div className="gc-sheet__body">
            {record.error ? (
              <div className="gc-panel gc-error" role="alert">
                <strong>Could not load the project record</strong>
                <span className="gc-soft gc-small">{record.error.message}</span>
              </div>
            ) : (
              <div className="gc-skeleton" style={{ height: 420 }} aria-busy="true" aria-label="Loading project record" />
            )}
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

function FormBody({
  record,
  projectId,
  title,
  headingRef,
  onClose,
  onSaved,
  kickoff,
}: {
  record: CreatorRecord
  projectId: string
  title: string
  headingRef: React.RefObject<HTMLHeadingElement>
  onClose: () => void
  onSaved: () => void
  kickoff?: { stage: string; move: () => Promise<unknown> }
}) {
  const ds = useDataSource()
  const save = useUpdateProject(projectId, { inline: true })
  const initial = useMemo<Values>(() => Object.fromEntries(EDITABLE.map((f) => [f.name, toFormValue(f, record[f.name])])), [record])
  const [values, setValues] = useState<Values>(initial)
  const extra = useMemo(() => currentOptions(record), [record])

  // Lookup option lists: read once per source while the form is open, cached for the session.
  const sources = useMemo(() => [...new Map(EDITABLE.filter((f) => f.source).map((f) => [f.source!.key, f.source!])).values()], [])
  const optionQueries = useQueries({
    queries: sources.map((s: LookupSource) => ({
      queryKey: queryKeys.options(s.key),
      queryFn: () => ds.listOptions(s),
      staleTime: 10 * 60_000,
    })),
  })
  const optionsBySource = Object.fromEntries(sources.map((s, i) => [s.key, optionQueries[i]]))

  const changed = EDITABLE.filter((f) => !same(values[f.name], initial[f.name]))
  const dirty = changed.length > 0
  const checklistTotal = (optionsBySource.taskList?.data ?? []).filter((o) => o.active !== false).map((o) => o.id)
  const missing = kickoff ? kickoffMissing(record, values, checklistTotal) : []
  // Red outlines, "Required" and "N missing" only after a try to move to Kick-Off Done with fields still empty
  const [attempted, setAttempted] = useState(false)
  const shown = attempted ? missing : []
  const missingNames = new Set(shown.map((f) => (f.name === 'PO' ? 'Date_PO_Received' : f.name)))
  // The * of the Registration Form's required fields shows all the time (Edit and Kick-Off Done)
  const applicable = kickoffRequired(record)
  const required = new Set(applicable.map((f) => (f.name === 'PO' ? 'Date_PO_Received' : f.name)))
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState('')
  const toKickoff = async () => {
    if (!kickoff) return
    if (missing.length) {
      setAttempted(true)
      setShowMissing(true)
      const first = missing[0]
      const si = Math.max(
        0,
        PROJECT_FORM.findIndex((x) => x.title === first.section),
      )
      setClosed((c) => new Set([...c].filter((i) => !missing.some((f) => f.section === PROJECT_FORM[i].title))))
      requestAnimationFrame(
        () => document.getElementById(`gc-f-${first.name === 'PO' ? 'Date_PO_Received' : first.name}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) ?? scrollTo(`gc-sec-${si}`),
      )
      return
    }
    setMoving(true)
    setMoveError('')
    try {
      if (dirty) await save.mutateAsync({ data: Object.fromEntries(changed.map((f) => [f.name, toCreatorValue(f, values[f.name])])) })
      await kickoff.move()
      onSaved()
    } catch (e) {
      setMoveError((e as Error).message)
    } finally {
      setMoving(false)
    }
  }

  const close = () => {
    if (!dirty || window.confirm('Discard your changes to this project?')) onClose()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !save.isPending) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!dirty) return onClose()
    const data = Object.fromEntries(changed.map((f) => [f.name, toCreatorValue(f, values[f.name])]))
    save.mutate({ data }, { onSuccess: onSaved })
  }
  const set = (name: string, v: Value) => setValues((s) => ({ ...s, [name]: v }))
  const sectionChanges = (sec: (typeof PROJECT_FORM)[number]) => sec.columns.flat().filter((f) => changed.includes(f)).length
  const [showMissing, setShowMissing] = useState(false)
  // Sections open / closed: reference sections start closed; with Kick-Off Done, a section with a missing field starts open
  const [closed, setClosed] = useState<Set<number>>(
    () => new Set(PROJECT_FORM.map((sec, i) => (DEFAULT_CLOSED.includes(sec.title) && !missing.some((f) => f.section === sec.title) ? i : -1)).filter((i) => i >= 0)),
  )
  const toggle = (i: number) =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  const [moreOpen, setMoreOpen] = useState<Set<number>>(() => new Set())
  const toggleMore = (i: number) =>
    setMoreOpen((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  /** Opens the section first (closed sections are not rendered), then scrolls to the section or field */
  const jump = (id: string, section?: number) => {
    const si = section ?? (id.startsWith('gc-sec-') ? Number(id.slice(7)) : -1)
    if (si >= 0 && closed.has(si)) {
      toggle(si)
      requestAnimationFrame(() => scrollTo(id))
    } else scrollTo(id)
  }
  const requiredTotal = kickoff ? applicable.length : 0
  const readiness = requiredTotal ? Math.round(((requiredTotal - missing.length) / requiredTotal) * 100) : 0
  const fieldProps = (f: FormField) => ({
    field: f,
    record,
    value: values[f.name],
    onChange: (v: Value) => set(f.name, v),
    options: f.source ? optionsBySource[f.source.key] : undefined,
    extra: extra[f.name],
    changed: changed.includes(f),
    required: required.has(f.name),
    missing: missingNames.has(f.name),
  })
  const renderField = (f: FormField) =>
    !fieldReady(record, f.name) ? (
      <div key={f.name} className="gc-field">
        <span className="gc-label">{f.label}</span>
        <p className="gc-regnote" role="note">
          Not on the Project form yet — paste the field into form Project (docs/creator/KICKOFF_FORM_FIELDS.md, section B); it works here once it is there.
        </p>
      </div>
    ) : f.kind === 'file' ? (
      <PoFileField key={f.name} projectId={projectId} record={record} field={f.name} label={f.label} hint={f.hint} required={required.has(f.name)} missing={missingNames.has(f.name)} />
    ) : f.kind === 'signature' ? (
      <SignatureField key={f.name} projectId={projectId} record={record} field={f.name} label={f.label} hint={f.hint} required={required.has(f.name)} missing={missingNames.has(f.name)} />
    ) : (
      <Field key={f.name} {...fieldProps(f)} />
    )
  const architect = (() => {
    const id = values.Solution_Architect as string
    const users = optionsBySource.users?.data ?? []
    return users.find((o) => o.id === id)?.label ?? (extra.Solution_Architect ?? []).find((o) => o.id === id)?.label ?? ''
  })()

  return (
    <form className="gc-sheet__form" onSubmit={submit} noValidate>
      <div className="gc-sheet__bar">
        <button type="button" className="gc-btn gc-btn--ghost" onClick={close} disabled={save.isPending}>
          ← Back to project
        </button>
        <h1 id="gc-edit-title" className="gc-h1" tabIndex={-1} ref={headingRef}>
          {kickoff ? `${kickoff.stage}: Project Registration — ${title}` : `Edit ${title}`}
        </h1>
        <div className="gc-sheet__actions">
          <span className="gc-small gc-soft" aria-live="polite">
            {dirty ? `${changed.length} unsaved change${changed.length > 1 ? 's' : ''}` : 'No changes'}
          </span>
          <button type="button" className="gc-btn" onClick={close} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className={`gc-btn ${kickoff ? '' : 'gc-btn--primary'}`} disabled={!dirty || save.isPending || moving}>
            {save.isPending && !moving ? 'Saving…' : 'Save changes'}
          </button>
          {kickoff && (
            <button
              type="button"
              className="gc-btn gc-btn--primary"
              disabled={moving}
              title={missing.length ? `${missing.length} required field${missing.length > 1 ? 's are' : ' is'} still empty` : undefined}
              onClick={toKickoff}
            >
              {moving ? 'Moving…' : `Save & move to ${kickoff.stage}`}
            </button>
          )}
        </div>
      </div>
      <div className="gc-sheet__body gc-regpage">
        <nav className="gc-regnav" aria-label="Form sections">
          {kickoff && (
            <div className="gc-regnav__progress" role="group" aria-label="Kick-off readiness">
              <span className="gc-small">
                <strong>{readiness}%</strong> ready for {kickoff.stage}
              </span>
              <span className="gc-regnav__bar" aria-hidden="true">
                <span style={{ width: `${readiness}%` }} />
              </span>
            </div>
          )}
          <div className="gc-regnav__tools">
            <button type="button" className="gc-link gc-small" onClick={() => setClosed(new Set())}>
              Expand all
            </button>
            <button type="button" className="gc-link gc-small" onClick={() => setClosed(new Set(PROJECT_FORM.map((_, i) => i)))}>
              Collapse all
            </button>
          </div>
          {PROJECT_FORM.map((sec, i) => {
            const n = sectionChanges(sec)
            const gaps = shown.filter((f) => f.section === sec.title).length
            return (
              <button key={sec.title} type="button" onClick={() => jump(`gc-sec-${i}`)}>
                <span className="gc-regnav__no" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {sec.title}
                {n > 0 && <span className="gc-changed" aria-label={`${n} changed`} />}
                {gaps > 0 && (
                  <span className="gc-kickoff__gaps" aria-label={`${gaps} required missing`}>
                    {gaps}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="gc-regform">
          <div className="gc-regform__banner" aria-hidden="true">
            <span className="gc-regform__logo">
              <span>2</span>
              <span>0</span>
            </span>
            <span className="gc-regform__brand">
              <strong>2.0 Concepts</strong>
              <span>Audio Visual Architects</span>
            </span>
          </div>
          <div className="gc-regform__page">
            <p className="gc-regform__title">Project Registration Form</p>
            <p className="gc-regform__sub">
              {str(record.Project_Reference) || title}
              {str(record.Project_Name) && str(record.Project_Name) !== str(record.Project_Reference) ? ` · ${str(record.Project_Name)}` : ''}
            </p>
            {save.error && (
              <div className="gc-panel gc-error" role="alert">
                <strong>The project was not saved</strong>
                <span className="gc-soft gc-small">{save.error.message}</span>
              </div>
            )}
            {kickoff && (
              <div className={`gc-regmissing ${missing.length ? (attempted ? 'is-missing' : 'is-todo') : 'is-ready'}`} role="region" aria-label="Required for Kick-Off Done">
                {missing.length ? (
                  <>
                    <div className="gc-regmissing__head">
                      <strong>
                        {attempted
                          ? `${missing.length} required field${missing.length > 1 ? 's' : ''} missing before ${kickoff.stage}`
                          : `${missing.length} required field${missing.length > 1 ? 's' : ''} to fill before ${kickoff.stage}`}
                      </strong>
                      <button type="button" className="gc-link gc-small" aria-expanded={showMissing} onClick={() => setShowMissing((v) => !v)}>
                        {showMissing ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {showMissing && (
                      <ul className="gc-regmissing__list">
                        {missing.map((f) => (
                          <li key={f.name}>
                            <button
                              type="button"
                              className="gc-regchip"
                              title={`${f.section}${f.inCreator ? ' · fill it in Creator (Project form)' : ''}`}
                              onClick={() => {
                                const si = Math.max(
                                  0,
                                  PROJECT_FORM.findIndex((x) => x.title === f.section),
                                )
                                const fid = `gc-f-${f.name === 'PO' ? 'Date_PO_Received' : f.name}`
                                if (closed.has(si)) jump(fid, si)
                                else scrollTo(document.getElementById(fid) ? fid : `gc-sec-${si}`)
                              }}
                            >
                              {f.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <strong>All required fields are filled — Save & move to {kickoff.stage}.</strong>
                )}
                {moveError && (
                  <p className="gc-small gc-danger" role="alert">
                    {moveError}
                  </p>
                )}
              </div>
            )}
            {PROJECT_FORM.map((section, si) => {
              const [main, more] = section.columns
              const isClosed = closed.has(si)
              const gaps = shown.filter((f) => f.section === section.title).length
              const open = missing.some((f) => f.section === section.title)
              const hasRequired = applicable.some((f) => f.section === section.title)
              const moreShown = moreOpen.has(si)
              const moreLabel = section.layout === 'budget' ? 'Totals' : 'More details'
              return (
                <section key={section.title} id={`gc-sec-${si}`} className={`gc-regsec${isClosed ? ' is-closed' : ''}`} aria-labelledby={`gc-sec-h-${si}`}>
                  <h2 id={`gc-sec-h-${si}`} className="gc-regsec__title">
                    <button type="button" className="gc-regsec__toggle" aria-expanded={!isClosed} aria-controls={`gc-sec-b-${si}`} onClick={() => toggle(si)}>
                      <span className="gc-regsec__no" aria-hidden="true">
                        {String(si + 1).padStart(2, '0')}
                      </span>
                      <span className="gc-regsec__name">{section.title}</span>
                      {kickoff && hasRequired && (gaps > 0 || !open) && <span className={`gc-regsec__state ${gaps ? 'is-missing' : 'is-done'}`}>{gaps ? `${gaps} missing` : 'Complete'}</span>}
                      <span className="gc-regsec__chev" aria-hidden="true" />
                    </button>
                  </h2>
                  {!isClosed && (
                    <div id={`gc-sec-b-${si}`} className="gc-regsec__body">
                      {section.intro && <p className="gc-regsec__intro">{section.intro}</p>}
                      {section.rows === 'shopDrawings' && <ShopDrawingsSection architect={architect} />}
                      {section.layout === 'personnel' ? (
                        <PersonnelTable
                          projectId={projectId}
                          fields={main.filter((f) => f.kind === 'lookup')}
                          props={fieldProps}
                          users={optionsBySource.users?.data ?? []}
                          attendeesMissing={missingNames.has('Meeting_Attendees')}
                        />
                      ) : section.layout === 'budget' ? (
                        <PaymentSummarySection
                          projectId={projectId}
                          record={record}
                          values={values}
                          part="category"
                          budgetCell={(name) => {
                            const f = main.find((x) => x.name === name)
                            if (!f) return null
                            const p = fieldProps(f)
                            return (
                              <span className={`gc-budgetcell${p.missing ? ' is-missing' : ''}`}>
                                <input
                                  id={`gc-f-${f.name}`}
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  value={p.value as string}
                                  aria-label={`${f.label} budget cost`}
                                  onChange={(e) => p.onChange(e.target.value)}
                                />
                                {p.changed && <span className="gc-changed" aria-label="changed" />}
                              </span>
                            )
                          }}
                        />
                      ) : (
                        main.map(renderField)
                      )}
                      {section.layout === 'personnel' && main.filter((f) => f.kind === 'signature').map(renderField)}
                      {section.rows === 'contacts' && (
                        <ContactsSection projectId={projectId} company={str((record.Client_Name as { display_value?: string } | undefined)?.display_value ?? record.Client_Name)} />
                      )}
                      {section.rows === 'milestones' && <KeyMilestonesSection projectId={projectId} projectStart={projectStartOf(record, values)} />}
                      {section.rows === 'payments' && <PaymentSummarySection projectId={projectId} record={record} values={values} part="terms" />}
                      {section.note && <p className="gc-regsec__intro">{section.note}</p>}
                      {more.length > 0 && (
                        <div className={`gc-regmore${moreShown ? ' is-open' : ''}`}>
                          <button type="button" className="gc-regmore__toggle" aria-expanded={moreShown} aria-controls={`gc-more-${si}`} onClick={() => toggleMore(si)}>
                            {moreShown ? `Hide ${moreLabel.toLowerCase()}` : `Show ${moreLabel.toLowerCase()}`}
                            <span className="gc-soft"> ({more.length})</span>
                            {more.some((f) => changed.includes(f)) && <span className="gc-changed" aria-label="changed" />}
                          </button>
                          {moreShown && (
                            <div id={`gc-more-${si}`} className="gc-regmore__grid">
                              {more.map(renderField)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </form>
  )
}

/** 2point0 Key Personnel as the Registration Form: Role | Employee Name | Present Yes / No (Meeting_Attendee.Attendance) */
function PersonnelTable({
  projectId,
  fields,
  props,
  users,
  attendeesMissing,
}: {
  projectId: string
  fields: FormField[]
  props: (f: FormField) => React.ComponentProps<typeof Field>
  users: Option[]
  attendeesMissing: boolean
}) {
  const attendees = useAttendees(projectId)
  const saveAtt = useSaveAttendance(projectId)
  const attendanceOf = (userId: string) => attendees.data?.find((a) => a.userId === userId)?.attendance ?? ''
  return (
    <div className="gc-field" id="gc-f-Meeting_Attendees">
      <span className="gc-label">
        2point0 Meeting Attendees
        {attendeesMissing && <span className="gc-regreq">Mark Present Yes / No for at least one</span>}
      </span>
      <div className="gc-table-wrap">
        <table className="gc-regtable" aria-label="2point0 Meeting Attendees">
          <thead>
            <tr>
              <th scope="col">
                <span className="gc-sr-only">Role</span>
              </th>
              <th scope="col">Employee Name</th>
              <th scope="col">Present Yes / No</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const p = props(f)
              const userId = p.value as string
              const opts = [...users]
              for (const o of p.extra ?? []) if (!opts.some((x) => x.id === o.id)) opts.unshift(o)
              const att = attendanceOf(userId)
              return (
                <tr key={f.name} className={p.missing ? 'is-missing' : undefined}>
                  <th scope="row">
                    <label htmlFor={`gc-f-${f.name}`}>
                      {f.label}
                      {p.required && <span className="gc-danger"> *</span>}
                      {p.changed && <span className="gc-changed" aria-label="changed" />}
                    </label>
                  </th>
                  <td>
                    <select id={`gc-f-${f.name}`} value={userId} onChange={(e) => p.onChange(e.target.value)} aria-busy={p.options?.isLoading}>
                      <option value="">{p.options?.isLoading ? 'Loading…' : '-Select-'}</option>
                      {opts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={att === 'Present' ? 'Yes' : att === 'Absent' ? 'No' : ''}
                      disabled={!userId || saveAtt.isPending}
                      title={userId ? undefined : 'Choose the employee first'}
                      aria-label={`${f.label} present`}
                      onChange={(e) => saveAtt.mutate({ userId, attendance: e.target.value === 'Yes' ? 'Present' : e.target.value === 'No' ? 'Absent' : '' })}
                    >
                      <option value="">-Select-</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {saveAtt.error && (
        <span className="gc-small gc-danger" role="alert">
          Attendance not saved: {saveAtt.error.message}
        </span>
      )}
    </div>
  )
}

function Field({
  field: f,
  record,
  value,
  onChange,
  options,
  extra,
  changed,
  required = false,
  missing = false,
}: {
  field: FormField
  record: CreatorRecord
  value: Value
  onChange: (v: Value) => void
  options?: { data?: Option[]; error: Error | null; isLoading: boolean }
  extra?: Option[]
  changed: boolean
  /** Kick-Off Done: required (*), and still empty */
  required?: boolean
  missing?: boolean
}) {
  const id = `gc-f-${f.name}`
  const star = required ? <span className="gc-danger"> *</span> : null
  const cls = missing ? ' gc-field--missing' : ''
  const label = (
    <label htmlFor={id} className="gc-label">
      {f.label}
      {star}
      {changed && <span className="gc-changed" title="Changed" aria-label="changed" />}
    </label>
  )
  const hint = f.hint ? <span className="gc-small gc-soft">{f.hint}</span> : null
  const opts = useMemo(() => {
    const list = [...(options?.data ?? [])]
    for (const o of extra ?? []) if (!list.some((x) => x.id === o.id)) list.unshift(o)
    return list
  }, [options?.data, extra])

  if (f.readOnly)
    return (
      <div className="gc-field gc-field--readonly">
        <span className="gc-label">{f.label}</span>
        <span className="gc-readonly">
          {str(record[f.name]) || '—'} <span className="gc-muted gc-small">· change it in the status pipeline</span>
        </span>
      </div>
    )
  switch (f.kind) {
    case 'text':
      return (
        <div className={`gc-field${cls}`}>
          {label}
          <input id={id} type="text" value={value as string} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </div>
      )
    case 'textarea':
      return (
        <div className={`gc-field${cls}`}>
          {label}
          <textarea id={id} rows={f.hint ? 4 : 2} value={value as string} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </div>
      )
    case 'date':
      return (
        <div className={`gc-field${cls}`}>
          {label}
          <DateInput id={id} value={value as string} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </div>
      )
    case 'currency':
      return (
        <div className={`gc-field${cls}`}>
          {label}
          <div className="gc-input-affix">
            <span aria-hidden="true">AED</span>
            <input id={id} type="number" inputMode="decimal" step="0.01" value={value as string} onChange={(e) => onChange(e.target.value)} />
          </div>
          {hint}
        </div>
      )
    case 'picklist':
      if (f.radio)
        return (
          <fieldset className={`gc-field gc-radiocards${cls}`} id={id}>
            <legend className="gc-label">
              {f.label}
              {star}
              {changed && <span className="gc-changed" aria-label="changed" />}
            </legend>
            <div className="gc-radiocards__list">
              {[...(f.values ?? []), ...(value && !(f.values ?? []).includes(value as string) ? [value as string] : [])].map((v) => (
                <label key={v} className={`gc-radiocard${value === v ? ' is-on' : ''}`}>
                  <input type="radio" name={f.name} value={v} checked={value === v} onChange={() => onChange(v)} />
                  <span>{v}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )
      return (
        <div className={`gc-field${cls}`}>
          {label}
          <select id={id} value={value as string} onChange={(e) => onChange(e.target.value)}>
            <option value="">-Select-</option>
            {(f.values ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
            {value && !(f.values ?? []).includes(value as string) && <option value={value as string}>{value as string}</option>}
          </select>
        </div>
      )
    case 'lookup':
      return (
        <div className={`gc-field${cls}`}>
          {label}
          <select id={id} value={value as string} onChange={(e) => onChange(e.target.value)} aria-busy={options?.isLoading}>
            <option value="">{options?.isLoading ? 'Loading…' : '-Select-'}</option>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {options?.error && <span className="gc-small gc-danger">Options unavailable: {options.error.message}</span>}
        </div>
      )
    case 'multilookup': {
      const selected = value as string[]
      if (f.cards) {
        // template items switched off (Inactive) are not shown or required
        const live = opts.filter((o) => o.active !== false)
        return (
          <div className={`gc-field${cls}`}>
            <div className="gc-checkhead">
              <span className="gc-label" id={id}>
                {f.label}
                {star}
                {changed && <span className="gc-changed" aria-label="changed" />}
              </span>
              <span className="gc-small gc-soft" aria-live="polite">
                {live.filter((o) => selected.includes(o.id)).length} / {live.length} reviewed
              </span>
              <button type="button" className="gc-link gc-small" disabled={!live.length} onClick={() => onChange(live.every((o) => selected.includes(o.id)) ? [] : live.map((o) => o.id))}>
                {live.length && live.every((o) => selected.includes(o.id)) ? 'Untick all' : 'Tick all'}
              </button>
            </div>
            {options?.isLoading && !opts.length && <span className="gc-soft gc-small">Loading…</span>}
            {options?.error && <span className="gc-small gc-danger">Checklist unavailable: {options.error.message}</span>}
            {!options?.isLoading && !options?.error && !live.length && (
              <p className="gc-regnote" role="note">
                No active checklist items yet — add them with Edit checklist items below.
              </p>
            )}
            <ul className="gc-checkcards" aria-labelledby={id}>
              {live.map((o) => {
                const on = selected.includes(o.id)
                const [head, ...rest] = o.label.split(':')
                return (
                  <li key={o.id}>
                    <label className={`gc-checkcard${on ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
                      <span>
                        {rest.length ? (
                          <>
                            <strong>{head}:</strong>
                            {rest.join(':')}
                          </>
                        ) : (
                          o.label
                        )}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {!options?.error && <ChecklistManager items={opts} />}
          </div>
        )
      }
      return (
        <div className={`gc-field${cls}`}>
          <span className="gc-label" id={id}>
            {f.label}
            {star}
            {changed && <span className="gc-changed" aria-label="changed" />}
          </span>
          <div className="gc-checklist" role="group" aria-labelledby={id}>
            {options?.isLoading && !opts.length && <span className="gc-soft gc-small">Loading…</span>}
            {opts.map((o) => (
              <label key={o.id} className="gc-check">
                <input type="checkbox" checked={selected.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )
    }
    case 'address': {
      const a = value as Record<string, string>
      return (
        <fieldset className={`gc-field gc-address${cls}`}>
          <legend className="gc-label">
            {f.label}
            {star}
            {changed && <span className="gc-changed" aria-label="changed" />}
          </legend>
          {ADDRESS_PARTS.map((p) => (
            <input key={p.key} type="text" placeholder={p.label} aria-label={`${f.label} – ${p.label}`} value={a[p.key] ?? ''} onChange={(e) => onChange({ ...a, [p.key]: e.target.value })} />
          ))}
        </fieldset>
      )
    }
    default: {
      // file / signature / grid: shown, managed in Creator.
      const raw = record[f.name]
      const rows = record[`${f.name}_Count`] !== undefined ? Number(record[`${f.name}_Count`]) : Array.isArray(raw) ? raw.length : null
      const text =
        f.kind === 'grid'
          ? rows !== null
            ? `${rows} row${rows === 1 ? '' : 's'}`
            : '—'
          : raw
            ? f.kind === 'signature'
              ? 'Signed'
              : 'File attached'
            : f.kind === 'signature'
              ? 'Not signed'
              : 'No file'
      return (
        <div className={`gc-field gc-field--readonly${cls}`}>
          <span className="gc-label">
            {f.label}
            {star}
          </span>
          <span className="gc-readonly">
            {text} <span className="gc-muted gc-small">· managed in Creator</span>
          </span>
        </div>
      )
    }
  }
}
