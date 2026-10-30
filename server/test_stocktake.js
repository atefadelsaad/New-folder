'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-stocktake-'));
process.env.WH_DATA_DIR = dataDir;

try {
  const data = require('./src/data');
  const serialItemId = 1;
  const plainItemId = 2;

  assert.throws(() => data.createStocktake('Store Keeper'), (error) => error.status === 400);

  data.tx((state) => {
    state.categories.push({ id: 100, name: 'Serial devices', has_serial: true });
    state.categories.push({ id: 101, name: 'Supplies', has_serial: false });
    state.items.push({ id: serialItemId, name: 'Laptop', category_id: 100, stock: 2 });
    state.items.push({ id: plainItemId, name: 'Cable', category_id: 101, stock: 5 });
    state.vouchers.push({
      id: 1,
      direction: 'in',
      kind: 'sup',
      created_at: '2026-01-01T00:00:00.000Z',
      lines: [{ id: 1, item_id: serialItemId, qty: 2, state: 'stock', serials: ['SN-1', 'SN-2'] }]
    });
  });

  const session = data.createStocktake('Store Keeper');
  assert.strictEqual(session.status, 'counting');
  assert.strictEqual(session.lines.find((line) => line.item_id === plainItemId).expected_qty, 5);
  assert.deepStrictEqual(session.lines.find((line) => line.item_id === serialItemId).expected_serials, ['SN-1', 'SN-2']);

  data.updateStocktake(session.id, [
    { item_id: serialItemId, actual_qty: 1, serials: ['SN-2'] },
    { item_id: plainItemId, actual_qty: 3, serials: [] }
  ], 'Store Keeper');
  data.approveStocktake(session.id, 'IT Manager');
  assert.strictEqual(data.itemById(serialItemId).stock, 1);
  assert.strictEqual(data.itemById(plainItemId).stock, 3);
  assert.deepStrictEqual([...data.serialLedger([serialItemId]).values()].filter((row) => row.state === 'stock').map((row) => row.serial), ['SN-2']);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'warehouse.json'), 'utf8')).stocktakes[0].status, 'approved');

  const stale = data.createStocktake('Store Keeper');
  data.tx((state) => { state.items.find((item) => item.id === plainItemId).stock += 1; });
  assert.throws(() => data.approveStocktake(stale.id, 'IT Manager'), (error) => error.status === 400 || error.status === 409);

  const duplicate = data.createStocktake('Store Keeper');
  assert.throws(() => data.updateStocktake(duplicate.id, [
    { item_id: serialItemId, actual_qty: 2, serials: ['DUP', 'dup'] }
  ], 'Store Keeper'), (error) => error.status === 400);

  console.log('Stocktake tests passed (snapshot, count, approval, stale balance, serial tracking)');
} finally {
  delete process.env.WH_DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
}