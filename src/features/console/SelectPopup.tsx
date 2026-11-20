import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ErrorBoundary } from './ErrorBoundary'

/** Fired on a <select> when its list is closed without a choice (Esc / click outside) — inline editors close on it. */
export const DISMISS = 'gc-dd-dismiss'
/** Marks the list, so an editor can tell that focus moved into it (not away) */
export const POPUP_ATTR = 'data-gc-dd'

interface Item {
  value: string
  label: string
  group?: string
  disabled: boolean
}
const key = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '')
const SEARCH_FROM = 8

/**
 * One dropdown style for the whole widget, the same as the project search: every <select> opens this list instead of the
 * browser's — rounded panel, hover / keyboard highlight, the chosen value ticked, and a search box once a list has more than
 * a handful of options. Opened by a click, by Space / Enter / ↑ / ↓ on a focused list, or by an inline editor (openSelectList). A choice
 * sets the <select> and fires its normal change event, so every form, inline editor and save works unchanged.
 */
let opener: ((el: HTMLSelectElement) => void) | null = null
/** Opens the widget list for a <select> (inline editors call this instead of the browser picker). False when not mounted. */
export function openSelectList(el: HTMLSelectElement) {
  if (!opener) return false
  opener(el)
  return true
}

export function SelectPopup() {
  const [target, setTarget] = useState<HTMLSelectElement | null>(null)

  useEffect(() => {
    const open = (el: HTMLSelectElement) => {
      if (el.disabled || el.multiple) return
      el.focus({ preventScroll: true })
      setTarget((t) => (t === el ? null : el))
    }
    opener = open
    const down = (e: MouseEvent) => {
      const el = e.target instanceof HTMLSelectElement ? e.target : null
      if (!el || e.button !== 0) return
      e.preventDefault()
      open(el)
    }
    const keys = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLSelectElement ? e.target : null
      if (!el || e.ctrlKey || e.metaKey) return
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'F4') {
        e.preventDefault()
        open(el)
      }
    }
    document.addEventListener('mousedown', down, true)
    document.addEventListener('keydown', keys, true)
    return () => {
      opener = null
      document.removeEventListener('mousedown', down, true)
      document.removeEventListener('keydown', keys, true)
    }
  }, [])

  // a failure in the list only closes it (the select stays usable) — it never takes the page down
  return target ? (
    <ErrorBoundary quiet onError={() => setTarget(null)}>
      <List select={target} onClose={() => setTarget(null)} />
    </ErrorBoundary>
  ) : null
}

function List({ select, onClose }: { select: HTMLSelectElement; onClose: () => void }) {
  const items: Item[] = [...select.options].map((o) => ({
    value: o.value,
    label: o.text,
    group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined,
    disabled: o.disabled,
  }))
  const [text, setText] = useState('')
  const shown = items.filter((i) => !text || key(i.label).includes(key(text)))
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      shown.findIndex((i) => i.value === select.value),
    ),
  )
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const searchable = items.length > SEARCH_FROM

  // Under the field (or above it when there is more room there); follows the field while the page or a box scrolls
  useLayoutEffect(() => {
    const place = () => {
      if (!select.isConnected) return onClose()
      const r = select.getBoundingClientRect()
      const width = Math.min(Math.max(r.width, 240), 420, window.innerWidth - 16)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      const below = window.innerHeight - r.bottom - 8
      const above = r.top - 8
      if (below >= 220 || below >= above) setPos({ left, top: r.bottom + 4, width, maxHeight: Math.max(140, Math.min(360, below - 4)) })
      else setPos({ left, bottom: window.innerHeight - r.top + 4, width, maxHeight: Math.max(140, Math.min(360, above - 4)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => (window.removeEventListener('resize', place), window.removeEventListener('scroll', place, true))
  }, [select]) // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard goes to the list (or its search box) once it is on screen
  const placed = !!pos
  useEffect(() => {
    if (placed) (searchable ? search.current : list.current)?.focus({ preventScroll: true })
  }, [placed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && e.target !== select && dismiss()
    // a value set by other code (or a test) closes the list
    const changed = () => onClose()
    document.addEventListener('mousedown', away, true)
    select.addEventListener('change', changed)
    return () => (document.removeEventListener('mousedown', away, true), select.removeEventListener('change', changed))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const typed = useRef(false)
  useEffect(() => {
    if (typed.current) setActive(0)
    typed.current = true
  }, [text])
  useEffect(() => {
    // a block body: newer browsers return a value from scrollIntoView, which must not become the effect's cleanup
    list.current?.querySelector<HTMLElement>('.is-active')?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const dismiss = () => {
    onClose()
    select.dispatchEvent(new Event(DISMISS))
    select.focus({ preventScroll: true })
  }
  const choose = (i: Item) => {
    if (i.disabled) return
    onClose()
    select.focus({ preventScroll: true })
    if (i.value === select.value) return select.dispatchEvent(new Event(DISMISS))
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, i.value)
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const step = (d: 1 | -1) => {
    for (let n = active + d; n >= 0 && n < shown.length; n += d) if (!shown[n].disabled) return setActive(n)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), step(1))
    else if (e.key === 'ArrowUp') (e.preventDefault(), step(-1))
    else if (e.key === 'Enter') (e.preventDefault(), shown[active] && choose(shown[active]))
    else if (e.key === 'Escape') (e.preventDefault(), e.stopPropagation(), dismiss())
    else if (e.key === 'Tab') dismiss()
  }
  const label = select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim() || 'Options'

  if (!pos) return null
  return createPortal(
    <div ref={box} className="gc-dd" {...{ [POPUP_ATTR]: '' }} style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }} onKeyDown={onKey}>
      {searchable && (
        <div className="gc-dd__search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input ref={search} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search…" aria-label={`Search ${label}`} />
        </div>
      )}
      <ul ref={list} className="gc-dd__list" role="listbox" aria-label={label} tabIndex={-1} style={{ maxHeight: pos.maxHeight - (searchable ? 44 : 0) }}>
        {shown.length === 0 && <li className="gc-combo__empty">No match for “{text}”</li>}
        {shown.map((i, n) => (
          <li key={`${i.value}-${n}`} className="gc-dd__row">
            {i.group && i.group !== shown[n - 1]?.group && <span className="gc-dd__group">{i.group}</span>}
            <span
              role="option"
              aria-selected={i.value === select.value}
              aria-disabled={i.disabled || undefined}
              className={`gc-combo__item gc-dd__item ${n === active ? 'is-active' : ''} ${i.value === select.value ? 'is-chosen' : ''} ${i.disabled ? 'is-disabled' : ''}`}
              onMouseEnter={() => !i.disabled && setActive(n)}
              onMouseDown={(e) => (e.preventDefault(), choose(i))}
            >
              {i.label || '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  )
}
