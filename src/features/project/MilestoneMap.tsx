import { useMapTaskList } from '@/features/projects/api'
import type { PlanMilestone, WorkTask } from '@/types/domain'
import { InlineSelect } from './InlineCells'

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ')

/** "Milestone" of a task list (root task), editable from the list: saved on the Milestone records' Task_List. */
export function MilestoneMap({ list, plan, projectId, disabled }: { list: WorkTask; plan: PlanMilestone[]; projectId: string; disabled?: boolean }) {
  const map = useMapTaskList(projectId)
  const current = plan.find((m) => same(m.taskList, list.name))
  return (
    <span className="gc-map">
      <span className="gc-small gc-soft">Milestone</span>
      <InlineSelect
        value={current?.id ?? ''}
        display={current?.name ?? ''}
        options={plan.map((m) => ({ id: m.id, label: m.taskList && !same(m.taskList, list.name) ? `${m.name} (replaces ${m.taskList.trim()})` : m.name }))}
        loading={map.templates.isLoading}
        label={`${list.name} milestone`}
        disabled={disabled}
        saving={map.isPending}
        onSave={(milestoneId) => map.mutate({ listName: list.name, milestoneId, plan })}
      />
    </span>
  )
}
