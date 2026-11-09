# AAV Cut

Panel-cutting optimization web app for furniture makers, built to the plan in [`../docs/giblab-parity-spec.md`](../docs/giblab-parity-spec.md).

- **Milestone 1:** accounts, projects, the editor, sheet cutting and our own optimizer.
- **Milestone 3:** Edit nesting, postprocessors (DXF/CSV/XML/G-code), the XNC CNC editor, the online order module and DXF import.
- **Milestone 4:** optimizer band and variety rules, ZPL labels, print settings, and the Next 16 / Prisma 7 upgrade.
- **Milestone 2:**
  - every operation type except the CNC editor
  - project tools
  - the classic desktop layout: 218 px accordion sidebar, grey tab bars, light-blue selection, colourful icons, orange/violet cutting maps. It uses our own logo, icons and wording.

The product name lives in one place: `src/lib/brand.ts`.

## What's included

| Area | Features |
|---|---|
| Accounts | Register, log in with email **or account ID**, "remember me" (30-day vs. 12-hour session), forgot/reset password by email, change password (signs out other sessions), change email, language (EN / UK / RU), default input mode and currency |
| Projects | Folders with breadcrumbs. Sortable grid (№ · ID · State · Date · Cost · Name). Multi-select, right-click menu, add / add folder / rename / move / copy / delete / set state (Not ordered → Ordered → Approved → Done). Import of exported projects. Keyboard: Enter, F2, F4, Del, Ctrl+A, Ctrl+PgDn, Backspace |
| Editor | Header (name, currency, order/ready dates, notes). Operations and Products tabs. **Undo/redo** (100 steps, typing is merged into one step). Explicit **Save** (Ctrl+S) with optimistic locking. Unsaved-changes guard. Export to file. Cost roll-up per operation, product and project |
| Sheet cutting | Parameters with GibLab's defaults (kerf 4.4, trims 10/10, offcut 400/100, rounding rules, cost by cut length / perimeter / area). **Parts grid**: inline editing, Tab/Enter navigation, paste from Excel, insert/clone/move/delete, column chooser, input modes (finished size minus edgeband), live totals, TC/UQ columns. **Sheets & offcuts grid**: per-sheet trims, stock qty, min-fill for offcuts, "remove unused" |
| Optimizer | Our own guillotine optimizer (`src/domain/optimizer`). Accounts for kerf, trims, grain, maximum rotations and first-cut direction. Runs strip and free-rectangle strategies and keeps the best plan. Repeats identical sheets as patterns. Reports offcuts vs. waste and generates the saw command sequence (T/C/P/W/R). Runs in a Web Worker, so the UI stays responsive. Like GibLab, a new plan is **saved automatically** |
| Cutting view | Scale drawing (parts, sizes, reusable offcuts, waste, cut lines). Pattern paging with S/C/Cp/LT/F stats. Table of commands, thumbnails, comment, "plan is outdated" warning |
| Report | Printable page / PDF: operations summary, parts list, every sheet with its cutting map and command table |
| Catalog of goods | Shared board catalog (seeded, generic names) plus your own materials (CRUD). Picking a material creates an operation or applies it to an existing one |

**Benchmark** (`npm run bench`): on the same 28-part cabinet job, GibLab used **2 sheets at 77.66 %** fill. We match it: 2 sheets, 77.66 %, in about 20 ms. Our cut length includes trimming on all four edges of each sheet. Without trims it's about 32.7 m, against GibLab's 43.2 m.

### Milestone 2 additions

| Area | Features |
|---|---|
| Layout | Sidebar per screen (Projects / Project / Settings / Help) with bottom bars, a Language accordion and the account box. Header form with notes and a red close button. Operations/Products tab bars with toolbars. Caption bar `(CS) Material1 · №1 Product1 (1pcs)`. Two-column parameter forms with green help marks. Public page with the login form in the sidebar; register and forgot password open as dialogs |
| Data model v2 | Parts reference edgeband / groove / surface operations. Older projects are **migrated automatically** (numeric edge thicknesses become edgeband operations, with identical cutting sizes) |
| (EL) Edgebanding | Symbol and colour shown in the ET/EB/EL/ER cells. Thickness and pre-milling feed the cutting size in "finished size" input mode. Waste %, waste per edge, length rounding, material/work cost. Derived parts list. Symbols & colours dialog |
| (GR) Grooving | Width/depth/offset with a dimensioned diagram. GT/GB/GL/GR part columns. Groove length × price |
| (SP) Surface | Front/back part columns. Area by cutting or workpiece size. Waste, material and work cost |
| (O) Accessories | Owner (project or product, multiplied by its quantity). Materials list with add / catalog / paste / reorder. Cost × quantity |
| (CL) Band cutting | Its own 1-D optimizer (subset-sum + best/first-fit, kerf, trims, offcuts). Bands grid. Bar drawings. Costs by cut length (with/without trims), parts or material length |
| (CN) Nesting | Same as sheet cutting, but the mill diameter + allowance is the cut width. Main/pre-cut mill parameters |
| (LB) Labels | A4 grid or label printer (page size = label). Parts/offcuts, per piece. Field template with preview. **Code 128 barcodes** |
| Project tools | General actions (combine same material, divide edging by material, optimize all operations). **Imports from Excel** (.xlsx/.csv, automatic column mapping in EN/UK/RU, edge columns accept a symbol or a thickness). Import project into project. Ordered (+ Order ID / cost summary). Print this operation. Product properties |
| Settings | Dialogs per item (password, email, input modes, preferences). Catalog of goods. "Save the data to a local disk" (full JSON backup via `/api/export`) |

### Milestone 3 additions

| Area | Features |
|---|---|
| Edit nesting | Manual editing of a sheet layout. Take parts off a sheet, place them into any free area (with rotation unless the grain is fixed), add empty sheets, undo. Every edit runs on the cut tree, so the layout stays guillotine-cuttable and the saw command table is rebuilt. A repeated sheet is split off before editing. The cut tree is saved with the result |
| Postprocessors | DXF (all sheets, with layers for parts, offcuts, cuts and trim), CSV cutting list (formula-injection safe), XML saw sequence, ISO G-code nesting for CN (outside contour with tool radius, small parts first, optional pre-cut pass), band CSV. Settings: file prefix and G-code defaults (spindle, feeds, safe Z, tool, decimals). Vendor saw formats are listed: each needs its vendor specification or sample files |
| (XNC) CNC processing | Linked to a part (finished or cutting size, quantity = TC) or sized by hand. Graphical editor per face (front, back, 4 edges): holes, grooves, pockets, mill paths, with click-to-place, numeric properties and mirroring. Checks against the machine limits from Settings → XNC editor. DXF import (circles become holes, lines become grooves, rectangles become pockets, depth from the layer name such as `DRILL_Z12`) and DXF export. G-code with drilling cycles, tool changes from the tool table, pocket clearing, back face and edge holes. Cost per hole, pocket and metre |
| Order module | Settings → Module orders (enable, manufacturer name, welcome text, edges allowed, mail alert). Public page `/order/<account ID>`: customers enter contacts and parts (material from your catalog, sizes, grain, edges). The order arrives as a project in folder "Orders" with state Ordered and the customer's contacts, and you get an email. Validated, rate-limited (5/hour/IP), with a honeypot field |
| Import from other programs | DXF parts import: closed rectangles become parts, the layer is the name, identical sizes are counted together |

### Milestone 4 additions

| Area | Features |
|---|---|
| Optimizer rules | **Max varieties of parts per sheet** is enforced. **Band (strip) limits:** min/max band width and max band length; when set, only strip layouts are produced. **Sort bands / Sort inside bands:** descending, ascending, narrow in the centre, none |
| Packages | Sheets per package = package height ÷ thickness. The number of packages per pattern is shown on the cutting screen (`P: packages × sheets`) and written to the XML saw export |
| Labels | **ZPL II output** for label printers: 203/300/600 dpi, label size, Code 128 barcodes, and a custom ZPL header added to every label (control characters are filtered out) |
| Print report | Print settings dialog: choose sections (summary, parts lists, cutting maps, command tables, offcuts, other operations), page margin and orientation. Remembered per browser |
| Platform | **Next.js 16** (`proxy.ts`, ESLint CLI with the React Compiler lint rules), React 19.2, **Prisma 7** (`prisma.config.ts`, generated client in `src/generated`, PostgreSQL driver adapter). Production dependencies: `npm audit --omit=dev` reports **0 vulnerabilities** |

### Needs your input

- **Vendor saw/CNC file formats** (HOLZMA PTX, CadMatic, SCM, Biesse, KDT…): the machine model plus its format specification or sample files.
- **PRO100, WOODY and Bazis import:** sample files exported from those programs.

## Run it locally

Requirements: Node 20.11+ (tested on 22 and 26) and Docker.

```bash
cp .env.example .env          # adjust if needed
npm install
npm run db:up                 # Postgres 16 on localhost:5433
npx prisma migrate deploy   # npm install already ran `prisma generate` (client in src/generated)
npm run db:seed               # shared catalog of goods
npm run dev                   # http://localhost:3100
```

Without `SMTP_URL`, password-reset emails are printed to the server log in development.

## Checks

```bash
npm run typecheck   # TypeScript strict
npm run lint        # ESLint CLI (next core-web-vitals + typescript + React Compiler rules)
npm test            # unit tests: optimizer + calculations (Vitest)
npm run build
npm run test:e2e    # browser tests (Playwright); starts `npm run start` if nothing is running.
                    # Resets local rate-limit counters first (local databases only).
npm run bench       # optimizer vs. the GibLab reference job
```

CI (`../.github/workflows/ci.yml`) runs all of these against a Postgres service.

## Deploy

```bash
docker compose --profile full up --build     # app + Postgres on http://localhost:3100
```

The image runs `prisma migrate deploy` on start, as a non-root user, and serves `GET /api/health` (it checks the database). In production, set:
- `DATABASE_URL`
- `APP_URL` (public URL, used in emails)
- `SMTP_URL` and `MAIL_FROM` (required: reset emails fail without SMTP)

Put the app behind HTTPS. Session cookies are `Secure` when `NODE_ENV=production`.

## Architecture

```
src/
  domain/            pure TypeScript, no framework: unit-tested
    optimizer/       guillotine packer (free-rectangle + strip), multi-sheet planner, saw commands
    project.ts       project document schema (zod) + defaults
    calc.ts          cutting sizes, TC, material/sheet rounding, costs, paste parsing
  app/
    (auth)/          login, register, forgot, reset
    (app)/           projects, editor, print report, settings, catalog, help
    actions/         server actions: every input validated with zod, every query scoped to the user
    api/health       health check
  components/
    editor/          editor store (zustand, undo/redo), grids (AG Grid), cutting view
    CuttingMap.tsx   SVG drawing shared by screen and report
  lib/               db, auth (sessions, bcrypt, rate limit), mail, i18n (EN/UK/RU, type-checked)
  workers/           optimizer Web Worker
prisma/              schema, migrations, seed
e2e/                 Playwright tests
```

**Data model.**
- Users, sessions, folders, projects and materials are relational tables.
- A project's content (products, operations, parts, sheets, cutting results) is one validated JSON document. The editor loads it, edits it locally with undo/redo, and saves it as a whole. A `version` column rejects saves that would overwrite changes made in another window.

**Security.**
- Passwords: bcrypt (cost 12).
- Sessions and reset tokens: random 256-bit tokens. Only their SHA-256 hashes are stored.
- Cookies: `httpOnly` + `SameSite=Lax`.
- Rate limits, stored in Postgres: login, registration, password reset and password/email changes.
- No account enumeration: same response and similar timing whether or not an account exists.
- Authorization: every query is filtered by the signed-in user. Another user's project returns 404.
- Security headers: frame denial, nosniff, referrer and permissions policy.
- Server actions get Next.js's built-in same-origin check.
