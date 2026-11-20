import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface PickerColumn {
  key: string
  label: string
}

const Eye = ({ off }: { off?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
)

/**
 * Eye icon in a table header: opens a small list to show / hide columns — "Show/Hide Columns" ticks or clears them all,
 * one tick per column, Done applies (Esc or a click outside leaves the columns as they were). At least one stays visible.
 */
export function ColumnPicker({ columns, hidden, onChange, label = 'Show or hide columns' }: { columns: PickerColumn[]; hidden: string[]; onChange: (hidden: string[]) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(hidden)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const anyHidden = columns.some((c) => hidden.includes(c.key))
  const allShown = draft.length === 0
  const noneShown = columns.every((c) => draft.includes(c.key))

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = button.current?.getBoundingClientRect()
      if (!r) return
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 248)), top: r.bottom + 6 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !button.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (setOpen(false), button.current?.focus())
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const toggle = (key: string, on: boolean) => setDraft((d) => (on ? d.filter((k) => k !== key) : [...d, key]))
  const done = () => {
    onChange(draft)
    setOpen(false)
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`gc-eye-btn ${anyHidden ? 'is-on' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={anyHidden ? `${label} (${columns.filter((c) => hidden.includes(c.key)).length} hidden)` : label}
        onClick={() => {
          setDraft(hidden)
          setOpen((o) => !o)
        }}
      >
        <Eye off={anyHidden} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={box} className="gc-colpick" role="dialog" aria-label={label} style={{ left: pos.left, top: pos.top }}>
            <label className="gc-colpick__all">
              <input
                type="checkbox"
                checked={allShown}
                ref={(el) => {
                  if (el) el.indeterminate = !allShown && !noneShown
                }}
                onChange={(e) => setDraft(e.target.checked ? [] : columns.map((c) => c.key))}
              />
              Show/Hide Columns
            </label>
            <div className="gc-colpick__list">
              {columns.map((c) => (
                <label key={c.key}>
                  <input type="checkbox" checked={!draft.includes(c.key)} onChange={(e) => toggle(c.key, e.target.checked)} />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="gc-colpick__foot">
              {noneShown && <span className="gc-small gc-danger">Keep at least one column</span>}
              <span className="gc-grow" />
              <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" disabled={noneShown} onClick={done}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
