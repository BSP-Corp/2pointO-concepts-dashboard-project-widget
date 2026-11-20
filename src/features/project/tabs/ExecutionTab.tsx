import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ColumnPicker } from '@/features/console/ColumnPicker'
import { Chip, Empty, ErrorPanel, Panel } from '@/features/console/ui'
import { useOptions, useUpdateTask } from '@/features/projects/api'
import { buildSchedule, CORE, frozenWidth, PICK_WIDTH, scrollBoxTo, type CoreKey, type ScheduleRow } from '@/features/procurement/schedule'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate, formatQty, sortByOrder, storage } from '@/lib/utils'
import type { CostingLine, WorkTask } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
import { isDelayed, isDone, isTaskList, lineDelivered, lineInTransit, workPackageGroups, wpTag } from '../model'
import { InlineDate } from '../InlineDate'
import { InlineCheck, InlineSelect, InlineText } from '../InlineCells'
import { TASK_STATUSES, TaskDialog } from '../TaskDialog'
import { TaskTree, type TreeContext } from '../TaskTree'
import { NETWORK_TEXT, lineName, show, useLineSave } from './AssetsTab'

const INSTALL_STATUSES = { key: 'installStatuses', report: '', label: '' }
const VIEW_KEY = '2point0:wp-columns'

type View = 'boq' | 'procurement' | 'execution' | 'asset'
/** Reference: 2point0 Ops work-package register — four field groups on each line; core frozen on the left. */
const VIEWS: { key: View; label: string; band: string; ink: string; tint: string; columns: [string, number][] }[] = [
  {
    key: 'boq',
    label: 'BOQ',
    band: '#44174E',
    ink: '#FFFFFF',
    tint: '#F1EAF3',
    columns: [
      ['WP ID', 80],
      ['Qty', 64],
      ['UoM', 64],
    ],
  },
  {
    key: 'procurement',
    label: 'Procurement',
    band: '#662249',
    ink: '#FFFFFF',
    tint: '#F4E9EE',
    columns: [
      ['PO number', 112],
      ['PO date', 104],
      ['Mode', 72],
      ['ETA date', 104],
      ['Transit status', 156],
      ['Rcvd', 72],
      ['At WH', 104],
    ],
  },
  {
    key: 'execution',
    label: 'Project execution',
    band: '#A34054',
    ink: '#FFFFFF',
    tint: '#F9ECEF',
    columns: [
      ['Installation', 150],
      ['Notes', 220],
    ],
  },
  {
    key: 'asset',
    label: 'Asset & Network',
    band: '#ED9E59',
    ink: '#1B1931',
    tint: '#FFF3E8',
    columns: [['Serial number', 150], ['Warranty start', 132], ['Warranty end', 132], ['Networked', 84], ...NETWORK_TEXT.map(([, label]) => [label, 132] as [string, number])],
  },
]
const viewWidth = (v: (typeof VIEWS)[number]) => v.columns.reduce((t, [, w]) => t + w, 0) + 8 * (v.columns.length - 1) + 16
const viewColumns = (v: (typeof VIEWS)[number]) => v.columns.map(([, w]) => `${w}px`).join(' ')
const BADGES = ['#44174E', '#662249', '#A34054', '#B76A2E', '#3F5E5A', '#1B1931']

/**
 * Execution (PPT 5a / 5b / 6a): one section per work package, as the 2point0 Ops work-package register. Lines show the
 * BOQ and procurement read-only (pulled from the Procurement module), execution status and asset & network details are
 * filled in place (Costing_Lineitem). Tasks are the second level of each work package.
 */
export function ExecutionTab(c: TabContext) {
  const lines = c.queries.lines
  const tasks = c.queries.tasks
  const { orders, poLines, deliveryNotes } = c.queries.procurement
  const [pkg, setPkg] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [modes, setModes] = useState<Record<string, 'lines' | 'tasks'>>({})
  const [open, setOpen] = useState<WorkTask | null>(null)
  const [by, setBy] = useState<'line' | 'asset'>('line')
  const chooseBy = (v: 'line' | 'asset') => setBy(v)
  const saved = useMemo(() => {
    try {
      return JSON.parse(storage.get(VIEW_KEY) || 'null') as { views?: View[]; core?: CoreKey[] } | null
    } catch {
      return null
    }
  }, [])
  const [hidden, setHidden] = useState<View[]>(() => (saved?.views ?? []).filter((v) => VIEWS.some((x) => x.key === v)))
  const [hiddenCore, setHiddenCore] = useState<CoreKey[]>(() => (saved?.core ?? ['category', 'type']).filter((k) => CORE.some((x) => x.key === k)))
  const [view, setView] = useState<View | null>(() => VIEWS.find((v) => !hidden.includes(v.key))?.key ?? null)
  const boxes = useRef(new Map<string, HTMLDivElement>())

  const schedule = useMemo(
    () => (c.boq && orders.data && poLines.data && deliveryNotes.data ? buildSchedule(c.boq.rows, orders.data, poLines.data, deliveryNotes.data) : undefined),
    [c.boq, orders.data, poLines.data, deliveryNotes.data],
  )
  const groups = useMemo(() => {
    if (!lines.data) return []
    const taskList = tasks.data ?? []
    const names = [...new Set(lines.data.map((l) => l.workPackage || 'General'))]
    return names.map((name, i) => {
      const assets = lines.data!.filter((l) => (l.workPackage || 'General') === name)
      const ids = new Set(assets.map((a) => a.id))
      const own = taskList.filter((t) => !isTaskList(t) && (t.workPackage === name || wpTag(t.workPackage) === wpTag(name) || t.lineIds.some((id) => ids.has(id))))
      return { name, code: wpTag(name) || name, color: BADGES[i % BADGES.length], assets, tasks: own }
    })
  }, [lines.data, tasks.data])

  const jump = useCallback((key: View, behavior?: ScrollBehavior) => {
    setView(key)
    for (const box of boxes.current.values()) {
      const target = box.querySelector<HTMLElement>(`[data-wp-section="${key}"]`)
      if (!target) continue
      const frozen = frozenWidth(box)
      const left = Math.max(0, box.scrollLeft + target.getBoundingClientRect().left - box.getBoundingClientRect().left - frozen)
      scrollBoxTo(box, left, behavior)
    }
  }, [])
  const layout = `${hidden.join()}|${hiddenCore.join()}|${[...collapsed].join()}|${JSON.stringify(modes)}|${pkg}`
  const last = useRef(layout)
  useLayoutEffect(() => {
    if (last.current === layout) return
    last.current = layout
    if (view && !hidden.includes(view)) jump(view, 'auto')
  }, [layout, view, hidden, jump])
  const persist = (views: View[], core: CoreKey[]) => {
    setHidden(views)
    setHiddenCore(core)
    storage.set(VIEW_KEY, JSON.stringify({ views, core }))
    if (!view || views.includes(view)) setView(VIEWS.find((v) => !views.includes(v.key))?.key ?? null)
  }

  const error = lines.error ?? c.queries.procurement.boq.error
  if (error) return <ErrorPanel error={error} onRetry={() => (lines.refetch(), c.queries.procurement.boq.refetch())} />
  if (!lines.data || !schedule) return <div className="gc-skeleton" style={{ height: 260 }} aria-busy="true" aria-label="Loading work packages" />
  const rowOf = (l: CostingLine) => schedule.find((r) => r.line.lineIds.includes(l.id))
  const shown = groups.filter((g) => !pkg || g.name === pkg)
  const complete = lines.data.filter((l) => /complete|installed|done/i.test(l.installationStatus)).length
  const delivered = lines.data.filter(lineDelivered).length
  const visibleViews = VIEWS.filter((v) => !hidden.includes(v.key))
  const toggle = (name: string) => setCollapsed((s) => (s.has(name) ? new Set([...s].filter((x) => x !== name)) : new Set([...s, name])))

  return (
    <div className="gc-stack gc-wp">
      <section className="gc-pg-headcard gc-pg-headcard--flat" aria-label="Execution summary">
        <dl className="gc-pg-metrics">
          <div>
            <dt>AV packages</dt>
            <dd>{groups.length}</dd>
          </div>
          <div>
            <dt>Lines complete</dt>
            <dd>
              {complete} / {lines.data.length}
            </dd>
            <span className="gc-pg-meter" aria-hidden="true">
              <i style={{ width: `${lines.data.length ? (complete / lines.data.length) * 100 : 0}%` }} />
            </span>
          </div>
          <div>
            <dt>Delivered to site</dt>
            <dd>
              {delivered} / {lines.data.length}
            </dd>
          </div>
          <div>
            <dt>BOQ source</dt>
            <dd>
              <span className={`gc-pg-pill gc-pg-pill--${c.project.acceptedEstimate ? 'moving' : 'action'}`}>
                {c.project.acceptedEstimate ? `Approved quote ${c.project.acceptedEstimate.label}` : 'No approved quote'}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <div className="gc-pg-bar">
        <div className="gc-seg gc-exec-by" role="radiogroup" aria-label="Show execution by">
          <button type="button" role="radio" aria-checked={by === 'line'} className={by === 'line' ? 'is-on' : ''} onClick={() => chooseBy('line')}>
            Asset
          </button>
          <button type="button" role="radio" aria-checked={by === 'asset'} className={by === 'asset' ? 'is-on' : ''} onClick={() => chooseBy('asset')}>
            Task
          </button>
        </div>
        {by === 'line' && (
          <>
            <button type="button" className={`gc-pg-chip ${!pkg ? 'is-on' : ''}`} onClick={() => setPkg('')}>
              All packages
            </button>
            <label className="gc-pg-select">
              <select value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Filter by work package">
                <option value="">Jump to package…</option>
                {groups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {by === 'asset' ? (
        <WorkPackageTasks c={c} onOpen={setOpen} />
      ) : (
        <>
          <nav className="gc-pg-nav gc-pg-nav--card" aria-label="Work package column bookmarks">
            <div className="gc-pg-marks" role="group" aria-label="Field groups">
              {visibleViews.map((v) => (
                <button key={v.key} type="button" className={`gc-pg-mark ${view === v.key ? 'is-on' : ''}`} aria-current={view === v.key ? 'location' : undefined} onClick={() => jump(v.key)}>
                  <i style={{ background: v.band }} />
                  {v.label}
                </button>
              ))}
            </div>
            <div className="gc-pg-showset" role="group" aria-label="Show field groups">
              <span>Show sections:</span>
              {VIEWS.map((v) => (
                <label key={v.key}>
                  <input
                    type="checkbox"
                    className="gc-pg-check"
                    checked={!hidden.includes(v.key)}
                    aria-label={`Show ${v.label} section`}
                    onChange={(e) => persist(e.target.checked ? hidden.filter((k) => k !== v.key) : [...hidden, v.key], hiddenCore)}
                  />
                  {v.label} <span className="gc-muted">({v.columns.length})</span>
                </label>
              ))}
            </div>
            <div className="gc-pg-showset" role="group" aria-label="Show core columns">
              <span>Show core:</span>
              {CORE.map((k) => (
                <label key={k.key}>
                  <input
                    type="checkbox"
                    className="gc-pg-check"
                    checked={!hiddenCore.includes(k.key)}
                    aria-label={`Show ${k.label} column`}
                    onChange={(e) => persist(hidden, e.target.checked ? hiddenCore.filter((x) => x !== k.key) : [...hiddenCore, k.key])}
                  />
                  {k.label}
                </label>
              ))}
            </div>
          </nav>

          {lines.data.length === 0 ? (
            <Empty>No work packages — they come from the approved Cost Analysis lines.</Empty>
          ) : (
            shown.map((g) => {
              const done = g.assets.filter((l) => /complete|installed|done/i.test(l.installationStatus)).length
              const isOpen = !collapsed.has(g.name)
              const mode = modes[g.name] ?? 'lines'
              return (
                <section key={g.name} className="gc-wp-pack" aria-label={g.name}>
                  <header className="gc-wp-pack__head">
                    <span className="gc-wp-badge" style={{ background: g.color }}>
                      {g.code}
                    </span>
                    <strong className="gc-wp-pack__name">{g.name}</strong>
                    <span className="gc-soft gc-small">({g.assets.length} lines)</span>
                    <span className="gc-grow" />
                    <span className="gc-small gc-soft">
                      {done}/{g.assets.length} complete
                    </span>
                    {g.assets.filter(lineInTransit).length > 0 && <span className="gc-pg-pill gc-pg-pill--moving">{g.assets.filter(lineInTransit).length} in transit</span>}
                    {g.tasks.filter((t) => isDelayed(t, c.today)).length > 0 && (
                      <span className="gc-pg-pill gc-pg-pill--action">{g.tasks.filter((t) => isDelayed(t, c.today)).length} delayed tasks</span>
                    )}
                    <span className="gc-pg-meter gc-pg-meter--sm" aria-hidden="true">
                      <i style={{ width: `${g.assets.length ? (done / g.assets.length) * 100 : 0}%` }} />
                    </span>
                    <div className="gc-seg" role="radiogroup" aria-label={`${g.code} view`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={mode === 'lines'}
                        className={mode === 'lines' ? 'is-on' : ''}
                        onClick={() => (setModes((m) => ({ ...m, [g.name]: 'lines' })), !isOpen && toggle(g.name))}
                      >
                        Lines
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={mode === 'tasks'}
                        className={mode === 'tasks' ? 'is-on' : ''}
                        onClick={() => (setModes((m) => ({ ...m, [g.name]: 'tasks' })), !isOpen && toggle(g.name))}
                      >
                        Tasks {g.tasks.length}
                      </button>
                    </div>
                    <button type="button" className="gc-pg-btn" aria-expanded={isOpen} onClick={() => toggle(g.name)}>
                      {isOpen ? '▾ Collapse' : '▸ Expand'}
                    </button>
                  </header>
                  {isOpen && mode === 'lines' && (
                    <LinesGrid
                      c={c}
                      lines={g.assets}
                      rowOf={rowOf}
                      hidden={hidden}
                      hiddenCore={hiddenCore}
                      columnPicker={
                        <ColumnPicker
                          label="Show or hide execution columns"
                          columns={EXEC_COLUMNS}
                          hidden={hiddenCore.filter((k) => EXEC_COLUMNS.some((x) => x.key === k))}
                          onChange={(h) => persist(hidden, [...hiddenCore.filter((k) => !EXEC_COLUMNS.some((x) => x.key === k)), ...(h as CoreKey[])])}
                        />
                      }
                      boxRef={(el) => {
                        if (el) boxes.current.set(g.name, el)
                        else boxes.current.delete(g.name)
                      }}
                    />
                  )}
                  {isOpen && mode === 'tasks' && <TaskTable c={c} tasks={g.tasks} onOpen={setOpen} />}
                </section>
              )
            })
          )}
          <p className="gc-small gc-soft">BOQ and procurement fields are read-only here — they are managed in Procurement. Execution and asset fields save to the line as you change them.</p>
        </>
      )}
      {open && tasks.data && (
        <TaskDialog
          task={open}
          all={tasks.data}
          team={c.details.team}
          projectId={c.project.id}
          canEdit={c.details.canEdit}
          order={c.details.taskOrder}
          plan={c.queries.planMilestones.data}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

/** Eye icon on the work package lines: the item columns users switch off most */
const EXEC_COLUMNS: { key: CoreKey; label: string }[] = (['vendor', 'brand', 'model', 'sku', 'description'] as CoreKey[]).map((key) => ({ key, label: CORE.find((c) => c.key === key)!.label }))

function LinesGrid({
  c,
  lines,
  rowOf,
  hidden,
  hiddenCore,
  columnPicker,
  boxRef,
}: {
  c: TabContext
  lines: CostingLine[]
  rowOf: (l: CostingLine) => ScheduleRow | undefined
  hidden: View[]
  hiddenCore: CoreKey[]
  columnPicker?: ReactNode
  boxRef: (el: HTMLDivElement | null) => void
}) {
  const core = CORE.filter((k) => !hiddenCore.includes(k.key))
  const grid = { gridTemplateColumns: [...core.map((k) => `var(--pg-core-${k.key})`), ...VIEWS.filter((v) => !hidden.includes(v.key)).map((v) => `${viewWidth(v)}px`)].join(' ') || `${PICK_WIDTH}px` }
  const style = { ...Object.fromEntries(CORE.map((k) => [`--pg-core-${k.key}`, k.width])), ...grid } as CSSProperties
  const left = (i: number) =>
    i === 0
      ? '0px'
      : `calc(${core
          .slice(0, i)
          .map((k) => `var(--pg-core-${k.key})`)
          .join(' + ')})`
  const display = (key: View) => (hidden.includes(key) ? { display: 'none' } : undefined)
  return (
    <div ref={boxRef} className="gc-pg-scroll gc-pg-scroll--wp" role="region" aria-label="Work package lines — scroll sideways or use the bookmarks" tabIndex={0} style={style}>
      <div role="table" className="gc-pg-table">
        <div role="rowgroup" className="gc-pg-head" style={grid}>
          <div role="row" className="gc-pg-contents">
            {core.length > 0 && (
              <div role="columnheader" className="gc-pg-band gc-pg-band--core" data-pg-frozen="" style={{ gridColumn: `span ${core.length}`, background: '#1B1931', color: '#fff' }}>
                {columnPicker}
                <span className="gc-pg-band__text" title="Core data">
                  Core data
                </span>
              </div>
            )}
            {VIEWS.map((v) => (
              <div key={v.key} role="columnheader" className="gc-pg-band" data-wp-section={v.key} style={{ background: v.band, color: v.ink, ...display(v.key) }}>
                {v.label}
              </div>
            ))}
          </div>
          <div role="row" className="gc-pg-contents">
            {core.map((k, i) => (
              <div key={k.key} role="columnheader" className={`gc-pg-label gc-pg-sticky ${i === core.length - 1 ? 'gc-pg-edge' : ''}`} style={{ left: left(i), background: '#EEEDF2' }}>
                {k.label}
              </div>
            ))}
            {VIEWS.map((v) => (
              <div key={v.key} role="columnheader" className="gc-pg-labels" style={{ gridTemplateColumns: viewColumns(v), background: v.tint, ...display(v.key) }}>
                {v.columns.map(([label]) => (
                  <span key={label} title={label}>
                    {label}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup">
          {lines.map((l) => (
            <LineRow key={l.id} c={c} l={l} r={rowOf(l)} core={core} left={left} grid={grid} display={display} />
          ))}
        </div>
      </div>
    </div>
  )
}

function LineRow({
  c,
  l,
  r,
  core,
  left,
  grid,
  display,
}: {
  c: TabContext
  l: CostingLine
  r?: ScheduleRow
  core: typeof CORE
  left: (i: number) => string
  grid: CSSProperties
  display: (k: View) => CSSProperties | undefined
}) {
  const edit = c.details.canEdit
  const installs = useOptions(INSTALL_STATUSES, edit)
  const { update, save } = useLineSave(c)
  const name = lineName(l)
  const order = r?.orders[0]
  const po = r?.poLines.find((p) => p.lineId === l.id) ?? r?.poLines[0]
  const values: Record<CoreKey, string> = { vendor: l.vendor, category: l.category, type: l.type, brand: l.brand, model: l.model, sku: l.sku, description: l.description }
  const cells: Record<View, ReactNode> = {
    boq: (
      <>
        <Ro mono>{wpTag(l.workPackage)}</Ro>
        <Ro mono right>
          {formatQty(l.quantity)}
        </Ro>
        <Ro>{l.uom}</Ro>
      </>
    ),
    procurement: (
      <>
        <Ro mono>{order?.poNo}</Ro>
        <Ro mono>{order?.date ? formatDate(order.date) : ''}</Ro>
        <Ro>{r?.line.modeOfTransit}</Ro>
        <Ro mono>{r?.line.eta ? formatDate(r.line.eta) : ''}</Ro>
        <Ro>{r ? r.line.status || (r.ordered ? 'Ordered' : 'Not ordered') : ''}</Ro>
        <Ro mono right>
          {po ? formatQty(po.quantityReceived) : ''}
        </Ro>
        <Ro mono>{r?.line.dateDeliveredToWarehouse ? formatDate(r.line.dateDeliveredToWarehouse) : ''}</Ro>
      </>
    ),
    execution: (
      <>
        <Box>
          <InlineSelect
            value={installs.data?.find((x) => x.label === l.installationStatus)?.id ?? ''}
            display={l.installationStatus}
            options={installs.data ?? []}
            loading={installs.isLoading}
            label={`Installation status of ${name}`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => save(l, 'Installation_Status', v, { installationStatus: installs.data?.find((x) => x.id === v)?.label ?? '' })}
          />
        </Box>
        <Box>
          <InlineText value={l.notes} label={`Notes of ${name}`} disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Notes', v, { notes: v })} />
        </Box>
      </>
    ),
    asset: (
      <>
        <Box>
          <InlineText
            value={show(l.serialNumber) === '—' ? '' : l.serialNumber}
            label={`Serial number of ${name}`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => save(l, 'Serial_Number', v, { serialNumber: v })}
          />
        </Box>
        <Box>
          <InlineDate
            value={l.warrantyStart}
            max={l.warrantyEnd}
            label={`Warranty start of ${name}`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => save(l, 'Warranty_Start_Date', toCreatorDate(v), { warrantyStart: v })}
          />
        </Box>
        <Box>
          <InlineDate
            value={l.warrantyEnd}
            min={l.warrantyStart}
            label={`Warranty end of ${name}`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => save(l, 'Warranty_End_Date', toCreatorDate(v), { warrantyEnd: v })}
          />
        </Box>
        <Box>
          <InlineCheck value={l.networked} label={`Networked: ${name}`} disabled={!edit} onSave={(v) => save(l, 'Networked', v, { networked: v })} />
        </Box>
        {NETWORK_TEXT.map(([field, label, key]) => (
          <Box key={field}>
            <InlineText
              value={show(String(l[key] ?? '')) === '—' ? '' : String(l[key] ?? '')}
              label={`${label} of ${name}`}
              disabled={!edit}
              saving={update.isPending}
              onSave={(v) => save(l, field, v, { [key]: v })}
            />
          </Box>
        ))}
      </>
    ),
  }
  return (
    <div role="row" className="gc-pg-row" style={grid} aria-label={name}>
      {core.map((k, i) => (
        <div
          key={k.key}
          role="cell"
          aria-label={k.label}
          className={`gc-pg-sticky gc-pg-corecell ${i === core.length - 1 ? 'gc-pg-edge' : ''} ${k.key === 'model' ? 'gc-pg-model' : ''}`}
          style={{ left: left(i) }}
        >
          <span className="gc-pg-text" title={values[k.key] || '—'}>
            {values[k.key] || <span className="gc-muted">—</span>}
          </span>
        </div>
      ))}
      {VIEWS.map((v) => (
        <div key={v.key} role="cell" aria-label={v.label} className="gc-pg-cells" style={{ gridTemplateColumns: viewColumns(v), ...display(v.key) }}>
          {cells[v.key]}
        </div>
      ))}
    </div>
  )
}

function Ro({ children, mono, right }: { children?: ReactNode; mono?: boolean; right?: boolean }) {
  const empty = children === undefined || children === null || children === ''
  return (
    <span className={`gc-pg-cell ${mono ? 'gc-pg-mono' : ''} ${right ? 'gc-pg-right' : ''}`} title={typeof children === 'string' ? children : undefined}>
      {empty ? <span className="gc-muted">—</span> : children}
    </span>
  )
}
const Box = ({ children }: { children: ReactNode }) => <span className="gc-pg-box">{children}</span>

/** Second level of a work package: its tasks and subtasks — inline start / due / status; the name opens the side panel. */
function TaskTable({ c, tasks, onOpen }: { c: TabContext; tasks: WorkTask[]; onOpen: (t: WorkTask) => void }) {
  const top = tasks.filter((t) => !tasks.some((p) => p.id === t.parent?.id))
  const rows = top.flatMap((t) => [{ t, depth: 0 }, ...tasks.filter((s) => s.parent?.id === t.id).map((s) => ({ t: s, depth: 1 }))])
  if (rows.length === 0) return <p className="gc-small gc-soft gc-wp-empty">No tasks for this work package.</p>
  return (
    <div className="gc-table-wrap">
      <table className="gc-table gc-table--compact gc-wp-tasks">
        <colgroup>
          <col />
          <col style={{ width: 128 }} />
          <col style={{ width: 128 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 180 }} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Start</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assigned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, depth }) => (
            <TaskRow key={t.id} c={c} t={t} depth={depth} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskRow({ c, t, depth, onOpen }: { c: TabContext; t: WorkTask; depth: number; onOpen: (t: WorkTask) => void }) {
  const update = useUpdateTask(c.project.id)
  const statuses = useOptions(TASK_STATUSES, c.details.canEdit)
  const edit = c.details.canEdit
  const options = sortByOrder(statuses.data ?? [], c.details.taskOrder)
  return (
    <tr>
      <td className="gc-wrap" style={{ paddingLeft: 10 + depth * 18 }}>
        <button type="button" className="gc-link" onClick={() => onOpen(t)}>
          {depth ? '↳ ' : ''}
          {t.name}
        </button>
        {isDelayed(t, c.today) && (
          <>
            {' '}
            <Chip tone="serious">Delayed</Chip>
          </>
        )}
      </td>
      <td>
        <span className="gc-pg-box">
          <InlineDate
            value={t.startDate}
            max={t.endDate}
            label={`${t.name} start date`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => update.mutate({ taskId: t.id, data: { Task_Start_Date: toCreatorDate(v) }, optimistic: { startDate: v } })}
          />
        </span>
      </td>
      <td>
        <span className="gc-pg-box">
          <InlineDate
            value={t.endDate}
            min={t.startDate}
            label={`${t.name} end date`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => update.mutate({ taskId: t.id, data: { Task_End_Date: toCreatorDate(v) }, optimistic: { endDate: v } })}
          />
        </span>
      </td>
      <td>
        <span className="gc-pg-box">
          <InlineSelect
            value={t.status?.id ?? ''}
            display={t.status?.label ?? ''}
            tone={isDone(t) ? 'pg-done' : isDelayed(t, c.today) ? 'pg-action' : undefined}
            options={options}
            loading={statuses.isLoading}
            label={`${t.name} status`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => update.mutate({ taskId: t.id, data: { Task_Status: v }, optimistic: { status: v ? { id: v, label: options.find((o) => o.id === v)?.label ?? '' } : null } })}
          />
        </span>
      </td>
      <td>
        <span className="gc-pg-box">
          <InlineSelect
            value={t.priority}
            display={t.priority}
            options={['Low', 'Medium', 'High'].map((p) => ({ id: p, label: p }))}
            label={`${t.name} priority`}
            disabled={!edit}
            saving={update.isPending}
            onSave={(v) => update.mutate({ taskId: t.id, data: { Priority: v }, optimistic: { priority: v } })}
          />
        </span>
      </td>
      <td className="gc-wrap">{t.owners.map((o) => o.label).join(', ') || '—'}</td>
    </tr>
  )
}

/**
 * Execution → Asset: the Work Package Task section — one group per work package root (Type "Work Package", no parent:
 * "AV01 | Area_System Name"), its tasks and sub-tasks under it by Parent_Task, whatever milestone they are in.
 * Projects from before the milestone set-up have no work package roots: their top tasks with a work package are listed.
 */
function WorkPackageTasks({ c, onOpen }: { c: TabContext; onOpen: (t: WorkTask) => void }) {
  const tasks = c.queries.tasks
  if (tasks.error) return <ErrorPanel error={tasks.error} onRetry={() => tasks.refetch()} />
  if (!tasks.data) return <div className="gc-skeleton" style={{ height: 200 }} aria-busy="true" aria-label="Loading work package tasks" />
  const all = tasks.data
  const groups = workPackageGroups(all)
  // One block per work package (AV01, AV02…): its task groups (First Fix, Second Fix…) with their tasks
  const byPackage = new Map<string, WorkTask[]>()
  for (const g of groups) {
    const key = g.root.workPackage.trim() || 'No work package'
    byPackage.set(key, [...(byPackage.get(key) ?? []), g.root])
  }
  const legacy = groups.length ? [] : all.filter((t) => !t.parent && t.workPackage.trim()).sort((a, b) => a.workPackage.localeCompare(b.workPackage) || a.name.localeCompare(b.name))
  const taskCount = groups.reduce((n, g) => n + g.tasks.length, 0) + legacy.length
  const packages = byPackage.size || new Set(legacy.map((t) => t.workPackage.trim())).size
  const ctx: TreeContext = { projectId: c.project.id, all, canEdit: c.details.canEdit, order: c.details.taskOrder, today: c.today, onOpen, plan: c.queries.planMilestones.data }
  return (
    <Panel title={`Work Package Task (${packages} work package${packages === 1 ? '' : 's'}, ${taskCount} task${taskCount === 1 ? '' : 's'})`} flush>
      {groups.length === 0 && legacy.length === 0 ? (
        <Empty>No work package tasks in this project yet.</Empty>
      ) : legacy.length ? (
        <TaskTree roots={legacy} ctx={ctx} label="Work Package Task" />
      ) : (
        [...byPackage].map(([name, roots], i) => (
          <section key={name} className="gc-wp-tasks" aria-label={name}>
            <header className="gc-wp-tasks__head">
              <span className="gc-wp-badge" style={{ background: BADGES[i % BADGES.length] }}>
                {wpTag(name) || name}
              </span>
              <strong>{name}</strong>
              <span className="gc-small gc-soft">
                {roots.length} group{roots.length === 1 ? '' : 's'} · {groups.filter((g) => roots.includes(g.root)).reduce((n, g) => n + g.tasks.length, 0)} tasks
              </span>
            </header>
            <TaskTree packages={roots} ctx={ctx} label={`Work Package Task ${name}`} packageTag={false} />
          </section>
        ))
      )}
    </Panel>
  )
}
