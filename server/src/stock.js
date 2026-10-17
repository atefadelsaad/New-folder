'use strict';

// Pure stock math shared by the API and the tests.
// A voucher line may move stock on the warehouse and (for branch transfers)
// on a branch. Reversing an existing voucher is expressed with mult = -1.

function lineQty(line) {
  const q = Number(line.qty != null ? line.qty : line.q);
  return q > 0 ? q : 0;
}

function lineItemId(line) {
  const id = line.itemId != null ? line.itemId : line.item_id != null ? line.item_id : line.i;
  return Number(id);
}

// Final disposition of a received line: 'stock' | 'maint' | 'scrap'.
function lineState(line) {
  const raw = line.state != null
    ? line.state
    : line.item_condition != null
      ? line.item_condition
      : line.condition != null
        ? line.condition
        : line.cd;
  return String(raw == null ? 'stock' : raw) || 'stock';
}

// Deltas produced by a single voucher (mult is attached by the caller).
function voucherDeltas(voucher) {
  const direction = voucher.direction || voucher.dir;
  const kind = voucher.kind || voucher.k;
  const sign = direction === 'in' ? 1 : -1;
  const branchId = voucher.branch_id != null ? voucher.branch_id : voucher.b;
  const out = [];

  for (const line of voucher.lines || []) {
    const qty = lineQty(line);
    if (!qty) continue;
    // Only goods in good standing add to warehouse stock. Lines received
    // as under-maintenance or scrap are recorded but tracked separately.
    const state = direction === 'in' ? lineState(line) : 'stock';
    if (state !== 'stock') continue;

    const delta = { itemId: lineItemId(line), stock: sign * qty, branchId: null, branch: 0 };
    if (kind === 'br') {
      delta.branchId = Number(branchId);
      delta.branch = -sign * qty;
    }
    out.push(delta);
  }
  return out;
}

// Apply a list of deltas (each with optional mult, default 1) to a state
// snapshot. Matches the original client behaviour: all deltas are summed
// first and only the final result is validated, so a reversal that dips
// below zero temporarily is allowed as long as the outcome is valid.
function applyDeltas(current, deltas) {
  const stockDelta = new Map();
  const branchDelta = new Map();

  for (const d of deltas) {
    const mult = d.mult == null ? 1 : d.mult;
    stockDelta.set(d.itemId, (stockDelta.get(d.itemId) || 0) + d.stock * mult);
    if (d.branchId != null) {
      const key = d.branchId + ':' + d.itemId;
      const prev = branchDelta.get(key);
      branchDelta.set(key, {
        branchId: d.branchId,
        itemId: d.itemId,
        value: (prev ? prev.value : 0) + d.branch * mult
      });
    }
  }

  const stock = new Map(current.stock);
  for (const [itemId, delta] of stockDelta) {
    const next = (stock.get(itemId) || 0) + delta;
    if (next < 0) return { ok: false, error: 'stock', itemId };
    stock.set(itemId, next);
  }

  const branch = new Map();
  for (const [bid, map] of current.branch) branch.set(bid, new Map(map));
  for (const entry of branchDelta.values()) {
    let map = branch.get(entry.branchId);
    if (!map) { map = new Map(); branch.set(entry.branchId, map); }
    const next = (map.get(entry.itemId) || 0) + entry.value;
    if (next < 0) return { ok: false, error: 'branch', branchId: entry.branchId, itemId: entry.itemId };
    map.set(entry.itemId, next);
  }

  return { ok: true, stock, branch };
}

// Build the combined delta list for replacing `oldVoucher` with `newVoucher`.
function planChange(oldVoucher, newVoucher) {
  const deltas = [];
  if (oldVoucher) for (const d of voucherDeltas(oldVoucher)) deltas.push({ ...d, mult: -1 });
  if (newVoucher) for (const d of voucherDeltas(newVoucher)) deltas.push({ ...d, mult: 1 });
  return deltas;
}

module.exports = { voucherDeltas, applyDeltas, planChange };
