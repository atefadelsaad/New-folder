'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-requests-'));
process.env.WH_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'requests-test-secret';

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
  const receive = async (token, name, qty) => {
    const item = await request('/items', 'POST', {
      name,
      category: 'Requests plain',
      has_warranty: false
    }, token);
    assert.strictEqual(item.status, 200);
    const voucher = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'REQ-TEST-' + name,
      supplier_name: 'Requests supplier',
      lines: [{ item_id: item.result.id, qty }]
    }, token);
    assert.strictEqual(voucher.status, 200);
    const line = data.voucherById(voucher.result.id).lines[0];
    const reviewed = await request(`/inspections/${voucher.result.id}/${line.id}/review`, 'POST', { decision: 'good' }, token);
    assert.strictEqual(reviewed.status, 200);
    assert.strictEqual(data.itemById(item.result.id).stock, qty);
    return item.result.id;
  };

  try {
    const admin = await login('admin', 'admin123');
    const senior = await login('senior', 'senior123');
    const area = await login('area', 'area123');
    const store = await login('store', 'store123');
    const junior = await login('junior', 'junior123');

    const category = await request('/categories', 'POST', { name: 'Requests plain', has_serial: false }, admin);
    assert.strictEqual(category.status, 200);

    const itemX = await receive(admin, 'REQ-X', 10);
    const itemY = await receive(admin, 'REQ-Y', 5);
    const [branchA, branchB] = data.state.branches;

    // C3: a request under review goes back to pending when edited.
    const juniorRequest = await request('/requests', 'POST', {
      branch_id: branchA.id,
      lines: [{ item_id: itemX, qty: 1 }]
    }, junior);
    assert.strictEqual(juniorRequest.status, 200);
    assert.strictEqual(data.state.requests[0].status, 'review');
    const editedReview = await request(`/requests/${juniorRequest.result.id}/action`, 'POST', {
      action: 'save',
      branch_id: branchA.id,
      lines: [{ item_id: itemX, qty: 2 }]
    }, area);
    assert.strictEqual(editedReview.status, 200);
    assert.strictEqual(data.state.requests[0].status, 'pending', 'editing a review request resets it to pending');

    // C3: an approved request can no longer be edited.
    const created = await request('/requests', 'POST', {
      branch_id: branchA.id,
      lines: [{ item_id: itemX, qty: 2 }, { item_id: itemY, qty: 1 }]
    }, senior);
    assert.strictEqual(created.status, 200);
    const requestId = created.result.id;
    assert.strictEqual((await request(`/requests/${requestId}/action`, 'POST', { action: 'ok' }, area)).status, 200);
    assert.strictEqual(data.state.requests.find((r) => r.id === requestId).status, 'approved');

    const vouchersBefore = data.state.vouchers.length;
    const bypass = await request(`/requests/${requestId}/action`, 'POST', {
      action: 'save',
      branch_id: branchB.id,
      lines: [{ item_id: itemX, qty: 5 }]
    }, area);
    assert.strictEqual(bypass.status, 400, 'approved request must not be edited');
    const stillApproved = data.state.requests.find((r) => r.id === requestId);
    assert.strictEqual(stillApproved.status, 'approved');
    assert.strictEqual(Number(stillApproved.branch_id), Number(branchA.id));
    assert.deepStrictEqual(stillApproved.lines.map((l) => [l.item_id, l.qty]), [[itemX, 2], [itemY, 1]]);

    // C5: a voucher for another branch cannot spend the request.
    const wrongBranch = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branchB.id,
      request_id: requestId,
      number: 'REQ-TEST-WRONG-BRANCH',
      lines: [{ item_id: itemX, qty: 2 }, { item_id: itemY, qty: 1 }]
    }, store);
    assert.strictEqual(wrongBranch.status, 400, 'voucher branch must match the request');
    assert.strictEqual(data.state.requests.find((r) => r.id === requestId).status, 'approved');
    assert.strictEqual(data.state.vouchers.length, vouchersBefore);

    // C5: a voucher with a different item/quantity cannot spend the request.
    const wrongLines = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branchA.id,
      request_id: requestId,
      number: 'REQ-TEST-WRONG-LINES',
      lines: [{ item_id: itemY, qty: 1 }]
    }, store);
    assert.strictEqual(wrongLines.status, 400, 'voucher items/quantities must match the request');
    const wrongQty = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branchA.id,
      request_id: requestId,
      number: 'REQ-TEST-WRONG-QTY',
      lines: [{ item_id: itemX, qty: 5 }, { item_id: itemY, qty: 1 }]
    }, store);
    assert.strictEqual(wrongQty.status, 400, 'voucher quantity must match the request');
    assert.strictEqual(data.state.requests.find((r) => r.id === requestId).status, 'approved');
    assert.strictEqual(data.itemById(itemX).stock, 10);
    assert.strictEqual(data.branchQty(branchA.id, itemX), 0);

    // The matching voucher releases the request.
    const matching = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branchA.id,
      request_id: requestId,
      number: 'REQ-TEST-MATCHING',
      lines: [{ item_id: itemY, qty: 1 }, { item_id: itemX, qty: 2 }]
    }, store);
    assert.strictEqual(matching.status, 200, JSON.stringify(matching.result));
    const released = data.state.requests.find((r) => r.id === requestId);
    assert.strictEqual(released.status, 'released');
    assert.strictEqual(Number(released.releasedVoucherId), Number(matching.result.id));
    assert.strictEqual(data.itemById(itemX).stock, 8);
    assert.strictEqual(data.branchQty(branchA.id, itemX), 2);
    assert.strictEqual(data.itemById(itemY).stock, 4);
    assert.strictEqual(data.branchQty(branchA.id, itemY), 1);

    console.log('Request tests passed (approved requests are locked, edits reset to pending, vouchers must match)');
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
