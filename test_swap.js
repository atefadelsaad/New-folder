const assert = require('assert');
const { voucherDeltas, applyDeltas, planChange } = require('./server/src/stock');

const emptyState = (stock, branch) => ({
  stock: new Map(Object.entries(stock).map(([k, v]) => [Number(k), v])),
  branch: new Map(
    Object.entries(branch || {}).map(([bid, m]) => [
      Number(bid),
      new Map(Object.entries(m).map(([k, v]) => [Number(k), v]))
    ])
  )
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

// 5. Only lines in good standing ('stock') enter warehouse stock; items
//    received as under-maintenance or scrap are recorded but do not.
const asMaint = applyDeltas(
  emptyState({ 2: 0 }, {}),
  planChange(null, { direction: 'in', kind: 'maint', lines: [{ itemId: 2, qty: 1, state: 'maint' }] })
);
assert.strictEqual(asMaint.ok, true);
assert.strictEqual(asMaint.stock.get(2), 0);

const asScrap = applyDeltas(
  emptyState({ 2: 0 }, {}),
  planChange(null, { direction: 'in', kind: 'sup', lines: [{ itemId: 2, qty: 1, state: 'scrap' }] })
);
assert.strictEqual(asScrap.stock.get(2), 0);

const repaired = applyDeltas(
  emptyState({ 2: 0 }, {}),
  planChange(null, { direction: 'in', kind: 'maint', lines: [{ itemId: 2, qty: 1, state: 'stock' }] })
);
assert.strictEqual(repaired.stock.get(2), 1);

// 6. Editing an existing voucher reverses the old effect before applying the new one.
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

// 7. Delta shape helpers.
assert.deepStrictEqual(
  voucherDeltas({ direction: 'out', kind: 'br', branch_id: 3, lines: [{ itemId: 6, qty: 1 }] }),
  [{ itemId: 6, stock: -1, branchId: 3, branch: 1 }]
);

console.log('Stock engine tests passed (8 scenarios)');
