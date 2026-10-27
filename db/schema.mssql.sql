/* ============================================================================
   IT Warehouse & Branch Asset Management - Microsoft SQL Server schema
   Idempotent: safe to run repeatedly against the target database.
   Run after:  CREATE DATABASE it_warehouse;  (or your chosen name)
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ------------------------------- users ---------------------------------- */
IF OBJECT_ID('dbo.users', 'U') IS NULL
CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_users PRIMARY KEY,
  username      NVARCHAR(64)  NOT NULL CONSTRAINT uq_users_username UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  role          NVARCHAR(16)  NOT NULL
                CONSTRAINT ck_users_role CHECK (role IN ('admin','head','area','store','senior','junior')),
  name          NVARCHAR(120) NOT NULL,
  created_at    DATETIME2(0)  NOT NULL CONSTRAINT df_users_created DEFAULT SYSUTCDATETIME()
);
GO

/* ----------------------------- categories ------------------------------- */
IF OBJECT_ID('dbo.categories', 'U') IS NULL
CREATE TABLE dbo.categories (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_categories PRIMARY KEY,
  name       NVARCHAR(120) NOT NULL CONSTRAINT uq_categories_name UNIQUE,
  has_serial BIT           NOT NULL CONSTRAINT df_categories_serial DEFAULT (1),
  created_at DATETIME2(0)  NOT NULL CONSTRAINT df_categories_created DEFAULT SYSUTCDATETIME()
);
GO

/* ------------------------------- items ---------------------------------- */
IF OBJECT_ID('dbo.items', 'U') IS NULL
CREATE TABLE dbo.items (
  id          INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_items PRIMARY KEY,
  name        NVARCHAR(160) NOT NULL,
  category_id INT           NOT NULL CONSTRAINT fk_items_category REFERENCES dbo.categories(id),
  stock       INT           NOT NULL CONSTRAINT df_items_stock DEFAULT (0)
                            CONSTRAINT ck_items_stock CHECK (stock >= 0),
  maint_qty   INT           NOT NULL CONSTRAINT df_items_maint DEFAULT (0)
                            CONSTRAINT ck_items_maint CHECK (maint_qty >= 0),
  scrap_qty   INT           NOT NULL CONSTRAINT df_items_scrap DEFAULT (0)
                            CONSTRAINT ck_items_scrap CHECK (scrap_qty >= 0),
  created_by  NVARCHAR(120) NULL,
  created_at  DATETIME2(0)  NOT NULL CONSTRAINT df_items_created DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_items_category' AND object_id = OBJECT_ID('dbo.items'))
  CREATE INDEX ix_items_category ON dbo.items(category_id);
GO
/* Warranty expiry for the catalogue item (NULL = no warranty recorded). */
IF COL_LENGTH('dbo.items', 'warranty_until') IS NULL
  ALTER TABLE dbo.items ADD warranty_until DATE NULL;
GO
/* Item notes and the explicit بضمان / بدون ضمان choice. NULL = not recorded
   for items created before this field existed (kept readable, shown as "-"). */
IF COL_LENGTH('dbo.items', 'notes') IS NULL
  ALTER TABLE dbo.items ADD notes NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.items', 'has_warranty') IS NULL
  ALTER TABLE dbo.items ADD has_warranty BIT NULL;
GO

/* ------------------------------ branches -------------------------------- */
IF OBJECT_ID('dbo.branches', 'U') IS NULL
CREATE TABLE dbo.branches (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_branches PRIMARY KEY,
  name       NVARCHAR(160) NOT NULL,
  gov        NVARCHAR(80)  NOT NULL,
  created_by NVARCHAR(120) NULL,
  created_at DATE          NOT NULL CONSTRAINT df_branches_created DEFAULT CAST(GETDATE() AS DATE)
);
GO
/* Optional branch profile fields used by the branches screen. Added in place,
   nullable, so existing branches keep working and no data is rewritten. */
IF COL_LENGTH('dbo.branches', 'number') IS NULL
  ALTER TABLE dbo.branches ADD number NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.branches', 'manager') IS NULL
  ALTER TABLE dbo.branches ADD manager NVARCHAR(120) NULL;
GO
IF COL_LENGTH('dbo.branches', 'phone') IS NULL
  ALTER TABLE dbo.branches ADD phone NVARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.branches', 'address') IS NULL
  ALTER TABLE dbo.branches ADD address NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.branches', 'location') IS NULL
  ALTER TABLE dbo.branches ADD location NVARCHAR(500) NULL;
GO

/* ---------------------------- branch_items ------------------------------ */
-- A branch keeps an explicit set of catalogue items (assigned at creation).
IF OBJECT_ID('dbo.branch_items', 'U') IS NULL
CREATE TABLE dbo.branch_items (
  branch_id INT NOT NULL CONSTRAINT fk_bi_branch REFERENCES dbo.branches(id) ON DELETE CASCADE,
  item_id   INT NOT NULL CONSTRAINT fk_bi_item   REFERENCES dbo.items(id),
  qty       INT NOT NULL CONSTRAINT df_bi_qty DEFAULT (0)
                        CONSTRAINT ck_bi_qty CHECK (qty >= 0),
  CONSTRAINT pk_branch_items PRIMARY KEY (branch_id, item_id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_bi_item' AND object_id = OBJECT_ID('dbo.branch_items'))
  CREATE INDEX ix_bi_item ON dbo.branch_items(item_id);
GO

/* ------------------------------ suppliers ------------------------------- */
IF OBJECT_ID('dbo.suppliers', 'U') IS NULL
CREATE TABLE dbo.suppliers (
  id   INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_suppliers PRIMARY KEY,
  name NVARCHAR(160) NOT NULL CONSTRAINT uq_suppliers_name UNIQUE,
  company  NVARCHAR(200) NULL,
  address  NVARCHAR(300) NULL,
  phone    NVARCHAR(60)  NULL,
  landline NVARCHAR(60)  NULL,
  accepts_maintenance BIT NOT NULL CONSTRAINT df_suppliers_maint DEFAULT (0),
  created_by NVARCHAR(120) NULL,
  created_at DATETIME2(0) NOT NULL CONSTRAINT df_suppliers_created DEFAULT SYSUTCDATETIME()
);
GO
IF COL_LENGTH('dbo.suppliers', 'company') IS NULL
  ALTER TABLE dbo.suppliers ADD company NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.suppliers', 'address') IS NULL
  ALTER TABLE dbo.suppliers ADD address NVARCHAR(300) NULL;
GO
IF COL_LENGTH('dbo.suppliers', 'phone') IS NULL
  ALTER TABLE dbo.suppliers ADD phone NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.suppliers', 'landline') IS NULL
  ALTER TABLE dbo.suppliers ADD landline NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.suppliers', 'accepts_maintenance') IS NULL
  ALTER TABLE dbo.suppliers ADD accepts_maintenance BIT NOT NULL CONSTRAINT df_suppliers_maint DEFAULT (0);
GO
IF COL_LENGTH('dbo.suppliers', 'created_by') IS NULL
  ALTER TABLE dbo.suppliers ADD created_by NVARCHAR(120) NULL;
GO
IF COL_LENGTH('dbo.suppliers', 'created_at') IS NULL
  ALTER TABLE dbo.suppliers ADD created_at DATETIME2(0) NOT NULL CONSTRAINT df_suppliers_created DEFAULT SYSUTCDATETIME();
GO

/* ---------------------- categories: supplier + author ------------------- */
IF COL_LENGTH('dbo.categories', 'supplier_id') IS NULL
  ALTER TABLE dbo.categories ADD supplier_id INT NULL CONSTRAINT fk_categories_supplier REFERENCES dbo.suppliers(id);
GO
IF COL_LENGTH('dbo.categories', 'created_by') IS NULL
  ALTER TABLE dbo.categories ADD created_by NVARCHAR(120) NULL;
GO

/* ------------------------------ vouchers -------------------------------- */
IF OBJECT_ID('dbo.vouchers', 'U') IS NULL
CREATE TABLE dbo.vouchers (
  id          INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_vouchers PRIMARY KEY,
  direction   NVARCHAR(3)  NOT NULL CONSTRAINT ck_vouchers_dir  CHECK (direction IN ('in','out')),
  kind        NVARCHAR(8)  NOT NULL CONSTRAINT ck_vouchers_kind CHECK (kind IN ('sup','maint','br')),
  supplier_id INT          NULL CONSTRAINT fk_vouchers_supplier REFERENCES dbo.suppliers(id),
  branch_id   INT          NULL CONSTRAINT fk_vouchers_branch   REFERENCES dbo.branches(id),
  number      NVARCHAR(60) NOT NULL,
  doc_date    NVARCHAR(40) NULL,
  created_by  NVARCHAR(120) NULL,
  edited_by   NVARCHAR(120) NULL,
  created_at  DATETIME2(0) NOT NULL CONSTRAINT df_vouchers_created DEFAULT SYSUTCDATETIME(),
  deleted_at  DATETIME2(0) NULL
);
GO
-- Unique permit number per voucher type; numbers may be reused after a soft delete.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_vouchers_dir_num' AND object_id = OBJECT_ID('dbo.vouchers'))
  CREATE UNIQUE INDEX uq_vouchers_dir_num ON dbo.vouchers(direction, number) WHERE deleted_at IS NULL;
GO
/* Origin branch recorded on a maintenance disbursement (informational). */
IF COL_LENGTH('dbo.vouchers', 'source_branch') IS NULL
  ALTER TABLE dbo.vouchers ADD source_branch NVARCHAR(160) NULL;
GO

/* --------------------------- voucher_lines ------------------------------ */
-- serials is a JSON array string (SQL Server has no array type); parsed in the app.
IF OBJECT_ID('dbo.voucher_lines', 'U') IS NULL
CREATE TABLE dbo.voucher_lines (
  id             INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_voucher_lines PRIMARY KEY,
  voucher_id     INT NOT NULL CONSTRAINT fk_vl_voucher REFERENCES dbo.vouchers(id) ON DELETE CASCADE,
  item_id        INT NOT NULL CONSTRAINT fk_vl_item    REFERENCES dbo.items(id),
  qty            INT NOT NULL CONSTRAINT ck_vl_qty CHECK (qty > 0),
  item_condition NVARCHAR(200) NULL,
  state          NVARCHAR(8) NOT NULL CONSTRAINT df_vl_state DEFAULT ('stock')
                             CONSTRAINT ck_vl_state CHECK (state IN ('stock','maint','scrap')),
  serials        NVARCHAR(MAX) NULL
                 CONSTRAINT ck_vl_serials_json CHECK (serials IS NULL OR ISJSON(serials) = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_vl_voucher' AND object_id = OBJECT_ID('dbo.voucher_lines'))
  CREATE INDEX ix_vl_voucher ON dbo.voucher_lines(voucher_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_vl_item' AND object_id = OBJECT_ID('dbo.voucher_lines'))
  CREATE INDEX ix_vl_item ON dbo.voucher_lines(item_id);
GO
/* Per-line maintenance reason/explanation and warranty captured on a receipt. */
IF COL_LENGTH('dbo.voucher_lines', 'reason') IS NULL
  ALTER TABLE dbo.voucher_lines ADD reason NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.voucher_lines', 'line_note') IS NULL
  ALTER TABLE dbo.voucher_lines ADD line_note NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.voucher_lines', 'has_warranty') IS NULL
  ALTER TABLE dbo.voucher_lines ADD has_warranty BIT NULL;
GO
IF COL_LENGTH('dbo.voucher_lines', 'line_warranty_until') IS NULL
  ALTER TABLE dbo.voucher_lines ADD line_warranty_until DATE NULL;
GO

/* ---------------------------- scrap_entries ------------------------------ */
-- Each scrapping action (damaged units written off the warehouse balance).
-- serials is a JSON array string, like voucher_lines.serials.
IF OBJECT_ID('dbo.scrap_entries', 'U') IS NULL
CREATE TABLE dbo.scrap_entries (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_scrap_entries PRIMARY KEY,
  item_id    INT NOT NULL CONSTRAINT fk_scrap_item REFERENCES dbo.items(id),
  qty        INT NOT NULL CONSTRAINT ck_scrap_qty CHECK (qty > 0),
  serials    NVARCHAR(MAX) NULL
             CONSTRAINT ck_scrap_serials_json CHECK (serials IS NULL OR ISJSON(serials) = 1),
  created_by NVARCHAR(120) NULL,
  created_at DATETIME2(0) NOT NULL CONSTRAINT df_scrap_created DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_scrap_item' AND object_id = OBJECT_ID('dbo.scrap_entries'))
  CREATE INDEX ix_scrap_item ON dbo.scrap_entries(item_id);
GO

/* ------------------------------ requests -------------------------------- */
IF OBJECT_ID('dbo.requests', 'U') IS NULL
CREATE TABLE dbo.requests (
  id           INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_requests PRIMARY KEY,
  branch_id    INT NOT NULL CONSTRAINT fk_requests_branch REFERENCES dbo.branches(id),
  requested_by NVARCHAR(120) NOT NULL,
  status       NVARCHAR(12) NOT NULL CONSTRAINT df_requests_status DEFAULT ('review')
                            CONSTRAINT ck_requests_status
                            CHECK (status IN ('review','pending','approved','released','rejected')),
  created_at   DATETIME2(0) NOT NULL CONSTRAINT df_requests_created DEFAULT SYSUTCDATETIME()
);
GO

/* --------------------------- request_lines ------------------------------ */
IF OBJECT_ID('dbo.request_lines', 'U') IS NULL
CREATE TABLE dbo.request_lines (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_request_lines PRIMARY KEY,
  request_id INT NOT NULL CONSTRAINT fk_rl_request REFERENCES dbo.requests(id) ON DELETE CASCADE,
  item_id    INT NOT NULL CONSTRAINT fk_rl_item    REFERENCES dbo.items(id),
  qty        INT NOT NULL CONSTRAINT ck_rl_qty CHECK (qty > 0)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_rl_request' AND object_id = OBJECT_ID('dbo.request_lines'))
  CREATE INDEX ix_rl_request ON dbo.request_lines(request_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_rl_item' AND object_id = OBJECT_ID('dbo.request_lines'))
  CREATE INDEX ix_rl_item ON dbo.request_lines(item_id);
GO

/* ---------------------------- request_logs ------------------------------ */
IF OBJECT_ID('dbo.request_logs', 'U') IS NULL
CREATE TABLE dbo.request_logs (
  id         INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_request_logs PRIMARY KEY,
  request_id INT NOT NULL CONSTRAINT fk_rlog_request REFERENCES dbo.requests(id) ON DELETE CASCADE,
  by_name    NVARCHAR(120) NULL,
  action     NVARCHAR(120) NULL,
  kind       NVARCHAR(16)  NULL,
  note       NVARCHAR(MAX) NULL,
  created_at DATETIME2(0)  NOT NULL CONSTRAINT df_rlog_created DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_rlog_request' AND object_id = OBJECT_ID('dbo.request_logs'))
  CREATE INDEX ix_rlog_request ON dbo.request_logs(request_id);
GO

/* ------------------------------ audit_log ------------------------------- */
IF OBJECT_ID('dbo.audit_log', 'U') IS NULL
CREATE TABLE dbo.audit_log (
  id          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT pk_audit_log PRIMARY KEY,
  user_name   NVARCHAR(120) NULL,
  action      NVARCHAR(120) NOT NULL,
  entity      NVARCHAR(60)  NOT NULL,
  entity_id   NVARCHAR(60)  NULL,
  before_json NVARCHAR(MAX) NULL,
  after_json  NVARCHAR(MAX) NULL,
  created_at  DATETIME2(0)  NOT NULL CONSTRAINT df_audit_created DEFAULT SYSUTCDATETIME()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_audit_entity' AND object_id = OBJECT_ID('dbo.audit_log'))
  CREATE INDEX ix_audit_entity ON dbo.audit_log(entity, entity_id);
GO
