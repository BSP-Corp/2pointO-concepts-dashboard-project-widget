import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DISMISS, POPUP_ATTR, openSelectList } from '@/features/console/SelectPopup'
import type { Option } from '@/types/domain'

// Record-list editing: a field shows as its normal value (no input box). Clicking it opens a compact editor; Enter or
// clicking elsewhere saves it to the record (with its record ID), Esc cancels. Selects and dates save as soon as a value
// is picked. While saving the cell is dimmed; the saved value then shows as plain text again.
// The cell keeps the width it had while its editor is open, so the columns next to it never move.

/**
 * Locks the table cell (or grid cell / procurement box) of an editor to the width it had when it was clicked, until the
 * editor closes. Call the returned function with the clicked element.
 */
export function useCellLock(on: boolean) {
  const cell = useRef<{ el: HTMLElement; width: number } | null>(null)
  useLayoutEffect(() => {
    const c = cell.current
    if (!on || !c) return
    const before = {
      width: c.el.style.width,
      minWidth: c.el.style.minWidth,
      maxWidth: c.el.style.maxWidth,
    }
    c.el.style.width = c.el.style.minWidth = c.el.style.maxWidth = `${c.width}px`
    return () => {
      Object.assign(c.el.style, before)
      cell.current = null
    }
  }, [on])
  return (from: HTMLElement) => {
    const el = from.closest<HTMLElement>('.gc-pg-box, td, th, [role="cell"]')
    cell.current = el ? { el, width: el.getBoundingClientRect().width } : null
  }
}

/** The read-only look of an editable cell: plain value, a click opens the editor. */
function View({ label, saving, title, children, onEdit }: { label: string; saving?: boolean; title?: string; children: ReactNode; onEdit: (el: HTMLElement) => void }) {
  return (
    <button type="button" className={`gc-cell-view ${saving ? 'is-saving' : ''}`} aria-label={label} title={title ?? 'Click to edit'} onClick={(e) => onEdit(e.currentTarget)}>
      {children}
    </button>
  )
}
const empty = <span className="gc-muted">—</span>
/** Focus moved into the widget's dropdown list (SelectPopup) — the editor is still in use, not left */
const inList = (el: EventTarget | null) => el instanceof Element && !!el.closest(`[${POPUP_ATTR}]`)

type Field = HTMLInputElement | HTMLTextAreaElement
/** Editor lifecycle: Enter / blur commit once, Esc cancels. */
function useEditor(onCommit: (el: Field) => void) {
  const [on, setOn] = useState(false)
  const done = useRef(false)
  const lock = useCellLock(on)
  const open = (from: HTMLElement) => {
    lock(from)
    done.current = false
    setOn(true)
  }
  const commit = (el: Field) => {
    if (done.current) return
    done.current = true
    setOn(false)
    onCommit(el)
  }
  const cancel = () => {
    done.current = true
    setOn(false)
  }
  const keys = (e: React.KeyboardEvent<Field>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(e.currentTarget)
    }
    if (e.key === 'Escape') cancel()
  }
  return { on, open, commit, cancel, keys }
}

/** Free text (Task name, PO#, Serial number, IP address…). Empty = cleared. */
export function InlineText({
  value,
  label,
  disabled,
  saving,
  placeholder,
  wide,
  onSave,
}: {
  value: string
  label: string
  disabled?: boolean
  saving?: boolean
  placeholder?: string
  wide?: boolean
  onSave: (v: string) => void
}) {
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
  // A text box that grows with the text (wraps inside the cell's width) — a long name is never cut off while editing
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }
  return (
    <textarea
      autoFocus
      rows={1}
      ref={grow}
      className={`gc-cell-input gc-cell-text ${wide ? 'gc-cell-input--wide' : ''}`}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label}
      onInput={(e) => grow(e.currentTarget)}
      onKeyDown={ed.keys}
      onBlur={(e) => ed.commit(e.currentTarget)}
    />
  )
}

/** Whole number (Duration, Starts after, Completion %, order qty). Empty = cleared; out of range = not saved. */
export function InlineNumber({
  value,
  label,
  suffix = '',
  min = 0,
  max,
  disabled,
  saving,
  title,
  onSave,
}: {
  value: number | ''
  label: string
  suffix?: string
  min?: number
  max?: number
  disabled?: boolean
  saving?: boolean
  title?: string
  onSave: (v: number | '') => void
}) {
  const ed = useEditor((el) => {
    const raw = el.value.trim()
    const v = raw === '' ? '' : Math.round(Number(raw))
    if (v !== '' && (Number.isNaN(v) || v < min || (max !== undefined && v > max))) return
    if (v !== value) onSave(v)
  })
  // a % value always shows its sign (0%); plain counts show — for 0
  const shown = value === '' || (value === 0 && suffix !== '%') ? empty : `${value}${suffix}`
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
  return (
    <input
      autoFocus
      className="gc-cell-input gc-input-num"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      defaultValue={value === '' ? '' : value}
      aria-label={label}
      onKeyDown={ed.keys}
      onBlur={(e) => ed.commit(e.currentTarget)}
    />
  )
}

/** Lookup / picklist: click → the list; picking an option saves at once; clicking away closes it unchanged. */
export function InlineSelect({
  value,
  display,
  options,
  label,
  disabled,
  saving,
  allowEmpty = true,
  loading,
  tone,
  onSave,
}: {
  value: string
  display: ReactNode
  options: Option[]
  label: string
  disabled?: boolean
  saving?: boolean
  allowEmpty?: boolean
  loading?: boolean
  tone?: string
  onSave: (id: string) => void
}) {
  const [on, setOn] = useState(false)
  const lock = useCellLock(on)
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (!on) return
    // the list was closed without a choice (Esc / click outside): leave the editor unchanged
    const el = ref.current
    const close = () => setOn(false)
    el?.addEventListener(DISMISS, close)
    ref.current?.focus()
    if (el) openSelectList(el)
    return () => el?.removeEventListener(DISMISS, close)
  }, [on])
  const shown = display ? <span className={tone ? `gc-cell-tone gc-cell-tone--${tone}` : undefined}>{display}</span> : empty
  if (disabled) return <span className="gc-cell-static">{shown}</span>
  if (!on)
    return (
      <View label={label} saving={saving} onEdit={(el) => (lock(el), setOn(true))}>
        {shown}
      </View>
    )
  const current = typeof display === 'string' ? display : value
  const picked = options.find((o) => o.id === value)?.label ?? current
  // The editor is the same bordered box as the value, with the name wrapping inside the cell (never cut off, never
  // covered by the next column); the real list sits invisibly on top of it, so a click opens the normal picker
  return (
    <span className="gc-cell-pick">
      <span className="gc-cell-pick__text" aria-hidden="true">
        {picked || (loading ? 'Loading…' : '—')}
      </span>
      <select
        ref={ref}
        className="gc-cell-input gc-cell-select gc-cell-pick__select"
        value={value}
        aria-label={label}
        onKeyDown={(e) => e.key === 'Escape' && setOn(false)}
        onBlur={(e) => !inList(e.relatedTarget) && setOn(false)}
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
    </span>
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
export function InlineStartsAfter({
  after,
  unit,
  label,
  disabled,
  saving,
  onSave,
}: {
  after: number
  unit: string
  label: string
  disabled?: boolean
  saving?: boolean
  onSave: (after: number, unit: string) => void
}) {
  const [on, setOn] = useState(false)
  const lock = useCellLock(on)
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
      <View label={label} saving={saving} onEdit={(el) => (lock(el), setOn(true))}>
        {text || empty}
      </View>
    )
  return (
    <span
      ref={box}
      className="gc-inline-pair"
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && !inList(e.relatedTarget) && commit()}
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
