# مخزن تكنولوجيا المعلومات — IT Warehouse

Single-page warehouse UI (Arabic/RTL) backed by an Express REST API and PostgreSQL,
with JWT authentication and Docker support.

## Structure

```
it-warehouse_1.html     # the UI (login + all screens), served by the API at /
server/                 # Express + PostgreSQL API
  src/index.js          # bootstrap: schema + seed + static UI + routes
  src/routes.js         # REST endpoints + permissions
  src/stock.js          # pure stock math (shared with tests)
  src/seed.js           # default users + demo data
  src/auth.js           # JWT sign/verify
  src/db.js             # pg pool
db/schema.sql           # database schema (idempotent)
Dockerfile              # app image
docker-compose.yml      # app + postgres
test_swap.js            # stock engine tests
check.js                # inline UI script syntax check
```

## Run with Docker (recommended)

```bash
docker compose up -d --build
```

Open http://localhost:3000

PostgreSQL is exposed on `localhost:5432` (user/password/db: `wh`/`wh`/`warehouse`).
The API creates the schema and seeds demo data on first start.

Stop / reset:

```bash
docker compose down          # stop
docker compose down -v       # stop and delete the database volume
```

## Run locally (without Docker)

Requires a running PostgreSQL.

```bash
cd server
npm install
# copy ../.env.example to server/.env and adjust DATABASE_URL / JWT_SECRET
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
- `POST /api/requests`, `POST /api/requests/:id/action`

## Business rules

- A disbursement can never exceed the warehouse balance, and a branch balance can never
  go negative. Checked in `server/src/stock.js` and enforced inside a DB transaction with
  row locks before anything is written.
- Only repaired maintenance units (`تم إصلاحه...`) return to sellable stock.
- Supplier vouchers store the supplier name; branch vouchers store the branch. Every
  receipt/disbursement shows its party (`الجهة`).

## Tests

```bash
node check.js       # validates the inline UI script parses
node test_swap.js   # stock engine: over-disbursement, branch moves, maintenance, edits
cd server && npm test
```
