const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
s = s.replace(
  "function scrapLogTable(){\n  if(!SCRAPLOG.length)return '<div class=\"empty\">لا توجد حركات خردة مسجلة بعد. ابدأ بإضافة صنف تالف من الأزرار أعلاه.</div>';\n  const rows=SCRAPLOG.map",
  "function scrapLogTable(){\n  if(!SCRAPLOG.length)return '<div class=\"empty\">لا توجد حركات خردة مسجلة بعد. ابدأ بإضافة صنف تالف من الأزرار أعلاه.</div>';\n  const q=String(SEARCH.scrapQ||'').trim();\n  const rows=SCRAPLOG.filter(r=>{if(!q)return true;const x=it(r.i)||{};const txt=String(x.c||'')+String(x.n||'')+String(r.sns?r.sns.join(' '):'')+String(r.by||'');return txt.toLowerCase().includes(q.toLowerCase());}).map"
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('scrap log filtered');
