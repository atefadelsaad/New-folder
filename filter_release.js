const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
s = s.replace(
  "function vMaintRelease(){\n  const rows=maintOutRows();",
  "function vMaintRelease(){\n  const q=String(SEARCH.maintQ||'').trim();const rows=maintOutRows().filter(({r,l})=>{if(!q)return true;const txt=String((it(l.i)||{n:'',c:''}).n||'')+String((it(l.i)||{c:''}).c||'')+String(l.sns?l.sns.join(' '):'')+String(r.sup||'')+String(r.p||'');return txt.toLowerCase().includes(q.toLowerCase());});"
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('release filtered');
