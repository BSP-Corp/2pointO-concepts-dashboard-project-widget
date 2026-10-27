// Dependency-free SVG/HTML charts in the console's blue/white theme.
// Colours: categorical slots in fixed order (validated reference palette, light + dark steps in console.css),
// never cycled — past the last slot, values fold into "Other". Every mark has a hover title and the legend
// carries the values, so identity and magnitude never depend on colour alone.
import { memo, useId } from 'react'

export interface Datum {
  label: string
  value: number
}

/** Number of categorical slots defined in console.css (--gc-series-1 … --gc-series-8). */
const SLOTS = 8
const series = (i: number) => `var(--gc-series-${i + 1})`

/** Keeps the first SLOTS-1 categories and folds the rest into "Other". */
export function foldOther(data: Datum[], max = SLOTS): Datum[] {
  if (data.length <= max) return data
  const head = data.slice(0, max - 1)
  const rest = data.slice(max - 1).reduce((s, d) => s + d.value, 0)
  return [...head, { label: 'Other', value: rest }]
}

/** Donut (pie) with a centre total and a value legend. */
export const DonutChart = memo(function DonutChart({ data, format = String, centerLabel = 'Total', colors }: { data: Datum[]; format?: (n: number) => string; centerLabel?: string; colors?: string[] }) {
  const rows = foldOther(data.filter((d) => d.value > 0))
  const total = rows.reduce((s, d) => s + d.value, 0)
  const R = 52
  const C = 2 * Math.PI * R
  const GAP = rows.length > 1 ? 2 : 0 // 2px surface gap between segments
  let offset = 0
  const titleId = useId()
  if (total === 0) return <div className="gc-empty">No data yet</div>
  return (
    <div className="gc-donut">
      <svg viewBox="0 0 140 140" className="gc-donut__svg" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{rows.map((d) => `${d.label}: ${format(d.value)}`).join(', ')}</title>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--gc-track)" strokeWidth="18" />
        {rows.map((d, i) => {
          const len = (d.value / total) * C
          const seg = (
            <circle
              key={d.label}
              className="gc-donut__seg"
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={colors?.[i] ?? series(i)}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0, len - GAP)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            >
              <title>{`${d.label}: ${format(d.value)} (${Math.round((d.value / total) * 100)}%)`}</title>
            </circle>
          )
          offset += len
          return seg
        })}
        <text x="70" y="66" textAnchor="middle" className="gc-donut__total">
          {format(total)}
        </text>
        <text x="70" y="84" textAnchor="middle" className="gc-donut__caption">
          {centerLabel}
        </text>
      </svg>
      <ul className="gc-legend">
        {rows.map((d, i) => (
          <li key={d.label}>
            <span className="gc-legend__key" style={{ background: colors?.[i] ?? series(i) }} aria-hidden="true" />
            <span className="gc-legend__label">{d.label}</span>
            <span className="gc-legend__value gc-num">
              {format(d.value)} <span className="gc-muted">· {Math.round((d.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
})

export interface BarSeries {
  key: string
  label: string
}
export interface BarRow {
  label: string
  values: Record<string, number>
}

/** Horizontal grouped bars on one shared axis (no dual axes). One series = no legend box. */
export const BarChart = memo(function BarChart({ rows, series: ser, format = String }: { rows: BarRow[]; series: BarSeries[]; format?: (n: number) => string }) {
  const max = Math.max(0, ...rows.flatMap((r) => ser.map((s) => r.values[s.key] ?? 0)))
  if (rows.length === 0 || max === 0) return <div className="gc-empty">No data yet</div>
  return (
    <div className="gc-bars">
      {ser.length > 1 && (
        <ul className="gc-legend gc-legend--inline">
          {ser.map((s, i) => (
            <li key={s.key}>
              <span className="gc-legend__key" style={{ background: series(i) }} aria-hidden="true" />
              <span className="gc-legend__label">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      <table className="gc-bars__table">
        <caption className="gc-sr">{ser.map((s) => s.label).join(' and ')} by row</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="gc-bars__label gc-ellipsis" title={r.label}>
                {r.label}
              </th>
              <td className="gc-bars__track">
                {ser.map((s, i) => {
                  const v = r.values[s.key] ?? 0
                  return (
                    <span key={s.key} className="gc-bars__line">
                      <span className="gc-bars__bar" style={{ width: `${Math.max(v > 0 ? 1 : 0, (v / max) * 100)}%`, background: series(i) }} title={`${r.label} · ${s.label}: ${format(v)}`} />
                      <span className="gc-bars__value gc-num">{format(v)}</span>
                    </span>
                  )
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

/**
 * One 100% stacked bar (status distribution). Pass `order` (the shared legend's labels) so a status keeps
 * the same colour in every bar; labels outside it render as "Other" grey.
 */
export const StackedBar = memo(function StackedBar({ data, label, order }: { data: Datum[]; label: string; order: string[] }) {
  const rows = data.filter((d) => d.value > 0)
  const total = rows.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <span className="gc-muted gc-small">—</span>
  const color = (l: string) => (order.indexOf(l) >= 0 && order.indexOf(l) < SLOTS ? series(order.indexOf(l)) : 'var(--gc-other)')
  return (
    <div className="gc-stack-bar" role="img" aria-label={`${label}: ${rows.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
      {rows.map((d) => (
        <span key={d.label} style={{ flexGrow: d.value, background: color(d.label) }} title={`${d.label}: ${d.value}`} />
      ))}
    </div>
  )
})

/** Legend for a set of StackedBars sharing `order`. */
export function StatusLegend({ order }: { order: string[] }) {
  return (
    <ul className="gc-legend gc-legend--inline">
      {order.map((l, i) => (
        <li key={l}>
          <span className="gc-legend__key" style={{ background: i < SLOTS ? series(i) : 'var(--gc-other)' }} aria-hidden="true" />
          <span className="gc-legend__label">{l}</span>
        </li>
      ))}
    </ul>
  )
}

/** Half pie (semi-circle gauge): one share of a whole — completion-type metrics. */
export const GaugeChart = memo(function GaugeChart({ value, total, label, sub, color = series(0) }: { value: number; total: number; label: string; sub?: string; color?: string }) {
  const share = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
  const R = 70
  const L = Math.PI * R
  return (
    <figure className="gc-gauge" role="img" aria-label={`${label}: ${total > 0 ? Math.round(share * 100) : 0}% (${value} of ${total})`}>
      <svg viewBox="0 0 180 104" className="gc-gauge__svg" aria-hidden="true">
        <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="var(--gc-track)" strokeWidth="16" strokeLinecap="round" />
        {share > 0 && <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${share * L} ${L}`} />}
        <text x="90" y="80" textAnchor="middle" className="gc-gauge__value">
          {total > 0 ? `${Math.round(share * 100)}%` : '—'}
        </text>
      </svg>
      <figcaption>
        <strong>{label}</strong>
        <span className="gc-small gc-soft">{sub ?? `${value} of ${total}`}</span>
      </figcaption>
    </figure>
  )
})

export interface TrendSeries {
  key: string
  label: string
  values: number[]
  color?: string
}

/** Line / area chart over time (x = labels, e.g. months). Area mode fills under each line. */
function Trend({ labels, series: ser, area, format = String, highlight }: { labels: string[]; series: TrendSeries[]; area?: boolean; format?: (n: number) => string; highlight?: number }) {
  const W = 640
  const H = 220
  const P = { l: 40, r: 14, t: 14, b: 30 }
  const max = Math.max(1, ...ser.flatMap((s) => s.values))
  const nice = Math.ceil(max / 4) * 4 || 4
  const x = (i: number) => P.l + (labels.length <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (labels.length - 1))
  const y = (v: number) => H - P.b - (v / nice) * (H - P.t - P.b)
  if (labels.length === 0 || ser.every((s) => s.values.every((v) => !v))) return <div className="gc-empty">No data yet</div>
  return (
    <div className="gc-trend">
      <ul className="gc-legend gc-legend--inline">
        {ser.map((s, i) => (
          <li key={s.key}>
            <span className="gc-legend__key" style={{ background: s.color ?? series(i) }} aria-hidden="true" />
            <span className="gc-legend__label">{s.label}</span>
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="gc-trend__svg" role="img" aria-label={ser.map((s) => `${s.label}: ${s.values.map((v, i) => `${labels[i]} ${format(v)}`).join(', ')}`).join('; ')}>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line x1={P.l} x2={W - P.r} y1={y((nice / 4) * k)} y2={y((nice / 4) * k)} className="gc-trend__grid" />
            <text x={P.l - 6} y={y((nice / 4) * k) + 4} textAnchor="end" className="gc-trend__axis">
              {format((nice / 4) * k)}
            </text>
          </g>
        ))}
        {highlight !== undefined && highlight >= 0 && highlight < labels.length && <line x1={x(highlight)} x2={x(highlight)} y1={P.t} y2={H - P.b} className="gc-trend__today" />}
        {labels.map((l, i) => (
          <text key={l} x={x(i)} y={H - 10} textAnchor="middle" className="gc-trend__axis">
            {l}
          </text>
        ))}
        {ser.map((s, si) => {
          const c = s.color ?? series(si)
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
          return (
            <g key={s.key}>
              {area && <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={c} opacity={0.22} />}
              <polyline points={pts} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={c}>
                  <title>{`${s.label} · ${labels[i]}: ${format(v)}`}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
export const LineChart = memo((p: Omit<Parameters<typeof Trend>[0], 'area'>) => <Trend {...p} />)
export const AreaChart = memo((p: Omit<Parameters<typeof Trend>[0], 'area'>) => <Trend {...p} area />)

export interface GanttRow {
  id: string
  label: string
  sub?: string
  start: string
  end: string
  /** 0–100, drawn inside the bar */
  progress: number
  color: string
  onClick?: () => void
}
/** Gantt: one bar per row from start to end (ISO dates) on a shared month scale, with a "today" line. */
export function GanttChart({ rows, today }: { rows: GanttRow[]; today: string }) {
  const dated = rows.filter((r) => r.start && r.end && r.end >= r.start)
  if (dated.length === 0) return <div className="gc-empty">No project with a start and completion date</div>
  const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
  const lo = new Date(Math.min(...dated.map((r) => t(r.start)), t(today)))
  const hi = new Date(Math.max(...dated.map((r) => t(r.end)), t(today)))
  const from = Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), 1)
  const to = Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth() + 1, 1)
  const pct = (ms: number) => ((ms - from) / (to - from)) * 100
  const months: { label: string; left: number }[] = []
  for (let d = new Date(from); d.getTime() < to; d.setUTCMonth(d.getUTCMonth() + 1)) months.push({ label: d.toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }), left: pct(d.getTime()) })
  const missing = rows.length - dated.length
  return (
    <div className="gc-gantt">
      <div className="gc-gantt__head">
        <span />
        <div className="gc-gantt__scale">
          {months.map((m) => (
            <span key={m.label} style={{ left: `${m.left}%` }}>
              {m.label}
            </span>
          ))}
        </div>
      </div>
      {dated.map((r) => (
        <div key={r.id} className={`gc-gantt__row ${r.onClick ? 'is-click' : ''}`} onClick={r.onClick} role={r.onClick ? 'button' : undefined} tabIndex={r.onClick ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && r.onClick?.()} aria-label={r.onClick ? `Open ${r.label}` : undefined}>
          <span className="gc-gantt__label">
            <strong className="gc-ellipsis">{r.label}</strong>
            {r.sub && <span className="gc-small gc-soft gc-ellipsis">{r.sub}</span>}
          </span>
          <div className="gc-gantt__track">
            {months.map((m) => (
              <i key={m.label} style={{ left: `${m.left}%` }} />
            ))}
            <span className="gc-gantt__bar" style={{ left: `${pct(t(r.start))}%`, width: `${Math.max(1, pct(t(r.end) + 86_400_000) - pct(t(r.start)))}%`, ['--c' as string]: r.color }} title={`${r.label}: ${r.start} → ${r.end} · ${Math.round(r.progress)}% done`}>
              <span className="gc-gantt__fill" style={{ width: `${Math.min(100, Math.max(0, r.progress))}%` }} />
              <span className="gc-gantt__pct">{Math.round(r.progress)}%</span>
            </span>
            <b className="gc-gantt__today" style={{ left: `${pct(t(today))}%` }} title={`Today ${today}`} />
          </div>
        </div>
      ))}
      {missing > 0 && <p className="gc-small gc-soft">{missing} project(s) without a Start Date or Project Completion Date are not shown.</p>}
    </div>
  )
}

/** Pipe (pipeline) chart: stages in order as joined pipe sections, each with its count. */
export function PipeChart({ stages, unit = 'projects' }: { stages: Datum[]; unit?: string }) {
  const total = stages.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div className="gc-empty">No data yet</div>
  return (
    <ol className="gc-pipe" aria-label={`Pipeline: ${stages.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
      {stages.map((s, i) => (
        <li key={s.label} className={s.value ? 'is-on' : ''} style={{ ['--c' as string]: series(i % SLOTS) }} title={`${s.label}: ${s.value} ${unit}`}>
          <span className="gc-pipe__count">{s.value}</span>
          <span className="gc-pipe__label">{s.label}</span>
        </li>
      ))}
    </ol>
  )
}
