# مخزن تكنولوجيا المعلومات — IT Warehouse

Single-page warehouse UI (Arabic/RTL) backed by an Express REST API, JSON-file storage,
JWT authentication, and Docker support. The current API stores operational data under
`data/`; the SQL Server service and schema files are not currently connected to the API.

## Structure

```
it-warehouse_1.html     # the UI (login + all screens), served by the API at /
server/                 # Express + JSON-file API
  src/index.js          # bootstrap, static UI, and routes
  src/routes.js         # REST endpoints + permissions
  src/roles.js          # permission map (CAN), incl. pool movements
  src/data.js           # domain state, persistence, bootstrap, and audit trail
  src/filestore.js      # atomic JSON file storage and daily backups
  src/stock.js          # pure stock math (shared with tests)
  src/auth.js           # JWT sign/verify
db/schema.mssql.sql     # planned SQL schema (not used by the current API)
Dockerfile              # app image
docker-compose.yml      # app + currently unused SQL Server service
test_swap.js            # stock engine tests
server/test_audit.js    # audit trail tests
check.js                # inline UI script syntax check
```

## Run with Docker (recommended)

```bash
docker compose up -d --build
```

Open http://localhost:3000. The app persists its JSON files in the `warehouse_data`
Docker volume; the SQL Server container is not used by the current API.

The daily backup is stored under `data/backups/`. Audit events are persisted separately
in `data/audit_log.json` and are visible only to the IT Manager and Technical Head.

Stop / reset:

```bash
docker compose down          # stop
docker compose down -v       # stop and delete the app data volume (and unused SQL volume)
```

## Run locally (without Docker)

Requires Node.js. The server persists data in JSON files under `data/`; no database
connection is currently required.

```bash
cd server
npm install
# copy ../.env.example to server/.env and set a unique JWT_SECRET
npm start
```

## Default accounts

Seeded on first run — change the passwords before real use.

| Username | Password   | Role              |
|----------|------------|-------------------|
| admin    | admin123   | IT Manager        |
| head     | head123    | Technical Head    |
| area     | area123    | Area Manager      |
| store    | store123   | Warehouse Keeper  |
| senior   | senior123  | Senior Technical  |
| junior   | junior123  | Junior Technical  |

## Audit trail

Successful create, update, and delete operations record the actor, role, time, entity
changes, and any supplied reason. Deletes require a reason. The UI provides a
role-restricted **سجل الحركة** screen; the corresponding endpoint is `GET /api/audit`.
The newest 10,000 events are retained in `data/audit_log.json`.

The dashboard highlights zero-stock items, items with 1–3 units, maintenance quantities,
items held for inspection, and requests awaiting action. The low-stock threshold is currently 3 units.

## User accounts and permissions

Only the IT Manager can create or deactivate accounts, change a user's role, reset a
password, or override permissions for individual operations. New accounts inherit their
role's defaults unless the administrator sets a per-user allow/deny override. Users can
change their own password after confirming the current password. Deactivation and password
changes invalidate existing sessions immediately; at least one active IT Manager account
must remain.

## Receipt inspection

New supplier, branch, and maintenance receipts are recorded in the `inspection` pool, not
the spendable warehouse balance. An authorized reviewer (IT Manager, Technical Head, or
Warehouse Keeper by default) must approve each line: accepted items enter `stock`, while
damaged items enter terminal `scrap`. The receipt captures the reported condition, notes,
and up to three photos per permit (JPG/PNG/WebP, 1 MiB each). Maintenance-return forms stay
pending until the inspection decision. Photos are kept in `data/inspection_photos/` and
included in daily data snapshots.

## Key API endpoints

All routes except `POST /api/auth/login` require `Authorization: Bearer <token>`.

- `POST /api/auth/login` — `{ username, password }` → `{ token, user }`
- `GET  /api/bootstrap` — items, categories, branches, suppliers, vouchers, requests
- `GET/POST/PUT /api/users` — administrator-only user and permission management
- `PUT /api/auth/password`, `PUT /api/users/:id/password` — own password change / admin reset
- `POST /api/inspections/:voucherId/:lineId/review` — accept or reject an inspection line
- `GET /api/inspection-photos/:id` — authenticated inspection photo
- `GET  /api/audit` — recent audit events (admin/head only)
- `POST/PUT/DELETE /api/items`, `/api/categories`, `/api/branches`, `/api/suppliers`
- `POST/PUT/DELETE /api/vouchers` — receipts/disbursements (stock validated in a transaction)
- `POST /api/scrap` — write damaged units off the warehouse balance into `خردة`
- `POST /api/requests`, `POST /api/requests/:id/action`

## Business rules

- Four warehouse pools per item: `stock`, `تحت الصيانة` (`maint_qty`), `خردة`
  (`scrap_qty`), and `inspection` (`inspection_qty`). All are kept non-negative in
  `server/src/stock.js` and enforced inside a synchronous state transaction before JSON
  files are atomically written.
- The document operations are split into dedicated screens (tabs), each with a fixed
  direction/kind and no source selector:
  - **استلام من مورد** — receipt from a supplier (`in/sup`); held for inspection.
  - **استلام من فرع** — receipt from a branch (`in/br`); the branch balance is reduced and
    the qty is held for inspection.
  - **صرف إلى فرع** — disbursement to a branch (`out/br`); `مخزون` is reduced and the
    branch balance is increased.
  - **صرف إلى مورد الصيانة** — reached from the **تحت الصيانة** tab (`out/sup`).
- All new goods receipts (`direction = in`) first move qty into `inspection`. The reviewer
  then moves accepted units into `stock` or damaged units into `خردة`; maintenance returns
  also leave `تحت الصيانة` when received and remain held until that decision.
- Sending to maintenance is a **disbursement to a maintenance supplier** (`direction = out`,
  `kind = sup`): qty leaves `stock` and enters `تحت الصيانة`. Such a permit records the
  supplier, permit number, automatic date, items, serials, per-line maintenance reason and
  explanation, and an optional origin branch. Select an existing form from **نماذج الصيانة**
  before saving; the form is linked to the exit permit and appears with it in the maintenance
  release and return flow. Saving an exit permit does not create duplicate maintenance forms.
- The **تحت الصيانة** tab has two actions: the read-only **إذن الخروج للصيانة** (exit
  permits: serials, party, origin branch, reason, explanation, registrar and date) and
  **إقرار استلام من الصيانة** (acknowledgement of the returned goods). The exit list shows
  only the quantity still under maintenance, so fully returned lines disappear.
- The dashboard flags linked external maintenance forms still marked `sent_external` after
  30 days, using the linked exit permit date. It also flags items with an active stock,
  branch, or maintenance balance whose catalog warranty expires within 7 days, including
  already expired warranties.
- The acknowledgement page lists the open items with their exit-permit details (number,
  date, supplier, origin branch, reason, explanation, registrar and available qty) and
  records the result and warranty per line. It also shows the acknowledgement history with
  the returned items' serials, quantities and results.   This page creates the maintenance
  receipt slip, which is never mixed into the exit permit.
- The **الخردة** tab has two write-off buttons: damaged items **with a serial**
  (`mode = serial`, serialised categories only) and damaged items **without a serial**
  (`mode = plain`, any stocked item, quantity only). Both deduct the quantity from the
  warehouse balance in a transaction (never below zero), add it to `خردة`, and append a
  `scrap_entries` record (item, qty, serials, registrar, date). Serials are mandatory
  and unique per submission in `serial` mode. The tab keeps the scrap balance hidden
  behind an explicit **عرض رصيد الخردة** toggle and always shows the write-off history.
- `خردة` is terminal and never leaves the pool. Pools are warehouse-level only.
- **Warranty** is recorded per catalogue item (`items.warranty_until`), set from
  **إدارة الأصناف**. A green badge shows `ضمان حتى <date>` while it is valid, a red
  `انتهى الضمان` once expired, and `بدون ضمان` when unset. On receipts that are not from a
  supplier (maintenance/branch) each line can also capture `هل يوجد ضمان؟` + expiry, which
  is written back onto the item.
- Maintenance movements (disbursing to a supplier and returning from maintenance) and
  scrap write-offs are restricted to **admin and head** (the `pool` permission).
- A disbursement can never exceed the warehouse balance, and a branch balance can never
  go negative.
- Deleting a voucher soft-deletes it and reverses its stock effect; its permit number
  becomes reusable.
- Supplier vouchers store the supplier name; branch vouchers store the branch. Every
  receipt/disbursement shows its party (`الجهة`).
- For serial-tracked items issued to a branch, the issue permit records the handing-over
  employee, receiving employee, their typed signatures, and handover date in the same
  transaction as the voucher. The details appear in the permit list and printed form.
- Account and inspection decisions are recorded in the audit trail without storing password
  hashes in audit changes.

## Tests

```bash
node check.js       # validates the inline UI script parses
cd server && npm test # stock, audit, inspection, maintenance, and account permissions
```
