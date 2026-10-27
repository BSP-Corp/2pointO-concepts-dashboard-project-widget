import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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
    expect(await screen.findByRole('region', { name: 'Completion' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Employees' })).toHaveTextContent('5 team assignments')
    expect(source.calls.listTasks).toBeUndefined() // aggregates only — no project records

    await user.click(screen.getByRole('button', { name: /^Open PR_26040 SIB/ }))
    expect(window.location.search).toBe('?project_id=1001')
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })).toBeInTheDocument()
  })

  it('Search by reference lists matching estimates and opens their Cost Analysis, approved or not', async () => {
    const { user, source } = renderApp()
    const nav = vi.spyOn(source, 'navigate')
    const box = await screen.findByRole('combobox', { name: 'Search by reference' })
    expect(box).toHaveAttribute('title', 'Search by project reference')
    await waitFor(() => expect(box).toBeEnabled())
    await user.type(box, 'pr-26')
    const list = await screen.findByRole('listbox', { name: 'Matching references' })
    const options = within(list).getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    await user.click(options[options.length - 1])
    expect(nav).toHaveBeenLastCalledWith(expect.stringMatching(/^#Page:Cost_Analysis_Page\?quo_id=\d+&act_ion=create$/))
  })
})

describe('Home — Go To, user and theme', () => {
  it('Go To lists approved projects only and opens the Project Widget', async () => {
    const { user } = renderApp()
    expect(await screen.findByText('Demo User')).toBeInTheDocument()
    expect(screen.getByText('Go To')).toBeInTheDocument()
    const goTo = screen.getByRole('combobox', { name: 'Approved project' })
    await waitFor(() => expect(goTo).toBeEnabled())
    expect(within(goTo).queryByRole('option', { name: /4300/ })).not.toBeInTheDocument()
    await user.selectOptions(goTo, '1001')
    expect(window.location.search).toBe('?project_id=1001')
  })

  it('keeps the theme switch at the top right, beside the signed-in user, on every page', async () => {
    const { unmount } = renderApp()
    await screen.findByText('Demo User')
    const bar = screen.getByRole('button', { name: /Switch to (dark|light) mode/ }).closest('.gc-userbar')!
    expect(bar).toHaveTextContent('Demo User')
    unmount()
    await openProject()
    expect(screen.getByRole('button', { name: /Switch to (dark|light) mode/ }).closest('.gc-userbar')).not.toBeNull()
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

  it('a refresh keeps the project and tab; the breadcrumb returns to Project Search', async () => {
    const { user, unmount } = await openProject()
    await user.click(tab(/^Procurement/))
    unmount()

    renderApp() // page refresh: same URL
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })).toBeInTheDocument()
    expect(tab(/^Procurement/)).toHaveAttribute('aria-selected', 'true')
    await userEvent.setup().click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Project Search' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('shows View Estimate for a linked estimate and Edit Project', async () => {
    at('?project_id=1001')
    renderApp()
    expect(await screen.findByRole('button', { name: /View Estimate · QT-26-0040/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Project' })).toBeInTheDocument()
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
    expect(screen.getByText('Omar Haddad')).toBeInTheDocument()
    expect(screen.getByText('Stage: Partially Delivered')).toBeInTheDocument()
    expect(screen.getByText(/54 days left/)).toBeInTheDocument()

    await user.click(tab(/^Procurement/))
    const panel = screen.getByRole('tabpanel')
    for (const col of ['Vendor details', 'Status', 'Start', 'End', 'Completion', 'Assigned person']) expect(within(panel).getAllByRole('columnheader', { name: new RegExp(col) }).length).toBeGreaterThan(0)
    expect(within(panel).queryByRole('columnheader', { name: /Unit price|Total price/i })).not.toBeInTheDocument()
  })

  it('shows tab counts that match the displayed rows', async () => {
    const { user } = await openProject()
    await waitFor(() => expect(tab(/Tasks/)).toHaveTextContent('Tasks9')) // tasks + subtasks; the 4 task lists are not counted
    await waitFor(() => expect(tab(/^Procurement/)).toHaveTextContent('Procurement5'))
    await waitFor(() => expect(tab(/Milestones/)).toHaveTextContent('Milestones3')) // Milestone records
    expect(tab(/Asset Register/)).toHaveTextContent('Asset Register13')
    await user.click(tab(/Tasks/))
    await user.click(screen.getByRole('button', { name: 'All' }))
    const tree = screen.getByRole('table', { name: 'Tasks by task list' })
    expect(within(tree).getAllByRole('row').length - 1).toBe(4 + 9) // 4 task lists + 9 tasks / subtasks
  })

  it('answers the Overview questions and flags data issues on the Tasks tab', async () => {
    const { user } = await openProject()
    await waitFor(() => expect(kpi('Tasks planned today')).toHaveTextContent('4'))
    expect(screen.getByRole('region', { name: 'Assigned team' })).toHaveTextContent('3 technicians · 2 users')
    expect(screen.getAllByText('On site today').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'View all tasks' }))
    expect(tab(/Tasks/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Not on the project team: Harish Kunju/)).toBeInTheDocument()
    expect(screen.getAllByText(/Due date is before the start date/).length).toBeGreaterThan(0)
  })
})

describe('Project Widget — status pipeline', () => {
  it('moves to the next stage, and needs a reason to move back', async () => {
    const { user } = await openProject()
    expect(screen.getByText(/Stage 5 of 14/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Move to Ready for Installation/ }))
    expect(await screen.findByText('Stage: Ready for Installation')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Move back to Partially Delivered/ }))
    const dialog = screen.getByRole('dialog', { name: 'Move back to Partially Delivered' })
    expect(document.body.style.overflow).toBe('hidden') // background locked while the popup is open
    expect(within(dialog).getByRole('button', { name: 'Move back' })).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'Client postponed installation')
    await user.click(within(dialog).getByRole('button', { name: 'Move back' }))
    expect(await screen.findByText('Stage: Partially Delivered')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Status history/ }))
    expect(await screen.findByText('Reason: Client postponed installation')).toBeInTheDocument()
  })
})

describe('Project Widget — procurement', () => {
  it('opens the Procurement Schedule in its own page and comes back', async () => {
    const { user } = await openProject()
    await user.click(tab(/^Procurement/))
    await user.click(await screen.findByRole('button', { name: /Open Procurement/ }))
    expect(window.location.search).toBe('?procurement_project_id=1001')
    expect(await screen.findByText('Procurement Schedule', { selector: '[aria-current]' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← Back to project' }))
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })).toBeInTheDocument()
  })

  it('creates a PO for a BOQ line and lists it', async () => {
    const { user, source } = await openProject()
    const create = vi.spyOn(source, 'createPurchaseOrder')
    await user.click(tab(/^Procurement/))
    await user.click(await screen.findByRole('button', { name: '+ Create PO' }))
    const dialog = screen.getByRole('dialog', { name: 'Create purchase order' })
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Uniguest' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Vendor/ }), 'Uniguest')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Country/ }), 'United Arab Emirates')
    await user.click(within(dialog).getByRole('checkbox', { name: /Order User Interface Customization/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Create PO' }))
    expect(await screen.findByText(/was created in Creator/)).toBeInTheDocument()
    expect(create.mock.calls[0][0]).toMatchObject({ vendorId: '6601', lines: [{ boqId: '3005', productId: 'p5', quantity: 1 }] })
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect((await screen.findAllByText('PO-00313')).length).toBeGreaterThan(0)
  })
})

describe('Project Widget — Asset Register inline dates', () => {
  it('edits a task start / end date inline and saves it', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Asset Register/))
    await user.click(await screen.findByRole('button', { name: /AV02: \[DS-01/ }))
    const input = await editCell(user, 'AV02 – Procurement & Delivery end date')
    const fire = (await import('@testing-library/react')).fireEvent
    fire.change(input, { target: { value: '2030-01-15' } })
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7101', { Task_End_Date: '15-Jan-2030' }))
    expect(await screen.findByRole('button', { name: 'AV02 – Procurement & Delivery end date' })).toHaveTextContent('15 Jan 2030')
  })
})

describe('Project Widget — Risk Register', () => {
  it('shows the Risk Dashboard KPIs and adds / edits a Project_Risk record with calculated score and severity', async () => {
    const { user, source } = await openProject()
    const save = vi.spyOn(source, 'saveRisk')
    await user.click(tab(/Risk Register/))
    await waitFor(() => expect(kpi('Total risks')).toHaveTextContent('3'))
    expect(kpi('Active risks')).toHaveTextContent('2')
    expect(kpi('Average risk score')).toHaveTextContent('16 / 25') // (12 + 20) / 2, Closed Risk excluded

    await user.click(screen.getByRole('button', { name: '+ Add risk' }))
    let dialog = screen.getByRole('dialog', { name: 'Add risk' })
    await user.type(within(dialog).getByLabelText('Risk Description'), 'Late site access')
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Select Probability and Impact')
    await user.selectOptions(within(dialog).getByLabelText(/^Probability/), 'High')
    await user.selectOptions(within(dialog).getByLabelText(/^Impact/), 'Severe')
    expect(within(dialog).getByText('Critical')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('option', { name: '2point0 Management' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByLabelText('Department'), '2point0 Management')
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(save.mock.calls[0]).toEqual(['1001', undefined, { Risk_Description: 'Late site access', Probability: 'High', Impact: 'Severe', Department: 'd3' }])
    expect(await screen.findByRole('button', { name: 'R - 4 description' })).toHaveTextContent('Late site access')
    expect(kpi('Total risks')).toHaveTextContent('4')

    await user.click(screen.getByRole('button', { name: 'Edit R - 4' }))
    dialog = screen.getByRole('dialog', { name: /Edit risk · R - 4/ })
    await user.selectOptions(within(dialog).getByLabelText(/^Impact/), 'Minor')
    await user.click(within(dialog).getByRole('button', { name: 'Update' }))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('1001', expect.any(String), { Impact: 'Minor' }))

    await user.click(tab(/Risk Dashboard/))
    expect(await screen.findByRole('region', { name: 'Risks by status' })).toBeInTheDocument()
    expect(kpi('Total risks')).toHaveTextContent('4')
  })
})

describe('Project Widget — milestones, tasks and activity', () => {
  it('lists milestones with dates from the project start, edits Duration in place and logs it in the Activity stream', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateMilestone')
    await user.click(tab(/Milestones/))
    const list = await screen.findByRole('table', { name: 'Milestones' })
    expect(within(list).getByText('MS3 | Project Procurement')).toBeInTheDocument()
    expect(within(list).getAllByText(/days ago/).length).toBeGreaterThan(0) // MS3 ended 6 days ago → Delayed
    expect(within(list).getAllByText('Delayed').length).toBeGreaterThan(0)

    const input = await editCell(user, 'MS4 | Project Execution duration', within(list))
    await user.clear(input)
    await user.type(input, '30{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '6102', { Duration: 30 }))
    expect(await screen.findByText('Milestone updated')).toBeInTheDocument()

    // expand a milestone: its task lists (one per work package) → tasks → subtasks
    await user.click(within(list).getByRole('button', { name: 'Expand MS4 | Project Execution' }))
    const tree = await screen.findByRole('table', { name: 'Tasks of MS4 | Project Execution' })
    expect(within(tree).getAllByRole('button', { name: 'TL | Project Execution task name' })).toHaveLength(2)
    expect(within(tree).getByRole('button', { name: 'Mounts & Brackets task name' })).toBeInTheDocument()

    await user.click(tab(/Activity/))
    expect(await screen.findByText('MS4 | Project Execution')).toBeInTheDocument()
    expect(screen.getByText(/duration updated From 25 to 30/)).toBeInTheDocument()
  })

  it('changes a task duration in the task tree and moves its due date with it', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Tasks/))
    const tree = await screen.findByRole('table', { name: 'Tasks by task list' })
    const input = await editCell(user, 'AV02 – Configuration duration', within(tree))
    await user.clear(input)
    await user.type(input, '5')
    await user.click(document.body) // leaving the cell saves it (no detail page)
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7104', expect.objectContaining({ Duration: 5, Task_End_Date: expect.any(String) })))
    expect(await screen.findByText('Task updated')).toBeInTheDocument()
  })

  it('changes the vendor of a procurement line from the list', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateBoq')
    await user.click(tab(/^Procurement/))
    const select = await editCell(user, /vendor$/)
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Peculiar' })).toBeInTheDocument())
    await user.selectOptions(select, 'Peculiar')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', expect.any(String), { Vendors: '6602' }))
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
    await user.click(tab(/Risk Register/))
    expect(await screen.findByText('No records for this project')).toBeInTheDocument()
  })

  it('edits the project in the Steps form and saves only the changed field', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateProject')
    await user.click(await screen.findByRole('button', { name: 'Edit Project' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit SIB RAK Branch/ })
    const name = await within(dialog).findByLabelText('Project Name')
    await user.clear(name)
    await user.type(name, 'SIB RAK Branch – Signage')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(update).toHaveBeenCalledWith('1001', { Project_Name: 'SIB RAK Branch – Signage' }, undefined)
    expect(await screen.findByRole('heading', { name: 'SIB RAK Branch – Signage' })).toBeInTheDocument()
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
    await user.click(tab(/Risk Register/))
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
    await user.click(await screen.findByRole('button', { name: 'Asset list' }))
    const serial = await editCell(user, /^Serial number of /)
    await user.clear(serial)
    await user.type(serial, 'SN-TEST-001{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', expect.any(String), { Serial_Number: 'SN-TEST-001' }))
    first.unmount()

    // reload: a fresh widget reads the record again from the data source
    render(<App source={source} client={createQueryClient()} />)
    await screen.findByRole('heading', { name: 'SIB RAK Branch – Digital Signage' })
    await user.click(tab(/Asset Register/))
    await user.click(await screen.findByRole('button', { name: 'Asset list' }))
    expect((await screen.findAllByRole('button', { name: /^Serial number of / }))[0]).toHaveTextContent('SN-TEST-001')
  })

  it('renames a task straight from the task list', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Tasks/))
    const name = await editCell(user, 'AV02 – Configuration task name')
    await user.clear(name)
    await user.type(name, 'AV02 – Configuration & tuning{Enter}')
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '7104', { Task_Name: 'AV02 – Configuration & tuning' }))
  })
})

describe('Theme, popup editing and milestone ↔ task list mapping', () => {
  it('opens in Light theme even when the OS prefers dark; Dark only after the user picks it', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('dark'), media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList)
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Home' })
    expect(document.documentElement.dataset.theme).toBe('light')
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    mm.mockRestore()
  })

  it('edits fields in the task popup and saves them with Save', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateTask')
    await user.click(tab(/Tasks/))
    await user.click(await screen.findByRole('button', { name: 'Open AV02 – Configuration' }))
    const dialog = await screen.findByRole('dialog', { name: 'AV02 – Configuration' })
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
    await user.click(tab(/Tasks/))
    expect(await editCell(user, 'AV02 – Configuration task name')).toBeEnabled()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Open AV02 – Configuration' }))
    const dialog = await screen.findByRole('dialog', { name: 'AV02 – Configuration' })
    expect(within(dialog).getByLabelText('Task description')).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
    await user.click(tab(/^Procurement/))
    expect(await editCell(user, /vendor$/)).toBeEnabled()
  })

  it('maps a task list to a milestone from the task list row and from the milestone row', async () => {
    const { user, source } = await openProject()
    const update = vi.spyOn(source, 'updateMilestone')
    await user.click(tab(/Tasks/))
    expect((await screen.findAllByRole('button', { name: 'TL | Project Sign-Off milestone' }))[0]).toHaveTextContent('MS6 | Project Sign-Off')
    const list = await editCell(user, 'TL | Project Sign-Off milestone')
    await user.selectOptions(list, '6102') // MS4 takes the Sign-Off task list (replaces Project Execution)
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '6103', { Task_List: '' }))
    expect(update).toHaveBeenCalledWith('1001', '6102', { Task_List: '3203' })

    await user.click(tab(/Milestones/))
    const ms6 = await editCell(user, 'MS6 | Project Sign-Off task list')
    await user.selectOptions(ms6, '3204')
    await waitFor(() => expect(update).toHaveBeenLastCalledWith('1001', '6103', { Task_List: '3204' }))
  })
})

describe('Procurement Schedule page (compact list + popups)', () => {
  const openSchedule = async () => {
    at('?procurement_project_id=1001')
    const r = renderApp()
    await screen.findByRole('table', { name: 'Procurement schedule' })
    return r
  }

  it('shows a compact list (no wide grid) with the To order / In progress / Received tabs; a row opens all its details in a popup', async () => {
    const { user } = await openSchedule()
    const list = screen.getByRole('table', { name: 'Procurement schedule' })
    expect(within(list).getAllByRole('columnheader')).toHaveLength(7)
    expect(screen.getByRole('tab', { name: 'All 5' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'To order 1' }))
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1)
    await user.click(screen.getByRole('tab', { name: 'All 5' }))
    await user.click(screen.getByRole('button', { name: 'Details of LPD-BSU63V12' }))
    const dialog = await screen.findByRole('dialog', { name: 'LPD-BSU63V12' })
    for (const section of ['Core data', 'Purchasing', 'Transit', 'Receiving']) expect(within(dialog).getByRole('region', { name: section })).toBeInTheDocument()
    expect(within(dialog).getByText('PO-00310')).toBeInTheDocument()
  })

  it('edits Transit fields in the popup and saves only the changed values to the BOQ record', async () => {
    const { user, source } = await openSchedule()
    const update = vi.spyOn(source, 'updateBoq')
    await user.click(screen.getByRole('button', { name: 'Details of UIDESIGN' }))
    const dialog = await screen.findByRole('dialog', { name: 'UIDESIGN' })
    await user.selectOptions(within(dialog).getByLabelText('UIDESIGN mode'), 'Air')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith('1001', '3005', { Mode_of_Transit: 'Air' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('raises a PO for ticked lines of one vendor: Creator first, then Books, and writes PO# and status back to the line', async () => {
    const { user, source } = await openSchedule()
    const create = vi.spyOn(source, 'createPurchaseOrder')
    await user.click(screen.getByRole('checkbox', { name: 'Select UIDESIGN' }))
    expect(screen.getByRole('checkbox', { name: 'Select LPD-BSU63V12' })).toBeDisabled() // one vendor per PO
    await user.click(screen.getByRole('button', { name: /Create purchase order/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Create purchase order' })
    expect(within(dialog).getByText('Vendor: Uniguest')).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('orders@uniguest.example')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'United Arab Emirates' })).toBeInTheDocument())
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Entity/ }), 'United Arab Emirates')
    await user.click(within(dialog).getByRole('button', { name: 'Save purchase order' }))
    expect(await within(dialog).findByText(/was created in Zoho Creator/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Not synced to Zoho Books yet/)).toBeInTheDocument()
    expect(create.mock.calls[0][0]).toMatchObject({ vendorId: '6601', termsDays: 30, lines: [{ boqId: '3005', productId: 'p5', lineId: '2013', quantity: 1 }] })
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('PO-00313')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Details of UIDESIGN' }).closest('tr')).toHaveTextContent(/Ordered/)
  })
})
