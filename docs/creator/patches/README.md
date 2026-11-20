# Creator script patches (v1.10, DS 18)

These are not `Widget.*` functions. Paste each one into the named Creator script, replacing the part described.

| File | Where | Replace |
|---|---|---|
| `Delivery.Recalc_Parent_Delivered.dg` | Function `Delivery.Recalc_Parent_Delivered` | The whole function. The parent line's `Already_Delivered` now adds the quantities received direct to site (PR copies' `Already_Delivered`), so changing a delivery note from the Creator form no longer erases them. Storage rows still take only the delivered DN quantity. |
| `Purchase_Order.BOQ_Update_On_Success.dg` | Purchase_Order workflow **BOQ Update On Success**, second action (the "PO number to show on the BOQ" script) | The whole script. ETA = PO **Delivery_Date** (was the PO date), and a second PO number is appended to `BOQ.PO` (`PO-1, PO-2`). |
| `ZohoBooks.Delivery_Challan_Creator_books_Sync.cf_reference.dg` | Function `ZohoBooks.Delivery_Challan_Creator_books_Sync`, the `//custom Fields` block | `custom_fields_list = List();` and the `if(product.Brand != null) { … cf_reference … }` block. `product` is a left-over variable; the reference is now sent whenever the note has a Project_Reference. |
| `Creator.Create_Delivery_Challan.rate.dg` | Function `Creator.Create_Delivery_Challan`, step 4 | The two lines `costingline = Costing_Lineitem[ID == li.BOQ.Accepted_Costing_Lineitem];` and `rate = costingline.Unit_Price;`. Same price (accepted cost line's Unit_Price), but a line without BOQ or accepted cost line no longer stops the script. |
| `Widget.sync_boq.locked-quantity.dg` | Function `Widget.sync_boq` (Cost Analysis widget), the `if(inProcurement) { lockedCount = lockedCount + 1; }` block | That block. A BOQ line already on a PO keeps everything except its **quantity**, which follows the Cost Analysis (decision 7). Tell the Cost Analysis widget team before pasting — the function is theirs. |

Order: apply `Delivery.Recalc_Parent_Delivered` **together with** the new `Widget.purchase_delivery` — the widget function no longer adds the direct-to-site quantity itself, so using only one of the two counts it twice or not at all.

## v1.12 (DS 21) — reporting tag per line

| File | Where | Replace |
|---|---|---|
| `ZohoBooks.Purchase_Order_Creator_books_Sync.division.dg` | Function `ZohoBooks.Purchase_Order_Creator_books_Sync`, inside the line loop | The one line `div_name = ifnull(product.Division,"");`. The Books reporting tag of a PO line is now the line's own **Division** (picked in the widget), then the product's, then the project's (unchanged). |
| `ZohoBooks.Delivery_Challan_Creator_books_Sync.division.dg` | Function `ZohoBooks.Delivery_Challan_Creator_books_Sync`, inside the `for each li` loop | The one line `div_name = ifnull(product.Division,"");`. Same order for delivery note lines. |

Both need the new field `PO_Line_Items.Division` first.

## v1.13 (DS 22) — milestones and work packages

| File | Where | Replace |
|---|---|---|
| `Estimate.Create_Project_Tasks.dg` | Function `Estimate.Create_Project_Tasks` | The whole function. Common milestones' task lists are created once per project (no work package); only the Project Execution milestone's task list (Administration template milestone named "Project Execution" → its Milestone_tasklist and the templates under it) is created once per work package. |

## v1.16.1 (DS 17 Nov) — tasks once per project

| File | Where | Replace |
|---|---|---|
| `Estimate.Create_Project_Tasks.dg` | Function `Estimate.Create_Project_Tasks` | The whole function (built on Bala's Milestone version: Milestone lookup, PM owner fallback). Template tasks are created **once per project**; only the work-package branch (template rows ticked **Associated Work Package** and everything under them) is created once per work package. Before, every task was created once per package, so a project with 2 packages had every task twice. Projects without costing-line packages now get their common tasks too. |
| `Bulk_Update.Remove_Duplicate_Project_Tasks.dg` | New function in the **Bulk_Update** namespace (`string Bulk_Update.Remove_Duplicate_Project_Tasks(int proj_id, bool apply)`) | One-time clean-up for projects created before the fix. Run with `apply = false` first (reports only), then `apply = true`. Deletes only the extra copies of common tasks (same milestone and same path of names) that have no progress, actual dates, notes, files or sub-tasks; keeps the first copy and clears its work package. Work-package tasks are never touched. |
