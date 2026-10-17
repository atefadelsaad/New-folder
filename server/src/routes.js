'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { sign, auth } = require('./auth');
const { voucherDeltas, applyDeltas, planChange } = require('./stock');

const router = express.Router();

const CAN = {
  addBranch: ['admin', 'head'],
  stock: ['admin', 'head', 'store'],
  view: ['admin', 'head', 'senior', 'area', 'store'],
  review: ['admin', 'head', 'senior'],
  reject: ['admin', 'head', 'area', 'store'],
  edit: ['admin', 'head', 'area', 'store'],
  delRecv: ['admin', 'head'],
  request: ['admin', 'head', 'senior', 'junior'],
  branchEdit: ['admin', 'head', 'senior'],
  approve: ['admin', 'head', 'area'],
  release: ['admin', 'head', 'store']
};
const can = (role, perm) => CAN[perm].includes(role);
const guard = (perm) => (req, res, next) =>
  can(req.user.role, perm) ? next() : res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' });

const asInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

router.post('/auth/login', async (req, res) => {
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  if (!username || !password) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  res.json({ token: sign(user), user: { username: user.username, role: user.role, name: user.name } });
});

router.use(auth);

router.get('/auth/me', (req, res) => res.json({ user: req.user }));

async function loadBootstrap(role) {
  const cats = await pool.query('SELECT id, name, has_serial FROM categories ORDER BY id');
  const items = await pool.query(
    'SELECT i.id, i.name, i.stock, i.created_by, c.name AS category FROM items i JOIN categories c ON c.id = i.category_id ORDER BY i.id'
  );
  const branches = await pool.query('SELECT id, name, gov, created_by, created_at FROM branches ORDER BY id');
  const branchItems = await pool.query('SELECT branch_id, item_id, qty FROM branch_items');
  const suppliers = await pool.query('SELECT name FROM suppliers ORDER BY name');
  const vouchers = await pool.query(
    `SELECT v.id, v.direction, v.kind, v.number, v.branch_id, v.created_by, v.edited_by, v.doc_date, s.name AS supplier_name
       FROM vouchers v LEFT JOIN suppliers s ON s.id = v.supplier_id ORDER BY v.id DESC`
  );
  const lines = await pool.query('SELECT voucher_id, item_id, qty, serials, item_condition, state FROM voucher_lines ORDER BY id');
  const maintenance = await pool.query(
    `SELECT vl.item_id, SUM(vl.qty)::int AS qty FROM voucher_lines vl
       JOIN vouchers v ON v.id = vl.voucher_id
      WHERE v.direction = 'in' AND vl.state = 'maint' GROUP BY vl.item_id`
  );
  const scrap = await pool.query(
    `SELECT vl.item_id, SUM(vl.qty)::int AS qty FROM voucher_lines vl
       JOIN vouchers v ON v.id = vl.voucher_id
      WHERE v.direction = 'in' AND vl.state = 'scrap' GROUP BY vl.item_id`
  );
  const requests = await pool.query('SELECT id, branch_id, requested_by, status FROM requests ORDER BY id DESC');
  const reqLines = await pool.query('SELECT request_id, item_id, qty FROM request_lines ORDER BY id');
  const logs = await pool.query('SELECT request_id, by_name, action, kind, note FROM request_logs ORDER BY id');

  const q = {};
  branchItems.rows.forEach((r) => { (q[r.branch_id] = q[r.branch_id] || {})[r.item_id] = r.qty; });

  const linesByVoucher = {};
  lines.rows.forEach((r) => {
    (linesByVoucher[r.voucher_id] = linesByVoucher[r.voucher_id] || []).push({
      i: r.item_id, q: r.qty, sns: r.serials || [], cd: r.item_condition || '', st: r.state || 'stock'
    });
  });

  const voucherRows = vouchers.rows.map((r) => ({
    id: r.id, d: r.doc_date, k: r.kind, sup: r.supplier_name || '',
    b: r.branch_id, p: r.number, by: r.created_by, ed: r.edited_by,
    direction: r.direction, lines: linesByVoucher[r.id] || []
  }));

  const linesByRequest = {};
  reqLines.rows.forEach((r) => { (linesByRequest[r.request_id] = linesByRequest[r.request_id] || []).push({ i: r.item_id, q: r.qty }); });
  const logsByRequest = {};
  logs.rows.forEach((r) => {
    (logsByRequest[r.request_id] = logsByRequest[r.request_id] || []).push({ by: r.by_name, a: r.action, k: r.kind || '', t: r.note || '' });
  });

  return {
    categories: cats.rows.map((r) => ({ id: r.id, name: r.name, has_serial: r.has_serial })),
    items: items.rows.map((r) => ({ id: r.id, n: r.name, c: r.category, s: r.stock, by: r.created_by })),
    branches: branches.rows.map((r) => ({
      id: r.id, n: r.name, g: r.gov, by: r.created_by,
      d: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
      q: q[r.id] || {}
    })),
    suppliers: suppliers.rows.map((r) => r.name),
    maintenance: maintenance.rows.map((r) => ({ i: r.item_id, q: r.qty })),
    scrap: scrap.rows.map((r) => ({ i: r.item_id, q: r.qty })),
    vouchers: {
      in: voucherRows.filter((v) => v.direction === 'in'),
      out: voucherRows.filter((v) => v.direction === 'out')
    },
    requests: requests.rows.map((r) => ({
      id: r.id, b: r.branch_id, by: r.requested_by, st: r.status,
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

async function categoryId(name) {
  const r = await pool.query('SELECT id FROM categories WHERE name = $1', [name]);
  if (!r.rowCount) throw new Error('الفئة غير موجودة');
  return r.rows[0].id;
}

async function supplierId(name) {
  const r = await pool.query(
    'INSERT INTO suppliers (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name]
  );
  return r.rows[0].id;
}

router.post('/categories', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الفئة' });
    await pool.query(
      'INSERT INTO categories (name, has_serial) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING',
      [name, req.body.has_serial !== false]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/categories/:name', guard('stock'), async (req, res, next) => {
  try {
    const current = req.params.name;
    const next_ = String(req.body.name || '').trim();
    const exists = await pool.query('SELECT 1 FROM categories WHERE name = $1', [current]);
    if (!exists.rowCount) return res.status(404).json({ error: 'الفئة غير موجودة' });
    if (next_ && next_ !== current) {
      const dup = await pool.query('SELECT 1 FROM categories WHERE name = $1', [next_]);
      if (dup.rowCount) return res.status(400).json({ error: 'اسم الفئة موجود بالفعل' });
      await pool.query('UPDATE categories SET name = $1 WHERE name = $2', [next_, current]);
    }
    if ('has_serial' in req.body) {
      await pool.query('UPDATE categories SET has_serial = $1 WHERE name = $2', [!!req.body.has_serial, next_ || current]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/categories/:name', guard('stock'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const name = req.params.name;
    const cat = await client.query('SELECT id FROM categories WHERE name = $1', [name]);
    if (!cat.rowCount) { return res.status(404).json({ error: 'الفئة غير موجودة' }); }
    const id = cat.rows[0].id;
    await client.query('BEGIN');
    const inCat = 'SELECT id FROM items WHERE category_id = $1';
    await client.query(`DELETE FROM voucher_lines WHERE item_id IN (${inCat})`, [id]);
    await client.query(`DELETE FROM request_lines WHERE item_id IN (${inCat})`, [id]);
    await client.query(`DELETE FROM branch_items WHERE item_id IN (${inCat})`, [id]);
    await client.query('DELETE FROM items WHERE category_id = $1', [id]);
    await client.query('DELETE FROM categories WHERE id = $1', [id]);
    await client.query('DELETE FROM vouchers WHERE NOT EXISTS (SELECT 1 FROM voucher_lines l WHERE l.voucher_id = vouchers.id)');
    await client.query('DELETE FROM requests WHERE NOT EXISTS (SELECT 1 FROM request_lines l WHERE l.request_id = requests.id)');
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

router.post('/items', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الصنف' });
    const cid = await categoryId(req.body.category);
    // Stock is never entered by hand; it is driven by receipts only.
    const r = await pool.query(
      'INSERT INTO items (name, category_id, stock, created_by) VALUES ($1,$2,0,$3) RETURNING id',
      [name, cid, req.user.name]
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) { next(err); }
});

router.put('/items/:id', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اسم الصنف لا يمكن أن يكون فارغًا' });
    const cid = await categoryId(req.body.category);
    // Stock is only ever changed through receipts/disbursements, never here.
    await pool.query('UPDATE items SET name = $1, category_id = $2 WHERE id = $3', [
      name, cid, asInt(req.params.id)
    ]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/items/:id', guard('stock'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'الحذف متاح لمدير النظام فقط' });
    const id = asInt(req.params.id);
    const used = await pool.query(
      `SELECT 1 FROM branch_items WHERE item_id = $1 AND qty > 0
        UNION ALL SELECT 1 FROM voucher_lines WHERE item_id = $1
        UNION ALL SELECT 1 FROM request_lines WHERE item_id = $1 LIMIT 1`,
      [id]
    );
    if (used.rowCount) return res.status(400).json({ error: 'لا يمكن حذف الصنف لأنه مستخدم في فروع أو أذونات أو طلبات' });
    await pool.query('DELETE FROM items WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/branches', guard('addBranch'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم الفرع' });
    const r = await pool.query('INSERT INTO branches (name, gov, created_by) VALUES ($1,$2,$3) RETURNING id', [
      name, String(req.body.gov || ''), req.user.name
    ]);
    const qty = req.body.qty || {};
    const ids = new Set((req.body.item_ids || []).map(asInt).filter((n) => n > 0));
    Object.entries(qty).forEach(([k, v]) => { if (asInt(v) > 0) ids.add(asInt(k)); });
    for (const itemId of ids) {
      await pool.query(
        'INSERT INTO branch_items (branch_id, item_id, qty) VALUES ($1,$2,$3) ON CONFLICT (branch_id, item_id) DO NOTHING',
        [r.rows[0].id, itemId, Math.max(0, asInt(qty[itemId]))]
      );
    }
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) { next(err); }
});

router.post('/branches/:id/items', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id), iid = asInt(req.body.item_id);
    if (!iid) return res.status(400).json({ error: 'اختر صنفًا' });
    await pool.query(
      'INSERT INTO branch_items (branch_id, item_id, qty) VALUES ($1,$2,0) ON CONFLICT (branch_id, item_id) DO NOTHING',
      [bid, iid]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/branches/:id/items/:itemId', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id), iid = asInt(req.params.itemId);
    const row = await pool.query('SELECT qty FROM branch_items WHERE branch_id = $1 AND item_id = $2', [bid, iid]);
    if (row.rowCount && row.rows[0].qty > 0) {
      return res.status(400).json({ error: 'لا يمكن إزالة صنف موجود فعليًا في الفرع. انقله أولًا.' });
    }
    await pool.query('DELETE FROM branch_items WHERE branch_id = $1 AND item_id = $2', [bid, iid]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/branches/:id/qty', guard('branchEdit'), async (req, res, next) => {
  try {
    const bid = asInt(req.params.id), iid = asInt(req.body.item_id), qty = Math.max(0, asInt(req.body.qty));
    await pool.query(
      `INSERT INTO branch_items (branch_id, item_id, qty) VALUES ($1,$2,$3)
       ON CONFLICT (branch_id, item_id) DO UPDATE SET qty = EXCLUDED.qty`,
      [bid, iid, qty]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/suppliers', guard('stock'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'اكتب اسم المورد' });
    await supplierId(name);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

async function readState(client, itemIds, branchIds) {
  const stock = new Map();
  const items = await client.query('SELECT id, stock FROM items WHERE id = ANY($1::int[]) FOR UPDATE', [itemIds]);
  items.rows.forEach((r) => stock.set(r.id, r.stock));
  const branch = new Map();
  if (branchIds.length) {
    const bi = await client.query('SELECT branch_id, item_id, qty FROM branch_items WHERE branch_id = ANY($1::int[])', [branchIds]);
    bi.rows.forEach((r) => {
      if (!branch.has(r.branch_id)) branch.set(r.branch_id, new Map());
      branch.get(r.branch_id).set(r.item_id, r.qty);
    });
  }
  return { stock, branch };
}

async function applyAndPersist(client, deltas, itemIds, branchIds) {
  const current = await readState(client, itemIds, branchIds);
  const result = applyDeltas(current, deltas);
  if (!result.ok) return result;
  for (const [id, val] of result.stock) {
    if (current.stock.get(id) !== val) await client.query('UPDATE items SET stock = $1 WHERE id = $2', [val, id]);
  }
  for (const [bid, map] of result.branch) {
    const before = current.branch.get(bid) || new Map();
    for (const [iid, val] of map) {
      if (before.get(iid) !== val) {
        await client.query(
          `INSERT INTO branch_items (branch_id, item_id, qty) VALUES ($1,$2,$3)
           ON CONFLICT (branch_id, item_id) DO UPDATE SET qty = EXCLUDED.qty`,
          [bid, iid, val]
        );
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

const stockError = (r) =>
  r.error === 'stock'
    ? { error: 'لا يمكن إتمام الصرف: الكمية المطلوبة أكبر من رصيد المخزن' }
    : { error: 'الكمية غير كافية في الفرع المحدد' };

router.post('/vouchers', guard('stock'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body;
    const direction = b.direction === 'in' ? 'in' : 'out';
    const kind = ['sup', 'maint', 'br'].includes(b.kind) ? b.kind : 'sup';
    const number = String(b.number || '').trim();
    if (!number) return res.status(400).json({ error: 'اكتب رقم الإذن' });
    const branchId = kind === 'br' ? asInt(b.branch_id) || null : null;
    if (kind === 'br' && !branchId) return res.status(400).json({ error: 'اختر فرعًا مسجلاً' });
    const supplierName = String(b.supplier_name || '').trim();
    if (kind !== 'br' && !supplierName) return res.status(400).json({ error: 'اكتب اسم المورد' });

    const lines = (b.lines || []).map((l) => ({
      itemId: asInt(l.item_id), qty: asInt(l.qty),
      state: direction === 'in' && ['maint', 'scrap'].includes(l.state) ? l.state : 'stock',
      serials: l.serials || []
    }));
    const newVoucher = { direction, kind, branch_id: branchId, lines };
    const deltas = planChange(null, newVoucher);
    const { itemIds, branchIds } = collectIds([newVoucher]);

    await client.query('BEGIN');
    const applied = await applyAndPersist(client, deltas, itemIds, branchIds);
    if (!applied.ok) { await client.query('ROLLBACK'); return res.status(400).json(stockError(applied)); }

    const supId = kind !== 'br' ? await supplierId(supplierName) : null;
    const vr = await client.query(
      'INSERT INTO vouchers (direction, kind, supplier_id, branch_id, number, doc_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [direction, kind, supId, branchId, number, new Date().toLocaleDateString('ar-EG'), req.user.name]
    );
    for (const l of lines) {
      await client.query(
        'INSERT INTO voucher_lines (voucher_id, item_id, qty, state, serials) VALUES ($1,$2,$3,$4,$5)',
        [vr.rows[0].id, l.itemId, l.qty, l.state, l.serials]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, id: vr.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(400).json({ error: 'رقم الإذن مسجل من قبل' });
    next(err);
  } finally { client.release(); }
});

router.put('/vouchers/:id', guard('stock'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = asInt(req.params.id);
    const b = req.body;
    const direction = b.direction === 'in' ? 'in' : 'out';
    const kind = ['sup', 'maint', 'br'].includes(b.kind) ? b.kind : 'sup';
    const number = String(b.number || '').trim();
    if (!number) return res.status(400).json({ error: 'اكتب رقم الإذن' });
    const branchId = kind === 'br' ? asInt(b.branch_id) || null : null;
    if (kind === 'br' && !branchId) return res.status(400).json({ error: 'اختر فرعًا مسجلاً' });
    const supplierName = String(b.supplier_name || '').trim();
    if (kind !== 'br' && !supplierName) return res.status(400).json({ error: 'اكتب اسم المورد' });

    const lines = (b.lines || []).map((l) => ({
      itemId: asInt(l.item_id), qty: asInt(l.qty),
      state: direction === 'in' && ['maint', 'scrap'].includes(l.state) ? l.state : 'stock',
      serials: l.serials || []
    }));

    await client.query('BEGIN');
    const oldRow = await client.query('SELECT * FROM vouchers WHERE id = $1 FOR UPDATE', [id]);
    if (!oldRow.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الإذن غير موجود' }); }
    const old = oldRow.rows[0];
    const oldLines = await client.query('SELECT item_id, qty, state FROM voucher_lines WHERE voucher_id = $1', [id]);
    const oldVoucher = {
      direction: old.direction, kind: old.kind, branch_id: old.branch_id,
      lines: oldLines.rows.map((r) => ({ itemId: r.item_id, qty: r.qty, state: r.state }))
    };
    const newVoucher = { direction, kind, branch_id: branchId, lines };
    const deltas = planChange(oldVoucher, newVoucher);
    const { itemIds, branchIds } = collectIds([oldVoucher, newVoucher]);

    const applied = await applyAndPersist(client, deltas, itemIds, branchIds);
    if (!applied.ok) { await client.query('ROLLBACK'); return res.status(400).json(stockError(applied)); }

    const supId = kind !== 'br' ? await supplierId(supplierName) : null;
    await client.query(
      'UPDATE vouchers SET direction=$1, kind=$2, supplier_id=$3, branch_id=$4, number=$5, edited_by=$6 WHERE id=$7',
      [direction, kind, supId, branchId, number, req.user.name, id]
    );
    await client.query('DELETE FROM voucher_lines WHERE voucher_id = $1', [id]);
    for (const l of lines) {
      await client.query(
        'INSERT INTO voucher_lines (voucher_id, item_id, qty, state, serials) VALUES ($1,$2,$3,$4,$5)',
        [id, l.itemId, l.qty, l.state, l.serials]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(400).json({ error: 'رقم الإذن مسجل من قبل' });
    next(err);
  } finally { client.release(); }
});

router.delete('/vouchers/:id', guard('delRecv'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = asInt(req.params.id);
    await client.query('BEGIN');
    const oldRow = await client.query('SELECT * FROM vouchers WHERE id = $1 FOR UPDATE', [id]);
    if (!oldRow.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الإذن غير موجود' }); }
    const old = oldRow.rows[0];
    const oldLines = await client.query('SELECT item_id, qty, state FROM voucher_lines WHERE voucher_id = $1', [id]);
    const oldVoucher = {
      direction: old.direction, kind: old.kind, branch_id: old.branch_id,
      lines: oldLines.rows.map((r) => ({ itemId: r.item_id, qty: r.qty, state: r.state }))
    };
    const deltas = planChange(oldVoucher, null);
    const { itemIds, branchIds } = collectIds([oldVoucher]);
    const applied = await applyAndPersist(client, deltas, itemIds, branchIds);
    if (!applied.ok) { await client.query('ROLLBACK'); return res.status(400).json(stockError(applied)); }
    await client.query('DELETE FROM vouchers WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

router.post('/requests', guard('request'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const branchId = asInt(req.body.branch_id);
    const lines = (req.body.lines || []).filter((l) => asInt(l.qty) > 0);
    if (!branchId) return res.status(400).json({ error: 'اختر الفرع' });
    if (!lines.length) return res.status(400).json({ error: 'اختر صنفًا واحدًا على الأقل' });
    await client.query('BEGIN');
    const r = await client.query('INSERT INTO requests (branch_id, requested_by, status) VALUES ($1,$2,$3) RETURNING id', [
      branchId, req.user.name, req.user.role === 'junior' ? 'review' : 'pending'
    ]);
    for (const l of lines) {
      await client.query('INSERT INTO request_lines (request_id, item_id, qty) VALUES ($1,$2,$3)', [
        r.rows[0].id, asInt(l.item_id), asInt(l.qty)
      ]);
    }
    await client.query('INSERT INTO request_logs (request_id, by_name, action, kind, note) VALUES ($1,$2,$3,$4,$5)', [
      r.rows[0].id, req.user.name, 'أرسل الطلب', '', String(req.body.note || '')
    ]);
    await client.query('COMMIT');
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

router.post('/requests/:id/action', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = asInt(req.params.id);
    const action = String(req.body.action || '');
    const role = req.user.role;

    await client.query('BEGIN');
    const rr = await client.query('SELECT * FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (!rr.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'الطلب غير موجود' }); }
    const request = rr.rows[0];
    const log = async (a, k, t) => client.query(
      'INSERT INTO request_logs (request_id, by_name, action, kind, note) VALUES ($1,$2,$3,$4,$5)',
      [id, req.user.name, a, k, t || '']
    );

    if (action === 'no') {
      if (!can(role, 'reject')) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' }); }
      const note = String(req.body.note || '').trim();
      if (!note) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'اكتب سبب الرفض' }); }
      await log('رفض', 'no', note);
      await client.query("UPDATE requests SET status = 'rejected' WHERE id = $1", [id]);
    } else if (action === 'save') {
      if (!can(role, 'edit')) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' }); }
      const lines = (req.body.lines || []).filter((l) => asInt(l.qty) > 0);
      if (!lines.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'اترك صنفًا واحدًا على الأقل أو ارفض الطلب' }); }
      await client.query('DELETE FROM request_lines WHERE request_id = $1', [id]);
      for (const l of lines) {
        await client.query('INSERT INTO request_lines (request_id, item_id, qty) VALUES ($1,$2,$3)', [id, asInt(l.item_id), asInt(l.qty)]);
      }
      await log('عدّل الطلب', '', String(req.body.note || 'تم التعديل'));
    } else if (action === 'rev') {
      if (!can(role, 'review') || request.status !== 'review') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء' }); }
      await log('أكد الطلب', 'ok', '');
      await client.query("UPDATE requests SET status = 'pending' WHERE id = $1", [id]);
    } else if (action === 'ok') {
      if (!can(role, 'approve') || request.status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء' }); }
      await log('وافق', 'ok', '');
      await client.query("UPDATE requests SET status = 'approved' WHERE id = $1", [id]);
    } else if (action === 'out') {
      if (!can(role, 'release') || request.status !== 'approved') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء' }); }
      const rl = await client.query('SELECT item_id, qty FROM request_lines WHERE request_id = $1', [id]);
      const newVoucher = {
        direction: 'out', kind: 'br', branch_id: request.branch_id,
        lines: rl.rows.map((r) => ({ itemId: r.item_id, qty: r.qty }))
      };
      const { itemIds, branchIds } = collectIds([newVoucher]);
      const applied = await applyAndPersist(client, planChange(null, newVoucher), itemIds, branchIds);
      if (!applied.ok) { await client.query('ROLLBACK'); return res.status(400).json(stockError(applied)); }
      await log('أكد الصرف', 'ok', '');
      await client.query("UPDATE requests SET status = 'released' WHERE id = $1", [id]);
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'إجراء غير معروف' });
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
});

module.exports = router;
