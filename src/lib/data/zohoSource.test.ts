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
          ? {
              status: 'success',
              customer: { ID: '7', Customer_Name: 'SIB', Email: 'a@b.c' },
              team: [{ ID: '8', Name: 'Pankaj', Role: 'Site Supervisor / Installer' }],
              stages: [{ ID: '9', Status_Name: 'Estimation' }],
              can_edit: true,
            }
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
    const po = await ds.createPurchaseOrder({
      projectId: '1',
      vendorId: '2',
      countryId: '3',
      date: '2026-06-01',
      deliveryDate: '',
      reference: 'R',
      notes: '',
      discount: 0,
      modeOfTransit: 'Sea',
      eta: '2026-06-20',
      lines: [{ boqId: '4', productId: '5', description: 'X', quantity: 2, rate: 10, taxId: '', division: 'Digital Signage' }],
    })
    expect(po).toEqual({ id: '1', poNo: 'PO-00009', booksSynced: true, booksMessage: '', addedToExisting: false })
    expect(calls.map((c) => [c.api_name, c.http_method])).toEqual([
      ['Widget_Project_Update', 'PUT'],
      ['Widget_Project_Task_Update', 'PUT'],
      ['Widget_Project_Task_Update', 'PUT'],
      ['Widget_Project_Create_PO', 'POST'],
    ])
    expect(calls[0].req).toEqual({ project_id: '1', data: { Project_Status: '9' }, reason: 'Client asked' })
    expect(calls[2].req).toEqual({ project_id: '1', line_id: '6', data: { Installation_Status: '7' } })
    expect(calls[3].req).toMatchObject({
      date: '01-Jun-2026',
      po_id: '',
      mode_of_transit: 'Sea',
      eta: '20-Jun-2026',
      lines: [{ boq_id: '4', product_id: '5', quantity: 2, rate: 10, division: 'Digital Signage' }],
    })
  })

  it('receives goods and moves delivery notes through their own POST functions', async () => {
    const { sdk, calls } = fakeSdk((api) =>
      api === 'Widget_Purchase_Receive'
        ? {
            status: 'success',
            id: '11',
            PR_No: 'PR-00004',
            Books_Synced: false,
            Books_Message: 'PO not in Books',
            Storage_Message: 'Received, but the storage location was not saved: A-01-03 has only 2 free.',
          }
        : { status: 'success', id: '12', DN_No: 'DC-00009', Status: 'Delivered', Books_Synced: true },
    )
    const ds = createZohoSource(sdk)
    expect(
      await ds.receiveGoods({
        poId: '4',
        date: '2026-06-02',
        supplierDn: 'S-1',
        notes: '',
        siteReceivedBy: '',
        lines: [
          {
            lineId: '5',
            quantity: 3,
            warehouseId: '6',
            places: [
              { rackId: '7', segmentId: '8', position: 'Left', positionNote: '', quantity: 2 },
              { rackId: '7', segmentId: '9', position: '', positionNote: '', quantity: 1 },
            ],
            serials: [
              { serialNo: 'SN1', mac: '', warrantyMonths: '12', warrantyStart: '2026-10-29', place: 0 },
              { serialNo: 'SN2', mac: 'AA:BB', place: 0 },
              { serialNo: 'SN3', mac: '', place: 1 },
            ],
          },
        ],
      }),
    ).toEqual({
      id: '11',
      prNo: 'PR-00004',
      booksSynced: false,
      booksMessage: 'PO not in Books',
      storageMessage: 'Received, but the storage location was not saved: A-01-03 has only 2 free.',
      warning: '',
      deliveryNoteNo: '',
      siteMessage: '',
    })
    expect(
      await ds.createDeliveryNote({
        projectId: '1',
        date: '2026-06-03',
        challanType: 'Others',
        warehouseId: '',
        reference: '',
        notes: '',
        sourceOfSupply: 'Dubai',
        lines: [{ lineId: '5', quantity: 2 }],
      }),
    ).toEqual({
      id: '12',
      dnNo: 'DC-00009',
    })
    expect(await ds.updateDeliveryNote({ dnId: '12', statusIndex: 67, deliveredDate: '2026-06-04', receivedBy: 'Site', vehicleNo: '', driverName: '' })).toEqual({
      status: 'Delivered',
      booksSynced: true,
    })
    expect(calls.map((c) => [c.api_name, c.http_method])).toEqual([
      ['Widget_Purchase_Receive', 'POST'],
      ['Widget_Purchase_Delivery', 'POST'],
      ['Widget_Purchase_Delivery', 'POST'],
    ])
    expect(calls[0].req).toEqual({
      po_id: '4',

      receive_date: '02-Jun-2026',
      supplier_dn: 'S-1',
      notes: '',
      site_received_by: '',
      lines: [
        {
          line_id: '5',
          quantity: 3,
          warehouse_id: '6',
          places: [
            { rack_id: '7', segment_id: '8', position: 'Left', position_note: '', quantity: 2 },
            { rack_id: '7', segment_id: '9', position: '', position_note: '', quantity: 1 },
          ],
          serials: [
            { serial_no: 'SN1', mac: '', warranty_months: '12', warranty_start: '29-Oct-2026', place: 0 },
            { serial_no: 'SN2', mac: 'AA:BB', warranty_months: '', warranty_start: '', place: 0 },
            { serial_no: 'SN3', mac: '', warranty_months: '', warranty_start: '', place: 1 },
          ],
        },
      ],
    })
    expect(calls[1].req).toMatchObject({ action: 'create', project_id: '1', dn_date: '03-Jun-2026', source_of_supply: 'Dubai', lines: [{ line_id: '5', quantity: 2 }] })
    expect(calls[2].req).toMatchObject({ action: 'status', dn_id: '12', status_index: 67, delivered_date: '04-Jun-2026', received_by: 'Site' })
  })

  it('maps PO lines, delivery notes and goods receipts from the console', async () => {
    const { sdk } = fakeSdk((_api, req) =>
      req.action === 'po_lines'
        ? {
            status: 'success',
            records: [
              {
                ID: '7',
                Purchase_Order: { ID: '4', zc_display_value: 'PO-1' },
                BOQ: '3',
                Estimate_Line_ID: '2',
                Quantity: '5',
                Quantity_Received: '4',
                Already_Delivered: '1',
                Reserved_Qty: '3',
                Delivery_Note: { ID: '9', zc_display_value: 'DC-1', Status: 'Draft' },
              },
            ],
          }
        : req.action === 'delivery_notes'
          ? {
              status: 'success',
              records: [{ ID: '9', DN_No: 'DC-1', DN_Date: '01-Jun-2026', Status: { ID: '1', zc_display_value: 'Draft', Index: 1 }, Lines: [{ ID: '7', Qty_to_Deliver: '3', DN_Amount: '30' }] }],
            }
          : {
              status: 'success',
              records: [
                {
                  ID: '8',
                  PR_No: 'PR-1',
                  Purchase_Order: { ID: '4', zc_display_value: 'PO-1' },
                  Receive_Date: '02-Jun-2026',
                  Lines: [{ ID: '10', Parent_Line_ID: '7', Quantity_Received: '4', Store_Warehouse: 'WH' }],
                },
              ],
            },
    )
    const ds = createZohoSource(sdk)
    expect((await ds.listPoLines(['4']))[0]).toMatchObject({
      boqId: '3',
      lineId: '2',
      quantity: 5,
      quantityReceived: 4,
      alreadyDelivered: 1,
      reservedQty: 3,
      deliveryNote: { id: '9', no: 'DC-1', status: 'Draft' },
    })
    expect((await ds.listDeliveryNotes('1'))[0]).toMatchObject({ no: 'DC-1', date: '2026-06-01', status: 'Draft', statusIndex: 1, lines: [{ id: '7', quantity: 3, amount: 30 }] })
    expect((await ds.listGoodsReceipts(['4']))[0]).toMatchObject({ no: 'PR-1', purchaseOrderId: '4', date: '2026-06-02', lines: [{ parentLineId: '7', quantity: 4, warehouse: 'WH' }] })
  })

  it('maps the dashboard timeline events and status history of each project', async () => {
    const { sdk } = fakeSdk(() => ({
      status: 'success',
      records: [
        {
          ID: '1',
          Project_Reference: 'PR_1',
          Status_History: '01-Oct-2026 09:00:00 | Registered | Ana | ',
          events: [
            { type: 'milestone', name: 'Planning', no: 'MIL-1', start: '01-Oct-2026', date: '15-Oct-2026', by: 'Ana', status: 'active', done: false },
            { type: 'po', name: 'PO-26-00019', date: '20-Oct-2026', by: 'Ravi', vendor: 'LG', total: '9996' },
            { type: 'task', name: 'Kick off', date: '' },
          ],
        },
      ],
    }))
    const p = (await createZohoSource(sdk).getDashboard()).projects[0]
    expect(p.events).toEqual([
      expect.objectContaining({ type: 'milestone', name: 'Planning', start: '2026-10-01', date: '2026-10-15', by: 'Ana', done: false }),
      expect.objectContaining({ type: 'po', name: 'PO-26-00019', date: '2026-10-20', vendor: 'LG', total: 9996 }),
    ]) // undated events are left out
    expect(p.statusHistory).toEqual([{ at: '2026-10-01', time: '09:00:00', status: 'Registered', user: 'Ana', reason: '' }])
  })

  it('lists every vendor Creator returns (read in pages by ID) sorted by name; other lists keep Creator’s order', async () => {
    const vendors = Array.from({ length: 450 }, (_, i) => ({ ID: String(1000 + i), label: `Vendor ${String(449 - i).padStart(3, '0')}` }))
    const { sdk } = fakeSdk((_api, req) =>
      req.source === 'vendors'
        ? { status: 'success', records: vendors }
        : {
            status: 'success',
            records: [
              { ID: '2', label: 'Ordered' },
              { ID: '1', label: 'Draft' },
            ],
          },
    )
    const ds = createZohoSource(sdk)
    const list = await ds.listOptions({ key: 'vendors', report: '', label: '' })
    expect(list).toHaveLength(450)
    expect(list[0]).toMatchObject({ id: '1449', label: 'Vendor 000' })
    expect(list[449]).toMatchObject({ id: '1000', label: 'Vendor 449' })
    expect((await ds.listOptions({ key: 'statuses', report: '', label: '' })).map((o) => o.label)).toEqual(['Ordered', 'Draft'])
  })

  it('deals, payments and task comments go through their own functions', async () => {
    const { sdk, calls } = fakeSdk((api, req) =>
      api === 'Widget_Deal_Estimate'
        ? req.action === 'list'
          ? { status: 'success', deals: [{ id: '55', name: 'Mall refresh', account: 'Emaar', stage: 'Qualification', reference: '', amount: 1000, closing: '' }], more: true }
          : { status: 'success', id: '4301', existing: false, Warning: '' }
        : api === 'Widget_Task_Collab'
          ? req.action === 'list'
            ? {
                status: 'success',
                notes: [{ ID: '1', Comment: 'Hi', Author: 'Pankaj', Added_Time: '05-Nov-2026 10:00:00', Reply_To: '' }],
                files: [{ ID: '9', File_Name: 'a.pdf', File: '/f/a.pdf', Note: '1' }],
              }
            : { status: 'success', id: '2', File_IDs: [31] }
          : api === 'Widget_PO_Payment_Save'
            ? { status: 'success', id: '77' }
            : { status: 'success', records: [{ ID: '77', Purchase_Order: '4', Payment_Date: '20-May-2026', Amount: 500.5, Reference_No: 'TT', Payment_Note: '', Books_No: '' }] },
    )
    const ds = createZohoSource(sdk)
    expect(await ds.listOpenDeals(2, 'mall')).toEqual({ deals: [{ id: '55', name: 'Mall refresh', account: 'Emaar', stage: 'Qualification', reference: '', amount: 1000, closing: '' }], more: true, existing: [] })
    expect(await ds.createDealEstimate('55')).toEqual({ id: '4301', existing: false, warning: '' })
    expect(await ds.listTaskCollab('7')).toEqual({
      notes: [{ id: '1', comment: 'Hi', author: 'Pankaj', addedTime: '05-Nov-2026 10:00:00', replyTo: '' }],
      files: [{ id: '9', name: 'a.pdf', path: '/f/a.pdf', noteId: '1' }],
    })
    expect(await ds.addTaskNote({ taskId: '7', comment: 'Ok', replyTo: '1', fileNames: ['b.xlsx'] })).toEqual({ id: '2', fileIds: ['31'] })
    expect(await ds.listPoPayments(['4'])).toEqual([{ id: '77', purchaseOrderId: '4', date: '2026-05-20', amount: 500.5, reference: 'TT', note: '', booksNo: '' }])
    expect(await ds.addPoPayment({ poId: '4', date: '2026-05-21', amount: 10, reference: '', note: '' })).toEqual({ id: '77' })
    expect(calls.map((c) => [c.api_name, c.http_method, c.req.action])).toEqual([
      ['Widget_Deal_Estimate', 'POST', 'list'],
      ['Widget_Deal_Estimate', 'POST', 'create'],
      ['Widget_Task_Collab', 'POST', 'list'],
      ['Widget_Task_Collab', 'POST', 'add_note'],
      ['Widget_Project_Console', 'GET', 'po_payments'],
      ['Widget_PO_Payment_Save', 'POST', 'add'],
    ])
    expect(calls[0].req).toMatchObject({ page: 2, search: 'mall' })
    expect(calls[3].req).toMatchObject({ task_id: '7', comment: 'Ok', reply_to: '1', files: ['b.xlsx'] })
    expect(calls[5].req).toMatchObject({ po_id: '4', date: '21-May-2026', amount: '10.00' })
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

  it('reads a file through Creator readFile with the API file path, typed from its name', async () => {
    const { sdk } = fakeSdk(() => ({ status: 'success' }))
    const readFile = vi.fn(() => Promise.resolve(new Blob(['x'])))
    ;(sdk as unknown as { FILE: Record<string, unknown> }).FILE = { uploadFile: vi.fn(), readFile }
    const ds = createZohoSource(sdk)
    const blob = await ds.readDeliveryNoteFile({ id: '4171156000000422004', name: 'photo.jpg', path: '1794_photo.jpg' })
    expect(readFile).toHaveBeenCalledWith(
      expect.objectContaining({
        report_name: 'All_Delivery_Notes',
        id: '4171156000000422004',
        field_name: 'Attachments',
        file_url: '/api/v2/2point0concepts/point0concepts/report/All_Delivery_Notes/4171156000000422004/Attachments/download?filepath=1794_photo.jpg',
      }),
    )
    expect(blob?.type).toBe('image/jpeg')
  })

  it('falls back to Widget.project_console (action file) when readFile gives nothing', async () => {
    const { sdk, calls } = fakeSdk(() => ({ status: 'success', records: [{ Name: '1794_photo.png', Content: btoa('png-bytes') }] }))
    ;(sdk as unknown as { FILE: Record<string, unknown> }).FILE = { uploadFile: vi.fn(), readFile: vi.fn(() => Promise.resolve({})) }
    const blob = await createZohoSource(sdk).readDeliveryNoteFile({ id: '41', name: 'photo.png', path: '1794_photo.png' })
    expect(calls.at(-1)?.req).toMatchObject({ action: 'file', report: 'All_Delivery_Notes', field: 'Attachments', id: '41', filepath: '1794_photo.png' })
    expect(blob?.type).toBe('image/png')
    expect(blob?.size).toBe('png-bytes'.length)
  })
})
