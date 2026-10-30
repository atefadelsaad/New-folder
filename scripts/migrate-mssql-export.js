'use strict';

// One-time migration helper: converts the raw `FOR JSON PATH` exports taken
// from the old SQL Server database into data/warehouse.json. It is NOT used by
// the running server; it only exists so the migration can be repeated and
// audited. Usage:
//   node scripts/migrate-mssql-export.js <export-dir>
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const inputDir = process.argv[2];

if (!inputDir || !fs.existsSync(inputDir)) {
  console.error('Usage: node scripts/migrate-mssql-export.js <export-dir>');
  process.exit(1);
}

// sqlcmd may wrap long output lines, inserting a raw newline inside a JSON
// string. Drop those control characters while scanning inside quoted strings.
function looseParse(raw) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === '\n' || ch === '\r') continue;
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return JSON.parse(out.replace(/^\uFEFF/, '').trim());
}

function readTable(name) {
  const file = path.join(inputDir, name + '.json');
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  const rows = looseParse(raw);
  return Array.isArray(rows) ? rows : [];
}

function readJsonFile(name, fallback) {
  const file = path.join(inputDir, name);
  if (!fs.existsSync(file)) return fallback;
  const raw = fs.readFileSync(file, 'utf8').trim();
  return raw ? looseParse(raw) : fallback;
}

const users = readTable('users');
const categories = readTable('categories');
const items = readTable('items');
const branches = readTable('branches');
const branchItems = readTable('branch_items');
const suppliers = readTable('suppliers');
const vouchers = readTable('vouchers');
const voucherLines = readTable('voucher_lines');
const scrapEntries = readTable('scrap_entries');
const requests = readTable('requests');
const requestLines = readTable('request_lines');
const requestLogs = readTable('request_logs');
const maintenanceForms = readJsonFile('maintenance_forms.json', []);
const dispatchMeta = readJsonFile('dispatch_meta.json', {});

const asSerials = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const maxId = (rows) => rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);

const vouchersWithLines = vouchers.map((v) => ({
  id: v.id,
  direction: v.direction,
  kind: v.kind,
  supplier_id: v.supplier_id == null ? null : Number(v.supplier_id),
  branch_id: v.branch_id == null ? null : Number(v.branch_id),
  number: v.number,
  doc_date: v.doc_date || '',
  source_branch: v.source_branch || '',
  created_by: v.created_by || '',
  edited_by: v.edited_by || null,
  created_at: v.created_at || '',
  deleted_at: v.deleted_at || null,
  lines: voucherLines
    .filter((l) => Number(l.voucher_id) === Number(v.id))
    .map((l) => ({
      id: l.id,
      item_id: l.item_id,
      qty: l.qty,
      item_condition: l.item_condition || '',
      state: l.state || 'stock',
      serials: asSerials(l.serials),
      reason: l.reason || '',
      note: l.line_note || '',
      has_warranty: !!l.has_warranty,
      warranty_until: l.line_warranty_until || null
    }))
}));

const requestsWithDetails = requests.map((r) => ({
  id: r.id,
  branch_id: r.branch_id,
  requested_by: r.requested_by || '',
  status: r.status,
  created_at: r.created_at || '',
  releasedVoucherId: null,
  lines: requestLines
    .filter((l) => Number(l.request_id) === Number(r.id))
    .map((l) => ({ id: l.id, item_id: l.item_id, qty: l.qty })),
  log: requestLogs
    .filter((l) => Number(l.request_id) === Number(r.id))
    .map((l) => ({
      id: l.id,
      by_name: l.by_name || '',
      action: l.action || '',
      kind: l.kind || '',
      note: l.note || '',
      created_at: l.created_at || ''
    }))
}));

const counters = {
  category: maxId(categories),
  item: maxId(items),
  branch: maxId(branches),
  supplier: maxId(suppliers),
  voucher: maxId(vouchers),
  voucherLine: maxId(voucherLines),
  scrapEntry: maxId(scrapEntries),
  request: maxId(requests),
  requestLine: maxId(requestLines),
  requestLog: maxId(requestLogs),
  // MF-0002 was created and deleted before the migration. Form numbers must
  // never be reused, so the counter starts at 2 and the next form is MF-0003.
  form: Math.max(
    2,
    maintenanceForms.reduce((m, f) => {
      const n = parseInt(String(f.number || '').replace(/\D/g, ''), 10);
      return Math.max(m, Number.isFinite(n) ? n : 0);
    }, 0)
  )
};

const warehouse = {
  schemaVersion: 1,
  savedAt: new Date().toISOString(),
  counters,
  users,
  categories,
  items,
  branches,
  branchItems,
  suppliers,
  vouchers: vouchersWithLines,
  scrapEntries: scrapEntries.map((s) => ({
    id: s.id,
    item_id: s.item_id,
    qty: s.qty,
    serials: asSerials(s.serials),
    created_by: s.created_by || '',
    created_at: s.created_at || ''
  })),
  requests: requestsWithDetails
};

const backup = {
  exportedAt: new Date().toISOString(),
  source: 'MSSQL it_warehouse (FOR JSON PATH)',
  tables: {
    users,
    categories,
    items,
    branches,
    branch_items: branchItems,
    suppliers,
    vouchers,
    voucher_lines: voucherLines,
    scrap_entries: scrapEntries,
    requests,
    request_lines: requestLines,
    request_logs: requestLogs
  },
  files: {
    maintenance_forms: maintenanceForms,
    dispatch_meta: dispatchMeta
  }
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, 'warehouse.json'), JSON.stringify(warehouse, null, 2), 'utf8');
fs.writeFileSync(path.join(DATA_DIR, 'maintenance_forms.json'), JSON.stringify(maintenanceForms, null, 2), 'utf8');
fs.writeFileSync(path.join(DATA_DIR, 'dispatch_meta.json'), JSON.stringify(dispatchMeta, null, 2), 'utf8');
fs.writeFileSync(path.join(DATA_DIR, 'backup-from-mssql.json'), JSON.stringify(backup, null, 2), 'utf8');

const live = vouchersWithLines.filter((v) => !v.deleted_at);
console.log(JSON.stringify({
  counters,
  users: users.length,
  categories: categories.length,
  items: items.length,
  branches: branches.length,
  branchItems: branchItems.length,
  suppliers: suppliers.length,
  vouchersTotal: vouchers.length,
  vouchersActive: live.length,
  voucherLines: voucherLines.length,
  scrapEntries: scrapEntries.length,
  requests: requestsWithDetails.length,
  requestLines: requestLines.length,
  requestLogs: requestLogs.length,
  maintenanceForms: maintenanceForms.length,
  maintenanceNumbers: maintenanceForms.map((f) => f.number),
  dispatchMetaKeys: Object.keys(dispatchMeta).length,
  stock: items.map((i) => ({ id: i.id, name: i.name, stock: i.stock, maint: i.maint_qty, scrap: i.scrap_qty }))
}, null, 1));
