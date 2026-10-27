const fs = require('fs');
let s = fs.readFileSync('it-warehouse_1.html', 'utf8');
// Insert search for scrap view inside vScrap return
s = s.replace(
  '<div class="hero">',
  '<div class="bl" style="margin-bottom:14px"><input id="s_scrapQ" class="search" placeholder="بحث: صنف، فئة، سيريال، مسجل" value="${e(SEARCH.scrapQ||\'\')}" oninput="debouncedSearch(\'scrapQ\',this.value)"><button onclick="clearSearch(\'scrapQ\')" aria-label="x">x</button></div><div class="hero">'
);
fs.writeFileSync('it-warehouse_1.html', s, 'utf8');
console.log('scrap input added');
