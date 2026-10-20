const assert = require('assert');
const { voucherDeltas, scrapDeltas, applyDeltas, planChange } = require('./server/src/stock');

const numMap = (obj) => new Map(Object.entries(obj || {}).map(([k, v]) => [Number(k), v]));
const emptyState = (stock, branch, maint, scrap) => ({
  stock: numMap(stock),
  maint: numMap(maint),
  scrap: numMap(scrap),
  branch: new Map(Object.entries(branch || {}).map(([bid, m]) => [Number(bid), numMap(m)]))
});

// 1. Creating a disbursement larger than the warehouse balance is blocked.
const oversize = applyDeltas(
  emptyState({ 4: 4 }, { 1: {} }),
  planChange(null, { direction: 'out', kind: 'sup', lines: [{ itemId: 4, qty: 5 }] })
);
assert.deepStrictEqual(
  { ok: oversize.ok, error: oversize.error, itemId: oversize.itemId },
  { ok: false, error: 'stock', itemId: 4 }
);

// 2. Exactly the available quantity is allowed and drains stock.
const exact = applyDeltas(
  emptyState({ 4: 4 }, { 1: {} }),
  planChange(null, { direction: 'out', kind: 'sup', lines: [{ itemId: 4, qty: 4 }] })
);
assert.strictEqual(exact.ok, true);
assert.strictEqual(exact.stock.get(4), 0);

// 2b. Disbursing to a supplier sends the item to the maintenance pool.
const sendMaint = applyDeltas(
  emptyState({ 3: 5 }, {}),
  planChange(null, { direction: 'out', kind: 'sup', lines: [{ itemId: 3, qty: 2 }] })
);
assert.strictEqual(sendMaint.ok, true);
assert.strictEqual(sendMaint.stock.get(3), 3);
assert.strictEqual(sendMaint.maint.get(3), 2);

// 3. A branch transfer moves stock off the warehouse and onto the branch.
const transfer = applyDeltas(
  emptyState({ 5: 3 }, { 2: { 5: 1 } }),
  planChange(null, { direction: 'out', kind: 'br', branch_id: 2, lines: [{ itemId: 5, qty: 2 }] })
);
assert.strictEqual(transfer.ok, true);
assert.strictEqual(transfer.stock.get(5), 1);
assert.strictEqual(transfer.branch.get(2).get(5), 3);

// 4. Branch balance can never go negative (receipt larger than the branch holds).
const badBranch = applyDeltas(
  emptyState({ 1: 10 }, { 1: { 1: 1 } }),
  planChange(null, { direction: 'in', kind: 'br', branch_id: 1, lines: [{ itemId: 1, qty: 5 }] })
);
assert.deepStrictEqual(
  { ok: badBranch.ok, error: badBranch.error, branchId: badBranch.branchId },
  { ok: false, error: 'branch', branchId: 1 }
);

// 5. Supplier receipt line states feed the pools; only 'stock' enters the warehouse.
const intoMaint = applyDeltas(
  emptyState({ 2: 0 }, {}),
  planChange(null, { direction: 'in', kind: 'sup', lines: [{ itemId: 2, qty: 1, state: 'maint' }] })
);
assert.strictEqual(intoMaint.ok, true);
assert.strictEqual(intoMaint.stock.get(2), 0);
assert.strictEqual(intoMaint.maint.get(2), 1);

const intoScrap = applyDeltas(
  emptyState({ 2: 0 }, {}),
  planChange(null, { direction: 'in', kind: 'sup', lines: [{ itemId: 2, qty: 1, state: 'scrap' }] })
);
assert.strictEqual(intoScrap.stock.get(2), 0);
assert.strictEqual(intoScrap.scrap.get(2), 1);

// 6. A `maint` receipt drains the maintenance pool back into stock.
const repaired = applyDeltas(
  emptyState({ 2: 0 }, {}, { 2: 2 }),
  planChange(null, { direction: 'in', kind: 'maint', lines: [{ itemId: 2, qty: 1, state: 'stock' }] })
);
assert.strictEqual(repaired.ok, true);
assert.strictEqual(repaired.stock.get(2), 1);
assert.strictEqual(repaired.maint.get(2), 1);

// A damaged line returned from maintenance drains the pool into scrap.
const damaged = applyDeltas(
  emptyState({ 2: 0 }, {}, { 2: 2 }),
  planChange(null, { direction: 'in', kind: 'maint', lines: [{ itemId: 2, qty: 1, state: 'scrap' }] })
);
assert.strictEqual(damaged.ok, true);
assert.strictEqual(damaged.stock.get(2), 0);
assert.strictEqual(damaged.scrap.get(2), 1);
assert.strictEqual(damaged.maint.get(2), 1);

// Returning more than the pool holds is blocked.
const badReturn = applyDeltas(
  emptyState({ 2: 0 }, {}, { 2: 1 }),
  planChange(null, { direction: 'in', kind: 'maint', lines: [{ itemId: 2, qty: 2, state: 'stock' }] })
);
assert.deepStrictEqual(
  { ok: badReturn.ok, error: badReturn.error, itemId: badReturn.itemId },
  { ok: false, error: 'maint', itemId: 2 }
);

// 7. Editing an existing voucher reverses the old effect before applying the new one.
const edit = applyDeltas(
  emptyState({ 1: 5 }, {}),
  planChange(
    { direction: 'out', kind: 'sup', lines: [{ itemId: 1, qty: 2 }] },
    { direction: 'out', kind: 'sup', lines: [{ itemId: 1, qty: 7 }] }
  )
);
assert.strictEqual(edit.ok, true);
assert.strictEqual(edit.stock.get(1), 0);

const editBlocked = applyDeltas(
  emptyState({ 1: 5 }, {}),
  planChange(
    { direction: 'out', kind: 'sup', lines: [{ itemId: 1, qty: 2 }] },
    { direction: 'out', kind: 'sup', lines: [{ itemId: 1, qty: 8 }] }
  )
);
assert.strictEqual(editBlocked.ok, false);

// 8. Delta shape helpers.
assert.deepStrictEqual(
  voucherDeltas({ direction: 'out', kind: 'br', branch_id: 3, lines: [{ itemId: 6, qty: 1 }] }),
  [{ itemId: 6, stock: -1, maint: 0, scrap: 0, branchId: 3, branch: 1 }]
);

// 9. Scrapping deducts from the warehouse balance and feeds the terminal pool.
const scrapped = applyDeltas(
  emptyState({ 7: 3 }, {}),
  scrapDeltas([{ itemId: 7, qty: 2, serials: ['SN-1', 'SN-2'] }])
);
assert.strictEqual(scrapped.ok, true);
assert.strictEqual(scrapped.stock.get(7), 1);
assert.strictEqual(scrapped.scrap.get(7), 2);

// Scrapping more than the warehouse holds is blocked.
const badScrap = applyDeltas(
  emptyState({ 7: 1 }, {}),
  scrapDeltas([{ itemId: 7, qty: 2 }])
);
assert.deepStrictEqual(
  { ok: badScrap.ok, error: badScrap.error, itemId: badScrap.itemId },
  { ok: false, error: 'stock', itemId: 7 }
);

console.log('Stock engine tests passed (17 scenarios)');
