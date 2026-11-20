import { useMemo, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { COST_ANALYSIS_PAGE, CRM } from '@/config/zoho'
import { EditProjectForm } from '@/features/console/EditProjectForm'
import type { Nav } from '@/features/console/ConsoleApp'
import { Chip, ErrorPanel, SectionSkeleton } from '@/features/console/ui'
import { ProjectHeader } from '@/features/console/ProjectHeader'
import { useCostingLines, usePaymentMilestones, usePlanMilestones, useProcurement, useProject, useProjectDetails, useRefreshProject, useRisks, useTasks } from '@/features/projects/api'
import { isComplete, severityOf } from '@/features/risk/calc'
import { useDataSource } from '@/lib/data/DataSourceProvider'
import { NotFoundError } from '@/lib/data/zohoSource'
import { queryKeys } from '@/lib/query-keys'
import { dash, formatDate, formatMoney, statusKey } from '@/lib/utils'
import type { Project, ProjectDetails } from '@/types/domain'
import { buildBoq, buildMilestones, dueText, health, localToday, progress } from './model'
import { Pipeline } from './Pipeline'
import { ProjectTabs } from './ProjectTabs'

export interface ProjectData {
  project: Project
  details: ProjectDetails
}

/** Project Widget. Opened with ?project_id=<Project ID>; anything else shows "Project not found" — never a default project. */
export function ProjectPage({ projectId, nav }: { projectId: string; nav: Nav }) {
  const valid = /^\d{1,25}$/.test(projectId)
  return valid ? <ValidProject projectId={projectId} nav={nav} /> : <NotFound onHome={nav.home} reason="The link has no valid Project ID." />
}

function NotFound({ onHome, reason }: { onHome: () => void; reason: string }) {
  return (
    <main className="gc-main">
      <div className="gc-panel gc-notice gc-notfound" role="alert">
        <strong>Project not found</strong>
        <span className="gc-soft">{reason}</span>
        <button type="button" className="gc-btn gc-btn--primary" onClick={onHome}>
          ← Back to Project Search
        </button>
      </div>
    </main>
  )
}

function ValidProject({ projectId, nav }: { projectId: string; nav: Nav }) {
  const onHome = nav.home
  const project = useProject(projectId)
  const details = useProjectDetails(projectId)
  const refresh = useRefreshProject(projectId)
  const refreshing = useIsFetching({ queryKey: queryKeys.projects.detail(projectId) }) > 0
  const [editing, setEditing] = useState(false)

  const notFound = project.error instanceof NotFoundError || details.error instanceof NotFoundError
  if (notFound) return <NotFound onHome={onHome} reason="It may have been deleted, or you may not have access to it." />
  const error = project.error ?? details.error
  return (
    <main className="gc-main">
      <ProjectHeader
        project={project.data}
        user={details.data?.user}
        onHome={onHome}
        onRefresh={() => refresh()}
        refreshing={refreshing}
        actions={project.data && details.data && <HeaderActions project={project.data} details={details.data} onEdit={() => setEditing(true)} />}
      />
      {error ? (
        <ErrorPanel error={error} onRetry={() => refresh()} />
      ) : !project.data || !details.data ? (
        <SectionSkeleton label="Loading project" />
      ) : (
        <Loaded project={project.data} details={details.data} nav={nav} />
      )}
      {editing && project.data && <EditProjectForm projectId={projectId} title={project.data.name || project.data.reference} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </main>
  )
}

function HeaderActions({ project, details, onEdit }: { project: Project; details: ProjectDetails; onEdit: () => void }) {
  const ds = useDataSource()
  const est = project.acceptedEstimate
  return (
    <>
      {details.crmDealId ? (
        <a className="gc-btn" href={CRM.dealUrl(details.crmDealId)} target="_blank" rel="noopener noreferrer" title="Open the deal in Zoho CRM (new tab)">
          View Deal in CRM ↗
        </a>
      ) : (
        <button type="button" className="gc-btn" disabled title="No CRM deal on the accepted estimate (Estimate → Deal Name)">
          View Deal in CRM ↗
        </button>
      )}
      {est && (
        <button
          type="button"
          className="gc-btn"
          onClick={() => ds.navigate(`#Page:${COST_ANALYSIS_PAGE.name}?quo_id=${est.id}&act_ion=${COST_ANALYSIS_PAGE.fromProjectAction}${project.id}`)}
          title="Open the linked Estimate (Cost Analysis)"
        >
          View Estimate · {est.label}
        </button>
      )}
      {details.canEdit && (
        <button type="button" className="gc-btn gc-btn--primary" onClick={onEdit}>
          Edit Project
        </button>
      )}
    </>
  )
}

function Loaded({ project, details, nav }: ProjectData & { nav: Nav }) {
  const today = localToday()
  const tasks = useTasks(project)
  const lines = useCostingLines(project)
  const procurement = useProcurement(project)
  const payments = usePaymentMilestones(project)
  const risks = useRisks(project.id)
  const planMilestones = usePlanMilestones(project)
  // Always opens on Overview (the last tab is not remembered)
  const [tab, setTab] = useState('overview')
  const chooseTab = (t: string) => setTab(t)

  const boq = useMemo(
    () =>
      procurement.boq.data && lines.data && procurement.orders.data && procurement.poLines.data
        ? buildBoq(procurement.boq.data, lines.data, procurement.orders.data, procurement.poLines.data)
        : undefined,
    [procurement.boq.data, lines.data, procurement.orders.data, procurement.poLines.data],
  )
  const milestones = useMemo(
    () => (tasks.data && planMilestones.data ? buildMilestones(planMilestones.data, tasks.data, project.startDate, today) : undefined),
    [planMilestones.data, tasks.data, project.startDate, today],
  )
  // Finished = "Completed" or any later lifecycle stage, or Cancelled — no "days left / overdue" then
  const lifecycle = details.stages.filter((s) => !s.anytime).map((s) => statusKey(s.label))
  const at = lifecycle.indexOf(statusKey(project.status))
  const completedAt = lifecycle.indexOf('completed')
  const closed = (completedAt >= 0 && at >= completedAt) || statusKey(project.status) === 'cancelled'
  const status = project.status
  const criticalOpen = risks.data?.filter((r) => !isComplete(r) && severityOf(r) === 'Critical').length ?? 0
  const healthText = milestones ? health(milestones, criticalOpen) : undefined
  const due = dueText(project.completionDate, today, closed)
  const contact = details.contacts[0]
  const done = tasks.data && milestones ? progress(tasks.data, milestones, today) : undefined

  return (
    <div className="gc-stack">
      {!details.canEdit && (
        <div className="gc-panel gc-notice gc-readonly" role="status">
          <strong>View only</strong>
          <span className="gc-small">{details.editReason || 'You can view this project but not change it.'}</span>
        </div>
      )}
      <section className="gc-panel gc-head gc-head--compact" aria-label="Project details">
        <div className="gc-head__top">
          <div className="gc-head__title">
            <span className="gc-eyebrow">Project · {dash(project.reference)}</span>
            <h1 className="gc-h1">{dash(project.name)}</h1>
          </div>
          <div className="gc-head__badges">
            <Chip tone="info">{dash(status)}</Chip>
            {healthText && <Chip tone={healthText === 'At Risk' ? 'serious' : 'good'}>Health: {healthText}</Chip>}
          </div>
        </div>
        <dl className="gc-head__grid">
          <Fact label="Customer" value={dash(details.customer?.name)} sub={contact ? [contact.name, contact.mobile || contact.phone || contact.email].filter(Boolean).join(' · ') : undefined} />
          <Fact label="Project owner" value={details.owner?.name || 'Not assigned'} />
          <Fact label="Start date" value={formatDate(project.startDate)} />
          <Fact
            label="End date"
            value={
              <>
                {formatDate(project.completionDate)}
                {due && <span className={`gc-small ${due.startsWith('Overdue') ? 'gc-danger' : 'gc-soft'}`}> · {due}</span>}
              </>
            }
            note={project.startDate && project.completionDate && project.completionDate < project.startDate ? 'End date is before the start date' : undefined}
          />
          <Fact label="Contract value" value={boq ? (boq.rows.some((r) => r.rate !== null) ? formatMoney(boq.total, project.currency) : '—') : '…'} />
          <Fact label="Site address" value={dash(details.customer?.address)} />
        </dl>
        <Pipeline project={project} details={details} progress={done} />
      </section>

      <ProjectTabs
        tab={tab}
        onTab={chooseTab}
        project={project}
        details={details}
        today={today}
        queries={{ tasks, lines, procurement, payments, risks, planMilestones }}
        boq={boq}
        milestones={milestones}
        nav={nav}
      />
    </div>
  )
}

function Fact({ label, value, sub, note }: { label: string; value: React.ReactNode; sub?: string; note?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value}
        {sub && <span className="gc-small gc-soft gc-block">{sub}</span>}
        {note && <span className="gc-small gc-danger gc-block">⚠ {note}</span>}
      </dd>
    </div>
  )
}
