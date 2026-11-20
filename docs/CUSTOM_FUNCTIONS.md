# Custom functions used by the widget

The widget never reads or writes records directly. Each operation calls one Deluge function through its Custom API. All functions live in namespace **`Widget`**, return **`map`**, and take one argument **`quo_data` (string)**.

| Function | Custom API (link name) | Method | Status (v1.2) | Used for |
|---|---|---|---|---|
| `status_order` | — | — | unchanged | Static status orders (called by `project_details`, `project_update`) |
| `activity_values` | — | — | **new (v0.9: + Asset)** | Snapshot of a record's tracked fields (before / after a save) |
| `activity_add` | — | — | **new** (returns int) | Writes changed fields to `Activity_Stream` |
| `project_console` | `Widget_Project_Console` | GET | **update (v1.2)** | Reads, incl. activity. **v1.2:** `purchase_orders` also by `Project_reference` (+ vendor / country / warehouse IDs, terms, PR_All_Received); `po_lines` skip receipt copies (`is_PR`) and return BOQ, Estimate_Line_ID, Already_Delivered, Qty_to_Deliver, Store_Warehouse and the Delivery_Note; **new** `delivery_notes` and `purchase_receives` |
| `project_options` | `Widget_Project_Options` | GET | **update (v1.2)** | Dropdowns, + taskListTemplates. **v1.2:** warehouses with code / type / Active; **new** `racks` (Warehouse_Rack, parent = warehouse), `segments` (Rack_Segment, parent = rack, free qty), `dnStatuses` (Delivery Note statuses with Index_field) |
| `project_update` | `Widget_Project_Update` | PUT | **update** | Edit Project / status moves; **logs changes** |
| `project_details` | `Widget_Project_Details` | GET | **update (v1.0)** | Header, team, stages. **Edit permission:** admin, Users.Role Administrator / Management / Project Manager, the project's PM, or a Project Team member. The login email is matched to Users.Email ignoring case. Returns `edit_reason` when access is view-only |
| `project_dashboard` | `Widget_Project_Dashboard` | GET | **update (v0.9)** | Home charts: milestones (Milestone form), tasks, overdue, risks, **stage_order, quote (Estimate_Value_Sub_Total), tasks due / done per month** |
| `project_task_update` | `Widget_Project_Task_Update` | PUT | **update (v1.0: milestone Task_List)** | List edits: tasks, milestones, BOQ (vendor, PO#, transit…), **asset lines: Project Execution + Asset & Network fields**; logs changes |
| `project_create_po` | `Widget_Project_Create_PO` | POST | **update (v1.2)** | Procurement page "Create purchase order". **v1.2:** sets the new `PO_Line_Items.BOQ` on every line; optional `po_id` adds the lines to an existing PO of the same project + vendor (totals recalculated, Books re-synced with PUT); receipt copies are not counted as ordered.<br>1. Creates the PO in Creator: Project_reference, Sales_Reference, PO_Status, Warehouse (ship-to), terms days, and each line's Estimate_Line_ID.<br>2. Checks that the PO and every line exist.<br>3. Only then runs `ZohoBooks.Purchase_Order_Creator_books_Sync`.<br>4. Reads back the Books ID and returns `Books_Synced` / `Books_Message`.<br>5. Writes PO#, PO date and the "Ordered" status to the BOQ lines. |
| `project_risk_save` | `Widget_Project_Risk_Save` | POST | **update** | Create / edit Project_Risk; **logs changes** |
| `purchase_receive` | `Widget_Purchase_Receive` | POST | **new (v1.2)** | "Receive goods". Same records as `Creator.Create_Purchase_Receive` (Purchase_Receive + an `is_PR` copy of each received line, with Store_Warehouse / Rack / Segment), then the steps of the **Update Received On Success** workflow (workflows do not run on a Deluge insert): parent totals, Received flags, `PR_All_Received`, `Storage.Recalc_Warehouse`, then `ZohoBooks.Purchase_Receive_Creator_books_Sync`. BOQ: Delivered_to_2_0_Warehouse = Yes + date once fully received. |
| `purchase_delivery` | `Widget_Purchase_Delivery` | POST | **new (v1.2)** | Delivery notes. `create`: a Draft `Delivery_Note` for the picked received lines, as `Creator.Create_Delivery_Challan` (customer, source of supply, Qty_to_Deliver, DN_Amount). `status`: Ready 68 / Dispatched 69 / Delivered 67 / Cancelled 48, as the **Update DL on Success** workflow (Delivered adds to Already_Delivered; Cancelled releases the lines), then `ZohoBooks.Delivery_Challan_Creator_books_Sync`. BOQ: Delivered_to_Customer = Yes + date once fully delivered. |
| `po_payment_save` | `Widget_PO_Payment_Save` | POST | **new (v1.11)** | Procurement → Payments: add / delete a vendor payment (`Payment_Made`), Creator only |
| `task_collab` | `Widget_Task_Collab` | POST | **new (v1.11)** | Task comments, direct replies and files (`Task_Note`, `Task_File`) |
| `deal_estimate` | `Widget_Deal_Estimate` | POST | **new (v1.11)** | Home → New cost analysis: CRM deals without a cost analysis (paged) and creating one |
| `get_cost_analysis` | `Widget_Get_Cost_analysis` | GET | existing | (Cost Analysis widget) |

Code: [`creator/`](creator/), one `.dg` file per function.

**Custom API settings** (same as the three you already created):
- Authentication **OAuth2**
- User scope **All users**
- Parameter **`quo_data`**
- Method as in the table. For PUT / POST, the argument type is **Key and Value**.

## Order of work in Creator (v1.13 — Kick-Off Done checks, status pop-ups, milestones & tasks, deal list; DS 22)

DS 22 changes from DS 21: only `PO_Line_Items.Division` (added, as in v1.12). No new forms or fields for v1.13. Checker against DS 22: **ERRORS: 0**.

| Function | Change | Custom API |
|---|---|---|
| `Widget.project_update` | Moving to **Kick-Off Done** (or past it, from before it) is refused until the Project Registration form is complete: Project Reference, Name, Client, Country, Address, City, Type, Currency, Description, Start / Completion dates; Project Manager, Solution Architect, Sales Rep, Finance Rep, Logistics, H&S Manager; Client PO #, Project Value, Accepted Estimate, Date PO Received **or** the PO / LOI file; the five budget costs; Registration Task List, Sales Person, PM Approval, Sales and PM signatures; at least one Meeting Attendee, Project Team member, Client contact and Payment Term. The message lists what is missing. Resuming from On Hold is not checked | Re-save `Widget_Project_Update` |
| `Widget.project_console` | New action **`file`** (report, field, id, filepath): downloads a delivery note / receipt / task file through the Creator API (`zoho_creator` connection, header environment development) and returns it base64 — the widget uses it when `readFile` gives nothing (plain file links do not reach development records). The project record returns `Meeting_Attendees_Count`, `Pro_Count`, `Projects_contacts_Count`, `Payment_Terms_Agreed_Count` (the widget's Kick-Off checklist) | Re-save `Widget_Project_Console` |
| `Widget.project_task_update` | New `action`: **`create_milestone`** (Milestone_Name, Starts_after, Starts_After_In, Duration → a Milestone of the project, Status = Milestone status Index 44, plus its task list: a root Task named like it) and **`create_task`** (`parent_id` = the task list / work package list, or `milestone_id` → its list, created if missing; Task_Name, start, due → Task with that parent, its Work_Package, Task status Index 1, Duration) | Re-save `Widget_Project_Task_Update` |
| `Widget.project_console` | **v1.16.2**: `projects` also returns Registration_Notes, Warranty_Document, Shop_Drawings_Status, Solution_Architect_Signature (Project form, DS "2Point0concepts (1)") | Re-save `Widget_Project_Console` |
| `Widget.project_update` | **v1.16.2**: saves Registration_Notes and Shop_Drawings_Status (Pending / In Progress / Submitted / Approved); Kick-Off Done needs Shop Drawings Status; no longer needs an Outsourced contact; checklist IDs compared as text | Re-save `Widget_Project_Update` |
| `Widget.project_console` | **v1.16**: `tasks` returns **Milestone** (ID, Milestone_Name); `plan_milestones` no longer returns Task_List; `projects` returns **Project_Registration_Task_List** as a list (multi-select) | Re-save `Widget_Project_Console` |
| `Widget.project_task_update` | **v1.16**: add task — under a parent: copies the parent's Milestone; on a milestone: Milestone only, no parent, no "TL" task created; `create_milestone` no longer creates a task list task; task edit accepts **Milestone**; milestone save no longer reads / writes Task_List | Re-save `Widget_Project_Task_Update` |
| `Widget.project_update` | **v1.16**: saves **Project_Registration_Task_List** as a list (valid IDs only); Kick-Off Done needs every Active checklist item ticked | Re-save `Widget_Project_Update` |
| `Widget.project_options` | **v1.16**: `taskList` = Active **Project_Registration_Task_List** records (by Added Time); `taskListTemplates` removed | Re-save `Widget_Project_Options` |
| `Widget.project_dashboard` | **v1.16**: task counts include top-level tasks; only work package roots are left out | Re-save `Widget_Project_Dashboard` |
| `Widget.activity_values` | **v1.16**: Task values include Milestone; Milestone values no longer include Task list | Re-save `Widget_Activity_Values` |
| `Widget.project_console` | **v1.15**: new actions **`attendees`** (Meeting_Attendee rows: User_ID, User_Name, Attendance) and **`outsourced`** (Project_Contact rows: name, type, company, email, phone, scope, Sub_Contract_Value_Agreed) | Re-save `Widget_Project_Console` |
| `Widget.project_task_update` | **v1.15**: new `action` **`save_attendance`** (data User_ID, Attendance = Present / Absent / empty) → updates the project's Meeting_Attendee row of that employee, or adds it. `save_contact` reads the new row ID without a nested get | Re-save `Widget_Project_Task_Update` |
| `Widget.status_order` | **v1.15**: no status names or fallback lists — stages = Project statuses with an Order (by Order), any-time = Project statuses without one; Task / BOQ by Order then Index. `Modules.contains("Project")` in a criteria also matches "Project Risk", so each record's Modules list is checked for an exact "Project" (Creator has no `notContains` in criteria) | Re-save `Widget_Status_Order` |
| `Widget.project_dashboard` | **v1.15**: also returns `anytime_order` (Project statuses without an Order) | Re-save `Widget_Project_Dashboard` |
| `Widget.project_console` | **v1.14**: new action **`contacts`** (project_id) → the project's `Contact_Persons` (First_Name / Last_Name from the Name field, Email, Mobile, Work_Phone, Designation). Action **`file`** also serves the Project's **`PO_Document`** (report `All_Projects`) | Re-save `Widget_Project_Console` |
| `Widget.project_task_update` | **v1.14**: new `action` **`save_contact`** (contact_id empty = add): First_Name (required), Last_Name, Email, Mobile, Designation → `Contact_Persons` row of the project (Creator API, `zoho_creator` connection, header environment development; new rows get `Project` = the project). Milestone edits take **`Milestone_Name`**, and set **`Parent_Project`** (DS 23, the `Key_Milestones_Dates` grid link) when empty; `create_milestone` sets `Parent_Project` too | Re-save `Widget_Project_Task_Update` |
| `Widget.project_update` | **v1.14**: Kick-Off Done no longer requires **Accepted Estimate** (removed from the edit form) | Re-save `Widget_Project_Update` |
| `Widget.project_risk_save` | **v1.13.1**: a new risk's Risk ID comes from the app's numbering function **`thisapp.Creator.AutoGenerateNo("Risk")`** (the `Autogenerate` form, like Milestone / Task / Delivery Challan). Needs an `Autogenerate` record with **Form = `Risk`**, Prefix e.g. `RSK-%YY%`, Auto No = `1` → `RSK-26-00001`. Without that record it falls back to the old `R - n` per project | Re-save `Widget_Project_Risk_Save`; add the Autogenerate record |
| `Widget.deal_estimate` | Now the version from DS 22 (connection `z_crm`, JSON header). An empty CRM answer (no matching deals, HTTP 204) no longer breaks the list. **v1.13.1**: a search also matches the upper-case text in Deal_Name / Project_Reference (`pr_26289` finds `PR_26289`), and page 1 of a search returns **`existing`** — up to 10 matching deals that already have a cost analysis (`Quote_ID` set, as `quote_id`), so the widget can open them instead of saying no match | Re-save `Widget_Deal_Estimate` |

**Patch** — [`creator/patches/Estimate.Create_Project_Tasks.dg`](creator/patches/Estimate.Create_Project_Tasks.dg) (replace the whole function): new projects get the common milestones' task lists **once** (no work package), and only the **Project Execution** milestone's task list is created per work package. Before, every task list was copied once per work package. Projects already set up keep their tasks; the widget shows one copy of a common task list.

Then upload `dist/2point0-pm - actual widget.zip`.

## Order of work in Creator (v1.12 — reporting tag, in-transit on PO, delivery note files, files required; DS 21)

Checker against DS 21 (with the one new field below): **ERRORS: 0**.

### Step 1 — one new field

**`PO_Line_Items` → add field `Division`** · Drop down (picklist) · values exactly **Audio Visual**, **Digital Signage**, **Shared/Overhead** (same as `Vendors.Division` and `Product.Division`) · not mandatory.
Then open **Purchase_Order → Item_Table** and **Delivery_Note → Item_Table** (both subforms of PO_Line_Items) and tick `Division` in the subform's fields, so the widget can save it through the Creator API.

### Step 2 — one report change

**Report `All_Delivery_Notes`** → add the field **`Attachments`** to its Quick view and Detail view (the widget uploads delivery note files through this report; Creator refuses a field the report does not show). Delivery_Note.Attachments: allow all file types and multiple files (up to 10).

### Step 3 — functions

| Function | Change | Custom API |
|---|---|---|
| `Widget.project_create_po` | Every line needs a reporting tag (`division`) → `PO_Line_Items.Division`. New `mode_of_transit` (Road / Air / Sea) and `eta`: written on the PO's BOQ lines (`Mode_of_Transit`, `ETA`; ETA falls back to the delivery date as before) | Re-save `Widget_Project_Create_PO` |
| `Widget.purchase_delivery` | `create`: each line's `division` → the note line's `Division` (empty = the PO line's) | Re-save `Widget_Purchase_Delivery` |
| `Widget.project_options` | **vendors** return `division` (the vendor's reporting tag, the default on a new PO) | Re-save `Widget_Project_Options` |
| `Widget.project_console` | PO lines return `Division`; delivery notes return `Attachments` | Re-save `Widget_Project_Console` |

### Step 4 — Books sync (reporting tag per line)

Apply the two patches in [`creator/patches/`](creator/patches/README.md) (v1.12): `ZohoBooks.Purchase_Order_Creator_books_Sync` and `ZohoBooks.Delivery_Challan_Creator_books_Sync` take the line's `Division` first, then the product's, then the project's.

### Step 5 — upload `dist/2point0-pm - actual widget.zip`

## Order of work in Creator (v1.11 — payments, task comments & files, receipt files, new cost analysis from a deal; DS 20)

DS 20 calls the rack form **`Warehouse_Racks`** (DS 18/19 called it `Warehouse_Zone`; fields unchanged). `Widget.project_options` and `Widget.purchase_receive` now use `Warehouse_Racks` — paste both again. Checker against DS 20: **ERRORS: 0**.

### Step 1 — forms

Create each form in Creator (**Application → + Form → Blank**), with exactly these link names. Give each its default report the name shown (the widget uploads files through it).

| Form (link name) | Fields (link name · type) | Report (link name) |
|---|---|---|
| `Task_Note` | `Task` · Lookup → Task (single) · `Reply_To` · Lookup → Task_Note (single, the form itself) · `Comment` · Multi line · `Author` · Single line | `Task_Note_Report` (not used by the widget) |
| `Task_File` | `Task` · Lookup → Task (single) · `Task_Note` · Lookup → Task_Note (single) · `File_Name` · Single line · `File_field` (label File) · File upload | `All_Task_Files` |

No workflows on these forms. Users who use the widget need **add, view, edit and delete** on them (Settings → Users and Permissions → the profile → the two forms and their reports). For uploads, the File field must allow **all file types** and **local computer** as the source. The widget uploads through the report `All_Task_Files` into the field **`File_field`** (label "File"), so the report must show that field (DS 21 does).

**Supplier documents — no new form.** Edit the existing field **`Purchase_Receive.Attachments`** (File upload): choose **Multiple files**, maximum **10**, all file formats, source local computer. Zoho stores up to 10 files in one multi-file upload field (up to 50 MB each); the widget uploads each file in its own call into the receipt's Attachments, as Zoho's Upload File API requires for multiple-file fields, and downloads one file at a time with its `filepath`.

Payments use the existing form **`Payment_Made`** (Payment_Date, Amount, Reference_No, Payment_Note, Purchase_Order, Vendor, Payment_Country) — nothing to create. The widget adds rows with Deluge `insert into`, which does **not** run the form's workflows, so nothing is sent to Zoho Books.

### Step 2 — functions (namespace `Widget`, argument `quo_data` string, returns map)

| Function | Change | Custom API |
|---|---|---|
| `Widget.project_options` | **vendors** read in pages of 200 so every vendor is listed; racks read from `Warehouse_Racks` | Re-save `Widget_Project_Options` |
| `Widget.purchase_receive` | Racks from `Warehouse_Racks` (files go straight into `Attachments` from the widget) | Re-save `Widget_Purchase_Receive` |
| `Widget.project_console` | Receipts return `Attachments` as the field's list of files. New action **`po_payments`** (`po_ids`): the `Payment_Made` rows of those POs | Re-save `Widget_Project_Console` |
| `Widget.project_task_update` | Owners: any record of the **Users** form can be assigned (before: Project Team members only) | Re-save `Widget_Project_Task_Update` |
| **`Widget.po_payment_save`** (new) | `add` (po_id, date, amount, reference, note): checks the PO, a positive amount with ≤ 2 decimals and the remaining balance (PO Total_Cost − payments), then inserts `Payment_Made` with the PO's vendor and country. `delete` (payment_id): refused once the payment has a Books ID | **New** `Widget_PO_Payment_Save` — **POST** |
| **`Widget.task_collab`** (new) | `list` (task_id): comments + files. `add_note` (task_id, comment, reply_to, files): a `Task_Note` (Author = the user's Users.Name) and one `Task_File` row per file name, IDs as `File_IDs`. `add_files`: files on the task only. `delete_file` (task_id, file_id) | **New** `Widget_Task_Collab` — **POST** |
| **`Widget.deal_estimate`** (new) | `list` (page, search): CRM Deals with **`Quote_ID` empty**, 100 per page by COQL (`limit offset, 101` → `more`), newest first; search = Deal_Name contains. `create` (deal_id): as `Estimate.Create_Quotation` — POST to the Creator API `form/Estimate` (so the Estimate's on-add workflow numbers it, sets Status / Currency / milestones), then `Quote_ID` = the new Estimate ID on the Deal; returns `id`. A deal that already has a Quote_ID returns that ID | **New** `Widget_Deal_Estimate` — **POST** |

New Custom APIs: same settings as the others (OAuth2, All users, parameter `quo_data`, **Key and Value**, method POST).

### Step 3 — connections

- `Widget.deal_estimate` uses the **`z_crm`** connection for COQL (DS 22). Add the scope **`ZohoCRM.coql.READ`** to it (Setup → Connections → crm → Edit → add scope → re-authorise), together with `ZohoCRM.modules.deals.ALL`.
- It creates the Estimate through the **`zoho_creator`** connection with `headers:{"environment":"development"}`, exactly as `Estimate.Create_Quotation` does — remove the header when the app goes to production.

### Step 4 — upload `dist/2point0-pm - actual widget.zip`

## Order of work in Creator (v1.10 — rack sheet colours, serial locations, supplier DN file, direct-to-site delivery note, Books retry; DS 18)

**Form change (done in Creator):** `Purchase_Receive.Delivery_Note` — lookup to Delivery_Note (display: Delivery Challan#). The widget fills it; nothing to pick by hand. `Purchase_Receive.Attachments` (upload file, all formats, local computer) takes the supplier delivery note photo / scan. The widget uploads it through the report **Purchase_Receive_Report** — the widget's users need add / edit access to that report.

| Function | Change | Custom API |
|---|---|---|
| `Widget.project_options` | DS 18 rack fields (`Rack_Code`, `Rack_Aisle`). **segments** (form Bay, one pallet position each): label = `Location_Path · Segment_Code` (e.g. `R1-A-L1-Right · P01`); returns `capacity`, `bay`, `level`, `side`, `pallet`, `pallet_no`, `path` for the colour-coded rack picker. **vendors**: read in pages of 200 (`range from … to …`, by ID) until a page comes back short, so every vendor is returned (a single fetch stopped at 200); the widget sorts them by name | Re-save `Widget_Project_Options` |
| `Widget.purchase_receive` | DS 18 rack fields. Storage `Location_Label` = `Location_Path · pallet code · position · qty`; `Bay_Select`, `Level_Select`, `Side_Select` = the pallet. A pallet with no capacity is refused with that reason (same rule as the Purchase Receive form). Warranty end = start + months − 1 day (as the form). A second receipt for the same PO by the same user within a minute is refused (double submit). **Direct to site**: needs `site_received_by`; after the receipt it creates a delivery note for those lines through `Widget.purchase_delivery` (create, then Delivered) — Books stock goes in and out again — and links it in `Purchase_Receive.Delivery_Note`. **BOQ status**: the warehouse status only once the BOQ quantity is fully received; a partial receipt sets the BOQ status **Partially Received** (if that status exists for BOQ). Once the receipt is saved, a later failure returns success with a `Warning` instead of an error, so it is never saved twice | Re-save `Widget_Purchase_Receive` |
| `Widget.purchase_delivery` | **Price** = the accepted cost line's `Unit_Price` (as `Creator.Create_Delivery_Challan`), not the PO cost. A new note links itself in `Purchase_Receive.Delivery_Note` of the receipts it takes stock from (when empty). The direct-to-site add-on after `Recalc_Parent_Delivered` is removed (that function does it now — see patches). New action **`books_sync`** (`kind` po / pr, `id`): runs `ZohoBooks.Purchase_Order_Creator_books_Sync` / `Purchase_Receive_Creator_books_Sync` again and returns `Books_Synced` | Re-save `Widget_Purchase_Delivery` |
| `Widget.project_console` | DS 18 rack fields. `Stock_Locations` add `Rack`, `Bay`, `Level`, `Side`, `Pallet`. Receipts add `Attachments`, `Delivery_Note` (number, date, status, delivered date, received by); each line adds `Places` (storage rows with rack / bay / level / side / pallet) and `Serial_Units` (serial, MAC, status, storage row) | Re-save `Widget_Project_Console` |

**Creator scripts:** apply the five patches in [`creator/patches/`](creator/patches/README.md). `Delivery.Recalc_Parent_Delivered` goes in together with `Widget.purchase_delivery`.

Order: paste the four functions, re-save the four Custom APIs, apply the patches, upload `dist/2point0-pm - actual widget.zip`.

## Order of work in Creator (v1.9.1 — delivery note PDF letterhead; DS 17)

| Function | Change | Custom API |
|---|---|---|
| `Widget.purchase_delivery` | New action `print` (`dn_id`): the organization of the note's Country (`Books_Org_ID`) read from Zoho Books — `GET books/v3/organizations/<org>` with connection `zbooks1` (name, address, phone, email, website, tax ID) — and the note's customer (name, billing / shipping address and attention, TRN, phone, mobile, email). A Books error is logged with `Creator.log_addition`; the PDF then prints without the address | Re-save `Widget_Purchase_Delivery` |

The `zbooks1` connection needs the Books organization read scope (`ZohoBooks.settings.READ`); if it is missing, add it to the connection and re-authorise.

## Order of work in Creator (v1.9 — racks, split put-away, direct to site, BOQ status, ETA, DN status, Books numbers; DS 17)

| Function | Change | Custom API |
|---|---|---|
| `Widget.project_options` | **racks**: every Warehouse_Zone not marked inactive (Active empty counts as active); a rack with no Warehouse takes it from its bays; empty Zone Code falls back to Zone / Aisle. **segments**: same for Bay; free = Capacity − Occupied (as the receipt check); blocked bays flagged. **dnStatuses** returns `order` (Status.Order). **estimates** label = Quote_No_Books when filled, else Quote_No | Re-save `Widget_Project_Options` |
| `Widget.purchase_receive` | Put-away splits (`places`: rack, bay, position, qty — must add up to the qty received; one bay per location); one Storage row per split (the workflow's row is reused, the others inserted), each serial linked to its split's row. **Direct to site** (no warehouse): its Storage rows are removed, serials set Delivered, the PO line's delivered qty raised (PR copy `Already_Delivered` = qty) → BOQ Delivered to Client / Partially Delivered through `Delivery.Recalc_BOQ`. **BOQ status** after a warehouse receipt = 2.0 Dubai Warehouse (UAE) / 2.0 Riyadh Warehouse (Saudi) while nothing is delivered. Purchase_Receive.Project_Reference filled. Response PR number = Purchase_Receive_Books_No when filled | Re-save `Widget_Purchase_Receive` |
| `Widget.project_create_po` | Vendor check (`ZohoBooks.Ensure_Vendor_Books_ID`) kept, in the right place (DS 16 had it so that a valid PO was never saved). After the save, BOQ.ETA = the PO **Delivery Date** | Re-save `Widget_Project_Create_PO` |
| `Widget.purchase_delivery` | New DN: Reference = project reference (Project, else its Estimate) when left empty; Delivery_Note.Project_Reference filled. Status: any status at any time, also from Delivered / Cancelled (leaving Delivered takes the delivered qty back; a cancelled note reopens only while its stock is still free); direct-to-site qty kept after `Recalc_Parent_Delivered` | Re-save `Widget_Purchase_Delivery` |
| `Widget.project_task_update` | BOQ status rules: Warehouse / Office / Delivered statuses refused (goods receipt / DN only); past Order Pending / Not Ordered needs vendor and unit cost (Cost Analysis); In Transit / In Customs need ETA and mode of transit | Re-save `Widget_Project_Task_Update` |
| `Widget.project_console` | Estimate number = Quote_No_Books when filled; Purchase Receive number = Purchase_Receive_Books_No when filled (receipts, DN lines, stock); `Stock_Locations` adds warehouse, location, serials, receive date, status; receipt lines add item, serial numbers, every storage label, direct to site | Re-save `Widget_Project_Console` |
| `Widget.project_dashboard` | Estimate number = Quote_No_Books when filled | Re-save `Widget_Project_Dashboard` |

**Fix these Creator scripts too (not widget functions):**

1. `ZohoBooks.Purchase_Receive_Creator_books_Sync` — the custom-field block uses `product`, which only exists when the PO line had no Books line ID, so the function stops with an error and **no Purchase Receive is created in Books**. Replace `if(product.Brand != null)` with `if(ifnull(pr.Project_Reference,"") != "")`.
2. Purchase Order workflow **BOQ Update On Success** — `boq_rec.ETA=input.Date_field;` puts the PO date in ETA; use `boq_rec.ETA=input.Delivery_Date;`. (The widget also writes the delivery date after its own save.) In the same script the PO-number line never adds a second PO: after `if(po_text == "") { po_text = po_no; }` add `else { po_text = po_text + ", " + po_no; }`.
3. `Delivery.Recalc_Parent_Delivered` — so direct-to-site units stay delivered when a DN is changed from the Creator form, after `parent.Already_Delivered=delivered;` add: sum `Already_Delivered` of `PO_Line_Items[Parent_Line_ID == parent_id && is_PR == true]` and add it to `parent.Already_Delivered` before `Available_Qty` is set. (`Widget.purchase_delivery` already does this.)

Order: paste the seven functions, re-save the seven Custom APIs, apply the three script fixes, upload `dist/2point0-pm - actual widget.zip`. Racks: each Warehouse_Zone needs its Warehouse (or bays with a Warehouse) — the receive panel says so when a warehouse has none.

## Order of work in Creator (v1.8 — speed, vendor UAE / SAR, DN storage, CRM deal, Books PO number; DS 15)

| Function | Change | Custom API |
|---|---|---|
| `Widget.activity_add` | Writes Activity_Stream with `insert into` (no REST call back into Creator) — the main cause of slow saves / stage moves | — |
| `Widget.purchase_receive` | Put-away (storage location, serials, MAC, warranty) is saved directly on the Storage / GRN_Serial rows after the same checks as "Validation on edit", then `Stock.Recalc_Warehouse` and `Delivery.Sync_Serials_To_Costing` — no second PATCH of the receive (that PATCH was the "storage / serial numbers not saved: Error Occurred" alert) | Re-save `Widget_Purchase_Receive` |
| `Widget.project_console` | BOQ / costing lines without a vendor show the product's **Vendor_UAE** (UAE, Country Index 1) or **Vendor_SAR** (Saudi, Index 2); delivery note lines return the source Purchase Receive and its storage (warehouse · rack · bay); PO lines return `Stock_Locations` (storage rows with stock left: warehouse · rack · bay · position, qty, PR No) for the Create delivery note list; PO numbers = **Purchase_Order_Books_No** when filled, else PO_No (POs also found by the Books number) | Re-save `Widget_Project_Console` |
| `Widget.project_details` | Returns `crm_deal_id` (Accepted Estimate → Deals) for the "View Deal in CRM" button | Re-save `Widget_Project_Details` |
| `Widget.project_dashboard` | PO events use the Books PO number when filled | Re-save `Widget_Project_Dashboard` |
| `Widget.purchase_delivery` | DN reference uses the Books PO number when filled | Re-save `Widget_Purchase_Delivery` |
| `Widget.project_create_po` | Returns the Books PO number when filled | Re-save `Widget_Project_Create_PO` |

1. Paste the seven functions, re-save the six Custom APIs.
2. Upload `dist/2point0-pm - actual widget.zip`.
3. If "View Deal in CRM" does not open the deal, set `CRM.org` in `src/config/zoho.ts` to the org ID from a CRM deal URL (crm.zoho.com/crm/<org>/tab/Potentials/…) and rebuild.
4. Go-live: delete `apiHeaders.put("environment","development");` in project_create_po, purchase_receive, purchase_delivery, project_risk_save and project_update (activity_add no longer has it).

## Order of work in Creator (v1.7 — faster stage moves, project team editing; DS 13)

| Function | Change | Custom API |
|---|---|---|
| `Widget.project_update` | No edit-permission check (fixes "FORBIDDEN"). New `data.Project_Team` = the whole team `[{row_id, member_id, role_id}]`: checks members (Users) and roles (Roles), no duplicates, then PATCH `All_Projects/<ID>` with `Pro` rows (rows with ID are kept / changed, new rows added, rows left out removed). Refusals are written to **Developer_Log** | Re-save `Widget_Project_Update` |
| `Widget.project_task_update` | No edit-permission check | Re-save `Widget_Project_Task_Update` |
| `Widget.project_risk_save` | No edit-permission check | Re-save `Widget_Project_Risk_Save` |
| `Widget.project_details` | Team rows also return `Row_ID` (Project Team grid row) and `Role_ID` | Re-save `Widget_Project_Details` |
| `Widget.project_options` | New source `projectRoles` (Roles form, by Index) | Re-save `Widget_Project_Options` |
| `Widget.activity_values` | Project values include "Project team" (Name (Role), …), so team changes show in the activity log | — |

1. Paste the six functions, re-save the five Custom APIs.
2. Upload `dist/2point0-pm - actual widget.zip`.
3. Go-live: also delete `apiHeaders.put("environment","development");` in project_update.

## Order of work in Creator (v1.6 — per-unit vendor warranty; DS 13)

**1. Add three fields to the GRN Serial form** (Creator → GRN Serial → add field), then tick them in **Purchase Receive → GRN Serial Number** (subform fields):

| Field label | Link name | Type |
|---|---|---|
| Warranty Months | `Warranty_Months` | Number |
| Warranty Start | `Warranty_Start` | Date |
| Warranty End | `Warranty_End` | Date |

The default months come from **Product → Warranty** (years × 12); the start defaults to the receipt date; the end = start + months (the function saves it).

**2. Replace these functions** (they include all v1.4 / v1.5 changes too):

| Function | Custom API |
|---|---|
| `Widget.purchase_receive` | re-save `Widget_Purchase_Receive` |
| `Widget.project_console` | re-save `Widget_Project_Console` |

Until the three fields exist, a receipt with warranty values is still created; only the warranty / serial step reports "not saved" (and Developer_Log has Creator's answer).

## Order of work in Creator (v1.5 — Purchase Receive placement, serials, PO quantities; DS 13)

**1. Storage fields** — done by the backend in DS 13: `Position` (Centre, Left, Right, Top, Other) and `Position_Note`. Make sure both are ticked in **Purchase Receive → Storage Lines** (subform fields). DS 13 also renamed the rack forms: `Warehouse_Rack` → **`Warehouse_Zone`** and `Rack_Segment` → **`Bay`** (adds `Level`, `Side`); DS 18 renamed `Zone_Code` / `Zone_Aisle` to **`Rack_Code`** / **`Rack_Aisle`** and made each Bay record one pallet position (`Bay_Letter`, `Level`, `Side`, `Pallet_No`, `Segment_Code` = pallet code, `Location_Path`).

**2. Status records** (Status form):
- Purchase Receive module: **Received**. It already exists if the form has been used; without it no Storage / GRN serial rows are made.
- Purchase Order module (optional): **Partially Received** and **Received**. When they exist, the PO status follows each receipt.

**3. Replace these functions** (whole function: open it in Creator, select all, paste):

| Function | File | Custom API |
|---|---|---|
| `Widget.purchase_receive` | [Widget.purchase_receive.dg](creator/Widget.purchase_receive.dg) | re-save `Widget_Purchase_Receive` |
| `Widget.purchase_delivery` | [Widget.purchase_delivery.dg](creator/Widget.purchase_delivery.dg) | re-save `Widget_Purchase_Delivery` |
| `Widget.project_console` | [Widget.project_console.dg](creator/Widget.project_console.dg) | re-save `Widget_Project_Console` |

Paste them **after** step 1: they use `Storage.Position`, and Creator refuses to save a function that names a missing field.

**4. Update two backend workflows** (Purchase Receive form → Workflows):

a) **Update Received On Success** (on success). There are two scripts that build the location label, step 7 of the first script (`srow`) and the third script (`st`). In each, replace the line

```
srow.Location_Label=Bay[ID == srow.Segment].Segment_Code + " · " + ifnull(srow.Qty,0);
```

with (in the third script use `st` instead of `srow`)

```
location_text = Bay[ID == srow.Segment].Segment_Code;
if(ifnull(srow.Position,"") != "")
{
	location_text = location_text + " · " + srow.Position;
}
if(ifnull(srow.Position_Note,"") != "")
{
	location_text = location_text + " (" + srow.Position_Note + ")";
}
srow.Location_Label=location_text + " · " + ifnull(srow.Qty,0);
```

b) **Validation on edit** (on validate). Add this block just before `if(msg != "")` at the end, so form users follow the same position rules:

```
for each  pos_row in input.Storage_Lines
{
	if(ifnull(pos_row.Position,"") != "" && pos_row.Segment == null)
	{
		msg = msg + "Select the segment (bay) for the position " + pos_row.Position + ".\n";
	}
	if(ifnull(pos_row.Position,"") == "Other" && ifnull(pos_row.Position_Note,"") == "")
	{
		msg = msg + "Describe the Other position (Position Note).\n";
	}
}
```

Nothing else in the backend changes: capacity, blocked / inactive bays, one bay per row, storage qty = received qty and serial rules stay in the existing "Validation on edit", which the widget's put-away step runs.

**5. Upload** `dist/2point0-pm - actual widget.zip`.

**6. Test** (development environment):

| # | Do | Expect |
|---|---|---|
| 1 | Receive all 3 units of a line into a bay, position Left, 3 serials | 1 PR; 3 GRN_Serial rows with the serials; Storage row in the bay, label `R-S01 · Left · 3`; PO line received 3, pending 0; PR_All_Received / PO status Received (if all lines) |
| 2 | Receive 2 of 3, 2 serials | PO line received 2, pending 1; 2 serial rows; PO status Partially Received |
| 3 | Open Receive again on that line | Only 1 pending, 1 serial row |
| 4 | Type 2 on that line | "only 1 still to receive (ordered 3, received 2)"; Save disabled (the function refuses it too) |
| 5 | Reuse a serial from test 1 | "Serial … already exists in another receive" |
| 6 | Same serial twice in one receipt | "Serial … is entered twice" |
| 7 | 1 serial for 2 units | "enter a serial for every unit received (1 of 2)" |
| 8 | Bay with less free space than the quantity | "… has only N free" |
| 9 | Blocked / inactive bay, rack of another warehouse, warehouse of another country | the matching message, nothing created |
| 10 | Position Other without a note | "Describe the Other position" |
| 11 | Delivery note from the received stock | DN lines have Parent_PR_ID = the receipt; Mark delivered → storage Delivered_Qty, serials Delivered with the DN |

If a step fails, Developer_Log has the request and Creator's answer.

## Order of work in Creator (v1.4 — DS 12, dynamic pipeline, PM-only editing, timeline)

| Function | Change | Custom API |
|---|---|---|
| `Widget.can_edit` | **New** (not a Custom API): edit permission in one place — **v1.6.4: everyone may edit** (can_edit = true); still reports app admins (admin "set stage") | — |
| `Widget.status_order` | Pipeline from the **Status form**: Modules "Project" records with Order > 0, sorted by **Order** (On Hold / Cancelled = anytime); Task order the same way. Falls back to the old list if no Order is filled | — |
| `Widget.project_details` | Uses `can_edit` (team members who are not the PM become read-only); stage IDs only from Project statuses | Re-save `Widget_Project_Details` |
| `Widget.project_update` | v1.6.5: no edit-permission check (everyone may save); stage rules unchanged | Re-save `Widget_Project_Update` |
| `Widget.project_task_update` | Same for tasks, milestones and asset lines (BOQ / procurement edits stay open) | Re-save `Widget_Project_Task_Update` |
| `Widget.project_risk_save` | Same for risks | Re-save `Widget_Project_Risk_Save` |
| `Widget.purchase_receive` | Two steps, as a user in the form: **create** (POST, rows as `Creator.Create_Purchase_Receive`, Status = Received → Storage + GRN serial rows) then **put-away** (PATCH `Purchase_Receive_Report`, Storage_Lines get warehouse / rack / segment → "Validation on edit" + labels + `Stock.Recalc_Warehouse`). Checks every form rule first (quantities, PO line, warehouse active + PO country, rack / segment, active, not Blocked, free space, one segment per line). Refusals are written to **Developer_Log** | Re-save `Widget_Purchase_Receive` (POST, `quo_data`) |
| `Widget.purchase_delivery` | As `Creator.Create_Delivery_Challan` (DS 12): items sent as PO-line copies; Source of Supply from the customer (names or Books codes) or picked in the widget; PO warehouse when none is picked; BOQ link + `Delivery.Recalc_BOQ`; status changes use `Recalc_Parent_Delivered`, `Recalc_BOQ`, `On_Delivered` | Re-save `Widget_Purchase_Delivery` |
| `Widget.project_console` | PO lines: `Reserved_Qty` (open delivery notes) and the latest note; DN lines point to their PO line | Re-save `Widget_Project_Console` |
| `Widget.project_dashboard` | Timeline events per project: milestones, completed tasks, POs, delivery notes, Status_History | Re-save `Widget_Project_Dashboard` |

1. Fill the **Order** field of every Project status (1, 2, 3 …) in the Status form; On Hold / Cancelled can stay empty.
2. Paste the functions above (create `Widget.can_edit` first — the others call it), then re-save the Custom APIs.
3. Upload `dist/2point0-pm - actual widget.zip`.
4. Go-live: delete `apiHeaders.put("environment","development");` in project_create_po, purchase_receive, purchase_delivery, project_risk_save and activity_add.

## Order of work in Creator (v1.3 — records created through the Creator REST API)

Every record the widget creates is now **created with `invokeurl` on the Creator REST API v2.1** (connection `zoho_creator`), not `insert into`. The record goes through the form like a normal submission, so the form's **on validate** and **on success** workflows run, and the backend team's workflows do everything after the record is saved.

| Function | Status | What changed |
|---|---|---|
| `Widget.project_create_po` | **Replace** (paste whole file) | New PO = `POST …/form/Purchase_Order` with the `Item_Table` rows. Add to existing PO = `PATCH …/report/All_Purchase_Orders/<ID>`. Removed: own PO numbering, BOQ write-back, Books sync call. |
| `Widget.purchase_receive` | **Replace** (paste whole file) | `POST …/form/Purchase_Receive` with the `Products` rows (copies of the PO lines). Removed: parent totals, PR_All_Received, Recalc_Warehouse, BOQ write-back, Books sync call. |
| `Widget.purchase_delivery` | **Replace** | Delivery Note = `POST …/form/Delivery_Note`, then the picked PO lines are linked to it, as `Creator.Create_Delivery_Challan` does. **Needs the backend validation change below.** Status changes are unchanged. |
| `Widget.project_risk_save` | **Replace** | A new risk = `POST …/form/Project_Risk` with all its fields. Editing an existing risk is unchanged. |
| `Widget.activity_add` | **Replace** | Activity lines = one `POST …/form/Activity_Stream` per change, with all its lines (the API adds up to 200 records per call). |
| `Widget.project_console`, `Widget.project_options` and the other functions | No change | — |
| Widget zip | **Upload again** | The panels' text now says Creator workflows do the rest. |

Steps:

1. **Connection `zoho_creator`** (Setup → Connections, already used by `ZohoBooks.Delivery_Challan_Creator_books_Sync`):
   - It needs the scopes `ZohoCreator.form.CREATE`, `ZohoCreator.report.READ` and `ZohoCreator.report.UPDATE`.
   - If any scope is missing, edit the connection and reconnect it.
   - The link name must stay `zoho_creator`. If yours differs, change `connection:"zoho_creator"` in both files.
2. **Paste and save** `Widget.project_create_po` and `Widget.purchase_receive`. Then **re-save** the Custom APIs `Widget_Project_Create_PO` and `Widget_Purchase_Receive`; their names and settings are unchanged.
3. **Paste and save** `Widget.purchase_delivery`, `Widget.project_risk_save` and `Widget.activity_add`, then re-save the Custom APIs `Widget_Purchase_Delivery` and `Widget_Project_Risk_Save`. `activity_add` has no Custom API.
4. **Upload the new widget zip.**
5. **Environment:** all five functions send the header `environment: development` (`apiHeaders.put("environment","development");`). When the app goes live in production, delete that line in each of them; with no header the API writes to production.
6. **Backend workflows.** After this change the widget only creates the record, so these must be handled by the form workflows:
   - **Purchase_Order on add, on success:** `ZohoBooks.Purchase_Order_Creator_books_Sync(input.ID)`. DS 11 has no Purchase_Order success workflow, so today nothing sends a new PO to Books.
   - **Purchase_Order on add, on success:** write PO#, PO date and the "Ordered" status back to each BOQ in `input.BOQ`. The widget did this until v1.2.
   - **Purchase_Order on edit, on success:** when the widget adds lines to an existing PO, it sends the full row list plus `BOQ`, `Sub_Total`, `Total_Cost` and `PR_All_Received = false`. Books re-sync and BOQ write-back belong here.
   - **Purchase_Receive:** "Update Received On Success" already handles the Received flags, parent totals, PR_All_Received, Recalc_Warehouse and the Books sync. Only the BOQ `Delivered_to_2_0_Warehouse` / `Date_delivered_to_warehouse` write-back is no longer done by the widget.
   - **Numbers:** `PO_No` / `PR_No` are sent as `NEW`. The on-validate workflows "Update PO Number on validation" and "Update PR No On validation" replace them with `Creator.AutoGenerateNo`. Keep those workflows.
7. **Test** with Execute:

| Function | `quo_data` |
|---|---|
| `project_create_po` | `{"project_id":"<ID>","vendor_id":"<Vendor ID>","country_id":"<Country ID>","lines":[{"boq_id":"<BOQ ID>","product_id":"<Product ID>","description":"Test","quantity":"1","rate":"10"}]}` |
| `purchase_receive` | `{"po_id":"<PO ID>","lines":[{"line_id":"<PO line ID>","quantity":"1","warehouse_id":"<Warehouse ID>"}]}` |

A refused submission returns `{"status":"error","code":"API","message":"Creator did not save …: <Creator's message>"}`. That message includes the alerts from the on-validate workflows, and the widget shows it in the panel.

**Delivery notes (DS 12):** the backend change above is no longer needed — since DS 12 a delivery note's items are copies of the PO lines (`is_DN`, `Parent_Line_ID`), so `Widget.purchase_delivery` sends them in the same API submission. See v1.4 below.

## Order of work in Creator (v1.2 — procurement, goods receipt, delivery notes; DS 11)

1. **Paste and save** `Widget.project_console`, `Widget.project_options`, `Widget.project_create_po` (replace the whole function body).
2. **Create** `Widget.purchase_receive` and `Widget.purchase_delivery` (namespace Widget, return type `map`, argument `quo_data` string), paste the `.dg` files.
3. **Create the Custom APIs** `Widget_Purchase_Receive` and `Widget_Purchase_Delivery`: method **POST**, OAuth2, all users, parameter `quo_data` (Key and Value). Re-save `Widget_Project_Console`, `Widget_Project_Options` and `Widget_Project_Create_PO`.
4. Statuses: the **Delivery Note** module needs Status records with Index_field 1 (Draft), 68 (Ready), 69 (Dispatched), 67 (Delivered), 48 (Cancelled) — the same ones your Delivery_Note workflows use.
5. Upload the new widget zip (Settings → Widgets → Project Console → Edit → upload) — the same zip serves Home, Project_Widget and Procurement_Schedule.
6. **Test** with Execute:

| Function | `quo_data` |
|---|---|
| `project_console` | `{"action":"delivery_notes","project_id":"<ID>"}` |
| `project_options` | `{"source":"racks"}` |
| `purchase_receive` | `{"po_id":"<PO ID>","lines":[{"line_id":"<PO line ID>","quantity":"1","warehouse_id":"<Warehouse ID>"}]}` |
| `purchase_delivery` | `{"action":"create","project_id":"<ID>","lines":[{"line_id":"<received PO line ID>","quantity":"1"}]}` |

## Order of work in Creator (v0.8)

1. **Create the form `Activity_Stream`** (fields in [ACTIVITY_STREAM.md](ACTIVITY_STREAM.md)). Functions that log changes cannot be saved without it.
2. **Create** `Widget.activity_values` (returns map), then `Widget.activity_add` (returns **int**). Neither needs a Custom API.
3. **Paste and save**: `project_console`, `project_update`, `project_details`, `project_dashboard`, `project_task_update`, `project_risk_save`. Re-save each Custom API afterwards.
4. **Test** with Execute:

| Function | `quo_data` |
|---|---|
| `project_dashboard` | `{}` (check `milestones_total`, `tasks_overdue`, `risks_open`) |
| `project_task_update` | `{"project_id":"<ID>","milestone_id":"<Milestone ID>","data":{"Duration":"30"}}` |
| `project_console` | `{"action":"activity","project_id":"<ID>"}` (the line written by the test above) |

**Rule for every function:** never combine `&&` and `||` in one condition. Creator drops the brackets, in criteria **and** in `if(...)`. DS 10 shows `if(msOpen && (… || lateTask))` saved as `if(msOpen && … || lateTask)`. Build such conditions in steps (`isLate = a || b;` then `if(isOpen && isLate)`). The checker now rejects mixed conditions.

## Check before saving any function edit

Run this; it must end with `ERRORS: 0`. It checks every form, field, lookup, sub-form and variable against the .ds.

```bash
python3 scripts/check-deluge.py "<path>/2Point0concepts (11).ds" docs/creator
```

## Function notes

The Deluge functions carry no comments (they can break saving in Creator). What each one takes and does is kept here.

### Widget.activity_add

```text
Widget.activity_add(string project_id, string module, string record_id, string record_name, map before, map after)
Writes one Activity_Stream record per field whose text changed (before → after). An empty "before" = the record was
created: one "created" line. Returns the number of lines written. No Custom API.
Called by project_update, project_task_update, project_risk_save and the optional Edit workflows (docs/ACTIVITY_STREAM.md).
v1.3: the lines are created through the Creator REST API (invokeurl, connection "zoho_creator"), not "insert into" —
all lines of one change in one call (the API adds up to 200 records per call).
```

### Widget.activity_values

```text
Widget.activity_values(string module, string record_id) — the tracked fields of one record as {"Label":"text"}.
Called before and after a save; Widget.activity_add logs every label whose text changed. No Custom API.
module: Project | Milestone | Task | BOQ | Risk | Asset
```

### Widget.can_edit

```text
Widget.can_edit(string project_id) — who may edit a project in the Project Widget (one place). Not a Custom API:
called by project_details (the widget's read-only mode) and by project_update / project_task_update / project_risk_save
(refused on the server too). Allowed = app admin, Users.Role Administrator / Management / Project Manager, or this
project's Project Manager. The login is matched to Users.Email without regard to upper / lower case.
Returns {"can_edit":true|false,"is_admin":true|false,"reason":"…","user_name":"…"}.
```

### Widget.project_create_po

```text
Widget.project_create_po(string quo_data) — Procurement "Create purchase order". Custom API: Widget_Project_Create_PO (POST, quo_data).
quo_data: {"project_id","vendor_id","country_id","date":"dd-MMM-yyyy","delivery_date","reference","notes","terms","terms_days",
"warehouse_id","discount","po_id" (optional: add the lines to this existing PO of the same project + vendor),
"lines":[{"boq_id","product_id","line_id","description","quantity","rate","tax_id"}]}
v1.3: the Purchase Order is CREATED THROUGH THE CREATOR REST API (invokeurl, connection "zoho_creator"), not "insert into".
It is a real form submission, so the Purchase_Order on-validate workflows (PO number from Creator.AutoGenerateNo, discount
account check) and the on-success workflows run. Everything after the record is saved — Zoho Books sync, BOQ PO# / status
write-back — is done by those workflows (backend team). This function only checks the input, sends the record and reads it back.
Adding lines to an existing PO is an UPDATE through the same API (report All_Purchase_Orders), so the on-edit workflows run.
The line values the form fills on user input (amount, totals with tax) are sent, because user-input workflows do not run on the API.
```

### Widget.project_dashboard

```text
Widget.project_dashboard(string quo_data) — Home (Project Search Dashboard). Custom API: Widget_Project_Dashboard (GET, quo_data).
One row per project with its counts, employee totals, the estimates for "Search by reference" (Cost Analysis)
and the logged-in user.
Never mix && with || in one condition: Creator drops the brackets (criteria and if), so conditions are built in steps.
Delivered asset line = Delivery or Installation Status "Delivered to Client" / "Delivered" / "Installed" (never "Not …" / "Partially …").
Milestones = Milestone form: planned end = project Start Date + Starts after + Duration − 1 days; delayed when it passed and the
milestone status is not Complete / Closed. Tasks = Task records with a Parent Task (task lists have none).
Health (widget) = At Risk when a milestone is delayed or an open risk is Critical (risks_critical).
events (Timelines Gantt): per project, its milestones (planned start / end, status, owner), completed tasks (Actual Complete
Date, owners), purchase orders (PO date, vendor, issued by, total), delivery notes (DN / delivered date) and the raw
Status_History (the widget reads its dated status changes).
```

### Widget.project_details

```text
Widget.project_details(string quo_data) — project header extras. Custom API: Widget_Project_Details (GET, quo_data).
quo_data: {"project_id":"…"} → customer (live from Client_Name), contacts, owner, team (Project Team grid), pipeline stages
(Status form Order, via Widget.status_order, with Status record IDs), task / BOQ status orders, and the caller's edit / admin
permission (Widget.can_edit).
```

### Widget.project_options

```text
Widget.project_options(string quo_data) — dropdown values. Custom API: Widget_Project_Options (GET, quo_data).
quo_data: {"source":"customers|statuses|countries|currencies|users|estimates|taskList|taskStatuses|installStatuses|boqStatuses|milestoneStatuses|projectStatuses|riskStatuses|departments|taskListTemplates|vendors|warehouses|racks|segments|dnStatuses|taxes"} → {"status":"success","records":[{"ID","label"}]}
```

### Widget.project_risk_save

```text
Widget.project_risk_save(string quo_data) — create / edit a Project_Risk record (Risk Register).
Custom API: Widget_Project_Risk_Save (POST, quo_data).
quo_data: {"project_id", "risk_id" (empty = create), "data":{"Risk_ID","Risk_Description","Cause","Probability","Impact",
"Priority","Risk_Status","Risk_Owner","Department"}}  — only the fields to save; lookups as record IDs ("" = clear).
Risk_Score and Risk_Severity are always calculated here (workbook Risk Register formulas): score = probability × impact
(1–25), severity = the workbook's probability / impact table. Probability and Impact are mandatory (form "must have").
Created / changed risks are written to Activity_Stream.
v1.3: a NEW risk is created through the Creator REST API (invokeurl, connection "zoho_creator"), not "insert into";
edits of an existing risk are unchanged (record update).
```

### Widget.project_task_update

```text
Widget.project_task_update(string quo_data) — inline edits. Custom API: Widget_Project_Task_Update (PUT, quo_data).
Task:       {"project_id","task_id","data":{Task_Name, Task_Description, Task_Start_Date, Task_End_Date, Duration, Actual_Start_Date, Actual_Complete_Date,
Task_Status, Priority, Precent_Complete, Work_Hours, Billing_Type, Parent_Task, Owners:[ids]}}
Milestone:  {"project_id","milestone_id","data":{Starts_after, Starts_After_In, Duration, Owner, Flag, Status, Task_List}}
Task_List = a task list of the Task Administrator template (Type Task, no parent); "" removes the mapping.
Asset line: {"project_id","line_id","data":{Installation_Status, Delivery_Status, Notes, Serial_Number, MAC_Address_Control, MAC_Address_Dante,
Warranty_Start_Date, Warranty_End_Date, Provision, Outlet_GOP_No, Networked, Switch_Ref, Port_No, POE, VLAN, IP_Address,
Subnet_Mask, Host_Name, Gateway, DNS_Server_1, DNS_Server_2}}  (Project Execution + Asset & Network sections only;
BOQ / procurement fields stay read-only, as the architecture)
BOQ line:   {"project_id","boq_id","data":{PO_Date, ETA, Status, Vendors, PO, Mode_of_Transit, Delivered_to_2_0_Warehouse, Date_delivered_to_warehouse,
Delivered_to_Customer, Date_delivered_to_customer}}
Rules: due date on/after start date; owners must be on the project team (Project Team grid); ETA on/after PO date.
v1.6.5: no edit-permission check — everyone may save tasks, milestones and asset lines. (Earlier: only users allowed by Widget.can_edit; BOQ lines were
edited by procurement in the Procurement module and are not restricted.
Records are fetched by ID and checked against the project in memory (no mixed && / || criteria).
Every saved change is written to Activity_Stream (Widget.activity_values before / after → Widget.activity_add).
```

### Widget.project_update

```text
Widget.project_update(string quo_data) — UPDATE one Project. Custom API: Widget_Project_Update (PUT, quo_data).
quo_data: {"project_id":"…","data":{only the changed fields},"reason":"…"}; dates dd-MMM-yyyy, lookups = record ID, "" clears.
v1.6.5: no edit-permission check — everyone may save.
Project_Status follows the Status form Order (Widget.status_order()): next stage only; back needs a reason; skipping needs admin;
"On Hold" / "Cancelled" can be set at any stage. Every status change appends a line to Status_History:
dd-MMM-yyyy HH:mm:ss | <Status> | <User> | <Reason>
End date (Project_Completion_Date) must be on or after Start_Date.
```

### Widget.status_order

```text
Widget.status_order() — the status order (one place). Not a Custom API: called by project_details, project_update and
project_dashboard. Built from the Status form: the records of a module (Modules) sorted by their Order field, so a new
status, a renamed one or a changed Order shows in the widget pipeline without a code change.
project = Modules "Project" with an Order above 0, by Order (On Hold / Cancelled excluded — they are "anytime")
anytime = Modules "Project" named On Hold / Cancelled (can be set at any stage)
task    = Modules "Task" with an Order above 0, by Order
A module with no ordered Status record falls back to the previous static list, so the pipeline never goes empty.
boq stays static: the BOQ Status values are not Status records.
```

### Widget.purchase_receive

```text
Custom API: Widget_Purchase_Receive (POST, quo_data).
quo_data: {"po_id","receive_date":"dd-MMM-yyyy","supplier_dn","notes",
  "lines":[{"line_id","quantity","warehouse_id","rack_id","segment_id","position","position_note",
            "serials":[{"serial_no","mac"}]}]}        line_id = the PO's own PO_Line_Items record; segment = bay
Checks first (as the Purchase Receive form): 0 < quantity <= pending (ordered − received); line on this PO, not a copy, has a
product; date not in the future; warehouse active and in the PO's country; rack in the warehouse and active; bay (Rack_Segment)
in the rack, active, not Blocked, free space (Capacity − Occupied_Qty) for the quantity; one bay per line; position Centre /
Left / Right / Side / Top / Other (needs a bay; Other needs a note); serials unique in the request and in GRN_Serial, for every
unit of a line or none.
1. CREATE  POST form/Purchase_Receive — Products = copies of the PO lines (Creator.Create_Purchase_Receive), Status Received.
   The on-success workflow creates the Storage row and one GRN_Serial row per unit, updates the PO line totals and BOQ.
2. PUT-AWAY + SERIALS  PATCH report/Purchase_Receive_Report/<ID> — Storage_Lines get Warehouse / Rack / Segment / Position /
   Position_Note, GRN_Serial_Number rows get Serial_No / MAC_Address / Storage. "Validation on edit" checks them.
3. PO_Status = "Received" (all lines received) or "Partially Received", when such Status records exist for "Purchase Order".
4. The received totals of the PO lines are re-read and compared (Check_Message, Developer_Log).
Refusals are written to Developer_Log (Creator.log_addition).
```

### Widget.purchase_delivery

```text
Custom API: Widget_Purchase_Delivery (POST, quo_data).
Create:  {"action":"create","project_id","dn_date":"dd-MMM-yyyy","challan_type","warehouse_id","reference","notes",
          "source_of_supply","lines":[{"line_id","quantity"}]}
Status:  {"action":"status","dn_id","status_index":68|69|67|48,"delivered_date","received_by","vehicle_no","driver_name"}
Create: Item_Table rows = copies of the PO lines (Creator.Create_Delivery_Challan: is_DN, Parent_Line_ID, Parent_PO_ID) plus
Parent_PR_ID = the Purchase Receive whose stock is delivered (oldest storage row with stock left, else the latest receipt).
Available = received − delivered − on other open notes (Delivery.Open_Reserved). Source of supply from the customer
(names or Books codes) or the one picked. Warehouse = picked, else the PO's. Then BOQ link + Delivery.Recalc_BOQ.
Status: Recalc_Parent_Delivered (storage rows and serials leave stock FIFO), BOQ list + Recalc_BOQ, On_Delivered, Books sync.
```
