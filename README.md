# مخزن تكنولوجيا المعلومات — IT Warehouse

Single-page warehouse UI (Arabic/RTL) backed by an Express REST API and Microsoft SQL
Server, with JWT authentication and Docker support.

## Structure

```
it-warehouse_1.html     # the UI (login + all screens), served by the API at /
server/                 # Express + SQL Server API
  src/index.js          # bootstrap: schema + seed + static UI + routes
  src/routes.js         # REST endpoints + permissions
  src/roles.js          # permission map (CAN), incl. pool movements
  src/stock.js          # pure stock math (shared with tests)
  src/seed.js           # default users + demo data
  src/auth.js           # JWT sign/verify
  src/db.js             # mssql connection pool
db/schema.mssql.sql     # database schema (idempotent)
Dockerfile              # app image
docker-compose.yml      # app + SQL Server
test_swap.js            # stock engine tests
check.js                # inline UI script syntax check
```

## Run with Docker (recommended)

```bash
docker compose up -d --build
```

Open http://localhost:3000

SQL Server is exposed on `localhost:1433` (user/password/db: `sa`/`Your_password123`/`it_warehouse`).
The API creates the database, schema and seed data on first start.

Stop / reset:

```bash
docker compose down          # stop
docker compose down -v       # stop and delete the database volume
```

## Run locally (without Docker)

Requires a reachable SQL Server (2019+). The target database is created automatically.

```bash
cd server
npm install
# copy ../.env.example to server/.env and adjust DB_SERVER / DB_PASSWORD / JWT_SECRET
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

## Key API endpoints

All routes except `POST /api/auth/login` require `Authorization: Bearer <token>`.

- `POST /api/auth/login` — `{ username, password }` → `{ token, user }`
- `GET  /api/bootstrap` — items, categories, branches, suppliers, vouchers, requests
- `POST/PUT/DELETE /api/items`, `/api/categories`, `/api/branches`, `/api/suppliers`
- `POST/PUT/DELETE /api/vouchers` — receipts/disbursements (stock validated in a transaction)
- `POST /api/scrap` — write damaged units off the warehouse balance into `خردة`
- `POST /api/requests`, `POST /api/requests/:id/action`

## Business rules

- Three warehouse pools per item: `stock`, `تحت الصيانة` (`maint_qty`) and `خردة`
  (`scrap_qty`). All are kept non-negative in `server/src/stock.js` and enforced inside a
  DB transaction with row locks before anything is written.
- The document operations are split into dedicated screens (tabs), each with a fixed
  direction/kind and no source selector:
  - **استلام من مورد** — receipt from a supplier (`in/sup`); always added to `مخزون`.
  - **استلام من فرع** — receipt from a branch (`in/br`); the branch balance is reduced and
    the qty is always added to `مخزون`. Scrap is not an option on this document.
  - **صرف إلى فرع** — disbursement to a branch (`out/br`); `مخزون` is reduced and the
    branch balance is increased.
  - **صرف إلى مورد الصيانة** — reached from the **تحت الصيانة** tab (`out/sup`).
- Receiving goods (`direction = in`) normally moves qty into `stock`. The only receipt
  that may feed `خردة` is a maintenance return, whose result is **تم إصلاحه** (repaired →
  `stock`) or **رفض الصيانة** (denied → `خردة`); the pool is adjusted automatically.
  Supplier and branch receipts always add to `stock` — damaged units are written off from
  the `الخردة` tab instead.
- Sending to maintenance is a **disbursement to a maintenance supplier** (`direction = out`,
  `kind = sup`): qty leaves `stock` and enters `تحت الصيانة`. Such a permit records the
  supplier, permit number, automatic date, items, serials, per-line maintenance reason and
  explanation, and an optional origin branch. It is the source of the release note.
- The **تحت الصيانة** tab has two actions: the read-only **إذن الخروج للصيانة** (exit
  permits: serials, party, origin branch, reason, explanation, registrar and date) and
  **إقرار استلام من الصيانة** (acknowledgement of the returned goods). The exit list shows
  only the quantity still under maintenance, so fully returned lines disappear.
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

## Tests

```bash
node check.js       # validates the inline UI script parses
node test_swap.js   # stock engine: over-disbursement, branch moves, maintenance, edits
cd server && npm test
```
