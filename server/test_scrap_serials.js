'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-scrap-'));
process.env.WH_DATA_DIR = dataDir;
process.env.JWT_SECRET = 'scrap-serial-test-secret';

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
  const stockSerials = (itemId) => [...data.serialLedger([itemId]).entries()]
    .filter(([, value]) => value.state === 'stock').map(([, value]) => value.serial).sort();

  try {
    const admin = await login('admin', 'admin123');
    const store = await login('store', 'store123');
    const branch = data.state.branches[0];

    // B4: a serialized item cannot be scrapped "by quantity".
    const itemA = await request('/items', 'POST', {
      name: 'SCRAP-SERIAL-A',
      category: data.state.categories[0].name,
      has_warranty: false
    }, admin);
    assert.strictEqual(itemA.status, 200);
    const receiptA = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'SCRAP-TEST-A',
      supplier_name: 'Scrap supplier',
      lines: [{ item_id: itemA.result.id, qty: 3, serials: ['B2-D', 'B2-E', 'B2-F'] }]
    }, admin);
    assert.strictEqual(receiptA.status, 200);
    const lineA = data.voucherById(receiptA.result.id).lines[0];
    assert.strictEqual((await request(`/inspections/${receiptA.result.id}/${lineA.id}/review`, 'POST', { decision: 'good' }, admin)).status, 200);
    assert.strictEqual(data.itemById(itemA.result.id).stock, 3);

    const plain = await request('/scrap', 'POST', { mode: 'plain', lines: [{ item_id: itemA.result.id, qty: 1 }] }, admin);
    assert.strictEqual(plain.status, 400, 'plain scrap must be rejected for a serialized item');
    assert.strictEqual(data.itemById(itemA.result.id).stock, 3);
    assert.strictEqual(data.itemById(itemA.result.id).scrap_qty, 0);
    assert.strictEqual(data.state.scrapEntries.length, 0);

    const serialScrap = await request('/scrap', 'POST', {
      mode: 'serial',
      lines: [{ item_id: itemA.result.id, qty: 1, serials: ['B2-D'] }]
    }, admin);
    assert.strictEqual(serialScrap.status, 200, JSON.stringify(serialScrap.result));
    assert.strictEqual(data.itemById(itemA.result.id).stock, 2);
    assert.strictEqual(data.itemById(itemA.result.id).scrap_qty, 1);
    assert.strictEqual(data.state.scrapEntries[0].serials.join(','), 'B2-D');
    assert.strictEqual(data.serialLedger([itemA.result.id]).get(data.serialKey(itemA.result.id, 'B2-D')).state, 'scrap');

    const issueScrapped = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'SCRAP-TEST-ISSUE-D',
      lines: [{ item_id: itemA.result.id, qty: 1, serials: ['B2-D'] }]
    }, store);
    assert.strictEqual(issueScrapped.status, 400, 'a scrapped serial must not be issuable');
    assert.strictEqual(data.itemById(itemA.result.id).stock, 2);
    assert.strictEqual(data.branchQty(branch.id, itemA.result.id), 0);

    // B6: editing an old receipt must not resurrect serials written off by a stocktake.
    const itemB = await request('/items', 'POST', {
      name: 'SCRAP-SERIAL-B',
      category: data.state.categories[0].name,
      has_warranty: false
    }, admin);
    assert.strictEqual(itemB.status, 200);
    const receiptB = await request('/vouchers', 'POST', {
      direction: 'in',
      kind: 'sup',
      number: 'SCRAP-TEST-B',
      supplier_name: 'Scrap supplier',
      lines: [{ item_id: itemB.result.id, qty: 3, serials: ['B4-G', 'B4-H', 'B4-I'] }]
    }, admin);
    assert.strictEqual(receiptB.status, 200);
    const lineB = data.voucherById(receiptB.result.id).lines[0];
    assert.strictEqual((await request(`/inspections/${receiptB.result.id}/${lineB.id}/review`, 'POST', { decision: 'good' }, admin)).status, 200);
    assert.strictEqual(data.itemById(itemB.result.id).stock, 3);

    const stocktake = await request('/stocktakes', 'POST', {}, store);
    assert.strictEqual(stocktake.status, 200);
    const countLines = data.state.stocktakes[0].lines.map((line) => Number(line.item_id) === Number(itemB.result.id)
      ? { item_id: line.item_id, actual_qty: 2, serials: ['B4-J', 'B4-K'] }
      : { item_id: line.item_id, actual_qty: line.expected_qty, serials: line.expected_serials });
    assert.strictEqual((await request(`/stocktakes/${stocktake.result.stocktake.id}`, 'PUT', { lines: countLines }, store)).status, 200);
    assert.strictEqual((await request(`/stocktakes/${stocktake.result.stocktake.id}/approve`, 'POST', {}, admin)).status, 200);
    assert.strictEqual(data.itemById(itemB.result.id).stock, 2);
    assert.deepStrictEqual(stockSerials(itemB.result.id), ['B4-J', 'B4-K']);

    const issueWrittenOff = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'SCRAP-TEST-ISSUE-G',
      lines: [{ item_id: itemB.result.id, qty: 1, serials: ['B4-G'] }]
    }, store);
    assert.strictEqual(issueWrittenOff.status, 400);

    const voucherBefore = data.voucherById(receiptB.result.id);
    const edited = await request('/vouchers/' + receiptB.result.id, 'PUT', {
      direction: 'in',
      kind: 'sup',
      number: voucherBefore.number,
      supplier_name: 'Scrap supplier edited',
      lines: [{ item_id: itemB.result.id, qty: 3, serials: ['B4-G', 'B4-H', 'B4-I'] }]
    }, store);
    assert.strictEqual(edited.status, 200, JSON.stringify(edited.result));

    const issueAfterEdit = await request('/vouchers', 'POST', {
      direction: 'out',
      kind: 'br',
      branch_id: branch.id,
      number: 'SCRAP-TEST-ISSUE-G2',
      lines: [{ item_id: itemB.result.id, qty: 1, serials: ['B4-G'] }]
    }, store);
    assert.strictEqual(issueAfterEdit.status, 400, 'editing the receipt must not resurrect a written-off serial');
    assert.strictEqual(data.itemById(itemB.result.id).stock, 2);
    assert.strictEqual(data.branchQty(branch.id, itemB.result.id), 0);
    assert.deepStrictEqual(stockSerials(itemB.result.id), ['B4-J', 'B4-K']);

    console.log('Scrap/serial tests passed (plain scrap rejected for serials, edits do not resurrect written-off serials)');
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
