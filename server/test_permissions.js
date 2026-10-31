'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-perms-'));
process.env.WH_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'permissions-test-secret';

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
    const result = (response.headers.get('content-type') || '').includes('application/json')
      ? await response.json() : await response.text();
    return { status: response.status, result };
  };
  const login = async (username, password) => {
    const response = await request('/auth/login', 'POST', { username, password });
    assert.strictEqual(response.status, 200, `${username} login`);
    return response.result.token;
  };

  try {
    const admin = await login('admin', 'admin123');
    const area = await login('area', 'area123');
    const store = await login('store', 'store123');
    const junior = await login('junior', 'junior123');

    // Seed one received serialized item with an inspection photo.
    const item = await request('/items', 'POST', {
      name: 'Permissions test item',
      category: data.state.categories[0].name,
      has_warranty: false
    }, admin);
    assert.strictEqual(item.status, 200);
    const receipt = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'PERM-TEST-RECEIPT',
      supplier_name: 'Permissions supplier',
      lines: [{
        item_id: item.result.id,
        qty: 1,
        serials: ['PERM-TEST-SERIAL'],
        condition: 'سليم',
        photos: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==']
      }]
    }, admin);
    assert.strictEqual(receipt.status, 200);
    const voucher = data.voucherById(receipt.result.id);
    const line = voucher.lines[0];
    const photoId = line.inspection.photos[0].id;
    assert(photoId);
    const reviewed = await request(`/inspections/${receipt.result.id}/${line.id}/review`, 'POST', { decision: 'good' }, admin);
    assert.strictEqual(reviewed.status, 200);

    // H1: maintenance forms are limited to roles with maintView (area is excluded).
    const form = await request('/maintenance-forms', 'POST', {
      maintenanceType: 'internal',
      status: 'received',
      itemId: item.result.id,
      deviceType: 'Permissions test item',
      serial: 'PERM-TEST-SERIAL',
      faultDescription: 'Permissions test fault'
    }, admin);
    assert.strictEqual(form.status, 200);
    assert.strictEqual((await request('/maintenance-forms', 'GET', null, area)).status, 403);
    assert.strictEqual((await request('/maintenance-forms', 'GET', null, store)).status, 200);

    const areaBoot = await request('/bootstrap', 'GET', null, area);
    assert.strictEqual(areaBoot.status, 200);
    assert.deepStrictEqual(areaBoot.result.maintenanceForms, [], 'area bootstrap must not contain maintenance forms');
    const storeBoot = await request('/bootstrap', 'GET', null, store);
    assert.strictEqual(storeBoot.result.maintenanceForms.length, 1, 'store bootstrap keeps maintenance forms');

    // H2: dispatch metadata is limited to roles with view (junior is excluded).
    const branch = data.state.branches[0];
    const handover = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'PERM-TEST-HANDOVER',
      lines: [{ item_id: item.result.id, qty: 1, serials: ['PERM-TEST-SERIAL'] }],
      handover: {
        giverName: 'Employee A',
        giverSignature: 'Employee A signature',
        receiverName: 'Employee B',
        receiverSignature: 'Employee B signature',
        receiveDate: '2026-10-30'
      }
    }, admin);
    assert.strictEqual(handover.status, 200);
    assert.strictEqual((await request('/dispatch-meta', 'GET', null, junior)).status, 403);
    assert.strictEqual((await request('/dispatch-meta', 'GET', null, area)).status, 200);
    const juniorBoot = await request('/bootstrap', 'GET', null, junior);
    assert.strictEqual(juniorBoot.status, 200);
    assert.deepStrictEqual(juniorBoot.result.dispatchMeta, {}, 'junior bootstrap must not contain dispatch meta');

    // H3: inspection photos are limited to roles with view.
    assert.strictEqual((await request('/inspection-photos/' + photoId, 'GET', null, junior)).status, 403);
    assert.strictEqual((await request('/inspection-photos/' + photoId, 'GET', null, store)).status, 200);
    const juniorPhotoIds = (juniorBoot.result.vouchers.in || []).concat(juniorBoot.result.vouchers.out || [])
      .flatMap((entry) => (entry.lines || []).flatMap((row) => ((row.insp || {}).photos || []).map((photo) => photo.id)));
    assert.deepStrictEqual(juniorPhotoIds, [], 'junior bootstrap must not expose photo ids');
    const storePhotoIds = (storeBoot.result.vouchers.in || []).concat(storeBoot.result.vouchers.out || [])
      .flatMap((entry) => (entry.lines || []).flatMap((row) => ((row.insp || {}).photos || []).map((photo) => photo.id)));
    assert(storePhotoIds.includes(photoId), 'authorized roles keep the photo id');

    console.log('Permission tests passed (maintenance forms, dispatch meta, inspection photos)');
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
