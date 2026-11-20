import { LOOKUPS } from '@/config/projectForm'
import { Empty, ErrorPanel, Panel } from '@/features/console/ui'
import { useOptions, useUpdateAssetLine, useUpdateProject } from '@/features/projects/api'
import { toCreatorDate } from '@/lib/data/zohoSource'
import { formatDate } from '@/lib/utils'
import type { CostingLine } from '@/types/domain'
import type { TabContext } from '../ProjectTabs'
import { lineDelivered, lineInTransit, unlinkedAssets } from '../model'
import { InlineDate } from '../InlineDate'
import { InlineCheck, InlineText } from '../InlineCells'

export const show = (v: string) => (v && !/^n\/?a$/i.test(v.trim()) ? v : '—')

/**
 * Asset Register: the flat asset list (serial, warranty, network, notes — saved to Costing_Lineitem as they change).
 * Work packages with their lines and tasks are in the Execution tab.
 */
export function AssetsTab(c: TabContext) {
  const lines = c.queries.lines
  const error = lines.error ?? c.queries.procurement.boq.error
  if (error) return <ErrorPanel error={error} onRetry={() => (lines.refetch(), c.queries.procurement.boq.refetch())} />
  if (!lines.data || !c.queries.procurement.boq.data) return <div className="gc-skeleton" style={{ height: 260 }} aria-busy="true" aria-label="Loading assets" />
  return (
    <div className="gc-stack">
      {c.details.canEdit && (
        <div className="gc-section-head">
          <span />
          <ProjectManagerPicker c={c} />
        </div>
      )}
      {lines.data.length === 0 ? <Empty>No records for this project</Empty> : <AssetList c={c} lines={lines.data} />}
    </div>
  )
}

function ProjectManagerPicker({ c }: { c: TabContext }) {
  const users = useOptions(LOOKUPS.users)
  const update = useUpdateProject(c.project.id, { inline: true })
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

/** Saves one Costing_Lineitem field from the list (Project Execution / Asset & Network sections), optimistic. */
export function useLineSave(c: TabContext) {
  const update = useUpdateAssetLine(c.project.id)
  const save = (l: CostingLine, field: string, value: unknown, optimistic: Partial<CostingLine>) => update.mutate({ lineId: l.id, data: { [field]: value }, optimistic })
  return { update, save }
}
export const lineName = (l: CostingLine) => [l.brand, l.model].filter(Boolean).join(' ') || l.description || 'Asset'

/** Asset & Network Details fields (Costing_Lineitem) edited from the asset list: [field link name, label, key]. */
export const NETWORK_TEXT: [string, string, keyof CostingLine][] = [
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
    <Panel
      title="Asset list"
      flush
      actions={<span className="gc-small gc-soft">Serial, warranty, network and notes save to the asset record as you change them · BOQ / procurement data is read-only</span>}
    >
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
                    <InlineText
                      value={show(l.serialNumber) === '—' ? '' : l.serialNumber}
                      label={`Serial number of ${lineName(l)}`}
                      disabled={!edit}
                      saving={update.isPending}
                      onSave={(v) => save(l, 'Serial_Number', v, { serialNumber: v })}
                    />
                  </td>
                  <td className="gc-wrap">{b ? `${b.sku || '—'} · ${b.description || ''}` : '—'}</td>
                  <td className="gc-wrap">{l.workPackage || '—'}</td>
                  <td>
                    {l.deliveryStatus || '—'}
                    {l.installationStatus && <span className="gc-small gc-soft gc-block">{l.installationStatus}</span>}
                  </td>
                  <td>{date ? `${delivered ? 'Delivered' : 'ETA'} ${formatDate(date)}` : '—'}</td>
                  <td>
                    <InlineDate
                      value={l.warrantyStart}
                      max={l.warrantyEnd}
                      label={`Warranty start of ${lineName(l)}`}
                      disabled={!edit}
                      saving={update.isPending}
                      onSave={(v) => save(l, 'Warranty_Start_Date', toCreatorDate(v), { warrantyStart: v })}
                    />
                  </td>
                  <td>
                    <InlineDate
                      value={l.warrantyEnd}
                      min={l.warrantyStart}
                      label={`Warranty end of ${lineName(l)}`}
                      disabled={!edit}
                      saving={update.isPending}
                      onSave={(v) => save(l, 'Warranty_End_Date', toCreatorDate(v), { warrantyEnd: v })}
                    />
                  </td>
                  <td className="gc-center">
                    <InlineCheck value={l.networked} label={`Networked: ${lineName(l)}`} disabled={!edit} onSave={(v) => save(l, 'Networked', v, { networked: v })} />
                  </td>
                  {NETWORK_TEXT.map(([field, label, key]) => (
                    <td key={field}>
                      <InlineText
                        value={show(String(l[key] ?? '')) === '—' ? '' : String(l[key] ?? '')}
                        label={`${label} of ${lineName(l)}`}
                        disabled={!edit}
                        saving={update.isPending}
                        onSave={(v) => save(l, field, v, { [key]: v })}
                      />
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
