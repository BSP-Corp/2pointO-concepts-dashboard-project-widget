# Kick-Off Done form — Creator set-up

The Project Edit / Kick-Off Done form in the widget follows **3. Project Registration Form_V1 (PDF)**. Checked against
**2Point0concepts 18.ds** (17 Nov 2026).

Use the link names exactly as written — the widget and the Deluge functions use these names.
Work in the **development** environment (the widget sends `environment: development`).

## A. Already in DS 18 — only data / report set-up needed

### A1. Project Registration Task List (the checklist)

The Project form already has `Project_Registration_Task_List` (multi-select lookup → form **Project_Registration_Task_List**).
The widget shows every **Active** record of that form as a check card; **all of them must be ticked before Kick-Off Done**.

1. Open the **Project Registration Task List** form (report `All_Project_Registration_Task_Lists`).
2. Add one record per line below, in this order (the widget lists them by Added Time), **Status = Active**:

```
Assign PR#: Ensure project has PR# in CRM, used for files/folders.
GDrive: Verify Google Drive created, accessible for project.
PO Check: Sales/PM review PO to align financials, goals.
Scope: Sales/SA explain scope; PM confirms details, accepts.
BOQ: Check Bill of Quantities for accuracy, goal alignment.
Contract: Examine contract terms, ensure stakeholder agreement.
Timelines: Validate project schedule, deadlines with team.
Key Dates: Confirm critical dates, milestones documented, agreed.
Financials: Assess budget, costs, financial alignment with goals.
Assumptions: Document, confirm assumptions, dependencies, constraints.
Exclusions: Clarify, agree on items excluded from project scope.
Comms: Establish communication protocols, channels for project.
Doc Mgmt: Ensure processes, people for managing docs in place.
Travel: Assess, plan travel needs for project team.
Change Mgmt: Define procedures for handling change orders.
Success: Agree on metrics, goals for project success.
SHEQ: Confirm compliance with Safety, Health, Env, Quality standards.
Team: Officially assign team members to responsibilities.
Risks: Identify, assess, document potential project risks.
Escalation: Draft, review escalation matrix with team for issues.
```

3. Remove (or set **Inactive**) any old records that are not checklist items (e.g. milestone names such as “1 | Payment Terms”).
   Inactive items are not shown and not required.

### A2. Signatures

`Sales_Signature`, `Project_manager_Signature` and `Health_Safety_Manager_Signature` exist (type Signature). The widget now
has a **Sign here** pad: the drawing is uploaded as a PNG into the Signature field with Creator's upload API (v2.1 accepts
Signature fields). For this to work:

1. **Reports → All_Projects → Edit → Columns**: make sure the three signature fields are in the report (the upload API only
   writes fields that are in the report).
2. Test once in development: sign in the widget, then open the record in Creator. If Creator refuses the upload, the widget
   shows Creator's message under the pad — send it to the developer (fallback: an **Image** field per signature).

## B. Four fields — on the **Project** form (IDE format)

In **2Point0concepts.ds** (17 Nov) these four fields were added to the **Project_Registration_Task_List** form. That form
holds the checklist *items*, so there they would belong to each item, not to the project.

1. Remove `Registration_Notes`, `Warranty_Document`, `Shop_Drawings_Status`, `Solution_Architect_Signature` (and the
   sections `Section2` "Warranty_Items_Review" and `Shop_Drawings`) from `form Project_Registration_Task_List`, and their
   columns from its reports.
2. In the IDE open `form Project`, find the field block `Project_Registration_Task_List ( … )` (Section2, row 15) and paste
   this right after its closing `)`:

```
			Registration_Notes
			(
    			type = textarea
				displayname = "Registration Notes"
				height = 100px
    			description
    			[
    				type = help_text
    			 	message = "Please take notes."
    			]
	 			row = 15
	 			column = 1   
				width = medium
			)
			Warranty_Document
			(
    			type = upload file
				displayname = "Please Upload BOQ & Warranty Items"
				browse = local_drive
	 			row = 15
	 			column = 1   
				width = medium
			)
			Shop_Drawings_Status
			(
				type = picklist
				displayname = "Shop Drawings Status"
				maxchar = 100
				values = {"Pending","In Progress","Submitted","Approved"}
	 			row = 15
	 			column = 2   
				width = medium
			)
			Solution_Architect_Signature
			(
    			type = signature
				displayname = "Solution Architect Signature"
	 			row = 15
	 			column = 2   
				width = medium
				personal data = true
			)
```

3. **Reports → All_Projects**: add the four fields as columns (the API only reads / uploads fields in the report).

They sit in Section2 (row 15) so no other row number changes; the widget shows them in their own sections
(Warranty & Extended Warranty Review, Shop Drawings, Project Registration Task List).

## C. After the fields exist

Already wired (v1.16.1): `Widget.project_console` reads them, `Widget.project_update` saves Registration Notes and Shop
Drawings Status and requires Shop Drawings Status for Kick-Off Done; the widget uploads `Warranty_Document` and signs
`Solution_Architect_Signature`. **Re-save those two functions only after step B** — before it Creator refuses them.
