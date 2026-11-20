import type { CreatorRecord } from '@/types/domain'

/** The stage that needs the Project Registration form complete (Widget.project_update checks the same list) */
export const KICKOFF_STAGE = 'Kick-Off Done'

export interface KickoffField {
  /** Project field link name; PO = Date PO Received or the PO / LOI / email file */
  name: string
  label: string
  section: string
  /** Filled in Creator, not in the widget (signatures, files, linked rows) */
  inCreator?: boolean
  /** Linked rows (grid): the record carries <name>_Count */
  rows?: boolean
  /** Only once the field exists on the Project form (Widget.project_console sends it) */
  ifPresent?: boolean
}

/**
 * Registration Form fields that are not on the Project form yet (in the 17 Nov DS they sit on Project_Registration_Task_List).
 * The widget shows and requires them only when Widget.project_console sends them — see docs/creator/KICKOFF_FORM_FIELDS.md.
 */
export const PENDING_FIELDS = ['Registration_Notes', 'Warranty_Document', 'Shop_Drawings_Status', 'Solution_Architect_Signature']
export const fieldReady = (record: CreatorRecord, name: string) => !PENDING_FIELDS.includes(name) || name in record

/**
 * Required before Kick-Off Done — the Project Registration Form (PDF), in its section order: project information, purchase
 * order review, key personnel, payment terms, budget, registration task list, the sales and project manager approvals, linked lists.
 * (Accepted Estimate is no longer on the edit form, so it is not required.)
 */
export const KICKOFF_REQUIRED: KickoffField[] = [
  { name: 'Client_Name', label: 'Client Name', section: 'Project Information' },
  { name: 'Project_Reference', label: 'Project Reference #', section: 'Project Information' },
  { name: 'Project_Name', label: 'Project Name', section: 'Project Information' },
  { name: 'Address', label: 'Address', section: 'Project Information' },
  { name: 'City', label: 'City', section: 'Project Information' },
  { name: 'Country', label: 'Country', section: 'Project Information' },
  { name: 'Project_Description', label: 'Project Description', section: 'Project Scope Review' },
  { name: 'Type_of_Project', label: 'Type of Project', section: 'Project Scope Review' },
  { name: 'Currency', label: 'Currency', section: 'Project Information' },
  { name: 'Start_Date', label: 'Start Date', section: 'Project Information' },
  { name: 'Project_Completion_Date', label: 'Project Completion Date', section: 'Project Information' },
  { name: 'Client_PO_No', label: 'Client Purchase Order #', section: 'Purchase Order Review' },
  { name: 'Project_Value_PO', label: 'Project Value', section: 'Purchase Order Review' },
  { name: 'PO', label: 'Date Purchase Order was Received, or the email confirmation / letter of intent file', section: 'Purchase Order Review' },
  { name: 'Sales_Representative', label: 'Sales Representative', section: '2point0 Key Personnel' },
  { name: 'Solution_Architect', label: 'Pre Sales / Solution Architect', section: '2point0 Key Personnel' },
  { name: 'Project_Manager', label: 'Project Manager', section: '2point0 Key Personnel' },
  { name: 'Finance_Representative', label: 'Finance Representative', section: '2point0 Key Personnel' },
  { name: 'Logistics_Coordinator', label: 'Logistics', section: '2point0 Key Personnel' },
  { name: 'Health_Safety_Manager', label: 'Health & Safety Manager', section: '2point0 Key Personnel' },
  { name: 'Meeting_Attendees', label: '2point0 Meeting Attendees (mark Present / Absent for at least one)', section: '2point0 Key Personnel', rows: true },
  { name: 'Payment_Terms_Agreed', label: 'Payment Terms Agreed (at least one)', section: 'Payment Summary', inCreator: true, rows: true },
  { name: 'Hardware', label: 'Hardware budget', section: 'Project Budget Review' },
  { name: 'Software', label: 'Software budget', section: 'Project Budget Review' },
  { name: 'Outsourced_Services', label: 'Outsourced Services budget', section: 'Project Budget Review' },
  { name: 'point0_Services', label: '2point0 Services budget', section: 'Project Budget Review' },
  { name: 'Logistics', label: 'Logistics budget', section: 'Project Budget Review' },
  { name: 'Shop_Drawings_Status', label: 'Shop Drawings Status', section: 'Shop Drawings', ifPresent: true },
  { name: 'Project_Registration_Task_List', label: 'Project Registration Task List (tick every item)', section: 'Project Registration Task List' },
  { name: 'Sales_Person', label: 'Sales Person Full Name', section: 'Signatures' },
  { name: 'Sales_Signature', label: 'Sales Signature', section: 'Signatures', inCreator: true },
  { name: 'Project_manager_Approval', label: 'Project Manager Approval', section: 'Signatures' },
  { name: 'Project_manager_Signature', label: 'Project Manager Signature', section: 'Signatures', inCreator: true },
  { name: 'Pro', label: 'Project Team (at least one — add members on the Overview tab, Team)', section: '2point0 Key Personnel', rows: true },
]

const empty = (v: unknown): boolean => {
  if (v === null || v === undefined) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return empty((v as Record<string, unknown>).address_line_1 ?? (v as Record<string, unknown>).ID ?? (v as Record<string, unknown>).zc_display_value)
  return String(v).trim() === ''
}

/** The required fields that apply to this record (fields not on the Project form yet are left out) */
export const kickoffRequired = (record: CreatorRecord) => KICKOFF_REQUIRED.filter((f) => !f.ifPresent || fieldReady(record, f.name))

/**
 * Required fields still empty: form values (what is being edited) first, else the saved record. checklist = the IDs of
 * the active Project Registration Task List items (every one must be ticked), or just how many there are.
 */
export function kickoffMissing(record: CreatorRecord, values: Record<string, unknown> = {}, checklist: number | string[] = 0): KickoffField[] {
  const value = (name: string) => (name in values ? values[name] : record[name])
  return kickoffRequired(record).filter((f) => {
    if (f.name === 'Project_Registration_Task_List') {
      const raw = value(f.name)
      const ticked = (Array.isArray(raw) ? raw : empty(raw) ? [] : [raw]).map((x) => (x && typeof x === 'object' ? String((x as Record<string, unknown>).ID) : String(x)))
      if (Array.isArray(checklist)) return ticked.length === 0 || checklist.some((id) => !ticked.includes(id))
      return ticked.length === 0 || ticked.length < checklist
    }
    if (f.name === 'PO') return empty(value('Date_PO_Received')) && empty(record.PO_Document)
    if (f.rows) return !(Number(record[`${f.name}_Count`] ?? 0) > 0)
    return empty(value(f.name))
  })
}
