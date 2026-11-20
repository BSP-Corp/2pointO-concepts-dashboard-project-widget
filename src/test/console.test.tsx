import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, createQueryClient } from '@/App'
import { createMockSource, type MockSourceOptions } from '@/lib/data/mockSource'

function renderApp(opts: MockSourceOptions = {}) {
  const source = createMockSource({ latencyMs: 0, persist: false, ...opts })
  const utils = render(<App source={source} client={createQueryClient()} />)
  return { user: userEvent.setup(), source, ...utils }
}
const at = (search: string) => window.history.pushState({}, '', `/${search}`)
const kpi = (label: string) => screen.getByText(label, { selector: '.gc-kpi__label' }).closest('.gc-kpi') as HTMLElement
const tab = (name: RegExp) => screen.getByRole('tab', { name })
/** Click-to-edit cells: the value shows as a button named like the field; clicking it opens the editor (input / select). */
type Scope = Pick<typeof screen, 'findAllByRole' | 'getAllByLabelText'>
/** v1.12 required fields: a file on receipts / delivery notes, the reporting tag, and the PO's in-transit details */
const attachFile = (user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, label: string) =>
  user.upload(within(panel).getByLabelText(label), new File(['%PDF'], 'supplier-dn.pdf', { type: 'application/pdf' }))
async function applyTag(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement, of: string) {
  await user.selectOptions(within(panel).getByLabelText(`Reporting tag of the ${of}`), 'Digital Signage')
  await user.click(within(panel).getByRole('button', { name: 'Apply to all lines' }))
}
async function poExtras(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) {
  await applyTag(user, panel, 'order')
  await user.selectOptions(within(panel).getByLabelText(/^Mode of transit/), 'Sea')
  fireEvent.change(within(panel).getByLabelText(/^ETA/), { target: { value: '2099-01-15' } })
}
async function dnExtras(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) {
  await applyTag(user, panel, 'note')
  await attachFile(user, panel, 'Delivery note files')
}

async function editCell(user: ReturnType<typeof userEvent.setup>, label: string | RegExp, scope: Scope = screen, index = 0) {
  const shown = await scope.findAllByRole('button', { name: label })
  await user.click(shown[index])
  return scope.getAllByLabelText(label)[0] as HTMLInputElement & HTMLSelectElement
}
const openProject = async (opts: MockSourceOptions = {}) => {
  at('?project_id=1001')
  const r = renderApp(opts)
  await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })
  return r
}

beforeEach(() => {
  localStorage.clear()
  at('')
  document.documentElement.removeAttribute('data-theme')
})

describe('Home (Project Search Dashboard)', () => {
  it('shows portfolio metrics and opens a project with its Project ID', async () => {
    const { user, source } = renderApp()
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    // Home always opens on Overview
    expect(await screen.findByRole('region', { name: 'Completion' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    // PPT 1d: Milestones, Project Team & Core Data and Risks widgets on the fixed-height overview
    for (const w of ['Milestones', 'Project team & core data', 'Risks']) expect(screen.getByRole('region', { name: w })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Project team & core data' })).toHaveTextContent('5 assignments')
    expect(screen.getByRole('region', { name: 'Risks' })).toHaveTextContent('1 critical')
    expect(source.calls.listTasks).toBeUndefined() // aggregates only — no project records

    await user.click(screen.getByRole('tab', { name: 'Trends' }))
    expect(screen.getByRole('region', { name: 'Employees' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Projects' }))
    await user.click(screen.getByRole('button', { name: /^Open PR_26040 SIB/ }))
    expect(window.location.search).toBe('?project_id=1001')
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })).toBeInTheDocument()
  })

  it('Timelines: a Gantt with Day / Month / Year views, milestone and event markers from the project data, and hover details', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Home' })
    await user.click(await screen.findByRole('tab', { name: 'Timelines' }))
    const scale = screen.getByRole('radiogroup', { name: 'Timeline scale' })
    expect(within(scale).getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true') // opens on Day
    const timeline = screen.getByRole('region', { name: /scroll sideways/ })
    const milestone = within(timeline).getAllByRole('button', { name: /^Milestone MS3 \| Project Procurement/ })[0]
    await user.hover(milestone)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('MS3 | Project Procurement')
    expect(tip).toHaveTextContent(/Delayed/)
    // purchase orders and status changes of the project are on their dates
    expect(within(timeline).getAllByRole('button', { name: /Purchase order PO-00310/ }).length).toBeGreaterThan(0)
    expect(within(timeline).getAllByRole('button', { name: /Status change Partially Delivered/ }).length).toBeGreaterThan(0)
    await user.click(within(scale).getByRole('radio', { name: 'Month' }))
    expect(within(scale).getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(scale).getByRole('radio', { name: 'Year' }))
    expect(within(timeline).getAllByRole('button', { name: /^Milestone / }).length).toBeGreaterThan(0)
  })

  it('New cost analysis lists CRM opportunities without a cost analysis, 100 at a time with more on scroll; Yes creates one and opens it', async () => {
    const { user, source } = renderApp()
    const nav = vi.spyOn(source, 'navigate')
    const create = vi.spyOn(source, 'createDealEstimate')
    expect(screen.queryByRole('combobox', { name: /Search by reference/ })).not.toBeInTheDocument()
    const box = await screen.findByRole('combobox', { name: 'Opportunity without a cost analysis' })
    expect(box).not.toHaveAttribute('placeholder', expect.stringMatching(/Deal name|project reference/i))
    await user.click(box) // the list opens at once — no typing needed
    const list = await screen.findByRole('listbox', { name: 'Opportunities without a cost analysis' })
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(100))
    // the project reference (PR #) finds it too, not only the deal name
    const source0 = source
    await expect(source0.listOpenDeals(1, 'PR_26101')).resolves.toMatchObject({ deals: [{ name: 'Riyadh HQ — Meeting Rooms AV' }] })
    // …and every other value the dropdown shows: account, stage, amount
    expect((await source0.listOpenDeals(1, 'saudi telecom')).deals.every((d) => d.account === 'Saudi Telecom')).toBe(true)
    expect((await source0.listOpenDeals(1, 'needs analysis')).deals.every((d) => d.stage === 'Needs Analysis')).toBe(true)
    await expect(source0.listOpenDeals(1, 'AED 51,250')).resolves.toMatchObject({ deals: [{ name: 'Riyadh HQ — Meeting Rooms AV' }] })
    // scrolled to the bottom: the next 100 load
    Object.defineProperties(list, { scrollHeight: { value: 4000, configurable: true }, clientHeight: { value: 300, configurable: true } })
    list.scrollTop = 3700
    fireEvent.scroll(list)
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(200))
    // No: back to the list, nothing created
    await user.click(within(list).getByRole('option', { name: /Dubai Mall/ }))
    const ask = screen.getByRole('alertdialog', { name: 'Create cost analysis' })
    expect(ask).toHaveTextContent('Cost analysis for Dubai Mall — Digital Signage Refresh does not exist. Do you want to create one?')
    expect(box).toHaveValue('Dubai Mall — Digital Signage Refresh') // the picked opportunity shows in the box
    await user.click(within(ask).getByRole('button', { name: 'No' }))
    expect(screen.getByRole('listbox', { name: 'Opportunities without a cost analysis' })).toBeInTheDocument()
    expect(within(screen.getByRole('listbox', { name: 'Opportunities without a cost analysis' })).getAllByRole('option')).toHaveLength(200) // the list stays as it was
    expect(create).not.toHaveBeenCalled()
    // Yes: created, linked to the deal and opened
    await user.click(within(screen.getByRole('listbox', { name: 'Opportunities without a cost analysis' })).getByRole('option', { name: /Dubai Mall/ }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Create cost analysis' })).getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(nav).toHaveBeenLastCalledWith(expect.stringMatching(/^#Page:Cost_Analysis_Page\?quo_id=9\d+&act_ion=update$/)))
    expect(create).toHaveBeenCalledWith('5500000000001')
    // searching it again (any case) still finds it — marked as having a cost analysis, and choosing it opens that one
    const quoteId = String(nav.mock.lastCall?.[0]).match(/quo_id=(\d+)/)?.[1]
    await user.clear(box)
    await user.type(box, 'pr_26100')
    const found = await screen.findByRole('option', { name: /Cost analysis exists/ })
    expect(found).toHaveTextContent('Dubai Mall — Digital Signage Refresh')
    await user.click(found)
    expect(nav).toHaveBeenLastCalledWith(`#Page:Cost_Analysis_Page?quo_id=${quoteId}&act_ion=update`)
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('Home — Go To, user and theme', () => {
  it('Project lists draft and approved projects and opens the Project Widget', async () => {
    const { user } = renderApp()
    expect(await screen.findByText('Demo User')).toBeInTheDocument()
    expect(screen.queryByText('Go to Project')).not.toBeInTheDocument()
    const goTo = screen.getByRole('combobox', { name: 'Project' })
    await waitFor(() => expect(goTo).toBeEnabled())
    await user.click(goTo)
    const list = screen.getByRole('listbox', { name: 'Projects' })
    expect(within(list).queryByRole('option', { name: /4300/ })).not.toBeInTheDocument()
    await user.type(goTo, 'sib')
    await user.click(within(screen.getByRole('listbox', { name: 'Projects' })).getByRole('option', { name: /PR_26040/ }))
    expect(window.location.search).toBe('?project_id=1001')
  })

  it('keeps the theme switch at the top right, beside the signed-in user, on every page; project pages share one header', async () => {
    const { unmount } = renderApp()
    await screen.findByText('Demo User')
    const bar = screen.getByRole('button', { name: /Switch to (dark|light) mode/ }).closest('.gc-userbar')!
    expect(bar).toHaveTextContent('Demo User')
    unmount()
    await openProject()
    const head = screen.getByRole('banner', { name: 'Project header' })
    const ctx = within(head).getByLabelText('Project entity and currency')
    for (const t of ['Entity:', 'Currency:', 'USD 1 =']) expect(within(ctx).getByText(t)).toBeInTheDocument()
    expect(within(ctx).getByText('AED')).toBeInTheDocument()
    for (const b of [/Home/, /Back/, /Refresh/, /Switch to (dark|light) mode/]) expect(within(head).getByRole('button', { name: b })).toBeInTheDocument()
    expect(within(head).getByText('Demo User')).toBeInTheDocument()
  })
})

describe('Project Widget — opening and navigation', () => {
  it('shows "Project not found" for an invalid or deleted Project ID, with a link back', async () => {
    at('?project_id=abc')
    const { user, unmount } = renderApp()
    expect(await screen.findByText('Project not found')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Back to Project Search/ }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    unmount()

    at('?project_id=999')
    renderApp()
    expect(await screen.findByText('Project not found')).toBeInTheDocument()
  })

  it('a refresh keeps the project and opens on Overview; Home in the header returns to Project Search', async () => {
    const { user, unmount } = await openProject()
    await user.click(tab(/^Procurement/))
    unmount()

    renderApp() // page refresh: same URL
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })).toBeInTheDocument()
    expect(tab(/^Overview/)).toHaveAttribute('aria-selected', 'true') // always opens on Overview
    await userEvent.setup().click(within(screen.getByRole('banner', { name: 'Project header' })).getByRole('button', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('shows View Estimate for a linked estimate and Edit Project', async () => {
    at('?project_id=1001')
    renderApp()
    expect(await screen.findByRole('button', { name: /View Estimate · QT-26-0040/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Project' })).toBeInTheDocument()
  })

  it('opens the CRM deal of the accepted estimate in a new tab', async () => {
    await openProject()
    const link = screen.getByRole('link', { name: /View Deal in CRM/ })
    expect(link).toHaveAttribute('href', 'https://crm.zoho.com/crm/org744131844/tab/Potentials/6241000000412345')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('the Execution eye icon shows / hides Vendor, Brand, Model, SKU and Item Description', async () => {
    const { user } = await openProject()
    await user.click(tab(/Execution/))
    const eyes = await screen.findAllByRole('button', { name: 'Show or hide execution columns' })
    await user.click(eyes[0])
    const box = screen.getByRole('dialog', { name: 'Show or hide execution columns' })
    expect(
      within(box)
        .getAllByRole('checkbox')
        .map((c) => c.parentElement!.textContent),
    ).toEqual(['Show/Hide Columns', 'Vendor', 'Brand', 'Model', 'SKU', 'Item Description'])
    await user.click(within(box).getByRole('checkbox', { name: 'SKU' }))
    await user.click(within(box).getByRole('button', { name: 'Done' }))
    expect(screen.queryAllByRole('columnheader', { name: 'SKU' })).toHaveLength(0)
    expect(screen.getAllByRole('columnheader', { name: 'Vendor' }).length).toBeGreaterThan(0)
  })

  it('opens the linked estimate in Cost Analysis with a way back to this project', async () => {
    const { user, source } = await openProject()
    const nav = vi.spyOn(source, 'navigate')
    await user.click(screen.getByRole('button', { name: /View Estimate/ }))
    expect(nav).toHaveBeenCalledWith('#Page:Cost_Analysis_Page?quo_id=4100&act_ion=project_1001')
  })
})

describe('Project Widget — figures agree', () => {
  it('fills the header from its sources; the Procurement list has no prices', async () => {
    const { user } = await openProject()
    expect(await screen.findByText('Sharjah Islamic Bank')).toBeInTheDocument()
    expect(screen.getByText(/Omar Haddad/)).toBeInTheDocument()
    expect(screen.getByText(/Stage 5 of 14/)).toBeInTheDocument()
    expect(screen.getByText(/54 days left/)).toBeInTheDocument()
    expect(screen.getByText(/^Progress/)).toBeInTheDocument() // PPT 3a: progress sits in the stepper, no KPI card
    expect(screen.queryByText('Overall progress')).not.toBeInTheDocument()
    expect(screen.queryByText('Assets delivered', { selector: '.gc-kpi__label' })).not.toBeInTheDocument()

    // PPT 4a / 4b: the project tab is read-only, one value per cell; work happens in the Procurement module
    await user.click(tab(/^Procurement/))
    const panel = screen.getByRole('tabpanel')
    const table = await within(panel).findByRole('table', { name: 'Bill of quantity' })
    for (const col of ['Model', 'Vendor', 'Req.', 'Ordered', 'Received', 'Delivered', 'PO #', 'Status', 'ETA']) expect(within(table).getByRole('columnheader', { name: col })).toBeInTheDocument()
    expect(within(table).queryAllByRole('button')).toHaveLength(0)
    expect(within(panel).queryByRole('button', { name: /Create PO|Edit/ })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('columnheader', { name: /Unit price|Total price/i })).not.toBeInTheDocument()
  })

  it('shows tab counts that match the displayed rows', async () => {
    const { user } = await openProject()
    // PPT tabs: Overview · Milestones · Execution · Procurement · Risks · Asset Register · Activity (no Tasks / Risk Dashboard tab)
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Overview', 'Milestones', 'Execution', 'Procurement', 'Risks', 'Asset Register', 'Activity'])
    await waitFor(() => expect(tab(/^Procurement/)).toHaveTextContent('Procurement7'))
    await waitFor(() => expect(tab(/Milestones/)).toHaveTextContent('Milestones3')) // Milestone records
    await waitFor(() => expect(tab(/Execution/)).toHaveTextContent('Execution4')) // work packages
    expect(tab(/Asset Register/)).toHaveTextContent('Asset Register13')
    await user.click(tab(/Execution/))
    expect(await screen.findAllByRole('radio', { name: /^Lines/ })).toHaveLength(4) // one section per work package
  })

  it('answers the Overview questions; the Milestones tab has no task data issues section', async () => {
    const { user } = await openProject()
    await waitFor(() => expect(kpi('Tasks planned today')).toHaveTextContent('4'))
    expect(screen.getByRole('region', { name: 'Assigned team' })).toHaveTextContent('3 technicians · 2 users')
    expect(screen.getAllByText('On site today').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Work packages' }))
    expect(tab(/Execution/)).toHaveAttribute('aria-selected', 'true')
    await user.click(tab(/Milestones/))
    await screen.findByRole('table', { name: 'Milestones' })
    expect(screen.queryByText(/Task data issues/)).not.toBeInTheDocument()
  })
})

describe('Project Widget — status pipeline', () => {
  it('moves to the next stage in a pop-up, and needs a reason to move back', async () => {
    const { user } = await openProject()
    expect(screen.getByText(/Stage 5 of 14/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /^Move to Ready for Installation →/ }))
    let dialog = await screen.findByRole('dialog', { name: 'Move to Ready for Installation' })
    await user.click(within(dialog).getByRole('button', { name: 'Move to Ready for Installation' }))
    expect(await screen.findByText(/Stage 6 of 14/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More ▾' }))
    await user.click(screen.getByRole('menuitem', { name: /Move back to Partially Delivered/ }))
    dialog = await screen.findByRole('dialog', { name: 'Move back to Partially Delivered' })
    expect(within(dialog).getByRole('button', { name: 'Move back' })).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'Client postponed installation')
    await user.click(within(dialog).getByRole('button', { name: 'Move back' }))
    expect(await screen.findByText(/Stage 5 of 14/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More ▾' }))
    await user.click(screen.getByRole('menuitem', { name: /Show status history/ }))
    expect(await screen.findByText('Reason: Client postponed installation')).toBeInTheDocument()
  })

  it('a click on a stage dot opens the same pop-up: the next stage, or an earlier one with a reason', async () => {
    const { user } = await openProject()
    await user.click(await screen.findByRole('button', { name: 'Move to Ready for Installation' }))
    expect(await screen.findByRole('dialog', { name: 'Move to Ready for Installation' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Move to Installation in Progress' })).not.toBeInTheDocument() // no skipping without admin rights
    await user.click(screen.getByRole('button', { name: 'Move back to Procurement in Progress' }))
    expect(await screen.findByRole('dialog', { name: 'Move back to Procurement in Progress' })).toBeInTheDocument()
  })

  it('Kick-Off Done opens the Project Registration form: it moves only once every required field is filled', async () => {
    at('?project_id=1002')
    const { user, source } = renderApp()
    await screen.findByRole('heading', { name: 'Marina Hotel Ballroom AV' })
    await user.click(await screen.findByRole('button', { name: /^Move to Kick-Off Done →/ }))
    const form = await screen.findByRole('dialog', { name: /Kick-Off Done: Project Registration/ })
    const gaps = await within(form).findByRole('region', { name: 'Required for Kick-Off Done' })
    expect(gaps).toHaveTextContent(/to fill before Kick-Off Done/)
    // no red marks and the list stays hidden until a move is tried
    expect(within(gaps).queryByRole('button', { name: 'Sales Signature' })).not.toBeInTheDocument()
    expect(form.querySelector('.gc-field--missing')).toBeNull()
    await user.click(within(form).getByRole('button', { name: 'Save & move to Kick-Off Done' }))
    expect(gaps).toHaveTextContent(/missing before Kick-Off Done/)
    expect(within(gaps).getByRole('button', { name: 'Sales Signature' })).toBeInTheDocument()
    expect(form.querySelector('.gc-field--missing')).not.toBeNull()
    expect(within(form).getByRole('heading', { level: 2, name: /Project Information/ })).toHaveTextContent(/missing/)
    // the server refuses it too (Widget.project_update)
    const kick = (await source.getProjectDetails('1002')).stages.find((x) => x.label === 'Kick-Off Done')!
    await expect(source.updateProject('1002', { Project_Status: kick.id })).rejects.toThrow(/Complete the Project Registration form/)
  })
})

describe('Project Widget — project team', () => {
  it('adds, changes and removes team members from Overview, saving the whole team at once', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateProject')
    const panel = await screen.findByRole('region', { name: 'Assigned team' })
    await user.click(within(panel).getByRole('button', { name: 'Edit team' }))
    expect(within(panel).getAllByLabelText(/^Team member \d/)).toHaveLength(5)
    await user.click(within(panel).getByRole('button', { name: 'Remove team member 5' }))
    await user.click(within(panel).getByRole('button', { name: '+ Add member' }))
    expect(within(panel).getByRole('button', { name: 'Save team' })).toBeDisabled()
    await user.selectOptions(within(panel).getByLabelText('Team member 5'), 'Harish Kunju')
    await user.selectOptions(within(panel).getByLabelText('Project role 5'), 'Technician')
    await user.selectOptions(within(panel).getByLabelText('Project role 2'), 'Site Engineer')
    await user.click(within(panel).getByRole('button', { name: 'Save team' }))
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'Save team' })).not.toBeInTheDocument())
    const sent = (update.mock.calls[0][1] as { Project_Team: { row_id: string; member_id: string; role_id: string }[] }).Project_Team
    expect(sent).toHaveLength(5)
    expect(sent[1]).toMatchObject({ row_id: '1202', role_id: 'r6' })
    expect(sent[4]).toMatchObject({ row_id: '', role_id: 'r7' })
    expect(await within(panel).findByText('Harish Kunju')).toBeInTheDocument()
    expect(within(panel).queryByText('Prashant Bakde')).not.toBeInTheDocument()
    expect(within(panel).getByText(/Site Engineer/)).toBeInTheDocument()
  })
})

describe('Project Widget — procurement', () => {
  it('opens the Procurement Schedule in its own page and comes back', async () => {
    const { user, source } = await openProject()
    await user.click(tab(/Execution/))
    expect(screen.queryByRole('button', { name: /Open Procurement/ })).not.toBeInTheDocument() // only on the Procurement tab
    await user.click(tab(/^Procurement/))
    await user.click(await screen.findByRole('button', { name: /Open Procurement/ }))
    expect(window.location.search).toBe('?procurement_project_id=1001')
    expect(await screen.findByText('Procurement', { selector: '[aria-current]' })).toBeInTheDocument()
    const reads = source.calls.listPurchaseOrders ?? 0
    await user.click(await screen.findByRole('button', { name: '↻ Refresh' }))
    await waitFor(() => expect(source.calls.listPurchaseOrders).toBeGreaterThan(reads)) // reads Creator again
    await user.click(within(screen.getByRole('banner', { name: 'Project header' })).getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })).toBeInTheDocument()
  })

  it('shows the work packages with procurement read-only and asset fields editable (Execution)', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateAssetLine')
    await user.click(tab(/Execution/))
    const av02 = await screen.findByRole('region', { name: /^AV02: \[DS-01/ })
    // procurement values are text, never inputs, in the work package
    expect(within(av02).getAllByText('PO-00310').length).toBeGreaterThan(0)
    expect(within(av02).queryByRole('button', { name: /PO date|Mode of transit/ })).not.toBeInTheDocument()
    const serial = await editCell(user, /^Serial number of LPDisplay LPD-BSU63V12/, within(av02))
    await user.clear(serial)
    await user.type(serial, 'SN-AV02-1{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', expect.any(String), { Serial_Number: 'SN-AV02-1' }))
  })
})

describe('Project Widget — Execution: tasks are the 2nd level of a work package', () => {
  it('edits a task start / end date inline and saves it', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Execution/))
    const av02 = await screen.findByRole('region', { name: /^AV02: \[DS-01/ })
    await user.click(within(av02).getByRole('radio', { name: /^Tasks/ }))
    const input = await editCell(user, 'AV02 – Procurement & Delivery end date', within(av02))
    const fire = (await import('@testing-library/react')).fireEvent
    fire.change(input, { target: { value: '2030-01-15' } })
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7101', { Task_End_Date: '15-Jan-2030' }))
    expect(await screen.findByRole('button', { name: 'AV02 – Procurement & Delivery end date' })).toHaveTextContent('15 Jan 2030')
  })
})

describe('Project Widget — Risks (register + dashboard in one tab)', () => {
  it('adds a risk in an inline row (no pop-up) and edits it in the list, with calculated score and severity', async () => {
    const { user, source } = await openProject()
    const save = vi.spyOn(source, 'saveRisk')
    await user.click(tab(/^Risks/))
    await waitFor(() => expect(kpi('Total risks')).toHaveTextContent('3'))
    expect(kpi('Active risks')).toHaveTextContent('2')
    expect(kpi('Average risk score')).toHaveTextContent('16 / 25') // (12 + 20) / 2, Closed Risk excluded
    expect(screen.getByRole('region', { name: 'Risks by status' })).toBeInTheDocument() // dashboard in the same tab

    await user.click(screen.getByRole('button', { name: '+ Add risk' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('New risk Description'), 'Late site access')
    await user.click(screen.getByRole('button', { name: 'Save risk' }))
    expect(screen.getByText('Required: Probability, Impact')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('New risk Probability'), 'High')
    await user.selectOptions(screen.getByLabelText('New risk Impact'), 'Severe')
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0)
    await waitFor(() => expect(within(screen.getByLabelText('New risk Department')).getByRole('option', { name: '2point0 Management' })).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('New risk Department'), '2point0 Management')
    await user.click(screen.getByRole('button', { name: 'Save risk' }))
    await waitFor(() => expect(screen.queryByLabelText('New risk Description')).not.toBeInTheDocument())
    expect(save.mock.calls[0]).toEqual(['1001', undefined, { Risk_Description: 'Late site access', Probability: 'High', Impact: 'Severe', Department: 'd3' }])
    expect(await screen.findByRole('button', { name: `RSK-${String(new Date().getFullYear()).slice(2)}-00004 description` })).toHaveTextContent('Late site access')
    expect(kpi('Total risks')).toHaveTextContent('4')

    const impact = await editCell(user, `RSK-${String(new Date().getFullYear()).slice(2)}-00004 impact`)
    await user.selectOptions(impact, 'Minor')
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('1001', expect.any(String), { Impact: 'Minor' }))
  })
})

describe('Project Widget — milestones, tasks and activity', () => {
  it('lists milestones with dates from the project start, edits Duration in place and logs it in the Activity stream', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateMilestone')
    await user.click(tab(/Milestones/))
    const list = await screen.findByRole('table', { name: 'Milestones' })
    expect(within(list).getByText('MS3 | Project Procurement')).toBeInTheDocument()
    const heads = within(list)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim())
    expect(heads.indexOf('Start date')).toBeLessThan(heads.indexOf('End date'))
    expect(heads.indexOf('End date')).toBeLessThan(heads.indexOf('Duration'))
    expect(within(list).getAllByText(/days ago/).length).toBeGreaterThan(0) // MS3 ended 6 days ago → Delayed
    expect(within(list).getAllByText('Delayed').length).toBeGreaterThan(0)

    const input = await editCell(user, 'MS4 | Project Execution duration', within(list))
    expect(input.closest('td')!.style.maxWidth).toMatch(/px$/) // the column keeps its width while the editor is open
    await user.clear(input)
    await user.type(input, '30{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '6102', { Duration: 30 }))
    expect(within(list).getByRole('button', { name: 'MS4 | Project Execution duration' }).closest('td')!.style.maxWidth).toBe('') // released
    expect(await screen.findByText('Milestone updated')).toBeInTheDocument()

    // Project Execution: its task lists are the work packages → tasks → subtasks
    await user.click(within(list).getByRole('button', { name: 'Expand MS4 | Project Execution' }))
    const tree = await screen.findByRole('table', { name: 'Tasks of MS4 | Project Execution' })
    expect(within(tree).queryByRole('button', { name: 'TL | Project Execution task name' })).not.toBeInTheDocument()
    expect(within(tree).getByText('AV02: [DS-01 BEHIND SSO DESK]')).toBeInTheDocument()
    expect(within(tree).getByText('AV04: [DS-03 NEAR HEAD TELLER]')).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: 'Mounts & Brackets task name' })).toBeInTheDocument()

    await user.click(tab(/Activity/))
    expect(await screen.findByText('MS4 | Project Execution')).toBeInTheDocument()
    expect(screen.getByText(/duration updated From 25 to 30/)).toBeInTheDocument()
  })

  it('changes a task duration in the task tree and moves its due date with it', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    const tree = await screen.findByRole('table', { name: 'Tasks of MS4 | Project Execution' })
    const input = await editCell(user, 'AV02 – Configuration duration', within(tree))
    await user.clear(input)
    await user.type(input, '5')
    await user.click(document.body) // leaving the cell saves it (no detail page)
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7104', expect.objectContaining({ Duration: 5, Task_End_Date: expect.any(String) })))
    expect(await screen.findByText('Task updated')).toBeInTheDocument()
  })

  it('changes the vendor of a not-yet-ordered line in the Procurement module', async () => {
    at('?procurement_project_id=1001')
    const { user, source } = renderApp()
    const update = vi.spyOn(source, 'updateBoq')
    const select = await editCell(user, 'Vendor of UIDESIGN')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Peculiar' })).toBeInTheDocument())
    await user.selectOptions(select, 'Peculiar')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', expect.any(String), { Vendors: '6602' }))
  })
})

describe('Dropdowns — one list style everywhere', () => {
  it('every dropdown opens the widget list (not the browser list): highlight, search, choose saves', async () => {
    at('?procurement_project_id=1001')
    const { user, source } = renderApp()
    const update = vi.spyOn(source, 'updateBoq')
    const select = await editCell(user, 'Vendor of UIDESIGN') // the inline editor opens the list at once
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Peculiar' })).toBeInTheDocument())
    const list = await screen.findByRole('listbox', { name: 'Vendor of UIDESIGN' })
    expect(list.closest('.gc-dd')).not.toBeNull()
    expect(within(list).getByRole('option', { name: 'Uniguest' })).toHaveAttribute('aria-selected', 'true') // current value ticked
    await user.click(within(list).getByRole('option', { name: 'Peculiar' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', expect.any(String), { Vendors: '6602' }))
    expect(screen.queryByRole('listbox', { name: 'Vendor of UIDESIGN' })).not.toBeInTheDocument()

    // a form dropdown: a click opens the same list; long lists get a search box; Esc closes without a change
    await user.click(screen.getByRole('button', { name: '+ Create purchase order' }))
    const panel = await screen.findByRole('dialog', { name: 'Create purchase order' })
    const vendor = within(panel).getByRole('combobox', { name: 'Vendor' })
    fireEvent.mouseDown(vendor)
    const vendors = await screen.findByRole('listbox', { name: 'Vendor' })
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(vendor).not.toHaveValue(''))
    expect(screen.queryByRole('listbox', { name: 'Vendor' })).not.toBeInTheDocument()
    expect(vendors).not.toBeInTheDocument()
  })
})

describe('Project Widget — empty states and edit', () => {
  it('shows empty states for a project without records', async () => {
    at('?project_id=1003')
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Gulf Logistics Boardroom' })
    expect(await screen.findByText('Nothing planned for today')).toBeInTheDocument()
    await user.click(tab(/Milestones/))
    expect(screen.getAllByText('No records for this project').length).toBeGreaterThan(0)
    await user.click(tab(/^Risks/))
    expect(await screen.findByText('No records for this project')).toBeInTheDocument()
    await user.click(tab(/Execution/))
    expect(await screen.findByText(/No work packages/)).toBeInTheDocument()
  })

  it('edits the project in the Steps form and saves only the changed field', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateProject')
    await user.click(await screen.findByRole('button', { name: 'Edit Project' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit SIB RAK Branch/ })
    const name = await within(dialog).findByLabelText(/^Project Name/)
    await user.clear(name)
    await user.type(name, 'SIB RAK Branch – Signage')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(update).toHaveBeenCalledWith('1001', { Project_Name: 'SIB RAK Branch – Signage' }, undefined)
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Signage' })).toBeInTheDocument()
  })

  it('Edit Project follows the Project Registration Form: sections, PO file upload, contacts, key milestones, payment summary', async () => {
    const { user, source } = await openProject()
    const upload = vi.spyOn(source, 'uploadProjectFile')
    const saveContact = vi.spyOn(source, 'saveProjectContact')
    const createMs = vi.spyOn(source, 'createMilestone')
    const updateMs = vi.spyOn(source, 'updateMilestone')
    await user.click(await screen.findByRole('button', { name: 'Edit Project' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit SIB RAK Branch/ })
    const nav = within(dialog).getByRole('navigation', { name: 'Form sections' })
    const steps = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent?.replace(/^\d{2}/, '').replace(/\d+$/, ''))
      .filter((t) => t !== 'Expand all' && t !== 'Collapse all')
    expect(steps).toEqual([
      'Project Information',
      'Project Scope Review',
      'Purchase Order Review',
      '2point0 Key Personnel',
      'Contact Person',
      'Key Milestones & Dates',
      'Payment Summary',
      'Project Budget Review',
      'Warranty & Extended Warranty Review',
      'Shop Drawings',
      'Project Registration Task List',
      'Signatures',
    ])
    // one page, as the Registration Form: every section is on it, each opens / closes from its header
    for (const t of steps) expect(within(dialog).getByRole('heading', { level: 2, name: t! })).toBeInTheDocument()
    const sectionToggle = (name: string) => within(within(dialog).getByRole('heading', { level: 2, name })).getByRole('button')
    expect(within(dialog).queryByRole('heading', { level: 2, name: /Linked records/ })).not.toBeInTheDocument()
    expect(sectionToggle('Project Information')).toHaveAttribute('aria-expanded', 'true')
    await user.click(sectionToggle('Project Information'))
    expect(within(dialog).queryByLabelText(/^Project Name/)).not.toBeInTheDocument()
    await user.click(sectionToggle('Project Information'))
    expect(within(dialog).getByLabelText(/^Project Name/)).toBeInTheDocument()
    // no Totals block and no 2point0 Outsourced Services section any more
    expect(within(dialog).queryByRole('button', { name: /Show totals/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('table', { name: '2point0 Outsourced Services & Software Contact List' })).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Project Description/)).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Digital Signage' })).toBeInTheDocument() // Type of Project as radio cards
    const step = (name: string) => user.click(within(nav).getByRole('button', { name: new RegExp(name.replace(/[&]/g, '.')) }))

    // 2. Purchase Order Review: no Accepted Estimate; the PO / LOI file uploads at once
    await step('Purchase Order Review')
    expect(within(dialog).queryByText('Accepted Estimate')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Date Purchase Order was Received/)).toBeInTheDocument()
    await user.upload(within(dialog).getByLabelText('Purchase Order / Email Confirmation / Letter of Intent file'), new File(['%PDF'], 'LPO 481.pdf', { type: 'application/pdf' }))
    await waitFor(() => expect(upload).toHaveBeenCalledWith('1001', expect.any(File)))
    expect(await within(dialog).findByRole('button', { name: 'LPO 481.pdf' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Replace file' })).toBeInTheDocument()

    // 3. Key Personnel is the third step now
    await step('2point0 Key Personnel')
    expect(within(dialog).getByLabelText(/^Sales Representative( \*)?$/)).toBeInTheDocument()
    // Role | Employee Name | Present Yes / No (Meeting_Attendee)
    const saveAtt = vi.spyOn(source, 'saveAttendance')
    const pmPresent = within(dialog).getByLabelText('Project Manager present')
    await waitFor(() => expect(pmPresent).toBeEnabled())
    await user.selectOptions(pmPresent, 'Yes')
    await waitFor(() => expect(saveAtt).toHaveBeenCalledWith('1001', expect.any(String), 'Present'))
    await waitFor(() => expect(within(dialog).getByLabelText('Project Manager present')).toHaveValue('Yes'))
    // the Registration checklist = Project_Registration_Task_List (multi-select): every item clickable, Tick all
    const checklist = await within(dialog).findByRole('list', { name: /Project Registration Task List/ })
    await waitFor(() => expect(within(checklist).getAllByRole('checkbox')).toHaveLength(20))
    await user.click(within(checklist).getByRole('checkbox', { name: /GDrive/ }))
    expect(within(checklist).getByRole('checkbox', { name: /GDrive/ })).toBeChecked()
    expect(within(dialog).getByText('1 / 20 reviewed')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Tick all' }))
    expect(within(dialog).getByText('20 / 20 reviewed')).toBeInTheDocument()
    // signatures are drawn here and saved into the Creator Signature field
    await user.click(within(dialog).getAllByRole('button', { name: 'Sign here' })[0])
    expect(within(dialog).getByRole('img', { name: /draw your signature here/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save signature' })).toBeDisabled()
    await user.click(within(within(dialog).getByRole('img', { name: /draw your signature here/ }).parentElement!).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog).queryByRole('img', { name: /draw your signature here/ })).not.toBeInTheDocument()

    // 4. Contact Person: add and edit client contacts
    await step('Contact Person')
    const contacts = await within(dialog).findByRole('table', { name: 'Client Side Contact List' })
    expect(await within(contacts).findByText('Samia Aqeel')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '+ Add contact' }))
    await user.type(within(dialog).getByLabelText('New contact first name'), 'Reham')
    await user.type(within(dialog).getByLabelText('New contact last name'), 'Sameer')
    await user.type(within(dialog).getByLabelText('New contact email'), 'reham@client.example')
    await user.click(within(dialog).getByRole('button', { name: 'Save contact' }))
    await waitFor(() => expect(saveContact).toHaveBeenCalledWith('1001', undefined, { firstName: 'Reham', lastName: 'Sameer', email: 'reham@client.example', phone: '', designation: '' }))
    expect(await within(contacts).findByText('Reham Sameer')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Edit Samia Aqeel' }))
    const desig = within(dialog).getByLabelText('Samia Aqeel designation')
    await user.clear(desig)
    await user.type(desig, 'Head of Facilities')
    await user.click(within(dialog).getByRole('button', { name: 'Save contact' }))
    await waitFor(() => expect(saveContact).toHaveBeenLastCalledWith('1001', 'c1', expect.objectContaining({ designation: 'Head of Facilities' })))

    // 5. Key Milestones & Dates: add one, rename one
    await step('Key Milestones & Dates')
    const ms = await within(dialog).findByRole('table', { name: 'Key Milestones & Dates' })
    expect(await within(ms).findByText('Project Procurement', { exact: false })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '+ Add milestone' }))
    await user.type(within(dialog).getByLabelText('New milestone name'), 'Kick Off Meeting')
    // Start Date / End Date are picked; they save as Starts after (from the project start) and Duration
    const startBox = within(dialog).getByLabelText('New milestone start date') as HTMLInputElement
    const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
    const projStart = startBox.value
    expect(projStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    fireEvent.change(startBox, { target: { value: plus(projStart, 7) } })
    fireEvent.change(within(dialog).getByLabelText('New milestone end date'), { target: { value: plus(projStart, 9) } })
    expect(within(dialog).getByLabelText('New milestone duration')).toHaveTextContent('3 days')
    await user.click(within(dialog).getByRole('button', { name: 'Save milestone' }))
    await waitFor(() => expect(createMs).toHaveBeenCalledWith('1001', { name: 'Kick Off Meeting', startsAfter: 7, startsAfterIn: 'Days', duration: 3 }))
    expect(await within(ms).findByText('Kick Off Meeting')).toBeInTheDocument()
    const firstEdit = within(ms).getAllByRole('button', { name: /^Edit / })[0]
    await user.click(firstEdit)
    const nameBox = within(ms).getByLabelText(/ name$/)
    await user.clear(nameBox)
    await user.type(nameBox, 'PO Received')
    await user.click(within(dialog).getByRole('button', { name: 'Save milestone' }))
    await waitFor(() => expect(updateMs).toHaveBeenLastCalledWith('1001', expect.any(String), expect.objectContaining({ Milestone_Name: 'PO Received' })))
    expect(await within(ms).findByText('PO Received')).toBeInTheDocument()

    // 6. Payment Summary = Payment Terms Agreed only; By category is in Project Budget Review, Budget Cost editable there
    await step('Payment Summary')
    const terms = within(dialog).getByRole('region', { name: 'Payment Terms Agreed' })
    expect(terms.closest('section.gc-regsec')).not.toContainElement(within(dialog).queryByRole('region', { name: 'Summary by category' }))
    const byCategory = await within(dialog).findByRole('region', { name: 'Summary by category' })
    expect(byCategory.closest('section.gc-regsec')).toHaveAttribute('aria-labelledby', expect.stringMatching(/gc-sec-h-/))
    expect(within(byCategory.closest('section.gc-regsec') as HTMLElement).getByRole('heading', { level: 2, name: /Project Budget Review/ })).toBeInTheDocument()
    for (const c of ['Hardware', 'Software', 'Outsourced Services', '2point0 Services', 'Logistics']) expect(within(byCategory).getByRole('rowheader', { name: c })).toBeInTheDocument()
    const hw = within(byCategory).getByLabelText('Hardware budget cost')
    await user.clear(hw)
    await user.type(hw, '170000')
    expect(within(dialog).getByText(/unsaved change/)).toBeInTheDocument()
  }, 20_000)

  it('Execution → Asset shows the Work Package Task section: each work package with its tasks; Milestones has no task list section', async () => {
    const { user } = await openProject()
    await user.click(tab(/Milestones/))
    await screen.findByRole('table', { name: 'Milestones' })
    expect(screen.queryByText(/^Work Package Task/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Show closed/ })).not.toBeInTheDocument()
    expect(screen.getByText('No milestone (1)')).toBeInTheDocument() // a task from before the milestone set-up
    await user.click(tab(/Execution/))
    await user.click(await screen.findByRole('radio', { name: 'Task' }))
    expect(await screen.findByText('Work Package Task (2 work packages, 5 tasks)')).toBeInTheDocument()
    // one block per work package, its task groups and tasks under it
    const av02 = screen.getByRole('region', { name: 'AV02: [DS-01 BEHIND SSO DESK]' })
    expect(within(av02).getByRole('button', { name: 'Mounts & Brackets task name' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AV04: [DS-03 NEAR HEAD TELLER]' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Filter by work package' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Asset' }))
    expect(screen.queryByText(/^Work Package Task/)).not.toBeInTheDocument()
    // Asset / Task come first in the bar, then All packages and Jump to package
    const bar = screen.getByRole('combobox', { name: 'Filter by work package' }).closest('.gc-pg-bar')!
    expect(bar.firstElementChild).toContainElement(screen.getByRole('radio', { name: 'Task' }))
  })

  it('switches between light and dark mode', async () => {
    const { user } = renderApp()
    const toggle = await screen.findByRole('button', { name: /Switch to (dark|light) mode/ })
    const before = document.documentElement.dataset.theme
    await user.click(toggle)
    expect(document.documentElement.dataset.theme).not.toBe(before)
  })
})

describe('Record lists — values change in the list and are saved to the record (reference inline editor)', () => {
  it('saves a risk probability from the register list; score and severity are recalculated', async () => {
    const { user, source } = await openProject()
    const save = vi.spyOn(source, 'saveRisk')
    await user.click(tab(/^Risks/))
    const prob = await editCell(user, 'R - 1 probability')
    await user.selectOptions(prob, 'Very High')
    await waitFor(() => expect(save).toHaveBeenCalledWith('1001', '5001', { Probability: 'Very High' }))
    expect(await screen.findByText('Risk saved')).toBeInTheDocument()
  })

  it('saves a serial number typed in the asset list and keeps it after the widget reloads', async () => {
    at('?project_id=1001')
    const source = createMockSource({ latencyMs: 0, persist: false })
    const first = render(<App source={source} client={createQueryClient()} />)
    const user = userEvent.setup()
    const update = vi.spyOn(source, 'updateAssetLine')
    await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })
    await user.click(tab(/Asset Register/))
    const serial = await editCell(user, /^Serial number of /)
    await user.clear(serial)
    await user.type(serial, 'SN-TEST-001{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', expect.any(String), { Serial_Number: 'SN-TEST-001' }))
    first.unmount()

    // reload: a fresh widget reads the record again from the data source
    render(<App source={source} client={createQueryClient()} />)
    await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })
    await user.click(tab(/Asset Register/))
    expect((await screen.findAllByRole('button', { name: /^Serial number of / }))[0]).toHaveTextContent('SN-TEST-001')
  })

  it('assigns a task right in the list: Owner opens a checklist of the app users, Save stores Owners', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    await user.click(await screen.findByRole('button', { name: 'Assign AV02 – Configuration' }))
    const pop = screen.getByRole('group', { name: 'Owners of AV02 – Configuration' })
    const people = await within(pop).findAllByRole('checkbox')
    expect(people.length).toBeGreaterThan(1)
    const unticked = people.find((c) => !(c as HTMLInputElement).checked)!
    await user.click(unticked)
    await user.click(within(pop).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7104', { Owners: expect.arrayContaining([expect.any(String)]) }))
    expect(update.mock.calls.at(-1)![2].Owners).toHaveLength(people.filter((c) => (c as HTMLInputElement).checked).length)
  })

  it('task comments inline: files on the task, a comment with files, and a direct reply — no popup', async () => {
    const { user, source } = await openProject()
    const add = vi.spyOn(source, 'addTaskNote')
    const upload = vi.spyOn(source, 'uploadTaskFile')
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    await user.click(await screen.findByRole('button', { name: 'Comments and files of AV02 – Configuration' }))
    const area = await screen.findByLabelText('Comments and files of AV02 – Configuration', { selector: 'div' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // several files on the task
    await user.upload(within(area).getByLabelText('Attach files to AV02 – Configuration'), [new File(['a'], 'layout.pdf', { type: 'application/pdf' }), new File(['b'], 'cables.xlsx')])
    await user.click(within(area).getByRole('button', { name: 'Upload 2' }))
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    expect(await within(area).findByRole('button', { name: '📎 layout.pdf' })).toBeInTheDocument()
    // a comment with a file
    await user.type(within(area).getByRole('textbox', { name: 'Comment on AV02 – Configuration' }), 'Racks are in place')
    await user.upload(within(area).getByLabelText('Comment on AV02 – Configuration — attach files'), new File(['c'], 'photo.jpg', { type: 'image/jpeg' }))
    await user.click(within(area).getAllByRole('button', { name: 'Send' }).at(-1)!)
    expect(await within(area).findByText('Racks are in place')).toBeInTheDocument()
    expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ taskId: '7104', comment: 'Racks are in place', replyTo: '', fileNames: ['photo.jpg'] }))
    // a direct reply under it
    await user.click(within(area).getByRole('button', { name: 'Reply' }))
    await user.type(within(area).getByRole('textbox', { name: /^Reply to / }), 'Thanks — configuring today')
    await user.click(within(area).getAllByRole('button', { name: 'Send' })[0])
    expect(await within(area).findByText('Thanks — configuring today')).toBeInTheDocument()
    expect(add.mock.calls.at(-1)![0].replyTo).toMatch(/^n\d+/)
  })

  it('shows the % sign in Completion', async () => {
    const { user } = await openProject()
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    expect(screen.getAllByRole('columnheader', { name: 'Completion (%)' }).length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: 'AV02 – Configuration completion %' })).toHaveTextContent(/^\d+%$/)
  })

  it('renames a task straight from the task list', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    const name = await editCell(user, 'AV02 – Configuration task name')
    await user.clear(name)
    await user.type(name, 'AV02 – Configuration & tuning{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7104', { Task_Name: 'AV02 – Configuration & tuning' }))
  })
})

describe('Theme, popup editing and milestone ↔ task list mapping', () => {
  it('opens in Light theme even when the OS prefers dark; Dark only after the user picks it', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('dark'),
          media: q,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    )
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Home' })
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    mm.mockRestore()
  })

  it('edits fields in the task side panel and saves them with Save', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    await user.click(await screen.findByRole('button', { name: 'Open AV02 – Configuration' }))
    const dialog = await screen.findByRole('dialog', { name: 'AV02 – Configuration' })
    expect(dialog).toHaveClass('gc-side--right')
    const description = within(dialog).getByLabelText('Task description')
    expect(description).toBeEnabled()
    await user.type(description, 'Configure the media player')
    await user.clear(within(dialog).getByLabelText('Work hours'))
    await user.type(within(dialog).getByLabelText('Work hours'), '6')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7104', { Task_Description: 'Configure the media player', Work_Hours: '6' }))
    // reopening shows the saved values
    await user.click(await screen.findByRole('button', { name: 'Open AV02 – Configuration' }))
    expect(await screen.findByDisplayValue('Configure the media player')).toBeInTheDocument()
  })

  it('never locks the lists or popups: even when Creator reports can_edit = false, every field is editable', async () => {
    at('?project_id=1001')
    const { user } = renderApp({ canEdit: false })
    await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })
    expect(screen.queryByText('View only')).not.toBeInTheDocument()
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    expect(await editCell(user, 'AV02 – Configuration task name')).toBeEnabled()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Open AV02 – Configuration' }))
    const dialog = await screen.findByRole('dialog', { name: 'AV02 – Configuration' })
    expect(within(dialog).getByLabelText('Task description')).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('other milestones are common: their tasks show straight under the milestone, no task list', async () => {
    const { user } = await openProject()
    await user.click(tab(/Milestones/))
    const list = await screen.findByRole('table', { name: 'Milestones' })
    expect(within(list).queryByRole('button', { name: /task list$/ })).not.toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: 'Expand MS6 | Project Sign-Off' }))
    const tree = await screen.findByRole('table', { name: 'Tasks of MS6 | Project Sign-Off' })
    expect(within(tree).queryByRole('button', { name: 'TL | Project Sign-Off task name' })).not.toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: 'Final Sign Off task name' })).toBeInTheDocument()
  })

  it('adds a milestone to the project and tasks to a milestone (Project Execution: to a work package)', async () => {
    const { user, source } = await openProject()
    const addMs = vi.spyOn(source, 'createMilestone')
    const addTask = vi.spyOn(source, 'createTask')
    await user.click(tab(/Milestones/))
    await screen.findByRole('table', { name: 'Milestones' })
    await user.click(screen.getByRole('button', { name: '+ Add milestone' }))
    const msForm = screen.getByRole('form', { name: 'Add milestone' })
    await user.type(within(msForm).getByLabelText('Milestone name'), 'MS7 | Training')
    await user.clear(within(msForm).getByLabelText('Duration (days)'))
    await user.type(within(msForm).getByLabelText('Duration (days)'), '5')
    await user.click(within(msForm).getByRole('button', { name: 'Add milestone' }))
    expect(await screen.findByText('Milestone added')).toBeInTheDocument()
    expect(addMs).toHaveBeenCalledWith('1001', { name: 'MS7 | Training', startsAfter: 0, startsAfterIn: 'Days', duration: 5 })
    const list = screen.getByRole('table', { name: 'Milestones' })
    await user.click(await within(list).findByRole('button', { name: 'Expand MS7 | Training' }))
    await user.click(screen.getByRole('button', { name: '+ Add task' }))
    let taskForm = screen.getByRole('form', { name: 'Add task to MS7 | Training' })
    await user.type(within(taskForm).getByLabelText('Task name'), 'Operator training')
    await user.click(within(taskForm).getByRole('button', { name: 'Add task' }))
    expect(await screen.findByRole('button', { name: 'Operator training task name' })).toBeInTheDocument()
    expect(addTask).toHaveBeenLastCalledWith('1001', expect.objectContaining({ name: 'Operator training', milestoneId: expect.any(String) }))
    expect(addTask.mock.lastCall?.[1]).not.toHaveProperty('parentId')

    await user.click(within(list).getByRole('button', { name: 'Expand MS4 | Project Execution' }))
    const execTree = await screen.findByRole('table', { name: 'Tasks of MS4 | Project Execution' })
    await user.click(within(execTree.closest('td')!).getByRole('button', { name: '+ Add task' }))
    taskForm = screen.getByRole('form', { name: 'Add task to MS4 | Project Execution' })
    await user.type(within(taskForm).getByLabelText('Task name'), 'Rack dressing')
    await user.selectOptions(within(taskForm).getByLabelText('Add under'), '7004') // under a work package: its milestone is copied
    await user.click(within(taskForm).getByRole('button', { name: 'Add task' }))
    await waitFor(() => expect(addTask).toHaveBeenLastCalledWith('1001', expect.objectContaining({ name: 'Rack dressing', parentId: '7004' })))
    expect(await screen.findByRole('button', { name: 'Rack dressing task name' })).toBeInTheDocument()
  })
})

describe('Procurement module (frozen core, banded sections, box fields, left side panels)', () => {
  const openSchedule = async (opts: MockSourceOptions = {}) => {
    at('?procurement_project_id=1001')
    const r = renderApp(opts)
    await screen.findByRole('table', { name: 'Procurement schedule' })
    return r
  }
  const row = (name: RegExp) => screen.getByRole('row', { name })

  it('lists every BOQ line with frozen core columns and five sections — no status tabs, Columns menu, bookmarks or Needs info', async () => {
    await openSchedule()
    const table = screen.getByRole('table', { name: 'Procurement schedule' })
    for (const h of ['Core data', /^Purchasing/, 'Transit', 'Receiving', /^Payments/, 'Packages']) expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument()
    for (const h of ['Vendor', 'Model', 'Item Description']) expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument()
    expect(within(table).getAllByRole('checkbox', { name: /^Pick / }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('tab', { name: /^All/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Columns ▾' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Section bookmarks' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Needs info/)).not.toBeInTheDocument()
    expect(document.querySelector('.gc-pg-labels')?.textContent).not.toMatch(/^Info/)
    // project card and its figures, as before v1.11 (without Needs info)
    const stats = screen.getByRole('region', { name: 'Project' })
    for (const t of ['To order', 'On order', 'Fully received', 'PO value committed', 'Procurement', 'DNs issued', 'BOQ source']) expect(within(stats).getByText(t)).toBeInTheDocument()
    // one value per cell: PO#, received / ordered and delivered / received are separate cells
    const led = row(/^LPDisplay LPD-BSU63V12/)
    expect(within(led).getByText('PO-00310')).toBeInTheDocument()
    expect(within(led).getByRole('button', { name: /^Received 10 of 10/ })).toBeInTheDocument()
    expect(within(led).getByRole('button', { name: 'DC-00001' })).toBeInTheDocument()
  })

  it('section checkboxes: all ticked on first load (every section shows); unticking hides a section — remembered', async () => {
    const { user, unmount } = await openSchedule()
    const band = (key: string) => document.querySelector(`[data-pg-section="${key}"]`) as HTMLElement
    const box = (label: string) => screen.getByRole('checkbox', { name: `Show ${label}` })
    for (const k of ['purchasing', 'transit', 'delivery', 'payments', 'packages']) expect(band(k)).not.toHaveStyle({ display: 'none' })
    for (const l of ['Purchasing', 'Transit', 'Receiving', 'Payments', 'Packages']) expect(box(l)).toBeChecked() // shown = ticked
    await user.click(box('Purchasing'))
    await user.click(box('Payments'))
    await user.click(box('Packages'))
    expect(box('Purchasing')).not.toBeChecked()
    for (const k of ['purchasing', 'payments', 'packages']) expect(band(k)).toHaveStyle({ display: 'none' })
    for (const k of ['transit', 'delivery']) expect(band(k)).not.toHaveStyle({ display: 'none' })
    expect(JSON.parse(localStorage.getItem('2point0:procurement-columns')!)).toMatchObject({ only: ['transit', 'delivery'] })
    unmount()
    await openSchedule() // remembered after a reload
    expect(document.querySelector('[data-pg-section="purchasing"]')).toHaveStyle({ display: 'none' })
    expect(screen.getByRole('checkbox', { name: 'Show Transit' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Show Purchasing' })).not.toBeChecked()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Show Transit' }))
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Show Receiving' }))
    // none left = back to the default: every section shows, all ticked
    expect(document.querySelector('[data-pg-section="purchasing"]')).not.toHaveStyle({ display: 'none' })
    expect(screen.getByRole('checkbox', { name: 'Show Purchasing' })).toBeChecked()
  })

  it('edits a box field in place: click opens it in the same box, a pick saves to the BOQ and shows the value again', async () => {
    const { user, source } = await openSchedule()
    const update = vi.spyOn(source, 'updateBoq')
    const mode = await editCell(user, 'Mode of transit of UIDESIGN')
    expect(mode.closest('.gc-pg-box')).not.toBeNull()
    await user.selectOptions(mode, 'Air')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '3005', { Mode_of_Transit: 'Air' }))
    expect(await screen.findByRole('button', { name: 'Mode of transit of UIDESIGN' })).toHaveTextContent('Air')
    const eta = await editCell(user, 'ETA date of UIDESIGN')
    ;(await import('@testing-library/react')).fireEvent.change(eta, { target: { value: '2030-02-01' } })
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '3005', { ETA: '01-Feb-2030' }))
  })

  it('Create purchase order is always enabled and opens a left panel that locks one vendor and orders only the ticked lines', async () => {
    const { user, source } = await openSchedule()
    const create = vi.spyOn(source, 'createPurchaseOrder')
    const button = screen.getByRole('button', { name: '+ Create purchase order' })
    expect(button).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: 'Pick UIDESIGN for a purchase order' }))
    expect(screen.getByRole('checkbox', { name: 'Pick HDMI-5M for a purchase order' })).toBeDisabled() // one vendor per PO
    await user.click(screen.getByRole('button', { name: '+ Create purchase order (1)' }))
    const panel = await screen.findByRole('dialog', { name: 'Create purchase order' })
    expect(panel).toHaveClass('gc-side--left')
    expect(document.body.style.overflow).toBe('hidden') // page behind is frozen; the panel scrolls
    expect(within(panel).getByRole('checkbox', { name: 'Order UIDESIGN' })).toBeChecked()
    expect(within(panel).getByRole('combobox', { name: 'Vendor' })).toHaveDisplayValue(/^Uniguest/) // the ticked line's vendor
    expect(within(panel).queryByRole('checkbox', { name: 'Order HDMI-5M' })).not.toBeInTheDocument() // other vendors' lines are not listed
    expect(within(panel).queryByRole('checkbox', { name: 'Order PEC-MK-55' })).not.toBeInTheDocument()
    expect(within(panel).getByDisplayValue('orders@uniguest.example')).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByRole('combobox', { name: /Entity/ })).toHaveValue('6100')) // project country
    await poExtras(user, panel)
    await user.click(within(panel).getByRole('button', { name: 'Save purchase order' }))
    // one short success message; the panel closes by itself
    expect(await screen.findByText('Purchase Order created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create purchase order' })).not.toBeInTheDocument())
    expect(create.mock.calls[0][0]).toMatchObject({ vendorId: '6601', countryId: '6100', termsDays: 30, lines: [{ boqId: '3005', productId: 'p5', lineId: '2013', quantity: 1 }] })
    expect(create.mock.calls[0][0].lines).toHaveLength(1)
    expect(document.body.style.overflow).toBe('')
    expect(await within(row(/^Uniguest UIDESIGN/)).findByText('PO-00313')).toBeInTheDocument()
    expect(row(/^Uniguest UIDESIGN/)).toHaveTextContent(/Ordered/)
  })

  it('PO: reporting tag from the vendor (apply to all or per line) and the in-transit details are required and saved', async () => {
    const { user, source } = await openSchedule()
    const create = vi.spyOn(source, 'createPurchaseOrder')
    await user.click(screen.getByRole('checkbox', { name: 'Pick UIDESIGN for a purchase order' }))
    await user.click(screen.getByRole('button', { name: '+ Create purchase order (1)' }))
    const panel = await screen.findByRole('dialog', { name: 'Create purchase order' })
    await waitFor(() => expect(within(panel).getByRole('combobox', { name: 'Reporting tag of the order' })).toHaveValue('Digital Signage')) // the vendor's tag
    expect(within(panel).getByRole('combobox', { name: 'Reporting tag of UIDESIGN' })).toHaveValue('Digital Signage')
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Reporting tag of UIDESIGN' }), '')
    const save = within(panel).getByRole('button', { name: 'Save purchase order' })
    expect(save).toBeDisabled()
    expect(within(panel).getByText('Select the mode of transit')).toBeInTheDocument()
    expect(within(panel).getByText('UIDESIGN: select the reporting tag')).toBeInTheDocument()
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Reporting tag of the order' }), 'Shared/Overhead')
    await user.click(within(panel).getByRole('button', { name: 'Apply to all lines' }))
    expect(within(panel).getByRole('combobox', { name: 'Reporting tag of UIDESIGN' })).toHaveValue('Shared/Overhead')
    await user.selectOptions(within(panel).getByLabelText(/^Mode of transit/), 'Air')
    fireEvent.change(within(panel).getByLabelText(/^ETA/), { target: { value: '2099-03-01' } })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    expect(await screen.findByText('Purchase Order created')).toBeInTheDocument()
    expect(create.mock.calls[0][0]).toMatchObject({ modeOfTransit: 'Air', eta: '2099-03-01', lines: [{ boqId: '3005', division: 'Shared/Overhead' }] })
    // the BOQ line's Transit section shows them
    await waitFor(() => expect(row(/^Uniguest UIDESIGN/)).toHaveTextContent(/Air/))
  })

  it('shows an info icon on a line with missing values', async () => {
    await openSchedule()
    const icons = screen.getAllByRole('img', { name: /^Missing on / })
    expect(icons.length).toBeGreaterThan(0)
    expect(icons[0]).toHaveTextContent('i') // just the symbol
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(icons[0]) // hover lists the missing details
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Missing')).toBeInTheDocument()
    expect(within(tip).getAllByText(/Transit section|Vendor column|Cost Analysis/).length).toBeGreaterThan(0) // where to fill it
    expect(within(tip).getAllByRole('listitem').length).toBeGreaterThan(0)
    fireEvent.mouseLeave(icons[0])
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('picks lines of another vendor inside the panel and adds them to that vendor’s existing PO', async () => {
    const { user, source } = await openSchedule()
    const create = vi.spyOn(source, 'createPurchaseOrder')
    await user.click(screen.getByRole('button', { name: '+ Create purchase order' }))
    const panel = await screen.findByRole('dialog', { name: 'Create purchase order' })
    expect(within(panel).getByRole('button', { name: 'Save purchase order' })).toBeDisabled() // nothing ticked yet
    expect(within(panel).getByText('Select a vendor to list its lines.')).toBeInTheDocument() // no lines before a vendor
    expect(within(panel).queryByRole('checkbox', { name: 'Order PEC-MK-55' })).not.toBeInTheDocument()
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Vendor' }), within(panel).getByRole('option', { name: /^Peculiar/ }))
    await user.click(within(panel).getByRole('checkbox', { name: 'Order PEC-MK-55' }))
    expect(within(panel).queryByRole('checkbox', { name: 'Order HDMI-5M' })).not.toBeInTheDocument()
    await user.type(within(panel).getByRole('spinbutton', { name: 'Unit cost of PEC-MK-55' }), '350')
    await user.clear(within(panel).getByRole('spinbutton', { name: 'Order qty of PEC-MK-55' }))
    await user.type(within(panel).getByRole('spinbutton', { name: 'Order qty of PEC-MK-55' }), '9')
    expect(within(panel).getByText('PEC-MK-55: only 4 left to order')).toBeInTheDocument()
    await user.clear(within(panel).getByRole('spinbutton', { name: 'Order qty of PEC-MK-55' }))
    await user.type(within(panel).getByRole('spinbutton', { name: 'Order qty of PEC-MK-55' }), '4')
    await user.click(within(panel).getByRole('radio', { name: 'Add to existing PO' }))
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Existing purchase order' }), '4502')
    await poExtras(user, panel)
    await user.click(within(panel).getByRole('button', { name: 'Add to purchase order' }))
    expect(await screen.findByText('Purchase Order updated')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create purchase order' })).not.toBeInTheDocument())
    expect(create.mock.calls[0][0]).toMatchObject({ poId: '4502', vendorId: '6602', lines: [{ boqId: '3006', quantity: 4, rate: 350 }] })
  })

  it('receives goods into a warehouse from the row (Purchase Receive) and updates received quantities', async () => {
    const { user, source } = await openSchedule()
    const receive = vi.spyOn(source, 'receiveGoods')
    const upload = vi.spyOn(source, 'uploadReceiptFile')
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    const panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    expect(panel).toHaveClass('gc-side--left')
    const qty = within(panel).getByRole('spinbutton', { name: 'Receive now — NTB-4K-10-S' })
    expect(qty).toHaveValue(3)
    await user.clear(qty)
    await user.type(qty, '5')
    expect(within(panel).getByText(/only 3 still to receive/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Save receipt' })).toBeDisabled()
    await user.clear(qty)
    await user.type(qty, '3')
    const rack = 'Rack 1 — NTB-4K-10-S'
    await waitFor(() => expect(within(within(panel).getByRole('combobox', { name: rack })).getByRole('option', { name: '1' })).toBeInTheDocument())
    await user.selectOptions(within(panel).getByRole('combobox', { name: rack }), '6910')
    await user.click(within(within(panel).getByRole('radiogroup', { name: 'Pallet for unit 1 — NTB-4K-10-S' })).getByRole('radio', { name: /P01/ }))
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Position 1 — NTB-4K-10-S' }), 'Left')
    // one unit row per received unit; serials for all units or none
    expect(within(panel).getAllByRole('textbox', { name: /^Serial \d — NTB-4K-10-S/ })).toHaveLength(3)
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 1 — NTB-4K-10-S' }), 'NTB-001{Enter}')
    expect(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' })).toHaveFocus() // Enter moves to the next unit
    expect(within(panel).getByText(/enter a serial for every unit received \(1 of 3\)/)).toBeInTheDocument()
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' }), 'NTB-001')
    expect(within(panel).getByText('Serial NTB-001 is entered twice')).toBeInTheDocument()
    await user.clear(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' }))
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' }), 'NTB-002{Enter}NTB-003')
    await user.type(within(panel).getByPlaceholderText("Vendor's delivery note"), 'UNI-554')
    const picker = within(panel).getByLabelText('Supplier delivery note files')
    expect(picker).not.toHaveAttribute('accept') // any format
    expect(within(panel).getByText(/Up to 10 files, 10 MB each\. At least one file is required/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Save receipt' })).toHaveAttribute('title', 'Attach the supplier delivery note (at least one file)') // the file is required
    await user.upload(picker, [
      new File(['%PDF'], 'dn-page1.pdf', { type: 'application/pdf' }),
      new File(['img'], 'photo.jpg', { type: 'image/jpeg' }),
      new File(['a,b'], 'packing list.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    ])
    const list = within(panel).getByRole('list', { name: 'Files to attach' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3) // several files of any format, listed
    expect(within(list).getByText('XLSX')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Remove photo.jpg' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await screen.findByText('Purchase Receive created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Receive goods' })).not.toBeInTheDocument())
    // each file goes into the receipt's Attachments field (multiple files), one upload per file
    await waitFor(() =>
      expect(upload.mock.calls.map((c) => [c[0], c[1].name])).toEqual([
        [receive.mock.calls[0] && expect.any(String), 'dn-page1.pdf'],
        [expect.any(String), 'packing list.xlsx'],
      ]),
    )
    expect(receive.mock.calls[0][0]).toMatchObject({
      poId: '4503',
      supplierDn: 'UNI-554',
      lines: [
        {
          lineId: '4604',
          quantity: 3,
          warehouseId: '6900',
          places: [{ rackId: '6910', segmentId: '6920', position: 'Left', positionNote: '', quantity: 3 }],
          serials: [
            { serialNo: 'NTB-001', mac: '' },
            { serialNo: 'NTB-002', mac: '' },
            { serialNo: 'NTB-003', mac: '' },
          ],
        },
      ],
    })
    expect(await within(row(/^Uniguest NTB-4K-10-S/)).findByRole('button', { name: /^Received 3 of 3/ })).toBeInTheDocument()
    // the receipt's files are listed in Purchase Receives; a click opens the file in a new tab
    await user.click(screen.getByRole('tab', { name: /Purchase Receives/ }))
    const files = await screen.findByRole('list', { name: /^Files of PR-/ })
    expect(within(files).getByRole('button', { name: 'packing list.xlsx' })).toBeInTheDocument()
    expect(within(files).getByRole('button', { name: 'Print dn-page1.pdf' })).toBeInTheDocument()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await user.click(within(files).getByRole('button', { name: 'dn-page1.pdf' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringMatching(/^blob:|^$/), '_blank'))
    open.mockRestore()
  })

  it('receives part of a line, keeps the rest pending, and the next receipt shows only the remaining unit', async () => {
    const { user, source } = await openSchedule()
    const receive = vi.spyOn(source, 'receiveGoods')
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    let panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    const qty = within(panel).getByRole('spinbutton', { name: 'Receive now — NTB-4K-10-S' })
    await user.clear(qty)
    await user.type(qty, '2')
    expect(within(panel).getAllByRole('textbox', { name: /^Serial \d — NTB-4K-10-S/ })).toHaveLength(2) // serials only for the 2 received
    expect(within(panel).getByText(/2 units received now · 1 stay pending/)).toBeInTheDocument()
    // put away into bay A-01-2 at an exact position
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Rack 1 — NTB-4K-10-S' }), '6910')
    await user.click(within(within(panel).getByRole('radiogroup', { name: 'Pallet for unit 1 — NTB-4K-10-S' })).getByRole('radio', { name: /P02/ }))
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Position 1 — NTB-4K-10-S' }), 'Other')
    expect(within(panel).getByText('NTB-4K-10-S: describe the Other position')).toBeInTheDocument()
    await user.type(within(panel).getByRole('textbox', { name: 'Position note 1 — NTB-4K-10-S' }), 'top shelf, behind LED cabinet')
    await attachFile(user, panel, 'Supplier delivery note files')
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await screen.findByText('Purchase Receive created')).toBeInTheDocument()
    expect(receive.mock.calls[0][0].lines[0]).toMatchObject({ quantity: 2, places: [{ segmentId: '6921', position: 'Other', positionNote: 'top shelf, behind LED cabinet', quantity: 2 }] })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Receive goods' })).not.toBeInTheDocument())

    await user.click(await screen.findByRole('button', { name: 'Receive NTB-4K-10-S' }))
    panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    const again = within(panel).getByRole('spinbutton', { name: 'Receive now — NTB-4K-10-S' })
    expect(again).toHaveValue(1) // only the remaining unit
    expect(within(panel).getAllByRole('textbox', { name: /^Serial \d — NTB-4K-10-S/ })).toHaveLength(1)
    await user.clear(again)
    await user.type(again, '2')
    expect(within(panel).getByText(/only 1 still to receive \(ordered 3, received 2\)/)).toBeInTheDocument() // no over-receiving
    expect(within(panel).getByRole('button', { name: 'Save receipt' })).toBeDisabled()
    await user.clear(again)
    await user.type(again, '1')
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Rack 1 — NTB-4K-10-S' }), '6910')
    await user.click(within(within(panel).getByRole('radiogroup', { name: 'Pallet for unit 1 — NTB-4K-10-S' })).getByRole('radio', { name: /P01/ }))
    await attachFile(user, panel, 'Supplier delivery note files')
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await screen.findAllByText('Purchase Receive created')).not.toHaveLength(0)
    expect(await within(row(/^Uniguest NTB-4K-10-S/)).findByRole('button', { name: /^Received 3 of 3/ })).toBeInTheDocument()
  })

  it('serials: the paste box and the rows are one list, and vendor warranty fills start / end with Apply to all', async () => {
    const { user, source } = await openSchedule()
    const receive = vi.spyOn(source, 'receiveGoods')
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    const panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    await user.click(within(panel).getByText('Paste serials'))
    const box = within(panel).getByRole('textbox', { name: 'Paste serials — NTB-4K-10-S' })
    await user.type(box, 'A1{Enter}A2')
    expect(within(panel).getByRole('textbox', { name: 'Serial 1 — NTB-4K-10-S' })).toHaveValue('A1')
    expect(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' })).toHaveValue('A2')
    await user.clear(box) // clearing the box clears the rows — no stale serial stays behind
    expect(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' })).toHaveValue('')
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 1 — NTB-4K-10-S' }), 'B1')
    expect(box).toHaveValue('B1') // typing in a row updates the box
    await user.clear(box)
    const months = within(panel).getByRole('spinbutton', { name: 'Warranty months 1 — NTB-4K-10-S' })
    await user.clear(months)
    await user.type(months, '12')
    await user.click(within(panel).getByRole('button', { name: 'Apply to all' }))
    expect(within(panel).getByRole('spinbutton', { name: 'Warranty months 3 — NTB-4K-10-S' })).toHaveValue(12)
    const start = within(panel).getByLabelText('Warranty start 1 — NTB-4K-10-S') as HTMLInputElement
    expect(within(panel).getByLabelText('Warranty end 1 — NTB-4K-10-S')).not.toHaveTextContent('—')
    await attachFile(user, panel, 'Supplier delivery note files')
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await screen.findByText('Purchase Receive created')).toBeInTheDocument()
    expect(receive.mock.calls[0][0].lines[0].serials[2]).toMatchObject({ serialNo: '', warrantyMonths: '12', warrantyStart: start.value })
  })

  it('a refused list edit shows one error toast with Creator’s message (no second, inline copy)', async () => {
    at('?project_id=1001')
    const { user, source } = renderApp()
    vi.spyOn(source, 'updateTask').mockRejectedValueOnce(new Error('Task_End_Date must be on or after the start date'))
    await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })
    await user.click(tab(/Milestones/))
    await user.click(await screen.findByRole('button', { name: 'Expand MS4 | Project Execution' }))
    const tree = await screen.findByRole('table', { name: 'Tasks of MS4 | Project Execution' })
    const input = await editCell(user, 'AV02 – Configuration duration', within(tree))
    await user.clear(input)
    await user.type(input, '5{Enter}')
    expect(await screen.findAllByText('Task_End_Date must be on or after the start date')).toHaveLength(1)
  })

  it('each serial row picks its own rack and pallet: row 1 applies to the rest, units sharing a pallet become one storage row', async () => {
    const { user, source } = await openSchedule()
    const receive = vi.spyOn(source, 'receiveGoods')
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    const panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    await waitFor(() => expect(within(within(panel).getByRole('combobox', { name: 'Rack 1 — NTB-4K-10-S' })).getByRole('option', { name: '1' })).toBeInTheDocument())
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Rack 1 — NTB-4K-10-S' }), '6910')
    await user.click(within(within(panel).getByRole('radiogroup', { name: 'Pallet for unit 1 — NTB-4K-10-S' })).getByRole('radio', { name: /P01/ }))
    expect(within(panel).getByRole('combobox', { name: 'Rack 3 — NTB-4K-10-S' })).toHaveValue('6910') // follows row 1
    expect(within(panel).getAllByText('Same as #1')).toHaveLength(2)
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Rack 3 — NTB-4K-10-S' }), '6910')
    await user.click(within(within(panel).getByRole('radiogroup', { name: 'Pallet for unit 3 — NTB-4K-10-S' })).getByRole('radio', { name: /P02/ }))
    expect(within(panel).getAllByText('Same as #1')).toHaveLength(1)
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 1 — NTB-4K-10-S' }), 'S-1')
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 2 — NTB-4K-10-S' }), 'S-2')
    await user.type(within(panel).getByRole('textbox', { name: 'Serial 3 — NTB-4K-10-S' }), 'S-3')
    await attachFile(user, panel, 'Supplier delivery note files')
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await screen.findByText('Purchase Receive created')).toBeInTheDocument()
    expect(receive.mock.calls[0][0].lines[0]).toMatchObject({
      quantity: 3,
      places: [
        { rackId: '6910', segmentId: '6920', quantity: 2 },
        { rackId: '6910', segmentId: '6921', quantity: 1 },
      ],
      serials: [
        { serialNo: 'S-1', place: 0 },
        { serialNo: 'S-2', place: 0 },
        { serialNo: 'S-3', place: 1 },
      ],
    })
    await user.click(await within(row(/^Uniguest NTB-4K-10-S/)).findByRole('button', { name: 'Stock of NTB-4K-10-S: 3' }))
    const stock = await screen.findByRole('dialog', { name: 'Stock — NTB-4K-10-S' })
    expect(within(stock).getByRole('row', { name: /2 .*P01.*S-1, S-2/ })).toBeInTheDocument()
    expect(within(stock).getByRole('row', { name: /1 .*P02.*S-3/ })).toBeInTheDocument()
  })

  it('receives direct to site: no put-away, a delivered delivery note takes the units out, no stock', async () => {
    const { user } = await openSchedule()
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    const panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Warehouse' }), '')
    expect(within(panel).getByRole('combobox', { name: 'Rack 1 — NTB-4K-10-S' })).toBeDisabled() // the column shows before a warehouse is picked
    expect(within(panel).getByText(/Select the warehouse above to pick each unit’s rack and pallet/)).toBeInTheDocument()
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Warehouse' }), 'site')
    expect(within(panel).queryByRole('combobox', { name: 'Rack 1 — NTB-4K-10-S' })).not.toBeInTheDocument()
    expect(within(panel).getByText('Direct to site: enter who received the goods at site')).toBeInTheDocument()
    await user.type(within(panel).getByPlaceholderText("Client's name"), 'SIB Facilities')
    await attachFile(user, panel, 'Supplier delivery note files')
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await screen.findByText('Purchase Receive created')).toBeInTheDocument()
    await waitFor(() => expect(within(row(/^Uniguest NTB-4K-10-S/)).getByTitle('Delivered to site / received')).toHaveTextContent('3 / 3'))
    expect(within(row(/^Uniguest NTB-4K-10-S/)).getByRole('button', { name: 'Stock of NTB-4K-10-S: 0' })).toBeInTheDocument()
  })

  it('Payments tab: status sub-tabs, one row per PO, and + Add payment saves to Creator (Payment_Made)', async () => {
    const { user, source } = await openSchedule()
    const add = vi.spyOn(source, 'addPoPayment')
    await user.click(screen.getByRole('tab', { name: /^Payments/ }))
    const sub = screen.getByRole('tablist', { name: 'Payment status' })
    for (const t of ['All', 'Unpaid', 'Partial', 'Overdue']) expect(within(sub).getByRole('tab', { name: t })).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'PO payments' })
    for (const h of ['Vendor', 'PO #', 'PO date', 'PO total (AED)', 'Terms (days)', 'Due date', 'Paid', 'Balance', 'Status'])
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument()
    await waitFor(() => expect(within(table).getByRole('row', { name: /LPDisplay PO-00310/ })).toHaveTextContent('5,000.00'))
    await user.click(within(table).getByRole('button', { name: /Uniguest/ }))
    const ledger = screen.getByRole('region', { name: 'Payment ledger PO-00312' })
    expect(within(ledger).getByText('No payments recorded.')).toBeInTheDocument()
    await user.click(within(ledger).getByRole('button', { name: '+ Add payment' }))
    await user.type(within(ledger).getByLabelText(/^Amount/), '1200.50')
    await user.type(within(ledger).getByLabelText('Reference'), 'TT-9')
    await user.click(within(ledger).getByRole('button', { name: 'Save payment' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({ poId: '4503', amount: 1200.5, reference: 'TT-9' })))
    expect(await within(ledger).findByText('1,200.50')).toBeInTheDocument()
    // past its due date with a balance left → Overdue (as the reference), so it leaves Unpaid
    await user.click(within(sub).getByRole('tab', { name: 'Overdue' }))
    expect(within(table).getByRole('row', { name: /Uniguest PO-00312/ })).toBeInTheDocument()
    await user.click(within(sub).getByRole('tab', { name: 'Unpaid' }))
    expect(within(table).queryByRole('row', { name: /Uniguest PO-00312/ })).not.toBeInTheDocument()
  })

  it('offers bulk status', async () => {
    await openSchedule()
    expect(screen.getByRole('button', { name: 'Bulk status ▾' })).toBeInTheDocument()
  })

  it('shows the records as one sheet per tab: Item, Description, Quantity and Amount columns, one row per item', async () => {
    const { user } = await openSchedule()
    for (const [tab, name] of [
      [/^Purchase Orders/, 'Purchase orders'],
      [/^Purchase Receives/, 'Purchase receives'],
      [/^Delivery Notes/, 'Delivery notes'],
      [/^In Warehouse/, 'In warehouse'],
    ] as const) {
      await user.click(screen.getByRole('tab', { name: tab }))
      const sheet = await screen.findByRole('table', { name })
      expect(sheet).toHaveClass('gc-sheet-grid')
      for (const h of ['Item', 'Description', 'Quantity', /^Amount \(AED\)/]) expect(within(sheet).getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('tab', { name: /^Purchase Orders/ }))
    const pos = await screen.findByRole('table', { name: 'Purchase orders' })
    expect(
      within(pos)
        .getAllByRole('row')
        .filter((r) => within(r).queryByText('PO-00311')).length,
    ).toBeGreaterThan(1) // the PO number on each of its item rows
  })

  it('refuses a serial number that was already received', async () => {
    const { source } = await openSchedule()
    const base = { poId: '4503', date: '', supplierDn: '', notes: '', siteReceivedBy: '' }
    const line = { lineId: '4604', quantity: 1, warehouseId: '6900', places: [] }
    await source.receiveGoods({ ...base, lines: [{ ...line, serials: [{ serialNo: 'DUP-1', mac: '' }] }] })
    await expect(source.receiveGoods({ ...base, lines: [{ ...line, serials: [{ serialNo: 'DUP-1', mac: '' }] }] })).rejects.toThrow('Serial DUP-1 already exists in another receive')
    await expect(source.receiveGoods({ ...base, lines: [{ ...line, quantity: 5, serials: [] }] })).rejects.toThrow(/more than the 2 still to receive/)
  })

  it('delivery note: a file and every line’s reporting tag are required; the files go into its Attachments and open from the sheet', async () => {
    const { user, source } = await openSchedule()
    const create = vi.spyOn(source, 'createDeliveryNote')
    const upload = vi.spyOn(source, 'uploadDeliveryNoteFile')
    await user.click(screen.getByRole('button', { name: 'Create delivery note' }))
    const panel = await screen.findByRole('dialog', { name: 'Create delivery note' })
    await user.click(within(panel).getByRole('checkbox', { name: 'Deliver LED Mount I' }))
    const save = within(panel).getByRole('button', { name: 'Create delivery note' })
    expect(save).toBeDisabled()
    expect(within(panel).getByText('Attach the delivery note file (at least one file)')).toBeInTheDocument()
    expect(within(panel).getByText(/select the reporting tag/)).toBeInTheDocument()
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Reporting tag of LED Mount I' }), 'Audio Visual')
    await attachFile(user, panel, 'Delivery note files')
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)
    expect(await screen.findByText('Delivery Note created')).toBeInTheDocument()
    expect(create.mock.calls[0][0].lines[0]).toMatchObject({ division: 'Audio Visual' })
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ name: 'supplier-dn.pdf' })))
    await user.click(screen.getByRole('tab', { name: /Delivery Notes/ }))
    expect(await screen.findByRole('button', { name: 'supplier-dn.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print supplier-dn.pdf' })).toBeInTheDocument()
  })

  it('creates a delivery note from received stock only and marks it delivered (received by required)', async () => {
    const { user, source } = await openSchedule()
    const dn = vi.spyOn(source, 'updateDeliveryNote')
    await user.click(screen.getByRole('button', { name: 'Create delivery note' }))
    const panel = await screen.findByRole('dialog', { name: 'Create delivery note' })
    expect(within(panel).queryByRole('checkbox', { name: /Deliver NTB/ })).not.toBeInTheDocument() // nothing received yet
    expect(within(panel).getByText(/LPD-BSU63V12 \(fully delivered\)/)).toBeInTheDocument()
    await user.click(within(panel).getByRole('checkbox', { name: 'Deliver LED Mount I' }))
    expect(within(panel).getByRole('spinbutton', { name: 'Qty to deliver — LED Mount I' })).toHaveValue(10)
    await dnExtras(user, panel)
    await user.click(within(panel).getByRole('button', { name: 'Create delivery note' }))
    expect(await screen.findByText('Delivery Note created')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create delivery note' })).not.toBeInTheDocument())
    await user.click((await screen.findAllByRole('button', { name: 'DC-00002' }))[0])
    const note = await screen.findByRole('dialog', { name: 'DC-00002' })
    expect(within(note).getByRole('combobox', { name: 'Delivery note status' })).toHaveDisplayValue('Draft')
    // every status, in the Status form's Order
    expect(
      within(within(note).getByRole('combobox', { name: 'Delivery note status' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Draft', 'Ready to Dispatch', 'Dispatched', 'Partially Delivered', 'Delivered', 'Cancelled'])
    await user.selectOptions(within(note).getByRole('combobox', { name: 'Delivery note status' }), 'Delivered')
    expect(within(note).getByRole('button', { name: 'Set Delivered' })).toBeDisabled()
    await user.type(within(note).getByPlaceholderText('Name at site (for Delivered)'), 'SIB Facilities')
    await user.click(within(note).getByRole('button', { name: 'Set Delivered' }))
    await waitFor(() => expect(dn).toHaveBeenCalledWith(expect.objectContaining({ statusIndex: 67, receivedBy: 'SIB Facilities' })))
    await user.click(within(await screen.findByRole('dialog', { name: 'DC-00002' })).getAllByRole('button', { name: 'Close' })[0])
    expect(within(row(/^Peculiar LED Mount I/)).getByTitle('Delivered to site / received')).toHaveTextContent('10 / 10')
  })

  it('delivery notes show the Purchase Receive and storage the goods come from, and download as a PDF', async () => {
    const { user } = await openSchedule()
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    const receive = await screen.findByRole('dialog', { name: 'Receive goods' })
    const rack = 'Rack 1 — NTB-4K-10-S'
    await waitFor(() => expect(within(within(receive).getByRole('combobox', { name: rack })).getByRole('option', { name: '1' })).toBeInTheDocument())
    await user.selectOptions(within(receive).getByRole('combobox', { name: rack }), '6910')
    await user.click(within(within(receive).getByRole('radiogroup', { name: 'Pallet for unit 1 — NTB-4K-10-S' })).getByRole('radio', { name: /P01/ }))
    await attachFile(user, receive, 'Supplier delivery note files')
    await user.click(within(receive).getByRole('button', { name: 'Save receipt' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Receive goods' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Create delivery note' }))
    const create = await screen.findByRole('dialog', { name: 'Create delivery note' })
    expect(
      within(create)
        .getAllByTitle(/^Stored by PR-/)
        .map((e) => e.textContent)
        .join(' | '),
    ).toMatch(/P01.*3 in stock · PR-/) // where to pick it in the warehouse
    await user.click(within(create).getByRole('checkbox', { name: /Deliver NTB-4K-10-S/ }))
    await user.type(within(create).getByRole('textbox', { name: 'Customer notes' }), 'Handle with care')
    await dnExtras(user, create)
    await user.click(within(create).getByRole('button', { name: 'Create delivery note' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create delivery note' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('tab', { name: /^Delivery Notes/ })) // the records are tabs: Purchase Orders · Purchase Receives · Delivery Notes · In Warehouse
    const dnSheet = await screen.findByRole('table', { name: 'Delivery notes' })
    expect(
      within(dnSheet)
        .getAllByRole('row')
        .find((r) => within(r).queryByRole('button', { name: 'DC-00002' })),
    ).toHaveTextContent(/PR-\S+.*P01/)
    await user.click((await screen.findAllByRole('button', { name: 'DC-00002' }))[0])
    const note = await screen.findByRole('dialog', { name: 'DC-00002' })
    expect(within(note).getByRole('columnheader', { name: 'From (receipt / storage)' })).toBeInTheDocument()
    const created = vi.fn((_b: Blob) => 'blob:dn')
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() })
    await user.click(within(note).getByRole('button', { name: /Download/ }))
    await waitFor(() => expect(clicked).toHaveBeenCalled())
    await waitFor(() => expect(created).toHaveBeenCalled())
    const pdf = created.mock.calls[0][0]
    expect(pdf.type).toBe('application/pdf')
    const text = await new Promise<string>((ok) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result))
      r.readAsBinaryString(pdf)
    })
    for (const part of ['2Point0concepts', 'Organization address from Zoho Books', 'CUSTOMER', 'Sharjah Islamic Bank', 'SIB Tower', 'DELIVER TO', 'CUSTOMER NOTES', 'Handle with care'])
      expect(text).toContain(part)
    clicked.mockRestore()
  })

  it('the eye icon shows / hides Pick and the core PO columns and remembers it', async () => {
    const { user, unmount } = await openSchedule()
    await user.click(screen.getByRole('button', { name: 'Show or hide PO columns' }))
    const box = screen.getByRole('dialog', { name: 'Show or hide PO columns' })
    for (const name of ['Pick', 'Vendor', 'Category', 'Type', 'Brand', 'Model', 'SKU', 'Item Description']) expect(within(box).getByRole('checkbox', { name })).toBeChecked()
    await user.click(within(box).getByRole('checkbox', { name: 'Pick' }))
    await user.click(within(box).getByRole('checkbox', { name: 'Brand' }))
    await user.click(within(box).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('columnheader', { name: 'Pick' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Brand' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Procurement schedule' })).getByRole('columnheader', { name: 'Vendor' })).toBeInTheDocument()
    unmount()
    await openSchedule()
    expect(screen.queryByRole('columnheader', { name: 'Pick' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show or hide PO columns' }))
    const again = screen.getByRole('dialog', { name: 'Show or hide PO columns' })
    await user.click(within(again).getByRole('checkbox', { name: 'Show/Hide Columns' })) // part hidden → all shown
    await user.click(within(again).getByRole('checkbox', { name: 'Show/Hide Columns' })) // → all cleared
    expect(within(again).getByRole('button', { name: 'Done' })).toBeDisabled() // at least one column stays
  })

  it('shows Creator errors in the panel and keeps the entered values', async () => {
    const { user, source } = await openSchedule()
    vi.spyOn(source, 'receiveGoods').mockRejectedValueOnce(new Error('Purchase order not found'))
    await user.click(screen.getByRole('button', { name: 'Receive NTB-4K-10-S' }))
    const panel = await screen.findByRole('dialog', { name: 'Receive goods' })
    await attachFile(user, panel, 'Supplier delivery note files')
    await user.click(within(panel).getByRole('button', { name: 'Save receipt' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Purchase order not found')
    expect(within(panel).getByRole('spinbutton', { name: 'Receive now — NTB-4K-10-S' })).toHaveValue(3)
  })

  it('shows empty states for a project without BOQ lines', async () => {
    at('?procurement_project_id=1003')
    const { user } = renderApp()
    expect(await screen.findByText(/No BOQ lines for this project/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create delivery note' }))
    expect(await screen.findByText(/Nothing to deliver/)).toBeInTheDocument()
  })
})

describe('File preview', () => {
  it('an image opens in the widget viewer with the right image type (Creator sends octet-stream)', async () => {
    const { openFile, fileBlob } = await import('@/features/console/openFile')
    const { FilePreview } = await import('@/features/console/FilePreview')
    expect(fileBlob(new Blob(['x'], { type: 'application/octet-stream' }), 'site photo.JPG')?.type).toBe('image/jpeg')
    expect(fileBlob({ data: new Blob(['x']) }, 'scan.png')?.type).toBe('image/png')
    const urls = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-1')
    const open = vi.spyOn(window, 'open')
    render(<FilePreview />)
    await openFile(() => Promise.resolve(new Blob(['x'])), '', 'site photo.jpg', false)
    const dialog = await screen.findByRole('dialog', { name: 'Preview of site photo.jpg' })
    expect(within(dialog).getByRole('img', { name: 'site photo.jpg' })).toHaveAttribute('src', 'blob:preview-1')
    expect(open).not.toHaveBeenCalled() // no new tab for an image
    expect(within(dialog).getByRole('link', { name: 'Open in new tab' })).toHaveAttribute('href', 'blob:preview-1')
    urls.mockRestore()
    open.mockRestore()
  })
})

describe('File download', () => {
  it('a file the browser cannot show (Excel) downloads under its own name instead of opening as text, and has no Print', async () => {
    const { openFile, canView } = await import('@/features/console/openFile')
    expect(canView('1794298271719850_Expense_tag_update_status.xlsx')).toBe(false)
    expect(canView('scan.pdf')).toBe(true)
    const urls = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xlsx-1')
    const open = vi.spyOn(window, 'open')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Expense_tag_update_status.xlsx')
      expect(this.href).toBe('blob:xlsx-1')
    })
    await openFile(() => Promise.resolve(new Blob(['PK'], { type: 'text/plain' })), '', '1794298271719850_Expense_tag_update_status.xlsx', false)
    expect(click).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled() // no tab of raw bytes
    urls.mockRestore()
    open.mockRestore()
    click.mockRestore()
  })
})
