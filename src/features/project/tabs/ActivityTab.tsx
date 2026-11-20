import { useMemo, useState } from 'react'
import { ErrorPanel, Panel } from '@/features/console/ui'
import { useActivity } from '@/features/projects/api'
import type { ActivityEntry } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'

const MODULES = ['All', 'Project', 'Milestone', 'Task', 'BOQ', 'Risk', 'Asset'] as const
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayTitle = (iso: string) => {
  if (!iso) return 'Undated'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y} ${WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]}`
}
const hhmm = (time: string) => {
  const [h = '0', m = '00'] = time.split(':')
  const n = Number(h)
  return `${String(n % 12 || 12).padStart(2, '0')}:${m} ${n < 12 ? 'AM' : 'PM'}`
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

/** "Task start date updated From - to 07/09/2026" / "Task updated status to Closed" (Zoho Projects wording). */
export function describe(a: ActivityEntry) {
  if (a.action === 'created') return 'created'
  if (/^status$/i.test(a.field)) return `updated status to ${a.newValue || '-'}`
  return `${a.field.toLowerCase()} updated From ${a.oldValue || '-'} to ${a.newValue || '-'}`
}

/** Day → record → changes, newest first. */
export function ActivityList({ rows, showRecord = true }: { rows: ActivityEntry[]; showRecord?: boolean }) {
  const days: { day: string; items: ActivityEntry[] }[] = []
  for (const a of rows) {
    const last = days.at(-1)
    if (last && last.day === a.at) last.items.push(a)
    else days.push({ day: a.at, items: [a] })
  }
  return (
    <ol className="gc-activity">
      {days.map((d) => (
        <li key={d.day} className="gc-activity__day">
          <span className="gc-activity__date">
            <span className="gc-activity__pin" aria-hidden="true" />
            {dayTitle(d.day)}
          </span>
          <ol>
            {d.items.map((a) => (
              <li key={a.id} className="gc-activity__item">
                <span className="gc-activity__time">{a.time ? hhmm(a.time) : '—'}</span>
                <span className="gc-activity__avatar" title={a.by} aria-hidden="true">
                  {initials(a.by)}
                </span>
                <span className="gc-activity__body">
                  {showRecord && <strong className="gc-activity__record">{a.recordName || '—'}</strong>}
                  <span>
                    <span className={`gc-activity__module gc-activity__module--${a.module.toLowerCase()}`}>{a.module}</span> {describe(a)}
                  </span>
                  <span className="gc-small gc-muted">by {a.by || '—'}</span>
                </span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

/** Words of the search, all of which must appear in the change (record, field, values, person, module, date). */
export function matchesSearch(a: ActivityEntry, search: string) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = [a.recordName, a.recordId, a.module, a.field, a.oldValue, a.newValue, a.by, a.action, dayTitle(a.at)].join(' ').toLowerCase()
  return words.every((w) => text.includes(w))
}

/**
 * Activity stream: one Activity_Stream record per project whose Activity data subform holds every change made through
 * the widget (projects, milestones, tasks, BOQ, assets, risks). Search, module, person and date filters run here.
 */
export function ActivityTab(c: TabContext) {
  const q = useActivity(c.project.id)
  const [module, setModule] = useState<(typeof MODULES)[number]>('All')
  const [search, setSearch] = useState('')
  const [person, setPerson] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const people = useMemo(() => [...new Set((q.data ?? []).map((a) => a.by).filter(Boolean))].sort(), [q.data])
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading activity" />
  const all = q.data
  const rows = all.filter((a) => (module === 'All' || a.module === module) && (!person || a.by === person) && (!from || a.at >= from) && (!to || a.at <= to) && matchesSearch(a, search))
  const filtered = rows.length !== all.length
  return (
    <Panel
      title="Activity stream"
      actions={
        <span className="gc-seg" role="group" aria-label="Module">
          {MODULES.map((m) => (
            <button key={m} type="button" className={module === m ? 'is-on' : ''} aria-pressed={module === m} onClick={() => setModule(m)}>
              {m}
            </button>
          ))}
        </span>
      }
    >
      <div className="gc-activity-filters" role="search">
        <input type="search" className="gc-input" placeholder="Search record, field, value or person…" aria-label="Search activity" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="gc-input" aria-label="Changed by" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input type="date" className="gc-input" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="gc-input" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        <span className="gc-small gc-soft" aria-live="polite">
          {filtered ? `${rows.length} of ${all.length} changes` : `${all.length} changes`}
        </span>
        {filtered && (
          <button type="button" className="gc-link gc-small" onClick={() => (setModule('All'), setSearch(''), setPerson(''), setFrom(''), setTo(''))}>
            Clear filters
          </button>
        )}
      </div>
      {all.length === 0 ? (
        <div className="gc-empty">No activity yet — changes appear here as soon as they are saved.</div>
      ) : rows.length === 0 ? (
        <div className="gc-empty">No changes match these filters.</div>
      ) : (
        <ActivityList rows={rows} />
      )}
    </Panel>
  )
}
