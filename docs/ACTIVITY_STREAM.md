# Activity Stream — set-up in Creator

The widget shows who changed what and when for Projects, Milestones, Tasks, Procurement (BOQ) lines and Risks. The history is stored in a new form, **Activity Stream**. Every save made through the widget is logged by the Deluge functions.

## 1. Create the form (do this first)

Form display name **Activity Stream**, link name **`Activity_Stream`**. Create these fields with these exact link names:

| # | Field label | Link name | Field type | Settings |
|---|---|---|---|---|
| 1 | Project | `Project` | Lookup → **Project** (single) | Display field `Project_Reference` |
| 2 | Module | `Module` | Drop Down | `Project`, `Milestone`, `Task`, `BOQ`, `Risk`, `Asset` |
| 3 | Record ID | `Record_ID` | Single Line | |
| 4 | Record Name | `Record_Name` | Single Line | |
| 5 | Action | `Action` | Single Line | `created` / `updated` |
| 6 | Field Name | `Field_Name` | Single Line | e.g. "Start date" |
| 7 | Old Value | `Old_Value` | Multi Line | |
| 8 | New Value | `New_Value` | Multi Line | |
| 9 | Changed By | `Changed_By` | Single Line | User name (Users.Name, else the login user) |
| 10 | Changed On | `Changed_On` | Date-Time | |

No report is needed. The widget reads the form through `Widget.project_console` (action `activity`).

Functions that use `Activity_Stream` cannot be saved until this form exists. Create the form first.

## 2. Functions (namespace `Widget`)

| Function | What to do |
|---|---|
| `activity_values` | **Create** (`docs/creator/Widget.activity_values.dg`). No Custom API |
| `activity_add` | **Create** (`docs/creator/Widget.activity_add.dg`). No Custom API. Return type **int** |
| `project_console`, `project_task_update`, `project_update`, `project_risk_save` | **Paste the new code** and save. Then re-save their Custom APIs |

## 3. Optional: also log changes made directly in Creator forms

Updates made by the widget's functions do not trigger form workflows, so nothing is logged twice. To also log edits made in the Creator forms, add a workflow on each form: **Created or Edited → Edited → On Success**. Each snippet logs the fields it lists, using Creator's `old.<field>`. Test each workflow once after adding it.

**Task**
```
before = Map();
before.put("Task name",ifnull(old.Task_Name,""));
before.put("Start date",ifnull(old.Task_Start_Date,"").toString());
before.put("Due date",ifnull(old.Task_End_Date,"").toString());
before.put("Duration",ifnull(old.Duration,"").toString());
before.put("Priority",ifnull(old.Priority,""));
before.put("Completion %",ifnull(old.Precent_Complete,"").toString());
oldStatus = "";
if(old.Task_Status != null)
{
	oldStatus = ifnull(Status[ID == old.Task_Status].Status_Name,"");
}
before.put("Status",oldStatus);
thisapp.Widget.activity_add(input.Project_Name.toString(),"Task",input.ID.toString(),ifnull(input.Task_Name,""),before,thisapp.Widget.activity_values("Task",input.ID.toString()));
```

**Milestone**
```
before = Map();
before.put("Starts after",ifnull(old.Starts_after,"").toString() + " " + ifnull(old.Starts_After_In,""));
before.put("Duration",ifnull(old.Duration,"").toString());
before.put("Flag",ifnull(old.Flag,""));
oldStatus = "";
if(old.Status != null)
{
	oldStatus = ifnull(Status[ID == old.Status].Status_Name,"");
}
before.put("Status",oldStatus);
thisapp.Widget.activity_add(input.Project.toString(),"Milestone",input.ID.toString(),ifnull(input.Milestone_Name,""),before,thisapp.Widget.activity_values("Milestone",input.ID.toString()));
```

**Project**
```
before = Map();
before.put("Project name",ifnull(old.Project_Name,""));
before.put("Start date",ifnull(old.Start_Date,"").toString());
before.put("Completion date",ifnull(old.Project_Completion_Date,"").toString());
before.put("Project value (PO)",ifnull(old.Project_Value_PO,"").toString());
thisapp.Widget.activity_add(input.ID.toString(),"Project",input.ID.toString(),ifnull(input.Project_Reference,""),before,thisapp.Widget.activity_values("Project",input.ID.toString()));
```

## What is logged

| Module | Fields |
|---|---|
| Project | name, reference, type, start / completion / actual completion date, value (PO), client PO #, city, state, description, status, client, project manager |
| Milestone | name, starts after, duration, flag, status, owner |
| Task | name, description, start / due date, duration, actual start / complete date, priority, completion %, work hours, billing type, status, parent task, owners |
| BOQ | PO date, ETA, PO#, mode of transit, warehouse / customer delivery and dates, status, vendor |
| Asset | notes, serial, MACs, warranty dates, provision, outlet, networked, switch, port, PoE, VLAN, IP, subnet, host, gateway, DNS, delivery / installation status |
| Risk | created; then risk ID, description, probability, impact, score, severity, priority, status, owner, department |
