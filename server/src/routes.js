'use strict';
const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { sign, auth } = require('./auth');
const { CAN, can } = require('./roles');
const data = require('./data');
const inspectionPhotos = require('./inspection-photos');

const router = express.Router();

const guard = (perm) => (req, res, next) =>
  can(req.user, perm) ? next() : res.status(403).json({ error: 'لا تملك صلاحية هذا الإجراء' });

const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

const asInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const asDate = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const today = () => new Date().toISOString().slice(0, 10);

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

// Every handler is synchronous: a route either finishes (and the state is
// persisted atomically) or throws, in which case nothing is written.
const route = (fn) => (req, res, next) => {
  try {
    if (!req.user) return fn(req, res);
    const body = bodyOf(req);
    const method = req.method.toUpperCase();
    let action = method === 'POST' ? 'إضافة' : method === 'PUT' || method === 'PATCH' ? 'تعديل' : method === 'DELETE' ? 'حذف' : 'تغيير';
    if (method === 'POST' && req.path === '/scrap') action = 'إتلاف';
    if (method === 'POST' && /^\/requests\/\d+\/action$/.test(req.path)) {
      action = ({ no: 'رفض طلب', save: 'تعديل طلب', rev: 'مراجعة طلب', ok: 'اعتماد طلب', out: 'صرف طلب' })[body.action] || 'إجراء على طلب';
    }
    data.withAudit({
      action,
      method,
      path: req.baseUrl + req.path,
      actor: req.user.name,
      username: req.user.username,
      role: req.user.role,
      reason: text(body.reason || body.note, 500)
    }, () => fn(req, res));
  } catch (err) {
    if (err instanceof data.ApiError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// Keep arbitrary maintenance-form fields JSON-safe without dropping unknown
// keys. Only prototype-pollution keys are removed and huge payloads trimmed.
function sanitize(value, depth) {
  if (depth > 6) return null;
  if (value == null) return value;
  const t = typeof value;
  if (t === 'string') return value.slice(0, 20000);
  if (t === 'number') return Number.isFinite(value) ? value : null;
  if (t === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 500).map((v) => sanitize(v, depth + 1));
  if (t === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = sanitize(value[key], depth + 1);
    }
    return out;
  }
  return null;
}

/* --------------------------------- auth --------------------------------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات تسجيل دخول كثيرة، حاول لاحقًا' }
});

router.post('/auth/login', loginLimiter, route((req, res) => {
  const body = bodyOf(req);
  const username = text(body.username, 64);
  const password = String(body.password == null ? '' : body.password);
  if (!username || !password) data.fail(400, 'أدخل اسم المستخدم وكلمة المرور');
  const user = data.state.users.find((u) => String(u.username).toLowerCase() === username.toLowerCase());
  if (!user || user.active === false || !bcrypt.compareSync(password, user.password_hash)) {
    data.fail(401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
  res.json({ token: sign(user), user: { username: user.username, role: user.role, name: user.name, permissions: user.permissions || {} } });
}));

router.use(auth);

router.use((req, res, next) => {
  if (req.method === 'DELETE' && !text(bodyOf(req).reason, 500)) {
    return res.status(400).json({ error: 'اكتب سبب الحذف قبل التأكيد' });
  }
  next();
});

router.get('/auth/me', (req, res) => res.json({ user: req.user }));

router.get('/inspection-photos/:id', (req, res) => {
  const file = inspectionPhotos.resolve(req.params.id);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'الصورة غير موجودة' });
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(file.endsWith('.png') ? 'png' : file.endsWith('.webp') ? 'webp' : 'jpg');
  res.sendFile(file);
});

const validRole = (role) => ['admin', 'head', 'area', 'store', 'senior', 'junior'].includes(role);
function normalizePermissions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) data.fail(400, 'إعدادات الصلاحيات غير صالحة');
  const permissions = {};
  for (const [key, allowed] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(CAN, key) || typeof allowed !== 'boolean') {
      data.fail(400, 'إعداد صلاحية غير صالح');
    }
    permissions[key] = allowed;
  }
  return permissions;
}
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  name: user.name,
  role: user.role,
  active: user.active !== false,
  permissions: user.permissions || {},
  created_at: user.created_at || ''
});

router.get('/users', guard('userAdmin'), route((req, res) => {
  res.json({
    permissions: Object.keys(CAN),
    roles: ['admin', 'head', 'area', 'store', 'senior', 'junior'],
    users: data.state.users.slice().sort((a, b) => Number(a.id) - Number(b.id)).map(publicUser)
  });
}));

router.post('/users', guard('userAdmin'), route((req, res) => {
  const body = bodyOf(req);
  const username = text(body.username, 64);
  const name = text(body.name, 120);
  const password = String(body.password == null ? '' : body.password);
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) data.fail(400, 'اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل وبحروف إنجليزية أو أرقام');
  if (!name) data.fail(400, 'اكتب اسم المستخدم');
  if (!validRole(body.role)) data.fail(400, 'اختر دورًا صالحًا');
  if (password.length < 8) data.fail(400, 'كلمة المرور يجب ألا تقل عن 8 أحرف');
  const permissions = has(body, 'permissions') ? normalizePermissions(body.permissions) : {};
  const user = data.tx((st) => {
    if (st.users.some((entry) => String(entry.username).toLowerCase() === username.toLowerCase())) {
      data.fail(409, 'اسم المستخدم مستخدم بالفعل');
    }
    const created = {
      id: st.users.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1,
      username,
      name,
      role: body.role,
      password_hash: bcrypt.hashSync(password, 10),
      active: true,
      permissions,
      token_version: 0,
      created_at: data.nowIso()
    };
    st.users.push(created);
    return created;
  });
  res.json({ user: publicUser(user) });
}));

router.put('/users/:id', guard('userAdmin'), route((req, res) => {
  const body = bodyOf(req);
  const id = asInt(req.params.id);
  const username = has(body, 'username') ? text(body.username, 64) : null;
  const name = has(body, 'name') ? text(body.name, 120) : null;
  if (username !== null && !/^[A-Za-z0-9._-]{3,64}$/.test(username)) data.fail(400, 'اسم المستخدم غير صالح');
  if (name !== null && !name) data.fail(400, 'اكتب اسم المستخدم');
  if (has(body, 'role') && !validRole(body.role)) data.fail(400, 'اختر دورًا صالحًا');
  const permissions = has(body, 'permissions') ? normalizePermissions(body.permissions) : null;
  const user = data.tx((st) => {
    const target = st.users.find((entry) => Number(entry.id) === id);
    if (!target) data.fail(404, 'المستخدم غير موجود');
    if (username !== null && st.users.some((entry) => Number(entry.id) !== id
      && String(entry.username).toLowerCase() === username.toLowerCase())) data.fail(409, 'اسم المستخدم مستخدم بالفعل');
    if (has(body, 'active') && typeof body.active !== 'boolean') data.fail(400, 'حالة الحساب غير صالحة');
    const nextRole = has(body, 'role') ? body.role : target.role;
    const nextActive = has(body, 'active') ? body.active : target.active !== false;
    if (target.role === 'admin' && target.active !== false && (!nextActive || nextRole !== 'admin')
      && !st.users.some((entry) => Number(entry.id) !== id && entry.role === 'admin' && entry.active !== false)) {
      data.fail(409, 'يجب إبقاء حساب مدير نظام نشط واحد على الأقل');
    }
    if (username !== null) target.username = username;
    if (name !== null) target.name = name;
    if (has(body, 'role')) target.role = body.role;
    if (permissions !== null) target.permissions = permissions;
    if (has(body, 'active')) target.active = body.active;
    return target;
  });
  res.json({ user: publicUser(user) });
}));

router.put('/auth/password', route((req, res) => {
  const body = bodyOf(req);
  const currentPassword = String(body.currentPassword == null ? '' : body.currentPassword);
  const newPassword = String(body.newPassword == null ? '' : body.newPassword);
  if (newPassword.length < 8) data.fail(400, 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف');
  const user = data.tx((st) => {
    const target = st.users.find((entry) => Number(entry.id) === Number(req.user.id));
    if (!target || !bcrypt.compareSync(currentPassword, target.password_hash)) data.fail(400, 'كلمة المرور الحالية غير صحيحة');
    target.password_hash = bcrypt.hashSync(newPassword, 10);
    target.token_version = (Number(target.token_version) || 0) + 1;
    return target;
  });
  res.json({ token: sign(user) });
}));

router.put('/users/:id/password', guard('userAdmin'), route((req, res) => {
  const password = String(bodyOf(req).password == null ? '' : bodyOf(req).password);
  if (password.length < 8) data.fail(400, 'كلمة المرور يجب ألا تقل عن 8 أحرف');
  data.tx((st) => {
    const target = st.users.find((entry) => Number(entry.id) === asInt(req.params.id));
    if (!target) data.fail(404, 'المستخدم غير موجود');
    target.password_hash = bcrypt.hashSync(password, 10);
    target.token_version = (Number(target.token_version) || 0) + 1;
  });
  res.json({ ok: true });
}));

router.get('/audit', (req, res) => {
  if (!can(req.user, 'auditView')) return res.status(403).json({ error: 'لا تملك صلاحية عرض سجل الحركة' });
  const limit = Math.min(100, Math.max(1, asInt(req.query.limit, 50)));
  const offset = Math.max(0, asInt(req.query.offset));
  const rows = data.state.auditLog.slice().reverse();
  res.json({ total: rows.length, rows: rows.slice(offset, offset + limit) });
});

/* ------------------------------- bootstrap ------------------------------ */

router.get('/bootstrap', route((req, res) => {
  const payload = data.bootstrap(req.user.role);
  payload.user = { role: req.user.role, name: req.user.name, username: req.user.username, permissions: req.user.permissions || {} };
  payload.inspectionQueue = can(req.user, 'inspectionReview') ? data.pendingInspections() : [];
  res.json(payload);
}));

/* ------------------------------ master data ----------------------------- */

router.post('/categories', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  const name = text(body.name, 120);
  if (!name) data.fail(400, 'اكتب اسم الفئة');
  data.tx((st) => {
    if (data.categoryByName(name)) data.fail(409, 'اسم الفئة موجود بالفعل');
    const supplierName = text(body.supplier, 160);
    st.categories.push({
      id: ++st.counters.category,
      name,
      has_serial: body.has_serial !== false,
      supplier_id: supplierName ? data.ensureSupplier(supplierName) : null,
      created_by: req.user.name,
      created_at: data.nowIso()
    });
  });
  res.json({ ok: true });
}));

router.put('/categories/:name', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  data.tx((st) => {
    const category = data.categoryByName(req.params.name);
    if (!category) data.fail(404, 'الفئة غير موجودة');
    if (has(body, 'name')) {
      const nextName = text(body.name, 120);
      if (!nextName) data.fail(400, 'اكتب اسم الفئة');
      if (nextName.toLowerCase() !== String(category.name).toLowerCase()) {
        const dup = data.categoryByName(nextName);
        if (dup && Number(dup.id) !== Number(category.id)) data.fail(400, 'اسم الفئة موجود بالفعل');
        category.name = nextName;
      }
    }
    if (has(body, 'has_serial')) category.has_serial = !!body.has_serial;
    if (has(body, 'supplier')) {
      const supplierName = text(body.supplier, 160);
      category.supplier_id = supplierName ? data.ensureSupplier(supplierName) : null;
    }
  });
  res.json({ ok: true });
}));

router.delete('/categories/:name', guard('stock'), route((req, res) => {
  data.tx((st) => {
    const category = data.categoryByName(req.params.name);
    if (!category) data.fail(404, 'الفئة غير موجودة');
    const itemIds = st.items.filter((i) => Number(i.category_id) === Number(category.id)).map((i) => Number(i.id));
    const usedBranch = st.branchItems.some((r) => itemIds.includes(Number(r.item_id)) && Number(r.qty) > 0);
    const usedVoucher = st.vouchers.some((v) => (v.lines || []).some((l) => itemIds.includes(Number(l.item_id))));
    const usedRequest = st.requests.some((r) => (r.lines || []).some((l) => itemIds.includes(Number(l.item_id))));
    if (usedBranch || usedVoucher || usedRequest) {
      data.fail(400, 'لا يمكن حذف الفئة: بعض أصنافها مستخدمة في فروع أو أذونات أو طلبات');
    }
    st.branchItems = st.branchItems.filter((r) => !itemIds.includes(Number(r.item_id)));
    st.items = st.items.filter((i) => Number(i.category_id) !== Number(category.id));
    st.categories = st.categories.filter((c) => Number(c.id) !== Number(category.id));
  });
  res.json({ ok: true });
}));

router.post('/items', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  const name = text(body.name, 160);
  if (!name) data.fail(400, 'اكتب اسم الصنف');
  const notes = text(body.notes, 500);
  if (body.has_warranty !== true && body.has_warranty !== false) data.fail(400, 'اختر بضمان أو بدون ضمان');
  const out = data.tx((st) => {
    const category = data.categoryByName(body.category);
    if (!category) data.fail(400, 'اختر فئة صحيحة للصنف');
    const id = ++st.counters.item;
    st.items.push({
      id,
      name,
      category_id: category.id,
      stock: 0,
      maint_qty: 0,
      scrap_qty: 0,
      inspection_qty: 0,
      created_by: req.user.name,
      created_at: data.nowIso(),
      warranty_until: asDate(body.warranty_until) || null,
      notes: notes || '',
      has_warranty: !!body.has_warranty
    });
    return { ok: true, id };
  });
  res.json(out);
}));

router.put('/items/:id', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  data.tx((st) => {
    const item = data.itemById(asInt(req.params.id));
    if (!item) data.fail(404, 'الصنف غير موجود');
    if (has(body, 'name')) {
      const name = text(body.name, 160);
      if (!name) data.fail(400, 'اسم الصنف لا يمكن أن يكون فارغًا');
      item.name = name;
    }
    if (has(body, 'category') && text(body.category, 160)) {
      const category = data.categoryByName(body.category);
      if (!category) data.fail(400, 'الفئة غير موجودة');
      item.category_id = category.id;
    }
    if (has(body, 'notes')) item.notes = text(body.notes, 500);
    if (has(body, 'has_warranty')) {
      if (body.has_warranty !== true && body.has_warranty !== false) data.fail(400, 'اختر بضمان أو بدون ضمان');
      item.has_warranty = !!body.has_warranty;
    }
    if (has(body, 'warranty_until')) item.warranty_until = asDate(body.warranty_until);
  });
  res.json({ ok: true });
}));

router.delete('/items/:id', guard('stock'), route((req, res) => {
  if (req.user.role !== 'admin') data.fail(403, 'الحذف متاح لمدير النظام فقط');
  const id = asInt(req.params.id);
  data.tx((st) => {
    const item = data.itemById(id);
    if (!item) data.fail(404, 'الصنف غير موجود');
    const usedBranch = st.branchItems.some((r) => Number(r.item_id) === id && Number(r.qty) > 0);
    const usedVoucher = st.vouchers.some((v) => (v.lines || []).some((l) => Number(l.item_id) === id));
    const usedScrap = st.scrapEntries.some((r) => Number(r.item_id) === id);
    const usedRequest = st.requests.some((r) => (r.lines || []).some((l) => Number(l.item_id) === id));
    if (usedBranch || usedVoucher || usedScrap || usedRequest) {
      data.fail(400, 'لا يمكن حذف الصنف لأنه مستخدم في فروع أو أذونات أو طلبات');
    }
    st.branchItems = st.branchItems.filter((r) => Number(r.item_id) !== id);
    st.items = st.items.filter((i) => Number(i.id) !== id);
  });
  res.json({ ok: true });
}));

const normName = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

router.post('/branches', guard('addBranch'), route((req, res) => {
  const body = bodyOf(req);
  const name = text(body.name, 160);
  if (!name) data.fail(400, 'اكتب اسم الفرع');
  const gov = text(body.gov, 80);
  const out = data.tx((st) => {
    const dup = st.branches.find((b) => normName(b.name) === normName(name) && normName(b.gov) === normName(gov));
    if (dup) data.fail(409, 'هذا الفرع موجود مسبقاً (نفس الاسم والمحافظة)');
    const id = ++st.counters.branch;
    st.branches.push({
      id,
      name,
      gov,
      number: text(body.number, 20),
      manager: text(body.manager, 120),
      phone: text(body.phone, 30),
      address: text(body.address, 500),
      location: text(body.location, 500),
      created_by: req.user.name,
      created_at: today()
    });
    const wanted = new Set();
    const qty = body.qty && typeof body.qty === 'object' ? body.qty : {};
    Object.keys(qty).forEach((k) => { if (asInt(qty[k]) > 0) wanted.add(asInt(k)); });
    (Array.isArray(body.item_ids) ? body.item_ids : []).forEach((v) => { if (asInt(v) > 0) wanted.add(asInt(v)); });
    for (const itemId of wanted) {
      if (!data.itemById(itemId)) continue;
      data.setBranchQty(id, itemId, Math.max(0, asInt(qty[itemId])));
    }
    return { ok: true, id };
  });
  res.json(out);
}));

router.put('/branches/:id', guard('branchEdit'), route((req, res) => {
  const body = bodyOf(req);
  data.tx(() => {
    const branch = data.branchById(asInt(req.params.id));
    if (!branch) data.fail(404, 'الفرع غير موجود');
    const name = text(body.name, 160);
    if (!name) data.fail(400, 'اكتب اسم الفرع');
    branch.name = name;
    branch.number = text(body.number, 20);
    branch.gov = text(body.gov, 80);
    branch.manager = text(body.manager, 120);
    branch.phone = text(body.phone, 30);
    branch.address = text(body.address, 500);
    branch.location = text(body.location, 500);
  });
  res.json({ ok: true });
}));

router.post('/branches/:id/items', guard('branchEdit'), route((req, res) => {
  const body = bodyOf(req);
  const branchId = asInt(req.params.id);
  const itemId = asInt(body.item_id);
  if (!itemId) data.fail(400, 'اختر صنفًا');
  data.tx(() => {
    if (!data.branchById(branchId)) data.fail(404, 'الفرع غير موجود');
    if (!data.itemById(itemId)) data.fail(404, 'الصنف غير موجود');
    if (!data.state.branchItems.some((r) => Number(r.branch_id) === branchId && Number(r.item_id) === itemId)) {
      data.setBranchQty(branchId, itemId, 0);
    }
  });
  res.json({ ok: true });
}));

router.delete('/branches/:id/items/:itemId', guard('branchEdit'), route((req, res) => {
  const branchId = asInt(req.params.id);
  const itemId = asInt(req.params.itemId);
  data.tx((st) => {
    if (!data.branchById(branchId)) data.fail(404, 'الفرع غير موجود');
    if (data.branchQty(branchId, itemId) > 0) {
      data.fail(400, 'لا يمكن إزالة صنف موجود فعليًا في الفرع. انقله أولًا.');
    }
    st.branchItems = st.branchItems.filter((r) => !(Number(r.branch_id) === branchId && Number(r.item_id) === itemId));
  });
  res.json({ ok: true });
}));

router.put('/branches/:id/qty', guard('branchEdit'), route((req, res) => {
  const body = bodyOf(req);
  const branchId = asInt(req.params.id);
  const itemId = asInt(body.item_id);
  const qty = Math.max(0, asInt(body.qty));
  data.tx(() => {
    if (!data.branchById(branchId)) data.fail(404, 'الفرع غير موجود');
    if (!data.itemById(itemId)) data.fail(404, 'الصنف غير موجود');
    data.setBranchQty(branchId, itemId, qty);
  });
  res.json({ ok: true });
}));

router.delete('/branches/:id', guard('addBranch'), route((req, res) => {
  const branchId = asInt(req.params.id);
  data.tx((st) => {
    const branch = data.branchById(branchId);
    if (!branch) data.fail(404, 'الفرع غير موجود');
    const vouchers = st.vouchers.filter((v) => Number(v.branch_id) === branchId || normName(v.source_branch) === normName(branch.name));
    const requests = st.requests.filter((r) => Number(r.branch_id) === branchId);
    const withQty = st.branchItems.filter((r) => Number(r.branch_id) === branchId && Number(r.qty) > 0);
    const blocks = [];
    if (vouchers.length) blocks.push('أذون: ' + vouchers.length);
    if (requests.length) blocks.push('طلبات: ' + requests.length);
    if (withQty.length) blocks.push('أصناف بالفرع: ' + withQty.length);
    if (blocks.length) data.fail(409, 'لا يمكن الحذف، هنالك مراجع: ' + blocks.join('، '));
    st.branchItems = st.branchItems.filter((r) => Number(r.branch_id) !== branchId);
    st.branches = st.branches.filter((b) => Number(b.id) !== branchId);
  });
  res.json({ ok: true });
}));

router.post('/suppliers', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  const name = text(body.name, 160);
  if (!name) data.fail(400, 'اكتب اسم المورد');
  data.tx((st) => {
    if (data.supplierByName(name)) return;
    st.suppliers.push({
      id: ++st.counters.supplier,
      name,
      company: text(body.company, 200),
      address: text(body.address, 300),
      phone: text(body.phone, 60),
      landline: text(body.landline, 60),
      accepts_maintenance: !!body.accepts_maintenance,
      created_by: req.user.name,
      created_at: data.nowIso()
    });
  });
  res.json({ ok: true });
}));

router.put('/suppliers/:id', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  const name = text(body.name, 160);
  if (!name) data.fail(400, 'اكتب اسم المورد');
  data.tx((st) => {
    const supplier = st.suppliers.find((s) => Number(s.id) === asInt(req.params.id));
    if (!supplier) data.fail(404, 'المورد غير موجود');
    const dup = st.suppliers.find((s) => Number(s.id) !== Number(supplier.id) && normName(s.name) === normName(name));
    if (dup) data.fail(400, 'اسم المورد موجود بالفعل');
    supplier.name = name;
    supplier.company = text(body.company, 200);
    supplier.address = text(body.address, 300);
    supplier.phone = text(body.phone, 60);
    supplier.landline = text(body.landline, 60);
    supplier.accepts_maintenance = !!body.accepts_maintenance;
  });
  res.json({ ok: true });
}));

router.delete('/suppliers/:id', guard('stock'), route((req, res) => {
  const id = asInt(req.params.id);
  data.tx((st) => {
    const supplier = st.suppliers.find((s) => Number(s.id) === id);
    if (!supplier) data.fail(404, 'المورد غير موجود');
    const usedVoucher = st.vouchers.some((v) => Number(v.supplier_id) === id);
    const usedCategory = st.categories.some((c) => Number(c.supplier_id) === id);
    if (usedVoucher || usedCategory) data.fail(400, 'لا يمكن حذف المورد: مستخدم في أذونات أو فئات');
    st.suppliers = st.suppliers.filter((s) => Number(s.id) !== id);
  });
  res.json({ ok: true });
}));

/* -------------------------------- vouchers ------------------------------ */

function receiptState(direction, raw) {
  if (direction !== 'in') return 'stock';
  return 'inspection';
}

function normalizeVoucher(body) {
  const direction = body.direction === 'in' ? 'in' : 'out';
  const kind = ['sup', 'maint', 'br'].includes(body.kind) ? body.kind : 'sup';
  const branchId = kind === 'br' ? asInt(body.branch_id) || null : null;
  const lines = (Array.isArray(body.lines) ? body.lines : []).map((l) => ({
    itemId: Number(l.item_id),
    qty: Number(l.qty),
    state: receiptState(direction, l.state),
    serials: Array.isArray(l.serials) ? l.serials.map((s) => String(s).trim()) : [],
    reason: text(l.reason, 200),
    note: text(l.note, 2000),
    condition: text(l.condition || l.item_condition, 200),
    inspectionNotes: text(l.inspection_notes, 2000),
    photoData: Array.isArray(l.photos) ? l.photos.slice(0, 4).map((photo) => String(photo || '')) : [],
    hasWarranty: !!l.has_warranty,
    warrantyUntil: asDate(l.warranty_until),
    maintenanceFormId: positiveInt(l.maintenance_form_id),
    sourceVoucherId: positiveInt(l.source_voucher_id)
  }));
  return {
    direction,
    kind,
    branchId,
    supplierName: text(body.supplier_name, 160),
    number: text(body.number, 60),
    sourceBranch: text(body.source_branch, 160),
    docDate: asDate(body.doc_date),
    lines
  };
}

function validateVoucher(n) {
  if (!n.number) return 'اكتب رقم الإذن';
  if (n.direction === 'out' && n.kind === 'maint') return 'لا يمكن الصرف إلى الصيانة';
  if (n.kind === 'br' && !n.branchId) return 'اختر فرعًا مسجلًا';
  if (n.kind === 'br' && !data.branchById(n.branchId)) return 'الفرع المحدد غير موجود';
  if (n.kind === 'sup' && !n.supplierName) return 'اختر المورد';
  if (!n.lines.length) return 'أضف صنفًا واحدًا على الأقل';
  for (const l of n.lines) {
    if (!Number.isInteger(l.itemId) || l.itemId <= 0) return 'اختر الصنف في كل سطر';
    if (!Number.isInteger(l.qty) || l.qty <= 0) return 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر';
    if (!data.itemById(l.itemId)) return 'الصنف المحدد غير موجود';
  }
  return null;
}

function insertLine(st, l) {
  return {
    id: ++st.counters.voucherLine,
    item_id: l.itemId,
    qty: l.qty,
    item_condition: l.condition || '',
    state: l.state || 'stock',
    serials: Array.isArray(l.serials) ? l.serials : [],
    reason: l.reason || '',
    note: l.note || '',
    maintenance_form_id: l.maintenanceFormId || null,
    inspection: l.state === 'inspection' ? (l.inspection || {
      status: 'pending',
      condition: l.condition || '',
      notes: l.inspectionNotes || '',
      photos: l.inspectionPhotos || [],
      reported_by: ''
    }) : (l.inspection || null),
    has_warranty: !!l.hasWarranty,
    warranty_until: l.warrantyUntil || null
  };
}

function sameReceiptLine(oldLine, line) {
  if (!oldLine || Number(oldLine.item_id) !== Number(line.itemId)
    || Number(oldLine.qty) !== Number(line.qty)) return false;
  const oldSerials = Array.isArray(oldLine.serials) ? oldLine.serials : [];
  return oldSerials.length === line.serials.length
    && oldSerials.every((serial, index) => String(serial).toLowerCase() === String(line.serials[index]).toLowerCase());
}

function prepareInspectionLines(n, oldVoucher, actor, createdPhotos) {
  if (n.direction !== 'in') return;
  let photoCount = 0;
  n.lines.forEach((line, index) => {
    const oldLine = oldVoucher && oldVoucher.lines[index];
    const sameIdentity = sameReceiptLine(oldLine, line);
    const oldInspection = sameIdentity && oldLine.inspection && typeof oldLine.inspection === 'object'
      ? oldLine.inspection : null;
    const photos = oldInspection && Array.isArray(oldInspection.photos) ? oldInspection.photos.slice() : [];
    if (photos.length + line.photoData.length > 3) data.fail(400, 'يسمح بحد أقصى 3 صور لكل إذن استلام');
    line.photoData.forEach((dataUri) => {
      try {
        const photo = inspectionPhotos.write(dataUri);
        createdPhotos.push(photo.id);
        photos.push(photo);
      } catch (err) {
        data.fail(400, err.message);
      }
    });
    photoCount += photos.length;
    const unchanged = oldInspection
      && !line.photoData.length
      && String(oldInspection.condition || '') === String(line.condition || '')
      && String(oldInspection.notes || '') === String(line.inspectionNotes || '');
    if (unchanged) {
      line.state = oldLine.state || 'inspection';
      line.inspection = oldInspection;
    } else {
      line.state = 'inspection';
      line.inspection = {
        status: 'pending',
        condition: line.condition || '',
        notes: line.inspectionNotes || '',
        photos,
        reported_by: actor,
        received_at: data.nowIso()
      };
    }
    line.inspectionPhotos = photos;
    line.photoData = [];
  });
  if (photoCount > 3) data.fail(400, 'يسمح بحد أقصى 3 صور لكل إذن استلام');
}

function insertVoucher(st, n, user) {
  data.assertUniqueNumber(n.direction, n.number, null);
  const voucher = {
    id: ++st.counters.voucher,
    direction: n.direction,
    kind: n.kind,
    supplier_id: n.kind === 'br' ? null : data.ensureSupplier(n.supplierName),
    branch_id: n.branchId,
    number: n.number,
    doc_date: n.docDate || today(),
    source_branch: n.sourceBranch || '',
    created_by: user,
    edited_by: null,
    created_at: data.nowIso(),
    deleted_at: null,
    lines: n.lines.map((l) => insertLine(st, l))
  };
  st.vouchers.push(voucher);
  return voucher;
}

function normalizeHandover(body, voucher) {
  if (!has(body, 'handover')) return null;
  const raw = body.handover;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) data.fail(400, 'بيانات تسليم العهدة غير صالحة');
  if (voucher.direction !== 'out' || voucher.kind !== 'br') data.fail(400, 'تسجيل تسليم العهدة متاح مع إذن الصرف إلى فرع');
  const handover = {
    giverName: text(raw.giverName, 160),
    giverSignature: text(raw.giverSignature, 160),
    receiverName: text(raw.receiverName, 160),
    receiverSignature: text(raw.receiverSignature, 160),
    receiveDate: asDate(raw.receiveDate)
  };
  if (!handover.giverName) data.fail(400, 'اكتب اسم الموظف المُسلِّم');
  if (!handover.giverSignature) data.fail(400, 'اكتب توقيع الموظف المُسلِّم');
  if (!handover.receiverName) data.fail(400, 'اكتب اسم الموظف المستلم');
  if (!handover.receiverSignature) data.fail(400, 'اكتب توقيع الموظف المستلم');
  if (!handover.receiveDate) data.fail(400, 'اختر تاريخ التسليم');
  return handover;
}

function selectedMaintenanceForm(body, voucher, n) {
  if (n.direction !== 'out' || n.kind !== 'sup') data.fail(400, 'إذن الصرف المحدد للصيانة غير صالح');
  const formId = positiveInt(body.maintenance_form_id);
  if (!formId) data.fail(400, 'اختر نموذج الصيانة قبل تسجيل إذن الخروج');
  const form = data.formById(formId);
  if (!form) data.fail(404, 'نموذج الصيانة المحدد غير موجود');
  if (form.issuePermitId != null && Number(form.issuePermitId) !== Number(voucher.id)) {
    const linkedVoucher = data.voucherById(form.issuePermitId);
    if (linkedVoucher) data.fail(409, 'نموذج الصيانة مرتبط بإذن خروج آخر');
  }
  if (n.lines.length !== 1 || Number(form.itemId) !== Number(n.lines[0].itemId)) {
    data.fail(400, 'الصنف في إذن الخروج يجب أن يطابق نموذج الصيانة المحدد');
  }
  if (data.hasSerial(n.lines[0].itemId)) {
    const line = n.lines[0];
    if (line.qty !== 1 || line.serials.length !== 1 || (form.serial && !line.serials.some((serial) => String(serial).toLowerCase() === String(form.serial).toLowerCase()))) {
      data.fail(400, 'السيريال في إذن الخروج يجب أن يطابق نموذج الصيانة المحدد');
    }
  }
  return form;
}

function linkMaintenanceIssue(st, voucher, n, body, actor) {
  const form = selectedMaintenanceForm(body, voucher, n);
  const previous = st.dispatchMeta[voucher.id] && typeof st.dispatchMeta[voucher.id] === 'object'
    ? st.dispatchMeta[voucher.id] : {};
  const previousFormId = previous.maintenanceFormId == null ? null : Number(previous.maintenanceFormId);
  if (previousFormId && previousFormId !== Number(form.id)) {
    const previousForm = data.formById(previousFormId);
    if (previousForm && String(previousForm.issuePermitId) === String(voucher.id)) {
      data.unlinkFormFromDispatch(previousForm, actor);
    }
  }
  const meta = Object.assign({}, previous, {
    destType: 'maintenance',
    maintenanceFormId: form.id,
    partyName: n.supplierName,
    note: text(body.note, META_FIELDS.note),
    stockOfficer: text(body.stockOfficer, 160),
    stockOfficerSignature: text(body.stockOfficerSignature, 160),
    receiverName: text(body.receiverName, 160),
    receiverSignature: text(body.receiverSignature, 160),
    receiveDate: asDate(body.receiveDate) || '',
    gov: text(body.gov, 160),
    address: text(body.address, 500),
    updatedBy: actor,
    updatedAt: data.nowIso()
  });
  form.maintenanceEntity = n.supplierName;
  form.itemId = n.lines[0].itemId;
  if (!form.serial && n.lines[0].serials.length) form.serial = n.lines[0].serials[0];
  if (n.lines[0].reason) form.faultDescription = n.lines[0].reason;
  if (n.lines[0].note) form.accessoriesNotes = n.lines[0].note;
  form.branchName = voucher.source_branch || form.branchName || '';
  form.deliveryDate = voucher.doc_date;
  form.permitNumber = voucher.number;
  form.supportOfficer = actor;
  form.deliveryDate2 = voucher.doc_date;
  form.issuePermitNumber = voucher.number;
  form.maintenanceType = 'external';
  form.status = 'sent_external';
  data.syncFormToDispatch(form, voucher, actor);
  st.dispatchMeta[voucher.id] = meta;
}

function linkMaintenanceReturn(st, voucher, n, actor) {
  n.lines.forEach((line) => {
    if (!line.maintenanceFormId) return;
    const form = data.formById(line.maintenanceFormId);
    if (!form) data.fail(404, 'نموذج الصيانة المرتبط غير موجود');
    const issueId = form.issuePermitId || line.sourceVoucherId;
    const issue = issueId ? data.voucherById(issueId) : null;
    if (!issue || issue.direction !== 'out' || issue.kind !== 'sup') {
      data.fail(400, 'نموذج الصيانة غير مرتبط بإذن خروج للصيانة');
    }
    if (form.issuePermitId && Number(form.issuePermitId) !== Number(issue.id)) {
      data.fail(400, 'نموذج الصيانة مرتبط بإذن خروج مختلف');
    }
    if (form.itemId && Number(form.itemId) !== Number(line.itemId)) {
      data.fail(400, 'الصنف المستلم لا يطابق نموذج الصيانة');
    }
    if (form.serial && (line.qty !== 1 || !line.serials.some((serial) => String(serial).toLowerCase() === String(form.serial).toLowerCase()))) {
      data.fail(400, 'السيريال المستلم لا يطابق نموذج الصيانة');
    }
    const issueLine = issue.lines.find((candidate) => Number(candidate.item_id) === Number(line.itemId)
      && (!form.serial || (candidate.serials || []).some((serial) => String(serial).toLowerCase() === String(form.serial).toLowerCase())));
    if (!issueLine) data.fail(400, 'نموذج الصيانة لا يطابق صنف أو سيريال إذن الخروج');
    if (!form.issuePermitId) {
      const meta = st.dispatchMeta[issue.id] && typeof st.dispatchMeta[issue.id] === 'object'
        ? st.dispatchMeta[issue.id] : {};
      if (meta.maintenanceFormId && Number(meta.maintenanceFormId) !== Number(form.id)) {
        data.fail(409, 'إذن الخروج مرتبط بنموذج صيانة آخر');
      }
      if (st.forms.some((candidate) => Number(candidate.id) !== Number(form.id) && Number(candidate.issuePermitId) === Number(issue.id))) {
        data.fail(409, 'إذن الخروج مرتبط بنموذج صيانة آخر');
      }
      form.itemId = line.itemId;
      form.maintenanceType = 'external';
      form.maintenanceEntity = form.maintenanceEntity || (st.suppliers.find((supplier) => Number(supplier.id) === Number(issue.supplier_id)) || {}).name || '';
      data.syncFormToDispatch(form, issue, actor);
      st.dispatchMeta[issue.id] = Object.assign({}, meta, {
        destType: 'maintenance',
        maintenanceFormId: form.id,
        partyName: form.maintenanceEntity
      });
    }
    form.entryPermitId = voucher.id;
    form.entryPermitNumber = voucher.number;
    form.receiptVoucherId = voucher.id;
    form.receiptVoucherNumber = voucher.number;
    form.receivedDate2 = voucher.doc_date;
    form.inspectionResult3 = line.state === 'inspection' ? 'قيد الفحص' : line.state === 'scrap' ? 'رفض الصيانة' : 'تم إصلاحه';
    form.status = line.state === 'inspection' ? 'awaiting_inspection' : 'received_after_maintenance';
    form.updatedBy = actor;
    form.updatedAt = data.nowIso();
  });
}

function applyLineWarranty(n) {
  if (n.direction !== 'in' || n.kind === 'sup') return;
  for (const l of n.lines) {
    if (l.state !== 'inspection' && l.hasWarranty && l.warrantyUntil) {
      const item = data.itemById(l.itemId);
      if (item) item.warranty_until = l.warrantyUntil;
    }
  }
}

const asVoucherShape = (v) => ({
  direction: v.direction,
  kind: v.kind,
  branch_id: v.branch_id,
  lines: (v.lines || []).map((l) => ({ itemId: l.item_id, qty: l.qty, state: l.state }))
});

router.post('/vouchers', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  const n = normalizeVoucher(body);
  const invalid = validateVoucher(n);
  if (invalid) data.fail(400, invalid);
  const handover = normalizeHandover(body, n);
  if (data.touchesPool(n) && !can(req.user, 'pool')) {
    data.fail(403, 'حركات الصيانة والخردة متاحة لمدير النظام والمدير الفني فقط');
  }
  const requestId = n.direction === 'out' && n.kind === 'br' ? asInt(body.request_id) || null : null;
  const createdPhotos = [];
  let out;
  try {
  out = data.tx((st) => {
    let request = null;
    if (requestId) {
      request = st.requests.find((r) => Number(r.id) === requestId);
      if (!request || request.status !== 'approved') data.fail(400, 'الطلب غير معتمد أو تم صرفه من قبل');
    }
    const serialError = data.validateSerials(n, null);
    if (serialError) data.fail(400, serialError);
    prepareInspectionLines(n, null, req.user.name, createdPhotos);
    if (body.maintenance_flow === true && (!body.maintenance_form_id || n.direction !== 'out' || n.kind !== 'sup')) {
      data.fail(400, 'اختر نموذج الصيانة قبل تسجيل إذن الخروج');
    }
    const applied = data.applyChange(null, n);
    if (!applied.ok) data.fail(400, data.stockError(applied));
    const voucher = insertVoucher(st, n, req.user.name);
    if (handover) {
      st.dispatchMeta[voucher.id] = Object.assign({
        destType: 'branch',
        partyName: (data.branchById(n.branchId) || {}).name || ''
      }, handover, {
        updatedBy: req.user.name,
        updatedAt: data.nowIso()
      });
    }
    if (body.maintenance_flow === true) {
      linkMaintenanceIssue(st, voucher, n, body, req.user.name);
    }
    if (n.direction === 'in' && n.kind === 'maint') {
      linkMaintenanceReturn(st, voucher, n, req.user.name);
    }
    applyLineWarranty(n);
    if (request) {
      request.status = 'released';
      request.releasedVoucherId = voucher.id;
      request.log.push({
        id: ++st.counters.requestLog,
        by_name: req.user.name,
        action: 'أكد الصرف',
        kind: 'ok',
        note: '',
        created_at: data.nowIso()
      });
    }
    return { ok: true, id: voucher.id };
  });
  } catch (err) {
    createdPhotos.forEach((id) => inspectionPhotos.remove(id));
    throw err;
  }
  res.json(out);
}));

router.put('/vouchers/:id', guard('stock'), route((req, res) => {
  const body = bodyOf(req);
  const id = asInt(req.params.id);
  const n = normalizeVoucher(body);
  const invalid = validateVoucher(n);
  if (invalid) data.fail(400, invalid);
  const handover = normalizeHandover(body, n);
  if (body.maintenance_flow === true && (!body.maintenance_form_id || n.direction !== 'out' || n.kind !== 'sup')) {
    data.fail(400, 'اختر نموذج الصيانة قبل تسجيل إذن الخروج');
  }
  const createdPhotos = [];
  try {
  data.tx((st) => {
    const old = data.voucherById(id);
    if (!old) data.fail(404, 'الإذن غير موجود');
    if ((data.touchesPool(n) || data.touchesPool(asVoucherShape(old))) && !can(req.user, 'pool')) {
      data.fail(403, 'حركات الصيانة والخردة متاحة لمدير النظام والمدير الفني فقط');
    }
    const serialError = data.validateSerials(n, id);
    if (serialError) data.fail(400, serialError);
    prepareInspectionLines(n, old, req.user.name, createdPhotos);
    const applied = data.applyChange(asVoucherShape(old), n);
    if (!applied.ok) data.fail(400, data.stockError(applied));
    data.assertUniqueNumber(n.direction, n.number, id);
    old.direction = n.direction;
    old.kind = n.kind;
    old.supplier_id = n.kind === 'br' ? null : data.ensureSupplier(n.supplierName);
    old.branch_id = n.branchId;
    old.number = n.number;
    old.source_branch = n.sourceBranch || '';
    if (n.docDate) old.doc_date = n.docDate;
    old.edited_by = req.user.name;
    old.lines = n.lines.map((l) => insertLine(st, l));
    if (handover) {
      const previousMeta = st.dispatchMeta[old.id] && typeof st.dispatchMeta[old.id] === 'object'
        ? st.dispatchMeta[old.id] : {};
      st.dispatchMeta[old.id] = Object.assign({}, previousMeta, {
        destType: 'branch',
        partyName: (data.branchById(n.branchId) || {}).name || '',
        giverName: handover.giverName,
        giverSignature: handover.giverSignature,
        receiverName: handover.receiverName,
        receiverSignature: handover.receiverSignature,
        receiveDate: handover.receiveDate,
        updatedBy: req.user.name,
        updatedAt: data.nowIso()
      });
    }
    if (body.maintenance_flow === true) {
      linkMaintenanceIssue(st, old, n, body, req.user.name);
    }
    if (n.direction === 'in' && n.kind === 'maint') {
      linkMaintenanceReturn(st, old, n, req.user.name);
    }
    applyLineWarranty(n);
    // The dispatch sheet prints the permit number from both sides; keep them
    // identical after an edit.
    const meta = old.direction === 'out' ? st.dispatchMeta[old.id] : null;
    if (meta && meta.maintenanceFormId != null) {
      const form = data.formById(meta.maintenanceFormId);
      if (form && String(form.issuePermitId) === String(old.id)) {
        form.issuePermitNumber = old.number;
        if (Array.isArray(form.dispatchLinks)) {
          form.dispatchLinks.forEach((l) => { if (String(l.permitId) === String(old.id)) l.permitNumber = old.number; });
        }
      }
    }
  });
  } catch (err) {
    createdPhotos.forEach((photoId) => inspectionPhotos.remove(photoId));
    throw err;
  }
  res.json({ ok: true });
}));

router.post('/inspections/:voucherId/:lineId/review', guard('inspectionReview'), route((req, res) => {
  const body = bodyOf(req);
  const decision = body.decision === 'damaged' ? 'damaged' : body.decision === 'good' ? 'good' : '';
  if (!decision) data.fail(400, 'اختر نتيجة الفحص');
  const reviewNotes = text(body.notes, 2000);
  data.tx((st) => {
    const voucher = data.voucherById(asInt(req.params.voucherId));
    if (!voucher || voucher.direction !== 'in') data.fail(404, 'إذن الاستلام غير موجود');
    const line = voucher.lines.find((entry) => Number(entry.id) === asInt(req.params.lineId));
    if (!line || line.state !== 'inspection') data.fail(409, 'هذا الصنف ليس بانتظار الفحص');
    const before = asVoucherShape(voucher);
    line.state = decision === 'good' ? 'stock' : 'scrap';
    line.inspection = Object.assign({}, line.inspection || {}, {
      status: decision === 'good' ? 'approved' : 'rejected',
      decision,
      reviewed_by: req.user.name,
      reviewed_at: data.nowIso(),
      review_notes: reviewNotes
    });
    const applied = data.applyChange(before, asVoucherShape(voucher));
    if (!applied.ok) data.fail(400, data.stockError(applied));
    if (line.maintenance_form_id) {
      const form = data.formById(line.maintenance_form_id);
      if (form) {
        form.inspectionResult3 = decision === 'good' ? 'تم إصلاحه' : 'رفض الصيانة';
        form.status = 'received_after_maintenance';
        form.updatedBy = req.user.name;
        form.updatedAt = data.nowIso();
      }
    }
    if (decision === 'good' && line.has_warranty && line.warranty_until) {
      const item = data.itemById(line.item_id);
      if (item) item.warranty_until = line.warranty_until;
    }
  });
  res.json({ ok: true });
}));

router.delete('/vouchers/:id', guard('delRecv'), route((req, res) => {
  const id = asInt(req.params.id);
  data.tx((st) => {
    const old = data.voucherById(id);
    if (!old) data.fail(404, 'الإذن غير موجود');
    if (data.touchesPool(asVoucherShape(old)) && !can(req.user, 'pool')) {
      data.fail(403, 'حركات الصيانة والخردة متاحة لمدير النظام والمدير الفني فقط');
    }
    const applied = data.applyChange(asVoucherShape(old), null);
    if (!applied.ok) data.fail(400, data.stockError(applied));
    old.deleted_at = data.nowIso();
    data.clearVoucherLinks(old.id, req.user.name);
  });
  res.json({ ok: true });
}));

/* --------------------------------- scrap -------------------------------- */

router.post('/scrap', guard('pool'), route((req, res) => {
  const body = bodyOf(req);
  const mode = body.mode === 'plain' ? 'plain' : 'serial';
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) data.fail(400, 'أضف صنفًا واحدًا على الأقل');
  const lines = rawLines.map((l) => ({
    itemId: Number(l.item_id),
    qty: Number(l.qty),
    serials: Array.isArray(l.serials) ? l.serials.map((s) => String(s).trim()) : []
  }));
  for (const l of lines) {
    if (!Number.isInteger(l.itemId) || l.itemId <= 0) data.fail(400, 'اختر الصنف في كل سطر');
    if (!Number.isInteger(l.qty) || l.qty <= 0) data.fail(400, 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر');
  }
  data.tx((st) => {
    const ids = [...new Set(lines.map((l) => l.itemId))];
    for (const id of ids) if (!data.itemById(id)) data.fail(400, 'الصنف المحدد غير موجود');
    const ledger = mode === 'serial' ? data.serialLedger(ids, null) : new Map();
    const seen = new Set();
    for (const l of lines) {
      if (mode === 'serial' && data.hasSerial(l.itemId)) {
        if (l.serials.length !== l.qty) data.fail(400, 'اكتب سيريال لكل قطعة');
        if (l.serials.some((s) => !s)) data.fail(400, 'اكتب كل السيريالات');
        for (const sn of l.serials) {
          const key = data.serialKey(l.itemId, sn);
          if (seen.has(key)) data.fail(400, 'سيريال مكرر: ' + sn);
          seen.add(key);
          const current = ledger.get(key);
          if (!current || current.state !== 'stock') data.fail(400, 'السيريال ' + sn + ' غير متاح في المخزن');
        }
      } else {
        l.serials = [];
      }
    }
    const applied = data.applyScrap(lines);
    if (!applied.ok) data.fail(400, 'الكمية المطلوبة أكبر من رصيد المخزن');
    for (const l of lines) {
      st.scrapEntries.push({
        id: ++st.counters.scrapEntry,
        item_id: l.itemId,
        qty: l.qty,
        serials: l.serials,
        created_by: req.user.name,
        created_at: data.nowIso()
      });
    }
  });
  res.json({ ok: true });
}));

/* -------------------------------- requests ------------------------------ */

function readRequestLines(raw) {
  const lines = (Array.isArray(raw) ? raw : []).map((l) => ({ itemId: Number(l.item_id), qty: Number(l.qty) }));
  for (const l of lines) {
    if (!Number.isInteger(l.itemId) || l.itemId <= 0) data.fail(400, 'اختر الصنف في كل سطر');
    if (!Number.isInteger(l.qty) || l.qty <= 0) data.fail(400, 'اكتب عددًا صحيحًا أكبر من صفر في كل سطر');
    if (!data.itemById(l.itemId)) data.fail(400, 'الصنف المحدد غير موجود');
  }
  return lines;
}

router.post('/requests', guard('request'), route((req, res) => {
  const body = bodyOf(req);
  const branchId = asInt(body.branch_id);
  if (!branchId) data.fail(400, 'اختر الفرع');
  if (!data.branchById(branchId)) data.fail(400, 'الفرع المحدد غير موجود');
  const lines = readRequestLines(body.lines);
  if (!lines.length) data.fail(400, 'اختر صنفًا واحدًا على الأقل');
  const out = data.tx((st) => {
    const id = ++st.counters.request;
    const logId = ++st.counters.requestLog;
    st.requests.push({
      id,
      branch_id: branchId,
      requested_by: req.user.name,
      status: req.user.role === 'junior' ? 'review' : 'pending',
      created_at: data.nowIso(),
      releasedVoucherId: null,
      lines: lines.map((l, idx) => ({ id: ++st.counters.requestLine, item_id: l.itemId, qty: l.qty })),
      log: [{
        id: logId,
        by_name: req.user.name,
        action: 'أرسل الطلب',
        kind: '',
        note: text(body.note, 2000),
        created_at: data.nowIso()
      }]
    });
    return { ok: true, id };
  });
  res.json(out);
}));

router.post('/requests/:id/action', route((req, res) => {
  const body = bodyOf(req);
  const id = asInt(req.params.id);
  const action = String(body.action || '');
  const role = req.user.role;
  data.tx((st) => {
    const request = st.requests.find((r) => Number(r.id) === id);
    if (!request) data.fail(404, 'الطلب غير موجود');
    if (request.status === 'rejected') data.fail(400, 'الطلب مرفوض ومغلق');
    if (request.status === 'released') data.fail(400, 'تم صرف الطلب بالفعل');

    const log = (a, k, t) => {
      request.log.push({
        id: ++st.counters.requestLog,
        by_name: req.user.name,
        action: a,
        kind: k || '',
        note: t || '',
        created_at: data.nowIso()
      });
    };

    if (action === 'no') {
      if (!can(role, 'reject')) data.fail(403, 'لا تملك صلاحية هذا الإجراء');
      const note = text(body.note, 2000);
      if (!note) data.fail(400, 'اكتب سبب الرفض');
      log('رفض', 'no', note);
      request.status = 'rejected';
    } else if (action === 'save') {
      if (!can(role, 'edit')) data.fail(403, 'لا تملك صلاحية هذا الإجراء');
      const lines = readRequestLines(body.lines);
      if (!lines.length) data.fail(400, 'اترك صنفًا واحدًا على الأقل أو ارفض الطلب');
      if (has(body, 'branch_id')) {
        const nextBranch = asInt(body.branch_id);
        if (!nextBranch || !data.branchById(nextBranch)) data.fail(400, 'الفرع المحدد غير موجود');
        request.branch_id = nextBranch;
      }
      request.lines = lines.map((l) => ({ id: ++st.counters.requestLine, item_id: l.itemId, qty: l.qty }));
      log('عدّل الطلب', '', text(body.note, 2000) || 'تم التعديل');
    } else if (action === 'rev') {
      if (!can(role, 'review') || request.status !== 'review') data.fail(400, 'لا يمكن تنفيذ هذا الإجراء');
      log('أكد الطلب', 'ok', '');
      request.status = 'pending';
    } else if (action === 'ok') {
      if (!can(role, 'approve') || request.status !== 'pending') data.fail(400, 'لا يمكن تنفيذ هذا الإجراء');
      log('وافق', 'ok', '');
      request.status = 'approved';
    } else if (action === 'out') {
      if (!can(role, 'release') || request.status !== 'approved') data.fail(400, 'لا يمكن تنفيذ هذا الإجراء');
      const lines = request.lines.map((l) => ({ itemId: l.item_id, qty: l.qty }));
      for (const l of lines) {
        if (!data.hasSerial(l.itemId)) continue;
        const serials = data.pickStockSerials(l.itemId, l.qty);
        if (!serials) {
          const item = data.itemById(l.itemId);
          data.fail(400, 'لا توجد سيريالات كافية في المخزن للصنف ' + (item ? item.name : ''));
        }
        l.serials = serials;
      }
      const n = {
        direction: 'out',
        kind: 'br',
        branchId: request.branch_id,
        supplierName: '',
        number: 'REQ-' + String(request.id).padStart(4, '0'),
        sourceBranch: '',
        docDate: today(),
        lines: lines.map((l) => ({
          itemId: l.itemId,
          qty: l.qty,
          state: 'stock',
          serials: l.serials || [],
          reason: '',
          note: '',
          condition: '',
          hasWarranty: false,
          warrantyUntil: null
        }))
      };
      const applied = data.applyChange(null, n);
      if (!applied.ok) data.fail(400, data.stockError(applied));
      const voucher = insertVoucher(st, n, req.user.name);
      log('أكد الصرف', 'ok', '');
      request.status = 'released';
      request.releasedVoucherId = voucher.id;
    } else {
      data.fail(400, 'إجراء غير معروف');
    }
  });
  res.json({ ok: true });
}));

/* ---------------------- maintenance forms (JSON files) ------------------ */

const MF_TYPES = new Set(['internal', 'external']);
const MF_STATUS = new Set(['received', 'internal_check', 'sent_external', 'received_after_maintenance', 'returned_to_branch']);
const MF_STATUS_AR = {
  received: 'تم الاستلام',
  internal_check: 'فحص داخلي',
  sent_external: 'مرسل لصيانة خارجية',
  received_after_maintenance: 'تم الاستلام بعد الصيانة',
  returned_to_branch: 'تم الإرجاع للفرع'
};

const positiveInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function formBase(body) {
  const clean = sanitize(body, 0);
  if (!clean || typeof clean !== 'object' || Array.isArray(clean)) data.fail(400, 'بيانات النموذج غير صالحة');
  delete clean.id;
  delete clean.number;
  delete clean.createdBy;
  delete clean.createdAt;
  delete clean.updatedBy;
  delete clean.updatedAt;
  return clean;
}

function validateFormType(status, type) {
  if (type != null && !MF_TYPES.has(type)) data.fail(400, 'نوع صيانة غير صالح');
  if (status != null && !MF_STATUS.has(status)) data.fail(400, 'حالة نموذج غير صالحة');
}

function linkFormVouchers(form, body, actor) {
  const keys = ['issuePermitId', 'entryPermitId', 'receiptVoucherId'];
  for (const key of keys) {
    if (!has(body, key)) continue;
    if (body[key] == null || body[key] === '') {
      form[key] = null;
      if (key === 'issuePermitId') form.issuePermitNumber = '';
      if (key === 'entryPermitId') form.entryPermitNumber = '';
      if (key === 'receiptVoucherId') form.receiptVoucherNumber = '';
      continue;
    }
    data.voucherLink(form, key, body[key], actor);
  }
  if (Array.isArray(body.dispatchLinks)) {
    form.dispatchLinks = body.dispatchLinks
      .slice(0, 50)
      .map((l) => sanitize(l, 0))
      .filter((l) => l && typeof l === 'object')
      .map((l) => Object.assign({}, l, {
        permitId: positiveInt(l.permitId),
        permitNumber: text(l.permitNumber, 60),
        date: asDate(l.date) || ''
      }))
      .filter((l) => {
        if (l.permitId == null) return false;
        const v = data.voucherById(l.permitId);
        return !!v && v.direction === 'out';
      });
  }
}

router.get('/maintenance-forms', route((req, res) => {
  res.json({ forms: data.state.forms });
}));

router.post('/maintenance-forms', guard('maintCreate'), route((req, res) => {
  const body = bodyOf(req);
  const clean = formBase(body);
  validateFormType(clean.status, clean.maintenanceType);
  const out = data.tx((st) => {
    const seq = ++st.counters.form;
    const now = data.nowIso();
    const rec = Object.assign({}, clean, {
      id: seq,
      number: 'MF-' + String(seq).padStart(4, '0'),
      maintenanceType: MF_TYPES.has(clean.maintenanceType) ? clean.maintenanceType : 'internal',
      status: MF_STATUS.has(clean.status) ? clean.status : 'received',
      dispatchLinks: Array.isArray(clean.dispatchLinks) ? clean.dispatchLinks : [],
      requestOnly: req.user.role === 'junior',
      createdBy: req.user.name,
      createdAt: now,
      updatedBy: req.user.name,
      updatedAt: now
    });
    if (req.user.role === 'junior') rec.status = 'received';
    linkFormVouchers(rec, body, req.user.name);
    st.forms.push(rec);
    return { ok: true, form: rec };
  });
  res.json(out);
}));

router.put('/maintenance-forms/:id', guard('maintEdit'), route((req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) data.fail(400, 'رقم النموذج غير صالح');
  const body = bodyOf(req);
  const clean = formBase(body);
  validateFormType(clean.status, clean.maintenanceType);
  const out = data.tx((st) => {
    const idx = st.forms.findIndex((f) => Number(f.id) === id);
    if (idx < 0) data.fail(404, 'نموذج الصيانة غير موجود');
    const before = st.forms[idx];
    // True merge: only the keys present in the request change.
    const rec = Object.assign({}, before, clean, {
      id: before.id,
      number: before.number,
      createdBy: before.createdBy,
      createdAt: before.createdAt,
      updatedBy: req.user.name,
      updatedAt: data.nowIso()
    });
    if (has(clean, 'maintenanceType')) rec.maintenanceType = clean.maintenanceType;
    if (has(clean, 'status')) rec.status = clean.status;
    linkFormVouchers(rec, body, req.user.name);

    // A form linked to an external maintenance dispatch keeps the dispatch
    // metadata in sync on the server, not only from the browser.
    if (rec.issuePermitId != null) {
      const voucher = data.voucherById(rec.issuePermitId);
      if (voucher && (rec.status === 'sent_external' || rec.maintenanceType === 'external')) {
        const key = String(voucher.id);
        const prev = st.dispatchMeta[key] && typeof st.dispatchMeta[key] === 'object' ? st.dispatchMeta[key] : {};
        st.dispatchMeta[key] = Object.assign({}, prev, {
          destType: 'maintenance',
          maintenanceFormId: rec.id,
          partyName: prev.partyName || rec.maintenanceEntity || '',
          updatedBy: req.user.name,
          updatedAt: data.nowIso()
        });
      }
    }
    st.forms[idx] = rec;
    return { ok: true, form: rec };
  });
  res.json(out);
}));

router.delete('/maintenance-forms/:id', guard('maintDelete'), route((req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) data.fail(400, 'رقم النموذج غير صالح');
  data.tx((st) => {
    const exists = st.forms.some((f) => Number(f.id) === id);
    if (!exists) data.fail(404, 'نموذج الصيانة غير موجود');
    st.forms = st.forms.filter((f) => Number(f.id) !== id);
    Object.keys(st.dispatchMeta).forEach((key) => {
      if (Number(st.dispatchMeta[key] && st.dispatchMeta[key].maintenanceFormId) === id) {
        st.dispatchMeta[key].maintenanceFormId = null;
      }
    });
  });
  res.json({ ok: true });
}));

/* ------------------- dispatch printable metadata (file) ------------------ */

const META_FIELDS = {
  note: 4000,
  stockOfficer: 160,
  stockOfficerSignature: 160,
  giverName: 160,
  giverSignature: 160,
  receiverName: 160,
  receiverSignature: 160,
  gov: 160,
  address: 500,
  partyName: 200
};

router.get('/dispatch-meta', route((req, res) => {
  res.json({ meta: data.state.dispatchMeta });
}));

router.put('/dispatch-meta/:id', guard('stock'), route((req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) data.fail(400, 'رقم الإذن غير صالح');
  const body = bodyOf(req);
  const out = data.tx((st) => {
    const voucher = data.voucherById(id);
    if (!voucher || voucher.direction !== 'out') data.fail(404, 'إذن الصرف غير موجود');
    const prev = st.dispatchMeta[id] && typeof st.dispatchMeta[id] === 'object' ? st.dispatchMeta[id] : {};
    const dest = ['branch', 'supplier', 'maintenance'].includes(body.destType)
      ? body.destType
      : (prev.destType || 'branch');
    const next = Object.assign({}, prev, { destType: dest });
    for (const [field, max] of Object.entries(META_FIELDS)) {
      if (has(body, field)) next[field] = text(body[field], max);
    }
    if (has(body, 'receiveDate')) next.receiveDate = asDate(body.receiveDate) || '';
    ['maintenanceFormId', 'requestId'].forEach((field) => {
      if (has(body, field)) next[field] = positiveInt(body[field]);
    });
    next.updatedBy = req.user.name;
    next.updatedAt = data.nowIso();

    const oldFormId = prev.maintenanceFormId != null ? Number(prev.maintenanceFormId) : null;
    const newFormId = next.maintenanceFormId != null ? Number(next.maintenanceFormId) : null;

    if (oldFormId && oldFormId !== newFormId) {
      const oldForm = data.formById(oldFormId);
      if (oldForm && String(oldForm.issuePermitId) === String(voucher.id)) {
        data.unlinkFormFromDispatch(oldForm, req.user.name);
      }
    }

    if (dest === 'maintenance' && newFormId) {
      const form = data.formById(newFormId);
      if (!form) data.fail(400, 'نموذج الصيانة غير موجود');
      form.maintenanceEntity = form.maintenanceEntity || next.partyName || '';
      data.syncFormToDispatch(form, voucher, req.user.name);
    } else if (dest !== 'maintenance' && oldFormId) {
      const oldForm = data.formById(oldFormId);
      if (oldForm) data.unlinkFormFromDispatch(oldForm, req.user.name);
    }

    st.dispatchMeta[id] = next;
    return { ok: true, meta: next };
  });
  res.json(out);
}));

router.delete('/dispatch-meta/:id', guard('delRecv'), route((req, res) => {
  const id = positiveInt(req.params.id);
  if (!id) data.fail(400, 'رقم الإذن غير صالح');
  data.tx((st) => {
    const entry = st.dispatchMeta[id];
    delete st.dispatchMeta[id];
    const formId = entry && entry.maintenanceFormId != null ? Number(entry.maintenanceFormId) : null;
    const candidates = [];
    if (formId) { const f = data.formById(formId); if (f) candidates.push(f); }
    for (const form of st.forms) {
      if (String(form.issuePermitId) === String(id) && !candidates.includes(form)) candidates.push(form);
    }
    candidates.forEach((form) => data.unlinkFormFromDispatch(form, req.user.name));
  });
  res.json({ ok: true });
}));

module.exports = router;
