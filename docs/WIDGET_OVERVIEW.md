# 2point0 Project Console — Widget Overview

The Project Console is one Zoho Creator widget used on three pages: **Home**, **Project Widget** and **Procurement Schedule**. All data is read and saved through Creator custom functions, and every change is recorded in the Activity Stream. The widget opens in Light theme, and users can switch to Dark theme from the top right.

## Home — Project Search Dashboard

The Home page helps users find a project and see how all projects are performing.

- **Search by reference** finds any estimate and opens its Cost Analysis.
- **Go To** lists approved projects and opens the selected one.
- **Dashboard charts** show task and delivery completion, project health, project type, lifecycle stage, project timelines (Gantt), monthly task trends, cost vs quote and open issues.
- **Pivot table** lets users analyse projects by manager, type, stage, client or health.

## Project Widget

The Project Widget shows everything about one project in a single place.

- **Header** shows the project details, stage, health, dates, customer and contract value.
- **Status pipeline** moves the project through 14 fixed stages and keeps a full status history.
- **Overview** summarises progress, deliveries, today's tasks, open risks and the next milestone.
- **Procurement** lists the BOQ items and purchase orders, and allows creating a PO.
- **Asset Register** shows work packages and asset lines, where the team updates execution, serial, warranty and network details.
- **Milestones** and **Tasks** follow the Zoho Projects layout: Milestone → Task List → Task → Subtask.
- **Risk Register** and **Risk Dashboard** manage project risks, with score and severity calculated automatically.
- **Activity** shows who changed what and when.

Users can edit values directly in the lists: click a value, change it, and press Enter to save it to Creator.

## Procurement Schedule

The Procurement Schedule shows one row per BOQ item, from purchasing to delivery, on a compact page.

- **Tabs** filter items into To order, In progress and Received.
- **Item popup** shows full details and lets users update PO date, status, transit mode and ETA.
- **Create purchase order** raises one PO per vendor from the selected items, with partial quantities allowed.
- The PO is **created in Zoho Creator first**, then **sent to Zoho Books**, and the PO number and status are written back to each item.
- Stock changes only through goods receipt, never by changing a status or a date.

## Not Yet Available

These items need new forms or fields in Creator before they can be added:

- Delivery notes
- PO payment tracking (currently in Zoho Books)
- Change orders and generated PDF documents
