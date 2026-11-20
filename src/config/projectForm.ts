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
  // Estimate lookups (displayformat Quote_No) from Estimate_Accepted — Accepted_Estimate is no longer on the edit form
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
  | 'file' // upload / replace / open here (Project PO_Document)
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
  /** Help text under the field, as on the Project Registration Form */
  hint?: string
  /** Picklist shown as radio cards (as on the Registration Form) */
  radio?: boolean
  /** Multi lookup shown as check cards with Tick all (the Registration checklist) */
  cards?: boolean
}

export interface FormSection {
  title: string
  /** Intro line under the section title (Project Registration Form) */
  intro?: string
  /** [the Registration Form's fields, stacked full width as on the PDF] [more project fields, in a two-column grid] */
  columns: [FormField[], FormField[]]
  /** Sections with their own rows instead of fields */
  rows?: 'contacts' | 'milestones' | 'payments' | 'shopDrawings'
  /** Key Personnel: Role | Employee Name | Present Yes / No (Meeting_Attendee). Budget: Category | Budget Cost | currency */
  layout?: 'personnel' | 'budget'
  /** Text after the fields (Registration Form notes) */
  note?: string
}

const u = (name: string, label: string): FormField => ({ name, label, kind: 'lookup', source: LOOKUPS.users })
const money = (name: string, label: string): FormField => ({ name, label, kind: 'currency' })
const date = (name: string, label: string): FormField => ({ name, label, kind: 'date' })
const text = (name: string, label: string): FormField => ({ name, label, kind: 'text' })

/**
 * Sections and labels follow "3. Project Registration Form" (PDF); the field link names are the Project form's (DS 23).
 * Fields the PDF does not have (Project Status, Currency, State, dates, Lead Engineer, Sales Order No…) stay where they were.
 */
export const PROJECT_FORM: FormSection[] = [
  {
    title: 'Project Information',
    intro: 'Complete all sections to ensure a smooth handover from Sales to Project Management and Project Success. Enter accurate details for all fields.',
    columns: [
      [
        { name: 'Client_Name', label: 'Client Name', kind: 'lookup', source: LOOKUPS.customers },
        text('Project_Reference', 'Project Reference #'),
        { ...text('Project_Name', 'Project Name'), hint: 'Please type the Project Name as per Client.' },
        { name: 'Address', label: 'Address', kind: 'address' },
        text('City', 'City'),
        { name: 'Country', label: 'Country', kind: 'multilookup', source: LOOKUPS.countries },
      ],
      [
        { name: 'Project_Status', label: 'Project Status', kind: 'lookup', source: LOOKUPS.statuses, readOnly: true },
        { name: 'Currency', label: 'Currency', kind: 'lookup', source: LOOKUPS.currencies },
        text('State', 'State'),
        date('Start_Date', 'Start Date'),
        date('Project_Completion_Date', 'Project Completion Date'),
        date('Actual_Completion_Date', 'Actual Completion Date'),
      ],
    ],
  },
  {
    title: 'Project Scope Review',
    intro: 'Briefly introduce the project, stating its name, purpose, and key objectives. Outline the scope, timeline, and major milestones to align the team.',
    columns: [
      [
        { name: 'Project_Description', label: 'Project Description', kind: 'textarea' },
        { name: 'Type_of_Project', label: 'Type of Project', kind: 'picklist', values: ['Audio Visual', 'Digital Signage', 'Audio Visual + Digital Signage'], radio: true },
      ],
      [],
    ],
  },
  {
    title: 'Purchase Order Review',
    columns: [
      [
        text('Client_PO_No', 'Client Purchase Order #'),
        { ...money('Project_Value_PO', 'Project Value'), hint: 'Please type the project value starting with the Currency in which the project Purchase Order was issued.' },
        { ...date('Date_PO_Received', 'Date Purchase Order was Received'), hint: 'Please input the Purchase Order Date. If the Purchase Order was not received, please do not enter any date.' },
        {
          name: 'PO_Document',
          label: 'Purchase Order / Email Confirmation / Letter of Intent',
          kind: 'file',
          hint: 'If no Purchase Order (PO) was received, upload an email confirmation or letter of intent here.',
        },
      ],
      [money('Estimate_Value_Sub_Total', 'Estimate Value (Sub Total)'), text('Sales_Order_No', 'Sales Order No')],
    ],
  },
  {
    title: '2point0 Key Personnel',
    intro:
      'In the "Key Personnel" section, provide the names and contact details of the Sales Person, Solution Architect, and Project Manager, Finance and Health & Safety Manager responsible for the project.',
    layout: 'personnel',
    columns: [
      [
        u('Sales_Representative', 'Sales Representative'),
        u('Solution_Architect', 'Pre Sales / Solution Architect'),
        u('Project_Manager', 'Project Manager'),
        u('Finance_Representative', 'Finance Representative'),
        u('Logistics_Coordinator', 'Logistics'),
        u('Health_Safety_Manager', 'Health & Safety Manager'),
        { name: 'Health_Safety_Manager_Signature', label: 'Health & Safety Manager Signature', kind: 'signature' },
      ],
      [u('Lead_Engineer', 'Lead Engineer')],
    ],
  },
  { title: 'Contact Person', intro: 'Client Side Contact List — the client contacts of this project.', columns: [[], []], rows: 'contacts' },
  {
    title: 'Key Milestones & Dates',
    intro: 'The key milestones of this project with their Start and End Dates.',
    columns: [[], []],
    rows: 'milestones',
  },
  {
    title: 'Payment Summary',
    intro: 'Payment Terms Agreed.',
    note: 'Please take a moment to verify that the payment terms in the client PO fully match the Final Approved Estimate and the terms we’ve agreed to, ensuring everything lines up before approval.',
    columns: [[], []],
    rows: 'payments',
  },
  {
    title: 'Project Budget Review',
    layout: 'budget',
    note: 'Ensure the Cost Budget for Hardware, Software, Outsourced Services, 2point0 Services, and Logistics matches the Final Approved Estimate and PO.',
    columns: [
      [
        money('Hardware', 'Hardware'),
        money('Software', 'Software'),
        money('Outsourced_Services', 'Outsourced Services'),
        money('point0_Services', '2point0 Services'),
        money('Logistics', 'Logistics'),
      ],
      [],
    ],
  },
  {
    title: 'Warranty & Extended Warranty Review',
    intro:
      'This section outlines the warranty and extended warranty terms for hardware in the project. It specifies the standard warranty duration, coverage details, and conditions for repair or replacement of defective components.',
    columns: [[{ name: 'Warranty_Document', label: 'Please Upload BOQ & Warranty Items', kind: 'file' }], []],
  },
  {
    title: 'Shop Drawings',
    intro: 'Please identify who is the Solution Architect on the project who will be responsible for taking charge of the design and Shop Drawings for this project.',
    columns: [
      [
        { name: 'Shop_Drawings_Status', label: 'Shop Drawings Status', kind: 'picklist', values: ['Pending', 'In Progress', 'Submitted', 'Approved'] },
        {
          name: 'Solution_Architect_Signature',
          label: 'Solution Architect Signature',
          kind: 'signature',
          hint: 'Please provide the signature of the individual who will assume responsibility for the Shop Drawings. This should be the Solution Architect.',
        },
      ],
      [],
    ],
    rows: 'shopDrawings',
  },
  {
    title: 'Project Registration Task List',
    intro:
      'Review and complete each task in the "Project Registration Task List" by addressing the corresponding review items, adding detailed notes as needed, and marking each task as "REVIEWED" once verified and finalized.',
    columns: [
      [
        { name: 'Project_Registration_Task_List', label: 'Project Registration Task List', kind: 'multilookup', source: LOOKUPS.taskList, cards: true },
        { name: 'Registration_Notes', label: 'Registration Notes', kind: 'textarea', hint: 'Please take notes.' },
      ],
      [],
    ],
  },
  {
    title: 'Signatures',
    intro:
      'Sales Approval: By signing this approval, the Sales team confirms that the project scope, financials, and contract terms have been reviewed and align with client expectations and company objectives.',
    note: 'By signing this approval, the Project Manager verifies that the project timelines, resource assignments, risks, and success criteria have been assessed and are feasible for successful project execution.',
    columns: [
      [
        u('Sales_Person', 'Sales Person Full Name'),
        { name: 'Sales_Signature', label: 'Sales Signature', kind: 'signature' },
        u('Project_manager_Approval', 'Project Manager Approval'),
        { name: 'Project_manager_Signature', label: 'Project Manager Signature', kind: 'signature' },
      ],
      [],
    ],
  },
]

/** Sub-fields of the Project Address field that are visible on the form (the .ds hides City, State, Postal Code, Country). */
export const ADDRESS_PARTS = [
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
] as const
