const fs = require('fs');
const path = require('path');

const dryRun = !process.argv.includes('--apply');

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return []; }
}

function saveJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function main() {
  const branches = loadJSON('data/branches.json');
  const vouchers = loadJSON('data/vouchers.json');
  const requests = loadJSON('data/requests.json');
  const scrap = loadJSON('data/scrap.json');

  // Group by normalized name+gov
  const groups = {};
  for (const b of branches) {
    const key = norm(b.n) + '|' + norm(b.g || '');
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }

  const changes = [];
  for (const [key, list] of Object.entries(groups)) {
    if (list.length <= 1) continue;
    list.sort((a, b) => a.id - b.id);
    const keep = list[0];
    const remove = list.slice(1);
    const removedIds = remove.map(r => r.id);

    let refs = { vouchers: 0, requests: 0, scrap: 0, items: 0 };
    for (const r of vouchers) {
      if (removedIds.includes(r.b) || removedIds.includes(r.sb)) refs.vouchers++;
    }
    for (const r of requests) { if (removedIds.includes(r.b)) refs.requests++; }
    for (const r of scrap) { if (removedIds.includes(r.b)) refs.scrap++; }
    // branch items count approximate
    const branchItems = loadJSON('data/branch_items.json');
    for (const i of branchItems || []) { if (removedIds.includes(i.b)) refs.items += i.q; }

    changes.push({ group: key, keepId: keep.id, removedIds, refs, itemsMerged: 0 });
  }

  console.log('=== DRY RUN ===');
  console.table(changes.map(c => ({ group: c.group.substring(0, 40), keep: c.keepId, removed: c.removedIds.join(','), vouchers: c.refs.vouchers, requests: c.refs.requests, scrap: c.refs.scrap })));

  if (dryRun) {
    console.log('No changes written (--apply to apply).');
    return;
  }

  // Apply
  for (const c of changes) {
    const keep = branches.find(b => b.id === c.keepId);
    // Merge branch items into keep (sum qty per item)
    const branchItems = loadJSON('data/branch_items.json');
    const items = loadJSON('data/items.json');
    // Re-point vouchers/requests/scrap references
    for (const v of vouchers) {
      if (c.removedIds.includes(v.b)) v.b = c.keepId;
      if (c.removedIds.includes(v.sb)) v.sb = c.keepId;
    }
    for (const r of requests) { if (c.removedIds.includes(r.b)) r.b = c.keepId; }
    for (const s of scrap) { if (c.removedIds.includes(s.b)) s.b = c.keepId; }
    // Remove duplicate branches
    const newBranches = branches.filter(b => !c.removedIds.includes(b.id));
    saveJSON('data/branches.json', newBranches);
    saveJSON('data/vouchers.json', vouchers);
    saveJSON('data/requests.json', requests);
    saveJSON('data/scrap.json', scrap);
  }
  console.log('Applied.');
}

main();
