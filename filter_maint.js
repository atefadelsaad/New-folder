const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
s = s.replace(
  "const rows=maintItems().map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${MAINT[i.id]}</td><td>${warrantyBadge(i.id)}</td></tr>`).join('');",
  "const q=String(SEARCH.maintQ||'').trim();const rows=maintItems().filter(i=>{if(!q)return true;const o=String(i.n||'')+String(i.c||'')+String((it(i.id)||{}).n||'')+String((it(i.id)||{}).c||'');return o.toLowerCase().includes(q.toLowerCase());}).map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${MAINT[i.id]}</td><td>${warrantyBadge(i.id)}</td></tr>`).join('');"
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('filtered');
