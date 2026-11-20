# v1.17.0 — Activity log per project, checklist template, signatures, calendar (18 Nov 2026)

- **Activity Stream**: one record per project (Record_ID "LOG"); every change is a row of its Activity data subform (Module, Record ID / Name, Action, Field, Old / New Value, Changed By, Changed On). `Widget.activity_add` validates the project and module, trims text to the field limits (255 single line, 2000 multi line). `Widget.project_console` (activity) reads the subform rows plus older one-change records. The Activity tab has search, person and date filters.
- **Project Registration Task List** is a template: add, rename, switch items off from the form (Edit checklist items). Inactive items are not shown or required. `Widget.project_options` returns every item with `active`; `Widget.project_update` action `task_list_item` saves one.
- **Linked records (managed in Creator)** section removed; Project Team (at least one) is listed under 2point0 Key Personnel (edit it on the Overview tab).
- **Signatures** show as images: `Widget.project_console` (file) now serves the signature fields and Warranty_Document of All_Projects.
- **Calendar**: month and year are picked inside the calendar (click the title), not in native lists that opened behind it.

# v1.16.2 — Registration fields live, budget by category, Asset / Task (18 Nov 2026)

- **Registration fields** (now on the Project form, DS "2Point0concepts (1)"): `Widget.project_console` reads Registration_Notes, Warranty_Document, Shop_Drawings_Status, Solution_Architect_Signature; `Widget.project_update` saves Registration Notes / Shop Drawings Status and requires Shop Drawings Status for Kick-Off Done. The checklist check compares IDs as text.
- **Date fields**: every form date field (Registration form, Key Milestones, task popup, add task, procurement panels) shows the date as text ("02 May 2026") with the calendar, like the milestone cells.
- **Signatures**: the signature shows on the form right after it is saved.
- **Project Budget Review** = the By category table (Budget Cost typed in it); the old Category / Budget Cost / Notes table and the Totals are removed. **Payment Summary** = Payment Terms Agreed only.
- **2point0 Outsourced Services** section removed (and its Kick-Off Done requirement, widget and `Widget.project_update`).
- **Execution**: Asset (lines) / Task (work package tasks), first in the bar, then All packages and Jump to package.
- **Tabs** always open on the first tab (Overview; Purchase orders in Procurement; Asset in Execution) — the last tab is no longer remembered.

# v1.16.1 — Duplicates, calendar, quieter form (17 Nov 2026)

- **Duplicate tasks**: caused by `Estimate.Create_Project_Tasks` creating every template task once per work package. Patch + one-time clean-up in `docs/creator/patches` (v1.16.1). Execution → Asset now shows one block per work package (AV01, AV02…) with its groups; in Milestones a work package group shows its tag ("AV01 · First Fix").
- **Milestones**: "Task data issues" section removed.
- **Execution**: Line / Asset sits next to "Jump to package".
- **Registration form**: wider (up to 1560 px); the missing-fields list is hidden until shown; red outlines, "Required" and "N missing" appear only after "Save & move to Kick-Off Done" is tried with fields empty; the * shows all the time (Edit too).
- **Dates**: the widget's own calendar (month / year lists, Today, Clear, min / max) opens on a click anywhere in any date field, inline cells included — the browser picker was blocked inside Creator's frame.
- **New Project fields** wired: Registration Notes, BOQ & Warranty upload (`Warranty_Document`), Shop Drawings Status (required for Kick-Off Done), Solution Architect signature — paste the IDE blocks in `docs/creator/KICKOFF_FORM_FIELDS.md` into `form Project` first.

# v1.16.0 — Milestone → Tasks, collapsible Registration Form, signatures, checklist (17 Nov 2026)

- **Milestone & Task redesign** (Bala's PDF, DS 18): tasks group by `Task.Milestone`; no "TL | …" task list rows. Under a milestone: its work packages (AV01 … roots, Type Work Package) with their tasks, then the tasks straight under the milestone, sub-tasks by Parent_Task. Tasks without a milestone (older projects) show in a **No milestone** panel. The task popup has a **Milestone** dropdown (saves `Milestone`). + Add task sends the milestone only, or a work package as parent (the server copies its milestone).
- **Milestones tab**: the standalone "Work Package Task" (task list) section and the **Show closed tasks** checkbox are removed — every task shows.
- **Execution tab**: **Line / Asset** selector. Line = the work-package line grid as before; Asset = **Work Package Task** (each work package with its tasks and sub-tasks).
- **Registration Form**: numbered sections that open / close from their header (Expand all / Collapse all; Warranty, Shop Drawings and Linked records start closed); "More details" and the budget **Totals** (Total Budget Cost, Estimated Margin) are hidden until "Show …"; a readiness bar for Kick-Off Done; "Complete" / "N missing" per section.
- **Project Registration Task List** works: it is the existing multi-select `Project_Registration_Task_List` (form Project_Registration_Task_List, Active items) shown as clickable check cards with Tick all; every item must be ticked before Kick-Off Done.
- **Signatures**: Sign here pad (mouse / finger / pen) → uploaded as a PNG into the Signature field (`Sales_Signature`, `Project_manager_Signature`, `Health_Safety_Manager_Signature`); the saved signature is shown.
- **Date fields**: a click anywhere in the field opens the calendar; calendar icon in the form's colours.
- Creator: docs/CUSTOM_FUNCTIONS.md v1.16 and docs/creator/KICKOFF_FORM_FIELDS.md. Tests: 104.

# v1.15.0 — Kick-Off Done form as the Project Registration Form (16 Nov 2026)

- **One page, as "Project Registration Form_V1"**: banner, title, every section in the PDF's order and words (Project Information · Project Scope Review · Purchase Order Review · 2point0 Key Personnel · 2point0 Outsourced Services · Contact Person · Key Milestones & Dates · Payment Summary · Project Budget Review · Warranty & Extended Warranty Review · Shop Drawings · Project Registration Task List · Signatures · Linked records). No step tabs; a slim side list jumps to a section. Colours sampled from the PDF (navy #002f73, inputs #f5f5f5 / #3a5b8e, teal #33c2af, star #f53582); dark mode kept.
- **Required fields**: a short "N required fields missing" line with chips that jump to the field (Hide / Show); missing fields outlined, marked "Required".
- **Type of Project** as radio cards; **PO / LOI file** in a dashed upload box; **signatures** as signature boxes; **Project Budget** as Category | Budget Cost | currency.
- **2point0 Meeting Attendees**: Role | Employee Name | Present Yes / No — attendance saves to `Meeting_Attendee` (`save_attendance`), which also fills the Kick-Off Done "at least one attendee" check.
- **2point0 Outsourced Services & Software Contact List** (`Project_Contact`) shown as on the PDF (rows added in Creator).
- **Checklist (20 items + Other), BOQ & Warranty upload, Shop Drawings Status, Solution Architect Signature** are on the form, marked "Not set up in Creator yet" until the fields in `docs/creator/KICKOFF_FORM_FIELDS.md` exist.
- **Statuses**: `Widget.status_order` checks each record's Modules for an exact "Project" (a criteria `contains("Project")` also matched "Project Risk" — why "Not Started" showed in the pipeline).

# v1.14.1 — Pipeline, milestone dates, upload fields (16 Nov 2026)

- **Statuses fully dynamic** (`Widget.status_order`): no status names or fallback lists in code. Pipeline stages = Status records with Modules = Project and an Order, sorted by Order; any-time statuses (More menu, dashboard after the stages) = Project statuses with no Order. Task and BOQ orders = their Status records by Order, then the rest by Index. `Widget.project_dashboard` also returns `anytime_order`. To hide "Not Started" from the pipeline, untick Project in its Modules.
- **Build**: `node_modules` moved to `node_modules.nosync` (with a `node_modules` link) so iCloud cannot offload package files — offloaded files broke `npm run build` (`t.lit is not a function`) and the tests. Vitest runs only `src` tests.
- **Kick-Off Done → Key Milestones & Dates**: Start Date and End Date are date pickers (add and edit); Duration is worked out from them. Saved as the Milestone's Starts after (from the project Start Date, keeping Weeks / Months when the date fits) and Duration — no new fields.
- **Milestones tab**: columns now Start date → End date → Duration.
- **File uploads**: the Project form's only upload field is `PO_Document` (works from the form). `docs/creator/KICKOFF_FORM_FIELDS.md` gives step-by-step Creator instructions for the PDF parts DS 23 has no field for (checklist, BOQ & Warranty upload, Shop Drawings, notes) and for any File Upload field.

# v1.14.0 — Edit Project as the Project Registration Form (12 Nov 2026)

- **Sections** (PDF order): 1 Project Information · 2 Purchase Order Review · 3 2point0 Key Personnel · 4 Contact Person · 5 Key Milestones & Dates · 6 Payment Summary · 7 Project Budget Review · 8 Project Registration Task List · 9 Signatures · 10 Linked records. Sections 2 and 3 swapped; labels and help text as on the PDF (e.g. Project Scope Review, Project Value, Date Purchase Order was Received, Sales Person Full Name).
- **Accepted Estimate** removed from the form (and from the Kick-Off Done checklist; `Widget.project_update`).
- **PO / email confirmation / letter of intent file** (`PO_Document`): Upload / Replace and open from the form (10 MB). Signatures stay Creator-only (the API cannot write a signature).
- **Contact Person** (Client Side Contact List, `Contact_Persons`): list, + Add contact, Edit.
- **Key Milestones & Dates** (`Key_Milestones_Dates`, the project's Milestone records): list with start → due dates, + Add milestone, Edit (name, starts after, duration, owner, status, flag).
- **Payment Summary**: Payment Terms Agreed (milestone, terms, %, amount) and per category (Hardware, Software, Outsourced Services, 2point0 Services, Logistics): budget cost, % cost, total cost, total price, profit, margin.
- **Work Package Task** (was "Other task lists"): each task list is titled "work package · task list" and sorted by work package, so every work package's copy shows and copies are told apart.
- Creator steps: docs/CUSTOM_FUNCTIONS.md, v1.14. Tests: 102.

# v1.13.1 — Home search fields; deal search finds deals that already have a cost analysis (11 Nov 2026)

- **Home fields**: no longer cut off under the pinned header (the header sits flush at the top on every page); the second field has no "Project" label, a proper chevron and the placeholder "Find the project and cost analysis…". The first field is unchanged.
- **Project & Procurement header**: now in the Cost Analysis header's style — Home and Back pills, the page title with its PR #, Entity, Currency (USD rate below), Refresh, the page's buttons, user and theme; still pinned at the top. Procurement's "← Back to project" button is now the header's Back.
- **Risk ID**: no longer typed — a new risk shows "Auto-generated" and gets its number from `Creator.AutoGenerateNo("Risk")` when saved (add the Autogenerate record Form = Risk). Re-save `Widget_Project_Risk_Save`.
- **New cost analysis search**: a deal that already has a cost analysis was hidden (list = `Quote_ID` empty), so its PR # said "No opportunity matches". Now matching deals with a cost analysis show under "Already has a cost analysis" with a "Cost analysis exists" tag — click opens it. Lower-case PR # (`pr_26289`) matches too. Re-save `Widget_Deal_Estimate`.

# v1.13.0 — Kick-Off Done checks, status pop-ups, milestones & tasks, deal list, image preview (10 Nov 2026)

- **Deal list (Home → New cost analysis)**: search finds every value the list shows — deal name, PR #, account, stage, and the amount (e.g. `AED 1,20,000`); the picked opportunity shows in the box; a new search keeps the list on screen until results arrive; an empty CRM answer no longer breaks loading (`Widget.deal_estimate`).
- **Project status**: every change opens a pop-up (reason; required to move back). Kick-Off Done opens the Project Registration form with every required field marked and the missing ones listed; it moves only when all are filled — `Widget.project_update` refuses it too. A click on a stage's dot moves there (next stage, or back; admins any stage).
- **Milestones & tasks**: Project Execution shows its work packages as its task lists, with their tasks under them; other milestones show their tasks directly (no task list). + Add milestone (with its own task list) and + Add task per milestone (Project Execution: per work package). Patch for `Estimate.Create_Project_Tasks`: common task lists once, only Project Execution per work package.
- **Files**: images open in the widget's viewer (Print, Open in new tab); Creator files get their real type, so images and PDFs show instead of downloading. Files are read with `readFile` (API file path), else through `Widget.project_console` (action `file`) — no plain links, which do not reach development records.
- **Header**: the page header stays at the top while scrolling (Home, Project, Procurement); side panels open below it.
- **Procurement sections**: all five checkboxes are ticked on first load (every section shows); untick to hide.
- Creator steps: docs/CUSTOM_FUNCTIONS.md, v1.13. Tests: 97.

# v1.12.0 — reporting tag, in-transit on PO, delivery note files, files required (6 Nov 2026)

- **Info icon**: a line with missing values (vendor, unit cost, ETA, transit mode) shows an ⓘ beside its model; hover lists what is missing.
- **Receive**: at least one supplier document is required before the receipt is saved.
- **Delivery note files**: Create delivery note takes files (any format, up to 10, 10 MB each; at least one required) into `Delivery_Note.Attachments`; the Delivery Notes sheet lists them — open in a new tab or Print.
- **PO in transit**: Create purchase order asks for Mode of transit (Road / Air / Sea) and ETA; both are saved on the ordered BOQ lines.
- **Reporting tag (Division)**: on Create purchase order the vendor's tag is the default; or pick one for the order and Apply to all lines, or set it per line — required on every line. Delivery notes start from each PO line's tag (customers have none), with the same Apply to all / per line. Saved in the new field `PO_Line_Items.Division` and sent to Zoho Books per line (patches).
- Creator steps: docs/CUSTOM_FUNCTIONS.md, v1.12. Tests: 93.

# v1.11.1 — original project header and procurement card back; task file upload (6 Nov 2026)

- **Project header**: back to the original breadcrumb bar (Project Search / reference, Home, Refresh, the page's buttons, user, light / dark) on the Project and Procurement pages, not the dashboard; it now also shows Entity, Currency and the USD rate. Not pinned to the top.
- **Procurement**: the original project card is back — reference, name · customer · quote · currency, PM, Client PO, Value, status, health, and To order, On order, Fully received, PO value committed, Procurement %, DNs issued, BOQ source. Needs info stays removed.
- **Task files**: uploads go into `Task_File.File_field` (the field's link name in DS 21; its label is File) — they went to `File` and Creator refused them. `Widget.task_collab` in docs/creator reads `File_field`, as already pasted in Creator. A file Creator refuses no longer leaves an empty file row on the task. Checker against DS 21: ERRORS: 0.

# v1.11.0 — Procurement clean-up, sheet grids, payments, project header, task comments, new cost analysis from a deal (5 Nov 2026)

- **Procurement**: no Columns button, no section bookmarks, no All / To order / In progress / Received tabs, no Needs info (summary, button, panel, Info column). Section checkboxes as in the Project widget: tick one or more to show only those sections, none ticked shows all (remembered).
- **Summary**: small plain stats — purchase orders, to order, on order, received, purchase receives, delivery notes, procured %, PO value.
- **Records as sheets**: Purchase Orders, Purchase Receives, Delivery Notes and In Warehouse are one boxed grid each (thin grey borders), one row per item with Item · Description · Quantity · Amount columns; no stacked sections per document.
- **Supplier documents**: a small colourless + Add above the file list; any format (PDF, images, Word, Excel, CSV…), up to 10 files of 10 MB each, listed with their type and removable. All files go into `Purchase_Receive.Attachments` with Multiple files on (one upload per file, as Zoho's API) — no new form, no joining into one PDF (pdf-lib removed). In Purchase Receives every file opens in a new tab, and Print opens it ready to print.
- **Payments** tab (as the 2point0 Ops Payments view): All / Unpaid / Partial / Overdue, one row per PO (total, terms, due date, paid, balance, status), a vendor's payment ledger with + Add payment and delete — saved in Creator (`Payment_Made`) through `Widget.po_payment_save`, not Zoho Books.
- **Project header**: one header on the Project and Procurement pages that stays at the top (panels open below it): Home, project link, entity, currency, project value and its USD value (Cost Analysis rates), Refresh, user, light / dark.
- **Lighter text**: no heavy bold anywhere — weights 600–800 are now 500.
- **Currency and %**: amounts show the project's currency (AED / SAR…), the schedule's PO value too; Completion shows % (also 0%) and the task-list header says Completion (%).
- **Execution**: the Delivery status column is removed from Project execution.
- **Tasks**: assign right in the list (Owner → checklist of the app's users → Save); any Users record can be an owner. 💬 on a task opens, under the row, its files (several, any format) and a comment thread with direct replies and files per comment — no popup (`Widget.task_collab`, forms `Task_Note`, `Task_File`).
- **Home**: New cost analysis lists the CRM opportunities without a cost analysis (`Quote_ID` empty), 100 at a time with the next 100 on scroll, searchable; choosing one asks "Cost analysis for this deal does not exist. Do you want to create one?" — Yes creates it (`Widget.deal_estimate`, as `Estimate.Create_Quotation`), stores its ID on the deal and opens it. "Approved project" is now **Project** (draft and approved projects).
- **DS 20**: the rack form is `Warehouse_Racks` again — functions updated.
- **Tests**: 90.

# v1.10.0 — Audit fixes C01–C21, rack sheet colours, serial locations, supplier DN file, direct-to-site delivery note (4 Nov 2026)

- **Racks (DS 18)**: functions use `Rack_Code` / `Rack_Aisle` (C01). Each Bay record is one pallet position: labels and stored locations read `R1-A-L2-Right · P03` (C02).
- **Rack picker**: pallets are picked on the rack's bands — one colour per bay + level, as in the warehouse rack sheet, with Right / Left pallets showing free space; blocked, full or no-capacity pallets can't be picked (C03, C04).
- **Colours everywhere**: Rack, Bay, Level, Side and Pallet chips in the sheet's colours, in the Receive panel, receipts, stock, In Warehouse and delivery notes.
- **Serials**: Rack, Pallet (with its bay · level · side) and Position are picked on each serial row; row 1's location applies to the units not given their own, and units sharing a location become one Storage row (C08). The line-level location block and + Add location are gone. Receipts list each pallet with the serials stored on it; Earlier receipts show every line (C09).
- **Receive panel layout**: wider panel; Rack, Pallet (bay · level · side) and Position are separate columns on each serial row; any pallet with free space can be picked (row 1 no longer needs room for every unit).
- **Supplier documents**: several images and PDFs can be added, listed with type and size, and removed one by one; on save they are joined into one PDF (pdf-lib) because Purchase_Receive.Attachments holds one file. A single file is uploaded unchanged.
- **Delivery note panel**: each stock location of a line is one tidy row — warehouse, Rack · Bay · Level · Side · Pallet chips on one line, and the quantity in stock with its PR number; chips inside item cells no longer stack or fade.
- **Vendors**: every vendor is listed, not only the first 200 — `Widget.project_options` reads the Vendors form in pages of 200; the widget sorts them by name.
- **Tests**: 88.
- **Supplier delivery note**: photo / scan uploaded to `Purchase_Receive.Attachments` and linked in the receipt list (C06). The number stays in Notes (C07: Delivery_Note lookup instead of new fields).
- **Direct to site**: needs who received it at site; the receipt also creates a delivered delivery note (Books stock in and out again) and links it in `Purchase_Receive.Delivery_Note`. Delivery notes made from stock link themselves to their receipts.
- **Status**: a line shows Partially Received / Received / Partially Delivered / Delivered from its quantities, not a warehouse name; Creator sets the warehouse BOQ status only once fully received.
- **Delivery note price**: the accepted cost line's Unit_Price, as Creator (C13).
- **Retry Books sync** on purchase orders and receipts not in Zoho Books (C14). Once a receipt is saved, later problems are warnings, never a second receipt; a double submit within a minute is refused (C15, C16). Storage `Bay_Select` / `Level_Select` / `Side_Select` filled (C17). Warranty end = start + months − 1 day, as the form.
- **Procurement page**: Purchase Orders · Purchase Receives · Delivery Notes · In Warehouse as tabs (no accordion).
- **Home**: opens on the approved projects; Search lists only references not yet converted into a project and opens its list on click; the right field is "Go to Project".
- **Alerts**: 4 s (errors 6 s), short title + one detail line, close button and a timer bar.
- **Creator script patches** in `docs/creator/patches/` (C10 Recalc_Parent_Delivered, C11 BOQ Update On Success, C12 cf_reference, C13 Create_Delivery_Challan guard, decision 7 sync_boq quantity).
- **Demo data and docs** on the DS 18 pallet model (C21). 

# v1.9.2 — Customer notes on the delivery note PDF (2 Nov 2026)

- **Download** (delivery note): a boxed **Customer notes** section (Delivery_Note.Customer_Notes) under the note's details, above the items; "-" when there are none. Widget only — no Creator change.

# v1.9.1 — Delivery note PDF: letterhead and customer (2 Nov 2026)

- **Download** (delivery note): company logo at the top with the organization's name, address, phone, email, website and TRN (read from Zoho Books for the note's country when the PDF is made); a **Customer** block (name, attention, billing address, TRN, phone, email) and a **Deliver to** block (shipping address, else billing, and the project).
- **Logo**: the 2Point0concepts logo (`src/assets/company-logo.png`) at the top left; replace that file and rebuild to change it.
- `Widget.purchase_delivery`: new `print` action (no change to create / status).
- **Tests**: 81.

# v1.9.0 — Racks, split put-away, direct to site, line status rules, Needs info, stock views, DN status (2 Nov 2026)

- **Create PO "unexpected response"**: the vendor Books check added in Creator had moved the save into the error branch — a valid PO was never saved. Fixed; a vendor that cannot be set up in Books now gives a clear message.
- **Racks**: the rack list no longer drops racks with an empty Warehouse / Active, re-reads racks and bays each time Receive goods opens, and says what to set up when a warehouse has none.
- **Put-away**: **+ Add location** splits a line over several bays (quantities must add up); each serial / MAC is linked to its bay. **Direct to site**: no put-away, no stock, the units count as delivered.
- **BOQ status**: a warehouse receipt sets 2.0 Dubai / Riyadh Warehouse; delivered / partly delivered from delivery notes and direct-to-site receipts. **ETA** = the PO delivery date.
- **Line status rules**: Warehouse / On Site statuses only through goods receipt; vendor and unit cost before moving past Not Started; ETA and mode for In Transit / In Customs. **Bulk status** for picked or shown lines.
- **Needs info**: button, per-line chip and link in Create purchase order — vendor, unit cost, ETA, mode in one list.
- **Header**: PM, client PO, value, status, health; tiles for needs info, to order, on order, fully received, PO value committed, procurement %. **Package** filter.
- **Lists**: Purchase orders with lines (ordered / received, Books), Goods receipts with items, serials, put-away and supplier DN, **In warehouse** (item, qty, warehouse, location, serials, GRN, received, days in store); **Stock** per BOQ line.
- **Delivery note**: Reference filled with the project reference; status dropdown in the Status form's order, changeable also after Delivered / Cancelled.
- **Numbers**: Purchase Receive and Estimate show the Zoho Books number when filled.
- **Tests**: 80.

# v1.8.0 — Faster saves, vendor UAE / SAR, DN storage + download, column eye icons, CRM deal, top alerts (30 Oct 2026)

- **Stage moves / saves**: the new value shows at once (rolled back if Creator refuses); after a confirmed save only what changed is read again (no whole-list reloads). Activity log written with a direct insert (was a REST round trip on every save).
- **Alerts**: success / error messages at the top centre, small card with a slide-in, gone after 2.5 s (errors 3 s).
- **Vendor**: lines without a vendor use the product's Vendor UAE / Vendor SAR for the line's country; existing vendors unchanged.
- **Create delivery note**: every received item shows where it is stored (warehouse · rack · bay · position), the qty still there and its Purchase Receive.
- **Delivery notes**: list and detail show the Purchase Receive and storage (warehouse · rack · bay) the goods come from; **Download** saves the note as a PDF.
- **Eye icons**: Procurement (Pick, Vendor, Category, Type, Brand, Model, SKU, Item Description) and Execution (Vendor, Brand, Model, SKU, Item Description) — show / hide, remembered in the browser.
- **View Deal in CRM** button on the project page (new tab).
- **PO number**: Books PO number (Purchase_Order_Books_No) when filled, else PO_No.
- **Purchase Receive**: storage / serial / warranty no longer saved through a second REST PATCH (cause of "not saved: Error Occurred").
- **Tests**: 73.

# v1.7.0 — Faster stage moves; edit the project team (29 Oct 2026)

- **Status update speed**: "Move to …" no longer waits for every tab of the project to be read again. The new stage shows as soon as Creator saves; only the header / pipeline / activity are re-read, in the background.
- **Project team**: Overview → Assigned team → **Edit team** (or **+ Add member** when empty). One compact row per member: Team member, Project role, ×. **+ Add member**, then **Save team** saves the whole team at once (Project Team grid). A member can't be listed twice; every row needs a member.
- **Tests**: 69.

# v1.6.5 — "FORBIDDEN" on stage move fixed (29 Oct 2026)

- **Move to …** (and any save) failed with `Widget.project_update (projectUpdate): FORBIDDEN` when Creator still had the older `Widget.can_edit`. The edit check is now removed from `Widget.project_update`, `Widget.project_task_update` and `Widget.project_risk_save` themselves, so saves never depend on `can_edit` again. Stage rules (no skipping, reason to move back, admins may skip) are unchanged.

# v1.6.4 — Editing open to everyone again; page scrolling fixed (29 Oct 2026)

- **Scrolling**: with the mouse over a table or list (Milestones, tasks, Procurement…), up / down scrolling was held by that box and the page did not move. Boxes now keep only sideways scrolling; up / down passes on to the page (at once when the box does not scroll that way, or when it reaches its end).

- The Project Manager–only edit restriction (v1.4) is removed: everyone who can open the widget page edits, as before. `Widget.can_edit` now always answers can_edit = true (it still reports app admins, used for the admin "set stage" option); the widget no longer shows "View only".

# v1.6.2 — One dropdown style everywhere (29 Oct 2026)

- Every dropdown in the widget (inline cells such as Vendor, panels, dialogs, filters, the project header) now opens the **same list as the project search**: rounded panel, highlighted row, ✓ on the current value, long names wrap, and a **search box** when the list has more than 8 options (e.g. the vendor list). Keyboard: ↑ ↓, Enter, Esc; the list stays inside the screen (opens upward near the bottom).
- The browser's own list is no longer used. Choosing a value works exactly as before (same save, same validation).
- **Tests**: 68.

# v1.6.1 — Text visibility, wrapping and overflow across the widget (29 Oct 2026)

- **Lists being edited** (Vendor and every other dropdown cell): the editor is a bordered box that shows the selected name wrapping inside the cell, with the real list invisible on top — the name never disappears, is never covered by the next column, and is exactly as wide as the value it replaces. Saving is unchanged (Creator first, then the screen).
- **Scrollbars** take their own space in every scrolling box (they no longer float over and hide the last row).
- **Procurement grid**: frozen columns have minimum widths that fit typical names by whole words (Vendor 112, Model 124, SKU 104, Pick 44 px…); field boxes fill their column.
- **Tables**: a column never shrinks below its longest word (IP addresses, serials, codes stay whole); dates editors fit their cell; Milestone Flag column widened; "Starts after" number and unit stack; task-dialog Parent field full width; new-risk lists show their whole value.
- **Trend charts**: the first and last month labels stay inside the chart.
- Checked page by page at 1440 and 1024 px (view and edit of every editable cell, all panels and dialogs): no clipped, cut-off, overlapping or mid-word-broken text left.

# v1.6.0 — Feedback round: Home finders, PO by vendor, warranty, wrapping, refresh, notifications (29 Oct 2026)

- **Timelines** open on the **Day** view.
- **Home**: Search and **Go To** are centred and look the same — Go To is now a searchable field with the same dropdown list (type a reference, name or client); the view tabs sit centred below.
- **Execution** tab: the "Open Procurement" button is removed (it stays on the Procurement tab).
- **Create purchase order**: pick the **vendor first**; only that vendor's lines are listed (none before a vendor is chosen). Ticked rows from the schedule pre-select their vendor. VAT column widened.
- **Receive goods**: the paste box and the serial rows are one list (edit either; clearing the box clears the rows). Per unit **vendor warranty (months), warranty start, warranty end** (= start + months), defaults from the product warranty and the receipt date, **Apply to all**. Needs 3 new GRN Serial fields (docs/CUSTOM_FUNCTIONS.md v1.6).
- **Long values**: dropdowns being edited open over the cell at the width of their longest option (e.g. vendor names in the Procurement grid); text being edited wraps in a box that grows with it; read-only values already wrap.
- **Procurement page**: **↻ Refresh** reloads POs, receipts, delivery notes, schedule and the lists (bay free space, vendors).
- **Notifications**, the same everywhere: one success message only after Creator confirmed the save (incl. "Delivery Note marked ready / dispatched / delivered / cancelled"); errors show Creator's message — inside the form or panel when the action is in one, otherwise as one error message; the same message is never shown twice.
- **Tests**: 67.

# v1.5.0 — Purchase Receive: bay placement, one serial row per unit, PO quantities; DN ↔ PR link (29 Oct 2026)

- **Receive goods** lists only lines with units still pending (a later receipt shows only what is left). Per line: quantity now (≤ pending, shown as ordered / received / pending), **rack → bay (with free space) → exact position** (Centre, Left, Right, Side, Top, Other + note), and **one row per received unit** for serial number and MAC address (Enter moves to the next unit; paste a list of serials).
- Same rules as the Purchase Receive form, checked in the panel and again in `Widget.purchase_receive`: bay capacity, blocked / inactive bays, warehouse country, one bay per line, serials unique and for every unit of a line or none, no over-receiving.
- `Widget.purchase_receive` creates the receipt and then saves the put-away and serials through the form's own edit step, so "Validation on edit" and the storage workflow run. PO status follows (Partially Received / Received, when those statuses exist); received totals are re-checked.
- DS 13: rack forms are now `Warehouse_Zone` (Zone_Code) and `Bay` (Level, Side); Storage has **Position** (Centre, Left, Right, Top, Other) and **Position Note**. The bay list shows code · level · side · free space.
- Delivery note lines record the Purchase Receive they deliver from (`Parent_PR_ID`).
- Deluge functions no longer contain comments; their notes moved to docs/CUSTOM_FUNCTIONS.md.
- **Tests**: 65.

# v1.4.0 — Timeline, editing, PM-only edits, dynamic pipeline, DS 12 procurement (29 Oct 2026)

- **Inline editing everywhere**: a field shows as text until clicked; the editor keeps the cell's width (the column is locked while it is open), so nothing next to it moves. No value is cut off with "…" any more — text wraps inside its column.
- **Dashboard → Timelines** is a Gantt with **Day / Month / Year** views, ◀ Today ▶ controls and a legend. Each project shows its Start → Completion bar (fill = tasks done) and its milestones (span + diamond: done / delayed / open), completed tasks, purchase orders, delivery notes and status changes on their dates. Hover or focus shows dates, records and responsible users. Data comes from `Widget.project_dashboard` (events).
- **Milestones & tasks**: compact rows, fixed columns, bordered editable fields; an expanded milestone shows its tasks with their own column header in a box that scrolls on its own.
- **Editing restricted to authorized Project Managers** (`Widget.can_edit`): app admin, Users.Role Administrator / Management / Project Manager, or the project's PM. Others see "View only"; the functions refuse their saves. Procurement BOQ edits are not restricted.
- **Project pipeline is dynamic**: stages come from the Status form (Modules "Project", sorted by **Order**).
- **Procurement (DS 12)**:
  - Delivery notes follow `Create_Delivery_Challan`: items are PO-line copies sent in the same API call (fixes "Add at least one item"); Source of Supply is read from the customer's Place of Supply (emirate names or Books codes such as DU) or picked in the panel (fixes "Please select Source of Supply (Emirate)"); BOQ links and totals are refreshed; status changes use the backend Delivery functions.
  - Purchase Receive is created the way a user does it in the form: create (rows as `Create_Purchase_Receive`, Status "Received" → Storage + GRN serial rows), then put-away (PATCH of Storage_Lines with warehouse / rack / segment, so "Validation on edit" and the storage workflow run). Every form validation is checked first; refusals go to Developer_Log. One segment per line in the Receive panel; a refused put-away shows as a second message.
  - Available to deliver = received − delivered − quantity on open notes.
- **Success messages**: one short toast — "PO created successfully", "PO updated successfully", "Purchase Receive created successfully", "Delivery Note created successfully" — shown only after Creator saved it, gone after 2 seconds. The result screens are removed.
- **Tests**: 63.

# v1.3.0 — Records created through the Creator REST API instead of insert into (29 Oct 2026)

- `Widget.project_create_po` creates the Purchase Order with `invokeurl` (`POST …/form/Purchase_Order`, connection `zoho_creator`) instead of `insert into`.
  - The PO lines are sent as `Item_Table` rows, with the amounts and totals (including tax) that the form computes on user input.
  - Adding lines to an existing PO is a `PATCH` on `All_Purchase_Orders`.
  - Creator assigns the PO number through "Update PO Number on validation".
  - The widget no longer calls the Books sync or writes back to the BOQ; the Purchase_Order workflows own that.
- `Widget.purchase_receive` creates the Purchase_Receive with `invokeurl` (`POST …/form/Purchase_Receive`), with the received copies as `Products` rows: Parent_Line_ID, is_PR, the Quantity / Quantity_Received / Quantity_to_be_Received of the form, and the storage location.
  - "Update Received On Success" and the Books sync now run as for a normal form submission.
  - The function's own copies of those steps were removed.
- Both functions validate the input first (same checks as v1.2) and read the record back after the workflows have run (number, Books ID).
  - When Creator refuses the submission, its message (including on-validate alerts) is shown in the panel.
- All API calls send the header `environment: development`; delete that one line in each function when the app goes live in production.
- No custom function uses `insert into` any more:
  - `Widget.purchase_delivery` submits the Delivery_Note through the API, then links the picked PO lines. This needs the backend validation change described in docs/CUSTOM_FUNCTIONS.md.
  - `Widget.project_risk_save` submits a new Project_Risk with all its fields.
  - `Widget.activity_add` submits all Activity_Stream lines of a change in one call.
- The panel texts now say that the Creator workflows do the follow-up work.

# v1.2.0 — Procurement module, goods receipt and delivery notes, PPT feedback (27 Oct 2026), DS 11

- **Procurement module** (`Procurement_Schedule` page), replicating the 2point0 Ops procurement register:
  - Frozen core columns (Pick, Vendor, Category, Type, Brand, Model, SKU, Item Description) and five colour-banded sections: Purchasing #44174E, Transit #662249, Receiving #A34054, Payments #ED9E59, Packages #E9BCB9, each with its own column headings.
  - Section bookmarks scroll the grid sideways to the frozen edge (smooth; instant after a layout change); ‹ › move one section left / right; scrolling by hand moves the bookmark.
  - Columns menu: Buyer / Warehouse / All presets, a checkbox per section (shows or hides all its columns together) and per core column; remembered in the browser.
  - Box-shaped click-to-edit fields of a fixed size (PO date, Status, Mode, ETA, WH date, Site date, Vendor before ordering): editing never moves the layout; a pick / Enter / click-away saves to the BOQ.
  - One value per cell; header metrics; All / To order / In progress / Received tabs; group by vendor or work package; vendor filter; delivery-note and goods-receipt lists.
- **Create purchase order**: always enabled; a fixed panel from the **left**; the page behind is frozen and the panel scrolls. Every line with quantity left to order is listed; the first tick locks the vendor; only the ticked lines are ordered. New PO or **add to an existing PO** of that vendor. Lines now carry `PO_Line_Items.BOQ`.
- **Receive goods** (Purchase Receive): from the row; received qty per pending line, receipt date, supplier DN#, warehouse → rack → segment (or direct to site). New `Widget.purchase_receive` repeats the existing Purchase Receive workflow steps (parent totals, PR_All_Received, warehouse occupancy, Books).
- **Delivery notes**: create from received stock only (received − already delivered, not on an open note), then Ready / Dispatched / Delivered (received by required) / Cancel. New `Widget.purchase_delivery` repeats `Create_Delivery_Challan` and the "Update DL on Success" workflow, then the Books sync.
- **Project widget (PPT feedback)**:
  - One header block: facts + a small stepper with progress; only the primary action, Move back / On Hold / Cancelled / Admin / history behind **More**; the reason is entered inline.
  - Tabs: Overview · Milestones · **Execution** · Procurement · **Risks** · Asset Register · Activity.
  - Overview: Overall progress and Assets delivered KPI cards removed; flatter cards.
  - Procurement tab: read-only results, one value per cell, "Open Procurement".
  - **Execution**: a section per work package (badge, progress, Lines / Tasks); lines show BOQ and procurement read-only, execution status and asset & network details editable; tasks are the second level.
  - Tasks tab removed (tasks live in Execution and Milestones; data issues moved to Milestones); task details open in a right side panel.
  - **Risks**: register and dashboard in one tab; "+ Add risk" is an inline row; no modal.
- **Home (PPT 1a–1e)**: Search in the same dropdown style as Go To; fixed height, no page scroll; new Milestones, Project team & core data and Risks widgets; timelines, trends, pivot and project cards as views.
- **DS 11**: all functions checked against `2Point0concepts (11).ds` (ERRORS: 0).
- **Tests**: 61.

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
