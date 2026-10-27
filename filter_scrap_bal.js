const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
// Filter scrapPanel balances
s = s.replace(
  "const balances=items.filter(i=>SCRAP[i.id]).sort((a,b)=>String(a.c).localeCompare(String(b.c),'ar')||String(a.n).localeCompare(String(b.n),'ar'));",
  "const q=String(SEARCH.scrapQ||'').trim();const balances=items.filter(i=>SCRAP[i.id]&&(q?((String(i.c||'')+String(i.n||'')).toLowerCase().includes(q.toLowerCase())||String((SCRAPLOG.find(x=>x.i==i.id)?.by||'')).toLowerCase().includes(q.toLowerCase())):true)).sort((a,b)=>String(a.c).localeCompare(String(b.c),'ar')||String(a.n).localeCompare(String(b.n),'ar'));"
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('scrap balances filtered');
