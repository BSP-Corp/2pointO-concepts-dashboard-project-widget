// Project form layout, field by field, as defined in 2Point0concepts.ds (form Project).
// Sections and the two-column order follow the .ds row/column values. The edit form renders from this list,
// so a field added to the Creator form only needs one line here.
import { REPORTS } from './zoho'

/** Where a lookup's options come from: report link name + the field the .ds uses as displayformat. */
export interface LookupSource {
  key: string
  report: string
  label: string
}

export const LOOKUPS = {
  customers: { key: 'customers', report: REPORTS.customers, label: 'Customer_Name' },
  statuses: { key: 'statuses', report: REPORTS.statuses, label: 'Status_Name' },
  countries: { key: 'countries', report: REPORTS.countries, label: 'Country_Name' },
  currencies: { key: 'currencies', report: REPORTS.currencies, label: 'Currency_Name' },
  users: { key: 'users', report: REPORTS.users, label: 'Name' },
  // Accepted_Estimate looks up Estimate (displayformat Quote_No). Options come from Estimate_Accepted
  // (accepted, latest versions); the project's current value is always kept as an option.
  estimates: { key: 'estimates', report: REPORTS.acceptedEstimates, label: 'Quote_No' },
  taskList: { key: 'taskList', report: REPORTS.taskList, label: 'Task_Name' },
} satisfies Record<string, LookupSource>

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'currency'
  | 'picklist' // static values from the .ds
  | 'lookup' // single lookup (picklist on another form)
  | 'multilookup' // list lookup
  | 'address'
  | 'file' // read-only here: upload in Creator
  | 'signature' // read-only here
  | 'grid' // read-only here: rows are managed in Creator

export interface FormField {
  name: string
  label: string
  kind: FieldKind
  /** Shown, not edited here (Project Status moves through the pipeline, with its rules) */
  readOnly?: boolean
  values?: readonly string[]
  source?: LookupSource
}

export interface FormSection {
  title: string
  columns: [FormField[], FormField[]]
}

const u = (name: string, label: string): FormField => ({ name, label, kind: 'lookup', source: LOOKUPS.users })
const money = (name: string, label: string): FormField => ({ name, label, kind: 'currency' })
const date = (name: string, label: string): FormField => ({ name, label, kind: 'date' })
const text = (name: string, label: string): FormField => ({ name, label, kind: 'text' })
const grid = (name: string, label: string): FormField => ({ name, label, kind: 'grid' })

export const PROJECT_FORM: FormSection[] = [
  {
    title: 'Project',
    columns: [
      [
        text('Project_Reference', 'Project Reference #'),
        { name: 'Client_Name', label: 'Client Name', kind: 'lookup', source: LOOKUPS.customers },
        { name: 'Project_Status', label: 'Project Status', kind: 'lookup', source: LOOKUPS.statuses, readOnly: true },
        { name: 'Country', label: 'Country', kind: 'multilookup', source: LOOKUPS.countries },
        { name: 'Address', label: 'Address', kind: 'address' },
        { name: 'Project_Description', label: 'Project Description', kind: 'textarea' },
        date('Project_Completion_Date', 'Project Completion Date'),
      ],
      [
        text('Project_Name', 'Project Name'),
        { name: 'Type_of_Project', label: 'Type of Project', kind: 'picklist', values: ['Audio Visual', 'Digital Signage', 'Audio Visual + Digital Signage'] },
        { name: 'Currency', label: 'Currency', kind: 'lookup', source: LOOKUPS.currencies },
        text('City', 'City'),
        text('State', 'State'),
        date('Start_Date', 'Start Date'),
        date('Actual_Completion_Date', 'Actual Completion Date'),
      ],
    ],
  },
  {
    title: '2point0 Key Personnel',
    columns: [
      [u('Project_Manager', 'Project Manager'), u('Solution_Architect', 'Pre Sales / Solution Architect'), u('Finance_Representative', 'Finance Representative'), u('Health_Safety_Manager', 'Health & Safety Manager')],
      [u('Sales_Representative', 'Sales Representative'), u('Lead_Engineer', 'Lead Engineer'), u('Logistics_Coordinator', 'Logistics')],
    ],
  },
  {
    title: 'Project Overview',
    columns: [
      [
        text('Client_PO_No', 'Client Purchase Order #'),
        money('Project_Value_PO', 'Project Value (PO)'),
        { name: 'PO_Document', label: 'PO / LOI / Email Confirmation', kind: 'file' },
        { name: 'Accepted_Estimate', label: 'Accepted Estimate', kind: 'lookup', source: LOOKUPS.estimates },
      ],
      [date('Date_PO_Received', 'Date PO Received'), money('Estimate_Value_Sub_Total', 'Estimate Value (Sub Total)'), text('Sales_Order_No', 'Sales Order No')],
    ],
  },
  {
    title: 'Project Budget [Costs]',
    columns: [
      [money('Hardware', 'Hardware'), money('Outsourced_Services', 'Outsourced Services'), money('Logistics', 'Logistics'), money('Estimated_Margin', 'Estimated Margin')],
      [money('Software', 'Software'), money('point0_Services', '2point0 Services'), money('Total_Budget_Cost', 'Total Budget Cost')],
    ],
  },
  {
    title: 'Registration & Sign-off',
    columns: [
      [
        { name: 'Project_Registration_Task_List', label: 'Project Registration Task List', kind: 'lookup', source: LOOKUPS.taskList },
        u('Sales_Person', 'Sales Person'),
        u('Project_manager_Approval', 'Project manager Approval'),
      ],
      [
        { name: 'Health_Safety_Manager_Signature', label: 'Health & Safety Manager Signature', kind: 'signature' },
        { name: 'Sales_Signature', label: 'Sales Signature', kind: 'signature' },
        { name: 'Project_manager_Signature', label: 'Project manager  Signature', kind: 'signature' },
      ],
    ],
  },
  {
    title: 'Linked records (managed in Creator)',
    columns: [
      [grid('Meeting_Attendees', '2point0 Meeting Attendees'), grid('Pro', 'Project Team'), grid('Projects_contacts', 'Client / Outsourced Contacts'), grid('Procurement_Details', 'Procurement Details')],
      [grid('Assest_Network_Details', 'Assest & Network Details'), grid('Payment_Terms_Agreed', 'Payment Terms Agreed'), grid('Project_Budget_Review', 'Project Budget Review')],
    ],
  },
]

/** Sub-fields of the Project Address field that are visible on the form (the .ds hides City, State, Postal Code, Country). */
export const ADDRESS_PARTS = [
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
] as const
