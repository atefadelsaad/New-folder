'use strict';

// In-memory domain state backed by JSON files. The whole warehouse document is
// small enough to keep resident: mutations run inside a synchronous critical
// section (no awaits), then the affected files are written atomically.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const store = require('./filestore');
const {
  voucherDeltas,
  scrapDeltas,
  applyDeltas,
  planChange,
  lineState
} = require('./stock');

const DOMAIN_FILE = 'warehouse.json';
const FORMS_FILE = 'maintenance_forms.json';
const META_FILE = 'dispatch_meta.json';
const SCHEMA_VERSION = 1;

const USERS = [
  ['admin', 'admin123', 'admin', 'IT Manager'],
  ['head', 'head123', 'head', 'Technical Head'],
  ['area', 'area123', 'area', 'Area Manager'],
  ['store', 'store123', 'store', 'Warehouse Keeper'],
  ['senior', 'senior123', 'senior', 'Senior Technical'],
  ['junior', 'junior123', 'junior', 'Junior Technical']
];

const CATEGORIES = ['طابعات', 'كمبيوترات'];
const BRANCHES = [
  { name: 'فرع سموحة', gov: 'الإسكندرية' },
  { name: 'فرع العجمي', gov: 'الإسكندرية' },
  { name: 'فرع طنطا', gov: 'الغربية' }
];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => { throw new ApiError(status, message); };

const nowIso = () => new Date().toISOString();

// Keep the date part exactly as stored: SQL dates and form dates are already
// plain YYYY-MM-DD strings and must not be shifted by a timezone conversion.
function day(value) {
  const s = String(value == null ? '' : value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : '';
}

function newCounters() {
  return {
    category: 0,
    item: 0,
    branch: 0,
    supplier: 0,
    voucher: 0,
    voucherLine: 0,
    scrapEntry: 0,
    request: 0,
    requestLine: 0,
    requestLog: 0,
    form: 0,
    audit: 0
  };
}

const state = {
  counters: newCounters(),
  users: [],
  categories: [],
  items: [],
  branches: [],
  branchItems: [],
  suppliers: [],
  vouchers: [],
  scrapEntries: [],
  requests: [],
  forms: [],
  dispatchMeta: {},
  auditLog: []
};

let auditContext = null;

const MAX_ID = (rows) => (Array.isArray(rows) ? rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) : 0);
const MAX_FORM_NO = (rows) => (Array.isArray(rows) ? rows.reduce((m, r) => {
  const n = parseInt(String(r.number || '').replace(/\D/g, ''), 10);
  return Math.max(m, Number.isFinite(n) ? n : 0);
}, 0) : 0);

function seed() {
  const now = nowIso();
  state.users = USERS.map(([username, password, role, name], idx) => ({
    id: idx + 1,
    username,
    password_hash: bcrypt.hashSync(password, 10),
    role,
    name,
    active: true,
    permissions: {},
    token_version: 0,
    created_at: now
  }));
  state.categories = CATEGORIES.map((name, idx) => ({
    id: idx + 1,
    name,
    has_serial: true,
    supplier_id: null,
    created_by: 'Warehouse Keeper',
    created_at: now
  }));
  state.branches = BRANCHES.map((b, idx) => ({
    id: idx + 1,
    name: b.name,
    gov: b.gov,
    number: '',
    manager: '',
    phone: '',
    address: '',
    location: '',
    created_by: 'Warehouse Keeper',
    created_at: day(now)
  }));
  state.counters.category = state.categories.length;
  state.counters.branch = state.branches.length;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function load() {
  const raw = store.readJson(DOMAIN_FILE, null);
  const domain = asObject(raw);
  const hasDomain = raw != null && typeof raw === 'object' && !Array.isArray(raw);

  state.counters = Object.assign(newCounters(), asObject(domain.counters));
  state.users = asArray(domain.users);
  state.users.forEach((user) => {
    if (user.active == null) user.active = true;
    if (!user.permissions || typeof user.permissions !== 'object' || Array.isArray(user.permissions)) user.permissions = {};
    if (!Number.isInteger(Number(user.token_version))) user.token_version = 0;
  });
  state.categories = asArray(domain.categories);
  state.items = asArray(domain.items).map((item) => Object.assign({ inspection_qty: 0 }, item, {
    inspection_qty: Number(item.inspection_qty) || 0
  }));
  state.branches = asArray(domain.branches);
  state.branchItems = asArray(domain.branchItems);
  state.suppliers = asArray(domain.suppliers);
  state.vouchers = asArray(domain.vouchers).map((v) => Object.assign({}, v, { lines: asArray(v.lines) }));
  state.scrapEntries = asArray(domain.scrapEntries);
  state.requests = asArray(domain.requests).map((r) => Object.assign({}, r, {
    lines: asArray(r.lines),
    log: asArray(r.log)
  }));

  if (!hasDomain || !state.users.length) seed();

  state.forms = store.readList(FORMS_FILE);
  state.dispatchMeta = store.readMap(META_FILE);
  state.auditLog = store.readList('audit_log.json');

  ensureCounters();
  reconcile();
  save();
}

// Counters only ever grow: deleted records must never hand their number out
// again (MF-0001 stays used after its form is deleted).
function ensureCounters() {
  const c = state.counters;
  c.category = Math.max(Number(c.category) || 0, MAX_ID(state.categories));
  c.item = Math.max(Number(c.item) || 0, MAX_ID(state.items));
  c.branch = Math.max(Number(c.branch) || 0, MAX_ID(state.branches));
  c.supplier = Math.max(Number(c.supplier) || 0, MAX_ID(state.suppliers));
  c.voucher = Math.max(Number(c.voucher) || 0, MAX_ID(state.vouchers));
  c.voucherLine = Math.max(Number(c.voucherLine) || 0, state.vouchers.reduce((m, v) => Math.max(m, MAX_ID(v.lines)), 0));
  c.scrapEntry = Math.max(Number(c.scrapEntry) || 0, MAX_ID(state.scrapEntries));
  c.request = Math.max(Number(c.request) || 0, MAX_ID(state.requests));
  c.requestLine = Math.max(Number(c.requestLine) || 0, state.requests.reduce((m, r) => Math.max(m, MAX_ID(r.lines)), 0));
  c.requestLog = Math.max(Number(c.requestLog) || 0, state.requests.reduce((m, r) => Math.max(m, MAX_ID(r.log)), 0));
  c.form = Math.max(Number(c.form) || 0, MAX_ID(state.forms), MAX_FORM_NO(state.forms));
  c.audit = Math.max(Number(c.audit) || 0, MAX_ID(state.auditLog));
}

const liveVouchers = () => state.vouchers.filter((v) => !v.deleted_at);
const voucherById = (id) => state.vouchers.find((v) => Number(v.id) === Number(id) && !v.deleted_at) || null;
const itemById = (id) => state.items.find((i) => Number(i.id) === Number(id)) || null;
const categoryById = (id) => state.categories.find((c) => Number(c.id) === Number(id)) || null;
const branchById = (id) => state.branches.find((b) => Number(b.id) === Number(id)) || null;
const formById = (id) => state.forms.find((f) => Number(f.id) === Number(id)) || null;

function categoryByName(name) {
  const key = String(name == null ? '' : name).trim().toLowerCase();
  if (!key) return null;
  return state.categories.find((c) => String(c.name).trim().toLowerCase() === key) || null;
}

function supplierByName(name) {
  const key = String(name == null ? '' : name).trim().toLowerCase();
  if (!key) return null;
  return state.suppliers.find((s) => String(s.name).trim().toLowerCase() === key) || null;
}

function hasSerial(itemId) {
  const item = itemById(itemId);
  if (!item) return false;
  const cat = categoryById(item.category_id);
  return !!(cat && cat.has_serial);
}

function ensureSupplier(name) {
  const clean = String(name == null ? '' : name).trim().slice(0, 160);
  if (!clean) return null;
  const found = supplierByName(clean);
  if (found) return found.id;
  const rec = {
    id: ++state.counters.supplier,
    name: clean,
    company: '',
    address: '',
    phone: '',
    landline: '',
    accepts_maintenance: false,
    created_by: 'system',
    created_at: nowIso()
  };
  state.suppliers.push(rec);
  return rec.id;
}

function branchQty(branchId, itemId) {
  const row = state.branchItems.find((r) => Number(r.branch_id) === Number(branchId) && Number(r.item_id) === Number(itemId));
  return row ? Number(row.qty) || 0 : 0;
}

function setBranchQty(branchId, itemId, qty) {
  const row = state.branchItems.find((r) => Number(r.branch_id) === Number(branchId) && Number(r.item_id) === Number(itemId));
  if (row) row.qty = qty;
  else state.branchItems.push({ branch_id: Number(branchId), item_id: Number(itemId), qty });
}

function snapshot() {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: nowIso(),
    counters: state.counters,
    users: state.users,
    categories: state.categories,
    items: state.items,
    branches: state.branches,
    branchItems: state.branchItems,
    suppliers: state.suppliers,
    vouchers: state.vouchers,
    scrapEntries: state.scrapEntries,
    requests: state.requests
  };
}

function save() {
  store.writeJson(DOMAIN_FILE, snapshot());
  store.writeJson(FORMS_FILE, state.forms);
  store.writeJson(META_FILE, state.dispatchMeta);
  store.writeList('audit_log.json', state.auditLog);
}

function replaceState(backup) {
  Object.keys(state).forEach((k) => { delete state[k]; });
  Object.assign(state, backup);
}

function auditEntities(source) {
  const records = new Map();
  const collections = [
    ['user', source.users && source.users.map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      active: user.active !== false,
      permissions: user.permissions || {}
    }))],
    ['category', source.categories],
    ['item', source.items],
    ['branch', source.branches],
    ['supplier', source.suppliers],
    ['voucher', source.vouchers],
    ['scrap', source.scrapEntries],
    ['request', source.requests],
    ['maintenance-form', source.forms]
  ];
  collections.forEach(([name, rows]) => {
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      records.set(name + ':' + row.id, JSON.parse(JSON.stringify(row)));
    });
  });
  (Array.isArray(source.branchItems) ? source.branchItems : []).forEach((row) => {
    records.set('branch-item:' + row.branch_id + ':' + row.item_id, JSON.parse(JSON.stringify(row)));
  });
  Object.keys(source.dispatchMeta || {}).forEach((id) => {
    records.set('dispatch-meta:' + id, JSON.parse(JSON.stringify(source.dispatchMeta[id])));
  });
  return records;
}

function appendAudit(before) {
  if (!auditContext) return;
  const oldRecords = auditEntities(before);
  const newRecords = auditEntities(state);
  const keys = new Set([...oldRecords.keys(), ...newRecords.keys()]);
  const changes = [];
  keys.forEach((key) => {
    const oldValue = oldRecords.get(key);
    const newValue = newRecords.get(key);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return;
    const split = key.indexOf(':');
    changes.push({
      entity: key.slice(0, split),
      entityId: key.slice(split + 1),
      before: oldValue == null ? null : oldValue,
      after: newValue == null ? null : newValue
    });
  });
  if (!changes.length) return;
  state.auditLog.push({
    id: ++state.counters.audit,
    action: auditContext.action,
    method: auditContext.method,
    path: auditContext.path,
    actor: auditContext.actor,
    username: auditContext.username,
    role: auditContext.role,
    reason: auditContext.reason,
    at: nowIso(),
    changes
  });
  if (state.auditLog.length > 10000) state.auditLog.splice(0, state.auditLog.length - 10000);
}

function withAudit(context, fn) {
  const previous = auditContext;
  auditContext = context;
  try {
    return fn();
  } finally {
    auditContext = previous;
  }
}

// Run a synchronous mutation as one unit: either it completes and is persisted,
// or the in-memory state is restored and the error propagates.
function tx(fn) {
  return store.withLock(() => {
    const backup = JSON.parse(JSON.stringify(state));
    try {
      const result = fn(state);
      appendAudit(backup);
      save();
      return result;
    } catch (err) {
      replaceState(backup);
      throw err;
    }
  });
}

/* ------------------------------ serial ledger ----------------------------- */

function serialLedger(itemIds, excludeVoucherId) {
  const wanted = new Set(itemIds.map(Number));
  const ledger = new Map();
  const put = (itemId, sn, stateName, branchId) => {
    const key = Number(itemId) + '|' + String(sn).toLowerCase();
    // Keep the serial exactly as it was typed; only the lookup key is lowered.
    ledger.set(key, {
      state: stateName,
      branchId: branchId == null ? null : Number(branchId),
      serial: String(sn)
    });
  };
  const vouchers = liveVouchers().slice().sort((a, b) => Number(a.id) - Number(b.id));
  for (const v of vouchers) {
    if (excludeVoucherId != null && Number(v.id) === Number(excludeVoucherId)) continue;
    for (const line of v.lines) {
      if (!wanted.has(Number(line.item_id))) continue;
      const serials = Array.isArray(line.serials) ? line.serials : [];
      for (const sn of serials) {
        if (!String(sn || '').trim()) continue;
        if (v.direction === 'out') {
          put(line.item_id, sn, v.kind === 'br' ? 'branch' : 'maint', v.kind === 'br' ? v.branch_id : null);
        } else {
          const stateName = String(line.state);
          put(line.item_id, sn, stateName === 'inspection' ? 'inspection' : stateName === 'scrap' ? 'scrap' : 'stock', null);
        }
      }
    }
  }
  const scrap = state.scrapEntries.slice().sort((a, b) => Number(a.id) - Number(b.id));
  for (const row of scrap) {
    if (!wanted.has(Number(row.item_id))) continue;
    const serials = Array.isArray(row.serials) ? row.serials : [];
    for (const sn of serials) if (String(sn || '').trim()) put(row.item_id, sn, 'scrap', null);
  }
  return ledger;
}

const serialKey = (itemId, sn) => Number(itemId) + '|' + String(sn).toLowerCase();

function pickStockSerials(itemId, qty) {
  const ledger = serialLedger([itemId], null);
  const wanted = Number(itemId);
  const available = [];
  for (const [key, value] of ledger.entries()) {
    if (!key.startsWith(wanted + '|')) continue;
    if (value.state !== 'stock') continue;
    available.push(value.serial || key.slice(String(wanted).length + 1));
  }
  available.sort();
  if (available.length < qty) return null;
  return available.slice(0, qty);
}

/* -------------------------------- stock math ------------------------------ */

function readPools(itemIds, branchIds) {
  const stock = new Map(), maint = new Map(), scrap = new Map(), inspection = new Map(), branch = new Map();
  for (const id of itemIds) {
    const item = itemById(id);
    if (!item) continue;
    stock.set(Number(id), Number(item.stock) || 0);
    maint.set(Number(id), Number(item.maint_qty) || 0);
    scrap.set(Number(id), Number(item.scrap_qty) || 0);
    inspection.set(Number(id), Number(item.inspection_qty) || 0);
  }
  for (const bid of branchIds) {
    const map = new Map();
    for (const row of state.branchItems) {
      if (Number(row.branch_id) === Number(bid)) map.set(Number(row.item_id), Number(row.qty) || 0);
    }
    branch.set(Number(bid), map);
  }
  return { stock, maint, scrap, inspection, branch };
}

const collectIds = (vouchers) => {
  const itemIds = new Set(), branchIds = new Set();
  for (const v of vouchers) {
    if (!v) continue;
    for (const d of voucherDeltas(v)) {
      itemIds.add(Number(d.itemId));
      if (d.branchId != null) branchIds.add(Number(d.branchId));
    }
  }
  return { itemIds: [...itemIds], branchIds: [...branchIds] };
};

function applyDeltasToState(deltas) {
  const itemIds = [...new Set(deltas.map((d) => Number(d.itemId)))];
  const branchIds = [...new Set(deltas.filter((d) => d.branchId != null).map((d) => Number(d.branchId)))];
  const current = readPools(itemIds, branchIds);
  const result = applyDeltas(current, deltas);
  if (!result.ok) return result;
  for (const [id, val] of result.stock) {
    const item = itemById(id);
    if (item) item.stock = val;
  }
  for (const [id, val] of result.maint) {
    const item = itemById(id);
    if (item) item.maint_qty = val;
  }
  for (const [id, val] of result.scrap) {
    const item = itemById(id);
    if (item) item.scrap_qty = val;
  }
  for (const [id, val] of result.inspection) {
    const item = itemById(id);
    if (item) item.inspection_qty = val;
  }
  for (const [bid, map] of result.branch) {
    for (const [iid, val] of map) setBranchQty(bid, iid, val);
  }
  return result;
}

// Replace `oldVoucher` with `newVoucher` (either may be null): reverse the old
// effect first, then apply the new one, validating only the final balances.
function applyChange(oldVoucher, newVoucher) {
  return applyDeltasToState(planChange(oldVoucher, newVoucher));
}

function applyScrap(lines) {
  return applyDeltasToState(scrapDeltas(lines));
}

function stockError(r) {
  if (r.error === 'inspection') return 'لا يمكن إلغاء الفحص: الكمية غير موجودة في حجز الفحص';
  if (r.error === 'maint') return 'لا يمكن الإرجاع: الكمية أكبر من الرصيد تحت الصيانة';
  if (r.error === 'scrap') return 'لا يمكن الصرف: الكمية أكبر من رصيد الخردة';
  if (r.error === 'stock') return 'لا يمكن إتمام الصرف: الكمية المطلوبة أكبر من رصيد المخزن';
  return 'الكمية غير كافية في الفرع المحدد';
}

/* --------------------------- voucher serial rules ------------------------- */

function validateSerials(n, excludeVoucherId) {
  const itemIds = [...new Set(n.lines.map((l) => Number(l.itemId)))];
  if (!itemIds.length) return null;
  for (const id of itemIds) if (!itemById(id)) return 'الصنف المحدد غير موجود';

  const ledger = serialLedger(itemIds, excludeVoucherId);
  const seen = new Map();
  for (const line of n.lines) {
    const item = itemById(line.itemId);
    if (!hasSerial(line.itemId)) { line.serials = []; continue; }
    if (line.serials.length !== line.qty) return 'اكتب سيريال لكل قطعة من صنف ' + item.name;
    if (line.serials.some((s) => !String(s || '').trim())) return 'اكتب كل سيريالات صنف ' + item.name;
    if (!seen.has(line.itemId)) seen.set(line.itemId, new Set());
    const seenItem = seen.get(line.itemId);
    for (const raw of line.serials) {
      const sn = String(raw).trim();
      const key = sn.toLowerCase();
      if (seenItem.has(key)) return 'سيريال مكرر: ' + sn;
      seenItem.add(key);
      const current = ledger.get(serialKey(line.itemId, sn));
      if (n.direction === 'out') {
        if (!current || current.state !== 'stock') return 'السيريال ' + sn + ' غير متاح في المخزن للصنف ' + item.name;
      } else if (n.kind === 'maint') {
        if (!current || current.state !== 'maint') return 'السيريال ' + sn + ' غير موجود تحت الصيانة للصنف ' + item.name;
      } else if (n.kind === 'br') {
        if (!current || current.state !== 'branch' || current.branchId !== Number(n.branchId)) {
          return 'السيريال ' + sn + ' غير موجود في الفرع المحدد للصنف ' + item.name;
        }
      } else if (current) {
        return 'السيريال ' + sn + ' مسجل من قبل للصنف ' + item.name;
      }
    }
  }
  return null;
}

const touchesPool = (n) =>
  (n.direction === 'out' && n.kind === 'sup') || n.kind === 'maint'
    || n.lines.some((l) => ['maint', 'scrap'].includes(lineState(l)));

function assertUniqueNumber(direction, number, excludeId) {
  const target = String(number).trim().toLowerCase();
  const clash = liveVouchers().find((v) => Number(v.id) !== Number(excludeId)
    && v.direction === direction
    && String(v.number).trim().toLowerCase() === target);
  if (clash) fail(400, 'رقم الإذن مسجل من قبل');
}

/* --------------------------- maintenance links ---------------------------- */

function clearVoucherLinks(voucherId, actor) {
  const id = String(voucherId);
  if (state.dispatchMeta[id]) delete state.dispatchMeta[id];
  for (const form of state.forms) {
    let changed = false;
    if (String(form.issuePermitId || '') === id) {
      form.issuePermitId = null;
      form.issuePermitNumber = '';
      if (form.status === 'sent_external') form.status = 'received';
      changed = true;
    }
    if (String(form.entryPermitId || '') === id) {
      form.entryPermitId = null;
      form.entryPermitNumber = '';
      if (form.status === 'received_after_maintenance') {
        form.status = form.maintenanceType === 'external' ? 'sent_external' : 'internal_check';
      }
      changed = true;
    }
    if (String(form.receiptVoucherId || '') === id) {
      form.receiptVoucherId = null;
      form.receiptVoucherNumber = '';
      if (form.status === 'returned_to_branch') form.status = 'received_after_maintenance';
      changed = true;
    }
    if (Array.isArray(form.dispatchLinks)) {
      const kept = form.dispatchLinks.filter((l) => String(l && l.permitId) !== id);
      if (kept.length !== form.dispatchLinks.length) { form.dispatchLinks = kept; changed = true; }
    }
    if (changed) {
      form.updatedAt = nowIso();
      form.updatedBy = actor || 'system';
    }
  }
}

function syncFormToDispatch(form, voucher, actor) {
  if (!form || !voucher) return;
  form.issuePermitId = voucher.id;
  form.issuePermitNumber = voucher.number;
  if (form.status === 'received' || form.status === 'internal_check') form.status = 'sent_external';
  if (!Array.isArray(form.dispatchLinks)) form.dispatchLinks = [];
  form.dispatchLinks = form.dispatchLinks.filter((l) => Number(l && l.permitId) !== Number(voucher.id));
  form.dispatchLinks.push({ permitId: voucher.id, permitNumber: voucher.number, date: day(voucher.doc_date) });
  form.updatedAt = nowIso();
  form.updatedBy = actor || 'system';
}

function unlinkFormFromDispatch(form, actor) {
  if (!form) return;
  form.issuePermitId = null;
  form.issuePermitNumber = '';
  if (form.status === 'sent_external') form.status = 'received';
  if (Array.isArray(form.dispatchLinks)) form.dispatchLinks = [];
  form.updatedAt = nowIso();
  form.updatedBy = actor || 'system';
}

function voucherLink(form, key, value, actor) {
  // Attach a real voucher to a maintenance form, keeping ids/numbers in sync.
  if (value == null || value === '') {
    form[key] = null;
    return;
  }
  const id = Number(value);
  const voucher = voucherById(id);
  if (!voucher) fail(400, 'الإذن المرتبط غير موجود');
  if (key === 'issuePermitId') {
    if (voucher.direction !== 'out') fail(400, 'إذن الصرف المرتبط غير صالح');
    form.issuePermitId = voucher.id;
    form.issuePermitNumber = voucher.number;
  } else if (key === 'entryPermitId') {
    if (voucher.direction !== 'in') fail(400, 'إذن الاستلام المرتبط غير صالح');
    form.entryPermitId = voucher.id;
    form.entryPermitNumber = voucher.number;
  } else if (key === 'receiptVoucherId') {
    if (voucher.direction !== 'in') fail(400, 'إذن الاستلام المرتبط غير صالح');
    form.receiptVoucherId = voucher.id;
    form.receiptVoucherNumber = voucher.number;
  }
}

/* -------------------------------- bootstrap ------------------------------- */

const DEFAULT_STATUS_ORDER = { review: 0, pending: 1, approved: 2, released: 3, rejected: 4 };

function bootstrap(role) {
  const junior = role === 'junior';
  const categoryName = new Map(state.categories.map((c) => [Number(c.id), c.name]));
  const supplierName = new Map(state.suppliers.map((s) => [Number(s.id), s.name]));
  const branchQtyMap = {};
  for (const row of state.branchItems) {
    (branchQtyMap[row.branch_id] = branchQtyMap[row.branch_id] || {})[row.item_id] = row.qty;
  }

  const vouchers = liveVouchers().slice().sort((a, b) => Number(b.id) - Number(a.id)).map((v) => ({
    id: v.id,
    d: day(v.doc_date),
    k: v.kind,
    sup: v.supplier_id ? (supplierName.get(Number(v.supplier_id)) || '') : '',
    b: v.branch_id == null ? null : Number(v.branch_id),
    p: v.number,
    by: v.created_by,
    ed: v.edited_by || null,
    sb: v.source_branch || '',
    direction: v.direction,
    lines: (v.lines || []).map((l) => ({
      i: l.item_id,
      q: l.qty,
      sns: Array.isArray(l.serials) ? l.serials : [],
      cd: l.item_condition || '',
      st: l.state || 'stock',
      rs: l.reason || '',
      nt: l.note || '',
      mfi: l.maintenance_form_id || null,
      insp: l.inspection ? {
        status: l.inspection.status || '',
        condition: l.inspection.condition || '',
        notes: l.inspection.notes || '',
        photos: (l.inspection.photos || []).map((photo) => ({ id: photo.id, url: '/api/inspection-photos/' + encodeURIComponent(photo.id) })),
        decision: l.inspection.decision || '',
        reviewedBy: l.inspection.reviewed_by || '',
        reviewedAt: l.inspection.reviewed_at || '',
        reviewNotes: l.inspection.review_notes || ''
      } : null,
      hw: !!l.has_warranty,
      wu: l.warranty_until || ''
    }))
  }));

  const requests = state.requests.slice().sort((a, b) => Number(b.id) - Number(a.id)).map((r) => ({
    id: r.id,
    b: r.branch_id,
    by: r.requested_by,
    st: r.status,
    d: day(r.created_at),
    l: (r.lines || []).map((l) => ({ i: l.item_id, q: l.qty })),
    log: (r.log || []).map((g) => ({ by: g.by_name, a: g.action, k: g.kind || '', t: g.note || '' }))
  }));

  return {
    categories: state.categories.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((c) => ({
      id: c.id,
      name: c.name,
      has_serial: !!c.has_serial,
      supplier: c.supplier_id ? (supplierName.get(Number(c.supplier_id)) || '') : '',
      by: c.created_by || '',
      d: day(c.created_at)
    })),
    items: state.items.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((i) => {
      const row = {
        id: i.id,
        n: i.name,
        c: categoryName.get(Number(i.category_id)) || '',
        by: i.created_by || '',
        w: i.warranty_until || '',
        note: i.notes || '',
        hw: i.has_warranty == null ? null : !!i.has_warranty,
        held: Number(i.inspection_qty) || 0,
        d: day(i.created_at)
      };
      if (!junior) row.s = Number(i.stock) || 0;
      return row;
    }),
    branches: state.branches.slice().sort((a, b) => Number(a.id) - Number(b.id)).map((b) => {
      const row = {
        id: b.id,
        n: b.name,
        number: b.number || '',
        g: b.gov || '',
        manager: b.manager || '',
        phone: b.phone || '',
        address: b.address || '',
        location: b.location || '',
        by: b.created_by || '',
        d: day(b.created_at)
      };
      if (!junior) row.q = branchQtyMap[b.id] || {};
      return row;
    }),
    suppliers: state.suppliers.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).map((s) => ({
      id: s.id,
      n: s.name,
      company: s.company || '',
      address: s.address || '',
      phone: s.phone || '',
      landline: s.landline || '',
      maint: !!s.accepts_maintenance,
      by: s.created_by || '',
      d: day(s.created_at)
    })),
    maintenance: junior ? [] : state.items.filter((i) => Number(i.maint_qty) > 0).map((i) => ({ i: i.id, q: i.maint_qty })),
    scrap: junior ? [] : state.items.filter((i) => Number(i.scrap_qty) > 0).map((i) => ({ i: i.id, q: i.scrap_qty })),
    vouchers: {
      in: vouchers.filter((v) => v.direction === 'in'),
      out: vouchers.filter((v) => v.direction === 'out')
    },
    scrapLog: junior ? [] : state.scrapEntries.slice().sort((a, b) => Number(b.id) - Number(a.id)).map((r) => ({
      id: r.id,
      i: r.item_id,
      q: r.qty,
      sns: Array.isArray(r.serials) ? r.serials : [],
      by: r.created_by || '',
      at: r.created_at || ''
    })),
    requests,
    maintenanceForms: state.forms,
    dispatchMeta: junior ? {} : state.dispatchMeta
  };
}

function pendingInspections() {
  const itemNames = new Map(state.items.map((item) => [Number(item.id), item.name]));
  const supplierNames = new Map(state.suppliers.map((supplier) => [Number(supplier.id), supplier.name]));
  const branchNames = new Map(state.branches.map((branch) => [Number(branch.id), branch.name]));
  const rows = [];
  liveVouchers().filter((voucher) => voucher.direction === 'in').forEach((voucher) => {
    (voucher.lines || []).filter((line) => String(line.state) === 'inspection').forEach((line) => {
      const inspection = line.inspection || {};
      rows.push({
        voucherId: voucher.id,
        lineId: line.id,
        number: voucher.number,
        date: day(voucher.doc_date),
        kind: voucher.kind,
        party: voucher.kind === 'br' ? branchNames.get(Number(voucher.branch_id)) || '' : supplierNames.get(Number(voucher.supplier_id)) || '',
        itemId: line.item_id,
        item: itemNames.get(Number(line.item_id)) || '',
        qty: Number(line.qty) || 0,
        serials: Array.isArray(line.serials) ? line.serials : [],
        condition: inspection.condition || line.item_condition || '',
        notes: inspection.notes || '',
        photos: (inspection.photos || []).map((photo) => ({ id: photo.id, url: '/api/inspection-photos/' + encodeURIComponent(photo.id) }))
      });
    });
  });
  return rows.sort((a, b) => Number(a.voucherId) - Number(b.voucherId));
}

/* ------------------------------ startup pass ------------------------------ */

load();

// Repair links left behind by older data: never keep a dangling voucher id in a
// form and never keep dispatch metadata for a missing voucher.
function reconcile() {
  const outIds = new Set(liveVouchers().filter((v) => v.direction === 'out').map((v) => String(v.id)));
  const inIds = new Set(liveVouchers().filter((v) => v.direction === 'in').map((v) => String(v.id)));
  for (const form of state.forms) {
    if (form.issuePermitId != null && !outIds.has(String(form.issuePermitId))) {
      form.issuePermitId = null;
      form.issuePermitNumber = '';
      if (form.status === 'sent_external') form.status = 'received';
    }
    if (form.entryPermitId != null && !inIds.has(String(form.entryPermitId))) {
      form.entryPermitId = null;
      form.entryPermitNumber = '';
      if (form.status === 'received_after_maintenance') form.status = 'internal_check';
    }
    if (form.receiptVoucherId != null && !inIds.has(String(form.receiptVoucherId))) {
      form.receiptVoucherId = null;
      form.receiptVoucherNumber = '';
      if (form.status === 'returned_to_branch') form.status = 'received_after_maintenance';
    }
    if (Array.isArray(form.dispatchLinks)) {
      form.dispatchLinks = form.dispatchLinks.filter((l) => l && outIds.has(String(l.permitId)));
    }
  }
  const meta = {};
  for (const [key, value] of Object.entries(state.dispatchMeta)) {
    if (!outIds.has(String(key))) continue;
    const entry = asObject(value);
    if (entry.maintenanceFormId != null && !formById(entry.maintenanceFormId)) entry.maintenanceFormId = null;
    meta[key] = entry;
  }
  state.dispatchMeta = meta;
  state.requests = state.requests.map((r) => Object.assign({}, r, {
    lines: asArray(r.lines),
    log: asArray(r.log),
    status: DEFAULT_STATUS_ORDER[r.status] == null ? r.status : r.status
  }));
}

module.exports = {
  ApiError,
  fail,
  tx,
  bootstrap,
  nowIso,
  day,
  state,
  pendingInspections,
  liveVouchers,
  voucherById,
  itemById,
  categoryById,
  categoryByName,
  branchById,
  supplierByName,
  ensureSupplier,
  hasSerial,
  branchQty,
  setBranchQty,
  serialLedger,
  serialKey,
  pickStockSerials,
  validateSerials,
  collectIds,
  applyChange,
  applyScrap,
  stockError,
  touchesPool,
  assertUniqueNumber,
  clearVoucherLinks,
  syncFormToDispatch,
  unlinkFormFromDispatch,
  voucherLink,
  formById,
  lineState,
  withAudit
};
