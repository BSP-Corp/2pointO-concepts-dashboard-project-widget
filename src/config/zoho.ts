// ─────────────────────────────────────────────────────────────────────────────
// Zoho Creator mapping — THE ONLY FILE that knows Creator link names.
// Every name below is taken from the application export 2Point0concepts.ds
// (forms, report columns, Custom APIs used by the Cost Analysis widget).
// The one exception is RISK: that form does not exist yet — see docs/RISK_REGISTER_FORM.md.
// ─────────────────────────────────────────────────────────────────────────────

/** Optional: the SDK uses the current application when app_name is omitted. */
export const ZOHO_APP = {
  appName: import.meta.env.VITE_ZOHO_APP_NAME ?? '',
}

/** Report link names, for reference: the widget reads through Widget.project_console, which fetches these forms directly. */
export const REPORTS = {
  projects: 'All_Projects',
  costingLines: 'Costing_Lineitem_Report',
  boq: 'BOQ_Report',
  purchaseOrders: 'All_Purchase_Orders',
  /** Purchase_Receive: the widget uploads each supplier document into its Attachments field (Multiple files, up to 10) */
  purchaseReceives: 'Purchase_Receive_Report',
  /** Delivery_Note: the widget uploads each file into its Attachments field (the report must show Attachments) */
  deliveryNotes: 'All_Delivery_Notes',
  /** Form Task_File: files of a task or of one of its comments, uploaded into its File_field field */
  taskFiles: 'All_Task_Files',
  poLines: 'All_Po_Line_Items',
  paymentMilestones: 'All_Payment_Milestones',
  budgetReview: 'All_Summaries',
  statuses: 'All_Statuses',
  customers: 'All_Customers',
  users: 'All_Users',
  countries: 'All_Countries',
  currencies: 'All_Currency',
  acceptedEstimates: 'Estimate_Accepted',
  /** Project_Registration_Task_List form (the Registration checklist items, Status Active) */
  taskList: 'All_Project_Registration_Task_Lists',
  /** New report — create it with the Risk_Register form (docs/RISK_REGISTER_FORM.md). */
  risks: 'All_Risks',
} as const

/**
 * Zoho CRM deal page (Estimate.Deals = the Deal ID). Set ORG to the CRM org ID shown in a CRM deal URL
 * (crm.zoho.com/crm/<org>/tab/Potentials/<id>) when CRM does not open the deal from the short link.
 */
/** Download links of upload-file fields: <base>/<report>/<record ID>/<field>/download?filepath=<value> */
export const CREATOR_FILES = { base: 'https://creatorapp.zoho.com/file/2point0concepts/point0concepts' }

/** Name on printed documents when Zoho Books does not answer; the logo is src/assets/company-logo.(png|jpg|svg) */
export const COMPANY = { name: '2Point0concepts' }

export const CRM = {
  base: 'https://crm.zoho.com/crm',
  org: 'org744131844',
  dealUrl(id: string) {
    return `${this.base}${this.org ? `/${this.org}` : ''}/tab/Potentials/${encodeURIComponent(id)}`
  },
}

/** Creator page that hosts the standalone Cost Analysis widget: page Cost_Analysis_Page(string act_ion, string quo_id). */
export const COST_ANALYSIS_PAGE = {
  name: 'Cost_Analysis_Page',
  /** act_ion = "project_<Project ID>": the Cost Analysis widget shows Back → Project_Widget?project_id=<ID>. */
  fromProjectAction: 'project_',
}

/**
 * Existing Custom APIs (same configuration as the Cost Analysis widget, src/config/constants.js → API).
 * GET, OAuth2, all users, one query parameter `quo_data` = JSON string.
 */
export const CUSTOM_APIS = {
  projectConsole: { name: 'Widget_Project_Console', fn: 'Widget.project_console', method: 'GET', param: 'quo_data' },
  projectDetails: { name: 'Widget_Project_Details', fn: 'Widget.project_details', method: 'GET', param: 'quo_data' },
  projectDashboard: { name: 'Widget_Project_Dashboard', fn: 'Widget.project_dashboard', method: 'GET', param: 'quo_data' },
  projectOptions: { name: 'Widget_Project_Options', fn: 'Widget.project_options', method: 'GET', param: 'quo_data' },
  projectUpdate: { name: 'Widget_Project_Update', fn: 'Widget.project_update', method: 'PUT', param: 'quo_data' },
  projectTaskUpdate: { name: 'Widget_Project_Task_Update', fn: 'Widget.project_task_update', method: 'PUT', param: 'quo_data' },
  projectCreatePo: { name: 'Widget_Project_Create_PO', fn: 'Widget.project_create_po', method: 'POST', param: 'quo_data' },
  projectRiskSave: { name: 'Widget_Project_Risk_Save', fn: 'Widget.project_risk_save', method: 'POST', param: 'quo_data' },
  purchaseReceive: { name: 'Widget_Purchase_Receive', fn: 'Widget.purchase_receive', method: 'POST', param: 'quo_data' },
  purchaseDelivery: { name: 'Widget_Purchase_Delivery', fn: 'Widget.purchase_delivery', method: 'POST', param: 'quo_data' },
  /** New Custom API (docs/CUSTOM_FUNCTIONS.md): PO payments into form Payment_Made, Creator only (no Zoho Books) */
  poPaymentSave: { name: 'Widget_PO_Payment_Save', fn: 'Widget.po_payment_save', method: 'POST', param: 'quo_data' },
  /** New Custom API (docs/CUSTOM_FUNCTIONS.md): task comments, replies and files (forms Task_Note, Task_File) */
  taskCollab: { name: 'Widget_Task_Collab', fn: 'Widget.task_collab', method: 'POST', param: 'quo_data' },
  /** New Custom API (docs/CUSTOM_FUNCTIONS.md): CRM deals without a cost analysis (Quote_ID empty), and creating one */
  dealEstimate: { name: 'Widget_Deal_Estimate', fn: 'Widget.deal_estimate', method: 'POST', param: 'quo_data' },
} as const
export type CustomApiKey = keyof typeof CUSTOM_APIS

/**
 * Creator pages. The same widget zip is placed on all three:
 *  - Home                                          → Project Search Dashboard
 *  - Project_Widget(project_id)                    → Project Widget for that project
 *  - Procurement_Schedule(procurement_project_id)  → Procurement Schedule (opened from the Procurement tab)
 */
export const PAGES = {
  home: 'Home',
  project: 'Project_Widget',
  projectParam: 'project_id',
  /** Procurement Schedule page: Procurement_Schedule(string procurement_project_id) — its own parameter name tells the widget which screen to show. */
  procurement: 'Procurement_Schedule',
  procurementParam: 'procurement_project_id',
}

/** Users.Role values (DS picklist) shown as "Technician" in the team list; every other role is a "User". */
export const TECHNICIAN_ROLES = ['Site Supervisor / Installer']

/** Field link names per form (from the .ds). */
export const FIELDS = {
  project: {
    reference: 'Project_Reference',
    name: 'Project_Name',
    client: 'Client_Name',
    status: 'Project_Status',
    type: 'Type_of_Project',
    country: 'Country',
    currency: 'Currency',
    address: 'Address',
    city: 'City',
    state: 'State',
    description: 'Project_Description',
    startDate: 'Start_Date',
    completionDate: 'Project_Completion_Date',
    actualCompletionDate: 'Actual_Completion_Date',
    projectManager: 'Project_Manager',
    clientPoNo: 'Client_PO_No',
    projectValuePo: 'Project_Value_PO',
    acceptedEstimate: 'Accepted_Estimate',
    datePoReceived: 'Date_PO_Received',
    estimateValueSubTotal: 'Estimate_Value_Sub_Total',
    salesOrderNo: 'Sales_Order_No',
    hardware: 'Hardware',
    software: 'Software',
    outsourcedServices: 'Outsourced_Services',
    logistics: 'Logistics',
    point0Services: 'point0_Services',
    estimatedMargin: 'Estimated_Margin',
    totalBudgetCost: 'Total_Budget_Cost',
  },
  costingLine: {
    project: 'Project',
    estimate: 'Cost_Analysis',
    workPackage: 'Work_Package',
    vendor: 'Vendor',
    category: 'Category',
    type: 'Type_field',
    brand: 'Brand',
    sku: 'SKU',
    model: 'Model',
    description: 'Item_Description',
    uom: 'Unit_of_Measurement',
    quantity: 'Quantity',
    totalCost: 'Total_Cost',
    totalPrice: 'Total_Price',
    totalProfit: 'Total_Profit',
    deliveryStatus: 'Delivery_Status',
    installationStatus: 'Installation_Status',
    notes: 'Notes',
    serialNumber: 'Serial_Number',
    macControl: 'MAC_Address_Control',
    macDante: 'MAC_Address_Dante',
    warrantyStart: 'Warranty_Start_Date',
    warrantyEnd: 'Warranty_End_Date',
    provision: 'Provision',
    outletGop: 'Outlet_GOP_No',
    networked: 'Networked',
    switchRef: 'Switch_Ref',
    portNo: 'Port_No',
    poe: 'POE',
    vlan: 'VLAN',
    ipAddress: 'IP_Address',
    subnetMask: 'Subnet_Mask',
    hostName: 'Host_Name',
    gateway: 'Gateway',
    dns1: 'DNS_Server_1',
    dns2: 'DNS_Server_2',
  },
  boq: {
    project: 'Project',
    acceptedEstimate: 'Estimate1',
    reference: 'Project_Reference',
    workPackage: 'Work_Package',
    vendor: 'Vendors',
    category: 'Category',
    type: 'Type_form',
    brand: 'Brand',
    sku: 'SKU',
    model: 'Model',
    description: 'Description',
    uom: 'UOM',
    quantity: 'Quantity',
    warranty: 'Warranty',
    status: 'Status',
    poDate: 'PO_Date',
    po: 'PO',
    modeOfTransit: 'Mode_of_Transit',
    eta: 'ETA',
    deliveredToWarehouse: 'Delivered_to_2_0_Warehouse',
    dateDeliveredToWarehouse: 'Date_delivered_to_warehouse',
    deliveredToCustomer: 'Delivered_to_Customer',
    dateDeliveredToCustomer: 'Date_delivered_to_customer',
  },
  purchaseOrder: {
    poNo: 'PO_No',
    vendor: 'Vendor_Name',
    date: 'Date_field',
    reference: 'Reference',
    deliveryDate: 'Delivery_Date',
    subTotal: 'Sub_Total',
    discount: 'Discount',
    totalCost: 'Total_Cost',
  },
  poLine: {
    purchaseOrder: 'Purchase_Order',
    item: 'Item_Name',
    description: 'Item_Description',
    quantity: 'Quantity',
    rate: 'Rate',
    amount: 'Amount',
    quantityReceived: 'Quantity_Received',
    quantityToBeReceived: 'Quantity_to_be_Received',
    received: 'Received',
  },
  paymentMilestone: {
    project: 'Project',
    estimate: 'Estimate',
    name: 'MILESTONES',
    amount: 'AMOUNT',
    percentage: 'Percentage',
    terms: 'Terms',
  },
  budgetReview: {
    project: 'Project',
    estimate: 'Estimate',
    category: 'Description',
    costPct: 'Cost',
    totalCost: 'Total_Cost',
    totalPrice: 'Total_price',
    profit: 'PROFIT',
    margin: 'MARGIN',
  },
  status: { name: 'Status_Name', modules: 'Modules' },
  /** Risk_Register — NEW form, see docs/RISK_REGISTER_FORM.md. */
  risk: {
    project: 'Project',
    riskNo: 'Risk_No',
    description: 'Risk_Description',
    category: 'Category_Department',
    cause: 'Cause',
    consequence: 'Consequence',
    probability: 'Probability',
    impact: 'Impact',
    severity: 'Risk_Severity',
    score: 'Risk_Score',
    owner: 'Risk_Owner',
    strategy: 'Risk_Response_Strategy',
    dueDate: 'Due_Date',
    priority: 'Priority',
    status: 'Status',
    action: 'Risk_Response_Action',
  },
} as const

/** Upload field of the Task_File form (label "File", link name File_field — DS 21) */
export const TASK_FILE_FIELD = 'File_field'

/** Reporting tag of a transaction line (Division picklist of Vendors, Product and PO_Line_Items) */
export const DIVISIONS = ['Audio Visual', 'Digital Signage', 'Shared/Overhead'] as const
