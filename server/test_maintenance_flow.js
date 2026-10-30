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
    const result = await response.json();
    return { status: response.status, result };
  };

  try {
    const login = await request('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    assert.strictEqual(login.status, 200);
    const token = login.result.token;
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
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-SERIAL'] }]
    }, token);
    assert.strictEqual(receipt.status, 200);

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
    assert.strictEqual(data.state.forms[0].status, 'received_after_maintenance');
    assert.strictEqual(data.state.forms[0].inspectionResult3, 'تم إصلاحه');
    assert.strictEqual(data.itemById(item.result.id).stock, 1);
    assert.strictEqual(data.itemById(item.result.id).maint_qty, 0);

    const legacyReceipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'MF-TEST-LEGACY-RECEIPT',
      supplier_name: 'Test supplier',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['MF-TEST-LEGACY-SERIAL'] }]
    }, token);
    assert.strictEqual(legacyReceipt.status, 200);
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
    assert.strictEqual(data.state.forms[1].issuePermitId, legacyIssue.result.id);
    assert.strictEqual(data.state.forms[1].entryPermitId, legacyAcknowledgement.result.id);
    assert.strictEqual(data.state.dispatchMeta[legacyIssue.result.id].maintenanceFormId, legacyFormId);
    console.log('Maintenance flow tests passed (select existing form, issue permit, acknowledge return)');
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
