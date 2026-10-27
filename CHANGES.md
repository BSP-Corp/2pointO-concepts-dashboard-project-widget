# v1.1.0 — Procurement Schedule page, PO creation (Creator → Books), click-to-edit cells, DS 10

- **Procurement Schedule page** (the `Procurement_Schedule` page, opened by "Open Procurement"), built to *Operational System — Intended Design* pages 08–09:
  - Header: PR, client, deal / currency, POs raised, DNs issued, PO value, balance due, BOQ source (approved quote).
  - Tabs: All / To order / In progress / Received.
  - Create purchase order, and Create delivery note (disabled: no Delivery Note form).
  - Group by vendor / model / package, filter by vendor, column-group toggles.
  - Grid bands: Core data · Purchasing · Transit · Receiving · Packages · Payments.
- **Create purchase order drawer**:
  - Tick the lines of one vendor. Model, description, package, required qty and **unit cost** come from the approved Cost Analysis.
  - Partial order qty is allowed.
  - PO date, issued by, terms days, ship-to, delivery required by, entity, vendor contact / email, notes.
  - Subtotal, VAT 5%, total.
- **PO flow**: created in Zoho Creator and checked first; only then sent to Zoho Books with the existing `ZohoBooks.Purchase_Order_Creator_books_Sync`. The Books result is read back and shown, with the reason when it fails. PO#, date and "Ordered" status are written to the lines.
- **PO rate fix**: the project tab's Create PO used the selling price. It now uses the unit cost.
- **Inline editing**: values show as plain text; a click opens the editor; Enter / click away saves to the record, Esc cancels. Applies to the Project Widget lists (milestones, task lists, tasks, procurement, risks, assets) and the Procurement grid.
- **DS 10 alignment**:
  - Activity_Stream `Action_field`; Changed_On is a Date, so time and order come from Added_Time.
  - Project_Risk `Impact1` kept equal to Impact.
  - Purchase_Order `Project_reference` / `Sales_Reference` / `PO_Status`.
  - PO_Line_Items `Estimate_Line_ID`.
  - Status-name matching ignores emoji.
- **Tests**: 52.

# v1.0.0 — Light default, edit permissions, milestone ↔ task list mapping

- **Light theme by default for every user.** The OS dark setting is ignored; Dark only after the user picks it with the switch.
- **Header**: user + theme switch stay pinned at the top right while scrolling, with space reserved in the header so nothing overlaps.
- **Popup and list editing were locked for most users.** Only app admins, Users.Role Administrator / Management and the project's own PM could edit, and the login had to match Users.Email exactly (case-sensitive). Everyone else got disabled popups and read-only lists.
  - Now the project team can edit too (Project Team members and Role "Project Manager"), as the architecture says.
  - The email match ignores case.
  - When a user can only view, a "View only" banner says why.
- **Milestone ↔ task list mapping** follows the Task Administrator template (milestone → its task list):
  - Set from the milestone row (Task list), from each task list's row in Tasks / Milestones, or in the task-list popup.
  - Saved on Milestone.Task_List and logged in the Activity stream.
  - Matching ignores extra spaces ("TL | Project  Planning").
- **Dashboard**:
  - Half pies only for completion (tasks, assets delivered).
  - Milestones by project (bar), employees (pie), issues without repeating delayed milestones.
  - Plus pipe, pies, Gantt, line, area, cost vs quote, pivot.
- **Tests**: 49.

# v0.9.0 — Architect PPT alignment: dashboard charts, list editing, pinned theme switch

- **Theme switch**: pinned to the window's top right next to the user. It never scrolls, and a same-size invisible copy in each header keeps the header buttons clear of it.
- **Home dashboard** (architecture: "Dashboard — completion, procurement, issues, days and cost vs quote"):
  - Removed the KPI summary row, the revenue card and the employees line.
  - Each metric now has its own chart type:
    - **Half-pie gauges**: tasks, milestones, assets delivered, active employees.
    - **Pipe chart**: lifecycle pipeline in the static stage order.
    - **Pies**: health, type.
    - **Gantt**: project days, start → completion with today marker and % done.
    - **Line**: tasks due vs completed per month.
    - **Area**: cumulative planned vs completed.
    - **Bars**: cost vs quote; issues by project.
    - **Pivot table**: rows, columns and value chosen by the user.
  - Balanced palette (blue, pink, purple, orange, yellow, red, teal).
- **Edit in the record list (reference inline editor)**: cells are inputs.
  - Selects, dates and checkboxes save on change; text and numbers save on Enter or when leaving the cell.
  - The change goes to the Creator record with its ID, a "… updated" message (or the error) shows, and a refresh keeps the value.
  - Applies to:
    - **Tasks / milestones**: name, status, priority, dates, duration, %, Starts after, owner, flag.
    - **Procurement**: vendor, status, PO#, mode of transit, start, end, completion.
    - **Risk Register**: description, department, probability, impact, owner, priority, status. Score and severity are recalculated.
    - **Asset Register** (PPT: project team edits execution, Asset & Network fields): delivery / installation status, notes, serial, MACs, warranty dates, network fields.
  - BOQ / procurement data stays read-only in the Asset Register.
- **Deluge**: `project_task_update` (asset fields), `project_dashboard` (stage order, quote, monthly task counts) and `activity_values` (Asset). `ERRORS: 0`.
- **Tests**: 45.

# v0.8.0 — Zoho Projects-style milestones & tasks, activity stream, new Home dashboard

- **Milestones and tasks follow Creator's real structure** (DS 10, `Tasks.Create_Project_Tasks`): Project → Milestone (Milestone form) → task list (root Task named like the milestone's Task List) → tasks → subtasks. The widget no longer looks for Task `Type_field = "Milestone"`, which the DS does not have.
  - **Milestones tab** (Zoho layout): name, %, owner, Starts after, start, duration, end ("x days to go / ago"), tasks closed/total, flag, status. Expand a milestone to see its task lists, tasks and subtasks.
  - **Tasks tab**: grouped by task list ("All open" / "All"), with a work package tag (AV01…), start, due, duration, priority and completion. Data issues are listed below the list.
  - **Inline editing**: click a cell to get a compact field, save on Enter or click away, Esc to cancel. A small "… updated" confirmation shows; the task popup keeps its Save button.
    - Milestones: Starts after (Days / Weeks / Months), start date, duration, end date, owner, flag, status.
    - Tasks: start, due, duration, status, priority, %. Duration counts both days; changing one of start / due / duration adjusts the others.
- **Procurement**: Vendor (Vendors lookup), Status and Completion date are now editable in the list, next to Start / End.
- **Theme switch**: at the top right next to the user, fixed while scrolling (Home: floating; project pages: sticky breadcrumb bar).
- **Activity stream**: new Activity tab (by day, filter by module) and an "Activity stream" section in the task popup. Needs the new `Activity_Stream` form (docs/ACTIVITY_STREAM.md).
- **Risk Register** and **Risk Dashboard** are separate tabs.
- **Home dashboard**:
  - Teal / violet / amber / green palette (no blue or red).
  - 6 KPIs: active projects, portfolio value, margin, task completion (overdue), milestones (delayed), open / critical risks.
  - Pies: health, lifecycle, type, task status.
  - Bars: stage, task workload, value vs budget.
  - Pivot tables by project manager and type.
  - Project performance table.
- **Deluge**:
  - Creator also drops brackets inside `if(...)`; all mixed `&&` / `||` conditions are rewritten and the checker rejects them.
  - `project_dashboard` counts milestones from the Milestone form.
  - New `activity_values` / `activity_add`.
- **Tests**: 42.

# v0.7.0 — Status lifecycle, Procurement list, Risk Register

- **Home:**
  - **Search by reference:** type e.g. `PR-26` (case, `-`, `_` and spaces ignored). A dropdown shows matching estimates with customer, owner, deal stage, country, date and total. Picking one opens its Cost Analysis, approved or not.
  - **Go To** lists approved projects only. Both boxes are the same height, compact and centred.
  - Status groups follow the lifecycle: Active, Closed (Completed / DLP / Closed), On Hold, Cancelled. Health also counts open Critical risks.
- **Status lifecycle:** one static order (`Widget.status_order`) for Projects, Tasks and BOQ — 14 project stages, plus On Hold / Cancelled at any stage. Every change is appended to `Status_History`; the pipeline shows the numbered history with dates, user and reason.
- **Procurement (BOQ):** clean list without Unit / Total price. Columns: Vendor details, Status, Start (PO Date), End (ETA), Completion (delivered to customer), Assigned person. Inline Start / End dates and an Edit popup.
- **Popups:** the background is locked (no scroll, no clicks) and blurred; focus stays in the popup. Fixed: typing in a popup field lost focus after the first character.
- **Tasks:** edit name, description, milestone, work hours and owners (project team members).
- **Risk Register (`Project_Risk`):**
  - Add / Edit form with every field of the Creator form: Project Name, Risk ID, Risk Description, Cause, Probability*, Impact*, Risk Score, Risk Severity, Risk Status, Risk Owner, Priority, Department. Submit / Update / Cancel.
  - Risk Score and Risk Severity are calculated (as in the workbook) and saved.
  - Risk Dashboard as in the workbook: Total, Active, Completed and Average risk score of open risks (/ 25). Charts by status, priority, severity, impact, department and owner, plus a probability × impact count grid. No Escalation Matrix.
- **Deluge:** 1 new helper (`status_order`), 1 new function (`project_risk_save`), 7 updated. `ERRORS: 0` against DS 9.
- **Tests:** 38.

# v0.6.0 — Fixes and updates

- **"Unknown action: tasks":** the `Widget.project_console` running in Creator is older than the widget (DS 8 still has the old code). Paste `docs/creator/Widget.project_console.dg` and re-save the Custom API. The widget now names the exact function to update instead of a bare error. The Asset Register still shows assets when tasks fail.
- **Layout:** theme switch moved to a bottom-left dock; the logged-in user's name shows top-right (from `project_dashboard` / `project_details`).
- **Home:**
  - Search tooltip "Search by project reference" (the search now filters by reference).
  - "Go To" lists estimates (latest versions). With an approved project it opens the Project Widget; otherwise it opens the Cost Analysis widget only.
- **Asset Register:** Zoho Projects-style inline Start / End dates — click, pick, saved with an instant screen update and rollback on error; the due date can't be set before the start.
- **Procurement tab:** the BOQ tab is renamed **Procurement**. "Open Procurement" opens the new `Procurement_Schedule` page (step 1: opening only).
- **Responsive:** no fixed page width; fluid charts; tables scroll inside their own frame.
- **Metrics:**
  - Home and the Project Widget now use one delayed-milestone rule (the Deluge function counts the same way).
  - "Done today" excludes milestones.
  - A BOQ line with no product no longer counts every PO line as procured.
  - Contract value shows "—" when no rate is known.
  - Labels say which value is shown (Project Value (PO)).
- **Deluge:** `project_dashboard` and `project_details` updated (`ERRORS: 0` against DS 8).
- **Tests:** 38.

# v0.5.0 — Home (Project Search Dashboard) + Project Widget (DS 8)

- **One widget, two pages:** Home → Project Search Dashboard; `Project_Widget?project_id=` → Project Widget. The URL keeps the page, so a refresh keeps the project. Breadcrumb and Home button go back to Project Search. An invalid or deleted ID shows "Project not found".
- **Project Widget:**
  - Header from the live sources: owner, customer, contact, contract value = BOQ total.
  - Status pipeline from Status records, with next / back-with-reason / admin moves.
  - Tabs: Overview, BOQ (with procurement and Create PO), Asset Register (work packages, tasks and subtasks, inline edits, task popup), Milestones, Tasks, Risks — with counts, loading, empty and error states.
- **Calculations:** `src/features/project/model.ts` is the single source for every figure.
- **Deluge:**
  - 4 new functions: `project_details`, `project_dashboard`, `project_task_update`, `project_create_po`.
  - 3 updated: `project_console` (tasks, BOQ links), `project_options` (DS 8 template form, task / installation statuses, vendors, taxes), `project_update` (status and date rules).
  - All checked against DS 8 with `scripts/check-deluge.py`.
- **Cost Analysis widget:** Back returns to `Project_Widget?project_id=`.
- **Removed:** the old portfolio, Cost tab and console views; the Cost Analysis / budget-review readers.
- **Tests:** 34.

# v0.4.0 — All data through custom functions

- **New Deluge function** `Widget.project_console(string quo_data)` (`docs/creator/Widget.project_console.dg`) behind the **new Custom API** `Widget_Project_Console` (POST). Setup: `docs/CUSTOM_FUNCTIONS.md`.
- `src/lib/data/zohoSource.ts`: no more direct `getRecords` / `getRecordById` / `updateRecords`. Every read and the project update is `invokeCustomApi` → `Widget_Project_Console` with an `action`. Cost figures still use the existing `Widget_Get_Cost_analysis`.
- `src/config/zoho.ts`: `CUSTOM_APIS.projectConsole`.
- Edit form Address: only Address Line 1 and 2, as on the Project form (the .ds hides City, State, Postal Code, Country).
- Edit form: Steps layout only (Sample 5).

# v0.3.1 — Creator read fix + Cost Analysis-style packaging

## Build
- `npm run build` now runs typecheck → Vite build into `app/` (`widget.html`, `js/widget.js` classic script, `css/widget.css`) → `zet pack` → `dist/2point0-pm.zip`, the same structure as the Cost Analysis widget (`vite.config.ts`, `scripts/package-widget.mjs`, root `plugin-manifest.json`)
- Widget SDK loaded from `static.zohocdn.com` (same as the Cost Analysis widget); `npm run preview` serves the built widget

## Fixed
- `src/lib/data/zohoSource.ts`: getRecords answers are classified by Creator's own status code (read from a resolved body, a rejected body or responseText JSON).
  - Only 3100 / 9220 / 9280 mean "no records".
  - Every other answer, including a reply with no `data` array, now raises an error carrying Creator's code and message.
  - Before, any error text containing 3100, 9280 or "no data" became an empty list, so the widget showed AED 0 instead of the reason.
- `src/features/console/PortfolioDashboard.tsx`: when All_Projects returns no records, the widget says so, naming the app and environment it read, instead of showing zero totals.

## Added
- `DataSource.getContext()`: the scope, app and environment from `ZOHO.CREATOR.UTIL.getInitParams()`.
- `src/lib/data/zohoSource.test.ts` (Creator answer shapes); 32 tests in total.

# v0.3.0 — DS-aligned Project Console

## Why
`src/config/zoho.ts` had been inferred from the blueprint, so names such as `All_Cost_Lines`, `Cost_Line`, `Budget_Equipment` and `Signed_Off_Rooms` did not exist in `2Point0concepts.ds`. Every Creator read and write now uses the real form, report and field names from the .ds.

## Added
- Tabs: **Risks** (new Risk_Register form), **Deployment** (work-package status), plus Overview, Cost, BOQ, Procurement and Assets rebuilt on DS fields
- `features/console/EditProjectForm.tsx`: full-screen, pre-populated Project edit form (saves changed fields only)
- `features/console/charts.tsx`: donut, bar and stacked-bar charts (no chart library)
- Light/dark theme switch (`lib/theme.ts`); blue/white theme (`console.css`)
- **Go to Cost Analysis**: opens `Cost_Analysis_Page` with the Accepted Estimate; the selected project and tab are restored on return
- Cost figures come from the existing Custom API `Widget_Get_Cost_analysis` (`Widget.get_cost_analysis`)
- `config/projectForm.ts`, `features/risk/{api,calc,calc.test}.ts`, `docs/RISK_REGISTER_FORM.md`

## Changed
- `config/zoho.ts`, `types/domain.ts`, `lib/data/*`: DS names; child reads scoped per project (Project lookup OR Accepted_Estimate)
- Portfolio view reads `All_Projects` only (previously loaded every cost line and BOQ line of every project)
- Project view: only the open tab is mounted, so data loads per tab; queries are shared, never duplicated
- Seed data rebuilt from PR_26040 in *4b. Project Management Dashboard.xlsx*; mock storage key `…mockdb:v3`
- Tests rewritten (27)

## Removed
- `features/projects/rooms.ts`, `features/cost/csv.ts` (built on fields that do not exist in the .ds)
