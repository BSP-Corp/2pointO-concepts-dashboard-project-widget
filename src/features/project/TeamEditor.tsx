import { useState } from 'react'
import { LOOKUPS, type LookupSource } from '@/config/projectForm'
import { useOptions, useUpdateProject } from '@/features/projects/api'
import type { TeamMember, TeamRowInput } from '@/types/domain'

const ROLES: LookupSource = { key: 'projectRoles', report: '', label: '' }

/**
 * Add / change / remove project team members (Project → Project Team grid: Team Member, Project Role) in one compact list.
 * Saved together through Widget.project_update (data.Project_Team = the whole team; rows left out are removed).
 */
export function TeamEditor({ projectId, team, onDone }: { projectId: string; team: TeamMember[]; onDone: () => void }) {
  const users = useOptions(LOOKUPS.users)
  const roles = useOptions(ROLES)
  const save = useUpdateProject(projectId, { inline: true })
  const [rows, setRows] = useState<TeamRowInput[]>(() => team.map((m) => ({ row_id: m.rowId, member_id: m.id, role_id: m.roleId })))
  const set = (i: number, patch: Partial<TeamRowInput>) => setRows((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x)))
  const taken = (i: number) => new Set(rows.filter((_, n) => n !== i).map((r) => r.member_id))
  const missing = rows.some((r) => !r.member_id)

  return (
    <div className="gc-team-edit">
      {rows.length === 0 && <p className="gc-small gc-soft">No team members — add one below.</p>}
      {rows.map((r, i) => (
        <div className="gc-team-edit__row" key={r.row_id || `new-${i}`}>
          <select className="gc-input gc-input-sm" aria-label={`Team member ${i + 1}`} value={r.member_id} onChange={(e) => set(i, { member_id: e.target.value })}>
            <option value="">Team member…</option>
            {users.data
              ?.filter((u) => u.id === r.member_id || !taken(i).has(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
          </select>
          <select className="gc-input gc-input-sm" aria-label={`Project role ${i + 1}`} value={r.role_id} onChange={(e) => set(i, { role_id: e.target.value })}>
            <option value="">Project role…</option>
            {roles.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="gc-icon-btn" aria-label={`Remove team member ${i + 1}`} title="Remove" onClick={() => setRows((x) => x.filter((_, n) => n !== i))}>
            ×
          </button>
        </div>
      ))}
      <div className="gc-team-edit__foot">
        <button type="button" className="gc-btn gc-btn--sm gc-btn--ghost" onClick={() => setRows((x) => [...x, { row_id: '', member_id: '', role_id: '' }])}>
          + Add member
        </button>
        <span className="gc-grow" />
        <button type="button" className="gc-btn gc-btn--sm" onClick={onDone} disabled={save.isPending}>
          Cancel
        </button>
        <button
          type="button"
          className="gc-btn gc-btn--sm gc-btn--primary"
          disabled={save.isPending || missing}
          title={missing ? 'Choose a team member on every row' : undefined}
          onClick={() => save.mutate({ data: { Project_Team: rows } }, { onSuccess: onDone })}
        >
          {save.isPending ? 'Saving…' : 'Save team'}
        </button>
      </div>
      {save.error && <span className="gc-small gc-danger gc-block">{save.error.message}</span>}
    </div>
  )
}
