import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Option } from '@/types/domain'

// Record-list editing: a field shows as its normal value (no input box). Clicking it opens a compact editor; Enter or
// clicking elsewhere saves it to the record (with its record ID), Esc cancels. Selects and dates save as soon as a value
// is picked. While saving the cell is dimmed; the saved value then shows as plain text again.

/** The read-only look of an editable cell: plain value, a click opens the editor. */
function View({ label, saving, title, children, onEdit }: { label: string; saving?: boolean; title?: string; children: ReactNode; onEdit: () => void }) {
  return (
    <button type="button" className={`gc-cell-view ${saving ? 'is-saving' : ''}`} aria-label={label} title={title ?? 'Click to edit'} onClick={onEdit}>
      {children}
    </button>
  )
}
const empty = <span className="gc-muted">—</span>

/** Editor lifecycle: Enter / blur commit once, Esc cancels. */
function useEditor(onCommit: (el: HTMLInputElement) => void) {
  const [on, setOn] = useState(false)
  const done = useRef(false)
  const open = () => {
    done.current = false
    setOn(true)
  }
  const commit = (el: HTMLInputElement) => {
    if (done.current) return
    done.current = true
    setOn(false)
    onCommit(el)
  }
  const cancel = () => {
    done.current = true
    setOn(false)
  }
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(e.currentTarget)
    if (e.key === 'Escape') cancel()
  }
  return { on, open, commit, cancel, keys }
}

/** Free text (Task name, PO#, Serial number, IP address…). Empty = cleared. */
export function InlineText({ value, label, disabled, saving, placeholder, wide, onSave }: { value: string; label: string; disabled?: boolean; saving?: boolean; placeholder?: string; wide?: boolean; onSave: (v: string) => void }) {
  const ed = useEditor((el) => {
    const v = el.value.trim()
    if (v !== value) onSave(v)
  })
  if (disabled) return <span className="gc-cell-static">{value || empty}</span>
  if (!ed.on)
    return (
      <View label={label} saving={saving} onEdit={ed.open}>
        {value || (placeholder ? <span className="gc-muted">{placeholder}</span> : empty)}
      </View>
    )
  return <input autoFocus className={`gc-cell-input ${wide ? 'gc-cell-input--wide' : ''}`} type="text" defaultValue={value} placeholder={placeholder} aria-label={label} onKeyDown={ed.keys} onBlur={(e) => ed.commit(e.currentTarget)} />
}

/** Whole number (Duration, Starts after, Completion %, order qty). Empty = cleared; out of range = not saved. */
export function InlineNumber({ value, label, suffix = '', min = 0, max, disabled, saving, title, onSave }: { value: number | ''; label: string; suffix?: string; min?: number; max?: number; disabled?: boolean; saving?: boolean; title?: string; onSave: (v: number | '') => void }) {
  const ed = useEditor((el) => {
    const raw = el.value.trim()
    const v = raw === '' ? '' : Math.round(Number(raw))
    if (v !== '' && (Number.isNaN(v) || v < min || (max !== undefined && v > max))) return
    if (v !== value) onSave(v)
  })
  const shown = value === '' || value === 0 ? empty : `${value}${suffix}`
  if (disabled)
    return (
      <span className="gc-cell-static" title={title}>
        {shown}
      </span>
    )
  if (!ed.on)
    return (
      <View label={label} saving={saving} title={title} onEdit={ed.open}>
        {shown}
      </View>
    )
  return <input autoFocus className="gc-cell-input gc-input-num" type="number" inputMode="numeric" min={min} max={max} step={1} defaultValue={value === '' ? '' : value} aria-label={label} onKeyDown={ed.keys} onBlur={(e) => ed.commit(e.currentTarget)} />
}

/** Lookup / picklist: click → the list; picking an option saves at once; clicking away closes it unchanged. */
export function InlineSelect({ value, display, options, label, disabled, saving, allowEmpty = true, loading, tone, onSave }: { value: string; display: ReactNode; options: Option[]; label: string; disabled?: boolean; saving?: boolean; allowEmpty?: boolean; loading?: boolean; tone?: string; onSave: (id: string) => void }) {
  const [on, setOn] = useState(false)
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (!on) return
    ref.current?.focus()
    try {
      ref.current?.showPicker?.()
    } catch {
      /* the focused list still opens on click / Space */
    }
  }, [on])
  const shown = display ? <span className={tone ? `gc-cell-tone gc-cell-tone--${tone}` : undefined}>{display}</span> : empty
  if (disabled) return <span className="gc-cell-static">{shown}</span>
  if (!on)
    return (
      <View label={label} saving={saving} onEdit={() => setOn(true)}>
        {shown}
      </View>
    )
  const current = typeof display === 'string' ? display : value
  return (
    <select
      ref={ref}
      className="gc-cell-input gc-cell-select"
      value={value}
      aria-label={label}
      onKeyDown={(e) => e.key === 'Escape' && setOn(false)}
      onBlur={() => setOn(false)}
      onChange={(e) => {
        setOn(false)
        if (e.target.value !== value) onSave(e.target.value)
      }}
    >
      {(allowEmpty || !value) && <option value="">{loading ? 'Loading…' : '—'}</option>}
      {value && !options.some((o) => o.id === value) && <option value={value}>{current}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Yes / No (Networked): shows the value; a click flips it and saves. */
export function InlineCheck({ value, label, disabled, onSave }: { value: boolean; label: string; disabled?: boolean; onSave: (v: boolean) => void }) {
  if (disabled) return <span className="gc-cell-static">{value ? 'Yes' : 'No'}</span>
  return (
    <button type="button" className="gc-cell-view" role="switch" aria-checked={value} aria-label={label} title="Click to change" onClick={() => onSave(!value)}>
      {value ? 'Yes' : 'No'}
    </button>
  )
}

/** Milestone "Starts after": number + Days / Weeks / Months; saved together when the editor is left or on Enter. */
export function InlineStartsAfter({ after, unit, label, disabled, saving, onSave }: { after: number; unit: string; label: string; disabled?: boolean; saving?: boolean; onSave: (after: number, unit: string) => void }) {
  const [on, setOn] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const num = useRef<HTMLInputElement>(null)
  const sel = useRef<HTMLSelectElement>(null)
  const text = unit ? `${after} ${after === 1 ? unit.replace(/s$/, '').toLowerCase() : unit.toLowerCase()}` : ''
  const commit = () => {
    setOn(false)
    const v = Math.round(Number(num.current?.value || 0))
    const u = sel.current?.value || 'Days'
    if (Number.isNaN(v) || v < 0) return
    if (v !== after || u !== (unit || 'Days')) onSave(v, u)
  }
  if (disabled) return <span className="gc-cell-static">{text || empty}</span>
  if (!on)
    return (
      <View label={label} saving={saving} onEdit={() => setOn(true)}>
        {text || empty}
      </View>
    )
  return (
    <span
      ref={box}
      className="gc-inline-pair"
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setOn(false)
      }}
    >
      <input ref={num} autoFocus className="gc-cell-input gc-input-num" type="number" min={0} step={1} defaultValue={after} aria-label={`${label} — number`} />
      <select ref={sel} className="gc-cell-input gc-cell-select" defaultValue={unit || 'Days'} aria-label={`${label} — unit`}>
        {['Days', 'Weeks', 'Months'].map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
    </span>
  )
}
