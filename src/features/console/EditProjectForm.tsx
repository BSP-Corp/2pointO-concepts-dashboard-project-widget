import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { lockBackground } from './ui'
import { useQueries } from '@tanstack/react-query'
import { ADDRESS_PARTS, PROJECT_FORM, type FormField, type LookupSource } from '@/config/projectForm'
import { useProjectRecord, useUpdateProject } from '@/features/projects/api'
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
 * pre-populated with the record's current values. Only changed fields are sent, so values maintained
 * manually elsewhere are never overwritten. Grids, files and signatures are shown read-only.
 */
export function EditProjectForm({ projectId, title, onClose, onSaved }: { projectId: string; title: string; onClose: () => void; onSaved: () => void }) {
  const record = useProjectRecord(projectId)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
    return lockBackground()
  }, [])

  return createPortal(
    <div className="gc-sheet" role="dialog" aria-modal="true" aria-labelledby="gc-edit-title">
      {record.data ? (
        <FormBody record={record.data} projectId={projectId} title={title} headingRef={headingRef} onClose={onClose} onSaved={onSaved} />
      ) : (
        <>
          <div className="gc-sheet__bar">
            <button type="button" className="gc-btn gc-btn--ghost" onClick={onClose}>
              ← Back to project
            </button>
            <h1 id="gc-edit-title" className="gc-h1" tabIndex={-1} ref={headingRef}>
              Edit {title}
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
}: {
  record: CreatorRecord
  projectId: string
  title: string
  headingRef: React.RefObject<HTMLHeadingElement>
  onClose: () => void
  onSaved: () => void
}) {
  const ds = useDataSource()
  const save = useUpdateProject(projectId)
  const initial = useMemo<Values>(() => Object.fromEntries(EDITABLE.map((f) => [f.name, toFormValue(f, record[f.name])])), [record])
  const [values, setValues] = useState<Values>(initial)
  // Steps layout: one section at a time, Previous / Next (no long scrolling).
  const [active, setActive] = useState(0)
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

  return (
    <form className="gc-sheet__form" onSubmit={submit} noValidate>
      <div className="gc-sheet__bar">
        <button type="button" className="gc-btn gc-btn--ghost" onClick={close} disabled={save.isPending}>
          ← Back to project
        </button>
        <h1 id="gc-edit-title" className="gc-h1" tabIndex={-1} ref={headingRef}>
          Edit {title}
        </h1>
        <div className="gc-sheet__actions">
          <span className="gc-small gc-soft" aria-live="polite">
            {dirty ? `${changed.length} unsaved change${changed.length > 1 ? 's' : ''}` : 'No changes'}
          </span>
          <button type="button" className="gc-btn" onClick={close} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className="gc-btn gc-btn--primary" disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
      <div className="gc-sheet__body">
        {save.error && (
          <div className="gc-panel gc-error" role="alert">
            <strong>The project was not saved</strong>
            <span className="gc-soft gc-small">{save.error.message}</span>
          </div>
        )}
        <div className="gc-form gc-form--wizard">
          <nav className="gc-form__nav" aria-label="Form sections">
            {PROJECT_FORM.map((sec, i) => {
              const n = sectionChanges(sec)
              return (
                <button key={sec.title} type="button" aria-current={i === active} className={i === active ? 'is-on' : ''} onClick={() => setActive(i)}>
                  <span className="gc-step">{i + 1}</span>
                  {sec.title}
                  {n > 0 && <span className="gc-changed" aria-label={`${n} changed`} />}
                </button>
              )
            })}
          </nav>
          <div className="gc-form__sections">
            {PROJECT_FORM.filter((_, si) => si === active).map((section) => {
              return (
                <fieldset key={section.title} className="gc-fieldset">
                  <legend className="gc-h2">{section.title}</legend>
                  <div className="gc-form-grid">
                    {section.columns.map((col, ci) => (
                      <div key={ci} className="gc-form-col">
                        {col.map((f) => (
                          <Field
                            key={f.name}
                            field={f}
                            record={record}
                            value={values[f.name]}
                            onChange={(v) => set(f.name, v)}
                            options={f.source ? optionsBySource[f.source.key] : undefined}
                            extra={extra[f.name]}
                            changed={changed.includes(f)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </fieldset>
              )
            })}
            <div className="gc-form__steps">
              <button type="button" className="gc-btn" disabled={active === 0} onClick={() => setActive((a) => a - 1)}>
                ← Previous
              </button>
              <span className="gc-small gc-soft">
                Step {active + 1} of {PROJECT_FORM.length}
              </span>
              <button type="button" className="gc-btn" disabled={active === PROJECT_FORM.length - 1} onClick={() => setActive((a) => a + 1)}>
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
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
}: {
  field: FormField
  record: CreatorRecord
  value: Value
  onChange: (v: Value) => void
  options?: { data?: Option[]; error: Error | null; isLoading: boolean }
  extra?: Option[]
  changed: boolean
}) {
  const id = `gc-f-${f.name}`
  const label = (
    <label htmlFor={id} className="gc-label">
      {f.label}
      {changed && <span className="gc-changed" title="Changed" aria-label="changed" />}
    </label>
  )
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
        <div className="gc-field">
          {label}
          <input id={id} type="text" value={value as string} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case 'textarea':
      return (
        <div className="gc-field">
          {label}
          <textarea id={id} rows={2} value={value as string} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case 'date':
      return (
        <div className="gc-field">
          {label}
          <input id={id} type="date" value={value as string} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case 'currency':
      return (
        <div className="gc-field">
          {label}
          <div className="gc-input-affix">
            <span aria-hidden="true">AED</span>
            <input id={id} type="number" inputMode="decimal" step="0.01" value={value as string} onChange={(e) => onChange(e.target.value)} />
          </div>
        </div>
      )
    case 'picklist':
      return (
        <div className="gc-field">
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
        <div className="gc-field">
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
      return (
        <div className="gc-field">
          <span className="gc-label" id={id}>
            {f.label}
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
        <fieldset className="gc-field gc-address">
          <legend className="gc-label">
            {f.label}
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
      const text =
        f.kind === 'grid'
          ? Array.isArray(raw)
            ? `${raw.length} row${raw.length === 1 ? '' : 's'}`
            : '—'
          : raw
            ? f.kind === 'signature'
              ? 'Signed'
              : 'File attached'
            : f.kind === 'signature'
              ? 'Not signed'
              : 'No file'
      return (
        <div className="gc-field gc-field--readonly">
          <span className="gc-label">{f.label}</span>
          <span className="gc-readonly">
            {text} <span className="gc-muted gc-small">· managed in Creator</span>
          </span>
        </div>
      )
    }
  }
}
