import { useEffect, useId, useRef, useState } from 'react'
import { useCreateDealEstimate, useOpenDeals } from '@/features/projects/api'
import { formatMoney } from '@/lib/utils'
import type { OpenDeal } from '@/types/domain'

/**
 * New cost analysis — CRM opportunities (Deals) that have no cost analysis yet (Quote_ID empty). Click to list them, type to
 * search by any value it shows (name, PR #, account, stage, amount); the list loads 100 at a time and fetches the next 100 when scrolled to the bottom. Choosing one asks
 * whether to create its cost analysis: Yes creates it, links it to the deal and opens it; No goes back to the list.
 */
export function DealSearch({ onCreated }: { onCreated: (estimateId: string) => void }) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [ask, setAsk] = useState<OpenDeal | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Showing the picked opportunity's name in the box must not start a new search
  const keepSearch = useRef(false)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const deals = useOpenDeals(search, open)
  const create = useCreateDealEstimate()
  const open_ = deals.data?.pages.flatMap((p) => p.deals) ?? []
  // Matching deals that already have a cost analysis (searches only): choosing one opens it
  const done = search ? (deals.data?.pages[0]?.existing ?? []) : []
  const rows = [...open_, ...done]

  // Typing searches CRM (after a short pause), from the first page again
  useEffect(() => {
    if (keepSearch.current) {
      keepSearch.current = false
      return
    }
    const t = setTimeout(() => setSearch(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])
  const searching = deals.isFetching && !deals.isFetchingNextPage && (deals.isPlaceholderData || !rows.length)
  useEffect(() => setActive(0), [search])
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && (setOpen(false), setAsk(null))
    // capture: runs before the picked row is replaced by the question (a detached row would read as a click outside)
    document.addEventListener('mousedown', close, true)
    return () => document.removeEventListener('mousedown', close, true)
  }, [])

  const loadMore = () => {
    if (deals.hasNextPage && !deals.isFetchingNextPage) deals.fetchNextPage()
  }
  const onScroll = () => {
    const el = list.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) loadMore()
  }
  const pick = (d: OpenDeal) => {
    if (d.quoteId) {
      setOpen(false)
      onCreated(d.quoteId)
      return
    }
    create.reset()
    if (d.name !== text) {
      keepSearch.current = true
      setText(d.name)
    }
    setAsk(d)
  }
  const yes = () => {
    if (!ask) return
    create.mutate(ask.id, {
      onSuccess: (res) => {
        setAsk(null)
        setOpen(false)
        onCreated(res.id)
      },
    })
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
        aria-label="Opportunity without a cost analysis"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && !ask && rows[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        title="CRM opportunities that have no cost analysis yet"
        placeholder="Search name, PR #, account, stage or amount…"
        value={text}
        onChange={(e) => (setText(e.target.value), setOpen(true), setAsk(null))}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (ask) {
            if (e.key === 'Escape') setAsk(null)
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, rows.length - 1))
            if (active >= rows.length - 3) loadMore()
          } else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
          else if (e.key === 'Enter' && open && rows[active]) (e.preventDefault(), pick(rows[active]))
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      <button type="button" className="gc-combo__chev" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => (e.preventDefault(), setOpen((o) => !o))}>
        ▾
      </button>
      {open && ask && (
        <div className="gc-combo__list gc-deal-ask" role="alertdialog" aria-label="Create cost analysis" aria-describedby={`${listId}-ask`}>
          <p id={`${listId}-ask`}>
            Cost analysis for <span className="gc-deal-ask__name">{ask.name}</span> does not exist. Do you want to create one?
          </p>
          {create.error && (
            <p className="gc-small gc-danger" role="alert">
              {create.error.message}
            </p>
          )}
          <div className="gc-deal-ask__foot">
            <button type="button" className="gc-btn gc-btn--sm" disabled={create.isPending} onClick={() => setAsk(null)}>
              No
            </button>
            <button type="button" className="gc-btn gc-btn--primary gc-btn--sm" disabled={create.isPending} onClick={yes} autoFocus>
              {create.isPending ? 'Creating…' : 'Yes'}
            </button>
          </div>
        </div>
      )}
      {open && !ask && (
        <ul className="gc-combo__list" role="listbox" id={listId} aria-label="Opportunities without a cost analysis" ref={list} onScroll={onScroll}>
          {searching && rows.length > 0 && (
            <li className="gc-combo__empty" aria-disabled="true">
              Searching…
            </li>
          )}
          {rows.length === 0 ? (
            <li className="gc-combo__empty" role="option" aria-selected="false" aria-disabled="true">
              {deals.isLoading || searching
                ? 'Loading opportunities…'
                : deals.error
                  ? `Could not read CRM: ${deals.error.message}`
                  : search
                    ? `No opportunity matches “${search}”`
                    : 'Every opportunity already has a cost analysis'}
            </li>
          ) : (
            rows.map((d, i) => [
              d.quoteId && i === open_.length && (
                <li key="done-head" className="gc-combo__group" aria-hidden="true">
                  Already has a cost analysis — click to open
                </li>
              ),
              <li
                key={d.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`gc-combo__item ${i === active ? 'is-active' : ''}`}
                title={d.quoteId ? 'Open its cost analysis' : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(ev) => (ev.preventDefault(), pick(d))}
              >
                <span className="gc-combo__top">
                  <span className="gc-deal__name">{d.name || '—'}</span>
                  {d.reference && <span className="gc-soft">{d.reference}</span>}
                  {d.quoteId && <span className="gc-chip gc-chip--good">Cost analysis exists</span>}
                </span>
                <span className="gc-small gc-soft">
                  {[d.account, d.stage].filter(Boolean).join(' · ') || '—'}
                  {d.amount ? ` · ${formatMoney(d.amount)}` : ''}
                </span>
              </li>,
            ])
          )}
          {deals.isFetchingNextPage && (
            <li className="gc-combo__empty" aria-disabled="true">
              Loading more…
            </li>
          )}
          {deals.hasNextPage && !deals.isFetchingNextPage && (
            <li className="gc-combo__empty">
              <button type="button" className="gc-link gc-small" onMouseDown={(e) => (e.preventDefault(), loadMore())}>
                Load more
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
