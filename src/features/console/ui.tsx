import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NotConfiguredError } from '@/lib/data/types'

export function Panel({ title, actions, children, className = '', flush = false }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`gc-panel ${flush ? 'gc-panel--flush' : ''} ${className}`} aria-label={title}>
      {(title || actions) && (
        <div className="gc-panel__head">
          {title && <h2 className="gc-h2">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export type Tone = 'blue' | 'violet' | 'aqua' | 'amber' | 'rose' | 'green' | 'slate'

/** Coloured overview metric. The tone tints the tile; the value stays in text ink. */
export function Kpi({ label, value, sub, tone = 'blue', icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className={`gc-kpi gc-kpi--${tone}`}>
      <span className="gc-kpi__label">
        {icon && (
          <span className="gc-kpi__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </span>
      <span className="gc-kpi__value">{value}</span>
      {sub && <span className="gc-kpi__sub">{sub}</span>}
    </div>
  )
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.min(100, Math.max(0, value))
  return (
    <div className="gc-progress" role="progressbar" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <span className="gc-progress__fill" style={{ width: `${v}%` }} />
    </div>
  )
}

/** Accordion row: the region is rendered only while open (no height animation → no layout jank). */
export function Disclosure({ header, children, defaultOpen = false }: { header: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className="gc-disclosure">
      <button type="button" className="gc-acc" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className={`gc-chev ${open ? 'is-open' : ''}`} aria-hidden="true">
          ›
        </span>
        {header}
      </button>
      {open && (
        <div id={id} className="gc-disclosure__body">
          {children}
        </div>
      )}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="gc-skeleton" style={{ height, width }} aria-hidden="true" />
}

export function SectionSkeleton({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div className="gc-stack" aria-busy="true" aria-label={label}>
      <div className="gc-kpis">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={92} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={220} />
      ))}
    </div>
  )
}

export function ErrorPanel({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  if (error instanceof NotConfiguredError) return <NotConfigured what={error.what} />
  return (
    <div className="gc-panel gc-error" role="alert">
      <strong>Could not load data</strong>
      <span className="gc-soft gc-small">{error.message}</span>
      {onRetry && (
        <button type="button" className="gc-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="gc-panel gc-notice" role="status">
      <strong>{what} is not set up in Creator yet</strong>
      <span className="gc-soft gc-small">Create the Activity_Stream form, then paste the updated functions (see docs/ACTIVITY_STREAM.md). This section fills in automatically once they exist.</span>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="gc-empty">{children}</div>
}

/** Small pill for a Creator status / picklist value. */
export function Chip({ children, tone }: { children: ReactNode; tone?: 'good' | 'warning' | 'serious' | 'critical' | 'info' }) {
  return <span className={`gc-chip ${tone ? `gc-chip--${tone}` : ''}`}>{children}</span>
}

/** Renders a query's data, or its skeleton / error, so every section loads (and fails) on its own. */
export function Loaded<T>({
  query,
  label,
  height = 180,
  children,
}: {
  query: { data?: T; error: Error | null; refetch: () => unknown }
  label: string
  height?: number
  children: (data: T) => ReactNode
}) {
  if (query.error) return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return <div className="gc-skeleton" style={{ height }} aria-busy="true" aria-label={label} />
  return <>{children(query.data)}</>
}

/** "…" while a figure is loading, "—" when its source failed or is not configured. */
export const pending = (q: { data?: unknown; error: Error | null }) => (q.error ? '—' : '…')

export const SEVERITY_TONE: Record<string, 'good' | 'warning' | 'serious' | 'critical'> = {
  'Very Low': 'good',
  Low: 'good',
  Medium: 'warning',
  High: 'serious',
  Critical: 'critical',
}

/**
 * Centered dialog above everything (portal to <body>). While it is open the page behind is fixed (no scroll) and
 * inert (no clicks, no keyboard focus, hidden from screen readers); only the dialog receives focus and input.
 * Esc or the blurred backdrop closes it; focus returns to where it was.
 */
export function Modal({ title, onClose, children, wide = false, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const id = useId()
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const unlock = lockBackground()
    head.current?.focus() // once on open — never on re-render, or typing in a field would lose focus
    return unlock
  }, [])
  return createPortal(
    <div className={`gc-modal-backdrop ${className}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <div className={`gc-modal ${wide ? 'gc-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="gc-modal__head">
          <h2 id={id} className="gc-h2" tabIndex={-1} ref={head}>
            {title}
          </h2>
          <button type="button" className="gc-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="gc-modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Fixed side panel (PPT: inline editing, side panels instead of pop-ups). Slides in from the left or right edge, freezes
 * the page behind it (no background scroll) and scrolls inside; Esc, ✕ or a click on the shade closes it unless `busy`.
 */
export function SidePanel({
  title,
  subtitle,
  side = 'left',
  busy = false,
  onClose,
  footer,
  children,
  className = '',
}: {
  title: string
  subtitle?: ReactNode
  side?: 'left' | 'right'
  busy?: boolean
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const unlock = lockBackground()
    head.current?.focus()
    return unlock
  }, [])
  const close = () => !busy && onClose()
  return createPortal(
    <div className={`gc-side-shade gc-side-shade--${side}`} onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), close())}>
      <aside className={`gc-side gc-side--${side} ${className}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="gc-side__head">
          <div className="gc-side__title">
            <h2 id={id} className="gc-h2" tabIndex={-1} ref={head}>
              {title}
            </h2>
            {subtitle && <div className="gc-side__sub">{subtitle}</div>}
          </div>
          <button type="button" className="gc-icon-btn" onClick={close} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </header>
        <div className="gc-side__body">{children}</div>
        {footer && <footer className="gc-side__foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}

/** Freezes the widget behind a dialog; returns the undo. Nested dialogs stack safely. */
let locks = 0
export function lockBackground() {
  const root = document.getElementById('root')
  const before = document.activeElement as HTMLElement | null
  if (locks++ === 0) {
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    root?.setAttribute('inert', '')
    root?.setAttribute('aria-hidden', 'true')
  }
  return () => {
    if (--locks === 0) {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
      root?.removeAttribute('inert')
      root?.removeAttribute('aria-hidden')
    }
    before?.focus?.()
  }
}

/** Count badge for a tab; nothing while loading or when the module is not set up. */
export const CountBadge = ({ n }: { n?: number }) => (n === undefined ? null : <span className="gc-badge">{n}</span>)

/** Section state wrapper: loading, error (Retry), empty ("No records for this project"), or content. */
export function Section<T>({
  query,
  empty,
  isEmpty,
  children,
}: {
  query: { data?: T; error: Error | null; refetch: () => unknown }
  empty?: string
  isEmpty?: (d: T) => boolean
  children: (d: T) => ReactNode
}) {
  if (query.error) return <ErrorPanel error={query.error} onRetry={() => query.refetch()} />
  if (query.data === undefined) return <div className="gc-skeleton" style={{ height: 140 }} aria-busy="true" aria-label="Loading" />
  if (isEmpty?.(query.data)) return <Empty>{empty ?? 'No records for this project'}</Empty>
  return <>{children(query.data)}</>
}

/** Logged-in user (top-right). */
export function UserChip({ name }: { name?: string }) {
  if (!name) return null
  return (
    <span className="gc-user" title={`Signed in as ${name}`}>
      <span className="gc-user__avatar" aria-hidden="true">
        {name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join('')}
      </span>
      <span className="gc-user__name">{name}</span>
    </span>
  )
}
