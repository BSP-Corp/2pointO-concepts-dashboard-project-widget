import { useEffect, useRef, useState } from 'react'
import { formatDate } from '@/lib/utils'

/**
 * Date cell of a record list: shows the date as text; a click opens the date picker. Picking a date saves it at once with
 * the record ID; Esc or clicking away closes it unchanged. `min` / `max` keep the due date on or after the start date.
 */
export function InlineDate({ value, min, max, label, disabled, saving, onSave }: { value: string; min?: string; max?: string; label: string; disabled?: boolean; saving?: boolean; onSave: (iso: string) => void }) {
  const [on, setOn] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef({ value, min, max, onSave })
  latest.current = { value, min, max, onSave }
  useEffect(() => {
    const el = input.current
    if (!on || !el) return
    el.focus()
    try {
      el.showPicker?.()
    } catch {
      /* showPicker needs a user gesture in some browsers — the focused field still opens on click */
    }
    // native "change": fires once a complete date is picked or typed
    const change = () => {
      const { value: saved, min: lo, max: hi, onSave: save } = latest.current
      const v = el.value
      if (!v || v === saved || v < '1900-01-01' || (lo && v < lo) || (hi && v > hi)) return
      setOn(false)
      save(v)
    }
    el.addEventListener('change', change)
    return () => el.removeEventListener('change', change)
  }, [on])

  if (disabled) return <span className="gc-cell-static">{formatDate(value)}</span>
  if (!on)
    return (
      <button type="button" className={`gc-cell-view ${saving ? 'is-saving' : ''}`} aria-label={label} title="Click to change the date" onClick={() => setOn(true)}>
        {value ? formatDate(value) : <span className="gc-muted">—</span>}
      </button>
    )
  return <input ref={input} className="gc-cell-input gc-cell-date" type="date" defaultValue={value} min={min || undefined} max={max || undefined} aria-label={label} onKeyDown={(e) => e.key === 'Escape' && setOn(false)} onBlur={() => setOn(false)} />
}
