import { Chip, Empty, Kpi, Panel, Section } from '@/features/console/ui'
import { isComplete, severityOf } from '@/features/risk/calc'
import { formatDate, formatPct, formatQty } from '@/lib/utils'
import type { TabContext } from '../ProjectTabs'
import { deliveryByCategory, isDelayed, isDone, isTaskList, priorityTasks, progress, ratio, teamWithToday, todaysTasks } from '../model'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '—'

/** Overview: what is the priority work, how much is on site, what is planned today, who is working. */
export function OverviewTab(c: TabContext) {
  const { tasks, risks } = c.queries
  const t = tasks.data
  const p = t && c.milestones ? progress(t, c.milestones, c.today) : undefined
  const today = t ? todaysTasks(t, c.today) : []
  const team = teamWithToday(c.details.team, today)
  const cats = c.boq ? deliveryByCategory(c.boq.rows) : undefined
  const totals = cats?.reduce((a, x) => ({ total: a.total + x.total, delivered: a.delivered + x.delivered, inTransit: a.inTransit + x.inTransit, notOrdered: a.notOrdered + x.notOrdered }), { total: 0, delivered: 0, inTransit: 0, notOrdered: 0 })
  const next = c.milestones?.find((m) => m.state !== 'Completed')

  return (
    <div className="gc-stack">
      <div className="gc-kpis">
        <Kpi tone="blue" label="Overall progress" value={p ? formatPct(p.actual === null ? null : p.actual / 100) : '…'} sub={p ? `Planned ${formatPct(p.planned === null ? null : p.planned / 100)} by today` : undefined} />
        <Kpi tone="green" label="Assets delivered" value={totals ? (totals.total ? `${formatQty(totals.delivered)} / ${formatQty(totals.total)}` : '—') : '…'} sub={totals ? `${formatQty(totals.inTransit)} ordered / in transit` : undefined} />
        <Kpi
          tone="violet"
          label="Tasks planned today"
          value={t ? today.length : '…'}
          sub={t ? `${t.filter((x) => !isTaskList(x) && isDone(x) && x.actualEnd === c.today).length} done today · ${today.filter((x) => x.percent > 0).length} in progress` : undefined}
        />
        <Kpi
          tone="rose"
          label="Open risks"
          value={risks.data ? risks.data.filter((r) => !isComplete(r)).length : risks.error ? '—' : '…'}
          sub={risks.data ? `${risks.data.filter((r) => !isComplete(r) && severityOf(r) === 'Critical').length} critical` : risks.error ? 'Risk register unavailable' : undefined}
        />
        <Kpi tone="amber" label="Next milestone" value={c.milestones ? (next ? formatDate(next.end) : '—') : '…'} sub={next ? `${next.milestone.name}${next.state === 'Delayed' ? ' (delayed)' : ''}` : c.milestones ? 'No open milestone' : undefined} />
      </div>

      <div className="gc-grid-2">
        <Panel
          title="Priority tasks"
          actions={
            <button type="button" className="gc-link" onClick={() => c.onTab('tasks')}>
              View all tasks
            </button>
          }
        >
          <Section query={tasks} isEmpty={(d) => priorityTasks(d, c.today).length === 0} empty="No high-priority or delayed open tasks">
            {(d) => (
              <ul className="gc-rows">
                {priorityTasks(d, c.today).map((x) => (
                  <li key={x.id}>
                    <Chip tone={x.priority === 'High' ? 'critical' : 'warning'}>{x.priority || '—'}</Chip>
                    <span className="gc-rows__main">
                      <strong>{x.name}</strong>
                      <span className="gc-small gc-soft">
                        {x.owners.map((o) => o.label).join(', ') || 'Unassigned'} · Due {formatDate(x.endDate)}
                      </span>
                    </span>
                    {isDelayed(x, c.today) ? <Chip tone="serious">Delayed</Chip> : <Chip>{x.status?.label || '—'}</Chip>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Panel>

        <Panel
          title="Assets delivered to customer site"
          actions={
            <button type="button" className="gc-link" onClick={() => c.onTab('assets')}>
              Asset register
            </button>
          }
        >
          {!cats || !totals ? (
            <div className="gc-skeleton" style={{ height: 140 }} />
          ) : totals.total === 0 ? (
            <Empty>No records for this project</Empty>
          ) : (
            <div className="gc-stack gc-stack--tight">
              <div className="gc-bigstat">
                <b>{formatQty(totals.delivered)}</b> <span>/ {formatQty(totals.total)} units</span> <span className="gc-soft">{formatPct(ratio(totals.delivered, totals.total))} delivered</span>
              </div>
              <div className="gc-stack-bar gc-stack-bar--lg" role="img" aria-label={`Delivered ${totals.delivered}, ordered or in transit ${totals.inTransit}, not yet ordered ${totals.notOrdered}`}>
                <span style={{ flexGrow: totals.delivered, background: 'var(--gc-good)' }} />
                <span style={{ flexGrow: totals.inTransit, background: 'var(--gc-series-1)' }} />
                <span style={{ flexGrow: totals.notOrdered, background: 'var(--gc-track)' }} />
              </div>
              <ul className="gc-legend gc-legend--inline">
                <li>
                  <span className="gc-legend__key" style={{ background: 'var(--gc-good)' }} /> Delivered {formatQty(totals.delivered)}
                </li>
                <li>
                  <span className="gc-legend__key" style={{ background: 'var(--gc-series-1)' }} /> Ordered / in transit {formatQty(totals.inTransit)}
                </li>
                <li>
                  <span className="gc-legend__key" style={{ background: 'var(--gc-track)' }} /> Not yet ordered {formatQty(totals.notOrdered)}
                </li>
              </ul>
              {cats.map((k) => (
                <div key={k.category} className="gc-catbar">
                  <span className="gc-catbar__label">
                    <span>{k.category}</span>
                    <span className="gc-num gc-soft">
                      {formatQty(k.delivered)} / {formatQty(k.total)}
                    </span>
                  </span>
                  <span className="gc-progress">
                    <span className="gc-progress__fill" style={{ width: `${(ratio(k.delivered, k.total) ?? 0) * 100}%`, background: k.delivered >= k.total ? 'var(--gc-good)' : undefined }} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Planned for today" actions={<span className="gc-small gc-soft">{formatDate(c.today)}</span>}>
          <Section query={tasks} isEmpty={() => today.length === 0} empty="Nothing planned for today">
            {() => (
              <ul className="gc-rows">
                {today.map((x) => (
                  <li key={x.id}>
                    <span className="gc-rows__main">
                      <strong>{x.name}</strong>
                      <span className="gc-small gc-soft">
                        {x.owners.map((o) => o.label).join(', ') || 'Unassigned'} · {x.workPackage || 'No work package'} · {formatDate(x.startDate)} → {formatDate(x.endDate)}
                      </span>
                    </span>
                    <Chip tone={x.percent > 0 ? 'info' : undefined}>{x.status?.label || (x.percent > 0 ? 'In progress' : 'Planned')}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Panel>

        <Panel title="Assigned team" actions={<span className="gc-small gc-soft">{`${team.technicians} technician${team.technicians === 1 ? '' : 's'} · ${team.users} user${team.users === 1 ? '' : 's'}`}</span>}>
          {team.rows.length === 0 ? (
            <Empty>No team members on this project (Project Team grid)</Empty>
          ) : (
            <ul className="gc-rows">
              {team.rows.map((m) => (
                <li key={m.id}>
                  <span className="gc-avatar" aria-hidden="true">
                    {initials(m.name)}
                  </span>
                  <span className="gc-rows__main">
                    <strong>{m.name || '—'}</strong>
                    <span className="gc-small gc-soft">{[m.projectRole, m.role].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <Chip tone={m.technician ? 'info' : undefined}>{m.technician ? 'Technician' : 'User'}</Chip>
                  {m.onSiteToday && <Chip tone="good">On site today</Chip>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
