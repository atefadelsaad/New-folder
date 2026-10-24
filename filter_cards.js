const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
s = s.replace(
  "function cards(key){\n  const S=DS[key],K=S.dir,list=DB[K].filter(r=>r.k==S.kind);",
  "function cards(key){\n  const S=DS[key],K=S.dir,q=String(SEARCH.docQ||'').trim();const list=DB[K].filter(r=>r.k==S.kind&&(q?((String(r.p||'')+String(partyName(r)||'')+String(r.d||'')+String(r.by||'')+r.lines.map(l=>String((it(l.i)||{n:''}).n||'')+String(l.sns?l.sns.join(' '):'')).join(' ')).toLowerCase().includes(q.toLowerCase()):true));"
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('cards filtered');
