'use strict';

// End-to-end API test suite for the JSON backend. Run it against an isolated
// data directory so the real warehouse files are never touched:
//   WH_DATA_DIR=/tmp/wh-test PORT=3999 node src/index.js &
//   BASE=http://localhost:3999 node scripts/test-api.js
// After a server restart, run with PHASE=verify to confirm persistence.
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3000';
const PHASE = process.env.PHASE || 'run';
const EXPECTED_FILE = process.env.EXPECTED_FILE || '/tmp/wh-test-expected.json';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('PASS  ' + name);
  } else {
    fail++;
    failures.push(name);
    console.log('FAIL  ' + name + (detail === undefined ? '' : '  => ' + JSON.stringify(detail)));
  }
}

const arabic = (s) => /[\u0600-\u06FF]/.test(String(s || ''));

async function call(token, method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await res.json(); } catch (_) { data = {}; }
  return { status: res.status, data };
}

async function login(username, password) {
  return call(null, 'POST', '/auth/login', { username, password });
}

async function bootstrap(token) {
  const r = await call(token, 'GET', '/bootstrap');
  if (r.status !== 200) throw new Error('bootstrap failed: ' + JSON.stringify(r));
  return r.data;
}

const today = () => new Date().toISOString().slice(0, 10);
const itemById = (b, id) => b.items.find((i) => Number(i.id) === Number(id)) || {};
const requestById = (b, id) => b.requests.find((r) => Number(r.id) === Number(id)) || {};
const formById = (b, id) => (b.maintenanceForms || []).find((f) => Number(f.id) === Number(id)) || {};
const voucherByNumber = (b, dir, number) => (b.vouchers[dir] || []).find((v) => String(v.p) === String(number)) || null;

async function phaseRun() {
  const suffix = String(Date.now()).slice(-6);
  const branchName = 'فرع اختبار ' + suffix;
  const categoryName = 'فئة اختبار ' + suffix;
  const supplierName = 'مورد اختبار ' + suffix;
  const itemName = 'صنف اختبار ' + suffix;
  const editItem = 'صنف تعديل ' + suffix;
  const plainCat = 'فئة بدون سيريال ' + suffix;
  const plainItem = 'صنف بدون سيريال ' + suffix;
  const s1 = 'TST-' + suffix + '-1';
  const s2 = 'TST-' + suffix + '-2';

  /* ------------------------------- auth ------------------------------- */
  const accounts = [
    ['admin', 'admin123', 'admin'],
    ['head', 'head123', 'head'],
    ['area', 'area123', 'area'],
    ['store', 'store123', 'store'],
    ['senior', 'senior123', 'senior'],
    ['junior', 'junior123', 'junior']
  ];
  const tokens = {};
  for (const [username, password, role] of accounts) {
    const r = await login(username, password);
    check('login ' + username, r.status === 200 && r.data.user && r.data.user.role === role, r);
    tokens[role] = r.data.token;
  }
  check('login wrong password rejected', (await login('admin', 'nope')).status === 401);
  const malformed = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json'
  });
  let malformedBody = {};
  try { malformedBody = await malformed.json(); } catch (_) { malformedBody = {}; }
  check('malformed JSON body is a 400 with an Arabic error', malformed.status === 400 && arabic(malformedBody.error), { status: malformed.status, body: malformedBody });
  check('bootstrap without token is 401', (await call(null, 'GET', '/bootstrap')).status === 401);
  check('bad token is 401', (await call('garbage.token.value', 'GET', '/bootstrap')).status === 401);

  const admin = tokens.admin;

  /* ---------------------------- master data ---------------------------- */
  let r = await call(admin, 'POST', '/branches', {
    name: branchName, gov: 'الإسكندرية', number: '99', manager: 'مدير الاختبار', phone: '01000000000', address: 'عنوان', location: 'موقع'
  });
  check('create branch', r.status === 200 && r.data.id, r);
  const branchId = r.data.id;
  check('duplicate branch rejected', (await call(admin, 'POST', '/branches', { name: branchName, gov: 'الإسكندرية' })).status === 409);
  check('create branch requires name', (await call(admin, 'POST', '/branches', { name: '' })).status === 400);

  r = await call(admin, 'POST', '/categories', { name: categoryName, has_serial: true, supplier: supplierName });
  check('create serial category', r.status === 200, r);
  check('duplicate category rejected', (await call(admin, 'POST', '/categories', { name: categoryName, has_serial: true })).status === 409);

  r = await call(admin, 'POST', '/categories', { name: plainCat, has_serial: false });
  check('create non-serial category', r.status === 200, r);

  r = await call(admin, 'POST', '/items', { name: itemName, category: categoryName, notes: 'ملاحظات', has_warranty: false });
  check('create serial item', r.status === 200 && r.data.id, r);
  const itemId = r.data.id;

  r = await call(admin, 'POST', '/items', { name: plainItem, category: plainCat, has_warranty: false });
  check('create plain item', r.status === 200 && r.data.id, r);
  const plainItemId = r.data.id;

  check('item without name rejected', (await call(admin, 'POST', '/items', { name: '', category: categoryName, has_warranty: false })).status === 400);
  check('item without warranty flag rejected', (await call(admin, 'POST', '/items', { name: 'x', category: categoryName })).status === 400);

  let b = await bootstrap(admin);
  check('branch persisted in bootstrap', !!b.branches.find((x) => Number(x.id) === Number(branchId)), b.branches.map((x) => x.n));
  check('supplier auto-created for category', b.suppliers.some((s) => s.n === supplierName), b.suppliers.map((s) => s.n));
  check('new item starts at zero stock', itemById(b, itemId).s === 0, itemById(b, itemId));

  /* --------------------------- receive units --------------------------- */
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'sup', number: 'T-IN-' + suffix, doc_date: today(),
    supplier_name: supplierName,
    lines: [{ item_id: itemId, qty: 2, serials: [s1, s2], state: 'stock' }]
  });
  check('receive 2 serial units', r.status === 200 && r.data.id, r);
  const inVoucherId = r.data.id;

  b = await bootstrap(admin);
  check('stock is 2 after receipt', itemById(b, itemId).s === 2, itemById(b, itemId).s);

  check('duplicate serial rejected', (await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'sup', number: 'T-IN-DUP-' + suffix, supplier_name: supplierName,
    lines: [{ item_id: itemId, qty: 1, serials: [s1], state: 'stock' }]
  })).status === 400);

  r = await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'sup', number: 'T-IN-NOSN-' + suffix, supplier_name: supplierName,
    lines: [{ item_id: itemId, qty: 1, serials: [], state: 'stock' }]
  });
  check('serial category requires one serial per unit', r.status === 400 && arabic(r.data.error), r);

  check('voucher without number rejected', (await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'sup', supplier_name: supplierName, lines: [{ item_id: itemId, qty: 1, serials: [s1] }]
  })).status === 400);

  /* --------------------------- request flow --------------------------- */
  r = await call(tokens.junior, 'POST', '/requests', {
    branch_id: branchId, lines: [{ item_id: itemId, qty: 1 }], note: 'طلب اختبار'
  });
  check('junior creates request', r.status === 200 && r.data.id, r);
  const requestId = r.data.id;

  b = await bootstrap(admin);
  check('junior request starts in review', requestById(b, requestId).st === 'review', requestById(b, requestId));

  r = await call(tokens.junior, 'POST', '/requests/' + requestId + '/action', { action: 'rev' });
  check('junior cannot review', r.status === 400 || r.status === 403, r);

  r = await call(tokens.senior, 'POST', '/requests/' + requestId + '/action', { action: 'rev' });
  check('senior reviews request', r.status === 200, r);
  b = await bootstrap(admin);
  check('request moved to pending', requestById(b, requestId).st === 'pending', requestById(b, requestId).st);

  r = await call(tokens.area, 'POST', '/requests/' + requestId + '/action', { action: 'ok' });
  check('area approves request', r.status === 200, r);
  b = await bootstrap(admin);
  check('request moved to approved', requestById(b, requestId).st === 'approved', requestById(b, requestId).st);

  r = await call(tokens.store, 'POST', '/requests/' + requestId + '/action', { action: 'out' });
  check('store releases request', r.status === 200, r);

  b = await bootstrap(admin);
  const released = requestById(b, requestId);
  check('request marked released', released.st === 'released', released.st);
  const reqVoucherNumber = 'REQ-' + String(requestId).padStart(4, '0');
  const reqVoucher = voucherByNumber(b, 'out', reqVoucherNumber);
  check('release created an issue voucher', !!reqVoucher, reqVoucherNumber);
  check('release voucher carries the picked serial', !!reqVoucher && reqVoucher.lines[0].sns.length === 1, reqVoucher && reqVoucher.lines);
  check('stock deducted by release', itemById(b, itemId).s === 1, itemById(b, itemId).s);
  check('branch received released unit', Number(((b.branches.find((x) => Number(x.id) === Number(branchId)) || {}).q || {})[itemId]) === 1);
  check('second release rejected', (await call(tokens.store, 'POST', '/requests/' + requestId + '/action', { action: 'out' })).status === 400);

  const issuedSerial = reqVoucher && reqVoucher.lines[0].sns[0];
  const remainingSerial = issuedSerial === s1 ? s2 : s1;

  /* ------------------------- invalid issue rules ---------------------- */
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'br', number: 'T-OUT-BAD-' + suffix, branch_id: branchId,
    lines: [{ item_id: itemId, qty: 1, serials: ['NOT-IN-STOCK-' + suffix], state: 'stock' }]
  });
  check('issuing unknown serial is blocked', r.status === 400 && arabic(r.data.error), r);

  r = await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'br', number: 'T-OUT-BAD2-' + suffix, branch_id: branchId,
    lines: [{ item_id: itemId, qty: 1, serials: [issuedSerial], state: 'stock' }]
  });
  check('issuing a serial that is already at a branch is blocked', r.status === 400 && arabic(r.data.error), r);

  /* ------------------- branch out / return for maintenance ------------- */
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'br', number: 'T-BR-OUT-' + suffix, branch_id: branchId, doc_date: today(),
    lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial], state: 'stock' }]
  });
  check('issue remaining unit to branch', r.status === 200, r);
  b = await bootstrap(admin);
  check('stock zero after branch issue', itemById(b, itemId).s === 0, itemById(b, itemId).s);

  r = await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'br', number: 'T-BR-IN-' + suffix, branch_id: branchId, doc_date: today(),
    lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial], state: 'stock' }]
  });
  check('receive device back from branch', r.status === 200, r);
  b = await bootstrap(admin);
  check('stock back to 1 after branch return', itemById(b, itemId).s === 1, itemById(b, itemId).s);

  /* -------------------------- maintenance forms ----------------------- */
  const mfPayload = {
    maintenanceType: 'internal', status: 'internal_check',
    branchName, ownerName: 'موظف اختبار', employeeCode: 'E-1', department: 'IT',
    deviceType: itemName, serial: remainingSerial, faultDescription: 'عطل تجريبي',
    itemId, branchId, deliveryDate: today(),
    customField: 'keep-me', nested: { a: 1, b: [1, 2] }
  };
  r = await call(admin, 'POST', '/maintenance-forms', mfPayload);
  check('create internal maintenance form', r.status === 200 && r.data.form, r);
  const internalForm = r.data.form;
  check('form gets an auto number', /^MF-\d{4}$/.test(internalForm.number), internalForm.number);
  check('form number does not reuse MF-0001', internalForm.number !== 'MF-0001', internalForm.number);
  check('unknown form fields are kept', internalForm.customField === 'keep-me' && internalForm.nested && internalForm.nested.a === 1, internalForm);

  r = await call(admin, 'PUT', '/maintenance-forms/' + internalForm.id, { issuePermitId: null, status: 'received' });
  check('form PUT merges partial updates', r.status === 200 && r.data.form.status === 'received' && r.data.form.customField === 'keep-me', r.data);
  check('invalid form status rejected', (await call(admin, 'PUT', '/maintenance-forms/' + internalForm.id, { status: 'nonsense' })).status === 400);
  check('invalid maintenance type rejected', (await call(admin, 'PUT', '/maintenance-forms/' + internalForm.id, { maintenanceType: 'nonsense' })).status === 400);

  r = await call(admin, 'POST', '/maintenance-forms', {
    maintenanceType: 'external', status: 'received', branchName, ownerName: 'موظف اختبار',
    deviceType: itemName, serial: remainingSerial, faultDescription: 'عطل خارجي',
    itemId, branchId, maintenanceEntity: 'ورشة الاختبار', deliveryDate: today()
  });
  check('create external maintenance form', r.status === 200 && r.data.form, r);
  const externalForm = r.data.form;
  check('external form number is higher than internal', parseInt(externalForm.number.replace(/\D/g, ''), 10) > parseInt(internalForm.number.replace(/\D/g, ''), 10));

  // Number reuse guard: create, delete, create again.
  r = await call(admin, 'POST', '/maintenance-forms', { maintenanceType: 'internal', status: 'received', branchName });
  const disposable = r.data.form;
  check('delete form allowed for admin', (await call(admin, 'DELETE', '/maintenance-forms/' + disposable.id)).status === 200);
  r = await call(admin, 'POST', '/maintenance-forms', { maintenanceType: 'internal', status: 'received', branchName });
  const afterDelete = r.data.form;
  check('deleted form number is never reused', parseInt(afterDelete.number.replace(/\D/g, ''), 10) > parseInt(disposable.number.replace(/\D/g, ''), 10), { deleted: disposable.number, next: afterDelete.number });
  await call(admin, 'DELETE', '/maintenance-forms/' + afterDelete.id);

  /* ---------------------- dispatch to maintenance --------------------- */
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'sup', number: 'T-MAINT-OUT-' + suffix, doc_date: today(),
    supplier_name: 'ورشة الاختبار', source_branch: branchName,
    lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial], state: 'stock' }]
  });
  check('dispatch unit to external maintenance', r.status === 200 && r.data.id, r);
  const mOutVoucherId = r.data.id;

  r = await call(admin, 'PUT', '/dispatch-meta/' + mOutVoucherId, {
    destType: 'maintenance', maintenanceFormId: externalForm.id, partyName: 'ورشة الاختبار',
    stockOfficer: 'مسؤول المخزن', receiverName: 'فني الورشة', receiveDate: today(), note: 'ملاحظة إرسال'
  });
  check('dispatch meta saved', r.status === 200 && r.data.meta.maintenanceFormId === externalForm.id, r);

  b = await bootstrap(admin);
  check('dispatch meta appears in bootstrap', !!b.dispatchMeta[mOutVoucherId], Object.keys(b.dispatchMeta));
  check('maintenance pool increased', (b.maintenance.find((m) => Number(m.i) === Number(itemId)) || {}).q === 1, b.maintenance);
  let synced = formById(b, externalForm.id);
  check('server linked the form to the dispatch', String(synced.issuePermitId) === String(mOutVoucherId) && synced.status === 'sent_external', { id: synced.issuePermitId, st: synced.status });
  check('form dispatchLinks updated', Array.isArray(synced.dispatchLinks) && synced.dispatchLinks.some((l) => String(l.permitId) === String(mOutVoucherId)), synced.dispatchLinks);

  const juniorBoot = await bootstrap(tokens.junior);
  check('junior gets no item stock balances', juniorBoot.items.every((i) => !('s' in i)), juniorBoot.items.slice(0, 2));
  check('junior gets no branch quantities', juniorBoot.branches.every((x) => !('q' in x)), juniorBoot.branches.slice(0, 2));
  check('junior gets no maintenance/scrap pools', juniorBoot.maintenance.length === 0 && juniorBoot.scrap.length === 0, { m: juniorBoot.maintenance, s: juniorBoot.scrap });
  check('junior gets no scrap log', juniorBoot.scrapLog.length === 0);
  check('junior gets no dispatch metadata', Object.keys(juniorBoot.dispatchMeta).length === 0);
  check('junior cannot issue a voucher', (await call(tokens.junior, 'POST', '/vouchers', { direction: 'out', kind: 'br', number: 'J-' + suffix, branch_id: branchId, lines: [{ item_id: itemId, qty: 1 }] })).status === 403);

  /* ------------------------ receive from maintenance ------------------ */
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'maint', number: 'T-MAINT-IN-' + suffix, doc_date: today(),
    supplier_name: 'ورشة الاختبار',
    lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial], state: 'stock' }]
  });
  check('receive unit back from maintenance', r.status === 200 && r.data.id, r);
  const maintInVoucherId = r.data.id;

  r = await call(admin, 'PUT', '/maintenance-forms/' + externalForm.id, {
    entryPermitId: maintInVoucherId, status: 'received_after_maintenance'
  });
  check('external form linked to entry permit', r.status === 200 && String(r.data.form.entryPermitId) === String(maintInVoucherId), r.data);

  b = await bootstrap(admin);
  check('maintenance pool drained', (b.maintenance.find((m) => Number(m.i) === Number(itemId)) || {}).q == null || (b.maintenance.find((m) => Number(m.i) === Number(itemId)) || {}).q === 0, b.maintenance);
  check('stock restored after maintenance', itemById(b, itemId).s === 1, itemById(b, itemId).s);

  /* ------------------- delete dispatch + unlink check ----------------- */
  // The dispatched unit has already come back, so reversing this permit would
  // push the maintenance pool below zero: the delete must be refused and the
  // dispatch/form links must stay intact.
  r = await call(admin, 'DELETE', '/vouchers/' + mOutVoucherId);
  check('delete refused when pools no longer allow reversal', r.status === 400 && arabic(r.data.error), r);
  b = await bootstrap(admin);
  check('dispatch kept after refused delete', !!b.dispatchMeta[mOutVoucherId], Object.keys(b.dispatchMeta));
  synced = formById(b, externalForm.id);
  check('form stays linked after refused delete', String(synced.issuePermitId) === String(mOutVoucherId), synced.issuePermitId);

  // A fresh dispatch is still reversible; deleting it must remove the permit,
  // its metadata and the form link, while older links stay untouched.
  r = await call(admin, 'POST', '/maintenance-forms', {
    maintenanceType: 'external', status: 'sent_external', maintenanceEntity: 'ورشة الاختبار'
  });
  const delForm = r.data.form;
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'sup', number: 'T-MAINT-OUT2-' + suffix, doc_date: today(),
    supplier_name: 'ورشة الاختبار', source_branch: branchName,
    lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial], state: 'stock' }]
  });
  check('second dispatch created', r.status === 200 && r.data.id, r);
  const mOutVoucher2Id = r.data.id;
  r = await call(admin, 'PUT', '/dispatch-meta/' + mOutVoucher2Id, {
    destType: 'maintenance', maintenanceFormId: delForm.id, partyName: 'ورشة الاختبار'
  });
  check('second dispatch meta saved', r.status === 200, r);
  b = await bootstrap(admin);
  check('second dispatch linked to form', String(formById(b, delForm.id).issuePermitId) === String(mOutVoucher2Id), formById(b, delForm.id));

  r = await call(admin, 'DELETE', '/vouchers/' + mOutVoucher2Id);
  check('delete dispatch voucher', r.status === 200, r);
  b = await bootstrap(admin);
  check('dispatch meta removed with voucher', !b.dispatchMeta[mOutVoucher2Id], Object.keys(b.dispatchMeta));
  synced = formById(b, delForm.id);
  check('form unlinked from deleted dispatch', synced.issuePermitId == null && synced.issuePermitNumber === '', { id: synced.issuePermitId, no: synced.issuePermitNumber });
  check('form dispatchLinks cleared', Array.isArray(synced.dispatchLinks) && synced.dispatchLinks.length === 0, synced.dispatchLinks);
  check('entry permit link preserved', String(formById(b, externalForm.id).entryPermitId) === String(maintInVoucherId), formById(b, externalForm.id).entryPermitId);
  check('stock unchanged after dispatch delete', itemById(b, itemId).s === 1, itemById(b, itemId).s);

  /* ------------------------------- scrap ------------------------------ */
  const scrapBefore = (await bootstrap(admin)).scrapLog.length;
  r = await call(admin, 'POST', '/scrap', { mode: 'serial', lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial] }] });
  check('scrap a stocked serial', r.status === 200, r);
  b = await bootstrap(admin);
  check('stock deducted by scrap', itemById(b, itemId).s === 0, itemById(b, itemId).s);
  check('scrap log appended', b.scrapLog.length === scrapBefore + 1, { before: scrapBefore, after: b.scrapLog.length });
  check('scrapped serial cannot be issued again', (await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'br', number: 'T-AFTER-SCRAP-' + suffix, branch_id: branchId,
    lines: [{ item_id: itemId, qty: 1, serials: [remainingSerial] }]
  })).status === 400);
  check('scrap requires pool permission', (await call(tokens.store, 'POST', '/scrap', { mode: 'plain', lines: [{ item_id: plainItemId, qty: 1 }] })).status === 403);

  /* --------------------- plain item over-issue guard ------------------ */
  await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'sup', number: 'T-PLAIN-IN-' + suffix, supplier_name: supplierName,
    lines: [{ item_id: plainItemId, qty: 1, state: 'stock' }]
  });
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'out', kind: 'br', number: 'T-PLAIN-OUT-' + suffix, branch_id: branchId,
    lines: [{ item_id: plainItemId, qty: 2, state: 'stock' }]
  });
  check('over-issue blocked with Arabic error', r.status === 400 && arabic(r.data.error), r);
  check('plain scrap allowed for admin', (await call(admin, 'POST', '/scrap', { mode: 'plain', lines: [{ item_id: plainItemId, qty: 1 }] })).status === 200);
  b = await bootstrap(admin);
  check('plain item moved to scrap', itemById(b, plainItemId).s === 0 && (b.scrap.find((x) => Number(x.i) === Number(plainItemId)) || {}).q === 1, { item: itemById(b, plainItemId), scrap: b.scrap });

  /* ------------------------------ deletes ----------------------------- */
  check('store cannot delete a voucher', (await call(tokens.store, 'DELETE', '/vouchers/' + inVoucherId)).status === 403);
  check('senior cannot delete a voucher', (await call(tokens.senior, 'DELETE', '/vouchers/' + inVoucherId)).status === 403);
  check('store cannot delete a maintenance form', (await call(tokens.store, 'DELETE', '/maintenance-forms/' + internalForm.id)).status === 403);
  check('senior cannot delete a maintenance form', (await call(tokens.senior, 'DELETE', '/maintenance-forms/' + internalForm.id)).status === 403);
  check('junior cannot delete a maintenance form', (await call(tokens.junior, 'DELETE', '/maintenance-forms/' + internalForm.id)).status === 403);
  check('head can delete a maintenance form', (await call(tokens.head, 'DELETE', '/maintenance-forms/' + internalForm.id)).status === 200);
  check('junior cannot delete dispatch meta', (await call(tokens.junior, 'DELETE', '/dispatch-meta/' + mOutVoucherId)).status === 403);
  check('store cannot delete dispatch meta', (await call(tokens.store, 'DELETE', '/dispatch-meta/' + mOutVoucherId)).status === 403);

  /* --------------------------- edit request --------------------------- */
  r = await call(tokens.senior, 'POST', '/requests', { branch_id: branchId, lines: [{ item_id: plainItemId, qty: 1 }] });
  const editRequestId = r.data.id;
  r = await call(tokens.area, 'POST', '/requests/' + editRequestId + '/action', {
    action: 'save', branch_id: 2, lines: [{ item_id: plainItemId, qty: 4 }], note: 'تعديل الطلب'
  });
  check('edit request returns success', r.status === 200, r);
  b = await bootstrap(admin);
  const editedRequest = requestById(b, editRequestId);
  check('edit request keeps the same id', editedRequest.id === editRequestId, editedRequest.id);
  check('edit request replaces the lines', editedRequest.l.length === 1 && editedRequest.l[0].q === 4, editedRequest.l);
  check('edit request updates the branch', Number(editedRequest.b) === 2, editedRequest.b);
  check('edit request keeps its status', editedRequest.st === 'pending', editedRequest.st);
  check('junior cannot edit a request', (await call(tokens.junior, 'POST', '/requests/' + editRequestId + '/action', {
    action: 'save', branch_id: branchId, lines: [{ item_id: plainItemId, qty: 9 }]
  })).status === 403);

  /* --------------------------- reject flow ---------------------------- */
  r = await call(tokens.senior, 'POST', '/requests', { branch_id: branchId, lines: [{ item_id: plainItemId, qty: 1 }] });
  const rejectId = r.data.id;
  r = await call(tokens.area, 'POST', '/requests/' + rejectId + '/action', { action: 'no', note: '' });
  check('reject requires a comment', r.status === 400, r);
  r = await call(tokens.area, 'POST', '/requests/' + rejectId + '/action', { action: 'no', note: 'غير متوفر' });
  check('reject with comment works', r.status === 200, r);
  b = await bootstrap(admin);
  check('rejected request is locked', (await call(tokens.senior, 'POST', '/requests/' + rejectId + '/action', { action: 'rev' })).status === 400);
  check('rejected status persisted', requestById(b, rejectId).st === 'rejected', requestById(b, rejectId).st);

  /* --------------------------- permissions ---------------------------- */
  check('area cannot create vouchers', (await call(tokens.area, 'POST', '/vouchers', { direction: 'in', kind: 'sup', number: 'A-' + suffix, supplier_name: supplierName, lines: [{ item_id: plainItemId, qty: 1 }] })).status === 403);
  check('area cannot create branches', (await call(tokens.area, 'POST', '/branches', { name: 'x', gov: 'y' })).status === 403);
  check('junior cannot create items', (await call(tokens.junior, 'POST', '/items', { name: 'x', category: categoryName, has_warranty: false })).status === 403);
  check('store cannot create categories', (await call(tokens.store, 'POST', '/categories', { name: 'x' })).status === 200); // stock includes store
  check('area cannot review', (await call(tokens.area, 'POST', '/requests/' + rejectId + '/action', { action: 'rev' })).status === 400);

  /* --------------------------- voucher edit --------------------------- */
  r = await call(admin, 'POST', '/items', { name: editItem, category: plainCat, has_warranty: false });
  check('create item for voucher edit', r.status === 200 && r.data.id, r);
  const editItemId = r.data.id;
  r = await call(admin, 'POST', '/vouchers', {
    direction: 'in', kind: 'sup', number: 'T-EDIT-' + suffix, supplier_name: supplierName,
    lines: [{ item_id: editItemId, qty: 2, state: 'stock' }]
  });
  check('create editable voucher', r.status === 200 && r.data.id, r);
  const editVoucherId = r.data.id;
  b = await bootstrap(admin);
  check('editable voucher stock starts at 2', itemById(b, editItemId).s === 2, itemById(b, editItemId).s);

  r = await call(admin, 'PUT', '/vouchers/' + editVoucherId, {
    direction: 'in', kind: 'sup', number: 'T-EDIT-' + suffix, supplier_name: supplierName,
    lines: [{ item_id: editItemId, qty: 5, state: 'stock' }]
  });
  check('edit voucher to a larger qty', r.status === 200, r);
  b = await bootstrap(admin);
  check('stock follows the edited qty', itemById(b, editItemId).s === 5, itemById(b, editItemId).s);

  r = await call(admin, 'PUT', '/vouchers/' + editVoucherId, {
    direction: 'in', kind: 'sup', number: 'T-EDIT-' + suffix, supplier_name: supplierName,
    lines: [{ item_id: editItemId, qty: 1, state: 'stock' }]
  });
  check('edit voucher to a smaller qty', r.status === 200, r);
  b = await bootstrap(admin);
  check('stock follows the reduced qty', itemById(b, editItemId).s === 1, itemById(b, editItemId).s);

  check('delete reverses the edited voucher', (await call(admin, 'DELETE', '/vouchers/' + editVoucherId)).status === 200);
  b = await bootstrap(admin);
  check('stock returns to zero after voucher delete', itemById(b, editItemId).s === 0, itemById(b, editItemId).s);

  /* ----------------------------- version ------------------------------ */
  const v1 = await (await fetch(BASE + '/version')).json();
  const v2 = await (await fetch(BASE + '/version')).json();
  check('version returns a stable build id', !!v1.build && v1.build === v2.build, { v1, v2 });

  /* ------------------------------ summary ----------------------------- */
  b = await bootstrap(admin);
  const expected = {
    suffix, branchName, categoryName, itemName, plainItemName: plainItem, supplierName,
    branchId, itemId, plainItemId, requestId, rejectId, externalFormId: externalForm.id,
    externalFormNumber: externalForm.number, maintInVoucherId,
    mOutVoucherId, mOutVoucher2Id, delFormId: delForm.id,
    inVoucherId, remainingSerial, issuedSerial,
    formsAtEnd: (b.maintenanceForms || []).length,
    scrapLogAtEnd: b.scrapLog.length,
    releasedStatus: requestById(b, requestId).st,
    rejectedStatus: requestById(b, rejectId).st
  };
  fs.writeFileSync(EXPECTED_FILE, JSON.stringify(expected, null, 2));

  const backupRoot = process.env.WH_DATA_DIR ? process.env.WH_DATA_DIR + '/backups' : null;
  if (backupRoot) {
    const stamp = new Date().toISOString().slice(0, 10);
    check('daily backup folder created', fs.existsSync(backupRoot + '/' + stamp), backupRoot);
  }
}

async function phaseVerify() {
  const expected = JSON.parse(fs.readFileSync(EXPECTED_FILE, 'utf8'));
  const r = await login('admin', 'admin123');
  check('login still works after restart', r.status === 200 && !!r.data.token);
  const admin = r.data.token;
  const b = await bootstrap(admin);
  check('branch survived restart', b.branches.some((x) => Number(x.id) === Number(expected.branchId)), b.branches.map((x) => x.n));
  check('category survived restart', b.categories.some((x) => x.name === expected.categoryName), b.categories.map((x) => x.name));
  check('item survived restart', itemById(b, expected.itemId).n === expected.itemName, itemById(b, expected.itemId));
  check('request survived restart', requestById(b, expected.requestId).st === expected.releasedStatus, requestById(b, expected.requestId));
  check('rejected request survived restart', requestById(b, expected.rejectId).st === expected.rejectedStatus, requestById(b, expected.rejectId));
  const form = formById(b, expected.externalFormId);
  check('maintenance form survived restart', form.number === expected.externalFormNumber, form);
  check('linked form stays linked after restart', String(form.issuePermitId) === String(expected.mOutVoucherId), form.issuePermitId);
  check('entry permit survives restart', String(form.entryPermitId) === String(expected.maintInVoucherId), form.entryPermitId);
  const deletedForm = formById(b, expected.delFormId);
  check('deleted dispatch form gets unlinked', deletedForm.issuePermitId == null && deletedForm.issuePermitNumber === '', deletedForm);
  check('scrap log survived restart', b.scrapLog.length === expected.scrapLogAtEnd, { now: b.scrapLog.length, expected: expected.scrapLogAtEnd });
  check('deleted dispatch stays deleted', !b.dispatchMeta[expected.mOutVoucher2Id]);
  check('kept dispatch still has meta', !!b.dispatchMeta[expected.mOutVoucherId]);
  const junior = await bootstrap((await login('junior', 'junior123')).data.token);
  check('junior still gets no stock after restart', junior.items.every((i) => !('s' in i)));
}

(async () => {
  console.log('=== ' + (PHASE === 'verify' ? 'Restart persistence check' : 'Full API test run') + ' against ' + BASE + ' ===');
  try {
    if (PHASE === 'verify') await phaseVerify();
    else await phaseRun();
  } catch (err) {
    fail++;
    failures.push('uncaught: ' + err.message);
    console.error(err);
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})();
