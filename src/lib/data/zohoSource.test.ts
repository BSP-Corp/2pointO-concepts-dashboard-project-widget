import { describe, expect, it, vi } from 'vitest'
import { seedProjects } from './seed'
import { NotFoundError, createZohoSource } from './zohoSource'

type Sdk = Parameters<typeof createZohoSource>[0]
type Cfg = { api_name: string; http_method: string; payload?: { quo_data: string }; query_params?: string }

/** Fake SDK: invokeCustomApi answers like Creator ({code:3000, result:{…}}). */
function fakeSdk(handler: (api: string, req: Record<string, unknown>) => unknown) {
  const calls: (Cfg & { req: Record<string, unknown> })[] = []
  const sdk = {
    DATA: {
      invokeCustomApi: vi.fn((cfg: Cfg) => {
        const raw = cfg.payload ? cfg.payload.quo_data : decodeURIComponent(cfg.query_params!.replace(/^quo_data=/, ''))
        const req = JSON.parse(raw)
        calls.push({ ...cfg, req })
        return Promise.resolve({ code: 3000, result: handler(cfg.api_name, req) })
      }),
    },
    UTIL: {
      getInitParams: () => Promise.resolve({ scope: 'owner', appLinkName: 'point0concepts', envUrlFragment: '/environment/development' }),
      getQueryParams: () => Promise.resolve({ project_id: '1001' }),
      navigateParentUrl: vi.fn(),
    },
  } as unknown as Sdk
  return { sdk, calls }
}

describe('Zoho source — custom functions only', () => {
  it('reads projects through Widget_Project_Console (GET query string)', async () => {
    const { sdk, calls } = fakeSdk(() => ({ status: 'success', records: [seedProjects[0]] }))
    const [p] = await createZohoSource(sdk).listProjects()
    expect(p.reference).toBe('PR_26040')
    expect(calls[0]).toMatchObject({ api_name: 'Widget_Project_Console', http_method: 'GET', req: { action: 'projects' } })
  })

  it('reads the dashboard, details and tasks from their functions', async () => {
    const { sdk, calls } = fakeSdk((api) =>
      api === 'Widget_Project_Dashboard'
        ? { status: 'success', records: [{ ID: '1', Project_Reference: 'PR_1', tasks_total: 4, tasks_done: 1 }], users_total: 6, users_active: 5 }
        : api === 'Widget_Project_Details'
          ? { status: 'success', customer: { ID: '7', Customer_Name: 'SIB', Email: 'a@b.c' }, team: [{ ID: '8', Name: 'Pankaj', Role: 'Site Supervisor / Installer' }], stages: [{ ID: '9', Status_Name: 'Estimation' }], can_edit: true }
          : { status: 'success', records: [{ ID: '5', Task_Name: 'Install', Type_field: 'Task', Owners: [{ ID: '8', zc_display_value: 'Pankaj' }], Task_End_Date: '05-Jun-2026' }] },
    )
    const ds = createZohoSource(sdk)
    expect((await ds.getDashboard()).projects[0]).toMatchObject({ reference: 'PR_1', tasksTotal: 4, tasksDone: 1 })
    expect(await ds.getProjectDetails('1')).toMatchObject({ customer: { name: 'SIB', email: 'a@b.c' }, team: [{ name: 'Pankaj' }], stages: [{ id: '9', label: 'Estimation' }], canEdit: true })
    expect((await ds.listTasks('1'))[0]).toMatchObject({ name: 'Install', endDate: '2026-06-05', owners: [{ id: '8', label: 'Pankaj' }] })
    expect(calls.map((c) => c.api_name)).toEqual(['Widget_Project_Dashboard', 'Widget_Project_Details', 'Widget_Project_Console'])
  })

  it('writes through PUT / POST functions with only the changed fields', async () => {
    const { sdk, calls } = fakeSdk(() => ({ status: 'success', id: '1', PO_No: 'PO-00009', Books_Synced: true }))
    const ds = createZohoSource(sdk)
    await ds.updateProject('1', { Project_Status: '9' }, 'Client asked')
    await ds.updateTask('1', '5', { Priority: 'High' })
    await ds.updateAssetLine('1', '6', { Installation_Status: '7' })
    const po = await ds.createPurchaseOrder({ projectId: '1', vendorId: '2', countryId: '3', date: '2026-06-01', deliveryDate: '', reference: 'R', notes: '', discount: 0, lines: [{ boqId: '4', productId: '5', description: 'X', quantity: 2, rate: 10, taxId: '' }] })
    expect(po).toEqual({ id: '1', poNo: 'PO-00009', booksSynced: true, booksMessage: '' })
    expect(calls.map((c) => [c.api_name, c.http_method])).toEqual([
      ['Widget_Project_Update', 'PUT'],
      ['Widget_Project_Task_Update', 'PUT'],
      ['Widget_Project_Task_Update', 'PUT'],
      ['Widget_Project_Create_PO', 'POST'],
    ])
    expect(calls[0].req).toEqual({ project_id: '1', data: { Project_Status: '9' }, reason: 'Client asked' })
    expect(calls[2].req).toEqual({ project_id: '1', line_id: '6', data: { Installation_Status: '7' } })
    expect(calls[3].req).toMatchObject({ date: '01-Jun-2026', lines: [{ boq_id: '4', product_id: '5', quantity: 2, rate: 10 }] })
  })

  it('reports NOT_FOUND as NotFoundError and other errors with the function’s message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(createZohoSource(fakeSdk(() => ({ status: 'error', code: 'NOT_FOUND', message: 'Project not found' })).sdk).getProjectDetails('1')).rejects.toBeInstanceOf(NotFoundError)
    await expect(createZohoSource(fakeSdk(() => ({ status: 'error', code: 'INVALID', message: 'Stages cannot be skipped' })).sdk).updateProject('1', {})).rejects.toThrow('Stages cannot be skipped')
    // An older function in Creator: the message says what to update
    await expect(createZohoSource(fakeSdk(() => ({ status: 'error', code: 'INVALID', message: 'Unknown action: tasks' })).sdk).listTasks('4171156000000295147')).rejects.toThrow(
      'Widget.project_console in Creator does not support "tasks" yet — paste docs/creator/Widget.project_console.dg into the function, save, then re-save the Custom API Widget_Project_Console.',
    )
    err.mockRestore()
  })

  it('reads page parameters and navigates the parent page', async () => {
    const { sdk } = fakeSdk(() => ({}))
    const ds = createZohoSource(sdk)
    await expect(ds.getPageParams()).resolves.toEqual({ project_id: '1001' })
    ds.navigate('#Page:Home')
    expect((sdk as unknown as { UTIL: { navigateParentUrl: ReturnType<typeof vi.fn> } }).UTIL.navigateParentUrl).toHaveBeenCalledWith('#Page:Home')
  })
})
