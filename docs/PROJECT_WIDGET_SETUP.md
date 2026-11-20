# Home (Project Search Dashboard) + Project Widget — Creator setup

One widget zip (`dist/2point0-pm.zip`) serves two pages. The page parameter decides which screen shows:

| Creator page | Parameter | Shows |
|---|---|---|
| **Home** (exists in the DS and the navigation) | none | **Project Search Dashboard** (title "Home") |
| **Project_Widget** (create it) | `project_id` (string) | **Project Widget** for that project |
| **Procurement_Schedule** (create it) | `procurement_project_id` (string) | **Procurement Schedule**, opened by "Open Procurement" in the Procurement tab |

## 1. Widget
Settings → Widgets → (edit your widget) → upload `dist/2point0-pm.zip`. Index file: `/app/widget.html`.

## 2. Home page
Home already contains a widget element. Make it this widget.

## 3. New page `Project_Widget`
1. Create a page named **Project_Widget**.
2. Add a parameter **`project_id`** (string).
3. Add the same widget at full width, the same way Home and Cost_Analysis_Page do.
4. You don't need to add it to the navigation. Projects open from Home or from the report button below.

## 3b. New page `Procurement_Schedule`
1. Create a page named **Procurement_Schedule**.
2. Add a parameter **`procurement_project_id`** (string). This name is what tells the widget to show the Procurement Schedule.
3. Add the same widget at full width.

## 3c. Procurement module: goods receipt and delivery notes (v1.2, DS 11)
1. Create the functions `Widget.purchase_receive` and `Widget.purchase_delivery` from [creator/](creator/) and paste the updated `project_console`, `project_options` and `project_create_po` (see [CUSTOM_FUNCTIONS.md](CUSTOM_FUNCTIONS.md)).
2. Create the Custom APIs **Widget_Purchase_Receive** and **Widget_Purchase_Delivery** (POST, OAuth2, all users, parameter `quo_data`).
3. Goods receipts and delivery notes made in the widget create the same records as the existing Purchase Receive / Delivery Challan buttons, and run the same steps as their workflows, because workflows do not run when Deluge inserts a record.
4. Payments stay in Zoho Books (no payment fields in Creator); the Payments section shows terms days, due date and the Books sync state.

## 4. "Open Project" button on the Projects report
In **All_Projects**:
1. Go to Edit report → Record actions → Custom action, named **Open Project Widget**.
2. Choose Deluge, and use the same pattern as your existing `openPopupQuote` action on Estimate:

```deluge
openUrl("#Page:Project_Widget?project_id=" + input.ID, "same window");
```

## 5. Status pipeline (configuration, not code)
- **Where the stages come from:** the pipeline, the header badge and the status-move rules all read the **Status** records whose **Modules** include **Project**, ordered by **Index**.
- **What to create:** these Status records, in this order: Estimation → Approved → Procurement → Delivery → Installation → Testing & Commissioning → Handover → Closed. Each one needs Modules = Project.
- **Watch out:** `Estimate.Create_Project_From_Estimate` sets `Status[Index_field == 1]`. That record should be the first Project stage, Estimation. A project whose status is not one of these records shows "Current status … is not a pipeline stage".

## 6. Cost Analysis widget
Rebuild and re-upload it (`npm run pack`). "View Estimate" opens `Cost_Analysis_Page?quo_id=<Estimate>&act_ion=project_<Project ID>`, and its **Back** button returns to `Project_Widget?project_id=<Project ID>`.

---

# Rules the widget applies (please confirm)

| Topic | Rule | Why |
|---|---|---|
| Overall progress | **Task-weighted:** average % complete of all tasks (completed = 100%). Planned % = each milestone's elapsed share of its start→end dates, averaged | Requirement 6 asks for one documented formula |
| Milestones | Milestone records (Project lookup). Planned start = project Start Date + Starts after (Days / Weeks / Months); end = start + Duration − 1 days. Task lists = Tasks without a Parent Task whose name equals the milestone's Task List. Tasks = their children; subtasks = children of tasks. Progress = closed tasks ÷ all tasks. Delayed = planned end passed and status not Complete / Closed | As `Tasks.Create_Project_Tasks` builds them (DS 10). Milestone Duration is read as **days** |
| Health | **At Risk** if any milestone is Delayed or an open `Project_Risk` is Critical. Otherwise **On Track** | Your proposed rule. The app has no existing health logic |
| Delivered asset | Delivery or Installation Status name contains "deliver" or "install" (and doesn't start with "not"). "transit" = In Transit | Your rule "Delivered or Installed", matched by Status name |
| Contract value | BOQ total = Σ BOQ quantity × unit rate. Unit rate = approved estimate line price ÷ quantity | Requirement: contract value = BOQ total. It is not the manual Project Value (PO) field |
| Edit permission | App admin, Users.Role = Administrator / Management, or this project's Project Manager | No permission field exists. Change this in `project_details` / `project_update` if needed |
| Technician tag | Users.Role = "Site Supervisor / Installer" (config: `TECHNICIAN_ROLES` in `src/config/zoho.ts`) | Users.Role picklist values |
| Status groups (Home) | "Closed" / "Complete…" = closed; "…Hold…" = on hold; else active. Revenue = Project Value (PO) of closed projects | Status names |
| Currency | Indian digit grouping with the DS currency type AED: `AED 1,25,76,000` | The requirement shows ₹, but every amount field in the DS is AED |

# Not possible with the current DS (no field or form exists — nothing invented)

| Requirement | Missing in the DS | What the widget does |
|---|---|---|
| Stage completion / entry dates, status history | No status-history field or form | Status moves are validated; stage dates show "—". To record history, add a form `Project_Status_History` (Project, From_Status, To_Status, Changed_On, Changed_By, Reason) and an insert in `project_update` |
| Risks tab | `Project_Risk` has no Due Date, Consequence, Response Strategy or Response Action fields | The workbook's "Overdue risks" KPI and "Response strategy" chart are not shown. Add those fields to `Project_Risk` if you need them |
| Asset Tag; per-asset delivered date / ETA | Not on Costing_Lineitem | Serial # is shown. Date / ETA come from the linked BOQ line (ETA, Date delivered) |
| Task time of day, location, attachments, instructions | Not on the Task form | Today's plan uses dates. Work package is shown as the location. The popup states the fields don't exist |
| BOQ revision control after estimate approval | No revision fields. `Widget.sync_boq` already locks BOQ rows that are in procurement | The BOQ is read from the approved estimate lines. Lines with no approved line are flagged |
| Milestone billing % | Billing lives in Payment_Milestone, not on milestone tasks | The Milestones tab shows billing rows separately and checks they total 100% |
| Role-based tab visibility | No per-module permission data | All six tabs show. Editing follows the edit-permission rule above |

## Status records (v0.7)

The widget uses one static order (`Widget.status_order`). For each name below there must be a **Status** record with exactly that `Status_Name` (spaces and emoji included) and the right **Modules**. Otherwise the pipeline button for that stage is disabled and says which record is missing.

- **Project** (Modules = Project), in order: Registered, Kick-Off Done, Planning / Shop Drawings, Procurement in Progress, Partially Delivered, Ready for Installation, Installation in Progress, Configuration & T&C, UAT, Snagging, Handover, Completed, DLP / Service, Closed. Any stage: On Hold, Cancelled.
- **Task** (Modules = Task): Not Started, On Track, Behind, At Risk, Complete, Deprioritized.
- **BOQ** (Modules = BOQ): the 12 Procurement Schedule statuses in `docs/creator/Widget.status_order.dg`.
- **Project Risk** (Modules = Project Risk): any names. A risk is counted Completed when its status contains "Complete" or "Closed".

`Status_History` line format: `dd-MMM-yyyy HH:mm:ss | <Status> | <User> | <Reason>`.
