const fs = require('fs');
let lines = fs.readFileSync('it-warehouse_1.html', 'utf8').split(/\r?\n/);
const insert = '    <div class="bl" style="margin-bottom:14px"><input id="s_maintQ" class="search" placeholder="بحث: صنف، فئة، سيريال، جهة، رقم إذن" value="${e(SEARCH.maintQ)}" oninput="debouncedSearch(\'maintQ\',this.value)"><button onclick="clearSearch(\'maintQ\')" aria-label="x">x</button></div>';
lines.splice(439, 0, insert);
fs.writeFileSync('it-warehouse_1.html', lines.join('\n'), 'utf8');
console.log('inserted');
