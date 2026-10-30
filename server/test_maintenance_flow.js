'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-maint-flow-'));
process.env.WH_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'maintenance-flow-test-secret';

const data = require('./src/data');
const store = require('./src/filestore');
const router = require('./src/routes');
const app = express();
app.use(express.json());
app.use('/api', router);
const server = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (url, method, body, token) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const result = (response.headers.get('content-type') || '').includes('application/json')
      ? await response.json() : await response.text();
    return { status: response.status, result };
  };

  try {
    const login = await request('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    assert.strictEqual(login.status, 200);
    const token = login.result.token;
    const approveInspection = async (voucherId, decision = 'good') => {
      const voucher = data.voucherById(voucherId);
      const line = voucher.lines.find((entry) => entry.state === 'inspection');
      assert(line, 'receipt line should be held for inspection');
      return request(`/inspections/${voucherId}/${line.id}/review`, 'POST', { decision }, token);
    };
    const item = await request('/items', 'POST', {
      name: 'Maintenance flow test item',
      category: data.state.categories[0].name,
      has_warranty: false
    }, token);
    assert.strictEqual(item.status, 200);

    const receipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'MF-TEST-RECEIPT',
      supplier_name: 'Test supplier',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-SERIAL'], condition: 'سليم', inspection_notes: 'وصل بحالة جيدة', photos: ['data:image/jpeg;base64,SGVsbG8='] }]
    }, token);
    assert.strictEqual(receipt.status, 200);
    assert.strictEqual(data.itemById(item.result.id).stock, 0);
    assert.strictEqual(data.itemById(item.result.id).inspection_qty, 1);
    const receiptLine = data.voucherById(receipt.result.id).lines[0];
    assert.strictEqual(receiptLine.inspection.status, 'pending');
    assert.strictEqual(receiptLine.inspection.notes, 'وصل بحالة جيدة');
    assert.strictEqual(receiptLine.inspection.photos.length, 1);
    const photoBackup = store.backupNow('2026-10-30T00:00:00.000Z');
    assert(fs.existsSync(path.join(photoBackup, 'inspection_photos', receiptLine.inspection.photos[0].id)));
    const juniorLogin = await request('/auth/login', 'POST', { username: 'junior', password: 'junior123' });
    const deniedReview = await request(`/inspections/${receipt.result.id}/${receiptLine.id}/review`, 'POST', { decision: 'good' }, juniorLogin.result.token);
    assert.strictEqual(deniedReview.status, 403);
    const photo = await request('/inspection-photos/' + receiptLine.inspection.photos[0].id, 'GET', null, token);
    assert.strictEqual(photo.status, 200);
    const approvedReceipt = await approveInspection(receipt.result.id);
    assert.strictEqual(approvedReceipt.status, 200);
    assert.strictEqual(data.itemById(item.result.id).stock, 1);
    assert.strictEqual(data.itemById(item.result.id).inspection_qty, 0);

    const branch = data.state.branches[0];
    const branchIssue = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'MF-TEST-BRANCH-ISSUE',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-SERIAL'] }]
    }, token);
    assert.strictEqual(branchIssue.status, 200);
    const branchReceipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'br',
      branch_id: branch.id,
      number: 'MF-TEST-BRANCH-RECEIPT',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-SERIAL'], condition: 'سليم' }]
    }, token);
    assert.strictEqual(branchReceipt.status, 200);
    assert.strictEqual(data.branchQty(branch.id, item.result.id), 0);
    assert.strictEqual(data.itemById(item.result.id).inspection_qty, 1);
    assert.strictEqual((await approveInspection(branchReceipt.result.id)).status, 200);
    assert.strictEqual(data.itemById(item.result.id).stock, 1);

    const damagedReceipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'MF-TEST-DAMAGED-RECEIPT',
      supplier_name: 'Test supplier',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-DAMAGED-SERIAL'], condition: 'تالف' }]
    }, token);
    assert.strictEqual(damagedReceipt.status, 200);
    assert.strictEqual((await approveInspection(damagedReceipt.result.id, 'damaged')).status, 200);
    assert.strictEqual(data.itemById(item.result.id).stock, 1);
    assert.strictEqual(data.itemById(item.result.id).scrap_qty, 1);
    assert.strictEqual(data.serialLedger([item.result.id], null).get(data.serialKey(item.result.id, 'MF-TEST-DAMAGED-SERIAL')).state, 'scrap');

    const formResponse = await request('/maintenance-forms', 'POST', {
      maintenanceType: 'external',
      status: 'received',
      itemId: item.result.id,
      deviceType: 'Maintenance flow test item',
      serial: 'MF-TEST-SERIAL',
      faultDescription: 'Test fault'
    }, token);
    assert.strictEqual(formResponse.status, 200);
    const formId = formResponse.result.form.id;

    const missingForm = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'sup',
      number: 'MF-TEST-MISSING',
      supplier_name: 'Repair supplier',
      maintenance_flow: true,
      source_branch: 'Test branch',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-SERIAL'] }]
    }, token);
    assert.strictEqual(missingForm.status, 400);
    assert.strictEqual(data.state.forms.length, 1);
    assert.strictEqual(data.itemById(item.result.id).stock, 1);

    const issue = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'sup',
      number: 'MF-TEST-ISSUE',
      supplier_name: 'Repair supplier',
      source_branch: 'Test branch',
      maintenance_flow: true,
      maintenance_form_id: formId,
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-SERIAL'], reason: 'Test fault' }]
    }, token);
    assert.strictEqual(issue.status, 200);
    assert.strictEqual(data.state.forms.length, 1);
    assert.strictEqual(data.state.forms[0].issuePermitId, issue.result.id);
    assert.strictEqual(data.state.forms[0].status, 'sent_external');
    assert.strictEqual(data.state.forms[0].issuePermitNumber, 'MF-TEST-ISSUE');
    assert.strictEqual(data.state.forms[0].maintenanceEntity, 'Repair supplier');
    assert.strictEqual(data.state.dispatchMeta[issue.result.id].maintenanceFormId, formId);
    assert.strictEqual(data.itemById(item.result.id).maint_qty, 1);

    const acknowledgement = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'maint',
      number: 'MF-TEST-ACK',
      supplier_name: 'Repair supplier',
      lines: [{
        item_id: item.result.id,
        qty: 1,
        serials: ['MF-TEST-SERIAL'],
        state: 'stock',
        maintenance_form_id: formId
      }]
    }, token);
    assert.strictEqual(acknowledgement.status, 200);
    assert.strictEqual(data.state.forms[0].entryPermitId, acknowledgement.result.id);
    assert.strictEqual(data.state.forms[0].receiptVoucherId, acknowledgement.result.id);
    assert.strictEqual(data.state.forms[0].status, 'awaiting_inspection');
    assert.strictEqual(data.state.forms[0].inspectionResult3, 'قيد الفحص');
    assert.strictEqual(data.itemById(item.result.id).stock, 0);
    assert.strictEqual(data.itemById(item.result.id).maint_qty, 0);
    assert.strictEqual((await approveInspection(acknowledgement.result.id)).status, 200);
    assert.strictEqual(data.state.forms[0].status, 'received_after_maintenance');
    assert.strictEqual(data.state.forms[0].inspectionResult3, 'تم إصلاحه');
    assert.strictEqual(data.itemById(item.result.id).stock, 1);

    const legacyReceipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'MF-TEST-LEGACY-RECEIPT',
      supplier_name: 'Test supplier',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-LEGACY-SERIAL'] }]
    }, token);
    assert.strictEqual(legacyReceipt.status, 200);
    assert.strictEqual((await approveInspection(legacyReceipt.result.id)).status, 200);
    const legacyFormResponse = await request('/maintenance-forms', 'POST', {
      maintenanceType: 'internal',
      status: 'received',
      itemId: item.result.id,
      deviceType: 'Maintenance flow test item',
      serial: 'MF-TEST-LEGACY-SERIAL'
    }, token);
    assert.strictEqual(legacyFormResponse.status, 200);
    const legacyFormId = legacyFormResponse.result.form.id;
    const legacyIssue = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'sup',
      number: 'MF-TEST-LEGACY-ISSUE',
      supplier_name: 'Repair supplier',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-LEGACY-SERIAL'] }]
    }, token);
    assert.strictEqual(legacyIssue.status, 200);

    const legacyAcknowledgement = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'maint',
      number: 'MF-TEST-LEGACY-ACK',
      supplier_name: 'Repair supplier',
      lines: [{
        item_id: item.result.id,
        qty: 1,
        serials: ['MF-TEST-LEGACY-SERIAL'],
        state: 'stock',
        maintenance_form_id: legacyFormId,
        source_voucher_id: legacyIssue.result.id
      }]
    }, token);
    assert.strictEqual(legacyAcknowledgement.status, 200);
    assert.strictEqual((await approveInspection(legacyAcknowledgement.result.id)).status, 200);
    assert.strictEqual(data.state.forms[1].issuePermitId, legacyIssue.result.id);
    assert.strictEqual(data.state.forms[1].entryPermitId, legacyAcknowledgement.result.id);
    assert.strictEqual(data.state.dispatchMeta[legacyIssue.result.id].maintenanceFormId, legacyFormId);

    const handoverReceipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'MF-TEST-HANDOVER-RECEIPT',
      supplier_name: 'Test supplier',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-HANDOVER-SERIAL'] }]
    }, token);
    assert.strictEqual(handoverReceipt.status, 200);
    assert.strictEqual((await approveInspection(handoverReceipt.result.id)).status, 200);

    const missingHandoverSignature = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'MF-TEST-HANDOVER-MISSING',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-HANDOVER-SERIAL'] }],
      handover: {
        giverName: 'Employee A',
        receiverName: 'Employee B',
        receiverSignature: 'Employee B signature',
        receiveDate: '2026-10-30'
      }
    }, token);
    assert.strictEqual(missingHandoverSignature.status, 400);
    assert.strictEqual(data.itemById(item.result.id).stock, 3);

    const handover = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'MF-TEST-HANDOVER',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-HANDOVER-SERIAL'] }],
      handover: {
        giverName: 'Employee A',
        giverSignature: 'Employee A signature',
        receiverName: 'Employee B',
        receiverSignature: 'Employee B signature',
        receiveDate: '2026-10-30'
      }
    }, token);
    assert.strictEqual(handover.status, 200);
    const handoverMeta = data.state.dispatchMeta[handover.result.id];
    assert.strictEqual(handoverMeta.giverName, 'Employee A');
    assert.strictEqual(handoverMeta.giverSignature, 'Employee A signature');
    assert.strictEqual(handoverMeta.receiverName, 'Employee B');
    assert.strictEqual(handoverMeta.receiverSignature, 'Employee B signature');
    assert.strictEqual(handoverMeta.receiveDate, '2026-10-30');
    assert.strictEqual(data.itemById(item.result.id).stock, 2);

    const editedHandover = await request('/vouchers/' + handover.result.id, 'PUT', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'MF-TEST-HANDOVER',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-HANDOVER-SERIAL'] }],
      handover: {
        giverName: 'Employee C',
        giverSignature: 'Employee C signature',
        receiverName: 'Employee B',
        receiverSignature: 'Employee B signature',
        receiveDate: '2026-10-30'
      }
    }, token);
    assert.strictEqual(editedHandover.status, 200);
    assert.strictEqual(data.state.dispatchMeta[handover.result.id].giverName, 'Employee C');
    console.log('Maintenance flow tests passed (maintenance forms, supplier return, and branch handover)');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      delete process.env.WH_DATA_DIR;
      delete process.env.JWT_SECRET;
      fs.rmSync(dataDir, { recursive: true, force: true });
    });
  }
});
