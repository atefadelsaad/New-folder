const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
// Insert doc search in vDoc return before <h2> cards
s = s.replace(
  '<h2>${icon(key)} ${S.t} (${list.length})</h2>${cards(key)}',
  '<div class="bl" style="margin-bottom:14px"><input id="s_docQ" class="search" placeholder="بحث: رقم إذن، جهة، صنف، سيريال، مستخدم، تاريخ" value="${e(SEARCH.docQ||\'\')}" oninput="debouncedSearch(\'docQ\',this.value)"><button onclick="clearSearch(\'docQ\')" aria-label="x">x</button></div><h2>${icon(key)} ${S.t} (${list.length})</h2>${cards(key)}'
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('doc search input added');
