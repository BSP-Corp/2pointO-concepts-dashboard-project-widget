# 2point0 Project Console — Widget Overview

The Project Console is one Zoho Creator widget used on three pages: **Home**, **Project Widget** and **Procurement Schedule**. All data is read and saved through Creator custom functions, and every change is recorded in the Activity Stream. The widget opens in Light theme, and users can switch to Dark theme from the top right.

## Home — Project Search Dashboard

The Home page helps users find a project and see how all projects are performing, on one screen without scrolling.

- **Search** finds any estimate by reference and opens its Cost Analysis; **Go To** lists approved projects and opens the selected one.
- **Overview** shows completion, project health, the lifecycle pipeline, milestones, project team & core data, and risks.
- **Timelines, Trends, Pivot and Projects** views show the Gantt, monthly task trends, cost vs quote, issues, project types, employees, the pivot table and project cards.

## Project Widget

The Project Widget shows everything about one project in a single window.

- **Header** shows the project facts and a compact status stepper with progress; the next stage is one click, other moves are under More.
- **Overview** shows priority tasks, deliveries, today's plan, open risks, the next milestone and the team.
- **Milestones** follow the Zoho Projects layout: Milestone → Task List → Task → Subtask.
- **Execution** shows each work package with its lines (BOQ and procurement read-only, execution and asset details editable) and its tasks.
- **Procurement** shows the procurement results read-only and opens the Procurement module.
- **Risks** has the register (with an inline add row) and the dashboard; score and severity are calculated.
- **Asset Register** lists every asset with serial, warranty and network details; **Activity** shows who changed what and when.

Users edit values directly in the lists: click a value, change it, and press Enter or click away to save it to Creator.

## Procurement Schedule

The Procurement Schedule is the working module for purchasing, one row per BOQ item.

- **Frozen core columns** and five sections (Purchasing, Transit, Receiving, Payments, Packages) with bookmarks that scroll sideways and a Columns menu.
- **Create purchase order** opens a panel from the left: tick lines of one vendor, raise a new PO or add to an existing one. The PO is created in Zoho Creator first, then sent to Zoho Books.
- **Receive goods** records a Purchase Receive with the warehouse location; **delivery notes** are created from received stock and marked delivered.
- Stock changes only through goods receipt, never by changing a status or a date.

## Not Yet Available

- PO payment tracking (payments are in Zoho Books)
- Serial numbers per received unit (PO_Line_Items has no serial field)
- Change orders and generated PDF documents
