import { useState } from 'react'
import { ErrorPanel, Panel } from '@/features/console/ui'
import { useActivity } from '@/features/projects/api'
import type { ActivityEntry } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'

const MODULES = ['All', 'Project', 'Milestone', 'Task', 'BOQ', 'Risk'] as const
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

/**
 * Activity stream (Activity_Stream form): who changed what and when — projects, milestones, tasks, procurement lines
 * and risks. Every save made through the widget is logged by the Deluge functions.
 */
export function ActivityTab(c: TabContext) {
  const q = useActivity(c.project.id)
  const [module, setModule] = useState<(typeof MODULES)[number]>('All')
  if (q.error) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
  if (!q.data) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading activity" />
  const rows = module === 'All' ? q.data : q.data.filter((a) => a.module === module)
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
      {rows.length === 0 ? <div className="gc-empty">No activity yet — changes appear here as soon as they are saved.</div> : <ActivityList rows={rows} />}
    </Panel>
  )
}
