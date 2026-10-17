-- Warehouse schema (idempotent)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  has_serial BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_by  TEXT
);

CREATE TABLE IF NOT EXISTS branches (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  gov        TEXT NOT NULL,
  created_by TEXT,
  created_at DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS branch_items (
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  qty       INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  PRIMARY KEY (branch_id, item_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
  id          SERIAL PRIMARY KEY,
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  kind        TEXT NOT NULL CHECK (kind IN ('sup','maint','br')),
  supplier_id INTEGER REFERENCES suppliers(id),
  branch_id   INTEGER REFERENCES branches(id),
  number      TEXT NOT NULL,
  doc_date    TEXT,
  created_by  TEXT,
  edited_by   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direction, number)
);

CREATE TABLE IF NOT EXISTS voucher_lines (
  id             SERIAL PRIMARY KEY,
  voucher_id     INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  item_id        INTEGER NOT NULL REFERENCES items(id),
  qty            INTEGER NOT NULL CHECK (qty > 0),
  item_condition TEXT,
  state          TEXT NOT NULL DEFAULT 'stock' CHECK (state IN ('stock','maint','scrap')),
  serials        TEXT[] NOT NULL DEFAULT '{}'
);

-- Additive migration for databases created before the condition/state model.
ALTER TABLE voucher_lines ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'stock';

CREATE TABLE IF NOT EXISTS requests (
  id           SERIAL PRIMARY KEY,
  branch_id    INTEGER NOT NULL REFERENCES branches(id),
  requested_by TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'review',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_lines (
  id         SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  qty        INTEGER NOT NULL CHECK (qty > 0)
);

CREATE TABLE IF NOT EXISTS request_logs (
  id         SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  by_name    TEXT,
  action     TEXT,
  kind       TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_request_lines_request ON request_lines(request_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_request ON request_logs(request_id);

-- Branch-specific (ad-hoc) items are retired: each branch now keeps an
-- explicit set of standard items chosen from the catalogue.
DROP TABLE IF EXISTS branch_custom_items;
