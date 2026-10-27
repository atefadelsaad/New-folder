'use strict';
const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getPool, sql } = require('./db');
const { sign, auth } = require('./auth');
const { can } = require('./roles');
const { voucherDeltas, scrapDeltas, applyDeltas, planChange } = require('./stock');

const router = express.Router();

const guard = (perm) => (req, res, next) =>
  can(req.user.role, perm) ? next() : res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' });

const asInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const asDate = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const sqlReq = (client) => new sql.Request(client);

function parseSerials(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول لاحقًا' }
});

/* --------------------------------- auth --------------------------------- */

router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });
    const pool = await getPool();
    const r = await pool.request().input('u', sql.NVarChar(64), username).query('SELECT * FROM users WHERE username = @u');
    const user = r.recordset[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    res.json({ token: sign(user), user: { username: user.username, role: user.role, name: user.name } });
  } catch (err) { next(err); }
});

router.use(auth);

router.get('/auth/me', (req, res) => res.json({ user: req.user }));

/* ------------------------------- bootstrap ------------------------------ */

async function loadBootstrap(role) {
  const pool = await getPool();
  const cats = await pool.request().query('SELECT c.id, c.name, c.has_serial, c.created_by, c.created_at, s.name AS supplier FROM categories c LEFT JOIN suppliers s ON s.id = c.supplier_id ORDER BY c.id');
  const items = await pool.request().query(
    'SELECT i.id, i.name, i.stock, i.maint_qty, i.scrap_qty, i.created_by, i.created_at, i.warranty_until, i.notes, i.has_warranty, c.name AS category FROM items i JOIN categories c ON c.id = i.category_id ORDER BY i.id'
  );
  const branches = await pool.request().query('SELECT id, name, number, gov, manager, phone, address, location, created_by, created_at FROM branches ORDER BY id');
  const branchItems = await pool.request().query('SELECT branch_id, item_id, qty FROM branch_items');
  const suppliers = await pool.request().query('SELECT id, name, company, address, phone, landline, accepts_maintenance, created_by, created_at FROM suppliers ORDER BY name');
  const vouchers = await pool.request().query(
    `SELECT v.id, v.direction, v.kind, v.number, v.branch_id, v.created_by, v.edited_by, v.doc_date, v.source_branch, s.name AS supplier_name
       FROM vouchers v LEFT JOIN suppliers s ON s.id = v.supplier_id
      WHERE v.deleted_at IS NULL ORDER BY v.id DESC`
  );
  const lines = await pool.request().query(
    `SELECT vl.voucher_id, vl.item_id, vl.qty, vl.serials, vl.state, vl.reason, vl.line_note, vl.has_warranty, vl.line_warranty_until
       FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
      WHERE v.deleted_at IS NULL ORDER BY vl.id`
  );
  const scrapLog = await pool.request().query(
    'SELECT id, item_id, qty, serials, created_by, created_at FROM scrap_entries ORDER BY id DESC'
  );
  const requests = await pool.request().query('SELECT id, branch_id, requested_by, status, created_at FROM requests ORDER BY id DESC');
  const reqLines = await pool.request().query('SELECT request_id, item_id, qty FROM request_lines ORDER BY id');
  const logs = await pool.request().query('SELECT request_id, by_name, action, kind, note FROM request_logs ORDER BY id');

  const q = {};
  branchItems.recordset.forEach((r) => { (q[r.branch_id] = q[r.branch_id] || {})[r.item_id] = r.qty; });

  const linesByVoucher = {};
  lines.recordset.forEach((r) => {
    const sns = parseSerials(r.serials);
    (linesByVoucher[r.voucher_id] = linesByVoucher[r.voucher_id] || []).push({
      i: r.item_id, q: r.qty, sns, cd: r.item_condition || '', st: r.state || 'stock',
      rs: r.reason || '', nt: r.line_note || '',
      hw: !!r.has_warranty,
      wu: r.line_warranty_until ? new Date(r.line_warranty_until).toISOString().slice(0, 10) : ''
    });
  });

  const voucherRows = vouchers.recordset.map((r) => ({
    id: r.id, d: r.doc_date, k: r.kind, sup: r.supplier_name || '',
    b: r.branch_id, p: r.number, by: r.created_by, ed: r.edited_by,
    sb: r.source_branch || '',
    direction: r.direction, lines: linesByVoucher[r.id] || []
  }));

  const linesByRequest = {};
  reqLines.recordset.forEach((r) => { (linesByRequest[r.request_id] = linesByRequest[r.request_id] || []).push({ i: r.item_id, q: r.qty }); });
  const logsByRequest = {};
  logs.recordset.forEach((r) => {
    (logsByRequest[r.request_id] = logsByRequest[r.request_id] || []).push({ by: r.by_name, a: r.action, k: r.kind || '', t: r.note || '' });
  });

  // Warehouse balances are hidden from junior technicians.
  const junior = role === 'junior';
  const maintenance = junior ? [] : items.recordset.filter((r) => r.maint_qty > 0).map((r) => ({ i: r.id, q: r.maint_qty }));
  const scrap = junior ? [] : items.recordset.filter((r) => r.scrap_qty > 0).map((r) => ({ i: r.id, q: r.scrap_qty }));

  return {
    categories: cats.recordset.map((r) => ({
      id: r.id, name: r.name, has_serial: !!r.has_serial, supplier: r.supplier || '',
      by: r.created_by || '', d: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ''
    })),
    items: items.recordset.map((r) => ({
      id: r.id, n: r.name, c: r.category, s: junior ? 0 : r.stock, by: r.created_by,
      w: r.warranty_until ? new Date(r.warranty_until).toISOString().slice(0, 10) : '',
      note: r.notes || '',
      hw: r.has_warranty == null ? null : !!r.has_warranty,
      d: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ''
    })),
    branches: branches.recordset.map((r) => ({
      id: r.id, n: r.name, number: r.number || '', g: r.gov, manager: r.manager || '',
      phone: r.phone || '', address: r.address || '', location: r.location || '',
      by: r.created_by,
      d: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      q: q[r.id] || {}
    })),
    suppliers: suppliers.recordset.map((r) => ({
      id: r.id, n: r.name, company: r.company || '', address: r.address || '',
      phone: r.phone || '', landline: r.landline || '', maint: !!r.accepts_maintenance,
      by: r.created_by || '', d: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : ''
    })),
    maintenance,
    scrap,
    vouchers: {
      in: voucherRows.filter((v) => v.direction === 'in'),
      out: voucherRows.filter((v) => v.direction === 'out')
    },
    scrapLog: junior ? [] : scrapLog.recordset.map((r) => ({
      id: r.id, i: r.item_id, q: r.qty, sns: parseSerials(r.serials),
      by: r.created_by || '',
      at: r.created_at ? new Date(r.created_at).toISOString() : ''
    })),
    requests: requests.recordset.map((r) => ({
      id: r.id, b: r.branch_id, by: r.requested_by, st: r.status,
      d: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      l: linesByRequest[r.id] || [], log: logsByRequest[r.id] || []
    }))
  };
}

router.get('/bootstrap', async (req, res, next) => {
  try {
    const data = await loadBootstrap(req.user.role);
    data.user = { role: req.user.role, name: req.user.name, username: req.user.username };
    res.json(data);
  } catch (err) { next(err); }
});

/* ------------------------------ master data ----------------------------- */

async function categoryIdOn(client, name) {
  const r = await sqlReq(client).input('n', sql.NVarChar(120), name).query('SELECT id FROM categories WHERE name = @n');
  if (!r.recordset.length) throw new Error('الفئة غير موجودة');
  return r.recordset[0].id;
}

async function supplierIdOn(client, name) {
  await sqlReq(client).input('n', sql.NVarChar(160), name)
    .query('IF NOT EXISTS (SELECT 1 FROM suppliers WHERE name = @n) INSERT INTO suppliers (name) VALUES (@n)');
  const r = await sqlReq(client).input('n', sql.NVarChar(160), name).query('SELECT id FROM suppliers WHERE name = @n');
  return r.recordset[0].id;
}

router.post('/categories', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الفئة' });
    const pool = await getPool();
    const supplier = String(req.body.supplier || '').trim();
    const supplierId = supplier ? await supplierIdOn(pool, supplier) : null;
    await pool.request()
      .input('n', sql.NVarChar(120), name)
      .input('s', sql.Bit, req.body.has_serial !== false ? 1 : 0)
      .input('sup', sql.Int, supplierId)
      .input('by', sql.NVarChar(120), req.user.name)
      .query('IF NOT EXISTS (SELECT 1 FROM categories WHERE name = @n) INSERT INTO categories (name, has_serial, supplier_id, created_by) VALUES (@n, @s, @sup, @by)');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/categories/:name', guard('stock'), async (req, res, next) => {
  try {
    const current = req.params.name;
    const nextName = String(req.body.name || '').trim();
    const pool = await getPool();
    const exists = await pool.request().input('n', sql.NVarChar(120), current).query('SELECT id FROM categories WHERE name = @n');
    if (!exists.recordset.length) return res.status(404).json({ error: 'الفئة غير موجودة' });
    if (nextName && nextName !== current) {
      const dup = await pool.request().input('n', sql.NVarChar(120), nextName).query('SELECT 1 AS x FROM categories WHERE name = @n');
      if (dup.recordset.length) return res.status(400).json({ error: 'اسم الفئة موجود بالفعل' });
      await pool.request().input('a', sql.NVarChar(120), nextName).input('b', sql.NVarChar(120), current)
        .query('UPDATE categories SET name = @a WHERE name = @b');
    }
    if ('has_serial' in req.body) {
      await pool.request().input('s', sql.Bit, req.body.has_serial ? 1 : 0).input('n', sql.NVarChar(120), nextName || current)
        .query('UPDATE categories SET has_serial = @s WHERE name = @n');
    }
    if ('supplier' in req.body) {
      const supplier = String(req.body.supplier || '').trim();
      const supplierId = supplier ? await supplierIdOn(pool, supplier) : null;
      await pool.request().input('sup', sql.Int, supplierId).input('n', sql.NVarChar(120), nextName || current)
        .query('UPDATE categories SET supplier_id = @sup WHERE name = @n');
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const ITEM_USED_SQL = `
  SELECT TOP 1 1 AS x FROM items i
   WHERE i.category_id = @id AND (
     EXISTS (SELECT 1 FROM branch_items bi WHERE bi.item_id = i.id AND bi.qty > 0)
     OR EXISTS (SELECT 1 FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id WHERE vl.item_id = i.id AND v.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM request_lines rl WHERE rl.item_id = i.id))`;

router.delete('/categories/:name', guard('stock'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const name = req.params.name;
    const cat = await pool.request().input('n', sql.NVarChar(120), name).query('SELECT id FROM categories WHERE name = @n');
    if (!cat.recordset.length) return res.status(404).json({ error: 'الفئة غير موجودة' });
    const id = cat.recordset[0].id;
    const used = await pool.request().input('id', sql.Int, id).query(ITEM_USED_SQL);
    if (used.recordset.length) return res.status(400).json({ error: 'لا يمكن حذف الفئة: بعض أصنافها مستخدمة في فروع أو أذونات أو طلبات' });
    await tx.begin();
    await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM branch_items WHERE item_id IN (SELECT id FROM items WHERE category_id = @id)');
    await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM items WHERE category_id = @id');
    await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM categories WHERE id = @id');
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    next(err);
  }
});

router.post('/items', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الصنف' });
    if (name.length > 160) return res.status(400).json({ error: 'اسم الصنف أطول من 160 حرفًا' });
    const notes = String(req.body.notes == null ? '' : req.body.notes).trim();
    if (notes.length > 500) return res.status(400).json({ error: 'الملاحظات يجب ألا تتجاوز 500 حرف' });
    const hw = req.body.has_warranty;
    if (hw !== true && hw !== false) return res.status(400).json({ error: 'اختر بضمان أو بدون ضمان' });
    const pool = await getPool();
    const cid = await categoryIdOn(pool, req.body.category);
    const r = await pool.request()
      .input('n', sql.NVarChar(160), name)
      .input('c', sql.Int, cid)
      .input('by', sql.NVarChar(120), req.user.name)
      .input('nt', sql.NVarChar(500), notes || null)
      .input('hw', sql.Bit, hw ? 1 : 0)
      .input('w', sql.Date, asDate(req.body.warranty_until))
      .query(`INSERT INTO items (name, category_id, stock, maint_qty, scrap_qty, created_by, created_at, notes, has_warranty, warranty_until)
              OUTPUT INSERTED.id
              VALUES (@n, @c, 0, 0, 0, @by, SYSUTCDATETIME(), @nt, @hw, @w)`);
    res.json({ ok: true, id: r.recordset[0].id });
  } catch (err) { next(err); }
});

router.put('/items/:id', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اسم الصنف لا يمكن أن يكون فارغًا' });
    if (name.length > 160) return res.status(400).json({ error: 'اسم الصنف أطول من 160 حرفًا' });
    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      const notes = String(req.body.notes == null ? '' : req.body.notes).trim();
      if (notes.length > 500) return res.status(400).json({ error: 'الملاحظات يجب ألا تتجاوز 500 حرف' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'has_warranty')
        && req.body.has_warranty !== true && req.body.has_warranty !== false) {
      return res.status(400).json({ error: 'اختر بضمان أو بدون ضمان' });
    }
    const pool = await getPool();
    const hasCat = Object.prototype.hasOwnProperty.call(req.body, 'category') && String(req.body.category || '').trim();
    const sets = ['name = @n'];
    const request = pool.request()
      .input('n', sql.NVarChar(160), name).input('id', sql.Int, asInt(req.params.id));
    if (hasCat) {
      request.input('c', sql.Int, await categoryIdOn(pool, req.body.category));
      sets.push('category_id = @c');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
      request.input('nt', sql.NVarChar(500), String(req.body.notes == null ? '' : req.body.notes).trim() || null);
      sets.push('notes = @nt');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'has_warranty')) {
      request.input('hw', sql.Bit, req.body.has_warranty ? 1 : 0);
      sets.push('has_warranty = @hw');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'warranty_until')) {
      request.input('w', sql.Date, asDate(req.body.warranty_until));
      sets.push('warranty_until = @w');
    }
    await request.query('UPDATE items SET ' + sets.join(', ') + ' WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const ITEM_IN_USE_SQL = `
  SELECT TOP 1 1 AS x FROM items i WHERE i.id = @id AND (
    EXISTS (SELECT 1 FROM branch_items bi WHERE bi.item_id = i.id AND bi.qty > 0)
    OR EXISTS (SELECT 1 FROM voucher_lines vl WHERE vl.item_id = i.id)
    OR EXISTS (SELECT 1 FROM scrap_entries se WHERE se.item_id = i.id)
    OR EXISTS (SELECT 1 FROM request_lines rl WHERE rl.item_id = i.id))`;

router.delete('/items/:id', guard('stock'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'الحذف متاح لمدير النظام فقط' });
    const id = asInt(req.params.id);
    const pool = await getPool();
    const used = await pool.request().input('id', sql.Int, id).query(ITEM_IN_USE_SQL);
    if (used.recordset.length) return res.status(400).json({ error: 'لا يمكن حذف الصنف لأنه مستخدم في فروع أو أذونات أو طلبات' });
    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM branch_items WHERE item_id = @id');
      await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM items WHERE id = @id');
      await tx.commit();
      res.json({ ok: true });
    } catch (err) {
      try { await tx.rollback(); } catch (_) {}
      throw err;
    }
  } catch (err) { next(err); }
});

router.post('/branches', guard('addBranch'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الفرع' });
    const g = String(req.body.gov || '').trim();
    const dupCheck = await pool.request().input('n', sql.NVarChar(160), name).input('g', sql.NVarChar(80), g)
      .query(`SELECT id FROM branches WHERE LOWER(REPLACE(LTRIM(RTRIM(name)),' ',' ')) = LOWER(REPLACE(LTRIM(RTRIM(@n)),' ',' ')) AND gov = @g`);
    if (dupCheck.recordset.length) return res.status(409).json({ error: 'هذا الفرع موجود مسبقاً (نفس الاسم والمحافظة)' });
    await tx.begin();
    const r = await sqlReq(tx)
      .input('n', sql.NVarChar(160), name)
      .input('num', sql.NVarChar(20), String(req.body.number || '').trim() || null)
      .input('g', sql.NVarChar(80), String(req.body.gov || ''))
      .input('man', sql.NVarChar(120), String(req.body.manager || '').trim() || null)
      .input('ph', sql.NVarChar(30), String(req.body.phone || '').trim() || null)
      .input('addr', sql.NVarChar(500), String(req.body.address || '').trim() || null)
      .input('loc', sql.NVarChar(500), String(req.body.location || '').trim() || null)
      .input('by', sql.NVarChar(120), req.user.name)
      .query('INSERT INTO branches (name, number, gov, manager, phone, address, location, created_by) OUTPUT INSERTED.id VALUES (@n, @num, @g, @man, @ph, @addr, @loc, @by)');
    const branchId = r.recordset[0].id;
    const qty = req.body.qty || {};
    const ids = new Set((req.body.item_ids || []).map(asInt).filter((n) => n > 0));
    Object.entries(qty).forEach(([k, v]) => { if (asInt(v) > 0) ids.add(asInt(k)); });
    for (const itemId of ids) {
      await sqlReq(tx).input('b', sql.Int, branchId).input('i', sql.Int, itemId).input('q', sql.Int, Math.max(0, asInt(qty[itemId])))
        .query('IF NOT EXISTS (SELECT 1 FROM branch_items WHERE branch_id = @b AND item_id = @i) INSERT INTO branch_items (branch_id, item_id, qty) VALUES (@b, @i, @q)');
    }
    await tx.commit();
    res.json({ ok: true, id: branchId });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    next(err);
  }
});

router.put('/branches/:id', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id);
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الفرع' });
    const pool = await getPool();
    await pool.request()
      .input('b', sql.Int, bid)
      .input('n', sql.NVarChar(160), name)
      .input('num', sql.NVarChar(20), String(req.body.number || '').trim() || null)
      .input('g', sql.NVarChar(80), String(req.body.gov || ''))
      .input('man', sql.NVarChar(120), String(req.body.manager || '').trim() || null)
      .input('ph', sql.NVarChar(30), String(req.body.phone || '').trim() || null)
      .input('addr', sql.NVarChar(500), String(req.body.address || '').trim() || null)
      .input('loc', sql.NVarChar(500), String(req.body.location || '').trim() || null)
      .query('UPDATE branches SET name=@n, number=@num, gov=@g, manager=@man, phone=@ph, address=@addr, location=@loc WHERE id=@b');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/branches/:id/items', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id), iid = asInt(req.body.item_id);
    if (!iid) return res.status(400).json({ error: 'اختر صنفًا' });
    const pool = await getPool();
    await pool.request().input('b', sql.Int, bid).input('i', sql.Int, iid)
      .query('IF NOT EXISTS (SELECT 1 FROM branch_items WHERE branch_id = @b AND item_id = @i) INSERT INTO branch_items (branch_id, item_id, qty) VALUES (@b, @i, 0)');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/branches/:id/items/:itemId', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id), iid = asInt(req.params.itemId);
    const pool = await getPool();
    const row = await pool.request().input('b', sql.Int, bid).input('i', sql.Int, iid)
      .query('SELECT qty FROM branch_items WHERE branch_id = @b AND item_id = @i');
    if (row.recordset.length && row.recordset[0].qty > 0) {
      return res.status(400).json({ error: 'لا يمكن إزالة صنف موجود فعليًا في الفرع. انقله أولًا.' });
    }
    await pool.request().input('b', sql.Int, bid).input('i', sql.Int, iid)
      .query('DELETE FROM branch_items WHERE branch_id = @b AND item_id = @i');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/branches/:id/qty', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id), iid = asInt(req.body.item_id), qty = Math.max(0, asInt(req.body.qty));
    const pool = await getPool();
    await pool.request().input('b', sql.Int, bid).input('i', sql.Int, iid).input('q', sql.Int, qty)
      .query(`IF EXISTS (SELECT 1 FROM branch_items WHERE branch_id = @b AND item_id = @i)
                UPDATE branch_items SET qty = @q WHERE branch_id = @b AND item_id = @i
              ELSE INSERT INTO branch_items (branch_id, item_id, qty) VALUES (@b, @i, @q)`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/branches/:id', guard('addBranch'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id);
    const pool = await getPool();
    // Check usage: vouchers referencing branch_id, requests, scrap, items qty>0
    const before = (await pool.request().input('b', sql.Int, bid).query('SELECT name, gov FROM branches WHERE id = @b')).recordset[0];
    const bname = before ? before.name : '';
    const vRef = await pool.request().input('b', sql.Int, bid).input('n', sql.NVarChar(160), bname)
      .query('SELECT COUNT(*) AS c FROM vouchers WHERE branch_id = @b OR source_branch = @n');
    const rRef = await pool.request().input('b', sql.Int, bid).query('SELECT COUNT(*) AS c FROM requests WHERE branch_id = @b');
    const iRef = await pool.request().input('b', sql.Int, bid).query('SELECT COUNT(*) AS c FROM branch_items WHERE branch_id = @b AND qty > 0');
    const blocks = [];
    if (vRef.recordset[0].c > 0) blocks.push('أذون: ' + vRef.recordset[0].c);
    if (rRef.recordset[0].c > 0) blocks.push('طلبات: ' + rRef.recordset[0].c);
    if (iRef.recordset[0].c > 0) blocks.push('أصناف بالفرع: ' + iRef.recordset[0].c);
    if (blocks.length) return res.status(409).json({ error: 'لا يمكن الحذف، هنالك مراجع: ' + blocks.join('، ') });
    const tx = new sql.Transaction(pool);
    try {
      await tx.begin();
      await sqlReq(tx).input('b', sql.Int, bid).query('DELETE FROM branch_items WHERE branch_id = @b');
      await sqlReq(tx).input('b', sql.Int, bid).query('DELETE FROM branches WHERE id = @b');
      await tx.commit();
    } catch (err) {
      try { await tx.rollback(); } catch (_) {}
      throw err;
    }
    // Audit trail is best effort: the branch is already deleted, so a missing
    // or unwritable file must never turn a successful delete into a 500.
    try {
      fs.mkdirSync('data', { recursive: true });
      let audit = [];
      try { audit = JSON.parse(fs.readFileSync('data/audit.json', 'utf8') || '[]'); } catch (_) { audit = []; }
      if (!Array.isArray(audit)) audit = [];
      audit.push({ user: req.user?.name || null, action: 'delete-branch', entity: 'branch', entity_id: bid, before: before || null, at: new Date().toISOString() });
      fs.writeFileSync('data/audit.json', JSON.stringify(audit, null, 2));
    } catch (_) { /* audit is non-critical */ }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const supText = (v, n) => String(v == null ? '' : v).trim().slice(0, n) || null;

router.post('/suppliers', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم المورد' });
    const pool = await getPool();
    await pool.request()
      .input('n', sql.NVarChar(160), name)
      .input('co', sql.NVarChar(200), supText(req.body.company, 200))
      .input('ad', sql.NVarChar(300), supText(req.body.address, 300))
      .input('ph', sql.NVarChar(60), supText(req.body.phone, 60))
      .input('ll', sql.NVarChar(60), supText(req.body.landline, 60))
      .input('mt', sql.Bit, req.body.accepts_maintenance ? 1 : 0)
      .input('by', sql.NVarChar(120), req.user.name)
      .query(`IF NOT EXISTS (SELECT 1 FROM suppliers WHERE name = @n)
                INSERT INTO suppliers (name, company, address, phone, landline, accepts_maintenance, created_by)
                VALUES (@n, @co, @ad, @ph, @ll, @mt, @by)`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/suppliers/:id', guard('stock'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم المورد' });
    const pool = await getPool();
    const exists = await pool.request().input('id', sql.Int, id).query('SELECT 1 AS x FROM suppliers WHERE id = @id');
    if (!exists.recordset.length) return res.status(404).json({ error: 'المورد غير موجود' });
    const dup = await pool.request().input('n', sql.NVarChar(160), name).input('id', sql.Int, id)
      .query('SELECT 1 AS x FROM suppliers WHERE name = @n AND id <> @id');
    if (dup.recordset.length) return res.status(400).json({ error: 'اسم المورد موجود بالفعل' });
    await pool.request()
      .input('id', sql.Int, id)
      .input('n', sql.NVarChar(160), name)
      .input('co', sql.NVarChar(200), supText(req.body.company, 200))
      .input('ad', sql.NVarChar(300), supText(req.body.address, 300))
      .input('ph', sql.NVarChar(60), supText(req.body.phone, 60))
      .input('ll', sql.NVarChar(60), supText(req.body.landline, 60))
      .input('mt', sql.Bit, req.body.accepts_maintenance ? 1 : 0)
      .query('UPDATE suppliers SET name = @n, company = @co, address = @ad, phone = @ph, landline = @ll, accepts_maintenance = @mt WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/suppliers/:id', guard('stock'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pool = await getPool();
    const used = await pool.request().input('id', sql.Int, id)
      .query('SELECT TOP 1 1 AS x FROM vouchers WHERE supplier_id = @id OR EXISTS (SELECT 1 FROM categories WHERE supplier_id = @id)');
    if (used.recordset.length) return res.status(400).json({ error: 'لا يمكن حذف المورد: مستخدم في أذونات أو فئات' });
    await pool.request().input('id', sql.Int, id).query('DELETE FROM suppliers WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* -------------------------------- vouchers ------------------------------ */

async function readState(client, itemIds, branchIds) {
  const stock = new Map(), maint = new Map(), scrap = new Map(), branch = new Map();
  if (itemIds.length) {
    const r = await sqlReq(client).input('ids', sql.NVarChar(sql.MAX), JSON.stringify(itemIds))
      .query('SELECT id, stock, maint_qty, scrap_qty FROM items WITH (UPDLOCK, ROWLOCK) WHERE id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))');
    for (const row of r.recordset) { stock.set(row.id, row.stock); maint.set(row.id, row.maint_qty); scrap.set(row.id, row.scrap_qty); }
  }
  if (branchIds.length) {
    const r = await sqlReq(client).input('ids', sql.NVarChar(sql.MAX), JSON.stringify(branchIds))
      .query('SELECT branch_id, item_id, qty FROM branch_items WHERE branch_id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))');
    for (const row of r.recordset) {
      if (!branch.has(row.branch_id)) branch.set(row.branch_id, new Map());
      branch.get(row.branch_id).set(row.item_id, row.qty);
    }
  }
  return { stock, maint, scrap, branch };
}

async function applyAndPersist(client, deltas, itemIds, branchIds) {
  const current = await readState(client, itemIds, branchIds);
  const result = applyDeltas(current, deltas);
  if (!result.ok) return result;
  for (const [id, val] of result.stock) {
    if ((current.stock.get(id) || 0) !== val) await sqlReq(client).input('v', sql.Int, val).input('id', sql.Int, id).query('UPDATE items SET stock = @v WHERE id = @id');
  }
  for (const [id, val] of result.maint) {
    if ((current.maint.get(id) || 0) !== val) await sqlReq(client).input('v', sql.Int, val).input('id', sql.Int, id).query('UPDATE items SET maint_qty = @v WHERE id = @id');
  }
  for (const [id, val] of result.scrap) {
    if ((current.scrap.get(id) || 0) !== val) await sqlReq(client).input('v', sql.Int, val).input('id', sql.Int, id).query('UPDATE items SET scrap_qty = @v WHERE id = @id');
  }
  for (const [bid, map] of result.branch) {
    const before = current.branch.get(bid) || new Map();
    for (const [iid, val] of map) {
      if (before.get(iid) !== val) {
        await sqlReq(client).input('b', sql.Int, bid).input('i', sql.Int, iid).input('q', sql.Int, val)
          .query(`IF EXISTS (SELECT 1 FROM branch_items WHERE branch_id = @b AND item_id = @i)
                    UPDATE branch_items SET qty = @q WHERE branch_id = @b AND item_id = @i
                  ELSE INSERT INTO branch_items (branch_id, item_id, qty) VALUES (@b, @i, @q)`);
      }
    }
  }
  return result;
}

function collectIds(vouchers) {
  const itemIds = new Set(), branchIds = new Set();
  for (const v of vouchers) {
    if (!v) continue;
    for (const d of voucherDeltas(v)) {
      itemIds.add(d.itemId);
      if (d.branchId != null) branchIds.add(d.branchId);
    }
  }
  return { itemIds: [...itemIds], branchIds: [...branchIds] };
}

function stockError(r) {
  if (r.error === 'maint') return { error: 'لا يمكن الإرجاع: الكمية أكبر من الرصيد تحت الصيانة' };
  if (r.error === 'scrap') return { error: 'لا يمكن الصرف: الكمية أكبر من رصيد الخردة' };
  if (r.error === 'stock') return { error: 'لا يمكن إتمام الصرف: الكمية المطلوبة أكبر من رصيد المخزن' };
  return { error: 'الكمية غير كافية في الفرع المحدد' };
}

// Pool state carried by a receipt line. Any received line is either good
// (`stock`) or damaged (`scrap`), whatever its source: a supplier receipt may
// be marked خردة, a branch return may arrive damaged, and a maintenance return
// is either repaired (`stock`) or denied (`scrap`).
function receiptState(direction, raw) {
  if (direction !== 'in') return 'stock';
  return String(raw || '') === 'scrap' ? 'scrap' : 'stock';
}

function normalize(b) {
  const direction = b.direction === 'in' ? 'in' : 'out';
  const kind = ['sup', 'maint', 'br'].includes(b.kind) ? b.kind : 'sup';
  const branchId = kind === 'br' ? asInt(b.branch_id) || null : null;
  const supplierName = String(b.supplier_name || '').trim();
  const number = String(b.number || '').trim();
  const sourceBranch = String(b.source_branch || '').trim();
  const lines = (Array.isArray(b.lines) ? b.lines : []).map((l) => ({
    itemId: Number(l.item_id),
    qty: Number(l.qty),
    state: receiptState(direction, l.state),
    serials: Array.isArray(l.serials) ? l.serials.map((s) => String(s).trim()) : [],
    reason: String(l.reason || '').trim(),
    note: String(l.note || '').trim(),
    hasWarranty: !!l.has_warranty,
    warrantyUntil: asDate(l.warranty_until)
  }));
  // Branch receipts no longer feed the scrap pool: a unit coming back from a
  // branch is always stored as good. Damaged units are written off from the
  // Scrap screen, which deducts them from the warehouse balance.
  if (direction === 'in' && kind === 'br') lines.forEach((l) => { l.state = 'stock'; });
  return { direction, kind, branchId, supplierName, number, sourceBranch, lines };
}

function validate(n) {
  if (!n.number) return 'اكتب رقم الإذن';
  if (n.number.length > 60) return 'رقم الإذن أطول من 60 حرفًا';
  if (n.direction === 'out' && n.kind === 'maint') return 'لا يمكن الصرف إلى الصيانة';
  if (n.kind === 'br' && !n.branchId) return 'اختر فرعًا مسجلًا';
  if (n.kind === 'sup' && !n.supplierName) return 'اختر المورد';
  if (!n.lines.length) return 'أضف صنفًا واحدًا على الأقل';
  for (const l of n.lines) {
    if (!Number.isInteger(l.itemId) || l.itemId <= 0) return 'اختر الصنف في كل سطر';
    if (!Number.isInteger(l.qty) || l.qty <= 0) return 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر';
  }
  return null;
}

// Current serial ledger for the given items: replays every live voucher line in
// order plus scrap entries so we know where each serial is right now
// (stock / branch:<id> / maint / scrap). A voucher being edited is excluded so
// its own lines do not block the replacement.
async function serialLedger(client, itemIds, excludeVoucherId) {
  const ledger = new Map();
  if (!itemIds.length) return ledger;
  const put = (itemId, sn, state, branchId) => {
    const key = itemId + '|' + String(sn).toLowerCase();
    ledger.set(key, { state, branchId: branchId == null ? null : Number(branchId) });
  };
  const rows = await sqlReq(client)
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(itemIds))
    .input('ex', sql.Int, excludeVoucherId || null)
    .query(`SELECT vl.item_id, vl.serials, vl.state, v.direction, v.kind, v.branch_id
              FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
             WHERE v.deleted_at IS NULL
               AND vl.item_id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))
               AND (@ex IS NULL OR v.id <> @ex)
             ORDER BY vl.id`);
  for (const r of rows.recordset) {
    for (const sn of parseSerials(r.serials)) {
      if (!String(sn || '').trim()) continue;
      if (r.direction === 'out') {
        put(r.item_id, sn, r.kind === 'br' ? 'branch' : 'maint', r.kind === 'br' ? r.branch_id : null);
      } else {
        put(r.item_id, sn, String(r.state) === 'scrap' ? 'scrap' : 'stock', null);
      }
    }
  }
  const scrap = await sqlReq(client)
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(itemIds))
    .query('SELECT item_id, serials FROM scrap_entries WHERE item_id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))');
  for (const r of scrap.recordset) {
    for (const sn of parseSerials(r.serials)) if (String(sn || '').trim()) put(r.item_id, sn, 'scrap', null);
  }
  return ledger;
}

// Validates serial rules for a voucher inside its transaction. Returns an
// Arabic error message or null. Duplicates are checked across every line of the
// same item (repeated lines are treated as one aggregate request).
async function validateVoucherSerials(client, n, excludeVoucherId) {
  const itemIds = [...new Set(n.lines.map((l) => l.itemId))];
  if (!itemIds.length) return null;
  const rows = await sqlReq(client)
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(itemIds))
    .query(`SELECT i.id, i.name, c.has_serial FROM items i JOIN categories c ON c.id = i.category_id
             WHERE i.id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`);
  const info = new Map(rows.recordset.map((r) => [r.id, { serial: !!r.has_serial, name: r.name }]));
  for (const id of itemIds) if (!info.has(id)) return 'الصنف المحدد غير موجود';

  const ledger = await serialLedger(client, itemIds, excludeVoucherId);
  const seen = new Map(); // itemId -> Set(lowercase serial)

  for (const l of n.lines) {
    const meta = info.get(l.itemId);
    if (!meta.serial) { l.serials = []; continue; }
    if (l.serials.length !== l.qty) return `اكتب سيريال لكل قطعة من صنف ${meta.name}`;
    if (l.serials.some((s) => !s)) return `اكتب كل سيريالات صنف ${meta.name}`;
    if (!seen.has(l.itemId)) seen.set(l.itemId, new Set());
    const itemSeen = seen.get(l.itemId);
    for (const sn of l.serials) {
      const key = sn.toLowerCase();
      if (itemSeen.has(key)) return `سيريال مكرر: ${sn}`;
      itemSeen.add(key);
      const cur = ledger.get(l.itemId + '|' + key);
      if (n.direction === 'out') {
        if (!cur || cur.state !== 'stock') return `السيريال ${sn} غير متاح في المخزن للصنف ${meta.name}`;
      } else if (n.kind === 'maint') {
        if (!cur || cur.state !== 'maint') return `السيريال ${sn} غير موجود تحت الصيانة للصنف ${meta.name}`;
      } else if (n.kind === 'br') {
        if (!cur || cur.state !== 'branch' || cur.branchId !== Number(n.branchId)) {
          return `السيريال ${sn} غير موجود في الفرع المحدد للصنف ${meta.name}`;
        }
      } else if (cur) {
        return `السيريال ${sn} مسجل من قبل للصنف ${meta.name}`;
      }
    }
  }
  return null;
}

// Movements that touch the under-maintenance / scrap pools: a return from
// maintenance (`maint`) or a disbursement to a supplier (sent for repair).
const touchesPool = (n) =>
  (n.direction === 'out' && n.kind === 'sup') || n.kind === 'maint' || n.lines.some((l) => l.state !== 'stock');

async function insertLine(client, voucherId, l) {
  await sqlReq(client)
    .input('v', sql.Int, voucherId).input('i', sql.Int, l.itemId).input('q', sql.Int, l.qty)
    .input('st', sql.NVarChar(8), l.state).input('sn', sql.NVarChar(sql.MAX), JSON.stringify(l.serials))
    .input('rs', sql.NVarChar(200), l.reason || null)
    .input('nt', sql.NVarChar(sql.MAX), l.note || null)
    .input('hw', sql.Bit, l.hasWarranty ? 1 : 0)
    .input('wu', sql.Date, l.warrantyUntil || null)
    .query(`INSERT INTO voucher_lines (voucher_id, item_id, qty, state, serials, reason, line_note, has_warranty, line_warranty_until)
            VALUES (@v, @i, @q, @st, @sn, @rs, @nt, @hw, @wu)`);
}

// A warranty captured on a receipt that is not from a supplier (a unit back
// from maintenance or from a branch) is also written onto the catalogue item.
async function applyLineWarranty(client, n) {
  if (n.direction !== 'in' || n.kind === 'sup') return;
  for (const l of n.lines) {
    if (l.hasWarranty && l.warrantyUntil) {
      await sqlReq(client).input('w', sql.Date, l.warrantyUntil).input('id', sql.Int, l.itemId)
        .query('UPDATE items SET warranty_until = @w WHERE id = @id');
    }
  }
}

router.post('/vouchers', guard('stock'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const n = normalize(req.body);
    const invalid = validate(n);
    if (invalid) return res.status(400).json({ error: invalid });
    if (touchesPool(n) && !can(req.user.role, 'pool')) {
      return res.status(403).json({ error: 'حركات الصيانة والخردة متاحة لمدير النظام والمدير الفني فقط' });
    }
    const newVoucher = { direction: n.direction, kind: n.kind, branch_id: n.branchId, lines: n.lines };
    const { itemIds, branchIds } = collectIds([newVoucher]);

    await tx.begin();
    const serialError = await validateVoucherSerials(tx, n, null);
    if (serialError) { await tx.rollback(); return res.status(400).json({ error: serialError }); }
    const applied = await applyAndPersist(tx, planChange(null, newVoucher), itemIds, branchIds);
    if (!applied.ok) { await tx.rollback(); return res.status(400).json(stockError(applied)); }

    const supId = n.kind !== 'br' && n.supplierName ? await supplierIdOn(tx, n.supplierName) : null;
    const vr = await sqlReq(tx)
      .input('d', sql.NVarChar(3), n.direction).input('k', sql.NVarChar(8), n.kind)
      .input('s', sql.Int, supId).input('b', sql.Int, n.branchId).input('n', sql.NVarChar(60), n.number)
      .input('sb', sql.NVarChar(160), n.sourceBranch || null)
      .input('dt', sql.NVarChar(40), new Date().toLocaleDateString('en-CA'))
      .input('by', sql.NVarChar(120), req.user.name)
      .query('INSERT INTO vouchers (direction, kind, supplier_id, branch_id, number, source_branch, doc_date, created_by) OUTPUT INSERTED.id VALUES (@d, @k, @s, @b, @n, @sb, @dt, @by)');
    const vid = vr.recordset[0].id;
    for (const l of n.lines) await insertLine(tx, vid, l);
    await applyLineWarranty(tx, n);
    await tx.commit();
    res.json({ ok: true, id: vid });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    if (err.number === 2601 || err.number === 2627) return res.status(400).json({ error: 'رقم الإذن مسجل من قبل' });
    next(err);
  }
});

async function loadVoucher(client, id) {
  const v = await sqlReq(client).input('id', sql.Int, id)
    .query('SELECT * FROM vouchers WITH (UPDLOCK) WHERE id = @id AND deleted_at IS NULL');
  if (!v.recordset.length) return null;
  const row = v.recordset[0];
  const lines = await sqlReq(client).input('id', sql.Int, id)
    .query('SELECT item_id, qty, state FROM voucher_lines WHERE voucher_id = @id');
  return {
    voucher: {
      direction: row.direction, kind: row.kind, branch_id: row.branch_id,
      lines: lines.recordset.map((r) => ({ itemId: r.item_id, qty: r.qty, state: r.state }))
    },
    row
  };
}

router.put('/vouchers/:id', guard('stock'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const id = asInt(req.params.id);
    const n = normalize(req.body);
    const invalid = validate(n);
    if (invalid) return res.status(400).json({ error: invalid });

    await tx.begin();
    const old = await loadVoucher(tx, id);
    if (!old) { await tx.rollback(); return res.status(404).json({ error: 'الإذن غير موجود' }); }
    const newVoucher = { direction: n.direction, kind: n.kind, branch_id: n.branchId, lines: n.lines };
    if ((touchesPool(n) || touchesPool(old.voucher)) && !can(req.user.role, 'pool')) {
      await tx.rollback();
      return res.status(403).json({ error: 'حركات الصيانة والخردة متاحة لمدير النظام والمدير الفني فقط' });
    }
    const { itemIds, branchIds } = collectIds([old.voucher, newVoucher]);
    const serialError = await validateVoucherSerials(tx, n, id);
    if (serialError) { await tx.rollback(); return res.status(400).json({ error: serialError }); }
    const applied = await applyAndPersist(tx, planChange(old.voucher, newVoucher), itemIds, branchIds);
    if (!applied.ok) { await tx.rollback(); return res.status(400).json(stockError(applied)); }

    const supId = n.kind !== 'br' && n.supplierName ? await supplierIdOn(tx, n.supplierName) : null;
    await sqlReq(tx)
      .input('d', sql.NVarChar(3), n.direction).input('k', sql.NVarChar(8), n.kind)
      .input('s', sql.Int, supId).input('b', sql.Int, n.branchId).input('n', sql.NVarChar(60), n.number)
      .input('sb', sql.NVarChar(160), n.sourceBranch || null)
      .input('ed', sql.NVarChar(120), req.user.name).input('id', sql.Int, id)
      .query('UPDATE vouchers SET direction = @d, kind = @k, supplier_id = @s, branch_id = @b, number = @n, source_branch = @sb, edited_by = @ed WHERE id = @id');
    await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM voucher_lines WHERE voucher_id = @id');
    for (const l of n.lines) await insertLine(tx, id, l);
    await applyLineWarranty(tx, n);
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    if (err.number === 2601 || err.number === 2627) return res.status(400).json({ error: 'رقم الإذن مسجل من قبل' });
    next(err);
  }
});

router.delete('/vouchers/:id', guard('delRecv'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const id = asInt(req.params.id);
    await tx.begin();
    const old = await loadVoucher(tx, id);
    if (!old) { await tx.rollback(); return res.status(404).json({ error: 'الإذن غير موجود' }); }
    if (touchesPool(old.voucher) && !can(req.user.role, 'pool')) {
      await tx.rollback();
      return res.status(403).json({ error: 'حركات الصيانة والخردة متاحة لمدير النظام والمدير الفني فقط' });
    }
    const { itemIds, branchIds } = collectIds([old.voucher]);
    const applied = await applyAndPersist(tx, planChange(old.voucher, null), itemIds, branchIds);
    if (!applied.ok) { await tx.rollback(); return res.status(400).json(stockError(applied)); }
    await sqlReq(tx).input('id', sql.Int, id).query('UPDATE vouchers SET deleted_at = SYSUTCDATETIME() WHERE id = @id');
    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    next(err);
  }
});

/* --------------------------------- scrap -------------------------------- */

// Write damaged units off the warehouse balance and into the terminal scrap
// pool. The qty is validated and applied atomically, serials are mandatory for
// serialised categories, and every action is kept in scrap_entries.
router.post('/scrap', guard('pool'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const mode = req.body.mode === 'plain' ? 'plain' : 'serial';
    const rawLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    if (!rawLines.length) return res.status(400).json({ error: 'أضف صنفًا واحدًا على الأقل' });
    const lines = rawLines.map((l) => ({
      itemId: Number(l.item_id),
      qty: Number(l.qty),
      serials: Array.isArray(l.serials) ? l.serials.map((s) => String(s).trim()) : []
    }));
    for (const l of lines) {
      if (!Number.isInteger(l.itemId) || l.itemId <= 0) return res.status(400).json({ error: 'اختر الصنف في كل سطر' });
      if (!Number.isInteger(l.qty) || l.qty <= 0) return res.status(400).json({ error: 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر' });
    }

    const ids = [...new Set(lines.map((l) => l.itemId))];
    await tx.begin();

    const cats = await sqlReq(tx).input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
      .query(`SELECT i.id, c.has_serial FROM items i JOIN categories c ON c.id = i.category_id
               WHERE i.id IN (SELECT CAST(value AS INT) FROM OPENJSON(@ids))`);
    const serialised = new Map(cats.recordset.map((r) => [r.id, !!r.has_serial]));
    for (const id of ids) {
      if (!serialised.has(id)) { await tx.rollback(); return res.status(400).json({ error: 'الصنف المحدد غير موجود' }); }
    }

    // Serial checks are aggregated per item across repeated lines.
    const ledger = mode === 'serial' ? await serialLedger(tx, ids, null) : new Map();
    const seen = new Set();
    for (const l of lines) {
      // `plain` write-offs are quantity-only even for serialised categories.
      if (mode === 'serial' && serialised.get(l.itemId)) {
        if (l.serials.length !== l.qty) {
          await tx.rollback();
          return res.status(400).json({ error: 'اكتب سيريال لكل قطعة' });
        }
        if (l.serials.some((s) => !s)) {
          await tx.rollback();
          return res.status(400).json({ error: 'اكتب كل السيريالات' });
        }
        for (const s of l.serials) {
          const key = l.itemId + '|' + s.toLowerCase();
          if (seen.has(key)) {
            await tx.rollback();
            return res.status(400).json({ error: 'سيريال مكرر: ' + s });
          }
          seen.add(key);
          const cur = ledger.get(key);
          if (!cur || cur.state !== 'stock') {
            await tx.rollback();
            return res.status(400).json({ error: 'السيريال ' + s + ' غير متاح في المخزن' });
          }
        }
      } else {
        l.serials = [];
      }
    }

    const applied = await applyAndPersist(tx, scrapDeltas(lines), ids, []);
    if (!applied.ok) {
      await tx.rollback();
      return res.status(400).json({ error: 'الكمية المطلوبة أكبر من رصيد المخزن' });
    }

    for (const l of lines) {
      await sqlReq(tx)
        .input('i', sql.Int, l.itemId).input('q', sql.Int, l.qty)
        .input('sn', sql.NVarChar(sql.MAX), JSON.stringify(l.serials))
        .input('by', sql.NVarChar(120), req.user.name)
        .query('INSERT INTO scrap_entries (item_id, qty, serials, created_by) VALUES (@i, @q, @sn, @by)');
    }

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    next(err);
  }
});

/* -------------------------------- requests ------------------------------ */

router.post('/requests', guard('request'), async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const branchId = asInt(req.body.branch_id);
    const rawLines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const lines = rawLines.map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty) }));
    if (!branchId) return res.status(400).json({ error: 'اختر الفرع' });
    if (!lines.length) return res.status(400).json({ error: 'اختر صنفًا واحدًا على الأقل' });
    for (const l of lines) {
      if (!Number.isInteger(l.item_id) || l.item_id <= 0) return res.status(400).json({ error: 'اختر الصنف في كل سطر' });
      if (!Number.isInteger(l.qty) || l.qty <= 0) return res.status(400).json({ error: 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر' });
    }
    await tx.begin();
    const r = await sqlReq(tx)
      .input('b', sql.Int, branchId)
      .input('by', sql.NVarChar(120), req.user.name)
      .input('st', sql.NVarChar(12), req.user.role === 'junior' ? 'review' : 'pending')
      .query('INSERT INTO requests (branch_id, requested_by, status) OUTPUT INSERTED.id VALUES (@b, @by, @st)');
    const rid = r.recordset[0].id;
    for (const l of lines) {
      await sqlReq(tx).input('r', sql.Int, rid).input('i', sql.Int, asInt(l.item_id)).input('q', sql.Int, asInt(l.qty))
        .query('INSERT INTO request_lines (request_id, item_id, qty) VALUES (@r, @i, @q)');
    }
    await sqlReq(tx).input('r', sql.Int, rid).input('by', sql.NVarChar(120), req.user.name).input('note', sql.NVarChar(sql.MAX), String(req.body.note || ''))
      .query("INSERT INTO request_logs (request_id, by_name, action, kind, note) VALUES (@r, @by, N'أرسل الطلب', N'', @note)");
    await tx.commit();
    res.json({ ok: true, id: rid });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    next(err);
  }
});

router.post('/requests/:id/action', async (req, res, next) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  try {
    const id = asInt(req.params.id);
    const action = String(req.body.action || '');
    const role = req.user.role;

    await tx.begin();
    const rr = await sqlReq(tx).input('id', sql.Int, id).query('SELECT * FROM requests WITH (UPDLOCK) WHERE id = @id');
    if (!rr.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'الطلب غير موجود' }); }
    const request = rr.recordset[0];
    const log = (a, k, t) => sqlReq(tx).input('r', sql.Int, id).input('by', sql.NVarChar(120), req.user.name)
      .input('a', sql.NVarChar(120), a).input('k', sql.NVarChar(16), k)
      .input('note', sql.NVarChar(sql.MAX), t || '')
      .query('INSERT INTO request_logs (request_id, by_name, action, kind, note) VALUES (@r, @by, @a, @k, @note)');

    if (action === 'no') {
      if (!can(role, 'reject')) { await tx.rollback(); return res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' }); }
      const note = String(req.body.note || '').trim();
      if (!note) { await tx.rollback(); return res.status(400).json({ error: 'اكتب سبب الرفض' }); }
      await log('رفض', 'no', note);
      await sqlReq(tx).input('id', sql.Int, id).query("UPDATE requests SET status = 'rejected' WHERE id = @id");
    } else if (action === 'save') {
      if (!can(role, 'edit')) { await tx.rollback(); return res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' }); }
      const lines = (Array.isArray(req.body.lines) ? req.body.lines : []).map((l) => ({ item_id: Number(l.item_id), qty: Number(l.qty) }));
      if (!lines.length) { await tx.rollback(); return res.status(400).json({ error: 'اترك صنفًا واحدًا على الأقل أو ارفض الطلب' }); }
      for (const l of lines) {
        if (!Number.isInteger(l.item_id) || l.item_id <= 0) { await tx.rollback(); return res.status(400).json({ error: 'اختر الصنف في كل سطر' }); }
        if (!Number.isInteger(l.qty) || l.qty <= 0) { await tx.rollback(); return res.status(400).json({ error: 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر' }); }
      }
      await sqlReq(tx).input('id', sql.Int, id).query('DELETE FROM request_lines WHERE request_id = @id');
      for (const l of lines) {
        await sqlReq(tx).input('r', sql.Int, id).input('i', sql.Int, l.item_id).input('q', sql.Int, l.qty)
          .query('INSERT INTO request_lines (request_id, item_id, qty) VALUES (@r, @i, @q)');
      }
      await log('عدّل الطلب', '', String(req.body.note || 'تم التعديل'));
    } else if (action === 'rev') {
      if (!can(role, 'review') || request.status !== 'review') { await tx.rollback(); return res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء' }); }
      await log('أكد الطلب', 'ok', '');
      await sqlReq(tx).input('id', sql.Int, id).query("UPDATE requests SET status = 'pending' WHERE id = @id");
    } else if (action === 'ok') {
      if (!can(role, 'approve') || request.status !== 'pending') { await tx.rollback(); return res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء' }); }
      await log('وافق', 'ok', '');
      await sqlReq(tx).input('id', sql.Int, id).query("UPDATE requests SET status = 'approved' WHERE id = @id");
    } else if (action === 'out') {
      if (!can(role, 'release') || request.status !== 'approved') { await tx.rollback(); return res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء' }); }
      const rl = await sqlReq(tx).input('id', sql.Int, id).query('SELECT item_id, qty FROM request_lines WHERE request_id = @id');
      const newVoucher = {
        direction: 'out', kind: 'br', branch_id: request.branch_id,
        lines: rl.recordset.map((r) => ({ itemId: r.item_id, qty: r.qty }))
      };
      const { itemIds, branchIds } = collectIds([newVoucher]);
      const applied = await applyAndPersist(tx, planChange(null, newVoucher), itemIds, branchIds);
      if (!applied.ok) { await tx.rollback(); return res.status(400).json(stockError(applied)); }
      await log('أكد الصرف', 'ok', '');
      await sqlReq(tx).input('id', sql.Int, id).query("UPDATE requests SET status = 'released' WHERE id = @id");
    } else {
      await tx.rollback();
      return res.status(400).json({ error: 'إجراء غير معروف' });
    }

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await tx.rollback(); } catch (_) {}
    next(err);
  }
});

module.exports = router;
