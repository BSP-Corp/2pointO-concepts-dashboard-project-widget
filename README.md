# 2point0 Concepts – Project Console

A standalone project console widget for Zoho Creator (General + Project widget).
- **All projects:** a portfolio overview.
- **One project:** a consolidated overview, plus Cost, BOQ, Procurement, Assets, Deployment and Risk tabs, a full-screen edit form, and a link to the Cost Analysis widget.

Stack: React 18, TypeScript, Vite 6, Tailwind 3 (base reset only), TanStack Query 5, and Vitest with Testing Library. No chart library: the charts are small SVG/HTML components.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (demo data, live reload)
npm test           # unit + page tests
npm run build      # typecheck → build into app/ → zet pack → dist/2point0-pm.zip
npm run preview    # serves the built widget: http://localhost:4173/widget.html
```

Requires Node 20 or newer.

## What it does

The widget is **standalone**. It reads no URL parameter or record ID from its page. The user picks a project in the widget, and the selection (project + tab) is remembered in the widget's own storage. When the user comes back from the Cost Analysis page, the same project and tab reopen.

| View | Data | Contents |
|---|---|---|
| **All projects** (default) | `All_Projects` only | Projects / PO value / budget / margin tiles; projects by status and by type (pie); value vs budget per project (bar); project table (click to open) |
| **Overview** | Cost Analysis API, `Costing_Lineitem_Report`, `BOQ_Report`, `All_Purchase_Orders`, `All_Risks` | Consolidated tiles (value, estimated cost + margin, committed POs, BOQ delivered, assets, warranty, active risks) plus cost-vs-price, budget split, BOQ status, installation status and risk severity charts. Each block loads on its own. |
| **Cost** | Custom API `Widget_Get_Cost_analysis` (existing `Widget.get_cost_analysis`) on the project's Accepted Estimate, `All_Summaries`, POs | Budget, cost, price, margin, committed, remaining; category table; Project Budget Review; payment terms; quotation readiness |
| **BOQ** | `BOQ_Report` | Delivery % from `Delivered_to_2_0_Warehouse` / `Delivered_to_Customer`; ETA overdue; status pie; BOQ table |
| **Procurement** | `All_Purchase_Orders` (by the BOQ's `PO#`), `All_Po_Line_Items` | PO value by vendor; POs with line items and received quantities |
| **Assets** | `Costing_Lineitem_Report` (Asset & Network Details) | Serial / MAC / IP / VLAN / warranty register grouped by work package; filters for networked, software/licences, warranty |
| **Deployment** | `Costing_Lineitem_Report` | Per work package: delivery and installation status distribution, cost, price |
| **Risks** | `All_Risks` (**new form**, see `docs/RISK_REGISTER_FORM.md`) | Total / active / overdue / completed / average score, 5×5 risk matrix, status, category and owner charts, register |
| **Edit project** | `All_Projects` record + lookup reports | Full-screen form with every Project field from the .ds (same sections and columns). Saves **only the changed fields**. Grids, files and signatures are shown read-only. |

**Loading.**
- Only the open tab is mounted, so a tab's records are read the first time it opens.
- Every query is keyed by project ID (or estimate ID), so tabs share one cache and switching tabs never fetches twice.
- `ProjectView` is keyed by project, so a project switch never shows another project's data.
- Option lists for the edit form are read only when the form opens.

**How records link to a project** (from the .ds). `Widget.sync_boq` and `Widget.createupdateestimate` create BOQ and cost lines **without** the `Project` lookup, so child reports are read with:
- Cost lines: `Project == <id> || Cost_Analysis == <Accepted_Estimate>`
- BOQ: `Project == <id> || Estimate1 == <Accepted_Estimate> || Project_Reference == "<reference>"`
- Payment milestones / budget review: `Project == <id> || Estimate == <Accepted_Estimate>`
- Purchase orders: `PO_No` in the BOQ lines' `PO` values; PO lines by `Purchase_Order`

**Theme.** Blue/white with a light/dark switch in the header. It defaults to the OS setting and remembers the user's choice. Motion is switched off under `prefers-reduced-motion`.

## Zoho Creator names

All link names live in `src/config/zoho.ts` (reports, fields, Custom API, Cost Analysis page) and `src/config/projectForm.ts` (the Project form layout used by the edit form). Every name comes from `2Point0concepts.ds`. The one exception is the Risk Register, which must be created first: see `docs/RISK_REGISTER_FORM.md`.

The widget calls the SDK the same way as the Cost Analysis widget: `getRecords` with `field_config: 'all'` and `record_cursor` paging, `getRecordById`, `updateRecords` with the criteria inside the payload, `invokeCustomApi` (GET, `quo_data`), and `navigateParentUrl`.

## Go to Cost Analysis / Back

- **Go to Cost Analysis** opens `#Page:Cost_Analysis_Page?quo_id=<Accepted Estimate ID>&act_ion=project` in the same window. The button is disabled when the project has no Accepted Estimate.
- The Cost Analysis widget shows a **Back** button only when `act_ion = project`. Back opens the page set in its `src/config/constants.js → PROJECT_CONSOLE_PAGE`.
- On return, this widget restores the project and tab itself.

## Data sources

`src/lib/data/` defines one `DataSource` interface with two implementations:
- **zoho** (`zohoSource.ts`) uses the Widget SDK v2.
- **mock** (`mockSource.ts`) holds Creator-shaped demo records (`seed.ts`) built from project PR_26040 in *4b. Project Management Dashboard.xlsx*, and runs them through the same mappers. Edits are kept in localStorage; to reset, run `localStorage.removeItem('2point0-pm:mockdb:v3')`.

`VITE_DATA_SOURCE=auto` (the default) uses Zoho only inside Creator. See `.env.example`.

## Build and package (same structure as the Cost Analysis widget)

`npm run build` runs every step:
1. typecheck
2. Vite build into **`app/`**: `app/widget.html`, one classic deferred script `app/js/widget.js`, and `app/css/widget.css`. The paths are relative; there is no ES module.
3. `scripts/package-widget.mjs`: deletes `.DS_Store`, clears `dist/`, then runs **`zet pack`**. That writes **`dist/2point0-pm.zip`**, containing `plugin-manifest.json` and `app/`.

If `zet` is missing (`npm install -g zoho-extension-toolkit`), the script writes the same zip with `zip` instead.

To upload: Creator → Settings → Widgets → (edit) → upload `dist/2point0-pm.zip` → index file **`/app/widget.html`**.

The root `index.html` is the development entry (`npm run dev`). The build renames it to `app/widget.html`. It loads the Creator Widget SDK v2 from `static.zohocdn.com`, the same URL the Cost Analysis widget uses.

## Project layout

```
plugin-manifest.json           Creator widget manifest (packed with app/)
app/                           build output = what zet packs (generated)
dist/2point0-pm.zip            upload this in Creator (generated)
scripts/package-widget.mjs     zet pack step of npm run build
docs/RISK_REGISTER_FORM.md     optional Risk_Register form, report and workflow
src/
  config/zoho.ts               Creator link names (reports, fields, Custom API, pages)
  config/projectForm.ts        Project form sections/fields for the edit form
  types/domain.ts              Project, CostingLine, BoqLine, PurchaseOrder, Risk, CostAnalysis…
  lib/data/                    DataSource interface, Zoho SDK + mock sources, seed data
  lib/query-keys.ts            query keys (per project / per estimate)
  lib/theme.ts                 light/dark switch
  features/cost/               cost roll-ups (calc) + cost-line / Cost Analysis hooks
  features/projects/           project, BOQ, PO, milestone, budget-review, option hooks
  features/risk/               risk matrix / dashboard (calc) + hook
  features/console/            the widget UI
    ConsoleApp.tsx             shell; selected project + tab (remembered)
    CommandBar.tsx             header: project selector, theme switch
    PortfolioDashboard.tsx     all projects
    ProjectView.tsx            project header, actions, tabs (lazy)
    EditProjectForm.tsx        full-screen edit form
    tabs/                      Overview, Cost, BOQ, Procurement, Assets, Deployment, Risks
    model.ts                   pure roll-ups (assets, BOQ, procurement, work packages, portfolio)
    charts.tsx  ui.tsx         donut / bar / stacked bar; panels, KPI tiles, chips…
    console.css                theme tokens (light + dark) and layout
```
