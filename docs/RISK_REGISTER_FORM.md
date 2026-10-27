> **Obsolete (v0.7):** the app now has the `Project_Risk` form. The widget reads and writes it through `Widget.project_console` (action `risks`) and `Widget.project_risk_save`. Do **not** create the `Risk_Register` form below. It is kept only for reference.

# Risk Register — new Creator form (required for the Risks tab)

`2Point0concepts.ds` has no form for risks. The Project Console reads one form and one report, defined below. Their fields mirror the **Risk Register** sheet of *4b. Project Management Dashboard.xlsx*, and their picklist values come from its **Risk Escalation Matrix** sheet.

Until this form exists, the Risks tab and the overview's risk tiles show *"The Risk Register is not set up in Creator yet"*. Everything else keeps working.

## 1. Form `Risk_Register` (display name "Risk Register")

Create the fields in this order. The **link names must match exactly** because the widget reads them (`src/config/zoho.ts → FIELDS.risk`).

| # | Field link name | Display name | Type | Values / settings |
|---|---|---|---|---|
| 1 | `Project` | Project | Lookup → **Project** (single) | display field `Project_Reference`; mandatory |
| 2 | `Risk_No` | Risk ID | Auto Number | prefix `R - ` if your Creator version offers prefixes (otherwise the widget prints `R - n`) |
| 3 | `Risk_Description` | Risk Description | Single Line | mandatory |
| 4 | `Category_Department` | Category / Department | Drop Down | `2point0 Management`, `2point0 Projects Team`, `2point0 Sales`, `2point0 Finance`, `Client`, `2point0 Sub Contractor`, `Main Contractor`, `Client IT Department`, `Logistics`, `Procurement` |
| 5 | `Cause` | Cause | Multi Line | |
| 6 | `Consequence` | Consequence | Multi Line | |
| 7 | `Probability` | Probability | Drop Down | `Very High`, `High`, `Medium`, `Low`, `Very Low` |
| 8 | `Impact` | Impact | Drop Down | `Severe`, `Significant`, `Moderate`, `Minor`, `Negligible` |
| 9 | `Risk_Severity` | Risk Severity | Single Line | filled by the workflow below (read-only for users) |
| 10 | `Risk_Score` | Risk Score (Probability x Impact) | Number | filled by the workflow below (1–25, read-only for users) |
| 11 | `Risk_Owner` | Risk Owner | Lookup → **Users** (single) | display field `Name` |
| 12 | `Risk_Response_Strategy` | Risk Response Strategy | Drop Down | `Avoid`, `Accept`, `Mitigate`, `Transfer`, `Escalate` |
| 13 | `Due_Date` | Due Date | Date | |
| 14 | `Priority` | Priority | Drop Down | `High`, `Medium`, `Low` |
| 15 | `Status` | Status | Drop Down | `Not Started`, `In-Progress`, `Complete` |
| 16 | `Risk_Response_Action` | Risk Response (Action) | Multi Line | |

Notes:
- The workbook's **Risk Owner** list (Pankaj, Prashant, Rafaqat…) is a lookup to the existing **Users** form, so owners stay in one place.
- The widget treats `Status = Complete` as closed, exactly like the workbook's dashboard ("Active" = not Complete; "Overdue" = due date before today and not Complete).

## 2. Report `All_Risks`

A list report on `Risk_Register` with the link name **`All_Risks`**. It must show **all 16 fields above as columns**, because the widget API only returns report columns. No filter is needed: the widget reads one project at a time with `Project == <ID>`.

Give the users of the console widget access to this report, the same as the other reports.

## 3. Workflow — score and severity

The scoring is the workbook's matrix:
- **Score** = probability score × impact score, each from 5 down to 1.
- **Severity** = the cell at the probability row and impact column of the *Risk Assessment Matrix*.

**Location:** Workflow → Form Workflows → New.
- Form: `Risk_Register`
- Run when: a record is **Created or Edited**
- Event: **Successful form submission**
- Name: `Risk_Score_Severity`

**Action:** Deluge script

```deluge
probabilityScore = {"Very High":5,"High":4,"Medium":3,"Low":2,"Very Low":1};
impactScore = {"Severe":5,"Significant":4,"Moderate":3,"Minor":2,"Negligible":1};
// Risk Escalation Matrix: rows = probability, columns = impact
matrix = Map();
matrix.put("Very High",{"Negligible":"Medium","Minor":"High","Moderate":"High","Significant":"Critical","Severe":"Critical"});
matrix.put("High",{"Negligible":"Low","Minor":"Medium","Moderate":"High","Significant":"Critical","Severe":"Critical"});
matrix.put("Medium",{"Negligible":"Low","Minor":"Medium","Moderate":"Medium","Significant":"High","Severe":"Critical"});
matrix.put("Low",{"Negligible":"Very Low","Minor":"Low","Moderate":"Medium","Significant":"High","Severe":"High"});
matrix.put("Very Low",{"Negligible":"Very Low","Minor":"Low","Moderate":"Low","Significant":"Medium","Severe":"High"});
probability = ifnull(input.Probability,"");
impact = ifnull(input.Impact,"");
if(probabilityScore.containKey(probability) && impactScore.containKey(impact))
{
	input.Risk_Score = probabilityScore.get(probability) * impactScore.get(impact);
	input.Risk_Severity = matrix.get(probability).get(impact);
}
else
{
	input.Risk_Score = null;
	input.Risk_Severity = "";
}
```

If a record has no stored score or severity (for example, rows imported before this workflow existed), the widget computes both the same way. You don't need to backfill old rows.

## 4. Optional

- **Show risks on the Project form.** Add a grid (subform) of `Risk_Register` named "Risk Register" to the Project form, using the `Project` lookup as the link. The console doesn't need it.
- **Import the workbook rows.** In `All_Risks`, use Import with the Risk Register sheet, then set the `Project` column for each row (e.g. `PR_26040`).
