import { useMemo, useState } from 'react'
import { LOOKUPS } from '@/config/projectForm'
import { Chip, Disclosure, Empty, ErrorPanel, Panel } from '@/features/console/ui'
import { useOptions, useUpdateAssetLine, useUpdateProject, useUpdateTask } from '@/features/projects/api'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate, formatQty, sortByOrder } from '@/lib/utils'
import type { CostingLine, WorkTask } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
import { isDelayed, isTaskList, lineDelivered, lineInTransit, unlinkedAssets } from '../model'
import { InlineDate } from '../InlineDate'
import { InlineCheck, InlineSelect, InlineText } from '../InlineCells'
import { TASK_STATUSES, TaskDialog } from '../TaskDialog'

const INSTALL_STATUSES = { key: 'installStatuses', report: '', label: '' }
const BOQ_STATUSES = { key: 'boqStatuses', report: '', label: '' }
const show = (v: string) => (v && !/^n\/?a$/i.test(v.trim()) ? v : '—')

/** Asset Register: work packages (accordions) with their tasks, subtasks and asset lines; or the flat asset list. */
export function AssetsTab(c: TabContext) {
  const lines = c.queries.lines
  const tasks = c.queries.tasks
  const [view, setView] = useState<'packages' | 'list'>('packages')
  const [open, setOpen] = useState<WorkTask | null>(null)
  // Asset lines and BOQ are required; tasks are optional here — a task error is shown, the assets still are.
  const error = lines.error ?? c.queries.procurement.boq.error
  if (error) return <ErrorPanel error={error} onRetry={() => (lines.refetch(), c.queries.procurement.boq.refetch())} />
  if (!lines.data || !c.queries.procurement.boq.data || (!tasks.data && !tasks.error)) return <div className="gc-skeleton" style={{ height: 260 }} aria-busy="true" aria-label="Loading assets" />
  const taskList = tasks.data ?? []

  return (
    <div className="gc-stack">
      <div className="gc-section-head">
        <div className="gc-segmented" role="group" aria-label="Asset view">
          <button type="button" aria-pressed={view === 'packages'} className={view === 'packages' ? 'is-on' : ''} onClick={() => setView('packages')}>
            Work packages
          </button>
          <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}>
            Asset list
          </button>
        </div>
        {c.details.canEdit && <ProjectManagerPicker c={c} />}
      </div>
      {tasks.error && <ErrorPanel error={tasks.error} onRetry={() => tasks.refetch()} />}
      {lines.data.length === 0 && taskList.length === 0 ? (
        <Empty>No records for this project</Empty>
      ) : view === 'packages' ? (
        <WorkPackages c={c} lines={lines.data} tasks={taskList} onOpen={setOpen} />
      ) : (
        <AssetList c={c} lines={lines.data} />
      )}
      {open && <TaskDialog task={open} all={taskList} team={c.details.team} projectId={c.project.id} canEdit={c.details.canEdit} order={c.details.taskOrder} plan={c.queries.planMilestones.data} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ProjectManagerPicker({ c }: { c: TabContext }) {
  const users = useOptions(LOOKUPS.users)
  const update = useUpdateProject(c.project.id)
  return (
    <label className="gc-small gc-soft gc-inline-field">
      Project Manager
      <select value={c.details.owner?.id ?? ''} disabled={update.isPending} onChange={(e) => update.mutate({ data: { Project_Manager: e.target.value } })} aria-label="Project Manager">
        <option value="">Not assigned</option>
        {c.details.owner && !users.data?.some((u) => u.id === c.details.owner!.id) && <option value={c.details.owner.id}>{c.details.owner.name}</option>}
        {users.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
      {update.error && <span className="gc-danger">{update.error.message}</span>}
    </label>
  )
}

function WorkPackages({ c, lines, tasks, onOpen }: { c: TabContext; lines: CostingLine[]; tasks: WorkTask[]; onOpen: (t: WorkTask) => void }) {
  const groups = useMemo(() => {
    const names = [...new Set([...lines.map((l) => l.workPackage || 'General'), ...tasks.filter((t) => !isTaskList(t) && t.workPackage).map((t) => t.workPackage)])]
    return names.map((name) => {
      const assets = lines.filter((l) => (l.workPackage || 'General') === name)
      const ids = new Set(assets.map((a) => a.id))
      const own = tasks.filter((t) => !isTaskList(t) && (t.workPackage === name || t.lineIds.some((id) => ids.has(id))))
      const top = own.filter((t) => !own.some((p) => p.id === t.parent?.id))
      return { name, assets, top, all: own }
    })
  }, [lines, tasks])
  const unassigned = tasks.filter((t) => !isTaskList(t) && !groups.some((g) => g.all.includes(t)))

  return (
    <div className="gc-disclosures">
      {groups.map((g) => (
        <Disclosure
          key={g.name}
          defaultOpen={groups.length === 1}
          header={
            <span className="gc-acc__row">
              <strong className="gc-wrap">{g.name}</strong>
              <span className="gc-soft">{g.assets.length} assets</span>
              <span className="gc-soft">{g.assets.filter(lineDelivered).length} delivered</span>
              <span className="gc-soft">{g.all.length} tasks</span>
            </span>
          }
        >
          <TaskTable c={c} tasks={g.top} all={tasks} onOpen={onOpen} />
          <AssetTable c={c} lines={g.assets} />
        </Disclosure>
      ))}
      {unassigned.length > 0 && (
        <Disclosure header={<span className="gc-acc__row"><strong>Tasks without a work package</strong><span className="gc-soft">{unassigned.length} tasks</span></span>}>
          <TaskTable c={c} tasks={unassigned} all={tasks} onOpen={onOpen} />
        </Disclosure>
      )}
    </div>
  )
}

/** Tasks with their subtasks (Parent_Task) — inline start / due / status / priority; click the name for the popup. */
function TaskTable({ c, tasks, all, onOpen }: { c: TabContext; tasks: WorkTask[]; all: WorkTask[]; onOpen: (t: WorkTask) => void }) {
  const rows = tasks.flatMap((t) => [{ t, depth: 0 }, ...all.filter((s) => s.parent?.id === t.id && !isTaskList(s)).map((s) => ({ t: s, depth: 1 }))])
  if (rows.length === 0) return <p className="gc-small gc-soft">No tasks for this work package.</p>
  return (
    <div className="gc-table-wrap">
      <table className="gc-table gc-table--compact">
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
            <InlineTaskRow key={t.id} c={c} t={t} depth={depth} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InlineTaskRow({ c, t, depth, onOpen }: { c: TabContext; t: WorkTask; depth: number; onOpen: (t: WorkTask) => void }) {
  const update = useUpdateTask(c.project.id)
  const statuses = useOptions(TASK_STATUSES, c.details.canEdit)
  const save = (data: Record<string, unknown>) => update.mutate({ taskId: t.id, data })
  const edit = c.details.canEdit
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
        {update.error && <span className="gc-small gc-danger gc-block">{update.error.message}</span>}
      </td>
      <td>
        <InlineDate
          value={t.startDate}
          max={t.endDate}
          label={`${t.name} start date`}
          disabled={!edit}
          saving={update.isPending}
          onSave={(v) => update.mutate({ taskId: t.id, data: { Task_Start_Date: toCreatorDate(v) }, optimistic: { startDate: v } })}
        />
        {edit && t.endDate && t.startDate > t.endDate && <span className="gc-small gc-danger gc-block">After the due date</span>}
      </td>
      <td>
        <InlineDate
          value={t.endDate}
          min={t.startDate}
          label={`${t.name} end date`}
          disabled={!edit}
          saving={update.isPending}
          onSave={(v) => update.mutate({ taskId: t.id, data: { Task_End_Date: toCreatorDate(v) }, optimistic: { endDate: v } })}
        />
      </td>
      <td>
        {edit ? (
          <select value={t.status?.id ?? ''} onChange={(e) => save({ Task_Status: e.target.value })} aria-label={`${t.name} status`}>
            <option value="">—</option>
            {t.status && !statuses.data?.some((s) => s.id === t.status!.id) && <option value={t.status.id}>{t.status.label}</option>}
            {sortByOrder(statuses.data ?? [], c.details.taskOrder).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          t.status?.label || '—'
        )}
      </td>
      <td>
        {edit ? (
          <select value={t.priority} onChange={(e) => save({ Priority: e.target.value })} aria-label={`${t.name} priority`}>
            <option value="">—</option>
            {['Low', 'Medium', 'High'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        ) : (
          t.priority || '—'
        )}
      </td>
      <td className="gc-wrap">{t.owners.map((o) => o.label).join(', ') || '—'}</td>
    </tr>
  )
}

/** Saves one Costing_Lineitem field from the list (Project Execution / Asset & Network sections), optimistic. */
function useLineSave(c: TabContext) {
  const update = useUpdateAssetLine(c.project.id)
  const save = (l: CostingLine, field: string, value: unknown, optimistic: Partial<CostingLine>) => update.mutate({ lineId: l.id, data: { [field]: value }, optimistic })
  return { update, save }
}
const lineName = (l: CostingLine) => [l.brand, l.model].filter(Boolean).join(' ') || l.description || 'Asset'

function AssetTable({ c, lines }: { c: TabContext; lines: CostingLine[] }) {
  const edit = c.details.canEdit
  const statuses = useOptions(INSTALL_STATUSES, edit)
  const deliveries = useOptions(BOQ_STATUSES, edit)
  const { update, save } = useLineSave(c)
  if (lines.length === 0) return null
  return (
    <div className="gc-table-wrap">
      <table className="gc-table gc-table--compact">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            <th scope="col" className="gc-num">Qty</th>
            <th scope="col">Serial #</th>
            <th scope="col">Delivery</th>
            <th scope="col">Installation</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="gc-wrap">{lineName(l)}</td>
              <td className="gc-num">{formatQty(l.quantity)}</td>
              <td>
                <InlineText value={show(l.serialNumber) === '—' ? '' : l.serialNumber} label={`Serial number of ${lineName(l)}`} disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Serial_Number', v, { serialNumber: v })} />
              </td>
              <td>
                <InlineSelect
                  value={deliveries.data?.find((x) => x.label === l.deliveryStatus)?.id ?? ''}
                  display={l.deliveryStatus}
                  tone={lineDelivered(l) ? 'good' : lineInTransit(l) ? 'info' : undefined}
                  options={sortByOrder(deliveries.data ?? [], c.details.boqOrder)}
                  loading={deliveries.isLoading}
                  label={`Delivery status of ${lineName(l)}`}
                  disabled={!edit}
                  saving={update.isPending}
                  onSave={(v) => save(l, 'Delivery_Status', v, { deliveryStatus: deliveries.data?.find((x) => x.id === v)?.label ?? '' })}
                />
              </td>
              <td>
                <InlineSelect
                  value={statuses.data?.find((x) => x.label === l.installationStatus)?.id ?? ''}
                  display={l.installationStatus}
                  options={statuses.data ?? []}
                  loading={statuses.isLoading}
                  label={`Installation status of ${l.model || l.description}`}
                  disabled={!edit}
                  saving={update.isPending}
                  onSave={(v) => save(l, 'Installation_Status', v, { installationStatus: statuses.data?.find((x) => x.id === v)?.label ?? '' })}
                />
              </td>
              <td>
                <InlineText value={l.notes} label={`Notes of ${lineName(l)}`} wide disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Notes', v, { notes: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {update.error && <p className="gc-small gc-danger">{update.error.message}</p>}
    </div>
  )
}

/** Asset & Network Details fields (Costing_Lineitem) edited from the asset list: [field link name, label, key]. */
const NETWORK_TEXT: [string, string, keyof CostingLine][] = [
  ['MAC_Address_Control', 'MAC (control)', 'macControl'],
  ['MAC_Address_Dante', 'MAC (Dante)', 'macDante'],
  ['IP_Address', 'IP address', 'ipAddress'],
  ['Subnet_Mask', 'Subnet mask', 'subnetMask'],
  ['Gateway', 'Gateway', 'gateway'],
  ['Host_Name', 'Host name', 'hostName'],
  ['VLAN', 'VLAN', 'vlan'],
  ['Switch_Ref', 'Switch ref', 'switchRef'],
  ['Port_No', 'Port no', 'portNo'],
  ['POE', 'PoE', 'poe'],
  ['DNS_Server_1', 'DNS 1', 'dns1'],
  ['DNS_Server_2', 'DNS 2', 'dns2'],
  ['Provision', 'Provision', 'provision'],
  ['Outlet_GOP_No', 'Outlet / GOP no', 'outletGop'],
]

/** Flat asset list with the checks the DS allows (no Asset Tag / delivered-date field exists on Costing_Lineitem). */
function AssetList({ c, lines }: { c: TabContext; lines: CostingLine[] }) {
  const edit = c.details.canEdit
  const { update, save } = useLineSave(c)
  const boq = c.queries.procurement.boq.data!
  const boqOf = (id: string) => boq.find((b) => b.lineIds.includes(id))
  const unlinked = new Set(unlinkedAssets(lines, boq).map((l) => l.id))
  const serials = lines.map((l) => l.serialNumber.trim()).filter((s) => s && !/^n\/?a$/i.test(s))
  const dupes = new Set(serials.filter((s, i) => serials.indexOf(s) !== i))
  return (
    <Panel title="Asset list" flush actions={<span className="gc-small gc-soft">Serial, warranty, network and notes save to the asset record as you change them · BOQ / procurement data is read-only</span>}>
      <div className="gc-table-wrap">
        <table className="gc-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Serial number</th>
              <th scope="col">BOQ reference</th>
              <th scope="col">Location (work package)</th>
              <th scope="col">Status</th>
              <th scope="col">Delivered date / ETA</th>
              <th scope="col">Warranty start</th>
              <th scope="col">Warranty end</th>
              <th scope="col">Networked</th>
              {NETWORK_TEXT.map(([, label]) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const b = boqOf(l.id)
              const delivered = lineDelivered(l)
              const transit = lineInTransit(l)
              const date = delivered ? b?.dateDeliveredToCustomer || b?.dateDeliveredToWarehouse || '' : b?.eta || ''
              const issues = [
                unlinked.has(l.id) && 'Not linked to a BOQ line',
                dupes.has(l.serialNumber.trim()) && 'Duplicate serial number',
                delivered && !date && 'Delivered without a delivered date',
                transit && !date && 'In transit without an ETA',
              ].filter(Boolean)
              return (
                <tr key={l.id}>
                  <td className="gc-wrap">
                    <strong>{[l.brand, l.model].filter(Boolean).join(' ') || '—'}</strong>
                    <span className="gc-small gc-soft gc-block">{l.description}</span>
                    {issues.map((i) => (
                      <span key={String(i)} className="gc-small gc-danger gc-block">
                        ⚠ {i}
                      </span>
                    ))}
                  </td>
                  <td>
                    <InlineText value={show(l.serialNumber) === '—' ? '' : l.serialNumber} label={`Serial number of ${lineName(l)}`} disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Serial_Number', v, { serialNumber: v })} />
                  </td>
                  <td className="gc-wrap">{b ? `${b.sku || '—'} · ${b.description || ''}` : '—'}</td>
                  <td className="gc-wrap">{l.workPackage || '—'}</td>
                  <td>
                    {l.deliveryStatus || '—'}
                    {l.installationStatus && <span className="gc-small gc-soft gc-block">{l.installationStatus}</span>}
                  </td>
                  <td>{date ? `${delivered ? 'Delivered' : 'ETA'} ${formatDate(date)}` : '—'}</td>
                  <td>
                    <InlineDate value={l.warrantyStart} max={l.warrantyEnd} label={`Warranty start of ${lineName(l)}`} disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Warranty_Start_Date', toCreatorDate(v), { warrantyStart: v })} />
                  </td>
                  <td>
                    <InlineDate value={l.warrantyEnd} min={l.warrantyStart} label={`Warranty end of ${lineName(l)}`} disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Warranty_End_Date', toCreatorDate(v), { warrantyEnd: v })} />
                  </td>
                  <td className="gc-center">
                    <InlineCheck value={l.networked} label={`Networked: ${lineName(l)}`} disabled={!edit} onSave={(v) => save(l, 'Networked', v, { networked: v })} />
                  </td>
                  {NETWORK_TEXT.map(([field, label, key]) => (
                    <td key={field}>
                      <InlineText value={show(String(l[key] ?? '')) === '—' ? '' : String(l[key] ?? '')} label={`${label} of ${lineName(l)}`} disabled={!edit} saving={update.isPending} onSave={(v) => save(l, field, v, { [key]: v })} />
                    </td>
                  ))}
                  <td>
                    <InlineText value={l.notes} label={`Notes of ${lineName(l)}`} wide disabled={!edit} saving={update.isPending} onSave={(v) => save(l, 'Notes', v, { notes: v })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
