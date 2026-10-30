'use strict';

// Pure stock math shared by the API and the tests.
// Three warehouse pools exist per item:
//   stock   - goods in good standing, available to issue/transfer
//   maint   - "under maintenance" pool, filled only by receipts, drained
//             only by receiving an item back from maintenance (`kind = maint`)
//   scrap   - "scrap" pool, terminal: it only ever grows
//   inspection - received units held until an authorized inspection decision
// A receipt may also move qty into a branch (kind `br`). Reversing an existing
// voucher is expressed with mult = -1.

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
  const branchId = voucher.branch_id != null
    ? voucher.branch_id
    : voucher.b != null
      ? voucher.b
      : voucher.branchId;
  const out = [];

  for (const line of voucher.lines || []) {
    const qty = lineQty(line);
    if (!qty) continue;
    const delta = { itemId: lineItemId(line), stock: 0, maint: 0, scrap: 0, inspection: 0, branchId: null, branch: 0 };

    if (direction === 'in') {
      if (kind === 'maint') {
        // Receive back from maintenance: every line drains the pool; repaired
        // lines return to stock, damaged lines move to scrap.
        const state = lineState(line);
        delta.maint = -qty;
        if (state === 'inspection') delta.inspection = qty;
        else if (state === 'scrap') delta.scrap = qty;
        else delta.stock = qty;
      } else if (kind === 'br') {
        // Receive back from a branch: the branch balance drops either way, and
        // the qty lands in stock (good) or scrap (damaged).
        const state = lineState(line);
        if (state === 'inspection') delta.inspection = qty;
        else if (state === 'scrap') delta.scrap = qty;
        else delta.stock = qty;
        delta.branchId = Number(branchId);
        delta.branch = -qty;
      } else {
        // From a supplier: line state decides the pool.
        const state = lineState(line);
        if (state === 'inspection') delta.inspection = qty;
        else if (state === 'maint') delta.maint = qty;
        else if (state === 'scrap') delta.scrap = qty;
        else delta.stock = qty;
      }
    } else {
      delta.stock = -qty;
      if (kind === 'br') {
        delta.branchId = Number(branchId);
        delta.branch = qty;
      } else if (kind === 'sup') {
        // Disbursing to a supplier sends the item for maintenance: the qty
        // leaves stock and enters the `تحت الصيانة` pool.
        delta.maint = qty;
      }
    }

    out.push(delta);
  }
  return out;
}

// Apply a list of deltas (each with optional mult, default 1) to a state
// snapshot. All deltas are summed first and only the final result is
// validated, so a reversal that dips below zero temporarily is allowed as
// long as the outcome is valid.
function applyDeltas(current, deltas) {
  const stockDelta = new Map();
  const maintDelta = new Map();
  const scrapDelta = new Map();
  const inspectionDelta = new Map();
  const branchDelta = new Map();

  const add = (map, key, value) => {
    if (value) map.set(key, (map.get(key) || 0) + value);
  };

  for (const d of deltas) {
    const mult = d.mult == null ? 1 : d.mult;
    add(stockDelta, d.itemId, d.stock * mult);
    add(maintDelta, d.itemId, d.maint * mult);
    add(scrapDelta, d.itemId, d.scrap * mult);
    add(inspectionDelta, d.itemId, (d.inspection || 0) * mult);
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

  const check = (source, delta, label, copy) => {
    const map = copy ? new Map(source) : source;
    for (const [itemId, value] of delta) {
      const next = (map.get(itemId) || 0) + value;
      if (next < 0) return { ok: false, error: label, itemId };
      map.set(itemId, next);
    }
    return { ok: true, map };
  };

  const stock = check(current.stock, stockDelta, 'stock', true);
  if (!stock.ok) return stock;
  const maint = check(current.maint, maintDelta, 'maint', true);
  if (!maint.ok) return maint;
  const scrap = check(current.scrap, scrapDelta, 'scrap', true);
  if (!scrap.ok) return scrap;
  const inspection = check(current.inspection || new Map(), inspectionDelta, 'inspection', true);
  if (!inspection.ok) return inspection;

  const branch = new Map();
  for (const [bid, map] of current.branch) branch.set(bid, new Map(map));
  for (const entry of branchDelta.values()) {
    let map = branch.get(entry.branchId);
    if (!map) { map = new Map(); branch.set(entry.branchId, map); }
    const next = (map.get(entry.itemId) || 0) + entry.value;
    if (next < 0) return { ok: false, error: 'branch', branchId: entry.branchId, itemId: entry.itemId };
    map.set(entry.itemId, next);
  }

  return { ok: true, stock: stock.map, maint: maint.map, scrap: scrap.map, inspection: inspection.map, branch };
}

// Build the combined delta list for replacing `oldVoucher` with `newVoucher`.
function planChange(oldVoucher, newVoucher) {
  const deltas = [];
  if (oldVoucher) for (const d of voucherDeltas(oldVoucher)) deltas.push({ ...d, mult: -1 });
  if (newVoucher) for (const d of voucherDeltas(newVoucher)) deltas.push({ ...d, mult: 1 });
  return deltas;
}

// Scrapping always drains the warehouse balance: the qty leaves `stock` and
// enters the terminal `scrap` pool. Each line: { item_id, qty, serials }.
function scrapDeltas(lines) {
  const out = [];
  for (const line of lines || []) {
    const qty = lineQty(line);
    if (!qty) continue;
    out.push({ itemId: lineItemId(line), stock: -qty, maint: 0, scrap: qty, inspection: 0, branchId: null, branch: 0 });
  }
  return out;
}

module.exports = { voucherDeltas, scrapDeltas, applyDeltas, planChange, lineState };
