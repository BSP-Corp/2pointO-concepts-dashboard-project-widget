import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Chip } from '@/features/console/ui'
import { formatDate, formatMoney } from '@/lib/utils'
import type { GoToEstimate } from '@/types/domain'

/** "PR-00", "pr_00" and "PR 00" all match "PR_00…": case, dashes, underscores and spaces are ignored. */
const key = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '')

/**
 * Search by reference — estimates (Cost Analysis), latest versions. Choosing one always opens its Cost Analysis,
 * approved project or not. Keyboard: ↑ ↓ to move, Enter to open, Esc to close.
 */
export function ReferenceSearch({ estimates, loading, onPick }: { estimates?: GoToEstimate[]; loading: boolean; onPick: (e: GoToEstimate) => void }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()

  const matches = useMemo(() => {
    const q = key(text)
    if (!q || !estimates) return []
    return estimates.filter((e) => key(e.reference).includes(q) || key(e.quoteNo).includes(q)).slice(0, 8)
  }, [text, estimates])

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => setActive(0), [text])

  const pick = (e: GoToEstimate) => {
    setOpen(false)
    setText(e.reference || e.quoteNo)
    onPick(e)
  }

  return (
    <div className="gc-combo" ref={box}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        role="combobox"
        aria-label="Search by reference"
        aria-expanded={open && text.trim() !== ''}
        aria-controls={listId}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        title="Search by project reference"
        placeholder="Search by project reference"
        value={text}
        disabled={loading && !estimates}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, matches.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
          else if (e.key === 'Enter' && matches[active]) (e.preventDefault(), pick(matches[active]))
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && text.trim() !== '' && (
        <ul className="gc-combo__list" role="listbox" id={listId} aria-label="Matching references">
          {matches.length === 0 ? (
            <li className="gc-combo__empty" role="option" aria-selected="false" aria-disabled="true">
              No estimate with reference “{text}”
            </li>
          ) : (
            matches.map((e, i) => (
              <li
                key={e.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`gc-combo__item ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(ev) => (ev.preventDefault(), pick(e))}
              >
                <span className="gc-combo__top">
                  <strong>{e.reference || '—'}</strong>
                  <span className="gc-soft">
                    {e.quoteNo}
                    {e.version ? ` · ${e.version}` : ''}
                  </span>
                  {e.status && <Chip>{e.status}</Chip>}
                  {e.projectId && <Chip tone="good">Approved project</Chip>}
                </span>
                <span className="gc-small gc-soft">
                  {[e.customer, e.owner && `Owner ${e.owner}`, e.dealStage, e.country, e.date && formatDate(e.date)].filter(Boolean).join(' · ') || '—'}
                  {' · '}
                  <span className="gc-num">{formatMoney(e.total)}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
