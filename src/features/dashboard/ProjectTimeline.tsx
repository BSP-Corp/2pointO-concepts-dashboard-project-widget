import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatDate, formatMoney } from '@/lib/utils'
import type { TimelineEvent } from '@/types/domain'

/** One project row of the timeline: its Start Date → Project Completion Date bar and its dated events. */
export interface TimelineRow {
  id: string
  label: string
  sub: string
  start: string
  end: string
  /** 0–100: tasks completed */
  progress: number
  atRisk: boolean
  details: string[]
  events: TimelineEvent[]
  onOpen: () => void
}

type Scale = 'day' | 'month' | 'year'
/** Pixels per day of each view */
const PX: Record<Scale, number> = { day: 34, month: 4.2, year: 0.75 }
const DAY = 86_400_000
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** Marker look per event type (legend, marker, tooltip line) */
const KIND: Record<TimelineEvent['type'], { label: string; cls: string }> = {
  milestone: { label: 'Milestone', cls: 'ms' },
  task: { label: 'Task completed', cls: 'task' },
  po: { label: 'Purchase order', cls: 'po' },
  dn: { label: 'Delivery note', cls: 'dn' },
  status: { label: 'Status change', cls: 'status' },
}

const milestoneState = (e: TimelineEvent, today: string) => (e.done ? 'done' : e.date < today ? 'late' : 'open')

/** One tooltip line per event: what, when, who and the record's own values. */
function describe(e: TimelineEvent, today: string): ReactNode {
  const who = e.by ? ` · ${e.by}` : ''
  switch (e.type) {
    case 'milestone': {
      const state = milestoneState(e, today)
      return (
        <>
          <strong>{e.name || 'Milestone'}</strong> {e.no ? `(${e.no})` : ''} · {e.start ? `${formatDate(e.start)} → ` : ''}
          {formatDate(e.date)}
          {who}
          {` · ${e.status || 'No status'}`}
          {state === 'late' ? ' · Delayed' : state === 'done' ? ' · Completed' : ''}
        </>
      )
    }
    case 'task':
      return (
        <>
          <strong>{e.name}</strong> completed {formatDate(e.date)}
          {who}
        </>
      )
    case 'po':
      return (
        <>
          <strong>{e.name}</strong> · {formatDate(e.date)}
          {e.vendor ? ` · ${e.vendor}` : ''}
          {e.total ? ` · ${formatMoney(e.total)}` : ''}
          {e.by ? ` · issued by ${e.by}` : ''}
          {e.status ? ` · ${e.status}` : ''}
        </>
      )
    case 'dn':
      return (
        <>
          <strong>{e.name}</strong> · {formatDate(e.date)}
          {e.status ? ` · ${e.status}` : ''}
          {e.by ? ` · received by ${e.by}` : ''}
          {e.total ? ` · ${formatMoney(e.total)}` : ''}
        </>
      )
    default:
      return (
        <>
          → <strong>{e.name}</strong> · {formatDate(e.date)}
          {who}
        </>
      )
  }
}

interface Tip {
  x: number
  y: number
  title: string
  lines: ReactNode[]
}

/**
 * Dashboard Timelines: a Gantt of the active / on-hold projects with Day, Month and Year views. Each project shows its
 * Start Date → Project Completion Date bar (fill = tasks completed) and, below it, its milestones (planned span, diamond at
 * the end: green done, red delayed, violet open), completed tasks, purchase orders, delivery notes and status changes on
 * their dates. Hovering (or focusing) a bar or marker shows the dates, records and responsible users of that day. The
 * timeline scrolls on its own (names stay put); ◀ ▶ and Today move it.
 */
export function ProjectTimeline({ rows, today }: { rows: TimelineRow[]; today: string }) {
  const [scale, setScale] = useState<Scale>('day')
  const [tip, setTip] = useState<Tip | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)

  const dated = rows.filter((r) => r.start && r.end && r.end >= r.start)
  const missing = rows.length - dated.length
  const range = useMemo(() => {
    const all = dated.flatMap((r) => [r.start, r.end, ...r.events.flatMap((e) => [e.date, e.start ?? ''])]).filter(Boolean)
    all.push(today)
    const lo = new Date(Math.min(...all.map(ms)))
    const hi = new Date(Math.max(...all.map(ms)))
    // whole months (day / month view) or whole years (year view), with a little room on both sides
    const from = scale === 'year' ? Date.UTC(lo.getUTCFullYear(), 0, 1) : Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth() - 1, 1)
    const to = scale === 'year' ? Date.UTC(hi.getUTCFullYear() + 1, 0, 1) : Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 2, 1)
    return { from, to, days: Math.round((to - from) / DAY) }
  }, [dated, today, scale])
  const px = PX[scale]
  const width = Math.max(range.days * px, 400)
  const x = (d: string) => ((ms(d) - range.from) / DAY) * px

  // Axis: a major band (months / years) over minor ticks (days / months / quarters)
  const axis = useMemo(() => {
    const major: { label: string; left: number; width: number }[] = []
    const minor: { label: string; left: number; width: number; weekend?: boolean }[] = []
    const d = new Date(range.from)
    if (scale === 'year') {
      for (let y = d.getUTCFullYear(); Date.UTC(y, 0, 1) < range.to; y++) {
        const a = (Date.UTC(y, 0, 1) - range.from) / DAY
        const b = (Date.UTC(y + 1, 0, 1) - range.from) / DAY
        major.push({ label: String(y), left: a * px, width: (b - a) * px })
        for (let q = 0; q < 4; q++) {
          const qa = (Date.UTC(y, q * 3, 1) - range.from) / DAY
          const qb = (Date.UTC(y, q * 3 + 3, 1) - range.from) / DAY
          minor.push({ label: `Q${q + 1}`, left: qa * px, width: (qb - qa) * px })
        }
      }
    } else {
      for (let t = range.from; t < range.to; ) {
        const m = new Date(t)
        const next = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1)
        const a = (t - range.from) / DAY
        const b = (next - range.from) / DAY
        if (scale === 'month') {
          if (m.getUTCMonth() === 0 || major.length === 0) major.push({ label: String(m.getUTCFullYear()), left: a * px, width: 0 })
          minor.push({ label: MON[m.getUTCMonth()], left: a * px, width: (b - a) * px })
        } else {
          major.push({ label: `${MON[m.getUTCMonth()]} ${m.getUTCFullYear()}`, left: a * px, width: (b - a) * px })
          for (let k = t; k < next; k += DAY) {
            const day = new Date(k)
            minor.push({ label: String(day.getUTCDate()), left: ((k - range.from) / DAY) * px, width: px, weekend: day.getUTCDay() === 0 || day.getUTCDay() === 6 })
          }
        }
        t = next
      }
      if (scale === 'month') major.forEach((m, i) => (m.width = (major[i + 1]?.left ?? range.days * px) - m.left))
    }
    return { major, minor }
  }, [range, scale, px])

  // Open on today (and keep today in view when the scale changes)
  useLayoutEffect(() => {
    const box = scroller.current
    if (box) box.scrollLeft = Math.max(0, x(today) - box.clientWidth * 0.4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, range.from])
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const hide = () => setTip(null)
    box.addEventListener('scroll', hide, { passive: true })
    return () => box.removeEventListener('scroll', hide)
  }, [])

  if (dated.length === 0) return <div className="gc-empty">No project with a start and completion date</div>

  const move = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.6, behavior: 'smooth' })
  const toToday = () => {
    const box = scroller.current
    box?.scrollTo({ left: Math.max(0, x(today) - box.clientWidth * 0.4), behavior: 'smooth' })
  }
  const show = (el: HTMLElement, title: string, lines: ReactNode[]) => {
    const host = frame.current!.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    // centred under the bar / marker, kept inside the panel
    const half = Math.min(190, host.width / 2)
    setTip({ x: Math.min(Math.max(r.left - host.left + r.width / 2, half), host.width - half), y: r.bottom - host.top + 6, title, lines })
  }
  const hover = (title: string, lines: ReactNode[]) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget, title, lines),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget, title, lines),
    onBlur: () => setTip(null),
  })

  return (
    <div className="gc-tl" ref={frame}>
      <div className="gc-tl__bar">
        <span className="gc-seg" role="radiogroup" aria-label="Timeline scale">
          {(['day', 'month', 'year'] as Scale[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scale === s} className={scale === s ? 'is-on' : ''} onClick={() => setScale(s)}>
              {s === 'day' ? 'Day' : s === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </span>
        <span className="gc-tl__nav">
          <button type="button" className="gc-btn gc-btn--sm" onClick={() => move(-1)} aria-label="Scroll timeline back">
            ◀
          </button>
          <button type="button" className="gc-btn gc-btn--sm" onClick={toToday}>
            Today
          </button>
          <button type="button" className="gc-btn gc-btn--sm" onClick={() => move(1)} aria-label="Scroll timeline forward">
            ▶
          </button>
        </span>
        <ul className="gc-tl__legend" aria-label="Legend">
          <li>
            <i className="gc-tl__swatch gc-tl__swatch--bar" /> Project (fill = tasks done)
          </li>
          <li>
            <i className="gc-tl__mk gc-tl__mk--ms is-open" /> Milestone
          </li>
          <li>
            <i className="gc-tl__mk gc-tl__mk--ms is-done" /> done
          </li>
          <li>
            <i className="gc-tl__mk gc-tl__mk--ms is-late" /> delayed
          </li>
          {(['task', 'po', 'dn', 'status'] as const).map((k) => (
            <li key={k}>
              <i className={`gc-tl__mk gc-tl__mk--${KIND[k].cls}`} /> {KIND[k].label}
            </li>
          ))}
        </ul>
      </div>

      <div className="gc-tl__scroll" ref={scroller} role="region" aria-label="Project timeline — scroll sideways" tabIndex={0}>
        <div className="gc-tl__grid" style={{ width: width + 232 }}>
          <div className="gc-tl__head">
            <div className="gc-tl__corner">Project</div>
            <div className="gc-tl__axis" style={{ width }}>
              <div className="gc-tl__major">
                {axis.major.map((m) => (
                  <span key={`${m.label}-${m.left}`} style={{ left: m.left, width: m.width }}>
                    <em>{m.label}</em>
                  </span>
                ))}
              </div>
              <div className={`gc-tl__minor gc-tl__minor--${scale}`}>
                {axis.minor.map((m) => (
                  <span key={m.left} className={m.weekend ? 'is-weekend' : ''} style={{ left: m.left, width: m.width }}>
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {dated.map((r) => {
            const left = x(r.start)
            const w = Math.max(px, x(r.end) + px - left)
            const byDay = new Map<string, TimelineEvent[]>()
            for (const e of r.events.filter((e) => e.type !== 'milestone')) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
            const milestones = r.events.filter((e) => e.type === 'milestone')
            return (
              <div key={r.id} className="gc-tl__row">
                <div className="gc-tl__label">
                  <button type="button" className="gc-link" onClick={r.onOpen}>
                    {r.label}
                  </button>
                  <span className="gc-small gc-soft">{r.sub}</span>
                </div>
                <div className="gc-tl__track" style={{ width }}>
                  {scale === 'day' &&
                    axis.minor
                      .filter((m) => m.weekend)
                      .map((m) => <i key={m.left} className="gc-tl__weekend" style={{ left: m.left, width: m.width }} />)}
                  <button
                    type="button"
                    className={`gc-tl__span ${r.atRisk ? 'is-risk' : ''}`}
                    style={{ left, width: w }}
                    onClick={r.onOpen}
                    aria-label={`${r.label}: ${formatDate(r.start)} to ${formatDate(r.end)}, ${Math.round(r.progress)}% of tasks done`}
                    {...hover(r.label, [`${formatDate(r.start)} → ${formatDate(r.end)}`, ...r.details])}
                  >
                    <span className="gc-tl__fill" style={{ width: `${Math.min(100, Math.max(0, r.progress))}%` }} />
                    <span className="gc-tl__pct">{Math.round(r.progress)}%</span>
                  </button>
                  {milestones.map((e, i) => {
                    const state = milestoneState(e, today)
                    const a = e.start && e.start <= e.date ? x(e.start) : x(e.date)
                    return (
                      <span key={`m${i}`}>
                        <i className={`gc-tl__msspan is-${state}`} style={{ left: a, width: Math.max(2, x(e.date) + px - a) }} aria-hidden="true" />
                        <button
                          type="button"
                          className={`gc-tl__mk gc-tl__mk--ms is-${state} gc-tl__at`}
                          style={{ left: x(e.date) + px / 2 }}
                          aria-label={`Milestone ${e.name}, ${formatDate(e.date)}`}
                          {...hover(`${r.label} · Milestone`, [describe(e, today)])}
                        />
                      </span>
                    )
                  })}
                  {[...byDay.entries()].map(([d, list]) => {
                    const first = list[0]
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`gc-tl__mk gc-tl__mk--${KIND[first.type].cls} gc-tl__at gc-tl__at--low ${list.length > 1 ? 'gc-tl__mk--multi' : ''}`}
                        style={{ left: x(d) + px / 2 }}
                        aria-label={`${formatDate(d)}: ${list.map((e) => `${KIND[e.type].label} ${e.name}`).join(', ')}`}
                        {...hover(
                          `${r.label} · ${formatDate(d)}`,
                          list.map((e, i) => (
                            <span key={i}>
                              <i className={`gc-tl__mk gc-tl__mk--${KIND[e.type].cls} gc-tl__mk--inline`} /> {KIND[e.type].label}: {describe(e, today)}
                            </span>
                          )),
                        )}
                      >
                        {list.length > 1 && <b>{list.length}</b>}
                      </button>
                    )
                  })}
                  <b className="gc-tl__today" style={{ left: x(today) + px / 2 }} title={`Today ${formatDate(today)}`} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {missing > 0 && <p className="gc-small gc-soft">{missing} project(s) without a Start Date or Project Completion Date are not shown.</p>}
      {tip && (
        <div className="gc-tl__tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.title}</strong>
          {tip.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}
