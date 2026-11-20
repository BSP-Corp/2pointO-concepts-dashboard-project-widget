import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Chip } from '@/features/console/ui'
import type { DashboardProject } from '@/types/domain'

const key = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '')

/**
 * Project — every project, draft and approved, in the same field and dropdown style as the opportunity search: click to
 * list them all, type to filter by reference, name or client. Choosing one opens the Project Widget. Keyboard: ↑ ↓, Enter, Esc.
 */
export function ProjectPicker({ projects, onPick }: { projects?: DashboardProject[]; onPick: (id: string) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()

  const matches = useMemo(() => {
    const q = key(text)
    return (projects ?? []).filter((p) => !q || key(p.reference).includes(q) || key(p.name).includes(q) || key(p.client).includes(q))
  }, [text, projects])

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => {
    setActive(0)
  }, [text])

  const pick = (p: DashboardProject) => {
    setOpen(false)
    setText(p.reference || p.name)
    onPick(p.id)
  }

  return (
    <div className="gc-combo" ref={box}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 7h6l2 2h10v10H3z" />
      </svg>
      <input
        type="search"
        role="combobox"
        aria-label="Project"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        title="Draft and approved projects — opens the Project Widget"
        placeholder="Find the project and cost analysis…"
        value={text}
        disabled={!projects}
        onChange={(e) => (setText(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setActive((a) => Math.min(a + 1, matches.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
          else if (e.key === 'Enter' && open && matches[active]) (e.preventDefault(), pick(matches[active]))
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      <button type="button" className="gc-combo__chev" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => (e.preventDefault(), setOpen((o) => !o))}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="gc-combo__list" role="listbox" id={listId} aria-label="Projects">
          {matches.length === 0 ? (
            <li className="gc-combo__empty" role="option" aria-selected="false" aria-disabled="true">
              {projects?.length ? `No project matches “${text}”` : 'No projects yet'}
            </li>
          ) : (
            matches.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`gc-combo__item ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(ev) => (ev.preventDefault(), pick(p))}
              >
                <span className="gc-combo__top">
                  <strong>{p.reference || '—'}</strong>
                  <span className="gc-soft">{p.name}</span>
                  {p.status && <Chip>{p.status}</Chip>}
                </span>
                <span className="gc-small gc-soft">{[p.client, p.projectManager && `PM ${p.projectManager}`].filter(Boolean).join(' · ') || '—'}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
