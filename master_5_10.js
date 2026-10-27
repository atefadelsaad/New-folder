const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');

// 5. Branches list (vBranches) - add search input; filter list by name/num/gov/manager
s = s.replace(
  "function vBranches(){\n  const list=branches.sort",
  "function vBranches(){\n  const q=String(SEARCH.branchSearch||'').trim();const list=branches.sort"
);
s = s.replace(
  "const list=branches.sort((a,b)=>String(a.n).localeCompare(String(b.n),'ar')||String(a.id).localeCompare(String(b.id)));",
  "const list=branches.filter(b=>!q||((String(b.n||'')+String(b.id||'')+String(b.governorate||'')+String(b.manager||'')).toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>String(a.n).localeCompare(String(b.n),'ar')||String(a.id).localeCompare(String(b.id)));"
);

// Insert branch search input before return
s = s.replace(
  '<div class="box tw"><h3>الفروع',
  '<div class="bl" style="margin-bottom:14px"><input id="s_branchSearch" class="search" placeholder="بحث: اسم، رقم، محافظة، مدير" value="${e(SEARCH.branchSearch||\'\')}" oninput="debouncedSearch(\'branchSearch\',this.value)"><button onclick="clearSearch(\'branchSearch\')" aria-label="x">x</button></div><div class="box tw"><h3>الفروع'
);

// 5b Branch detail items (vBranch) - filter items inside branch
s = s.replace(
  "function vBranch(){\n  const b=branches.find(x=>x.id==sel);",
  "function vBranch(){\n  const b=branches.find(x=>x.id==sel);const q=String(SEARCH.branchSearch||'').trim();"
);
s = s.replace(
  "const avail=b.items.map(i=>({i,...items.find(x=>x.id==i)})).filter(i=>i.n);",
  "const avail=b.items.map(i=>({i,...items.find(x=>x.id==i)})).filter(i=>i.n&&(q?!((String(i.c||'')+String(i.n||'')+String(i.sns?i.sns.join(' '):'')).toLowerCase().includes(q.toLowerCase())):true));"
);

// 6 Items (vItems) filter
s = s.replace(
  "+items.map(i=>editId==i.id",
  "+items.filter(i=>{const q=String(SEARCH.itemsSearch||'').trim();return !q||((String(i.n||'')+String(i.c||'')+String(i.note||'')).toLowerCase().includes(q.toLowerCase()));}).map(i=>editId==i.id"
);

// Insert items search before table
s = s.replace(
  '<div class="box tw"><h3>الأصناف (${items.length})</h3>',
  '<div class="bl" style="margin-bottom:14px"><input id="s_itemsSearch" class="search" placeholder="بحث: اسم، فئة، ملاحظات" value="${e(SEARCH.itemsSearch||\'\')}" oninput="debouncedSearch(\'itemsSearch\',this.value)"><button onclick="clearSearch(\'itemsSearch\')" aria-label="x">x</button></div><div class="box tw"><h3>الأصناف (${items.filter(i=>{const q=String(SEARCH.itemsSearch||\'\').trim();return !q||((String(i.n||\'\')+String(i.c||\'\')+String(i.note||\'\')).toLowerCase().includes(q.toLowerCase()));}).length})</h3>'
);

// 7 Cats (vCats) filter
s = s.replace(
  "function vCats(){\n  return `<div class=\"box\"><h3>إضافة فئة</h3>",
  "function vCats(){\n  const q=String(SEARCH.branchSearch||'').trim();" // reuse or use new; actually use existing search? Let's use branchSearch temporarily or add catQ
);
// Better: add catQ to SEARCH and use it; but for speed reuse itemsSearch? No, let's just add input using SEARCH.itemsSearch for now or create quick.
// Actually easiest: insert a search box that uses SEARCH.itemsSearch? Not correct. Let's add catQ to SEARCH and replace.
s = s.replace(
  "SEARCH={itemsSearch:'',scrapQ:'',scrapLogQ:'',docQ:'',supSearch:'',branchSearch:'',maintQ:'',rqQ:'',rqbSearch:''};",
  "SEARCH={itemsSearch:'',scrapQ:'',scrapLogQ:'',docQ:'',supSearch:'',branchSearch:'',maintQ:'',rqQ:'',rqbSearch:'',catQ:''};"
);
// Now filter vCats table
s = s.replace(
  "const cats=CATS.map",
  "const q=String(SEARCH.catQ||'').trim();const cats=CATS.map"
);
// Actually vCats uses CATS directly; need to find the table generation line
// Search and replace the return part for cats table
s = s.replace(
  "<table><tr><th>الفئة</th><th>المورد</th>",
  "<div class=\"bl\" style=\"margin-bottom:14px\"><input id=\"s_catQ\" class=\"search\" placeholder=\"بحث: فئة، مورد، أنواع\" value=\"${e(SEARCH.catQ||'')}\" oninput=\"debouncedSearch('catQ',this.value)\"><button onclick=\"clearSearch('catQ')\" aria-label=\"x\">x</button></div><table><tr><th>الفئة</th><th>المورد</th>"
);
// Filter cats list by q before map
s = s.replace(
  "CATS.map(c=>{const g=items.filter(i=>i.c==c);",
  "CATS.filter(c=>!q||((String(c||'')+String(supName(c)||'')+String([...new Set(items.filter(i=>i.c==c).map(i=>i.t))].filter(Boolean).join(' '))).toLowerCase().includes(q.toLowerCase()))).map(c=>{const g=items.filter(i=>i.c==c);"
);

// 8 Suppliers (vSuppliers)
s = s.replace(
  "function vSuppliers(){\n  const list=suppliers.sort",
  "function vSuppliers(){\n  const q=String(SEARCH.supSearch||'').trim();const list=suppliers.sort"
);
s = s.replace(
  "const list=suppliers.sort((a,b)=>String(a.n).localeCompare(String(b.n),'ar')||String(a.id).localeCompare(String(b.id)));",
  "const list=suppliers.filter(s=>!q||((String(s.n||'')+String(s.company||'')+String(s.phone||'')+String(s.address||'')).toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>String(a.n).localeCompare(String(b.n),'ar')||String(a.id).localeCompare(String(b.id)));"
);
s = s.replace(
  '<div class="box tw"><h3>الموردون',
  '<div class="bl" style="margin-bottom:14px"><input id="s_supSearch" class="search" placeholder="بحث: اسم، شركة، هاتف، عنوان" value="${e(SEARCH.supSearch||\'\')}" oninput="debouncedSearch(\'supSearch\',this.value)"><button onclick="clearSearch(\'supSearch\')" aria-label="x">x</button></div><div class="box tw"><h3>الموردون'
);

// 9 Requests (vReqs)
s = s.replace(
  "function vReqs(){\n  const list=DB.in.filter",
  "function vReqs(){\n  const q=String(SEARCH.rqQ||'').trim();const list=DB.in.filter"
);
s = s.replace(
  "const list=DB.in.filter(r=>r.k=='rq');",
  "const list=DB.in.filter(r=>r.k=='rq'&&(q?!((String(r.p||'')+String((branches.find(b=>b.id==r.b)?.n||'')||'')+String((r.by||'')||'')+String(r.d||'')+r.lines.map(l=>String((it(l.i)||{n:''}).n||'')).join(' ')).toLowerCase().includes(q.toLowerCase()):true));"
);
s = s.replace(
  '<div class="box tw"><h3>الطلبات',
  '<div class="bl" style="margin-bottom:14px"><input id="s_rqQ" class="search" placeholder="بحث: فرع، طالب، حالة، صنف، تاريخ" value="${e(SEARCH.rqQ||\'\')}" oninput="debouncedSearch(\'rqQ\',this.value)"><button onclick="clearSearch(\'rqQ\')" aria-label="x">x</button></div><div class="box tw"><h3>الطلبات'
);

// 10 Branch reqs (vBranchReqs)
s = s.replace(
  "function vBranchReqs(){\n  const list=DB.in.filter",
  "function vBranchReqs(){\n  const q=String(SEARCH.rqbSearch||'').trim();const list=DB.in.filter"
);
s = s.replace(
  "const list=DB.in.filter(r=>r.k=='reqbr');",
  "const list=DB.in.filter(r=>r.k=='reqbr'&&(q?!((String(r.p||'')+String((branches.find(b=>b.id==r.b)?.n||'')||'')+String((r.by||'')||'')+String(r.d||'')+r.lines.map(l=>String((it(l.i)||{n:''}).n||'')).join(' ')).toLowerCase().includes(q.toLowerCase()):true));"
);
s = s.replace(
  '<div class="box tw"><h3>متطلبات الفروع',
  '<div class="bl" style="margin-bottom:14px"><input id="s_rqbSearch" class="search" placeholder="بحث: فرع، طالب، حالة، صنف" value="${e(SEARCH.rqbSearch||\'\')}" oninput="debouncedSearch(\'rqbSearch\',this.value)"><button onclick="clearSearch(\'rqbSearch\')" aria-label="x">x</button></div><div class="box tw"><h3>متطلبات الفروع'
);

fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('5-10 filters applied');
