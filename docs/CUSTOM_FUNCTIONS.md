# Custom functions used by the widget

The widget never reads or writes records directly. Each operation calls one Deluge function through its Custom API. All functions live in namespace **`Widget`**, return **`map`**, and take one argument **`quo_data` (string)**.

| Function | Custom API (link name) | Method | Status (v0.8) | Used for |
|---|---|---|---|---|
| `status_order` | — | — | unchanged | Static status orders (called by `project_details`, `project_update`) |
| `activity_values` | — | — | **new (v0.9: + Asset)** | Snapshot of a record's tracked fields (before / after a save) |
| `activity_add` | — | — | **new** (returns int) | Writes changed fields to `Activity_Stream` |
| `project_console` | `Widget_Project_Console` | GET | **update** | Reads, incl. **activity**; tasks now return Duration / Task No / Added_User; BOQ vendor as a lookup |
| `project_options` | `Widget_Project_Options` | GET | **update (v1.0)** | Dropdowns, + **taskListTemplates** (task lists of the Task Administrator template) |
| `project_update` | `Widget_Project_Update` | PUT | **update** | Edit Project / status moves; **logs changes** |
| `project_details` | `Widget_Project_Details` | GET | **update (v1.0)** | Header, team, stages. **Edit permission:** admin, Users.Role Administrator / Management / Project Manager, the project's PM, or a Project Team member. The login email is matched to Users.Email ignoring case. Returns `edit_reason` when access is view-only |
| `project_dashboard` | `Widget_Project_Dashboard` | GET | **update (v0.9)** | Home charts: milestones (Milestone form), tasks, overdue, risks, **stage_order, quote (Estimate_Value_Sub_Total), tasks due / done per month** |
| `project_task_update` | `Widget_Project_Task_Update` | PUT | **update (v1.0: milestone Task_List)** | List edits: tasks, milestones, BOQ (vendor, PO#, transit…), **asset lines: Project Execution + Asset & Network fields**; logs changes |
| `project_create_po` | `Widget_Project_Create_PO` | POST | **update (v1.1)** | Procurement page "Create purchase order".<br>1. Creates the PO in Creator: Project_reference, Sales_Reference, PO_Status, Warehouse (ship-to), terms days, and each line's Estimate_Line_ID.<br>2. Checks that the PO and every line exist.<br>3. Only then runs `ZohoBooks.Purchase_Order_Creator_books_Sync`.<br>4. Reads back the Books ID and returns `Books_Synced` / `Books_Message`.<br>5. Writes PO#, PO date and the "Ordered" status to the BOQ lines. |
| `project_risk_save` | `Widget_Project_Risk_Save` | POST | **update** | Create / edit Project_Risk; **logs changes** |
| `get_cost_analysis` | `Widget_Get_Cost_analysis` | GET | existing | (Cost Analysis widget) |

Code: [`creator/`](creator/), one `.dg` file per function.

**Custom API settings** (same as the three you already created):
- Authentication **OAuth2**
- User scope **All users**
- Parameter **`quo_data`**
- Method as in the table. For PUT / POST, the argument type is **Key and Value**.

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
python3 scripts/check-deluge.py "<path>/2Point0concepts (8).ds" docs/creator
```
