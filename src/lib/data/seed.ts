// Demo data for running outside Creator. Records are shaped exactly like Creator Widget SDK responses
// (field link names from 2Point0concepts.ds, lookups as {ID, display_value}, dates as dd-MMM-yyyy),
// so the same mappers and edit form run on demo data and live data.
// Project PR_26040 (SIB RAK Branch) and its assets / risks come from "4b. Project Management Dashboard.xlsx".
import type { CreatorRecord } from '@/types/domain'

type Row = Record<string, unknown>
const lk = (ID: string, display_value: string) => ({ ID, display_value })
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Demo dates relative to today, as dd-MMM-yyyy (Creator date format). */
export const day = (offset: number) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()}`
}

// ── masters (option lists for the edit form) ──
/** Widget.status_order() — the static orders (demo copy of docs/creator/Widget.status_order.dg). */
export const seedStatusOrder = {
  project: [
    'Registered',
    'Kick-Off Done',
    'Planning / Shop Drawings',
    'Procurement in Progress',
    'Partially Delivered',
    'Ready for Installation',
    'Installation in Progress',
    'Configuration & T&C',
    'UAT',
    'Snagging',
    'Handover',
    'Completed',
    'DLP / Service',
    'Closed',
  ],
  anytime: ['On Hold', 'Cancelled'],
  task: ['Not Started', 'On Track', 'Behind', 'At Risk', 'Complete', 'Deprioritized'],
  boq: [
    'Order Pending ⚠️',
    'Ordered  ⏳',
    'Not Ordered 🚩',
    'In Production ⚙️',
    'Ready to Ship 🏳️',
    'In Transit 🚛 🛫 🚢 🚐',
    'In Customs 🚨',
    '2.0 Dubai Warehouse 📍',
    '2.0 Riyadh Office 📍',
    'Delivered to Client  ✅',
    '2.0 Riyadh Warehouse 📍',
    'Partially Delivered 🚧',
  ],
}
let statusNo = 0
const statuses = (names: string[], modules: string[]) => names.map((Status_Name) => ({ ID: `9${String(++statusNo).padStart(3, '0')}`, Status_Name, Index_field: String(statusNo), Modules: modules }))
export const seedStatuses: CreatorRecord[] = [
  // Project stages carry the Status form Order (the pipeline is sorted by it — Widget.status_order); On Hold / Cancelled have none
  ...statuses([...seedStatusOrder.project, ...seedStatusOrder.anytime], ['Project']).map((s, i) => ({ ...s, Order: i < seedStatusOrder.project.length ? String(i + 1) : '' })),
  ...statuses(['Accepted'], ['Quotation']),
  ...statuses(seedStatusOrder.boq, ['BOQ']),
  // Installation module (Asset lines) — listed in Creator Index order
  ...statuses(['In Progress', 'Installed'], ['Installation']),
  ...statuses(['Not Started'], ['Task', 'Installation', 'Milestone', 'Project Risk']),
  // Task statuses deliberately created out of order: the widget sorts them by the static order
  ...statuses(['Complete', 'On Track', 'Behind', 'At Risk', 'Deprioritized'], ['Task', 'Milestone']),
  ...statuses(['In-Progress', 'Closed Risk'], ['Project Risk']),
  ...statuses(['Active', 'Completed'], ['Milestone']),
  // Delivery Note statuses keep their Creator Index_field (Widget.purchase_delivery works by index)
  ...(
    [
      ['Draft', 1, 1],
      ['Ready to Dispatch', 68, 2],
      ['Dispatched', 69, 3],
      ['Partially Delivered', 18, 4],
      ['Delivered', 67, 5],
      ['Cancelled', 48, 6],
    ] as const
  ).map(([Status_Name, idx, order]) => ({ ID: `95${idx}`, Status_Name, Index_field: String(idx), Order: String(order), Modules: ['Delivery Note'] })),
]
export const st = (name: string) => {
  const s = seedStatuses.find((x) => x.Status_Name === name && !(name === 'Closed' && !(x.Modules as string[]).includes('Project')))!
  return lk(s.ID, name)
}
export const seedUsers: CreatorRecord[] = [
  ['Pankaj Chowdhary', 'Project Manager'],
  ['Rafaqat Mustafa', 'Site Supervisor / Installer'],
  ['Rasheed Aliyu', 'Site Supervisor / Installer'],
  ['Hossam Hosny', 'Site Supervisor / Installer'],
  ['Prashant Bakde', 'Management'],
  ['Harish Kunju', 'Procurement'],
].map(([Name, Role], i) => ({ ID: `8${i + 1}00`, Name, Role, Status: i === 5 ? 'Inactive' : 'Active', Email: `${Name.split(' ')[0].toLowerCase()}@example.com` }))
// ── Roles form (Role, Index_field) — Project Team grid → Project Role ──
export const seedRoles: CreatorRecord[] = ['Project Manager', 'Installer', 'Configuration Engineer', 'Commissioning Engineer', 'Sign-off', 'Site Engineer', 'Technician'].map((Role, i) => ({
  ID: `r${i + 1}`,
  Role,
  Index_field: i + 1,
}))
const user = (name: string) => lk(seedUsers.find((u) => u.Name === name)!.ID, name)
export const seedCustomers: CreatorRecord[] = [
  { ID: '7100', Customer_Name: 'Sharjah Islamic Bank', Email: 'facilities@example.com', Phone_Number: '+971 6 000 0000', Billing_Address2: { address_line_1: 'SIB Tower', district_city: 'Sharjah' } },
  { ID: '7200', Customer_Name: 'Emirates Hospitality Group' },
  { ID: '7300', Customer_Name: 'Gulf Logistics LLC' },
]
export const seedCountries: CreatorRecord[] = [
  { ID: '6100', Country_Name: 'United Arab Emirates' },
  { ID: '6200', Country_Name: 'Saudi Arabia' },
]
export const seedCurrencies: CreatorRecord[] = [
  { ID: '5100', Currency_Name: 'UAE Dirham' },
  { ID: '5200', Currency_Name: 'Saudi Riyal' },
]
export const seedEstimates: CreatorRecord[] = [
  {
    ID: '4100',
    Quote_No: 'QT-26-0040',
    Deals: '6241000000412345',
    Version: 'V2',
    Project_Reference: 'PR_26040',
    Customer_Name: 'Sharjah Islamic Bank',
    Deal_Owner: 'Omar Haddad',
    Deal_Stage: 'Closed Won',
    Country_Name: 'United Arab Emirates',
    Total: '186500',
    Date_field: '12-Aug-2026',
    Status: 'Accepted',
  },
  {
    ID: '4200',
    Quote_No: 'QT-26-0051',
    Version: 'V1',
    Project_Reference: 'PR_26051',
    Customer_Name: 'Marina Hotel',
    Deal_Owner: 'Omar Haddad',
    Deal_Stage: 'Closed Won',
    Country_Name: 'United Arab Emirates',
    Total: '4200000',
    Date_field: '03-Jun-2026',
    Status: 'Accepted',
  },
  {
    ID: '4300',
    Quote_No: 'QT-26-0077',
    Version: 'V1',
    Project_Reference: 'PR_26077',
    Customer_Name: 'Retail kiosk pilot',
    Deal_Owner: 'Pankaj Chowdhary',
    Deal_Stage: 'Proposal',
    Country_Name: 'Saudi Arabia',
    Total: '64000',
    Date_field: '30-Sep-2026',
    Status: 'Draft',
  },
]
export const seedVendors: CreatorRecord[] = [
  { ID: '6600', Vendor_Name: 'LPDisplay', Email: 'sales@lpdisplay.example', Phone_Number: '+971 4 100 0000', Division: 'Digital Signage' },
  { ID: '6601', Vendor_Name: 'Uniguest', Email: 'orders@uniguest.example', Phone_Number: '+971 4 200 0000', Division: 'Digital Signage' },
  { ID: '6602', Vendor_Name: 'Peculiar', Email: 'po@peculiar.example', Phone_Number: '+971 4 300 0000' },
  { ID: '6603', Vendor_Name: 'Generic' },
]
export const seedWarehouses: CreatorRecord[] = [
  { ID: '6900', Warehouse_Name: '2.0 Warehouse, Al Quoz', Warehouse_Code: 'DXB-01', Warehouse_Type: 'Main', Active: true },
  { ID: '6901', Warehouse_Name: '2.0 Riyadh Warehouse', Warehouse_Code: 'RUH-01', Warehouse_Type: 'Main', Active: true },
  { ID: '6902', Warehouse_Name: 'Site store — SIB RAK', Warehouse_Code: 'SITE-RAK', Warehouse_Type: 'Site store', Active: false },
]
export const seedRacks: CreatorRecord[] = [
  { ID: '6910', Rack_Code: '1', Rack_Aisle: 'Aisle 1', Warehouse: lk('6900', '2.0 Warehouse, Al Quoz'), Active: true },
  { ID: '6911', Rack_Code: '2', Rack_Aisle: 'Aisle 1', Warehouse: lk('6900', '2.0 Warehouse, Al Quoz'), Active: true },
  { ID: '6912', Rack_Code: 'R1', Rack_Aisle: 'Aisle 1', Warehouse: lk('6901', '2.0 Riyadh Warehouse'), Active: true },
]
/** form Bay: one pallet position each (bay letter, level, side), numbered like the warehouse rack sheet */
const PALLET_LAYOUT: [rack: string, rackCode: string, warehouse: [string, string], bays: [string, number][]][] = [
  [
    '6910',
    '1',
    ['6900', '2.0 Warehouse, Al Quoz'],
    [
      ['A', 1],
      ['A', 2],
      ['B', 1],
      ['B', 2],
      ['C', 1],
      ['C', 2],
      ['D', 1],
      ['D', 2],
    ],
  ],
  [
    '6911',
    '2',
    ['6900', '2.0 Warehouse, Al Quoz'],
    [
      ['A', 2],
      ['A', 3],
      ['B', 1],
      ['B', 2],
      ['C', 1],
      ['C', 2],
    ],
  ],
  ['6912', 'R1', ['6901', '2.0 Riyadh Warehouse'], [['A', 1]]],
]
export const seedSegments: CreatorRecord[] = PALLET_LAYOUT.flatMap(([rack, rackCode, [whId, whName], bays], r) =>
  bays.flatMap(([bay, level], i) =>
    (['Right', 'Left'] as const).map((side, k) => {
      const no = PALLET_LAYOUT.slice(0, r).reduce((t, x) => t + x[3].length * 2, 0) + i * 2 + k + 1
      const occupied = no === 1 || no === 17 ? 10 : 0
      return {
        ID: String(6920 + no - 1),
        Rack: lk(rack, rackCode),
        Bay_Letter: bay,
        Level: String(level),
        Side: side,
        Pallet_No: String(no),
        Segment_No: String(no),
        Segment_Code: `P${String(no).padStart(2, '0')}`,
        Location_Path: `R${rackCode.replace(/^R/, '')}-${bay}-L${level}-${side}`,
        Capacity: no === 16 ? '0' : '20',
        Occupied_Qty: String(occupied),
        Free_Qty: String((no === 16 ? 0 : 20) - occupied),
        Warehouse: lk(whId, whName),
        Active: true,
      }
    }),
  ),
)
export const seedTaxes: CreatorRecord[] = [{ ID: '6700', Tax_Name: 'VAT', Rate: '5' }]
// Project_Registration_Task_List form: the Registration checklist items (Status Active), as page 8 of the Registration Form
export const seedTaskList: CreatorRecord[] = [
  { ID: '3100', Task_Name: 'Assign PR#: Ensure project has PR# in CRM, used for files/folders.' },
  { ID: '3101', Task_Name: 'GDrive: Verify Google Drive created, accessible for project.' },
  { ID: '3102', Task_Name: 'PO Check: Sales/PM review PO to align financials, goals.' },
  { ID: '3103', Task_Name: 'Scope: Sales/SA explain scope; PM confirms details, accepts.' },
  { ID: '3104', Task_Name: 'BOQ: Check Bill of Quantities for accuracy, goal alignment.' },
  { ID: '3105', Task_Name: 'Contract: Examine contract terms, ensure stakeholder agreement.' },
  { ID: '3106', Task_Name: 'Timelines: Validate project schedule, deadlines with team.' },
  { ID: '3107', Task_Name: 'Key Dates: Confirm critical dates, milestones documented, agreed.' },
  { ID: '3108', Task_Name: 'Financials: Assess budget, costs, financial alignment with goals.' },
  { ID: '3109', Task_Name: 'Assumptions: Document, confirm assumptions, dependencies, constraints.' },
  { ID: '3110', Task_Name: 'Exclusions: Clarify, agree on items excluded from project scope.' },
  { ID: '3111', Task_Name: 'Comms: Establish communication protocols, channels for project.' },
  { ID: '3112', Task_Name: 'Doc Mgmt: Ensure processes, people for managing docs in place.' },
  { ID: '3113', Task_Name: 'Travel: Assess, plan travel needs for project team.' },
  { ID: '3114', Task_Name: 'Change Mgmt: Define procedures for handling change orders.' },
  { ID: '3115', Task_Name: 'Success: Agree on metrics, goals for project success.' },
  { ID: '3116', Task_Name: 'SHEQ: Confirm compliance with Safety, Health, Env, Quality standards.' },
  { ID: '3117', Task_Name: 'Team: Officially assign team members to responsibilities.' },
  { ID: '3118', Task_Name: 'Risks: Identify, assess, document potential project risks.' },
  { ID: '3119', Task_Name: 'Escalation: Draft, review escalation matrix with team for issues.' },
]

// ── projects ──
// Widget.project_console sends the Registration fields added to the Project form on 18 Nov (DS "2Point0concepts (1)")
const project = (r: Row): CreatorRecord => ({ Registration_Notes: '', Warranty_Document: '', Shop_Drawings_Status: '', Solution_Architect_Signature: '', ...r }) as unknown as CreatorRecord
export const seedProjects: CreatorRecord[] = [
  project({
    ID: '1001',
    Project_Reference: 'PR_26040',
    Project_Name: 'SIB RAK Branch – Digital Signage',
    Client_Name: lk('7100', 'Sharjah Islamic Bank'),
    Project_Status: st('Partially Delivered'),
    Status_History: [
      `${day(-40)} 09:12:00 | Registered | Pankaj Chowdhary | `,
      `${day(-33)} 15:40:10 | Kick-Off Done | Pankaj Chowdhary | `,
      `${day(-26)} 11:05:00 | Planning / Shop Drawings | Pankaj Chowdhary | `,
      `${day(-20)} 10:00:00 | Procurement in Progress | Harish Kunju | `,
      `${day(-6)} 17:22:30 | Partially Delivered | Pankaj Chowdhary | `,
    ].join('\n'),
    Type_of_Project: 'Digital Signage',
    Country: [lk('6100', 'United Arab Emirates')],
    Currency: lk('5100', 'UAE Dirham'),
    Address: { address_line_1: 'SIB RAK Branch', district_city: 'Ras Al Khaimah', country: 'United Arab Emirates', display_value: 'SIB RAK Branch, Ras Al Khaimah, United Arab Emirates' },
    City: 'Ras Al Khaimah',
    State: 'RAK',
    Project_Description: 'Three LED digital-signage displays with Uniguest media players for the RAK branch.',
    Start_Date: day(-40),
    Project_Completion_Date: day(54),
    Actual_Completion_Date: '',
    Project_Manager: user('Pankaj Chowdhary'),
    Lead_Engineer: user('Rasheed Aliyu'),
    Pro: [
      { ID: '1201', Team_Member: user('Pankaj Chowdhary'), Project_Role: lk('r1', 'Project Manager') },
      { ID: '1202', Team_Member: user('Rafaqat Mustafa'), Project_Role: lk('r2', 'Installer') },
      { ID: '1203', Team_Member: user('Rasheed Aliyu'), Project_Role: lk('r3', 'Configuration Engineer') },
      { ID: '1204', Team_Member: user('Hossam Hosny'), Project_Role: lk('r4', 'Commissioning Engineer') },
      { ID: '1205', Team_Member: user('Prashant Bakde'), Project_Role: lk('r5', 'Sign-off') },
    ],
    Client_PO_No: 'SIB-PO-88231',
    Project_Value_PO: '186500.00',
    Accepted_Estimate: lk('4100', 'QT-26-0040'),
    Date_PO_Received: '02-May-2026',
    Estimate_Value_Sub_Total: '186500.00',
    Sales_Order_No: 'SO-26-0112',
    Hardware: '98000.00',
    Software: '6500.00',
    Outsourced_Services: '9000.00',
    Logistics: '3500.00',
    point0_Services: '14000.00',
    Estimated_Margin: '55500.00',
    Total_Budget_Cost: '131000.00',
  }),
  project({
    ID: '1002',
    Project_Reference: 'PR_26051',
    Project_Name: 'Marina Hotel Ballroom AV',
    Client_Name: lk('7200', 'Emirates Hospitality Group'),
    Project_Status: st('Registered'),
    Type_of_Project: 'Audio Visual',
    Country: [lk('6100', 'United Arab Emirates')],
    Currency: lk('5100', 'UAE Dirham'),
    City: 'Dubai',
    Project_Description: 'Ballroom projection, PA and control upgrade.',
    Start_Date: '01-Nov-2026',
    Project_Completion_Date: '15-Jan-2027',
    Project_Manager: user('Rafaqat Mustafa'),
    Project_Value_PO: '420000.00',
    Accepted_Estimate: lk('4200', 'QT-26-0051'),
    Hardware: '240000.00',
    Software: '12000.00',
    Outsourced_Services: '30000.00',
    Logistics: '8000.00',
    point0_Services: '40000.00',
    Estimated_Margin: '90000.00',
    Total_Budget_Cost: '330000.00',
  }),
  project({
    ID: '1003',
    Project_Reference: 'PR_26062',
    Project_Name: 'Gulf Logistics Boardroom',
    Client_Name: lk('7300', 'Gulf Logistics LLC'),
    Project_Status: st('Closed'),
    Type_of_Project: 'Audio Visual + Digital Signage',
    Country: [lk('6200', 'Saudi Arabia')],
    Currency: lk('5200', 'Saudi Riyal'),
    City: 'Riyadh',
    Start_Date: '15-Sep-2026',
    Project_Manager: user('Harish Kunju'),
    Project_Value_PO: '95000.00',
    Hardware: '52000.00',
    point0_Services: '9000.00',
    Total_Budget_Cost: '61000.00',
  }),
]

// ── PR_26040 asset register (Excel: PM Tracker & Asset Register) ──
const P1 = lk('1001', 'PR_26040')
const E1 = lk('4100', 'QT-26-0040')
const WP = {
  av02: 'AV02: [DS-01 BEHIND SSO DESK]',
  av03: 'AV03: [DS-02 BEHIND TELLER COUNTER]',
  av04: 'AV04: [DS-03 NEAR HEAD TELLER]',
  sw: 'Software Licencing',
}
let lineNo = 0
const line = (wp: string, vendor: string, category: string, type: string, brand: string, model: string, qty: number, cost: number, price: number, extra: Row = {}): CreatorRecord => ({
  ID: `2${String(++lineNo).padStart(3, '0')}`,
  Project: P1,
  Cost_Analysis: E1,
  Work_Package: wp,
  Vendor: lk(`v-${vendor}`, vendor),
  Category: lk(`c-${category}`, category),
  Type_field: lk(`t-${type}`, type),
  Brand: lk(`b-${brand}`, brand),
  Model: model,
  Item_Description: `BRAND: ${brand} | Model #: ${model}`,
  Unit_of_Measurement: lk('u-ea', 'Each'),
  Quantity: String(qty),
  Total_Cost: cost.toFixed(2),
  Total_Price: price.toFixed(2),
  Total_Profit: (price - cost).toFixed(2),
  Delivery_Status: st('Delivered to Client  ✅'),
  Installation_Status: st('In Progress'),
  Notes: '',
  Serial_Number: 'N/A',
  Networked: false,
  ...extra,
})
const led = (wp: string, qty: number, cost: number) =>
  line(wp, 'LPDisplay', 'Hardware', 'LED', 'LPDisplay', 'LPD-BSU63V12', qty, cost, cost * 1.42, { Warranty_Start_Date: '11-Aug-2026', Warranty_End_Date: '10-Aug-2029' })
const mount = (wp: string, qty: number) => line(wp, 'Peculiar', 'Hardware', 'Mount', 'Peculiar', 'LED Mount I', qty, 1800, 2600)
const player = (wp: string, serial = 'N/A') =>
  line(wp, 'Uniguest', 'Hardware', 'Media Player', 'Uniguest', 'NTB-4K-10-S', 1, 2400, 3500, {
    Networked: true,
    Serial_Number: serial,
    Warranty_Start_Date: '11-Aug-2026',
    Warranty_End_Date: '10-Aug-2027',
    VLAN: serial === 'N/A' ? '' : '120',
    IP_Address: serial === 'N/A' ? '' : '10.20.120.14',
  })
const consumables = (wp: string, qty: number) => line(wp, 'Generic', 'Hardware', 'Accessory', 'Various', 'Consumables', qty, 350, 600, { Installation_Status: st('Not Started') })

export const seedCostingLines: CreatorRecord[] = [
  led(WP.av02, 4.6575, 23000),
  mount(WP.av02, 4.6575),
  player(WP.av02),
  consumables(WP.av02, 2),
  led(WP.av03, 3.24, 16000),
  mount(WP.av03, 3.24),
  player(WP.av03),
  consumables(WP.av03, 2),
  led(WP.av04, 3.0375, 15000),
  mount(WP.av04, 3.0375),
  player(WP.av04, '231875'),
  consumables(WP.av04, 1),
  line(WP.sw, 'Uniguest', 'Software', 'Software Licencing', 'Uniguest', 'UIDESIGN', 1, 4200, 6500, {
    Item_Description: 'User Interface Customization',
    Delivery_Status: st('Ordered  ⏳'),
    Installation_Status: st('Not Started'),
  }),
  // PR_26051 — not linked through the Project lookup, only through its accepted estimate (as Widget.sync_boq leaves them)
  {
    ID: '2901',
    Cost_Analysis: lk('4200', 'QT-26-0051'),
    Work_Package: 'AV01: [BALLROOM]',
    Category: lk('c-Hardware', 'Hardware'),
    Type_field: lk('t-Projector', 'Projector'),
    Brand: lk('b-Epson', 'Epson'),
    Model: 'EB-PU2213B',
    Item_Description: 'Laser projector 13,000 lm',
    Quantity: '2',
    Total_Cost: '96000.00',
    Total_Price: '132000.00',
    Total_Profit: '36000.00',
    Delivery_Status: st('Not Ordered 🚩'),
    Installation_Status: st('Not Started'),
    Networked: true,
  },
]

// ── BOQ (one row per grouped product, as Widget.sync_boq writes it) ──
const boq = (id: string, desc: string, model: string, qty: number, status: string, { vendor = 'LPDisplay', ...extra }: Row & { vendor?: string } = {}): CreatorRecord => ({
  ID: id,
  Project_Reference: 'PR_26040',
  Estimate1: E1,
  Work_Package: 'AV02, AV03, AV04',
  Vendors: lk(str(seedVendors.find((v) => v.Vendor_Name === vendor)?.ID ?? 'v'), vendor),
  Category: lk('c', 'Hardware'),
  Model: model,
  Description: desc,
  UOM: lk('u-ea', 'Each'),
  Quantity: String(qty),
  Warranty: '3 Years',
  Status: st(status),
  ...extra,
})
export const seedBoq: CreatorRecord[] = [
  boq('3001', 'LED display', 'LPD-BSU63V12', 10.935, 'Delivered to Client  ✅', {
    SKU: lk('p1', 'LPD-BSU63V12'),
    Costing_Lineitem: ['2001', '2005', '2009'],
    PO: 'PO-00310',
    PO_Date: '12-May-2026',
    Mode_of_Transit: 'Sea',
    ETA: '25-May-2026',
    Delivered_to_2_0_Warehouse: 'Yes',
    Date_delivered_to_warehouse: '26-May-2026',
    Delivered_to_Customer: 'Yes',
    Date_delivered_to_customer: '30-May-2026',
  }),
  boq('3002', 'LED mount', 'LED Mount I', 10.935, 'Delivered to Client  ✅', {
    SKU: lk('p2', 'LED Mount I'),
    Costing_Lineitem: ['2002', '2006', '2010'],
    vendor: 'Peculiar',
    PO: 'PO-00311',
    PO_Date: '12-May-2026',
    Mode_of_Transit: 'Road',
    ETA: '20-May-2026',
    Delivered_to_2_0_Warehouse: 'Yes',
    Delivered_to_Customer: 'Yes',
  }),
  boq('3003', 'Media player', 'NTB-4K-10-S', 3, 'In Transit 🚛 🛫 🚢 🚐', {
    SKU: lk('p3', 'NTB-4K-10-S'),
    Costing_Lineitem: ['2003', '2007', '2011'],
    vendor: 'Uniguest',
    PO: 'PO-00312',
    PO_Date: '14-May-2026',
    Mode_of_Transit: 'Air',
    ETA: '28-May-2026',
    Delivered_to_2_0_Warehouse: 'No',
    Delivered_to_Customer: 'No',
    Warranty: '1 Year',
  }),
  boq('3004', 'Consumables', 'Consumables', 5, 'Ordered  ⏳', {
    SKU: lk('p4', 'Consumables'),
    Costing_Lineitem: ['2004', '2008', '2012'],
    vendor: 'Generic',
    PO: 'PO-00311',
    PO_Date: '12-May-2026',
    Delivered_to_2_0_Warehouse: 'No',
    Delivered_to_Customer: 'No',
    Warranty: '',
  }),
  boq('3005', 'User Interface Customization', 'UIDESIGN', 1, 'Not Ordered 🚩', {
    SKU: lk('p5', 'UIDESIGN'),
    Costing_Lineitem: ['2013'],
    vendor: 'Uniguest',
    Category: lk('c', 'Software'),
    Warranty: '',
  }),
  boq('3006', 'Display mount kit', 'PEC-MK-55', 4, 'Not Ordered 🚩', { SKU: lk('p6', 'PEC-MK-55'), vendor: 'Peculiar', Warranty: '1 Year' }),
  boq('3007', 'HDMI cable 5 m', 'HDMI-5M', 20, 'Not Ordered 🚩', { SKU: lk('p7', 'HDMI-5M'), vendor: 'Generic', Warranty: '' }),
  { ID: '3901', Project_Reference: 'PR_26051', Estimate1: lk('4200', 'QT-26-0051'), Description: 'Laser projector 13,000 lm', Model: 'EB-PU2213B', Quantity: '2', Status: st('Not Ordered 🚩') },
]

const poBase = {
  Project_reference: lk('1001', 'PR_26040'),
  Reference: 'PR_26040',
  Country_ID: '6100',
  Warehouse_ID: '6900',
  Discount: '0',
  Issued_By: 'Harish Kunju',
  Terms_Conditions: 'Payment terms: 30 days',
}
export const seedPurchaseOrders: CreatorRecord[] = [
  {
    ...poBase,
    ID: '4501',
    PO_No: 'PO-00310',
    Vendor_Name: lk('6600', 'LPDisplay'),
    Vendor_ID: '6600',
    Date_field: '12-May-2026',
    Delivery_Date: '25-May-2026',
    Sub_Total: '54000.00',
    Total_Cost: '54000.00',
    BOQ: ['3001'],
    Books_Synced: true,
    PR_All_Received: true,
  },
  {
    ...poBase,
    ID: '4502',
    PO_No: 'PO-00311',
    Vendor_Name: lk('6602', 'Peculiar'),
    Vendor_ID: '6602',
    Date_field: '12-May-2026',
    Delivery_Date: '20-May-2026',
    Sub_Total: '7150.00',
    Total_Cost: '7150.00',
    BOQ: ['3002', '3004'],
    Books_Synced: true,
  },
  {
    ...poBase,
    ID: '4503',
    PO_No: 'PO-00312',
    Vendor_Name: lk('6601', 'Uniguest'),
    Vendor_ID: '6601',
    Date_field: '14-May-2026',
    Delivery_Date: '28-May-2026',
    Sub_Total: '7200.00',
    Total_Cost: '7200.00',
    BOQ: ['3003'],
    Books_Synced: false,
  },
]
/** The PO's own lines (is_PR false). Quantity_Received is the sum of the goods-receipt copies below. */
export const seedPoLines: CreatorRecord[] = [
  {
    ID: '4601',
    Purchase_Order: lk('4501', 'PO-00310'),
    Item_Name: lk('p1', 'LPD-BSU63V12'),
    Item_Description: 'LED display',
    BOQ: '3001',
    Estimate_Line_ID: '2001',
    Quantity: '10',
    Rate: '5400.00',
    Amount: '54000.00',
    Quantity_Received: '10',
    Quantity_to_be_Received: '0',
    Received: true,
    Already_Delivered: '10',
    Qty_to_Deliver: '10',
    WP_ID: 'AV02',
    Store_Warehouse: lk('6900', '2.0 Warehouse, Al Quoz'),
    Delivery_Note: { ID: '4801', zc_display_value: 'DC-00001', Status: 'Delivered' },
  },
  {
    ID: '4602',
    Purchase_Order: lk('4502', 'PO-00311'),
    Item_Name: lk('p2', 'LED Mount I'),
    Item_Description: 'LED mount',
    BOQ: '3002',
    Estimate_Line_ID: '2002',
    Quantity: '10',
    Rate: '605.00',
    Amount: '6050.00',
    Quantity_Received: '10',
    Quantity_to_be_Received: '0',
    Received: true,
    Already_Delivered: '0',
    Store_Warehouse: lk('6900', '2.0 Warehouse, Al Quoz'),
  },
  {
    ID: '4603',
    Purchase_Order: lk('4502', 'PO-00311'),
    Item_Name: lk('p4', 'Consumables'),
    Item_Description: 'Consumables',
    BOQ: '3004',
    Estimate_Line_ID: '2004',
    Quantity: '5',
    Rate: '220.00',
    Amount: '1100.00',
    Quantity_Received: '0',
    Quantity_to_be_Received: '5',
    Received: false,
    Already_Delivered: '0',
  },
  {
    ID: '4604',
    Purchase_Order: lk('4503', 'PO-00312'),
    Item_Name: lk('p3', 'NTB-4K-10-S'),
    Item_Description: 'Media player',
    BOQ: '3003',
    Estimate_Line_ID: '2003',
    Quantity: '3',
    Rate: '2400.00',
    Amount: '7200.00',
    Quantity_Received: '0',
    Quantity_to_be_Received: '3',
    Received: false,
    Already_Delivered: '0',
  },
]
export const seedGoodsReceipts: CreatorRecord[] = [
  {
    ID: '4851',
    PR_No: 'PR-00001',
    Purchase_Order: lk('4501', 'PO-00310'),
    Vendor: 'LPDisplay',
    Receive_Date: '26-May-2026',
    Notes: 'Supplier DN: LPD-7781',
    Books_ID: '460000001',
    Lines: [
      {
        ID: '4861',
        Parent_Line_ID: '4601',
        Quantity_Received: '10',
        Store_Warehouse: '2.0 Warehouse, Al Quoz',
        Store_Rack: '1',
        Store_Segment: 'P01',
        Places: [{ Rack: '1', Segment: 'P01', Pallet: 'P01', Bay: 'A', Level: '1', Side: 'Right', Path: 'R1-A-L1-Right', Qty: '10', Serials: [] }],
      },
    ],
  },
  {
    ID: '4852',
    PR_No: 'PR-00002',
    Purchase_Order: lk('4502', 'PO-00311'),
    Vendor: 'Peculiar',
    Receive_Date: '21-May-2026',
    Notes: '',
    Books_ID: '460000002',
    Lines: [
      {
        ID: '4862',
        Parent_Line_ID: '4602',
        Quantity_Received: '10',
        Store_Warehouse: '2.0 Warehouse, Al Quoz',
        Store_Rack: '2',
        Store_Segment: 'P17',
        Places: [{ Rack: '2', Segment: 'P17', Pallet: 'P17', Bay: 'A', Level: '2', Side: 'Right', Path: 'R2-A-L2-Right', Qty: '10', Serials: [] }],
      },
    ],
  },
]
export const seedDeliveryNotes: CreatorRecord[] = [
  {
    ID: '4801',
    Project: lk('1001', 'PR_26040'),
    DN_No: 'DC-00001',
    DN_Date: '29-May-2026',
    Status: { ID: '9567', zc_display_value: 'Delivered', Index: '67' },
    Reference: 'PO-00310',
    Challan_Type: 'Others',
    Warehouse: lk('6900', '2.0 Warehouse, Al Quoz'),
    Vehicle_No: 'D 44871',
    Driver_Name: 'Imran K.',
    Received_By: 'SIB Facilities',
    Delivered_Date: '30-May-2026',
    Total: '54000.00',
    Books_ID: '470000001',
    Lines: [{ ID: '4601', Qty_to_Deliver: '10', DN_Amount: '54000.00' }],
  },
]

export const seedMilestones: CreatorRecord[] = [
  { ID: '4701', Project: P1, Estimate: E1, MILESTONES: 'Advance', Percentage: '40', AMOUNT: '74600.00', Terms: 'On PO' },
  { ID: '4702', Project: P1, Estimate: E1, MILESTONES: 'Delivery', Percentage: '40', AMOUNT: '74600.00', Terms: 'On delivery to site' },
  { ID: '4703', Project: P1, Estimate: E1, MILESTONES: 'Handover', Percentage: '20', AMOUNT: '37300.00', Terms: 'On final sign-off' },
]

// ── Department form (Name) — the workbook's Category / Department values ──
export const seedDepartments: CreatorRecord[] = [
  { ID: 'd1', Name: 'Client' },
  { ID: 'd2', Name: 'Main Contractor' },
  { ID: 'd3', Name: '2point0 Management' },
  { ID: 'd4', Name: 'Procurement' },
]

// ── Project_Risk (workbook "Risk Register" rows) ──
export const seedRisks: CreatorRecord[] = [
  {
    ID: '5001',
    Project_Name: P1,
    Risk_ID: 'R - 1',
    Risk_Description: 'Content Coordination',
    Department: lk('d1', 'Client'),
    Cause: '<p>SPOC details not shared on time and no confirmation on what content to display</p>',
    Probability: 'Medium',
    Impact: 'Significant',
    Risk_Severity: 'High',
    Risk_Score: '12',
    Risk_Owner: user('Pankaj Chowdhary'),
    Priority: 'Medium',
    Risk_Status: st('In-Progress'),
  },
  {
    ID: '5002',
    Project_Name: P1,
    Risk_ID: 'R - 2',
    Risk_Description: 'Wrong placement of Power Sockets',
    Department: lk('d2', 'Main Contractor'),
    Cause: "Doesn't Follow Instructions",
    Probability: 'Medium',
    Impact: 'Moderate',
    Risk_Severity: 'Medium',
    Risk_Score: '9',
    Risk_Owner: user('Pankaj Chowdhary'),
    Priority: 'Medium',
    Risk_Status: st('Closed Risk'),
  },
  {
    ID: '5003',
    Project_Name: P1,
    Risk_ID: 'R - 3',
    Risk_Description: 'Media player delivery delay',
    Department: lk('d3', '2point0 Management'),
    Probability: 'Very High',
    Impact: 'Significant',
    Risk_Severity: 'High',
    Risk_Score: '12',
    Risk_Owner: user('Harish Kunju'),
    Priority: 'High',
    Risk_Status: st('Not Started'),
  },
]

// ── Milestone form (Project lookup) — tasks point to their milestone with Task.Milestone (no task list rows) ──
// Project start = day(-40): MS3 runs day(-40)…day(-6) (still Active → delayed), MS4 day(-5)…day(19), MS6 from 2 months.
export const seedPlanMilestones: CreatorRecord[] = [
  {
    ID: '6101',
    Project: P1,
    Milestone_No: 'MIL-26-00001',
    Milestone_Name: 'MS3 | Project Procurement',
    Status: st('Active'),
    Owner: user('Pankaj Chowdhary'),
    Flag: 'Internal',
    Starts_After_In: 'Days',
    Starts_after: '0',
    Duration: '35',
  },
  {
    ID: '6102',
    Project: P1,
    Milestone_No: 'MIL-26-00002',
    Milestone_Name: 'MS4 | Project Execution',
    Status: st('Active'),
    Owner: user('Rafaqat Mustafa'),
    Flag: 'Internal',
    Starts_After_In: 'Weeks',
    Starts_after: '5',
    Duration: '25',
  },
  {
    ID: '6103',
    Project: P1,
    Milestone_No: 'MIL-26-00003',
    Milestone_Name: 'MS6 | Project Sign-Off',
    Status: st('Active'),
    Owner: user('Prashant Bakde'),
    Flag: 'External',
    Starts_After_In: 'Months',
    Starts_after: '2',
    Duration: '30',
  },
]

// ── Tasks (Task form) — as Estimate.Create_Project_Tasks makes them (Milestone & Task redesign): every task has its
// Milestone; Work Package roots (Type "Work Package", no Parent_Task) hold their tasks and sub-tasks by Parent_Task ──
const MS = { procurement: lk('6101', 'MS3 | Project Procurement'), execution: lk('6102', 'MS4 | Project Execution'), signoff: lk('6103', 'MS6 | Project Sign-Off') }
const task = (ID: string, Task_Name: string, parent: [string, string] | null, start: number, end: number, extra: Row = {}): CreatorRecord => ({
  ID,
  Project_Name: P1,
  Task_No: `T-${ID}`,
  Task_Name,
  Type_field: 'Task',
  Parent_Task: parent ? lk(parent[0], parent[1]) : '',
  Task_Start_Date: day(start),
  Task_End_Date: day(end),
  Duration: String(end - start + 1),
  Priority: 'Medium',
  Precent_Complete: '0',
  Task_Status: st('Not Started'),
  Owners: [],
  Added_User: 'prashant@example.com',
  ...extra,
})
const ROOT = { av02: ['7002', WP.av02], av04: ['7004', WP.av04] } as Record<string, [string, string]>
export const seedTasks: CreatorRecord[] = [
  task('7002', WP.av02, null, -4, 20, { Type_field: 'Work Package', Work_Package: WP.av02, Milestone: MS.execution, Owners: [user('Rafaqat Mustafa')] }),
  task('7004', WP.av04, null, 0, 8, { Type_field: 'Work Package', Work_Package: WP.av04, Milestone: MS.execution, Owners: [user('Rafaqat Mustafa')] }),
  task('7101', 'AV02 – Procurement & Delivery', null, -40, -10, {
    Work_Package: WP.av02,
    Milestone: MS.procurement,
    Precent_Complete: '100',
    Actual_Complete_Date: day(-10),
    Task_Status: st('Complete'),
    Owners: [user('Pankaj Chowdhary')],
    Work_Packages: ['2001', '2002', '2003', '2004'],
  }),
  task('7102', 'AV03 – Procurement & Delivery', null, -40, -3, {
    Work_Package: WP.av03,
    Milestone: MS.procurement,
    Precent_Complete: '70',
    Priority: 'High',
    Task_Status: st('On Track'),
    Owners: [user('Pankaj Chowdhary')],
  }),
  task('7103', 'AV02 – Installation', ROOT.av02, -2, 4, {
    Type_field: 'Work Package',
    Work_Package: WP.av02,
    Milestone: MS.execution,
    Precent_Complete: '40',
    Priority: 'High',
    Task_Status: st('On Track'),
    Owners: [user('Rafaqat Mustafa')],
    Task_Description: 'Mount the LED display behind the SSO desk and run power and data.',
  }),
  task('7109', 'Mounts & Brackets', ['7103', 'AV02 – Installation'], -2, 0, {
    Type_field: 'Work Package',
    Work_Package: WP.av02,
    Milestone: MS.execution,
    Precent_Complete: '50',
    Task_Status: st('On Track'),
    Owners: [user('Rasheed Aliyu')],
  }),
  task('7104', 'AV02 – Configuration', ROOT.av02, 0, 2, { Type_field: 'Work Package', Work_Package: WP.av02, Milestone: MS.execution, Owners: [user('Rasheed Aliyu')] }),
  task('7105', 'AV04 – Installation', ROOT.av04, 0, 6, {
    Type_field: 'Work Package',
    Work_Package: WP.av04,
    Milestone: MS.execution,
    Priority: 'High',
    Owners: [user('Rafaqat Mustafa'), user('Harish Kunju')],
  }),
  task('7108', 'Cable labelling', ROOT.av04, 5, 3, { Type_field: 'Work Package', Work_Package: WP.av04, Milestone: MS.execution, Duration: '', Owners: [user('Rasheed Aliyu')] }),
  task('7106', 'AV03 – Testing & Commissioning', null, 21, 24, { Milestone: MS.signoff, Owners: [user('Hossam Hosny')] }),
  task('7107', 'Final Sign Off', null, 50, 54, { Milestone: MS.signoff, Owners: [user('Prashant Bakde')] }),
  // A task of a project created before the redesign: no Milestone yet — shown under "No milestone"
  task('7201', 'Snagging', null, 40, 48, { Work_Package: WP.av02 }),
]

export const seedContacts: CreatorRecord[] = [
  {
    ID: '7501',
    Customers: lk('7100', 'Sharjah Islamic Bank'),
    Name: 'Omar Haddad',
    Designation: 'IT Infrastructure Head',
    Email: 'omar@example.com',
    Work_Phone: '+971 6 111 1111',
    Mobile: '+971 50 000 0000',
  },
]

/** Payment_Made: vendor payments against purchase orders (Payment_Date as ISO in the demo) */
export const seedPayments: CreatorRecord[] = [{ ID: '8801', Purchase_Order: '4501', Payment_Date: '2026-05-20', Amount: 5000, Reference_No: 'TT-2231', Payment_Note: 'Advance' }]

/** CRM deals without a cost analysis (Quote_ID empty) — 230, so the list loads a second page when scrolled */
export const seedOpenDeals: CreatorRecord[] = Array.from({ length: 230 }, (_, i) => ({
  ID: String(5500000000001 + i),
  Deal_Name: i === 0 ? 'Dubai Mall — Digital Signage Refresh' : i === 1 ? 'Riyadh HQ — Meeting Rooms AV' : `Opportunity ${String(i + 1).padStart(3, '0')}`,
  Account: ['Emaar Malls', 'Saudi Telecom', 'Sharjah Islamic Bank', 'Emirates Hospitality Group'][i % 4],
  Stage: ['Qualification', 'Needs Analysis', 'Proposal/Price Quote'][i % 3],
  Project_Reference: i < 2 ? `PR_2610${i}` : '',
  Amount: 50000 + i * 1250,
  Closing_Date: '2026-12-15',
}))
